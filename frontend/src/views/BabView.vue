<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { API_BASE, api, ApiError } from '../lib/api';
import { extractSseDataLines } from '../lib/sse';

interface BlokTeksData {
  markdown: string;
}

interface BlokTabelData {
  headers: string[];
  rows: string[][];
}

interface BlokItem {
  id: number;
  urutan: number;
  tipe: 'teks' | 'tabel';
  data: BlokTeksData | BlokTabelData;
}

interface BabDetail {
  id: number;
  buku_id: number;
  urutan: number;
  judul: string;
  ringkasan: string | null;
  status: string;
  blok: BlokItem[];
}

interface AiProvider {
  id: string;
  label: string;
  defaultModel: string;
}

const route = useRoute();
const babId = Number(route.params.id);

const bab = ref<BabDetail | null>(null);
const loadError = ref('');

const providers = ref<AiProvider[]>([]);
const providersError = ref('');
const selectedProvider = ref('');
const selectedModel = ref('');

const streaming = ref(false);
const streamText = ref('');
const generateError = ref('');
const liveBlok = ref<BlokItem[]>([]);

function isTabelData(data: BlokTeksData | BlokTabelData): data is BlokTabelData {
  return 'headers' in data;
}

async function loadBab(): Promise<void> {
  loadError.value = '';
  try {
    bab.value = await api.get<BabDetail>(`/bab/${babId}`);
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.message : 'Gagal memuat bab.';
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
  liveBlok.value = [];
  streaming.value = true;

  try {
    const res = await fetch(`${API_BASE}/bab/${babId}/generate`, {
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
          const parsed = JSON.parse(event) as {
            chunk?: string;
            blok?: BlokItem;
            done?: boolean;
            error?: string;
          };
          if (parsed.chunk) {
            streamText.value += parsed.chunk;
          }
          if (parsed.blok) {
            liveBlok.value.push(parsed.blok);
          }
          if (parsed.error) {
            generateError.value = parsed.error;
          }
        } catch {
          // lewati event yang belum lengkap/tidak valid
        }
      }
    }

    await loadBab();
  } catch (err) {
    generateError.value = err instanceof Error ? err.message : 'Gagal generate konten bab.';
    await loadBab();
  } finally {
    streaming.value = false;
  }
}

onMounted(() => {
  loadBab();
  loadProviders();
});
</script>

<template>
  <div v-if="loadError" class="error">{{ loadError }}</div>
  <div v-else-if="bab">
    <RouterLink :to="`/buku/${bab.buku_id}/outline`">&larr; Kembali ke outline</RouterLink>
    <h1>{{ bab.judul }}</h1>
    <p v-if="bab.ringkasan" class="meta">{{ bab.ringkasan }}</p>
    <p class="meta">Status: {{ bab.status }}</p>

    <section>
      <p v-if="providersError" class="error">{{ providersError }}</p>
      <p v-else-if="!providers.length" class="hint">
        Belum ada provider AI teks yang dikonfigurasi di server. Isi salah satu API key di
        <code>backend/.env</code> lalu restart backend.
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
        {{
          streaming ? 'Menulis konten bab...' : bab.blok.length ? 'Generate Ulang Konten Bab' : 'Generate Konten Bab'
        }}
      </button>
      <p v-if="generateError" class="error">{{ generateError }}</p>
      <pre v-if="streaming && streamText" class="stream-preview">{{ streamText }}</pre>
    </section>

    <section v-if="streaming || liveBlok.length">
      <h2>Blok yang sedang dihasilkan</h2>
      <div v-for="b in liveBlok" :key="`live-${b.id}`" class="blok">
        <div v-if="b.tipe === 'teks'" class="blok-teks">{{ (b.data as BlokTeksData).markdown }}</div>
        <table v-else-if="isTabelData(b.data)" class="blok-tabel">
          <thead>
            <tr>
              <th v-for="(h, i) in (b.data as BlokTabelData).headers" :key="i">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in (b.data as BlokTabelData).rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-else-if="bab.blok.length">
      <h2>Konten Bab Tersimpan</h2>
      <div v-for="b in bab.blok" :key="b.id" class="blok">
        <div v-if="b.tipe === 'teks'" class="blok-teks">{{ (b.data as BlokTeksData).markdown }}</div>
        <table v-else-if="isTabelData(b.data)" class="blok-tabel">
          <thead>
            <tr>
              <th v-for="(h, i) in (b.data as BlokTabelData).headers" :key="i">{{ h }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in (b.data as BlokTabelData).rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <p v-else class="hint">Bab ini belum punya konten. Klik "Generate Konten Bab" untuk mulai.</p>
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

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

input,
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

.error {
  color: #d33;
  font-size: 14px;
}

.blok {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  margin: 12px 0;
}

.blok-teks {
  white-space: pre-wrap;
  line-height: 1.6;
}

.blok-tabel {
  border-collapse: collapse;
  width: 100%;
}

.blok-tabel th,
.blok-tabel td {
  border: 1px solid var(--border);
  padding: 6px 10px;
  text-align: left;
  font-size: 14px;
}
</style>
