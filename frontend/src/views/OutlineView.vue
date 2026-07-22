<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { API_BASE, api, ApiError } from '../lib/api';
import { extractSseDataLines } from '../lib/sse';

interface BabItem {
  judul: string;
  ringkasan: string;
}

interface BabRow {
  id: number;
  urutan: number;
  judul: string;
  ringkasan: string | null;
  status: string;
}

interface BukuDetail {
  id: number;
  judul: string;
  mapel: string;
  jenjang: string;
  kurikulum: string | null;
  status: string;
  bab: BabRow[];
}

interface AiProvider {
  id: string;
  label: string;
  defaultModel: string;
}

const route = useRoute();
const bukuId = Number(route.params.id);

const buku = ref<BukuDetail | null>(null);
const loadError = ref('');

const providers = ref<AiProvider[]>([]);
const providersError = ref('');
const selectedProvider = ref('');
const selectedModel = ref('');

const streaming = ref(false);
const streamText = ref('');
const generateError = ref('');

const babDraft = ref<BabItem[]>([]);

const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref(false);

async function loadBuku(): Promise<void> {
  loadError.value = '';
  try {
    buku.value = await api.get<BukuDetail>(`/buku/${bukuId}`);
    if (buku.value.bab.length) {
      babDraft.value = buku.value.bab.map((b) => ({ judul: b.judul, ringkasan: b.ringkasan || '' }));
    }
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'Gagal memuat buku.';
  }
}

async function loadProviders(): Promise<void> {
  providersError.value = '';
  try {
    providers.value = await api.get<AiProvider[]>('/ai-providers');
    if (providers.value.length) {
      selectedProvider.value = providers.value[0].id;
      selectedModel.value = providers.value[0].defaultModel;
    }
  } catch (err) {
    providersError.value = err instanceof ApiError ? err.message : 'Gagal memuat daftar provider AI.';
  }
}

function handleProviderChange(): void {
  const provider = providers.value.find((p) => p.id === selectedProvider.value);
  selectedModel.value = provider?.defaultModel || '';
}

async function handleGenerate(): Promise<void> {
  generateError.value = '';
  streamText.value = '';
  streaming.value = true;
  saveSuccess.value = false;

  try {
    const res = await fetch(`${API_BASE}/buku/${bukuId}/outline/generate`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: selectedProvider.value, model: selectedModel.value }),
    });

    if (!res.ok || !res.body) {
      const body: { message?: string } = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(body.message || `HTTP error ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const { events, remainder } = extractSseDataLines(buffer);
      buffer = remainder;

      for (const event of events) {
        try {
          const parsed = JSON.parse(event) as { chunk?: string; done?: boolean; bab?: BabItem[]; error?: string };
          if (parsed.chunk) {
            streamText.value += parsed.chunk;
          }
          if (parsed.error) {
            generateError.value = parsed.error;
          }
          if (parsed.done && parsed.bab) {
            babDraft.value = parsed.bab.map((b) => ({ judul: b.judul, ringkasan: b.ringkasan }));
          }
        } catch {
          // lewati event yang belum lengkap/tidak valid
        }
      }
    }
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : 'Gagal generate outline.';
  } finally {
    streaming.value = false;
  }
}

function addBab(): void {
  babDraft.value.push({ judul: '', ringkasan: '' });
}

function removeBab(index: number): void {
  babDraft.value.splice(index, 1);
}

async function handleSave(): Promise<void> {
  saveError.value = '';
  saveSuccess.value = false;

  if (!babDraft.value.length || babDraft.value.some((b) => !b.judul.trim())) {
    saveError.value = 'Setiap bab wajib punya judul, minimal 1 bab.';
    return;
  }

  saving.value = true;
  try {
    await api.put(`/buku/${bukuId}/outline`, { bab: babDraft.value });
    saveSuccess.value = true;
    await loadBuku();
  } catch (err) {
    saveError.value = err instanceof ApiError ? err.message : 'Gagal menyimpan outline.';
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadBuku();
  loadProviders();
});
</script>

<template>
  <div v-if="loadError" class="error">{{ loadError }}</div>
  <div v-else-if="buku">
    <h1>{{ buku.judul }}</h1>
    <p class="meta">
      {{ buku.mapel }} · {{ buku.jenjang }}
      <span v-if="buku.kurikulum">· {{ buku.kurikulum }}</span>
    </p>
    <p class="meta">Status: {{ buku.status }}</p>

    <section>
      <p v-if="providersError" class="error">{{ providersError }}</p>
      <p v-else-if="!providers.length" class="hint">
        Belum ada provider AI teks yang dikonfigurasi di server. Isi salah satu API key di
        <code>backend/.env</code> (mis. <code>OPENROUTER_API_KEY</code>, <code>GOOGLE_AI_API_KEY</code>) lalu restart
        backend.
      </p>
      <div v-else class="provider-picker">
        <label>
          Provider AI
          <select v-model="selectedProvider" @change="handleProviderChange">
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
        </label>
        <label>
          Model
          <input v-model="selectedModel" type="text" placeholder="nama model" />
        </label>
      </div>

      <button type="button" :disabled="streaming || !selectedProvider" @click="handleGenerate">
        {{ streaming ? 'Menyusun outline...' : 'Generate Outline dengan AI' }}
      </button>
      <p v-if="generateError" class="error">{{ generateError }}</p>
      <pre v-if="streaming || streamText" class="stream-preview">{{ streamText }}</pre>
    </section>

    <section v-if="babDraft.length">
      <h2>Outline Bab (bisa diedit sebelum disimpan)</h2>
      <div v-for="(b, idx) in babDraft" :key="idx" class="bab-row">
        <label>
          Judul Bab {{ idx + 1 }}
          <input v-model="b.judul" type="text" required />
        </label>
        <label>
          Ringkasan
          <textarea v-model="b.ringkasan" rows="2"></textarea>
        </label>
        <button type="button" class="link-button" @click="removeBab(idx)">Hapus bab ini</button>
      </div>
      <button type="button" class="secondary" @click="addBab">+ Tambah Bab</button>

      <p v-if="saveError" class="error">{{ saveError }}</p>
      <p v-if="saveSuccess" class="success">Outline tersimpan.</p>
      <button type="button" :disabled="saving" @click="handleSave">
        {{ saving ? 'Menyimpan...' : 'Simpan Outline' }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.meta {
  color: var(--text);
  font-size: 14px;
  margin: 4px 0;
}

.hint {
  font-size: 14px;
  color: var(--text);
  background: var(--code-bg);
  padding: 10px 12px;
  border-radius: 6px;
}

.provider-picker {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.provider-picker label {
  flex: 1 1 200px;
}

.stream-preview {
  white-space: pre-wrap;
  background: var(--code-bg);
  padding: 12px;
  border-radius: 6px;
  max-height: 240px;
  overflow-y: auto;
  font-size: 13px;
}

.bab-row {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

input,
textarea,
select {
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
  margin-top: 8px;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

button.secondary {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-h);
}

button.link-button {
  background: none;
  color: #d33;
  padding: 0;
  align-self: flex-start;
  margin-top: 0;
}

.error {
  color: #d33;
  font-size: 14px;
}

.success {
  color: #2a8;
  font-size: 14px;
}
</style>
