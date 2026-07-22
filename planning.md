# Planning: buku-generator

Bot & Web App untuk menulis buku pelajaran sekolah (teks, tabel, chart, diagram, gambar) menggunakan AI, dengan output DOCX + PDF.

---

## 1. Ringkasan

| Aspek | Keputusan |
|---|---|
| Akses | Telegram bot (khusus, terpisah dari bot lain) + Web app |
| Target pengguna | Single admin/guru (tanpa multi-role) |
| Jenis konten | Buku pelajaran sekolah: teks, tabel, chart data, diagram konsep, gambar |
| Ukuran buku | ~5 bab / ~100 halaman per buku |
| AI teks | OpenRouter / DeepSeek |
| AI gambar | Gemini 3 Pro Image (Nano Banana Pro) — via provider abstraction |
| Gambar manual | Guru bisa upload saat generate bab ATAU setelah buku jadi |
| Chart | Data JSON dari AI → render PNG server-side |
| Diagram | Mermaid syntax dari AI → render SVG/PNG server-side |
| Output | DOCX + PDF |
| Deploy | Docker + Nginx Proxy Manager di `aanNet`, subdomain `buku.aantriono.com` |

---

## 2. Tech Stack

- **Backend**: Express + TypeScript
- **Frontend**: Vue 3 + Vite
- **Bot**: Telegraf (Node.js/TypeScript), project & sesi terpisah dari bot RPP/asesmen
- **Database**: SQLite (better-sqlite3)
- **AI Teks**: multi-provider, admin pilih provider + model per aksi generate (lihat §6a)
- **AI Gambar**: Gemini 3 Pro Image API (abstraksi provider agar mudah ganti/fallback)
- **Chart render**: `chartjs-node-canvas` → output PNG
- **Diagram render**: `@mermaid-js/mermaid-cli` (headless, dijalankan via child_process) → output SVG/PNG
- **DOCX generation**: `docx` (npm)
- **PDF generation**: convert dari DOCX via LibreOffice headless (`soffice --headless --convert-to pdf`) dalam container
- **Auth**: single admin, session-based (cookie + password hash), tanpa role granular
- **Realtime progress**: SSE (Server-Sent Events), pola sama dengan `rpp-generator`/`asesmen`
- **Deploy**: Docker Compose, network eksternal `aanNet`, expose lewat Nginx Proxy Manager, subdomain `buku.aantriono.com`
- **Lint**: ESLint + Prettier, disetup sejak Stage 1 di semua package (`backend/`, `frontend/`, `bot/`)
- **Unit test**: Vitest, wajib untuk setiap service/fungsi dengan logika non-trivial, ditulis di stage yang sama dengan fiturnya (bukan ditunda). Dependency eksternal (Gemini, OpenRouter, LibreOffice, mermaid-cli) di-mock, bukan dipanggil langsung saat test
- **CI/CD**: GitHub Actions build & push image ke GHCR (GitHub Container Registry) tiap push ke `main`; deployment di VPS pakai Arcane (Docker management UI) dengan fitur auto-update image, bukan build lokal

---

## 10. CI/CD & Container Registry (GHCR)

Berbeda dari project Anda sebelumnya (build lokal di VPS via `docker-compose build`), `buku-generator` di-deploy lewat **Arcane** dengan fitur **auto-update image**, yang mengharuskan image sudah tersedia di registry (Arcane hanya pull & restart, tidak build dari source).

### Alur
```
git push ke main
  → GitHub Actions: build image backend/frontend/bot
  → push ke ghcr.io/aantriono82/buku-generator-{service}:latest
  → Arcane di VPS mendeteksi image baru → pull & restart otomatis
```

### Struktur Image
- `ghcr.io/aantriono82/buku-generator-backend:latest`
- `ghcr.io/aantriono82/buku-generator-frontend:latest`
- `ghcr.io/aantriono82/buku-generator-bot:latest`

### Workflow GitHub Actions (`.github/workflows/docker-publish.yml`)
- Trigger: `push` ke branch `main`
- Auth ke GHCR pakai `GITHUB_TOKEN` bawaan (permission `packages: write` di workflow)
- Build & push 3 image (matrix strategy per service) memakai `docker/build-push-action`
- Tag: `latest` + tag versi (misal short SHA commit) untuk kemungkinan rollback manual

