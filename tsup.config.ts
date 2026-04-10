import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    clean: true,
    sourcemap: true,
    tsconfig: 'tsconfig.json',
    external: ['playwright', 'sharp'],
    banner: { js: '#!/usr/bin/env node\n' },
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    tsconfig: 'tsconfig.json',
    external: ['playwright', 'sharp'],
  },
])
