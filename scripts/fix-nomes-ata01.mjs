import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const ID = 'd0928d1a-406f-4871-974a-f4b4d4090a4e'
const { error } = await db.from('atas_reuniao').update({
  participantes: ['Wagner Santana', 'Maria Eduarda Santana', 'Ana Beatriz'],
  observacoes: 'Ausentes: Esdras Santana, Aline Claudino. Ata importada do PDF "ATA 01".',
  updated_at: new Date().toISOString(),
}).eq('id', ID)
if (error) { console.error(error); process.exit(1) }
console.log('Nomes dos participantes corrigidos ✅')
