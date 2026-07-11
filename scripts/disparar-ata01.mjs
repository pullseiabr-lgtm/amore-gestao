import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const ATA_ID = 'd0928d1a-406f-4871-974a-f4b4d4090a4e'
const ENDPOINT = 'https://painel.amorefood.com.br/api/evolution-send'

const destinatarios = [
  { nome: 'Wagner Santana',        fone: '5581994135602' },
  { nome: 'Maria Eduarda Santana', fone: '5581995663381' },
  { nome: 'Ana Beatriz',           fone: '5581986258189' },
  { nome: 'Aline Claudino',        fone: '5581994573420' },
  { nome: 'Esdras Santana',        fone: '5581992573535' },
]

const { data: a, error } = await db.from('atas_reuniao').select('*').eq('id', ATA_ID).single()
if (error) { console.error(error); process.exit(1) }

const cab = ['30/06/2026', (a.hora_inicio || '').slice(0, 5), a.local_reuniao].filter(Boolean).join(' · ')
const linhas = ['📋 *Ata de Reunião — Amore Food*', '', `*${a.titulo}*`]
if (cab) linhas.push(`🗓️ ${cab}`)
if ((a.participantes || []).length) linhas.push(`👥 ${a.participantes.join(', ')}`)
if (a.pauta) linhas.push('', '📌 *Temas abordados:*', a.pauta.trim())
if (a.decisoes) linhas.push('', '✅ *Decisões:*', a.decisoes.trim())
if (a.proximos_passos) linhas.push('', '➡️ *Próximos passos:*', a.proximos_passos.trim())
linhas.push('', 'A ata completa está disponível no Painel Amore Food 👉 https://painel.amorefood.com.br')
linhas.push('', '_Mensagem automática · Sistema Amore Food_')
const message = linhas.join('\n')

let ok = 0; const falhas = []
for (let i = 0; i < destinatarios.length; i++) {
  const d = destinatarios[i]
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: d.fone, message }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.ok) { ok++; console.log(`✅ ${d.nome} (${d.fone})`) }
    else { falhas.push(d.nome); console.log(`❌ ${d.nome}: ${j.error || r.status}`) }
  } catch (e) { falhas.push(d.nome); console.log(`❌ ${d.nome}: ${e.message}`) }
  if (i < destinatarios.length - 1) await new Promise(r => setTimeout(r, 1800))
}
console.log(`\nEnviados: ${ok}/${destinatarios.length}` + (falhas.length ? ` | Falhas: ${falhas.join(', ')}` : ''))
