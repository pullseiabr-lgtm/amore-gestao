// Vercel Serverless Function — envio automático do RELATÓRIO DIÁRIO por WhatsApp (Evolution).
// Agendado pelo Vercel Cron (ver vercel.json) ou chamável manualmente.
//   ?preview=1        → retorna o texto SEM enviar (não exige secret)
//   ?d=YYYY-MM-DD     → data do relatório (default: ONTEM, fuso America/Recife)
//   ?loja=Amore CD    → filtra por loja (default: todas)
// Segurança do envio: CRON_SECRET (a Vercel envia no header Authorization; ?secret= também aceito).
// Destinatários: app_config chave `rel_diario_config`.fones  OU  EVOLUTION_RECIPIENTS  OU  default (comprador+gestor).
// Usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (já existem).

const DEFAULT_FONES = '5581992573535,5581994135602' // Esdras (comprador) + Wagner (gestor)
const canon = l => ({ 'Amore Costa Dourada': 'Amore CD', 'Flow Paiva': 'Flow CD' }[l] || l || '')
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dDMY = s => { const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s }
const diaDe = iso => { if (!iso) return ''; const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return d.toISOString().slice(0, 10) }

async function sb(path) {
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
    })
    return r.ok ? r.json() : []
  } catch { return [] }
}
async function getEvolutionCfg() {
  if (process.env.EVOLUTION_URL && process.env.EVOLUTION_KEY && process.env.EVOLUTION_INSTANCE) {
    return { url: process.env.EVOLUTION_URL, key: process.env.EVOLUTION_KEY, instance: process.env.EVOLUTION_INSTANCE, recipients: process.env.EVOLUTION_RECIPIENTS || '' }
  }
  const rows = await sb('app_config?chave=eq.evolution_api&select=valor')
  return rows?.[0]?.valor || null
}
async function enviarEvolution(to, texto, cfg) {
  const res = await fetch(`${cfg.url}/message/sendText/${cfg.instance}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.key }, body: JSON.stringify({ number: to, text: texto }),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

async function montar(dia, loja, host) {
  const lojaC = canon(loja)
  const ini = dia + 'T00:00:00-03:00'
  const fim = (() => { const d = new Date(dia + 'T00:00:00-03:00'); d.setDate(d.getDate() + 1); return d.toISOString() })()
  const lojaEq = col => lojaC ? `&${col}=eq.` + encodeURIComponent(lojaC) : ''

  const reqs = await sb(`requisicoes?select=id${lojaEq('loja')}&created_at=gte.${encodeURIComponent(ini)}&created_at=lt.${encodeURIComponent(fim)}`)
  const pedRows = await sb('app_config?chave=like.pedido_*&select=valor')
  const pedidos = (pedRows || []).map(r => r.valor || {}).filter(p => (!lojaC || canon(p.loja) === lojaC))
  const pedDia = pedidos.filter(p => (p.data || diaDe(p.em)) === dia)
  const recDia = pedidos.filter(p => p.recebimento && diaDe(p.recebimento.em) === dia)
  const valor = pedDia.reduce((s, p) => s + (Number(p.total) || 0), 0)
  const movs = await sb(`estoque_movimentacoes?select=tipo,setor${lojaEq('loja')}&created_at=gte.${encodeURIComponent(ini)}&created_at=lt.${encodeURIComponent(fim)}`)
  const ent = movs.filter(m => m.tipo === 'entrada').length, sai = movs.filter(m => m.tipo === 'saida').length, per = movs.filter(m => m.tipo === 'perda').length
  const consumo = {}; movs.filter(m => m.tipo === 'saida').forEach(m => { const k = m.setor || 'sem setor'; consumo[k] = (consumo[k] || 0) + 1 })
  const consumoTxt = Object.entries(consumo).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(' · ')
  const prods = await sb(`produtos?select=estoque_atual,estoque_minimo&ativo=eq.true${lojaEq('loja')}&limit=5000`)
  const criticos = (prods || []).filter(p => Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo)).length
  const tokRows = await sb('app_config?chave=like.cot_tok:*&select=valor')
  const pend = (tokRows || []).map(r => r.valor || {}).filter(t => t && t.fornecedor_nome && !['respondido', 'cancelado'].includes(t.status)).length

  const link = `https://${host}/relatorio-diario.html?d=${dia}${lojaC ? `&loja=${encodeURIComponent(lojaC)}` : ''}`
  const texto = `📅 *Relatório Diário — Compras & Estoque*\n${dDMY(dia)}${lojaC ? ` · ${lojaC}` : ' · Todas as lojas'}\n` +
    `━━━━━━━━━━━━\n` +
    `🛒 Compras: *${pedDia.length} pedido(s)* · ${brl(valor)}\n` +
    `📦 Recebimentos: ${recDia.length}\n` +
    `📥 Estoque: ${ent} entrada(s) · ${sai} saída(s)${per ? ` · ${per} perda(s)` : ''}\n` +
    (sai && consumoTxt ? `   Consumo por setor: ${consumoTxt}\n` : '') +
    `⚠️ Produtos abaixo do mínimo: *${criticos}*\n` +
    `⏳ Cotações pendentes: ${pend}\n` +
    `━━━━━━━━━━━━\n` +
    `📊 Relatório completo:\n${link}\n\n_Painel Amore · enviado automaticamente_`
  return { texto, resumo: { pedidos: pedDia.length, valor, recebimentos: recDia.length, entradas: ent, saidas: sai, perdas: per, criticos, pendentes: pend }, link }
}

export default async function handler(req, res) {
  const preview = req.query?.preview === '1' || req.query?.preview === 'true'
  // segurança do ENVIO (preview é liberado p/ conferência)
  if (!preview) {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const auth = req.headers.authorization || '', qs = req.query?.secret || ''
      if (auth !== `Bearer ${secret}` && qs !== secret) return res.status(401).json({ error: 'Não autorizado' })
    }
  }
  if (req.query?.ping === '1') return res.status(200).json({ ok: true, ts: Date.now() })
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) return res.status(500).json({ error: 'VITE_SUPABASE_* ausentes no runtime.' })

  // data: default = ONTEM (fuso Recife)
  const rNow = new Date(Date.now() - 3 * 3600e3)
  rNow.setUTCDate(rNow.getUTCDate() - 1)
  const dia = (req.query?.d || rNow.toISOString().slice(0, 10)).slice(0, 10)
  const loja = req.query?.loja || process.env.WHATSAPP_LOJA || ''
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'painel.amorefood.com.br'

  try {
    const { texto, resumo, link } = await montar(dia, loja, host)
    if (preview) return res.status(200).json({ preview: true, dia, loja: canon(loja) || 'todas', resumo, link, texto })

    const cfg = await getEvolutionCfg()
    if (!cfg || !cfg.url || !cfg.key || !cfg.instance) return res.status(503).json({ error: 'Evolution não configurada.', previa: texto.slice(0, 400) })
    // destinatários: app_config rel_diario_config.fones > EVOLUTION_RECIPIENTS > default
    const cfgRows = await sb('app_config?chave=eq.rel_diario_config&select=valor')
    const fonesCfg = cfgRows?.[0]?.valor?.fones
    const raw = (typeof fonesCfg === 'string' ? fonesCfg : Array.isArray(fonesCfg) ? fonesCfg.join(',') : '') || cfg.recipients || process.env.EVOLUTION_RECIPIENTS || DEFAULT_FONES
    const dest = raw.split(/[,;\n]+/).map(s => s.replace(/\D/g, '')).filter(n => n.length >= 10)
    if (!dest.length) return res.status(503).json({ error: 'Sem destinatários.', previa: texto.slice(0, 400) })

    const resultados = []
    for (const to of dest) { const r = await enviarEvolution(to, texto, cfg); resultados.push({ to, ok: r.ok }) ; await new Promise(x => setTimeout(x, 1200)) }
    return res.status(200).json({ dia, enviados: resultados.filter(r => r.ok).length, total: dest.length, resumo, resultados })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro no relatório diário' })
  }
}
