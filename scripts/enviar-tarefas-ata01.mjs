import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
const get = k => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim()
const db = createClient(get('VITE_SUPABASE_URL'), get('VITE_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
const ENDPOINT = 'https://painel.amorefood.com.br/api/evolution-send'

const FONES = {
  'esdras santana': '5581992573535',
  'ana beatriz': '5581986258189',
  'eduarda santana': '5581995663381',
  'maria eduarda santana': '5581995663381',
  'maria eduarda': '5581995663381',
  'wagner santana': '5581994135602',
  'aline claudino': '5581994573420',
}

const { data: tarefas, error } = await db.from('tarefas').select('titulo,responsavel_nome,prazo').eq('created_by', 'Importação (ATA 01)')
if (error) { console.error(error); process.exit(1) }
console.log('tarefas encontradas:', tarefas.length)

// agrupa por pessoa (divide "X e Y")
const porPessoa = {} // nomeExib -> { fone, itens: [] }
for (const t of tarefas) {
  const nomes = (t.responsavel_nome || '').split(/\s+e\s+/).map(s => s.trim()).filter(Boolean)
  for (const nome of nomes) {
    const fone = FONES[nome.toLowerCase()]
    if (!fone) { console.log('SEM FONE:', nome); continue }
    porPessoa[nome] = porPessoa[nome] || { fone, itens: [] }
    const prazo = t.prazo ? new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR') : 'a definir'
    porPessoa[nome].itens.push(`• ${t.titulo} — prazo: ${prazo}`)
  }
}

const nomes = Object.keys(porPessoa)
let ok = 0
for (let i = 0; i < nomes.length; i++) {
  const nome = nomes[i]; const p = porPessoa[nome]
  const msg = [
    '✅ *Suas tarefas — Ata 001/2026 (Amore Paiva)*',
    '', `Olá, ${nome}! Estas são as tarefas definidas na reunião do Comitê Gestor:`,
    '', ...p.itens,
    '', 'Acompanhe e atualize o status no Painel 👉 https://painel.amorefood.com.br',
    '', '_Mensagem automática · Sistema Amore Food_',
  ].join('\n')
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p.fone, message: msg }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok && j.ok) { ok++; console.log(`✅ ${nome} (${p.fone}) — ${p.itens.length} tarefa(s)`) }
    else console.log(`❌ ${nome}: ${j.error || r.status}`)
  } catch (e) { console.log(`❌ ${nome}: ${e.message}`) }
  if (i < nomes.length - 1) await new Promise(r => setTimeout(r, 1800))
}
console.log(`\nEnviados: ${ok}/${nomes.length}`)
