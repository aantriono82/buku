import { createRouter, createWebHistory } from 'vue-router';
import BukuListView from '../views/BukuListView.vue';
import OutlineView from '../views/OutlineView.vue';
import BabView from '../views/BabView.vue';
import LoginView from '../views/LoginView.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', name: 'buku-list', component: BukuListView },
    { path: '/buku/:id/outline', name: 'buku-outline', component: OutlineView, props: true },
    { path: '/bab/:id', name: 'bab-detail', component: BabView, props: true },
  ],
});

export default router;
