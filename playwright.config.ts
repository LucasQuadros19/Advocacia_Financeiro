import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/preparar.ts',
  timeout: 30000,
  use: { baseURL: 'http://localhost:3334', locale: 'pt-BR' },
  webServer: {
    command: 'npm run e2e:servidor',
    url: 'http://localhost:3334/api/saude',
    timeout: 120000,
    reuseExistingServer: false,
  },
})
