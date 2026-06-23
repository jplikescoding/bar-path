import { defineConfig } from 'vite'
export default defineConfig({
  base: './',               // relative asset paths so it works under the GitHub Pages subpath
  server: { host: true },   // expose on LAN so a phone can hit it
})
