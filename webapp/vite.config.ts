import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const webappDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pathway-local-auth',
      configureServer(server) {
        server.middlewares.use('/__rag-dev-config', (req, res) => {
          const remoteAddress = req.socket.remoteAddress || ''
          const isLoopback =
            remoteAddress === '127.0.0.1' ||
            remoteAddress === '::1' ||
            remoteAddress === '::ffff:127.0.0.1'
          if (!isLoopback) {
            res.statusCode = 403
            res.end('Local development access only')
            return
          }

          const envPath = resolve(webappDir, '../rag-backend/.env')
          let envText = ''
          try {
            envText = readFileSync(envPath, 'utf8')
          } catch {
            res.statusCode = 503
            res.end('Local backend environment is unavailable')
            return
          }

          const envValue = (name: string) => {
            const line = envText
              .split(/\r?\n/)
              .find((entry) => entry.trim().startsWith(`${name}=`))
            return line
              ? line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
              : ''
          }
          const secret = envValue('PATHWAY_RAG_JWT_SECRET')
          if (!secret) {
            res.statusCode = 503
            res.end('Local backend JWT secret is unavailable')
            return
          }

          const requiredCap = envValue('JWT_REQUIRED_CAP') || 'contributor'
          const encode = (value: object) =>
            Buffer.from(JSON.stringify(value)).toString('base64url')
          const header = encode({ alg: 'HS256', typ: 'JWT' })
          const payload = encode({
            sub: 'local-development',
            exp: Math.floor(Date.now() / 1000) + 28800,
            cap: [requiredCap],
          })
          const signature = createHmac('sha256', secret)
            .update(`${header}.${payload}`)
            .digest('base64url')

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({
            apiBase: process.env.VITE_RAG_LOCAL_API_BASE || 'http://localhost:8000',
            token: `${header}.${payload}.${signature}`,
          }))
        })
      },
    },
  ],
  server: { port: 5173, strictPort: true, cors: true, origin: 'http://localhost:5173' },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: './index.html',
      output: { entryFileNames: 'assets/main.js', assetFileNames: 'assets/[name][extname]' }
    }
  }
})
