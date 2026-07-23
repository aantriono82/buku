# CLAUDE.md

Instruksi ini dibaca otomatis oleh Claude Code tiap sesi di project ini. Tujuannya supaya konteks tidak perlu dijelaskan ulang tiap buka sesi baru.

## Tentang Project

`buku-generator` — bot Telegram + web app untuk menulis buku pelajaran sekolah dengan bantuan AI. Konten buku terdiri dari teks, tabel, chart, diagram (mermaid), dan gambar (AI generate + upload manual). Output akhir: DOCX dan PDF.

Dokumen sumber kebenaran (baca dulu sebelum mengerjakan apapun):
- `planning.md` — spesifikasi teknis lengkap: skema database, alur pipeline, struktur endpoint, desain service
- `AGENT_PROMPT.md` — 8 stage implementasi bertahap, dengan kriteria validasi tiap stage
- `TASKS.md` — breakdown task granular per stage, checkbox progres. **Update tiap kali task selesai** (`[ ]` → `[x]`)
- `MEMORY.md` — log keputusan teknis, masalah/workaround, dan hal yang masih perlu divalidasi. **Tambahkan entri baru tiap sesi yang menghasilkan keputusan atau menemukan masalah non-trivial** — jangan overwrite entri lama, tambah di atas

**Setiap sesi baru: baca `TASKS.md` dulu untuk tahu task terakhir yang dikerjakan, lalu `MEMORY.md` untuk tahu keputusan/masalah yang relevan sebelum lanjut kerja.**

**Selalu cek dua file di atas sebelum membuat keputusan desain baru.** Jangan improvisasi skema database atau struktur endpoint yang berbeda dari `planning.md` tanpa konfirmasi ke user.

## Tech Stack

- Backend: Express + TypeScript, SQLite (better-sqlite3)
- Frontend: Vue 3 + Vite
- Bot: Telegraf (Node.js/TypeScript), project terpisah dari bot RPP/asesmen milik user
- AI teks: OpenRouter / DeepSeek
- AI gambar: Gemini 3 Pro Image (Nano Banana Pro), via provider abstraction (`ImageProvider` interface)
- Chart: chartjs-node-canvas → PNG
- Diagram: mermaid-cli (headless) → SVG/PNG
- Export: docx (npm) → DOCX, lalu LibreOffice headless → PDF
- Realtime: SSE untuk proses generate outline & konten bab
- Deploy: Docker Compose, network eksternal `aanNet`, Nginx Proxy Manager, subdomain `buku.aantriono.com`

## Konvensi Kode & Infrastruktur (ikuti pola project user yang lain: rpp-generator, asesmen)

- `proxy_buffering off` wajib di-set di Nginx Proxy Manager untuk endpoint SSE
- Vite proxy mengarah ke nama service Docker, bukan `localhost`
- Docker Compose dipisah untuk dev dan prod (`docker-compose.yml` + `docker-compose.dev.yml`)
- Auth: single admin (bukan multi-role), session cookie + bcrypt
- Generate konten AI **selalu per-bab**, tidak pernah generate seluruh buku dalam satu request — buku bisa sampai ~100 halaman/5 bab, jauh melebihi kapasitas satu completion
- Field `status` di tabel `bab` dan `export_job` wajib diupdate konsisten di tiap tahap (belum/generating/selesai/error) — proses ini panjang dan banyak titik gagal (AI timeout, image API rate limit, LibreOffice error)
- Provider AI gambar harus tetap lewat abstraksi `ImageProvider`, jangan hardcode pemanggilan Gemini API langsung di service lain

## Cara Kerja yang Diharapkan

- Kerjakan **satu stage dari `AGENT_PROMPT.md` per sesi/permintaan**, jangan lompat stage sebelum validasi stage sebelumnya lolos
- Setelah selesai satu stage, tunjukkan ringkasan apa yang berubah dan bagaimana cara memvalidasinya (sesuai kriteria "Validasi" di tiap stage `AGENT_PROMPT.md`)
- Kalau ada keputusan desain yang tidak tercakup di `planning.md` (misalnya library baru, perubahan skema), tanyakan ke user dulu sebelum jalan, jangan asumsi sendiri

## Testing & Lint — Wajib di Setiap Perubahan

Tidak ada perubahan kode yang dianggap selesai tanpa ini, termasuk perubahan kecil di luar stage terjadwal:

- Jalankan `npm run lint` sebelum menyatakan sebuah task selesai — harus bersih, tidak ada error/warning baru
- Setiap fungsi/service baru dengan logika non-trivial (parsing, transformasi data, validasi, error handling) wajib disertai unit test di commit/perubahan yang sama — bukan ditunda
- Dependency eksternal (Gemini API, OpenRouter, LibreOffice, mermaid-cli) di-mock di unit test, bukan dipanggil langsung
- Jalankan `npm run test` dan pastikan lulus, termasuk test dari stage-stage sebelumnya (tidak boleh regresi)
- Kalau menambah dependency baru yang butuh setup test/lint tambahan (misal butuh test helper baru), setup itu bagian dari perubahan itu sendiri, bukan "nanti"

## Environment

- Deploy target: VPS milik user, Docker + Nginx Proxy Manager, SSH port 22122, semua port admin bind ke `127.0.0.1`
- Jangan expose port container langsung ke publik — semua lewat Nginx Proxy Manager + `aanNet`

## Status Implementasi Saat Ini

> Checklist ringkas per stage. Untuk detail task granular & checkbox yang aktif diupdate, lihat `TASKS.md`.

- [x] Stage 1 — Scaffold & Database
- [x] Stage 2 — Outline & Bab
- [x] Stage 3 — Generate Konten Bab (Teks + Tabel)
- [x] Stage 4 — Chart & Diagram Rendering
- [x] Stage 5 — Gambar (AI + Upload Manual)
- [ ] Stage 6 — Export DOCX + PDF
- [ ] Stage 7 — Bot Telegram
- [ ] Stage 8 — Deployment
