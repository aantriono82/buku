# MEMORY.md

Log keputusan teknis, masalah yang pernah ditemui, dan catatan progres antar sesi. Tujuannya supaya sesi Claude Code berikutnya tidak mengulang riset/kesalahan yang sama atau menanyakan ulang hal yang sudah diputuskan.

**Cara pakai**: tiap sesi yang menghasilkan keputusan penting, workaround, atau masalah non-trivial, tambahkan entri baru di bagian paling atas (urutan terbaru di atas). Jangan hapus entri lama — kalau sudah tidak relevan, tandai `(usang)` di judulnya daripada dihapus.

---

## Format Entri

```
### [YYYY-MM-DD] Judul singkat
**Konteks**: kenapa hal ini muncul
**Keputusan/temuan**: apa yang diputuskan atau ditemukan
**Dampak**: bagian kode/desain mana yang terpengaruh
```

### [2026-07-22] AI teks jadi multi-provider (6 provider), bukan OpenRouter/DeepSeek saja
**Konteks**: user mencoba login pakai API key Google AI Studio ke fitur outline yang awalnya di-hardcode ke
OpenRouter saja. Setelah dikonfirmasi, user minta dukungan 6 provider sekaligus (OpenRouter, OpenCode Zen, Google
AI, Anthropic, OpenAI, DeepSeek) yang bisa dipilih user per aksi generate — bukan cuma satu provider tetap.
**Keputusan/temuan**:
- Base URL & cara deteksi tiap provider disalin dari pola yang sudah terbukti jalan di project lain milik user
  (`~/Dev/rpp/backend/src/utils/apiBaseUrl.js` dan `~/Dev/rpp/frontend/src/utils/aiProviders.js`) supaya konsisten
  dan tidak menebak-nebak endpoint sendiri. Model default per provider juga diambil dari
  `~/Dev/rpp/backend/src/db/migrations.js` (seed `ai_models`), kecuali OpenCode Zen yang tidak ada di seed itu —
  dibiarkan tanpa default (user isi model manual), jangan menebak nama model OpenCode tanpa sumber.
