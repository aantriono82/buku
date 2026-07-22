<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';

interface Buku {
  id: number;
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum: string | null;
  status: string;
  created_at: string;
}

const router = useRouter();
const bukuList = ref<Buku[]>([]);
const loadError = ref('');
const needLogin = ref(false);

const form = ref({ judul: '', mapel: '', jenjang: '', kurikulum: '' });
const submitting = ref(false);
const submitError = ref('');

async function loadBuku(): Promise<void> {
  loadError.value = '';
  needLogin.value = false;
  try {
    bukuList.value = await api.get<Buku[]>('/buku');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      needLogin.value = true;
      return;
    }
    loadError.value = err instanceof Error ? err.message : 'Gagal memuat daftar buku.';
  }
}

async function handleSubmit(): Promise<void> {
  submitError.value = '';
  if (!form.value.judul.trim() || !form.value.mapel.trim() || !form.value.jenjang.trim()) {
    submitError.value = 'Judul, mapel, dan jenjang wajib diisi.';
    return;
  }

  submitting.value = true;
  try {
    const buku = await api.post<Buku>('/buku', {
      judul: form.value.judul.trim(),
      mapel: form.value.mapel.trim(),
      jenjang: form.value.jenjang.trim(),
      kurikulum: form.value.kurikulum.trim() || undefined,
    });
    router.push(`/buku/${buku.id}/outline`);
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Gagal membuat buku.';
  } finally {
    submitting.value = false;
  }
}

onMounted(loadBuku);
</script>

<template>
  <div>
    <section>
      <h1>Buat Buku Baru</h1>
      <form class="form-grid" @submit.prevent="handleSubmit">
        <label>
          Judul
          <input v-model="form.judul" type="text" required />
        </label>
        <label>
          Mata Pelajaran
          <input v-model="form.mapel" type="text" required />
        </label>
        <label>
          Jenjang / Kelas
          <input v-model="form.jenjang" type="text" placeholder="mis. SD Kelas 4" required />
        </label>
        <label>
          Kurikulum (opsional)
          <input v-model="form.kurikulum" type="text" placeholder="mis. Kurikulum Merdeka" />
        </label>
        <p v-if="submitError" class="error">{{ submitError }}</p>
        <button type="submit" :disabled="submitting">
          {{ submitting ? 'Membuat...' : 'Buat & Susun Outline' }}
        </button>
      </form>
    </section>

    <section>
      <h2>Buku Tersimpan</h2>
      <p v-if="needLogin">Anda belum login. <RouterLink to="/login">Masuk di sini</RouterLink>.</p>
      <p v-else-if="loadError" class="error">{{ loadError }}</p>
      <ul v-else-if="bukuList.length">
        <li v-for="buku in bukuList" :key="buku.id">
          <RouterLink :to="`/buku/${buku.id}/outline`">{{ buku.judul }}</RouterLink>
          — {{ buku.mapel }} ({{ buku.jenjang }}) · status: {{ buku.status }}
        </li>
      </ul>
      <p v-else>Belum ada buku.</p>
    </section>
  </div>
</template>

<style scoped>
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 420px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

input {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font: inherit;
}

button {
  padding: 10px 16px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
  align-self: flex-start;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #d33;
  font-size: 14px;
}

ul {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
