// Vercel Serverless Function — PORTAL EXTERNO de cotação do fornecedor.
//
// O fornecedor abre um link exclusivo (/cotacao.html?t=<token>) e vê SOMENTE os
// produtos da cotação dele. Nenhum dado interno da Amore é exposto (último preço,
// estoque, motivo, outros fornecedores, comparativo). Sem acesso ao painel.
//
// Segurança: token único e secreto (28 chars). Valida existência, validade e
// bloqueio. Registra IP, dispositivo e acessos. Bloqueia após a resposta final.
//
// GET  ?t=token            -> dados da cotação do fornecedor (campos públicos)
// POST { t, action, ... }  -> 'salvar' (rascunho) ou 'finalizar' (grava e bloqueia)
//
// Metadados/rastreio: app_config chave `cot_tok:<token>`.
// Resposta final grava em requisicao_cotacoes + requisicao_cotacao_itens (comparativo).

const SB = () => process.env.VITE_SUPABASE_URL
const KEY = () => process.env.VITE_SUPABASE_ANON_KEY
const H = () => ({ apikey: KEY(), Authorization: 'Bearer ' + KEY(), 'Content-Type': 'application/json' })
const rest = (path, opts = {}) => fetch(SB() + '/rest/v1/' + path, { ...opts, headers: { ...H(), ...(opts.headers || {}) } })
const getJson = async (path) => { try { return await (await rest(path)).json() } catch { return null } }
const TOKCH = (t) => 'cot_tok:' + t

async function readTok(token) {
  const rows = await getJson('app_config?select=valor&chave=eq.' + encodeURIComponent(TOKCH(token)))
  return rows?.[0]?.valor || null
}
async function saveTok(tok) {
  const body = JSON.stringify({ chave: TOKCH(tok.token), valor: tok, updated_at: new Date().toISOString() })
  const r = await rest('app_config?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body })
  if (!r.ok) await rest('app_config?chave=eq.' + encodeURIComponent(TOKCH(tok.token)), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ valor: tok }) })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (!SB() || !KEY()) return res.status(503).json({ erro: 'config' })

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null
  const device = (req.headers['user-agent'] || '').slice(0, 180)

  // token vem da query (GET) ou do corpo (POST)
  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const token = (req.method === 'GET' ? (req.query?.t || '') : (body?.t || '')).toString().trim()
  if (!token || !/^[a-z0-9]{20,40}$/.test(token)) return res.status(200).json({ erro: 'token_invalido' })

  const tok = await readTok(token)
  if (!tok) return res.status(200).json({ erro: 'nao_encontrado' })
  if (tok.status === 'cancelado') return res.status(200).json({ erro: 'cancelado' })
  if (tok.validade && new Date(tok.validade).getTime() < Date.now()) return res.status(200).json({ erro: 'expirado' })

  // ── GET: carrega a cotação (apenas campos públicos) ──
  if (req.method === 'GET') {
    // registra acesso
    tok.acessos = (tok.acessos || 0) + 1
    tok.aberto_em = tok.aberto_em || new Date().toISOString()
    tok.ip = ip; tok.device = device
    if (tok.status === 'enviado') tok.status = 'aberto'
    await saveTok(tok)

    const bloqueado = tok.status === 'respondido' || tok.status === 'bloqueado'
    // Só os itens direcionados a ESTE fornecedor (subconjunto). Sem item_ids = lista toda (compat).
    let itQ = 'requisicao_itens?select=id,produto_nome,categoria,quantidade,unidade&requisicao_id=eq.' + tok.requisicao_id
    if (Array.isArray(tok.item_ids) && tok.item_ids.length) itQ += '&id=in.(' + tok.item_ids.join(',') + ')'
    itQ += '&order=produto_nome.asc'
    const itensRaw = (await getJson(itQ)) || []
    const itens = itensRaw.map(i => ({ item_id: i.id, produto_nome: i.produto_nome, categoria: i.categoria, quantidade: i.quantidade, unidade: i.unidade }))
    return res.status(200).json({
      ok: true, bloqueado,
      cotacao: { numero: tok.numero, titulo: tok.titulo, loja: tok.loja, fornecedor_nome: tok.fornecedor_nome, prazo_resposta: tok.prazo_resposta, validade: tok.validade },
      itens, resposta: tok.resposta || null, status: tok.status,
    })
  }

  // ── POST: salvar rascunho ou finalizar ──
  if (req.method !== 'POST') return res.status(405).json({ erro: 'metodo' })
  if (tok.status === 'respondido' || tok.status === 'bloqueado') return res.status(200).json({ erro: 'ja_finalizada' })

  const action = body?.action === 'finalizar' ? 'finalizar' : 'salvar'
  const resposta = body?.resposta && typeof body.resposta === 'object' ? body.resposta : {}
  tok.resposta = resposta
  tok.ip = ip; tok.device = device

  if (action === 'salvar') { await saveTok(tok); return res.status(200).json({ ok: true, salvo: true }) }

  // finalizar → grava no comparativo (requisicao_cotacoes + itens)
  const itensResp = Array.isArray(resposta.itens) ? resposta.itens : []
  const geral = resposta.geral || {}
  // total = soma(preço unitário × quantidade) dos itens disponíveis
  const reqItens = (await getJson('requisicao_itens?select=id,quantidade&requisicao_id=eq.' + tok.requisicao_id)) || []
  const qtdDe = {}; reqItens.forEach(i => { qtdDe[i.id] = Number(i.quantidade) || 0 })
  let total = 0
  const linhas = []
  for (const it of itensResp) {
    const preco = Number(it.preco_unitario) || 0
    const disp = it.disponivel !== false
    if (disp && preco > 0) total += preco * (qtdDe[it.item_id] || 0)
    linhas.push({
      cotacao_id: tok.cotacao_id, item_id: it.item_id,
      preco_unitario: disp ? preco : null, disponivel: disp,
      observacoes: JSON.stringify({ marca: it.marca || '', qtd_disp: it.qtd_disp || null, obs: it.obs || '' }),
    })
  }
  // grava itens (upsert por (cotacao_id,item_id) não garantido → apaga e recria)
  await rest('requisicao_cotacao_itens?cotacao_id=eq.' + tok.cotacao_id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => {})
  if (linhas.length) await rest('requisicao_cotacao_itens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(linhas) }).catch(() => {})
  await rest('requisicao_cotacoes?id=eq.' + tok.cotacao_id, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'respondida', total,
      prazo_entrega: Number(geral.prazo_entrega) || null,
      observacoes: JSON.stringify({ frete: Number(geral.frete) || 0, condicao_pagamento: geral.condicao_pagamento || '', validade_proposta: geral.validade_proposta || '', obs: geral.obs || '', portal: true }),
      updated_at: new Date().toISOString(),
    }),
  }).catch(() => {})

  tok.status = 'respondido'; tok.respondido_em = new Date().toISOString()
  await saveTok(tok)
  return res.status(200).json({ ok: true, finalizado: true })
}
