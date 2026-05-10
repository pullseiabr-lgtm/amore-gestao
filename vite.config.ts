import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin: executa migrations Supabase pendentes automaticamente ao iniciar
function supabaseMigratePlugin(): Plugin {
  let ran = false
  return {
    name: 'supabase-migrate',
    async buildStart() {
      if (ran) return
      ran = true
      try {
        // @ts-ignore
        const { runMigrations } = await import('./scripts/migrate.mjs')
        await runMigrations()
      } catch (err) {
        // Nunca bloqueia o servidor por erro de migration
        console.error('[migrate]', (err as Error).message)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), supabaseMigratePlugin()],
})
