<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ApiError } from '../lib/api';

const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const router = useRouter();

async function handleSubmit(): Promise<void> {
  error.value = '';
  loading.value = true;
  try {
    await api.post('/auth/login', { username: username.value, password: password.value });
    router.push('/');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Gagal login.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <h1>Masuk</h1>
    <form @submit.prevent="handleSubmit">
      <label>
        Username
        <input v-model="username" type="text" required autocomplete="username" />
      </label>
      <label>
        Password
        <input v-model="password" type="password" required autocomplete="current-password" />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="loading">{{ loading ? 'Memproses...' : 'Masuk' }}</button>
    </form>
  </div>
</template>

<style scoped>
.login {
  max-width: 320px;
  margin: 40px auto;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  padding: 10px;
  border-radius: 6px;
  border: none;
  background: var(--accent);
  color: white;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #d33;
  font-size: 14px;
}
</style>
