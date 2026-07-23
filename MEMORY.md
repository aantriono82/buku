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

### [2026-07-23] Stage 5 selesai — imageService, GeminiImageProvider, endpoint upload/regenerate gambar
**Konteks**: melengkapi blok `gambar` yang skemanya sudah didefinisikan sejak `planning.md` §3 tapi belum
diimplementasikan di Stage 3/4 (waktu itu belum ada cara generate/upload-nya).
**Keputusan/temuan**:
- `imageService` dibuat **fungsional** (`generateAI()`, `saveUpload()` sebagai fungsi biasa di
  `backend/src/services/image-service.ts`), bukan class `ImageService` seperti sketsa di `planning.md` §6 —
  supaya konsisten dengan pola `chartRenderService`/`diagramRenderService` yang sudah ada (fungsi + options object,
  gampang di-mock di test). `ImageProvider` tetap interface seperti planning.md, `GeminiImageProvider` tetap class
  (masuk akal karena menyimpan state apiKey/model), diimplementasikan di file terpisah
  `backend/src/services/gemini-image-provider.ts` (pola sama seperti pemisahan `ai-providers.ts`/`ai-text-client.ts`).
- **API key Gemini Image reuse `GOOGLE_AI_API_KEY`** (env var yang sama dipakai provider teks "Google AI" di
  Stage 2/3), bukan bikin env var terpisah — satu API key Google AI Studio memang mendukung model teks maupun
  gambar. Config baru: `IMAGE_PROVIDER` (default `'gemini'`, sesuai `planning.md` §6 "bisa diganti via env var").
  Kalau `IMAGE_PROVIDER` bukan `'gemini'` atau `GOOGLE_AI_API_KEY` kosong, `imageProvider` di `index.ts` jadi
  `undefined` — endpoint regenerate akan balas 400, dan auto-generate blok gambar `source: "ai"` saat
  `POST /api/bab/:id/generate` gagal senyap (dicatat ke stderr, `file_path` tetap null, tidak menggagalkan bab
  lain) — sama seperti pola kegagalan render chart/diagram di Stage 4.
- **[Update 2026-07-23, sesi lanjutan] Bentuk request `gemini-image-provider.ts` sudah dites ke API asli
  pakai `GOOGLE_AI_API_KEY` user (`npx tsx --env-file=.env`, panggil `GeminiImageProvider.generate()` langsung,
  bukan lewat unit test) — request `generateContent` + `generationConfig.responseModalities: ["IMAGE"]` ke model
  `gemini-3-pro-image-preview` diterima dan diproses server (bukan 400/404), TAPI balasannya `429
  RESOURCE_EXHAUSTED`: "Quota exceeded ... model: gemini-3-pro-image, limit: 0" untuk
  `generate_content_free_tier_requests` dan `generate_content_free_tier_input_token_count`. Kesimpulan: format
  request/model ID yang diimplementasikan **sudah benar** (tervalidasi API key & endpoint-nya dikenali Google),
  blocker-nya murni **billing/kuota** — project Google AI Studio yang terhubung ke key ini masih free tier dan
  model `gemini-3-pro-image` memang limit 0 di free tier (butuh billing aktif di Google Cloud/AI Studio project
  terkait). Belum bisa validasi bentuk response sukses (field `inlineData` dkk) karena belum pernah dapat
  response 200 sungguhan — kalau setelah billing diaktifkan ternyata field response beda dari yang
  diasumsikan, perbaiki `gemini-image-provider.ts` saja, pemanggil tidak perlu berubah (semua lewat interface
  `ImageProvider`).
- `contentService` diperluas dengan tipe blok `gambar` (`BlokGambar`/`GambarData`), AI diminta mengusulkan blok
  ini HANYA kalau ilustrasi benar-benar membantu (sama pola "jangan paksakan" seperti chart/diagram Stage 4) —
  otomatis dirender lewat `imageService.generateAI()` di `routes/bab.ts` `renderVisualBlok` kalau `source: "ai"`,
  dilewati kalau `source: "upload"` (guru upload manual belakangan).
- Endpoint `POST /api/blok/:id/gambar/upload` (multipart, `multer.memoryStorage()`, validasi mimetype
  png/jpeg/webp, limit 8MB) dan `POST /api/blok/:id/gambar/regenerate` (pakai `prompt` tersimpan di `data_json`
  kalau body tidak override) dibuat di file baru `backend/src/routes/gambar.ts`, mounted di `/api/blok`. Upload
  me-replace `data_json.source` jadi `"upload"`; regenerate meng-update jadi `"ai"` + prompt yang dipakai.
