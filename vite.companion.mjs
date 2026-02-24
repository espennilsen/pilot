/**
 * Standalone Vite config to build ONLY the renderer bundle for the companion server.
 *
 * In dev mode the Electron window loads from Vite's dev server (HMR),
 * but the companion HTTPS server always serves from `out/renderer/`.
 * This config lets us rebuild just the renderer quickly before starting dev,
 * so companion clients never run stale code.
 *
 * Usage:  npx vite build -c vite.companion.mjs
 */
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {}

export default defineConfig({
  root: path.resolve(__dirname, 'src'),
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  build: {
    outDir: path.resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.html'),
    },
  },
});
