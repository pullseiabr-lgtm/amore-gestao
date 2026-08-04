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
  const movs = await sb(`estoque_movimentacoes?select=tipo,setor,produto_id,quantidade${lojaEq('loja')}&created_at=gte.${encodeURIComponent(ini)}&created_at=lt.${encodeURIComponent(fim)}`)
  const ent = movs.filter(m => m.tipo === 'entrada').length, sai = movs.filter(m => m.tipo === 'saida').length, per = movs.filter(m => m.tipo === 'perda').length
  const consumo = {}; movs.filter(m => m.tipo === 'saida').forEach(m => { const k = m.setor || 'sem setor'; consumo[k] = (consumo[k] || 0) + 1 })
  const consumoTxt = Object.entries(consumo).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(' · ')
  const prods = await sb(`produtos?select=id,estoque_atual,estoque_minimo,ultimo_preco_compra&ativo=eq.true${lojaEq('loja')}&limit=5000`)
  const criticos = (prods || []).filter(p => Number(p.estoque_minimo) > 0 && Number(p.estoque_atual) <= Number(p.estoque_minimo)).length
  const custoById = {}; (prods || []).forEach(p => { if (p.id) custoById[p.id] = Number(p.ultimo_preco_compra) || 0 })
  const valMov = m => (custoById[m.produto_id] || 0) * (Number(m.quantidade) || 0)
  const valorSaidas = movs.filter(m => m.tipo === 'saida').reduce((s, m) => s + valMov(m), 0)
  const valorPerdas = movs.filter(m => m.tipo === 'perda').reduce((s, m) => s + valMov(m), 0)
  const tokRows = await sb('app_config?chave=like.cot_tok:*&select=valor')
  const pend = (tokRows || []).map(r => r.valor || {}).filter(t => t && t.fornecedor_nome && !['respondido', 'cancelado'].includes(t.status)).length

  const link = `https://${host}/relatorio-diario.html?d=${dia}${lojaC ? `&loja=${encodeURIComponent(lojaC)}` : ''}`
  const texto = `📅 *Relatório Diário — Compras & Estoque*\n${dDMY(dia)}${lojaC ? ` · ${lojaC}` : ' · Todas as lojas'}\n` +
    `━━━━━━━━━━━━\n` +
    `🛒 Compras: *${pedDia.length} pedido(s)* · ${brl(valor)}\n` +
    `📦 Recebimentos: ${recDia.length}\n` +
    `📥 Estoque: ${ent} entrada(s) · ${sai} saída(s)${per ? ` · ${per} perda(s)` : ''}\n` +
    (valorSaidas > 0 ? `   💵 Valor das saídas: *${brl(valorSaidas)}*${valorPerdas > 0 ? ` (perdas ${brl(valorPerdas)})` : ''}\n` : '') +
    (sai && consumoTxt ? `   Consumo por setor: ${consumoTxt}\n` : '') +
    `⚠️ Produtos abaixo do mínimo: *${criticos}*\n` +
    `⏳ Cotações pendentes: ${pend}\n` +
    `━━━━━━━━━━━━\n` +
    `📊 Relatório completo:\n${link}\n\n_Painel Amore · enviado automaticamente_`
  return { texto, resumo: { pedidos: pedDia.length, valor, recebimentos: recDia.length, entradas: ent, saidas: sai, perdas: per, criticos, pendentes: pend }, link }
}

