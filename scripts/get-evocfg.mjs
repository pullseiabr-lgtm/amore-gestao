import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const { data, error } = await db.from('app_config').select('chave,valor').eq('chave', 'evolution_api')
if (error) { console.error(error); process.exit(1) }
console.log(JSON.stringify(data, null, 2))
