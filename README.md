# buku-generator

Bot Telegram + web app untuk menulis buku pelajaran sekolah dengan bantuan AI. Konten buku terdiri dari teks, tabel, chart, diagram (mermaid), dan gambar (AI generate + upload manual). Output akhir: DOCX dan PDF.

Dokumentasi lengkap:
- [`planning.md`](planning.md) — spesifikasi teknis: skema database, alur pipeline, struktur endpoint, desain service
- [`AGENT_PROMPT.md`](AGENT_PROMPT.md) — 8 stage implementasi bertahap beserta kriteria validasi
- [`TASKS.md`](TASKS.md) — breakdown task granular per stage
- [`MEMORY.md`](MEMORY.md) — log keputusan teknis & masalah yang ditemukan selama pengembangan

## Ringkasan

| Aspek | Keputusan |
|---|---|
| Akses | Telegram bot (khusus) + Web app |
| Target pengguna | Single admin/guru (tanpa multi-role) |
| Jenis konten | Teks, tabel, chart data, diagram konsep, gambar |
| Ukuran buku | ~5 bab / ~100 halaman per buku |
| Output | DOCX + PDF |

## Tech Stack

- **Backend**: Express + TypeScript, SQLite (`better-sqlite3`)
- **Frontend**: Vue 3 + Vite
- **Bot**: Telegraf (Node.js/TypeScript)
- **AI teks**: multi-provider (OpenRouter, OpenCode Zen, Google AI, Anthropic, OpenAI, DeepSeek) — admin pilih provider + model per aksi generate, lihat `planning.md` §5a
- **AI gambar**: Gemini 3 Pro Image (Nano Banana Pro), via abstraksi `ImageProvider`
- **Chart**: `chartjs-node-canvas` → PNG
- **Diagram**: `mermaid-cli` (headless) → SVG/PNG
- **Export**: `docx` (npm) → DOCX, lalu LibreOffice headless → PDF
- **Realtime**: SSE untuk proses generate outline & konten bab
- **CI/CD & Deploy**: GitHub Actions build & push image ke GHCR tiap push ke `main`; VPS pakai Arcane dengan auto-update image (lihat `planning.md` §10)

## Struktur Project

```
buku-generator/
├── backend/     Express API, migration, service AI/render/export
├── frontend/    Vue 3 + Vite web app
├── bot/         Bot Telegram (Telegraf)
├── planning.md
├── AGENT_PROMPT.md
├── TASKS.md
└── MEMORY.md
```

## Menjalankan (Development)

Backend:

```bash
cd backend
cp .env.example .env   # isi kredensial/konfigurasi + minimal 1 API key provider AI teks
                       # (GOOGLE_AI_API_KEY dipakai juga untuk AI gambar/Gemini Image, lihat IMAGE_PROVIDER)
npm install
npm run dev
```

Frontend (di terminal terpisah, backend harus sudah jalan di port 3011):

```bash
cd frontend
npm install
npm run dev
```

Atau jalankan keduanya sekaligus via Docker Compose (dev):

```bash
docker compose -f docker-compose.dev.yml up
```

Script yang tersedia di `backend/` dan `frontend/`: `npm run dev`, `npm run build`, `npm run lint`, `npm run lint:fix`, `npm run test`, `npm run test:watch` (backend juga punya `npm run start` untuk jalankan hasil build).

## Status Implementasi

- [x] Stage 1 — Scaffold & Database
- [x] Stage 2 — Outline & Bab
- [x] Stage 3 — Generate Konten Bab (Teks + Tabel)
- [x] Stage 4 — Chart & Diagram Rendering
- [x] Stage 5 — Gambar (AI + Upload Manual)
- [ ] Stage 6 — Export DOCX + PDF
- [ ] Stage 7 — Bot Telegram
- [ ] Stage 8 — CI/CD, GHCR & Deployment (Arcane)

Detail task granular per stage ada di [`TASKS.md`](TASKS.md).
