# TASKS.md

Breakdown task granular dari tiap stage di `AGENT_PROMPT.md`. Update checkbox seiring progres — file ini yang dibaca Claude Code untuk tahu task spesifik apa yang sedang/belum dikerjakan, lebih detail dari checklist stage di `CLAUDE.md`.

Konvensi: `[ ]` belum, `[~]` sedang dikerjakan, `[x]` selesai (lint bersih + test lulus), `[!]` blocked/butuh keputusan user.

---

## Stage 1 — Scaffold & Database

- [ ] Setup folder `backend/`, `frontend/`, `bot/` sesuai struktur di `planning.md` §8
- [ ] Init backend Express + TypeScript
- [ ] Setup `better-sqlite3` + migration runner
- [ ] Buat migration: tabel `admin`
- [ ] Buat migration: tabel `buku`
- [ ] Buat migration: tabel `bab`
- [ ] Buat migration: tabel `konten_blok`
- [ ] Buat migration: tabel `export_job`
- [ ] Setup ESLint + Prettier di `backend/`
- [ ] Setup Vitest di `backend/`
- [ ] Endpoint `POST /api/auth/login` + unit test
- [ ] Endpoint `POST /api/auth/logout` + unit test
- [ ] Docker Compose dev (backend saja dulu)
- [ ] Validasi: server jalan, bisa login, migration jalan tanpa error

## Stage 2 — Outline & Bab

- [ ] `outlineService`: prompt generate outline dari judul/mapel/jenjang/kurikulum
- [ ] Unit test `outlineService` (mock call ke OpenRouter/DeepSeek)
- [ ] Endpoint `POST /api/buku`
- [ ] Endpoint `POST /api/buku/:id/outline/generate` (SSE)
- [ ] Endpoint `PUT /api/buku/:id/outline`
- [ ] Init frontend Vue 3 + Vite, setup ESLint di `frontend/`
- [ ] Form buat buku (Vue)
- [ ] Tampilan outline hasil AI + edit sebelum simpan
- [ ] Validasi: buat buku baru, outline ter-generate & tersimpan ke tabel `bab`

## Stage 3 — Generate Konten Bab (Teks + Tabel)

- [ ] Desain prompt output JSON terstruktur per blok (teks & tabel)
- [ ] `contentService`: generate konten 1 bab, stream per blok
- [ ] Unit test `contentService` (mock AI response, cek parsing blok benar)
- [ ] Endpoint `POST /api/bab/:id/generate` (SSE)
- [ ] Simpan blok ke `konten_blok` sesuai urutan
- [ ] Halaman detail bab (Vue) — tampilkan blok live saat streaming
- [ ] Validasi: generate 1 bab penuh, urutan blok benar

## Stage 4 — Chart & Diagram Rendering

- [ ] `chartRenderService` (chartjs-node-canvas) → PNG
- [ ] Unit test `chartRenderService` (data valid → file dihasilkan; data invalid → error ditangani)
- [ ] `diagramRenderService` (mermaid-cli via child_process) → SVG/PNG
- [ ] Unit test `diagramRenderService` (mock child_process call)
- [ ] Extend prompt `contentService` agar AI hasilkan blok chart/diagram bila relevan
- [ ] Validasi: bab dengan data numerik → chart ter-render; bab dengan alur konsep → diagram ter-render

## Stage 5 — Gambar (AI + Upload Manual)

- [ ] Interface `ImageProvider`
- [ ] `GeminiImageProvider` (implementasi default)
- [ ] `imageService.generateAI()` + `imageService.saveUpload()`
- [ ] Unit test `imageService` (mock provider, mock file upload)
- [ ] Endpoint `POST /api/blok/:id/gambar/upload` (multipart)
- [ ] Endpoint `POST /api/blok/:id/gambar/regenerate`
- [ ] UI pilih generate AI vs upload manual per blok gambar
- [ ] Validasi: gambar AI ter-generate & tersimpan; upload manual berhasil replace blok

## Stage 6 — Export DOCX + PDF

- [ ] `exportService`: compile bab+blok → DOCX (lib `docx`)
- [ ] Mapping tipe blok → elemen DOCX (teks/tabel/chart/diagram/gambar)
- [ ] Unit test `exportService` (mock data buku lengkap → cek struktur DOCX dihasilkan benar)
- [ ] Konversi DOCX→PDF via LibreOffice headless
- [ ] Unit test wrapper konversi (mock child_process, cek error handling saat LibreOffice gagal)
- [ ] Endpoint `POST /api/buku/:id/export`
- [ ] Endpoint `GET /api/export/:jobId`
- [ ] Endpoint `GET /api/export/:jobId/download`
- [ ] Validasi: buku 5 bab lengkap → DOCX valid + PDF hasil konversi

## Stage 7 — Bot Telegram

- [ ] Setup project Telegraf di `bot/`, ESLint + Vitest
- [ ] Command `/buatbuku`
- [ ] Command `/status`
- [ ] Command `/upload`
- [ ] Command `/export`
- [ ] Link chat_id admin ke tabel `admin` via kode konfirmasi
- [ ] Intent classifier DeepSeek untuk perintah bebas
- [ ] Unit test handler command (mock context Telegraf)
- [ ] Validasi: end-to-end dari Telegram — buat buku, status, upload, export

## Stage 8 — CI/CD, GHCR & Deployment (Arcane)

- [ ] Dockerfile backend final (+ LibreOffice + mermaid-cli/chromium deps)
- [ ] Dockerfile frontend final
- [ ] Dockerfile bot final
- [ ] Buat `.github/workflows/docker-publish.yml` (build + push 3 image ke GHCR)
- [ ] Set permission `packages: write` di workflow
- [ ] Ubah `docker-compose.yml` prod: `build:` → `image: ghcr.io/...`
- [ ] Generate PAT GitHub (`read:packages`) untuk VPS
- [ ] `docker login ghcr.io` di VPS pakai PAT tsb.
- [ ] Setup stack `buku-generator` di Arcane
- [ ] Aktifkan auto-update image di Arcane untuk stack ini
- [ ] Docker Compose join network `aanNet`
- [ ] Setup proxy host `buku.aantriono.com` di Nginx Proxy Manager
- [ ] Set `proxy_buffering off` untuk endpoint SSE
- [ ] Volume persisten: db, upload, export
- [ ] Validasi: push ke main → image baru di GHCR → Arcane auto-update → akses dari luar berhasil, seluruh alur jalan di production

---

## Task Ad-hoc (di luar 8 stage, isi manual saat muncul)

- [ ]
