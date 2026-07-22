<script setup lang="ts"></script>

<template>
  <div id="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand">Buku Generator</RouterLink>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.topbar {
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
}

.brand {
  font-weight: 600;
  font-size: 18px;
  color: var(--text-h);
  text-decoration: none;
}

main {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px;
}
</style>
