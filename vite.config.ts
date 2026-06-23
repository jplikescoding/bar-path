import { defineConfig } from 'vite'
export default defineConfig({
  server: { host: true },   // expose on LAN so a phone can hit it
})