### Perubahan di `docker-compose.yml` (Stage 8)
- Ganti `build: ./backend` dkk. menjadi `image: ghcr.io/aantriono82/buku-generator-backend:latest`
- Build tidak lagi terjadi di VPS

### Setup Sekali di VPS
- Karena repo & package kemungkinan **private**, VPS perlu autentikasi ke GHCR:
  ```bash
  docker login ghcr.io -u aantriono82 -p <PAT dengan scope read:packages>
  ```
- Arcane menggunakan kredensial Docker yang sama untuk pull image otomatis — pastikan Arcane jalan dengan akses ke `~/.docker/config.json` VPS, atau setel kredensial registry langsung di pengaturan Arcane (tergantung versi Arcane yang dipakai, cek dokumentasi Arcane saat setup)

### Catatan
- Ini keputusan khusus `buku-generator`, **tidak mengubah** pola deploy project lain (rpp-generator, asesmen, dakwah-app) yang tetap build lokal
- Personal Access Token untuk GHCR harus disimpan aman (bukan di repo), idealnya sebagai secret terpisah, dan dicatat di `MEMORY.md` bahwa token ini exist (tanpa menyimpan nilainya di dokumen)

---

## 3. Skema Database (SQLite)

```sql
-- Admin tunggal
CREATE TABLE admin (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,           -- untuk link akun bot <-> web
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Buku
CREATE TABLE buku (
  id INTEGER PRIMARY KEY,
  judul TEXT NOT NULL,
  mapel TEXT NOT NULL,
  jenjang TEXT NOT NULL,           -- SD/SMP/SMA + kelas
  kurikulum TEXT,                  -- Kurikulum Merdeka, dsb
  status TEXT DEFAULT 'draft',     -- draft | outline_ready | generating | selesai
  channel_created TEXT,            -- telegram | web
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Bab
CREATE TABLE bab (
  id INTEGER PRIMARY KEY,
  buku_id INTEGER NOT NULL REFERENCES buku(id) ON DELETE CASCADE,
  urutan INTEGER NOT NULL,
  judul TEXT NOT NULL,
  ringkasan TEXT,                  -- deskripsi singkat dari outline
  status TEXT DEFAULT 'belum',     -- belum | generating | selesai | error
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Blok konten di dalam bab (urutan tampil = urutan render di dokumen)
CREATE TABLE konten_blok (
  id INTEGER PRIMARY KEY,
  bab_id INTEGER NOT NULL REFERENCES bab(id) ON DELETE CASCADE,
  urutan INTEGER NOT NULL,
  tipe TEXT NOT NULL,              -- teks | tabel | chart | diagram | gambar
  data_json TEXT NOT NULL,         -- lihat struktur di bawah
  file_path TEXT,                  -- untuk chart/diagram/gambar yang sudah dirender
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Job export (DOCX/PDF)
CREATE TABLE export_job (
  id INTEGER PRIMARY KEY,
  buku_id INTEGER NOT NULL REFERENCES buku(id) ON DELETE CASCADE,
  format TEXT NOT NULL,            -- docx | pdf
  status TEXT DEFAULT 'pending',   -- pending | processing | selesai | error
  file_path TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Struktur `data_json` per tipe:**

```jsonc
// tipe: teks
{ "markdown": "..." }

// tipe: tabel
{ "headers": ["Kolom A", "Kolom B"], "rows": [["...", "..."], ["...", "..."]] }

// tipe: chart
{
  "chart_type": "bar",             // bar | line | pie
  "labels": ["..."],
  "datasets": [{ "label": "...", "data": [1,2,3] }],
  "judul": "..."
}

// tipe: diagram
{ "mermaid_syntax": "flowchart TD\nA-->B", "judul": "..." }

// tipe: gambar
{
  "source": "ai",                  // ai | upload
  "prompt": "...",                 // hanya jika source=ai
  "caption": "..."
}
```

---

## 4. Alur Proses (Pipeline)

```
1. Buat buku (web/bot) → isi judul, mapel, jenjang, kurikulum
2. POST /api/buku/:id/outline/generate
   → AI (DeepSeek) generate daftar bab + ringkasan tiap bab
   → user review & edit outline → save ke tabel `bab`
