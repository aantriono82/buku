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
