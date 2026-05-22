import { readFileSync } from 'fs'

const sql = readFileSync('./supabase/migrations/20260521_produtos.sql', 'utf8')
const TOKEN = process.env.NEXT_SUPABASE_ACCESS_TOKEN
const REF   = 'xdwnsqkzgopymufsuccr'

if (!TOKEN) {
  console.error('NEXT_SUPABASE_ACCESS_TOKEN não definido no .env')
  process.exit(1)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql })
})

const body = await res.json()
if (res.ok) {
  console.log('✓ Migration executada com sucesso')
} else {
  console.error('✗ Erro:', JSON.stringify(body))
  process.exit(1)
}
