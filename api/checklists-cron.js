// Vercel Serverless Function — Geração automática diária dos checklists (Operação Padrão).
// Roda pelo Vercel Cron (ver vercel.json) ou manualmente: /api/checklists-cron?secret=...&preview=1
//
// Para cada loja (tenant_settings.stores) cria a execução do dia dos modelos ativos
// aplicáveis hoje (recorrência + dia + global/loja), pulando os que já existem.
// Usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (RLS desligado no projeto).

const SB_URL = () => process.env.VITE_SUPABASE_URL
const SB_KEY = () => process.env.VITE_SUPABASE_ANON_KEY

// "Hoje" em horário de Brasília (UTC-3) — evita virada de dia errada no cron (UTC).
function agoraBR() { return new Date(Date.now() - 3 * 3600000) }
function hojeBR() { return agoraBR().toISOString().slice(0, 10) }

function aplicaHoje(m) {
  if (!m.ativo) return false
  const d = agoraBR()
  if (m.recorrencia === 'diario') return true
  if (m.recorrencia === 'semanal') return (m.dias_semana || []).includes(d.getUTCDay())
  if (m.recorrencia === 'mensal') return m.dia_mes === d.getUTCDate()
  return false // avulso → só manual
}

async function sbGet(table, query) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(`${SB_URL()}/rest/v1/${table}?${query}`, {
      signal: ctrl.signal,
      headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
    })
    if (!res.ok) return []
    return res.json()
  } catch { return [] } finally { clearTimeout(timer) }
}

async function sbInsert(table, rows) {
  const res = await fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) throw new Error(`insert ${res.status}: ${await res.text().catch(() => '')}`)
}

export default async function handler(req, res) {
  // Proteção opcional: Vercel envia "Authorization: Bearer <CRON_SECRET>"; ?secret= p/ teste manual.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    const qs = req.query?.secret || ''
    if (auth !== `Bearer ${secret}` && qs !== secret) return res.status(401).json({ error: 'Não autorizado' })
  }
  if (!SB_URL() || !SB_KEY()) {
    return res.status(500).json({ error: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes no runtime.' })
  }

  const preview = req.query?.preview === '1' || req.query?.preview === 'true'
  const hoje = hojeBR()

  try {
    const [tenant, modelos, execHoje] = await Promise.all([
      sbGet('tenant_settings', 'slug=eq.default&select=stores'),
      sbGet('checklist_modelos', 'ativo=eq.true&select=*'),
      sbGet('checklist_execucoes', `data=eq.${hoje}&select=modelo_id,loja`),
    ])

    const lojas = (tenant?.[0]?.stores || []).filter(l => l && l !== 'Todas as Lojas')
    if (!lojas.length) return res.status(200).json({ ok: true, criados: 0, aviso: 'Sem lojas em tenant_settings.stores.' })

    const jaTem = new Set((execHoje || []).map(e => `${e.modelo_id}|${e.loja}`))
    const novos = []
    for (const lj of lojas) {
      for (const m of modelos) {
        if (!aplicaHoje(m)) continue
        if (!(m.loja == null || m.loja === lj)) continue
        if (jaTem.has(`${m.id}|${lj}`)) continue
        novos.push({
          modelo_id: m.id, loja: lj, titulo: m.titulo, setor: m.setor,
          data: hoje, turno: m.turno, status: 'pendente',
          respostas: [], hora_limite: m.hora_limite, created_by: 'cron',
        })
      }
    }

    if (preview) return res.status(200).json({ preview: true, hoje, lojas, modelos: modelos.length, a_criar: novos.length, exemplos: novos.slice(0, 5) })
    if (novos.length) await sbInsert('checklist_execucoes', novos)
    return res.status(200).json({ ok: true, hoje, lojas: lojas.length, modelos: modelos.length, criados: novos.length })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro na geração de checklists' })
  }
}