// ——— Requisição Semanal de Compra (inlined aqui p/ não criar 13ª função serverless / limite Hobby=12) ———
const NORM = s => (s || '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const TOKS = s => NORM(s).split(' ').filter(w => w.length > 2)
const LOJAS_REQ = ['Amore Paiva', 'Amore CD', 'Flow CD']
async function montarPrecosReq() {
  const map = {}
  const add = (nm, pr, em) => { nm = NORM(nm); if (!nm || !(pr > 0)) return; if (!map[nm] || (em || '') > (map[nm].em || '')) map[nm] = { preco: pr, em: em || '' } }
  const cfg = await sb('app_config?select=chave,valor&or=(chave.like.nf_praso:*,chave.like.pedido_*)&limit=2000')
  ;(cfg || []).forEach(row => { const v = row.valor; if (!v || !Array.isArray(v.itens)) return; const em = v.em || v.data || ''; v.itens.forEach(it => add(it.prod || it.produto || it.desc, Number(it.unit) || Number(it.preco) || 0, em)) })
  const ci = await sb('caixa_itens?select=descricao,valor,quantidade,preco_unit,created_at&limit=20000')
  ;(ci || []).forEach(it => { const pr = Number(it.preco_unit) > 0 ? Number(it.preco_unit) : (Number(it.valor) > 0 && Number(it.quantidade) > 0 ? Number(it.valor) / Number(it.quantidade) : 0); add(it.descricao, pr, it.created_at || '') })
  return { map, idx: Object.entries(map) }
}
async function analisarReq(loja, P) {
  const prods = await sb(`estoque_produtos?loja=eq.${encodeURIComponent(loja)}&ativo=eq.true&select=id,nome,nivel_atual,nivel_minimo,nivel_ideal,preco_unitario&limit=8000`)
  const ini30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const movs = await sb(`estoque_movimentacoes?loja=eq.${encodeURIComponent(loja)}&tipo=in.(saida,perda)&created_at=gte.${encodeURIComponent(ini30)}&select=produto_id,quantidade&limit=8000`)
  const cons = {}; movs.forEach(m => { cons[m.produto_id] = (cons[m.produto_id] || 0) + (Number(m.quantidade) || 0) })
  const precoRef = (nome, pu) => { if (pu > 0) return pu; const n = NORM(nome); if (P.map[n]) return P.map[n].preco; const t = TOKS(nome); if (t.length) { for (const [k, v] of P.idx) { if (t.every(w => k.includes(w))) return v.preco } } return 0 }
  let crit = 0, alta = 0, total = 0, valor = 0, semPreco = 0
  for (const p of (prods || [])) {
    const atual = Number(p.nivel_atual) || 0, min = Number(p.nivel_minimo) || 0, ideal = Number(p.nivel_ideal) || 0
    const preco = precoRef(p.nome, Number(p.preco_unitario) || 0)
    const cd = (cons[p.id] || 0) / 30, temCons = cd > 0
    const diasRest = atual <= 0 ? 0 : (temCons ? atual / cd : Infinity)
    const sug = temCons ? Math.max(0, Math.ceil(cd * 7 + min - atual)) : (atual < ideal ? Math.max(0, Math.ceil(ideal - atual)) : (atual < min ? Math.ceil(min - atual) : 0))
    let prio; if (atual <= 0) prio = 'crit'; else if (temCons && diasRest < 2) prio = 'crit'; else if (atual < min) prio = 'alta'; else if (temCons && diasRest < 7) prio = 'alta'; else if (atual < ideal) prio = 'media'; else prio = 'baixa'
    if (sug > 0 || atual < min || prio === 'crit' || prio === 'alta') { total++; if (prio === 'crit') crit++; else if (prio === 'alta') alta++; if (preco > 0) valor += sug * preco; else semPreco++ }
  }
  return { crit, alta, total, valor, semPreco }
}
async function enviarRequisicaoSemanal(host, cfg, dest) {
  const P = await montarPrecosReq()
  const hojeBR = new Date(Date.now() - 3 * 3600e3).toLocaleDateString('pt-BR')
  const out = []
  for (const loja of LOJAS_REQ) {
    const a = await analisarReq(loja, P)
    const comPreco = a.total - a.semPreco
    const link = `https://${host}/relatorio-requisicao.html?loja=${encodeURIComponent(loja)}`
    const texto = `🧠 *Requisição Semanal de Compra — ${loja}*\n${hojeBR}\n━━━━━━━━━━━━\n` +
      `📦 ${a.total} produto(s) a repor\n🔴 Críticos: ${a.crit} · 🟠 Alta: ${a.alta}\n` +
      `💰 Valor estimado: ${brl(a.valor)}\n_(sobre ${comPreco}/${a.total} itens com preço${a.semPreco ? ` · ${a.semPreco} sem preço a cadastrar` : ''})_\n━━━━━━━━━━━━\n` +
      `Análise completa (estoque × consumo, prioridade e justificativa):\n${link}\n\n_Gerado automaticamente · valide o estoque antes de enviar à cotação._`
    let env = 0
    for (const to of dest) { const r = await enviarEvolution(to, texto, cfg); if (r.ok) env++; await new Promise(x => setTimeout(x, 1200)) }
    out.push({ loja, total: a.total, crit: a.crit, valor: a.valor, semPreco: a.semPreco, enviados: env })
  }
  return out
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
  // Domínio público oficial para os LINKS (nunca a URL *.vercel.app, que é protegida por login).
  const reqHost = req.headers['x-forwarded-host'] || req.headers.host || ''
  const host = (!reqHost || /vercel\.app$/i.test(reqHost)) ? 'painel.amorefood.com.br' : reqHost

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

    // Requisição Semanal de Compra: dobrada aqui (evita 4º cron / limite do plano).
    // Dispara às SEGUNDAS (fuso Recife) ou sob demanda com ?req=1. Nunca quebra o relatório diário.
    let requisicao = null
    const isSegunda = new Date(Date.now() - 3 * 3600e3).getUTCDay() === 1
    if (isSegunda || req.query?.req === '1') {
      try { requisicao = await enviarRequisicaoSemanal(host, cfg, dest) }
      catch (e) { requisicao = { error: String((e && e.message) || e) } }
    }
    return res.status(200).json({ dia, enviados: resultados.filter(r => r.ok).length, total: dest.length, resumo, resultados, requisicao })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro no relatório diário' })
  }
}