- API key **per env var** (`OPENROUTER_API_KEY`, `OPENCODE_API_KEY`, `GOOGLE_AI_API_KEY`, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`), bukan tabel DB baru — sengaja dibuat sesederhana mungkin (single admin =
  operator server, tidak perlu enkripsi at-rest / halaman Settings terpisah seperti pola multi-user di
  `rpp-generator`). Provider yang env var-nya kosong otomatis hilang dari pilihan di UI
  (`GET /api/ai-providers`), dicek lewat `listAvailableTextProviders()`.
- Provider **dipilih per aksi generate** (dropdown di `OutlineView`, dikirim di body `{ provider, model }`), bukan
  disetel sekali secara global.
- Arsitektur: `ai-providers.ts` (registry statis + resolve api key, pure function, gampang ditest) dipisah dari
  `ai-text-client.ts` (`generateText()` — satu-satunya tempat yang tahu cara memanggil tiap provider: native
  Anthropic via `@anthropic-ai/sdk` streaming vs 5 provider lain lewat jalur OpenAI-compatible `fetch` streaming
  manual). `outlineService.generateOutline()` sekarang cuma manggil `generateText()` dengan system+user prompt,
  tidak tahu detail provider sama sekali — jadi `contentService` (Stage 3) tinggal reuse tanpa desain ulang.
- **Bug yang ketemu & diperbaiki saat proses ini**: endpoint SSE (`POST /:id/outline/generate`) awalnya treat
  SETIAP event `req.on('close')` sebagai client disconnect asli, lalu `abortController.abort()`. Begitu endpoint
  ini mulai menerima JSON body (`{provider, model}` — sebelumnya endpoint ini dipanggil tanpa body), muncul
  fenomena **half-close**: `close` terpicu begitu client selesai kirim body request, jauh sebelum response
  selesai — persis masalah yang sudah didokumentasikan di komentar
  `~/Dev/rpp/backend/src/controllers/generateController.js`. Akibatnya event `done`/`error` tidak pernah terkirim
  ke client (test SSE gagal, res.text kosong). Fix: hanya anggap disconnect asli kalau `req.socket.destroyed`
  true, bukan sekadar event `close`. **Pola ini WAJIB dipakai lagi di Stage 3** (`POST /api/bab/:id/generate`)
  karena endpoint itu juga SSE + kemungkinan besar butuh body (provider/model per bab).
**Dampak**: `planning.md` §5a (baru), `backend/src/services/ai-providers.ts`, `ai-text-client.ts`,
`outline-service.ts` (refactor), `routes/buku.ts`, `routes/ai-providers.ts` (baru), `config.ts` (6 env var baru,
`OPENROUTER_MODEL` dihapus — default model sekarang per-provider di registry), `frontend/src/views/OutlineView.vue`
(dropdown provider+model). Dependency baru: `@anthropic-ai/sdk`.

### [2026-07-22] Stage 2 selesai — outline via SSE, pola diambil dari `rpp-generator`
**Konteks**: implementasi `outlineService` + endpoint outline + frontend Vue pertama kalinya di project ini. Sempat
cek pola yang sudah terbukti jalan di `~/Dev/rpp/backend/src/controllers/generateController.js` dan
`~/Dev/rpp/frontend/src/views/GenerateView.vue` untuk SSE streaming dari OpenRouter.
**Keputusan/temuan**:
- Endpoint SSE (`POST /api/buku/:id/outline/generate`) pakai `res.write('data: ...\n\n')` manual, bukan
  `EventSource` di frontend karena `EventSource` browser hanya mendukung GET — client pakai `fetch()` +
  `res.body.getReader()`, pola yang sama dipakai `rpp-generator`. Pola ini akan dipakai lagi di Stage 3 untuk
  generate konten bab.
- `outlineService.generateOutline()` selalu minta `stream: true` ke OpenRouter dan meneruskan tiap delta chunk via
  callback `onChunk`, lalu di akhir stream baru di-parse jadi JSON `{bab: [{judul, ringkasan}]}`
  (`response_format: json_object`). Parsing dipisah jadi `parseOutlineResponse()` yang testable tanpa mock network.
- Model default OpenRouter: `deepseek/deepseek-chat` (env `OPENROUTER_MODEL`, override per `OPENROUTER_API_KEY`).
- `PUT /api/buku/:id/outline` pakai strategi **replace-all**: hapus semua baris `bab` milik buku itu lalu insert
  ulang sesuai urutan array yang dikirim frontend. Ini disengaja karena tahap ini masih fase "review outline
  sebelum generate konten" — belum ada `konten_blok` yang bisa kehilangan referensi kalau bab dihapus/ditata ulang.
  **Kalau nanti PUT outline dipanggil setelah sebagian bab sudah punya `konten_blok` (generate ulang outline di
  tengah jalan), strategi ini perlu direvisi** supaya tidak menghapus konten bab yang sudah digenerate.
- Endpoint `GET /api/buku` dan `GET /api/buku/:id` (sudah ada di `planning.md` §5, bukan endpoint baru) turut
  diimplementasikan di Stage 2 karena frontend butuh reload state buku — dicatat di `TASKS.md` bagian ad-hoc.

### [2026-07-22] Frontend discaffold manual (Vue 3 + Vite + TS), ESLint flat config disamakan dengan backend
**Konteks**: `frontend/` masih kosong di awal Stage 2, perlu discaffold dari nol.
**Keputusan/temuan**: pakai `npm create vite@latest -- --template vue-ts`, lalu ganti ESLint ke flat config
(`eslint.config.js`) dengan `typescript-eslint` + `eslint-plugin-vue` + `eslint-config-prettier`, gaya sama persis
dengan `backend/eslint.config.js` (aturan `eqeqeq`, `curly`, `no-console` warn, dst). Prettier config
(`.prettierrc.json`) disamakan (`printWidth: 120`, single quote). Vitest dipasang tapi baru dipakai untuk logic
murni tanpa DOM (`src/lib/sse.ts` — parsing baris SSE `data: ...`), belum ada test komponen Vue (`@vue/test-utils`)
karena belum ada logika non-trivial di level komponen; tambahkan kalau muncul di stage berikutnya.
**Dampak**: `frontend/vite.config.ts` dev server di port **5183**, proxy `/api` ke `process.env.BACKEND_URL` dengan
fallback `http://localhost:3011` (mengikuti pola `rpp-generator`: env var untuk docker service name, fallback
localhost untuk dev di luar docker). `docker-compose.dev.yml` menambah service `frontend` dengan
`BACKEND_URL=http://backend:3011` (nama service Docker, sesuai konvensi `CLAUDE.md`).

