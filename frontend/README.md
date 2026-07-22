# buku-generator frontend

Vue 3 + Vite + TypeScript. Lihat `../planning.md` dan `../CLAUDE.md` untuk konteks project.

## Dev

```bash
npm install
npm run dev      # http://localhost:5183, proxy /api ke backend
```

Backend harus jalan duluan di port 3011 (lihat `../backend/README` / `.env.example`).

## Scripts

- `npm run lint` / `npm run lint:fix` — ESLint + Prettier
- `npm run test` — Vitest
- `npm run build` — type-check (`vue-tsc`) + build produksi
