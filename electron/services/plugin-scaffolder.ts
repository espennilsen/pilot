import { existsSync, mkdirSync, writeFileSync } from 'fs';
import type { ScaffoldResult } from '../../shared/types';
import os from 'node:os';
import { join, resolve } from 'path';
import { normalizePath } from '../utils/paths';

const PACKAGE_JSON_TEMPLATE = `{
  "name": "{{NAME}}",
  "version": "1.0.0",
  "description": "{{DESCRIPTION}}",
  "main": "./dist/plugin.js",
  "pilot": {
    "plugins": ["./dist/plugin.js"],
    "permissions": [
      "ui:sidebar"
    ]
  },
  "devDependencies": {
    "@pilot/plugin-sdk": "^0.1.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
`;

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`;

const PLUGIN_SRC_TEMPLATE = `import { activate, type PluginAPI } from '@pilot/plugin-sdk';

activate((pilot: PluginAPI) => {
  console.log('{{NAME}} plugin activated!');

  // Register a sidebar view
  pilot.contributions.registerTreeView('{{SAFE_NAME}}-main', {
    title: '{{NAME}}',
    icon: 'puzzle',
    location: 'sidebar',
    getChildren: async () => {
      return [
        {
          id: 'hello',
          label: 'Hello from {{NAME}}!',
          icon: 'smile',
        },
      ];
    },
  });

  // Register a status bar item
  pilot.contributions.createStatusBarItem('{{SAFE_NAME}}-status', {
    text: '{{NAME}} active',
    alignment: 'right',
    priority: 100,
    tooltip: '{{NAME}} plugin',
  });

  // Return cleanup function
  return () => {
    console.log('{{NAME}} plugin deactivated');
  };
});
`;

export function scaffoldPlugin(
  name: string,
  targetDir: string,
  description?: string,
): ScaffoldResult {
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  const pluginDir = normalizePath(resolve(targetDir, safeName));

  if (existsSync(pluginDir)) {
    return { success: false, error: `Directory already exists: ${pluginDir}` };
  }

  try {
    mkdirSync(join(pluginDir, 'src'), { recursive: true });

    const desc = description || `${name} plugin for Pilot`;
    const packageJson = JSON.stringify(
      {
        name: safeName,
        version: '1.0.0',
        description: desc,
        main: './dist/plugin.js',
        pilot: {
          plugins: ['./dist/plugin.js'],
          permissions: ['ui:sidebar'],
        },
        devDependencies: {
          '@pilot/plugin-sdk': '^0.1.0',
          typescript: '^5.0.0',
        },
        scripts: {
          build: 'tsc',
          dev: 'tsc --watch',
        },
      },
      null,
      2,
    );

    const tsconfig = TSCONFIG_TEMPLATE.replace(/\n/g, os.EOL);

    const pluginSrc = PLUGIN_SRC_TEMPLATE
      .replace(/{{NAME}}/g, name)
      .replace(/{{SAFE_NAME}}/g, safeName)
      .replace(/\n/g, os.EOL);

    writeFileSync(join(pluginDir, 'package.json'), packageJson);
    writeFileSync(join(pluginDir, 'tsconfig.json'), tsconfig);
    writeFileSync(join(pluginDir, 'src', 'plugin.ts'), pluginSrc);

    return { success: true, path: pluginDir };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to scaffold plugin',
    };
  }
}