3. Untuk setiap bab (satu per satu, karena 100 hal. terlalu besar untuk sekali generate):
   POST /api/bab/:id/generate (SSE)
   → AI generate konten bab dalam bentuk terstruktur:
       - blok teks (markdown)
       - blok tabel (jika relevan)
       - blok chart (data JSON, jika ada data numerik yang cocok divisualisasi)
       - blok diagram (mermaid syntax, jika ada alur/konsep yang cocok didiagramkan)
       - blok gambar (prompt AI ATAU placeholder "menunggu upload guru")
   → tiap blok yang selesai di-stream ke client & disimpan ke `konten_blok`
   → chart & diagram langsung dirender jadi PNG/SVG di background (chartRenderService/diagramRenderService)
   → gambar AI langsung digenerate via imageService (Gemini) atau menunggu upload manual
4. Guru bisa upload gambar manual kapan saja:
   - saat proses generate bab (isi blok gambar placeholder)
   - setelah buku selesai (replace/tambah blok gambar)
5. Setelah semua bab berstatus 'selesai':
   POST /api/buku/:id/export?format=docx|pdf
   → exportService compile semua bab+blok jadi satu dokumen
   → DOCX dibuat dulu, PDF adalah hasil konversi dari DOCX
6. Guru download dari web, atau bot kirim file sebagai attachment Telegram
```

---

## 5. Struktur Endpoint API (garis besar)

```
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/ai-providers                daftar provider AI teks yang sudah dikonfigurasi (API key-nya diisi di server)

POST   /api/buku                        buat buku baru
GET    /api/buku                        list buku
GET    /api/buku/:id                    detail buku + bab
POST   /api/buku/:id/outline/generate   generate outline (SSE), body: { provider, model }
PUT    /api/buku/:id/outline            simpan/edit outline hasil review

POST   /api/bab/:id/generate            generate konten bab (SSE)
GET    /api/bab/:id                     detail bab + blok konten
PUT    /api/bab/:id/blok/:blokId        edit manual satu blok

POST   /api/blok/:id/gambar/upload      upload gambar manual (multipart)
POST   /api/blok/:id/gambar/regenerate  generate ulang gambar AI

POST   /api/buku/:id/export             mulai export (docx/pdf)
GET    /api/export/:jobId               cek status export
GET    /api/export/:jobId/download      download hasil
```

---

## 5a. AI Teks — Multi-Provider (`ai-providers` + `ai-text-client`)

Berbeda dari rencana awal (OpenRouter/DeepSeek saja), admin bisa pilih provider AI teks per aksi generate
(outline di Stage 2, konten bab di Stage 3) lewat dropdown di UI. Polanya diambil dari project `rpp-generator`
milik user yang sudah lebih dulu punya multi-provider AI.

**Provider yang didukung** (`backend/src/services/ai-providers.ts`, registry statis):

| id | Label | Base URL | Env var API key |
|---|---|---|---|
| `openrouter` | OpenRouter | `https://openrouter.ai/api/v1` | `OPENROUTER_API_KEY` |
| `opencode` | OpenCode Zen | `https://api.opencode.ai/v1` | `OPENCODE_API_KEY` |
| `google` | Google AI (Gemini, endpoint OpenAI-compatible) | `https://generativelanguage.googleapis.com/v1beta/openai` | `GOOGLE_AI_API_KEY` |
| `anthropic` | Anthropic | `https://api.anthropic.com` (native Messages API, bukan OpenAI-compatible) | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI | `https://api.openai.com/v1` | `OPENAI_API_KEY` |
| `deepseek` | DeepSeek | `https://api.deepseek.com` | `DEEPSEEK_API_KEY` |

**Keputusan desain:**
- API key **per env var**, bukan disimpan di DB — server operator (admin) yang isi `.env`, tidak butuh
  enkripsi at-rest / halaman Settings terpisah. Provider yang env var-nya kosong otomatis tidak muncul di
  `GET /api/ai-providers` (endpoint ini dipakai frontend untuk mengisi dropdown pilihan).
- Provider **dipilih per aksi generate** (dikirim di body request `{ provider, model }`), bukan disetel sekali
  secara global — supaya admin bebas bandingkan hasil dari beberapa provider tanpa ganti config server.
