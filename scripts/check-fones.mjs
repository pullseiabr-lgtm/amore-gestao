import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const nomes = ['Wagner Santana', 'Eduarda Santana', 'Bana Beatriz']
const { data, error } = await db.from('profiles').select('name,permissions_override')
if (error) { console.error(error); process.exit(1) }
for (const n of nomes) {
  const p = data.find(x => (x.name || '').trim().toLowerCase() === n.toLowerCase())
  const fone = (p?.permissions_override?.__perfil__?.whatsapp || '').replace(/\D/g, '')
  console.log(`${n}: ${p ? (fone || 'SEM WHATSAPP') : 'PERFIL NAO ENCONTRADO'}`)
}