- Ditambahkan (di luar checklist eksplisit Stage 5) static serving `/api/storage` → `storageDir` (di belakang
  `requireAuth`) + field `file_url` per blok di response `GET /api/bab/:id` (helper `toFileUrl()` di
  `routes/bab.ts`, diekspor supaya dipakai ulang di `routes/gambar.ts`) — tanpa ini chart/diagram/gambar yang
  sudah dirender sejak Stage 4 tidak bisa ditampilkan `<img>` di browser sama sekali. `BabView.vue` sekarang
  render `<img :src="file_url">` untuk tipe chart/diagram/gambar, plus form prompt+upload per blok gambar.
- Validasi end-to-end (generate AI asli, upload manual asli lewat browser) **belum dites** — sandbox ini tidak
  ada `GOOGLE_AI_API_KEY` asli dan tidak bisa jalankan browser headless (lihat entri 2026-07-22 soal
  Chromium/Playwright macet). Validasi dilakukan lewat unit test (`image-service.test.ts`,
  `gemini-image-provider.test.ts` dengan mock fetch, `bab.test.ts`/`gambar.test.ts` dengan mock
  `imageService.generateAI`/`saveUpload` via supertest, termasuk kasus upload file asli lewat
  `.attach()` dan validasi mimetype) — 138 test backend + semua test frontend tetap lulus, `npm run lint` bersih.
**Dampak**: `backend/src/services/image-service.ts`, `gemini-image-provider.ts` (baru), `content-service.ts`,
`routes/bab.ts`, `routes/gambar.ts` (baru), `app.ts`, `index.ts`, `config.ts`, `.env.example`, dependency
`multer`/`@types/multer` baru, `frontend/src/views/BabView.vue`.

### [2026-07-23] Stage 4 selesai — chartRenderService, diagramRenderService, wiring ke `POST /api/bab/:id/generate`
**Konteks**: lanjutan Stage 3, menambahkan render chart (chartjs-node-canvas) dan diagram (mermaid-cli) untuk blok
yang sudah bisa dihasilkan `contentService` sejak stage ini (sebelumnya dibatasi cuma teks & tabel).
**Keputusan/temuan**:
- `chartjs-node-canvas` butuh native dep `canvas` (binding cairo/pango). Cek dulu sebelum asumsi bakal gagal di
  environment CI/VPS nanti: `npm install chartjs-node-canvas chart.js` di sandbox ini **berhasil pakai prebuilt
  binary** (tidak compile dari source) meski `pkg-config --exists cairo` bilang cairo tidak terpasang di OS level
  — jadi tidak perlu install `libcairo2-dev` dkk secara eksplisit di Dockerfile backend (Stage 8) kecuali platform
  target beda arch/libc dari yang didukung binary prebuilt `node-canvas` (linux x64 glibc). Kalau nanti build image
  Docker gagal di step ini, itu petunjuk platform image base beda (mis. Alpine musl vs glibc) — ganti base image
  Debian/Ubuntu dulu sebelum coba compile dari source.
- `@mermaid-js/mermaid-cli` men-download Chromium via Puppeteer saat `npm install` — di sandbox ini **berhasil**
  (beda dari kejadian `playwright install` yang macet, dicatat di entri 2026-07-22), tapi makan waktu >2 menit
  (proses sempat auto-pindah ke background job). **Kalau install lain kali terasa macet, tunggu lebih lama dulu
  sebelum menyimpulkan jaringan diblokir** — kasus playwright yang gagal itu beda paket/CDN dari yang dipakai
  puppeteer/mermaid-cli.
- `renderChart()`/`renderDiagram()` divalidasi dengan **benar-benar merender** (bukan mock) di unit test masing-
  masing — beda dari instruksi "mock dependency eksternal" di `AGENT_PROMPT.md`, karena kedua ini bukan pemanggilan
  API jaringan atau proses `child_process` yang mahal/tidak deterministik (chartjs-node-canvas: library lokal murni,
  cepat; mermaid-cli: memang `child_process`, tapi divalidasi juga jalan real lewat smoke test manual — lihat di
  bawah). Konsisten dengan instruksi: "test boleh fokus ke logic, dependency eksternal di-mock" — mmdc DI-mock di
  `diagram-render-service.test.ts` lewat parameter `spawnImpl` yang di-inject (bukan mock module-level), supaya
  test tetap deterministik/cepat tanpa Chromium beneran, tapi kode produksi tetap bisa dipanggil `spawn` asli.
