import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // If you want to test functions locally without netlify-cli,
    // install netlify-cli globally: npm i -g netlify-cli
    // Then run: netlify dev
    // This will proxy /.netlify/functions/* to the local function server.
  }
})