### [2026-07-22] Verifikasi UI dengan browser headless gagal — jaringan sandbox tidak bisa download Chromium
**Konteks**: coba ikuti aturan "start dev server dan tes fitur di browser sebelum lapor selesai" untuk Stage 2
pakai skill `run` (pola `chromium-cli` / Playwright headless).
**Keputusan/temuan**: `chromium-cli` tidak tersedia di environment ini. Playwright npm package ada di project lain
(`~/Dev/atigacbt/frontend`) tapi versi browser binary-nya tidak cocok dengan yang sudah ter-cache
(`chromium_headless_shell-1217` vs `chromium-1228`), dan `npx playwright install chromium` macet di 0% setelah
60+ detik — jaringan sandbox tampaknya memblokir/throttle download binary besar dari `cdn.playwright.dev`. Sebagai
gantinya, alur end-to-end diverifikasi lewat `curl` melalui proxy Vite (`http://localhost:5183/api/...`, sama
seperti yang akan dipanggil browser): login → buat buku → generate outline (500 karena `OPENROUTER_API_KEY` kosong,
sesuai ekspektasi) → simpan outline manual → reload detail buku, semua sesuai ekspektasi. **Render visual di
browser sungguhan (layout, console error di DOM) belum tervalidasi** — kalau sesi berikutnya butuh screenshot,
jangan ulangi percobaan `playwright install`, kemungkinan besar akan macet lagi di jaringan yang sama.
**Dampak**: proses validasi Stage 2 mengandalkan test otomatis (unit+integration via supertest) + smoke test API
manual, bukan screenshot browser.

### [2026-07-22] Port backend diubah dari 3001
**Konteks**: port 3001 (default awal Stage 1) sudah dipakai `rppgen-backend-dev` di VPS yang sama.
**Keputusan/temuan**: backend `buku-generator` pakai port **3011**, frontend dev pakai port **5183**. Selalu via `process.env.PORT`, jangan hardcode.
**Dampak**: `.env`/`.env.example` di `backend/`, `vite.config.ts` (proxy target & dev server port di frontend), dan nanti port mapping di `docker-compose.yml` (Stage 8).

**Port registry VPS (per 2026-07-22, cek ulang via `docker ps` kalau ragu):**

| Port | Dipakai oleh |
|---|---|
| 80, 81, 443 | `npm` (Nginx Proxy Manager) |
| 3001 | `rppgen-backend-dev` |
| 3011 | `buku-generator` backend *(baru)* |
| 3552 | `arcane` |
| 5173 | `rppgen-frontend-dev` |
| 5183 | `buku-generator` frontend dev *(baru)* |
| 8088 | `adminer` |

### [2026-07-22] Deploy via Arcane dengan auto-update image → butuh GHCR
**Konteks**: user ingin pakai fitur auto-update image di Arcane (Docker management UI, mirip Portainer) untuk deploy `buku-generator`. Fitur ini butuh image sudah tersedia di container registry — Arcane hanya pull & restart, tidak build dari source.
**Keputusan/temuan**: setup GitHub Actions (`.github/workflows/docker-publish.yml`) build & push image ke GHCR (`ghcr.io/aantriono82/buku-generator-{backend|frontend|bot}`) tiap push ke `main`. `docker-compose.yml` prod pakai `image:` bukan `build:`. VPS perlu `docker login ghcr.io` pakai PAT (`read:packages`) karena package kemungkinan private.
**Dampak**: Stage 8 di `AGENT_PROMPT.md`/`TASKS.md` diubah total — sebelumnya build lokal di VPS (pola project lain), sekarang build terjadi di GitHub Actions. **Ini pola khusus `buku-generator`, tidak mengubah pola deploy project lain** (rpp-generator, asesmen, dakwah-app tetap build lokal).
**Catatan keamanan**: PAT GHCR jangan pernah disimpan di file/commit manapun di repo — cukup dicatat di sini bahwa token itu ada dan tersimpan di `~/.docker/config.json` VPS / pengaturan kredensial Arcane.

