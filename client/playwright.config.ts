import path from 'node:path';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 90000, workers: 1,
  use: { baseURL: process.env.BASE_URL || 'http://127.0.0.1:8181', channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, screenshot: 'only-on-failure' },
  reporter: [['list'], ['json', { outputFile: path.resolve(import.meta.dirname,'../tmp/browser-results.json') }]],
  outputDir: path.resolve(import.meta.dirname,'../tmp/browser-artifacts'),
});
