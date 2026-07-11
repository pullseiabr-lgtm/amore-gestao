import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const { data, error } = await db.from('profiles').select('id,name,loja,permissions_override')
if (error) { console.error(error); process.exit(1) }
console.log('=== PERFIS CADASTRADOS ===')
for (const p of data) {
  const fone = (p.permissions_override?.__perfil__?.whatsapp || '').replace(/\D/g, '')
  console.log(`${(p.name||'(sem nome)').padEnd(22)} | ${p.loja||'-'} | ${fone || 'SEM WHATSAPP'}`)
}