---

## Keputusan Awal (dari sesi perencanaan)

### [2026-07-19] Provider AI gambar: Gemini 3 Pro Image
**Konteks**: DALL-E 3 sudah dihapus dari API OpenAI per 12 Mei 2026, digantikan lini GPT Image.
**Keputusan/temuan**: Prioritas user adalah kualitas terbaik. Gemini 3 Pro Image (Nano Banana Pro) dipilih sebagai default karena fitur konsistensi gaya/karakter lintas gambar, cocok untuk ilustrasi buku yang perlu senada. GPT Image 1.5/2 jadi alternatif via provider abstraction.
**Dampak**: `imageService` didesain dengan interface `ImageProvider` agar provider bisa diganti tanpa ubah kode pemanggil.

### [2026-07-19] Generate konten selalu per-bab, bukan sekali seluruh buku
**Konteks**: buku bisa mencapai ~100 halaman/5 bab, jauh melebihi kapasitas satu completion AI yang realistis.
**Keputusan/temuan**: setiap bab digenerate lewat SSE session terpisah, tersimpan progresif ke `konten_blok`. Export baru dijalankan setelah semua bab berstatus `selesai`.
**Dampak**: desain endpoint `POST /api/bab/:id/generate` per-bab, bukan per-buku.

### [2026-07-19] Bot Telegram terpisah dari bot RPP/asesmen
**Konteks**: user sudah punya bot Telegram lain untuk `rpp-generator`/`asesmen`.
**Keputusan/temuan**: bot buku ini dibuat sebagai project Telegraf terpisah, token & session sendiri, bukan gabung jadi satu bot multi-fungsi.
**Dampak**: folder `bot/` di `buku-generator` berdiri sendiri, tidak share kode dengan bot lain (kecuali pola/konvensi).

### [2026-07-19] Auth single-admin
**Konteks**: pengguna hanya guru/admin tunggal, bukan multi-user seperti `asesmen`.
**Keputusan/temuan**: auth sederhana — session cookie + bcrypt, tanpa role granular.
**Dampak**: tidak perlu tabel `role`/`permission`, cukup satu baris di tabel `admin`.

---

## Masalah & Workaround (isi seiring implementasi)

_(kosong — isi saat menemukan masalah non-trivial selama development, misalnya rate limit API, error konversi LibreOffice, dsb.)_

---

## Hal yang Masih Perlu Divalidasi

- Rate limit & retry strategy untuk Gemini Image API saat generate banyak gambar sekaligus
- Ukuran final Docker image backend setelah LibreOffice + Chromium (mermaid-cli) ditambahkan — apakah perlu dipisah jadi service tersendiri
- Estimasi waktu generate 1 bab penuh untuk kalibrasi timeout SSE
- Prompt engineering untuk menentukan kapan materi "layak" divisualisasikan sebagai chart/diagram vs cukup teks
- Jalur `generateText()` untuk OpenCode Zen, Google AI, Anthropic, OpenAI, DeepSeek belum pernah dites ke API
  aslinya (cuma OpenRouter yang di-smoke-test dengan key palsu dan benar-benar hit endpoint asli, error 401
  balik dengan benar). Base URL & format request disalin dari `rpp-generator` yang sudah terbukti jalan di sana,
  tapi kalau ada provider yang gagal aneh (bukan sekadar 401 auth), cek dulu apakah `response_format: json_object`
  didukung provider itu (`jsonMode` bisa di-set false di `generateText()` request kalau ternyata tidak didukung)
