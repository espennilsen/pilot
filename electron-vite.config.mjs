import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

let gitSha = '';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {}

// Fix Rollup's _interopNamespaceDefault crashing on CJS modules with inherited props
// (e.g. `ws` inherits EventEmitter keys that have no own property descriptors)
function fixInteropPlugin() {
  return {
    name: 'fix-interop-namespace',
    generateBundle(_, bundle) {
      // Make getOwnPropertyDescriptor null-safe in the interop helper
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.code && file.code.includes('_interopNamespaceDefault')) {
          file.code = file.code.replace(
            /const (d\d) = Object\.getOwnPropertyDescriptor\((e\d), (k\d)\);/g,
            'const $1 = Object.getOwnPropertyDescriptor($2, $3); if (!$1) continue;'
          );
        }
      }
    }
  };
}

// Plugin to copy WASM files needed by bundled dependencies
function copyWasmPlugin() {
  return {
    name: 'copy-wasm',
    closeBundle() {
      const wasmSrc = path.resolve(__dirname, 'node_modules/@silvia-odwyer/photon-node/photon_rs_bg.wasm');
      const wasmDest = path.resolve(__dirname, 'out/main/photon_rs_bg.wasm');
      if (fs.existsSync(wasmSrc) && !fs.existsSync(wasmDest)) {
        fs.copyFileSync(wasmSrc, wasmDest);
      }
    }
  };
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@mariozechner/pi-coding-agent',
          '@mariozechner/pi-agent-core',
          '@mariozechner/pi-ai',
          '@mariozechner/pi-tui',
          '@mariozechner/jiti',
        ]
      }),
      fixInteropPlugin(),
      copyWasmPlugin(),
    ],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/main/index.ts')
      },
      rollupOptions: {
        external: ['bufferutil', 'utf-8-validate', '@homebridge/ciao', 'ws']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'electron/preload/index.ts')
      }
    }
  },
  renderer: {
    root: path.resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'src/index.html')
      }
    },
    plugins: [react(), tailwindcss()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __GIT_SHA__: JSON.stringify(gitSha),
    }
  }
});
