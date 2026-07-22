# Agent Prompt: buku-generator

Gunakan bersama `planning.md`. Kerjakan bertahap per stage, jangan lompat — validasi tiap stage jalan sebelum lanjut ke stage berikutnya.

## Aturan Wajib di Setiap Stage

Setiap stage baru dianggap **selesai** hanya jika ketiga hal ini terpenuhi, bukan cuma fitur jalan:

1. **Lint bersih** — `npm run lint` (ESLint + Prettier check) tanpa error di package yang disentuh (`backend/`, `frontend/`, atau `bot/`)
2. **Unit test ditulis & lulus** — setiap service/fungsi baru yang punya logika non-trivial (bukan sekadar wiring) wajib punya unit test yang menyertainya di stage yang sama, bukan ditunda ke stage lain. `npm run test` harus lulus sebelum stage ditutup
3. **Tidak menurunkan coverage stage sebelumnya** — perubahan di satu stage tidak boleh membuat test stage sebelumnya gagal

Kalau sebuah perubahan sulit di-unit-test (misalnya pemanggilan API eksternal seperti Gemini/OpenRouter, atau proses child_process seperti LibreOffice/mermaid-cli), mock dependency eksternalnya — jangan skip testnya. Test boleh fokus ke logic (parsing, transformasi data, error handling), bukan harus memanggil API asli.

Setup awal (masuk ke Stage 1): siapkan Vitest (atau Jest, pilih salah satu dan konsisten) untuk backend/bot, dan ESLint + Prettier untuk semua package sejak awal — jangan ditambahkan belakangan.

---

## Konteks Proyek

Project baru bernama `buku-generator`: bot Telegram + web app untuk menulis buku pelajaran sekolah dengan bantuan AI. Konten buku terdiri dari teks, tabel, chart, diagram (mermaid), dan gambar (AI generate + upload manual). Output akhir: DOCX dan PDF. Deploy di VPS existing (Docker + Nginx Proxy Manager, network `aanNet`, subdomain `buku.aantriono.com`).

Ikuti seluruh spesifikasi di `planning.md` sebagai sumber kebenaran untuk skema database, struktur endpoint, dan desain service.

---

## Stage 1 — Scaffold & Database

- Inisialisasi struktur folder: `backend/`, `frontend/`, `bot/`, sesuai `planning.md` §8
- Setup backend Express + TypeScript, dengan `better-sqlite3`
- Buat migration untuk seluruh tabel di `planning.md` §3 (`admin`, `buku`, `bab`, `konten_blok`, `export_job`)
- Setup auth single-admin: endpoint login/logout, hash password (bcrypt), session cookie
- Docker Compose dasar (dev), belum perlu LibreOffice/mermaid-cli dulu di stage ini
- **Validasi**: server jalan, bisa login, tabel ter-migrate dengan benar
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 2 — Outline & Bab

- Implementasi `outlineService`: prompt ke OpenRouter/DeepSeek untuk generate outline (daftar bab + ringkasan) dari judul/mapel/jenjang/kurikulum
- Endpoint `POST /api/buku`, `POST /api/buku/:id/outline/generate` (SSE), `PUT /api/buku/:id/outline`
- Frontend Vue: form buat buku + tampilan outline hasil AI yang bisa diedit sebelum disimpan
- **Validasi**: bisa buat buku baru, outline ter-generate dan tersimpan sebagai baris di tabel `bab`
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 3 — Generate Konten Bab (Teks + Tabel)

- Implementasi `contentService` untuk generate konten satu bab dalam bentuk blok terstruktur (teks & tabel dulu, chart/diagram/gambar menyusul di stage berikutnya)
- Desain prompt agar output AI berupa JSON terstruktur per blok (lihat `data_json` di `planning.md` §3)
- Endpoint `POST /api/bab/:id/generate` (SSE, stream tiap blok yang selesai)
- Simpan tiap blok ke `konten_blok` sesuai urutan
- Frontend: halaman detail bab yang menampilkan blok secara live saat SSE streaming
- **Validasi**: generate 1 bab penuh, blok teks & tabel tersimpan dengan urutan benar
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 4 — Chart & Diagram Rendering

