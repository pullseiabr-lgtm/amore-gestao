import { readFileSync } from 'fs'
import { config } from 'dotenv'
config()

const sql   = readFileSync('./supabase/migrations/20260521_financeiro.sql', 'utf8')
const TOKEN = process.env.NEXT_SUPABASE_ACCESS_TOKEN
const KEY   = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
const URL   = process.env.VITE_SUPABASE_URL || 'https://xdwnsqkzgopymufsuccr.supabase.co'
const REF   = 'xdwnsqkzgopymufsuccr'

if (!TOKEN) { console.error('NEXT_SUPABASE_ACCESS_TOKEN não definido'); process.exit(1) }

// 1. SQL tables
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const body = await res.json()
if (!res.ok) { console.error('✗ SQL:', JSON.stringify(body)); process.exit(1) }
console.log('✓ Tabelas financeiras criadas')

// 2. Storage bucket para comprovantes
try {
  const br = await fetch(`${URL}/storage/v1/bucket`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'fin-comprovantes', name: 'fin-comprovantes', public: true }),
  })
  const bb = await br.json()
  if (br.ok || bb.error === 'Duplicate') console.log('✓ Bucket fin-comprovantes OK')
  else console.warn('⚠ Bucket:', JSON.stringify(bb))
} catch (e) { console.warn('⚠ Bucket creation skipped:', e.message) }
