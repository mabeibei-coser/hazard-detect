import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/llm-api': {
        target: 'https://maas-coding-api.cn-huabei-1.xf-yun.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/llm-api/, '/v2/chat/completions'),
        secure: false
      }
    }
  }
})