- `ai-text-client.ts` (`generateText()`) adalah satu-satunya tempat yang tahu cara memanggil tiap provider:
  - Anthropic → jalur native via `@anthropic-ai/sdk` (`client.messages.stream(...)`), format request/response beda
    dari yang lain (system prompt terpisah, bukan array `messages` dengan role `system`).
  - 5 provider lainnya → jalur OpenAI-compatible chat completions (streaming SSE manual via `fetch`), model ID
    di-strip prefix `vendor/` kecuali untuk OpenRouter (yang memang butuh prefix, mis. `deepseek/deepseek-chat`).
- `outlineService`/`contentService` (Stage 3) tidak tahu detail provider — mereka cuma panggil `generateText()`
  dengan system+user prompt dan terima teks jadi, lalu parse ke struktur masing-masing.

```typescript
type TextProviderId = 'openrouter' | 'opencode' | 'google' | 'anthropic' | 'openai' | 'deepseek';

interface TextGenerationRequest {
  provider: TextProviderId;
  model: string;
  apiKey: string;
  system: string;
  user: string;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

function generateText(req: TextGenerationRequest): Promise<string> { /* streaming, kembalikan teks lengkap */ }
```

---

## 6. imageService — Provider Abstraction

```typescript
interface ImageProvider {
  generate(prompt: string, opts?: { size?: string }): Promise<Buffer>;
}

class GeminiImageProvider implements ImageProvider { /* Gemini 3 Pro Image */ }
class OpenAIImageProvider implements ImageProvider { /* GPT Image, fallback opsional */ }

class ImageService {
  constructor(private provider: ImageProvider) {}
  async generateAI(prompt: string): Promise<string /* file_path */> { ... }
  async saveUpload(file: Express.Multer.File): Promise<string /* file_path */> { ... }
}
```

Default provider: `GeminiImageProvider`. Bisa diganti via env var `IMAGE_PROVIDER=gemini|openai` tanpa ubah kode pemanggil.

---

## 7. Bot Telegram (Telegraf)

- Bot terpisah, token & session sendiri (tidak digabung dengan bot RPP/asesmen)
- Fungsi utama:
  - `/buatbuku` → wizard singkat (judul, mapel, jenjang, kurikulum)
  - `/status` → cek progress bab yang sedang digenerate
  - `/upload` → reply ke pesan bot dengan foto untuk isi blok gambar
  - `/export` → trigger export & kirim file DOCX/PDF sebagai attachment
- Auth: chat_id Telegram di-link ke akun admin tunggal (kolom `telegram_chat_id` di tabel `admin`), verifikasi lewat kode konfirmasi satu kali dari web
- Intent classifier: tetap pakai DeepSeek untuk mem-parsing perintah bebas (bukan hanya command `/`), konsisten dengan bot lain

---

## 8. Docker & Deployment

```
buku-generator/
├── docker-compose.yml        (prod)
├── docker-compose.dev.yml
├── backend/
│   ├── Dockerfile            (base node + LibreOffice + mermaid-cli deps)
│   └── ...
├── frontend/
│   ├── Dockerfile
│   └── ...
└── bot/
    ├── Dockerfile
    └── ...
```

- Semua service join network eksternal `aanNet`
- Nginx Proxy Manager: proxy host baru `buku.aantriono.com` → container frontend/backend
- Backend perlu `proxy_buffering off` di NPM untuk endpoint SSE (konsisten dengan pola existing)
- Volume persisten untuk: SQLite db file, folder upload gambar, folder hasil export
- LibreOffice headless & mermaid-cli chromium dependency perlu di-install di image backend — ini bikin image lebih berat, pertimbangkan base image terpisah atau multi-stage build

---

## 9. Hal yang Perlu Divalidasi Saat Implementasi

- Rate limit & retry untuk Gemini Image API (terutama saat generate banyak gambar per buku)
- Ukuran container image setelah menambahkan LibreOffice + Chromium (mermaid-cli) — cek apakah perlu dipisah jadi service konversi tersendiri
- Estimasi waktu generate 1 bab penuh (teks + chart + diagram + gambar) untuk kalibrasi timeout SSE
- Kualitas hasil AI dalam menentukan kapan sebuah bagian materi "layak" divisualisasikan sebagai chart/diagram vs cukup teks — perlu prompt engineering khusus di `contentService`
