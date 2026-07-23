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

- [x] `chartRenderService` (chartjs-node-canvas) → PNG
- [x] Unit test `chartRenderService` (data valid → file dihasilkan; data invalid → error ditangani)
- [x] `diagramRenderService` (mermaid-cli via child_process) → SVG/PNG
- [x] Unit test `diagramRenderService` (mock child_process call)
- [x] Extend prompt `contentService` agar AI hasilkan blok chart/diagram bila relevan
- [x] Validasi: bab dengan data numerik → chart ter-render; bab dengan alur konsep → diagram ter-render

## Stage 5 — Gambar (AI + Upload Manual)

- [x] Interface `ImageProvider`
- [x] `GeminiImageProvider` (implementasi default)
- [x] `imageService.generateAI()` + `imageService.saveUpload()`
- [x] Unit test `imageService` (mock provider, mock file upload)
- [x] Endpoint `POST /api/blok/:id/gambar/upload` (multipart)
- [x] Endpoint `POST /api/blok/:id/gambar/regenerate`
- [x] UI pilih generate AI vs upload manual per blok gambar
- [x] Validasi: gambar AI ter-generate & tersimpan; upload manual berhasil replace blok

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
- [x] Env var `STORAGE_DIR` (default `./data/storage`) ditambahkan di Stage 4 — belum ada di `planning.md`/
      `AGENT_PROMPT.md` karena stage sebelumnya belum butuh folder output file. Dipakai `chartRenderService`/
      `diagramRenderService` untuk simpan hasil render (`storage/chart/`, `storage/diagram/`), diteruskan lewat
      `AppOptions.storageDir` → `babRoutes`. Folder ini nanti dipakai juga di Stage 5 (upload gambar) dan Stage 6
      (file export), jadi bukan keputusan sekali pakai.
- [x] `GET /api/bab/:id` sekarang ikut mengembalikan `file_path` per blok (sebelumnya cuma `id/urutan/tipe/data`)
      — perlu supaya klien tahu chart/diagram sudah/belum selesai dirender. Bukan endpoint baru, cuma field
      tambahan di response yang sudah ada.
- [x] `contentService` (Stage 3/4) diperluas dengan tipe blok `gambar` (`{ source: "ai"|"upload", prompt?, caption? }`)
      — sudah ada di `planning.md` §3 data_json gambar dan §4 pipeline ("blok gambar (prompt AI ATAU placeholder
      menunggu upload guru)"), belum diimplementasikan di Stage 3/4 karena waktu itu belum ada `imageService`
      untuk memprosesnya. Diselesaikan sekarang di Stage 5 karena blok gambar tidak berguna tanpa cara
      generate/upload-nya.
- [x] `routes/bab.ts` `renderVisualBlok` diperluas: blok gambar dengan `source: "ai"` langsung dipanggil
      `imageService.generateAI()` saat `POST /api/bab/:id/generate` (sama seperti chart/diagram, kegagalan tidak
      menggagalkan bab lain). Blok `source: "upload"` sengaja dilewati, menunggu guru upload manual.
- [x] Static file serving `/api/storage` (mount `express.static(storageDir)`, di belakang `requireAuth`) + field
      `file_url` di tiap blok pada response `GET /api/bab/:id` — bukan bagian checklist eksplisit Stage 5, tapi
      diperlukan supaya frontend bisa preview gambar/chart/diagram yang sudah dirender (sebelumnya `file_path`
      cuma path disk server, tidak bisa diakses browser). Tanpa ini validasi "gambar AI ter-generate & tersimpan"
      tidak bisa diverifikasi lewat UI.
- [x] Dependency baru `multer` (+ `@types/multer`) untuk endpoint upload multipart, mengikuti pola yang sama
      persis dengan `rpp-generator` (`multer.memoryStorage()`, `fileFilter` validasi mimetype, limit ukuran file).
