// Vercel Serverless Function — Entrada automática no ESTOQUE a partir do recebimento de um pedido.
// Chamado por public/pedido.html ao confirmar "Recebido integral".
// Casa cada item do pedido (nome livre) com estoque_produtos (por loja + nome) e dá entrada via RPC
// entrada_por_leitura (cria lote + soma no nível). Entra APENAS nos produtos que já existem no estoque;
// os não cadastrados voltam na lista `naoCadastrados` para cadastro manual — nunca cria produto errado.
// Usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.

const canon = l => ({ 'Amore Costa Dourada': 'Amore CD', 'Flow Paiva': 'Flow CD' }[l] || l || '')
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
const toks = s => norm(s).split(' ').filter(t => t.length > 2)

async function sbGet(path) {
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
    })
    return r.ok ? r.json() : []
  } catch { return [] }
}
async function rpc(fn, body) {
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return r.ok ? r.json() : null
  } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, erro: 'metodo' })
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) return res.status(500).json({ ok: false, erro: 'config' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const chaveRaw = (body?.chave || '').trim()
  const chave = chaveRaw.startsWith('pedido_') ? chaveRaw : ('pedido_' + chaveRaw)
  const nf = body?.nf || null
  const por = body?.por || 'Recebimento'
  if (!chaveRaw) return res.status(400).json({ ok: false, erro: 'chave' })

  const rows = await sbGet('app_config?select=valor&chave=eq.' + encodeURIComponent(chave))
  const d = rows?.[0]?.valor
  if (!d) return res.status(200).json({ ok: false, erro: 'pedido_nao_encontrado' })
  // idempotência: se já entrou, não repete
  if (d.recebimento?.estoque) return res.status(200).json({ ok: true, entradas: d.recebimento.estoque.entradas || 0, naoCadastrados: d.recebimento.estoque.naoCadastrados || [], ja: true })

  const loja = canon(d.loja)
  const prods = await sbGet(`estoque_produtos?loja=eq.${encodeURIComponent(loja)}&ativo=eq.true&select=id,nome,unidade&limit=6000`)
  const idx = (prods || []).map(p => ({ id: p.id, nome: p.nome, un: p.unidade, toks: toks(p.nome) })).filter(p => p.toks.length)
  const matchProduto = nome => {
    const set = new Set(toks(nome)); if (!set.size) return null
    let best = null, bn = 0
    for (const c of idx) { if (c.toks.every(t => set.has(t)) && c.toks.length > bn) { bn = c.toks.length; best = c } }
    return best
  }

  let entradas = 0
  const naoCadastrados = []
  for (const it of (d.itens || [])) {
    const qtd = Number(it.qtd) || 0
    if (qtd <= 0 || !it.produto) continue
    const m = matchProduto(it.produto)
    if (!m) { naoCadastrados.push(it.produto); continue }
    const r = await rpc('entrada_por_leitura', {
      p_produto_id: m.id, p_qtd_itens: 1, p_qtd_item: qtd, p_lote: null, p_validade: null,
      p_fornecedor: d.fornecedor || null, p_nota: nf, p_obs: `Entrada por recebimento${nf ? ' · NF ' + nf : ''}`, p_local: null, p_por: por,
    })
    if (r && r.ok !== false) entradas++
    else naoCadastrados.push(it.produto)
  }
  return res.status(200).json({ ok: true, entradas, naoCadastrados })
}