- Implementasi `chartRenderService` (chartjs-node-canvas) — terima data_json tipe chart, hasilkan PNG, simpan path ke `file_path`
- Implementasi `diagramRenderService` (mermaid-cli via child_process) — terima mermaid_syntax, hasilkan SVG/PNG
- Extend prompt di `contentService` agar AI juga menghasilkan blok chart/diagram bila relevan dengan materi
- **Validasi**: bab dengan data numerik menghasilkan blok chart yang benar-benar ter-render jadi gambar; bab dengan alur/konsep menghasilkan diagram
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 5 — Gambar (AI + Upload Manual)

- Implementasi `imageService` dengan `ImageProvider` interface (lihat `planning.md` §6)
- `GeminiImageProvider` sebagai implementasi default (Gemini 3 Pro Image API)
- Endpoint upload manual (`POST /api/blok/:id/gambar/upload`, multipart)
- Endpoint regenerate AI (`POST /api/blok/:id/gambar/regenerate`)
- Frontend: UI untuk pilih "generate AI" vs "upload sendiri" per blok gambar, bisa dilakukan saat generate maupun setelah bab selesai
- **Validasi**: gambar AI ter-generate dan tersimpan; upload manual berhasil replace/isi blok gambar
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 6 — Export DOCX + PDF

- Implementasi `exportService`: compile seluruh bab + blok (urut sesuai `urutan`) jadi satu dokumen DOCX menggunakan lib `docx`
  - Mapping tipe blok → elemen DOCX: teks→paragraph, tabel→Table, chart/diagram/gambar→Image (dari file_path)
- Implementasi konversi DOCX→PDF via LibreOffice headless (`soffice --headless --convert-to pdf`)
- Endpoint `POST /api/buku/:id/export`, `GET /api/export/:jobId`, `GET /api/export/:jobId/download`
- **Validasi**: buku dengan 5 bab lengkap (teks+tabel+chart+diagram+gambar) berhasil ter-export jadi DOCX yang valid dan terbuka rapi di Word, serta PDF hasil konversi
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 7 — Bot Telegram

- Setup project Telegraf terpisah di `bot/`
- Implementasi command: `/buatbuku`, `/status`, `/upload`, `/export`
- Link akun: chat_id admin ke tabel `admin` via kode konfirmasi dari web
- Bot memanggil backend API yang sama (bukan duplikasi logic)
- Intent classifier DeepSeek untuk perintah bebas (bukan hanya `/command`)
- **Validasi**: end-to-end dari Telegram — buat buku, cek status, upload gambar via reply foto, export dan terima file sebagai attachment
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

## Stage 8 — CI/CD, GHCR & Deployment (Arcane)

- Finalisasi Dockerfile tiap service (backend perlu LibreOffice + mermaid-cli/chromium dependencies; frontend & bot lebih ringan)
- Buat `.github/workflows/docker-publish.yml`: build & push image ke GHCR (`ghcr.io/aantriono82/buku-generator-{service}`) tiap push ke `main`, tag `latest` + short SHA
- Ubah `docker-compose.yml` prod: ganti `build:` menjadi `image: ghcr.io/...`
- Setup autentikasi GHCR di VPS (`docker login ghcr.io` dengan PAT `read:packages`) supaya Arcane bisa pull image private
- Setup stack di Arcane, aktifkan auto-update image untuk service `buku-generator`
- Docker Compose join network eksternal `aanNet`
- Setup proxy host baru di Nginx Proxy Manager: `buku.aantriono.com`, aktifkan `proxy_buffering off` untuk endpoint SSE
- Volume persisten: db file, folder upload, folder hasil export
- **Validasi**: push ke `main` → image baru muncul di GHCR → Arcane auto-update → akses `buku.aantriono.com` dari luar, seluruh alur (outline → generate → export) jalan di environment production
- **Lint & test**: `npm run lint` bersih dan `npm run test` lulus untuk package yang disentuh di stage ini

---

## Catatan untuk Agent

- Ikuti pola kode existing di project `rpp-generator`/`asesmen` bila ada referensi yang relevan (struktur service, pola SSE, pola Docker)
- Jangan generate seluruh 100 halaman buku dalam satu request AI — selalu per-bab
- Prioritaskan error handling & status tracking (`status` field di `bab`/`export_job`) karena proses ini panjang dan banyak titik yang bisa gagal (AI timeout, image API rate limit, LibreOffice conversion error)
