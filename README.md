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
- **AI teks**: OpenRouter / DeepSeek
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
cp .env.example .env   # isi kredensial/konfigurasi
npm install
npm run dev
```

Atau via Docker Compose (dev):

```bash
docker compose -f docker-compose.dev.yml up
```

Script backend yang tersedia: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`, `npm run lint:fix`, `npm run test`, `npm run test:watch`.

## Status Implementasi

- [x] Stage 1 — Scaffold & Database
- [ ] Stage 2 — Outline & Bab
- [ ] Stage 3 — Generate Konten Bab (Teks + Tabel)
- [ ] Stage 4 — Chart & Diagram Rendering
- [ ] Stage 5 — Gambar (AI + Upload Manual)
- [ ] Stage 6 — Export DOCX + PDF
- [ ] Stage 7 — Bot Telegram
- [ ] Stage 8 — CI/CD, GHCR & Deployment (Arcane)

Detail task granular per stage ada di [`TASKS.md`](TASKS.md).