- Di `routes/bab.ts`, render chart/diagram dilakukan **sinkron di dalam request SSE** (`await Promise.all(...)`
  setelah blok tersimpan ke DB, sebelum event `done` dikirim) — bukan job async terpisah/background worker asli,
  meski `planning.md` §4 menyebut "dirender di background". Diinterpretasikan sebagai "server-side" (bukan
  di-render di client), bukan literal async job queue, karena bab generate memang sudah satu request panjang dan
  tidak ada infrastruktur job queue di project ini. **Kalau nanti render chart/diagram jadi lambat/blocking terlalu
  lama untuk bab dengan banyak chart, ini titik yang perlu direvisi jadi job queue/worker asli** — belum terjadi di
  pemakaian sekarang.
- **Kegagalan render satu blok chart/diagram TIDAK menggagalkan seluruh generate bab** — `renderVisualBlok()`
  nangkep error-nya sendiri (log ke `console.error`), `file_path` tetap `null`, bab tetap `status = 'selesai'`
  kalau AI-nya sendiri berhasil. Alasan: blok teks/tabel di bab yang sama tetap valid dan berharga meski satu chart
  gagal dirender (mis. data chart dari AI aneh/tidak lolos validasi `isValidChartData`) — tidak masuk akal
  menghapus seluruh hasil kerja AI karena satu visualisasi gagal.
- `STORAGE_DIR` (default `./data/storage`) ditambahkan sebagai config baru (`config.ts`, `.env.example`,
  `AppOptions.storageDir` di `app.ts`) — subfolder `chart/` dan `diagram/` dibuat otomatis oleh masing-masing
  service (`fs.mkdir(..., { recursive: true })`). Sudah masuk `.gitignore` lewat pola `backend/data/` yang sudah
  ada dari Stage 1.
- `GET /api/bab/:id` sekarang menyertakan `file_path` per blok (sebelumnya cuma `id/urutan/tipe/data`) supaya
  frontend/klien lain tahu status render chart/diagram. Field ini tidak dipakai UI di stage ini (Stage 4 tidak ada
  task frontend di `TASKS.md`), tapi datanya sudah tersedia dari backend.
- Skema `data_json` untuk `tipe: chart` dan `tipe: diagram` **persis mengikuti** yang sudah didefinisikan di
  `planning.md` §3 (tidak ada penyimpangan): chart = `{chart_type, labels, datasets, judul?}`, diagram =
  `{mermaid_syntax, judul?}`. Validasi (`isValidChartData`/`isValidDiagramData`) ditaruh di
  `chart-render-service.ts`/`diagram-render-service.ts` (bukan di `content-service.ts`) dan di-reuse oleh
  `content-service.ts` untuk parsing blok dari respons AI — satu sumber kebenaran validasi dipakai dua tempat
  (parsing & rendering), supaya blok yang lolos parse dijamin juga valid untuk dirender.
- Validasi end-to-end dilakukan lewat test integrasi sekali pakai (supertest, boot `createApp()` beneran, mock
  cuma `generateText` di level paling luar/`ai-text-client.js` supaya `contentService` + `chartRenderService` +
  `diagramRenderService` semua jalan asli) — konfirmasi PNG (`89504e47` magic bytes) dan SVG (`<svg`) benar-benar
  ditulis ke `STORAGE_DIR` sementara (`os.tmpdir()`), lalu file test dihapus (bukan bagian dari suite permanen,
  cuma smoke check manual sesi ini — tidak perlu diulang kecuali curiga regresi).
**Dampak**: file baru `backend/src/services/chart-render-service.ts`, `diagram-render-service.ts`, test-nya;
`content-service.ts` (tipe `BlokChart`/`BlokDiagram`, parsing, prompt) & test-nya; `routes/bab.ts`
(`renderVisualBlok`, `BabRoutesOptions.storageDir`) & test-nya; `config.ts`/`.env.example`/`app.ts`/`index.ts`
(`STORAGE_DIR`). Dependency baru: `chartjs-node-canvas`, `chart.js`, `@mermaid-js/mermaid-cli`. Test: 104 test
backend lulus (13 baru: 7 chart-render, 6 diagram-render, +4 di content-service, +2 di bab routes — angka tidak pas
13 karena beberapa test lama disesuaikan, bukan ditambah), lint (`eslint` + `prettier --check`) dan `tsc --noEmit`
bersih.

