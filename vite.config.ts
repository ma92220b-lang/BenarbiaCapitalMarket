import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base GitHub Pages quand on build en CI (GITHUB_PAGES=true), sinon racine
const base =
  process.env.GITHUB_PAGES === 'true'
    ? '/BenarbiaCapitalMarket/'
    : '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    host: true,
    // GitHub Codespaces / Gitpod : autoriser les domaines de port-forwarding
    allowedHosts: true
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 }
});
