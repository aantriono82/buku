# TASKS.md

Breakdown task granular dari tiap stage di `AGENT_PROMPT.md`. Update checkbox seiring progres — file ini yang dibaca Claude Code untuk tahu task spesifik apa yang sedang/belum dikerjakan, lebih detail dari checklist stage di `CLAUDE.md`.

Konvensi: `[ ]` belum, `[~]` sedang dikerjakan, `[x]` selesai (lint bersih + test lulus), `[!]` blocked/butuh keputusan user.

---

## Stage 1 — Scaffold & Database

- [x] Setup folder `backend/`, `frontend/`, `bot/` sesuai struktur di `planning.md` §8
- [x] Init backend Express + TypeScript
- [x] Setup `better-sqlite3` + migration runner
- [x] Buat migration: tabel `admin`
- [x] Buat migration: tabel `buku`
- [x] Buat migration: tabel `bab`
- [x] Buat migration: tabel `konten_blok`
- [x] Buat migration: tabel `export_job`
- [x] Setup ESLint + Prettier di `backend/`
- [x] Setup Vitest di `backend/`
- [x] Endpoint `POST /api/auth/login` + unit test
- [x] Endpoint `POST /api/auth/logout` + unit test
- [x] Docker Compose dev (backend saja dulu)
- [x] Validasi: server jalan, bisa login, migration jalan tanpa error

## Stage 2 — Outline & Bab

- [x] `outlineService`: prompt generate outline dari judul/mapel/jenjang/kurikulum
- [x] Unit test `outlineService` (mock call ke OpenRouter/DeepSeek)
- [x] Endpoint `POST /api/buku`
- [x] Endpoint `POST /api/buku/:id/outline/generate` (SSE)
- [x] Endpoint `PUT /api/buku/:id/outline`
- [x] Init frontend Vue 3 + Vite, setup ESLint di `frontend/`
- [x] Form buat buku (Vue)
- [x] Tampilan outline hasil AI + edit sebelum simpan
- [x] Validasi: buat buku baru, outline ter-generate & tersimpan ke tabel `bab`

## Stage 3 — Generate Konten Bab (Teks + Tabel)

- [x] Desain prompt output JSON terstruktur per blok (teks & tabel)
- [x] `contentService`: generate konten 1 bab, stream per blok
- [x] Unit test `contentService` (mock AI response, cek parsing blok benar)
- [x] Endpoint `POST /api/bab/:id/generate` (SSE)
- [x] Simpan blok ke `konten_blok` sesuai urutan
- [x] Halaman detail bab (Vue) — tampilkan blok live saat streaming
- [x] Validasi: generate 1 bab penuh, urutan blok benar

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

- [x] Endpoint `GET /api/buku` (list) dan `GET /api/buku/:id` (detail + bab) — sudah ada di `planning.md` §5,
      diimplementasikan lebih awal di Stage 2 karena frontend butuh untuk load ulang state buku (bukan improvisasi
      skema baru, endpoint ini memang sudah direncanakan)
- [x] Desain ulang AI teks jadi multi-provider (OpenRouter, OpenCode, Google AI, Anthropic, OpenAI, DeepSeek) atas
      permintaan user setelah Stage 2 awal selesai — `ai-providers.ts` (registry) + `ai-text-client.ts` (unified
      caller) + endpoint `GET /api/ai-providers` + dropdown provider/model di `OutlineView`. Lihat `planning.md`
      §5a dan `MEMORY.md` untuk detail keputusan. `outlineService` di-refactor untuk pakai abstraksi ini —
      `contentService` (Stage 3) tinggal pakai `generateText()` yang sama, tidak perlu desain ulang lagi.
- [x] Endpoint `GET /api/bab/:id` (detail bab + blok) — sudah ada di `planning.md` §5, diimplementasikan lebih
      awal di Stage 3 (bukan cuma `POST /api/bab/:id/generate` yang tercantum di `AGENT_PROMPT.md`) karena
      halaman detail bab (Vue) butuh reload state blok saat pertama dibuka/refresh, pola sama seperti
      `GET /api/buku`/`GET /api/buku/:id` di Stage 2. `PUT /api/bab/:id/blok/:blokId` (edit manual satu blok)
      belum diimplementasikan — bukan bagian kriteria validasi Stage 3, ditunda ke stage yang butuh (mis. saat
      guru perlu koreksi manual sebelum export).