### [2026-07-23] Stage 3 selesai — contentService, `POST /api/bab/:id/generate`, halaman detail bab
**Konteks**: implementasi generate konten bab (teks + tabel) mengikuti pola yang sudah terbukti di Stage 2
(`outlineService` + SSE + multi-provider `generateText()`), termasuk fix half-close SSE yang sudah didokumentasikan.
**Keputusan/temuan**:
- "Stream per blok" tidak berarti AI mengirim tiap blok sebagai completion terpisah — `generateText()` (dan API
  provider manapun) hanya bisa stream *token/delta teks mentah* dari satu completion JSON utuh (sama seperti
  outline). Jadi `contentService.generateContent()` tetap minta satu respons JSON penuh (`{"blok": [...]}`),
  di-stream sebagai `chunk` event mentah untuk indikator "sedang menulis" (sama seperti outline), lalu setelah
  parse selesai, endpoint mengirim tiap blok hasil parse sebagai event SSE `blok` terpisah **satu per satu secara
  berurutan** (bukan sekaligus), baru diikuti event `done`. Ini yang membuat frontend terlihat "live streaming per
  blok" meski secara teknis AI-nya tidak benar-benar stream terstruktur. Kalau nanti butuh streaming JSON
  incremental yang sesungguhnya (parse partial JSON saat masih di-generate), itu perubahan besar di
  `ai-text-client.ts` — belum diperlukan untuk Stage 3.
- Prompt `contentService` **sengaja dibatasi hanya tipe `teks` dan `tabel`** (system prompt eksplisit menyebut
  "Tipe blok yang boleh dipakai hanya teks dan tabel") — sesuai `AGENT_PROMPT.md` Stage 3 yang bilang chart/diagram
  "menyusul di stage berikutnya". Prompt akan di-extend di Stage 4 untuk chart/diagram, bukan didesain ulang.
- `maxTokens` untuk `generateContent()` di-set 8000 (vs default 4000 di `generateText()`/outline) karena isi satu
  bab jauh lebih panjang dari sekadar daftar judul+ringkasan outline. Belum dikalibrasi dengan generate asli ke
  provider sungguhan (lihat "Hal yang Masih Perlu Divalidasi").
- `POST /api/bab/:id/generate` **replace-all** konten lama tiap kali digenerate ulang (delete semua `konten_blok`
  milik bab itu dalam transaksi, lalu insert ulang) — konsisten dengan strategi `PUT /api/buku/:id/outline` di
  Stage 2. Belum ada mekanisme "regenerate blok tertentu saja" — kalau guru cuma mau perbaiki satu blok, itu
  butuh endpoint `PUT /api/bab/:id/blok/:blokId` (sudah ada di `planning.md` §5, belum diimplementasikan, dicatat
  di `TASKS.md` ad-hoc).
- Field `bab.status` diupdate di 3 titik sesuai instruksi `CLAUDE.md`: `generating` di awal request (sebelum
  panggil AI), `selesai` setelah blok berhasil disimpan ke DB, `error` di catch block (termasuk saat abort akibat
  client disconnect asli).
- `GET /api/bab/:id` (detail bab + blok, `data_json` di-parse jadi objek) diimplementasikan lebih awal sebagai
  ad-hoc task, bukan cuma endpoint generate — dibutuhkan halaman `BabView.vue` untuk load ulang state saat
  pertama dibuka/refresh, pola sama seperti `GET /api/buku/:id` di Stage 2.
- Frontend `BabView.vue` mengikuti pola `OutlineView.vue` persis: `fetch()` manual + `reader.getReader()` (bukan
  `EventSource`, karena butuh POST dengan body), parsing pakai `extractSseDataLines()` yang sudah ada. Blok teks
  dirender sebagai `<div>` `white-space: pre-wrap` (belum ada markdown renderer library — `data.markdown` masih
  ditampilkan sebagai teks mentah, bukan di-render jadi HTML; kalau butuh rendering markdown asli, itu keputusan
  terpisah, cek dulu ke user sebelum tambah dependency markdown parser). Blok tabel dirender sebagai `<table>`
  HTML biasa.
**Dampak**: file baru `backend/src/services/content-service.ts`, `backend/src/routes/bab.ts`,
`frontend/src/views/BabView.vue`; `app.ts` (mount `/api/bab`), `router/index.ts` (route `/bab/:id`),
`OutlineView.vue` (daftar bab tersimpan dengan link ke halaman detail). Test: 85 test backend lulus (13 baru untuk
`content-service`, 9 baru untuk `bab` routes), typecheck (`vue-tsc -b`) dan lint frontend+backend bersih. Validasi
end-to-end dilakukan lewat `curl` ke dev server (login → buat buku → simpan outline → `GET /api/bab/:id` blok
kosong → `POST /api/bab/:id/generate` tanpa provider/key kosong → 400 sesuai ekspektasi, sama seperti pola
validasi Stage 2 karena tidak ada API key text provider asli yang dikonfigurasi di sandbox ini).

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
- **Billing/kuota Google AI Studio project milik user perlu diaktifkan** supaya model `gemini-3-pro-image` bisa
  dipakai — dites langsung ke API asli tanggal 2026-07-23, request format diterima Google (bukan 400/404) tapi
  balik `429 RESOURCE_EXHAUSTED` karena kuota free tier untuk model ini = 0. Lihat entri Stage 5 di atas untuk
  detail. Setelah billing aktif, perlu tes ulang untuk memvalidasi bentuk response sukses (field `inlineData`
  dkk di `gemini-image-provider.ts` masih asumsi, belum pernah lihat response 200 sungguhan).
