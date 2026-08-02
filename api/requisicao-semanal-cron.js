// Vercel Serverless Function — Requisição Semanal Inteligente (segunda 08:00 Recife).
// Para cada loja, analisa estoque × consumo (30d), calcula reposição sugerida + prioridade e
// notifica os responsáveis por WhatsApp (Evolution) com o link da análise completa.
//   ?preview=1  → retorna o resumo SEM enviar (sem secret). Envio protegido por CRON_SECRET.
// Usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.

const DEFAULT_FONES = '5581992573535,5581994135602' // Esdras + Wagner
const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']
const brl = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  return res.ok
}

const NORM = s => (s || '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const TOKS = s => NORM(s).split(' ').filter(w => w.length > 2)

// Mapa de preço de referência (último preço comprado): notas fiscais + pedidos + caixas.
async function montarPrecos() {
  const map = {}
  const add = (nm, pr, em) => { nm = NORM(nm); if (!nm || !(pr > 0)) return; if (!map[nm] || (em || '') > (map[nm].em || '')) map[nm] = { preco: pr, em: em || '' } }
  const cfg = await sb('app_config?select=chave,valor&or=(chave.like.nf_praso:*,chave.like.pedido_*)&limit=2000')
  ;(cfg || []).forEach(row => { const v = row.valor; if (!v || !Array.isArray(v.itens)) return; const em = v.em || v.data || ''; v.itens.forEach(it => add(it.prod || it.produto || it.desc, Number(it.unit) || Number(it.preco) || 0, em)) })
  const ci = await sb('caixa_itens?select=descricao,valor,quantidade,preco_unit,created_at&limit=20000')
  ;(ci || []).forEach(it => { const pr = Number(it.preco_unit) > 0 ? Number(it.preco_unit) : (Number(it.valor) > 0 && Number(it.quantidade) > 0 ? Number(it.valor) / Number(it.quantidade) : 0); add(it.descricao, pr, it.created_at || '') })
  return { map, idx: Object.entries(map) }
}

async function analisar(loja, PRECOS) {
  const prods = await sb(`estoque_produtos?loja=eq.${encodeURIComponent(loja)}&ativo=eq.true&select=id,nome,nivel_atual,nivel_minimo,nivel_ideal,preco_unitario&limit=8000`)
  const ini30 = new Date(Date.now() - 30 * 864e5).toISOString()
  const movs = await sb(`estoque_movimentacoes?loja=eq.${encodeURIComponent(loja)}&tipo=in.(saida,perda)&created_at=gte.${encodeURIComponent(ini30)}&select=produto_id,quantidade&limit=8000`)
  const cons = {}; movs.forEach(m => { cons[m.produto_id] = (cons[m.produto_id] || 0) + (Number(m.quantidade) || 0) })
  const precoRef = (nome, precoUnit) => {
    if (precoUnit > 0) return precoUnit
    const n = NORM(nome); if (PRECOS.map[n]) return PRECOS.map[n].preco
    const t = TOKS(nome); if (t.length) { for (const [k, v] of PRECOS.idx) { if (t.every(w => k.includes(w))) return v.preco } }
    return 0
  }
  let crit = 0, alta = 0, total = 0, valor = 0, semPreco = 0
  for (const p of (prods || [])) {
    const atual = Number(p.nivel_atual) || 0, min = Number(p.nivel_minimo) || 0, ideal = Number(p.nivel_ideal) || 0
    const preco = precoRef(p.nome, Number(p.preco_unitario) || 0)
    const cd = (cons[p.id] || 0) / 30, temCons = cd > 0
    const diasRest = atual <= 0 ? 0 : (temCons ? atual / cd : Infinity)
    const sugerido = temCons ? Math.max(0, Math.ceil(cd * 7 + min - atual)) : (atual < ideal ? Math.max(0, Math.ceil(ideal - atual)) : (atual < min ? Math.ceil(min - atual) : 0))
    let prio
    if (atual <= 0) prio = 'crit'
    else if (temCons && diasRest < 2) prio = 'crit'
    else if (atual < min) prio = 'alta'
    else if (temCons && diasRest < 7) prio = 'alta'
    else if (atual < ideal) prio = 'media'
    else prio = 'baixa'
    if (sugerido > 0 || atual < min || prio === 'crit' || prio === 'alta') {
      total++; if (prio === 'crit') crit++; else if (prio === 'alta') alta++
      if (preco > 0) valor += sugerido * preco; else semPreco++
    }
  }
  return { crit, alta, total, valor, semPreco }
}

export default async function handler(req, res) {
  const preview = req.query?.preview === '1' || req.query?.preview === 'true'
  if (!preview) {
    const secret = process.env.CRON_SECRET
    if (secret) {
      const auth = req.headers.authorization || '', qs = req.query?.secret || ''
      if (auth !== `Bearer ${secret}` && qs !== secret) return res.status(401).json({ error: 'Não autorizado' })
    }
  }
  if (req.query?.ping === '1') return res.status(200).json({ ok: true, ts: Date.now() })
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) return res.status(500).json({ error: 'VITE_SUPABASE_* ausentes.' })

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'painel.amorefood.com.br'
  const lojas = req.query?.loja ? [req.query.loja] : LOJAS
  const hojeBR = new Date(Date.now() - 3 * 3600e3).toLocaleDateString('pt-BR')

  try {
    const PRECOS = await montarPrecos()
    const resumos = []
    for (const loja of lojas) {
      const a = await analisar(loja, PRECOS)
      const comPreco = a.total - a.semPreco
      const link = `https://${host}/relatorio-requisicao.html?loja=${encodeURIComponent(loja)}`
      const texto = `🧠 *Requisição Semanal de Compra — ${loja}*\n${hojeBR}\n━━━━━━━━━━━━\n` +
        `📦 ${a.total} produto(s) a repor\n🔴 Críticos: ${a.crit} · 🟠 Alta: ${a.alta}\n` +
        `💰 Valor estimado: ${brl(a.valor)}\n_(sobre ${comPreco}/${a.total} itens com preço${a.semPreco ? ` · ${a.semPreco} sem preço a cadastrar` : ''})_\n━━━━━━━━━━━━\n` +
        `Análise completa (estoque × consumo, prioridade e justificativa):\n${link}\n\n_Gerado automaticamente · valide o estoque antes de enviar à cotação._`
      resumos.push({ loja, ...a, link, texto })
    }
    if (preview) return res.status(200).json({ preview: true, resumos })

    const cfg = await getEvolutionCfg()
    if (!cfg || !cfg.url || !cfg.key || !cfg.instance) return res.status(503).json({ error: 'Evolution não configurada.' })
    const cfgRows = await sb('app_config?chave=eq.rel_diario_config&select=valor')
    const fonesCfg = cfgRows?.[0]?.valor?.fones
    const raw = (typeof fonesCfg === 'string' ? fonesCfg : Array.isArray(fonesCfg) ? fonesCfg.join(',') : '') || cfg.recipients || process.env.EVOLUTION_RECIPIENTS || DEFAULT_FONES
    const dest = raw.split(/[,;\n]+/).map(s => s.replace(/\D/g, '')).filter(n => n.length >= 10)
    let env = 0
    for (const r of resumos) for (const to of dest) { if (await enviarEvolution(to, r.texto, cfg)) env++; await new Promise(x => setTimeout(x, 1200)) }
    return res.status(200).json({ enviados: env, lojas: resumos.length, destinatarios: dest.length, resumos: resumos.map(r => ({ loja: r.loja, total: r.total, crit: r.crit })) })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro na requisição semanal' })
  }
}
