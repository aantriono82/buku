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

interface BlokChartData {
  chart_type: 'bar' | 'line' | 'pie';
  labels: string[];
  datasets: { label: string; data: number[] }[];
  judul?: string;
}

interface BlokDiagramData {
  mermaid_syntax: string;
  judul?: string;
}

interface BlokGambarData {
  source: 'ai' | 'upload';
  prompt?: string;
  caption?: string;
}

type BlokData = BlokTeksData | BlokTabelData | BlokChartData | BlokDiagramData | BlokGambarData;

interface BlokItem {
  id: number;
  urutan: number;
  tipe: 'teks' | 'tabel' | 'chart' | 'diagram' | 'gambar';
  data: BlokData;
  file_path?: string | null;
  file_url?: string | null;
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

const gambarPrompt = ref<Record<number, string>>({});
const gambarBusy = ref<Record<number, boolean>>({});
const gambarError = ref<Record<number, string>>({});

function isTabelData(data: BlokData): data is BlokTabelData {
  return 'headers' in data;
}

function isGambarData(data: BlokData): data is BlokGambarData {
  return 'source' in data;
}

function promptFor(blok: BlokItem): string {
  if (gambarPrompt.value[blok.id] !== undefined) {
    return gambarPrompt.value[blok.id];
  }
  const data = blok.data as BlokGambarData;
  return data.prompt || '';
}

async function handleRegenerateGambar(blok: BlokItem): Promise<void> {
  const prompt = promptFor(blok).trim();
  gambarBusy.value[blok.id] = true;
  gambarError.value[blok.id] = '';
  try {
    await api.post(`/blok/${blok.id}/gambar/regenerate`, { prompt: prompt || undefined });
    await loadBab();
  } catch (err) {
    gambarError.value[blok.id] = err instanceof ApiError ? err.message : 'Gagal generate gambar AI.';
  } finally {
    gambarBusy.value[blok.id] = false;
  }
}

async function handleUploadGambar(blok: BlokItem, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    return;
  }

  gambarBusy.value[blok.id] = true;
  gambarError.value[blok.id] = '';
  try {
    const formData = new FormData();
    formData.append('gambar', file);
    const res = await fetch(`${API_BASE}/blok/${blok.id}/gambar/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const body: { message?: string } = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(body.message || `HTTP error ${res.status}`);
    }
    await loadBab();
  } catch (err) {
    gambarError.value[blok.id] = err instanceof Error ? err.message : 'Gagal mengunggah gambar.';
  } finally {
    gambarBusy.value[blok.id] = false;
    input.value = '';
  }
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
        <p v-else-if="b.tipe === 'chart'" class="hint">Chart sedang dirender...</p>
        <p v-else-if="b.tipe === 'diagram'" class="hint">Diagram sedang dirender...</p>
        <p v-else-if="b.tipe === 'gambar'" class="hint">Gambar sedang diproses...</p>
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

        <div v-else-if="b.tipe === 'chart' || b.tipe === 'diagram'" class="blok-media">
          <img v-if="b.file_url" :src="b.file_url" :alt="b.tipe" class="blok-img" />
          <p v-else class="hint">Belum ter-render.</p>
        </div>

        <div v-else-if="b.tipe === 'gambar'" class="blok-gambar">
          <img
            v-if="b.file_url"
            :src="b.file_url"
            :alt="isGambarData(b.data) ? b.data.caption : 'gambar'"
            class="blok-img"
          />
          <p v-else class="hint">Belum ada gambar tersimpan untuk blok ini.</p>
          <p v-if="isGambarData(b.data) && b.data.caption" class="caption">{{ b.data.caption }}</p>

          <div class="gambar-controls">
            <label>
              Prompt AI
              <input
                type="text"
                :value="promptFor(b)"
                :disabled="gambarBusy[b.id]"
                placeholder="deskripsi gambar untuk AI image generator"
                @input="gambarPrompt[b.id] = ($event.target as HTMLInputElement).value"
              />
            </label>
            <button type="button" :disabled="gambarBusy[b.id]" @click="handleRegenerateGambar(b)">
              {{ gambarBusy[b.id] ? 'Memproses...' : 'Generate Ulang (AI)' }}
            </button>
            <label class="upload-label">
              Upload manual
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                :disabled="gambarBusy[b.id]"
                @change="handleUploadGambar(b, $event)"
              />
            </label>
          </div>
          <p v-if="gambarError[b.id]" class="error">{{ gambarError[b.id] }}</p>
        </div>
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

.blok-img {
  max-width: 100%;
  border-radius: 6px;
  display: block;
}

.blok-gambar .caption {
  font-size: 13px;
  color: var(--text);
  margin: 6px 0;
  font-style: italic;
}

.gambar-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
  margin-top: 10px;
}

.gambar-controls label {
  flex: 1 1 220px;
}

.upload-label input[type='file'] {
  padding: 6px 0;
  border: none;
}
</style>