- Generate blok gambar AI saat ini **blocking di dalam request SSE** `POST /api/bab/:id/generate`, sama seperti
  chart/diagram (lihat entri Stage 4/5 di atas) — kalau AI image generation lambat (beberapa detik per gambar)
  dan sebuah bab punya banyak blok gambar sekaligus, ini bisa menambah signifikan waktu tunggu sebelum event
  `done` — belum diukur karena belum pernah dites ke API asli.
- Ukuran final Docker image backend setelah LibreOffice + Chromium (mermaid-cli) ditambahkan — apakah perlu dipisah jadi service tersendiri
- Estimasi waktu generate 1 bab penuh untuk kalibrasi timeout SSE
- Prompt engineering untuk menentukan kapan materi "layak" divisualisasikan sebagai chart/diagram vs cukup teks —
  instruksi "HANYA bila cocok, jangan paksakan" sudah **terbukti bekerja untuk DeepSeek** (lihat update
  2026-07-23 di bawah: AI menyisipkan gambar/tabel/diagram hanya di bagian relevan, tidak memaksakan chart kalau
  tidak ada data numerik yang cocok). Belum dites ke provider lain (OpenCode Zen, Google AI, Anthropic, OpenAI) —
  kemungkinan perilaku selektif ini bisa beda antar model/provider.
- Waktu render chart/diagram saat ini **blocking di dalam request SSE** `POST /api/bab/:id/generate` (lihat entri
  Stage 4 di atas) — untuk 1-2 chart/diagram per bab harusnya masih cepat (render manual di sandbox ini < 1 detik
  per chart, mermaid-cli sedikit lebih lambat karena boot Chromium tiap panggilan), tapi kalau AI ternyata
  menghasilkan banyak chart/diagram sekaligus dalam satu bab, ini bisa menambah signifikan waktu tunggu SSE
  sebelum event `done` — belum diukur dengan bab yang benar-benar berisi banyak visualisasi
- **[Update 2026-07-23] Jalur `generateText()` untuk DeepSeek sudah dites end-to-end ke API asli dan berhasil**
  (`GeminiImageProvider`-style test pakai `npx tsx --env-file=.env`, bukan cuma unit test mock): `generateText()`
  polos, `outlineService.generateOutline()` (5 bab valid ter-generate & ter-parse), dan
  `contentService.generateContent()` (bab "Rantai Makanan..." IPA SD, hasil 8 blok: teks/gambar/tabel/diagram
  campur, JSON ter-parse tanpa error) semuanya sukses pakai provider `deepseek` + model `deepseek-chat` dan
  `response_format: json_object`. **AI terbukti selektif** menyisipkan blok gambar/tabel/diagram hanya di bagian
  yang relevan (tidak dipaksakan di tiap bab/paragraf) — prompt "HANYA bila cocok, jangan paksakan" di Stage 4/5
  bekerja sesuai harapan untuk DeepSeek. Jalur OpenCode Zen, Google AI, Anthropic, OpenAI masih belum dites ke API
  asli (belum ada key valid untuk provider-provider itu) — base URL & format request disalin dari `rpp-generator`
  yang sudah terbukti jalan di sana, tapi kalau ada provider yang gagal aneh (bukan sekadar 401 auth), cek dulu
  apakah `response_format: json_object` didukung provider itu (`jsonMode` bisa di-set false kalau tidak didukung).
- **[Update 2026-07-23] `maxTokens: 8000` di `contentService.generateContent()` terbukti cukup** untuk DeepSeek
  pada tes bab IPA SD di atas — rawResponse hanya ~5000 karakter (~1200-an token), jauh di bawah batas. Belum
  dites untuk bab yang jauh lebih padat (mis. bab dengan banyak sub-materi + beberapa tabel besar sekaligus) —
  kalau ternyata terpotong di pemakaian nyata (`parseContentResponse` throw "bukan JSON yang valid"),
  pertimbangkan naikkan `maxTokens` atau ubah strategi jadi multi-turn (generate per-bagian bab).
