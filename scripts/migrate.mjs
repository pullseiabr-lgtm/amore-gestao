/**
 * scripts/migrate.mjs
 * Executa migrations SQL pendentes no Supabase via Management API.
 * Roda automaticamente ao iniciar o dev server (Vite plugin) ou manualmente:
 *   npm run migrate
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ── Lê variáveis de ambiente do .env ────────────────────────

function readEnv() {
  const env = {}
  for (const f of ['.env', '.env.local', '.env_local']) {
    const p = resolve(ROOT, f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  return env
}

const ENV = readEnv()
const PAT          = ENV.NEXT_SUPABASE_ACCESS_TOKEN
const SUPABASE_URL = ENV.VITE_SUPABASE_URL
const PROJECT_REF  = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

const MIGRATIONS_DIR  = resolve(ROOT, 'supabase', 'migrations')
const APPLIED_FILE    = resolve(MIGRATIONS_DIR, '_applied.json')

// ── Controle de migrations aplicadas ────────────────────────

function getApplied() {
  if (!existsSync(APPLIED_FILE)) return []
  try { return JSON.parse(readFileSync(APPLIED_FILE, 'utf8')) } catch { return [] }
}

function markApplied(name) {
  const applied = getApplied()
  if (!applied.includes(name)) {
    writeFileSync(APPLIED_FILE, JSON.stringify([...applied, name], null, 2))
  }
}

// ── Executa SQL via Management API ──────────────────────────

async function runSQL(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `HTTP ${res.status} ${res.statusText}`)
  }
  return res.json()
}

// ── Runner principal ─────────────────────────────────────────

export async function runMigrations() {
  if (!PAT)          { console.warn('⚠️  [migrate] NEXT_SUPABASE_ACCESS_TOKEN não definido — pulando migrations'); return }
  if (!PROJECT_REF)  { console.warn('⚠️  [migrate] VITE_SUPABASE_URL inválido — pulando migrations'); return }

  const applied = getApplied()

  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.startsWith('_'))
    .sort()

  const pending = files.filter(f => !applied.includes(f))

  if (pending.length === 0) {
    console.log('✅ [migrate] Todas as migrations já aplicadas.')
    return
  }

  console.log(`\n🔄 [migrate] ${pending.length} migration(s) pendente(s)...\n`)

  for (const file of pending) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8')
    try {
      await runSQL(sql)
      markApplied(file)
      console.log(`  ✅ ${file}`)
    } catch (err) {
      console.error(`  ❌ ${file}: ${err.message}`)
      // Não interrompe — tenta as próximas
    }
  }

  console.log()
}

// ── Execução direta: node scripts/migrate.mjs ────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().catch(err => { console.error(err); process.exit(1) })
}
