import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
 root: resolve(process.cwd(), 'github'),
 base: '/orszag-varos/',
 publicDir: resolve(process.cwd(), 'public'),
 plugins: [react()],
 build: {outDir: resolve(process.cwd(), 'docs'), emptyOutDir: true},
});
