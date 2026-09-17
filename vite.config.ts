import { defineConfig } from 'vitest/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
let outputDirectory = 'dist';
export default defineConfig(({ mode }) => ({
  ...(mode === 'browser' ? { define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://browser-test.supabase.co'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('public-browser-test-key') } } : {}),
  test: { include: ['tests/**/*.test.ts'] },
  plugins: [{ name: 'offline-shell', configResolved(config) { outputDirectory = config.build.outDir; }, closeBundle() {
    const html = readFileSync(resolve(outputDirectory, 'index.html'), 'utf8');
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1]);
    const template = readFileSync('public/sw.js', 'utf8');
    writeFileSync(resolve(outputDirectory, 'sw.js'), template.replace('__VERSION__', createHash('sha256').update(html).digest('hex').slice(0,12)).replace('__PRECACHE__', JSON.stringify(['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/how-it-works.html', ...assets])));
  }}],
}));
