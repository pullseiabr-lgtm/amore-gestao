// Vercel Serverless Function — OCR/IA de uma nota fiscal (cabeçalho + itens) via Gemini vision
// Recebe { file_url, mime } (PDF ou imagem), baixa no servidor e devolve { cabecalho, itens }.
async function getGeminiKey() {
  const envKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (envKey) return envKey
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/app_config?chave=eq.gemini_api&select=valor`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
    })
    const rows = await r.json().catch(() => [])
    return rows?.[0]?.valor?.key || ''
  } catch { return '' }
}

const PROMPT = `Você lê notas fiscais e recibos de compra de restaurante. Leia TODAS as páginas deste documento e extraia o cabeçalho e os produtos.
Responda APENAS um JSON válido (sem markdown, sem texto fora do JSON), no formato:
{"cabecalho":{"fornecedor":"","cnpj":"","numero_nota":"","serie":"","chave_acesso":"","data_emissao":"YYYY-MM-DD","valor_total":numero,"forma_pagamento":""},
"itens":[{"produto":"nome curto","categoria":"","codigo_fornecedor":"","codigo_barras":"","ncm":"","quantidade":numero,"unidade":"kg|g|L|ml|un|cx|pct|dz","conteudo":numero,"marca":"","fornecedor":"","preco_unitario":numero,"valor_total":numero,"confianca":0a100}]}
Regras: quantidade é numérica (ex.: "3x1kg" => quantidade 3, unidade "kg"). "conteudo" = unidades internas quando caixa/pacote (senão 1). unidade deve ser uma das listadas. "codigo_fornecedor" = código/ref do produto na nota. "codigo_barras" = EAN/GTIN se houver. "ncm" = código NCM do item se houver. data_emissao no formato ISO. Campo ilegível = null. Não invente dados.`


export const config = { maxDuration: 60 }

// ── Segunda IA (OpenAI GPT) em paralelo com o Gemini — cada leitor erra em campos diferentes ──
async function getOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/app_config?chave=eq.openai_api&select=valor`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
    })
    const rows = await r.json().catch(() => [])
    return rows?.[0]?.valor?.key || ''
  } catch { return '' }
}

// Normaliza a resposta da IA (objeto ou array de notas) para { cabecalho, itens }
function normalizar(txt) {
  let parsed = {}
  try { parsed = JSON.parse(String(txt).replace(/```json|```/g, '').trim()) } catch { parsed = {} }
  if (Array.isArray(parsed)) {
    const notas = parsed.filter(n => n && typeof n === 'object')
    return { cabecalho: notas[0]?.cabecalho || {}, itens: notas.flatMap(n => Array.isArray(n.itens) ? n.itens : []), multi: parsed.length }
  }
  return { cabecalho: parsed.cabecalho || {}, itens: Array.isArray(parsed.itens) ? parsed.itens : [], multi: 1 }
}

async function lerGemini(apiKey, mime, b64) {
  const gBody = {
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 8192 },
  }
  let lastErr = 'Falha na IA'
  for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite']) {
    for (let t = 0; t < 2; t++) {
      const up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gBody),
      })
      const data = await up.json().catch(() => ({}))
      if (up.ok) {
        const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || null
        if (txt) return normalizar(txt)
        lastErr = 'IA retornou vazio'; continue
      }
      lastErr = data?.error?.message || `HTTP ${up.status}`
      if (up.status === 429 || up.status === 503) { await new Promise(r => setTimeout(r, 900 * (t + 1))); continue }
      break
    }
  }
  throw new Error(lastErr)
}

async function lerGPT(apiKey, mime, b64) {
  if (!/^image\//.test(mime)) throw new Error('GPT lê só imagem (PDF fica com o Gemini)')
  let lastErr = 'Falha no GPT'
  for (const model of ['gpt-4.1', 'gpt-4o']) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 45000)
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model, temperature: 0.1, max_tokens: 8000, response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } },
          ] }],
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { const txt = d?.choices?.[0]?.message?.content; if (txt) return { ...normalizar(txt), modelo: model }; lastErr = 'GPT retornou vazio'; continue }
      lastErr = d?.error?.message || `HTTP ${r.status}`
    } catch (e) { lastErr = e.name === 'AbortError' ? 'GPT demorou demais' : e.message } finally { clearTimeout(timer) }
  }
  throw new Error(lastErr)
}

// ── Validações que não dependem de IA ──
const dig = s => String(s || '').replace(/\D/g, '')
const num = v => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : null }
function cnpjValido(c) {
  c = dig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const calc = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9 } const r = s % 11; return r < 2 ? 0 : 11 - r }
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13])
}
function chaveValida(k) {
  k = dig(k); if (k.length !== 44) return false
  let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += Number(k[i]) * p; p = p === 9 ? 2 : p + 1 }
  const r = s % 11, dv = r < 2 ? 0 : 11 - r
  return dv === Number(k[43])
}
const fmtCnpj = c => { c = dig(c); return c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c }
const somaItens = itens => Math.round(itens.reduce((a, i) => a + (num(i.valor_total) || 0), 0) * 100) / 100
const normTxt = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const tokens = s => new Set(normTxt(s).split(' ').filter(t => t.length > 1))
function parecidos(a, b) {
  if (a.codigo_fornecedor && b.codigo_fornecedor && normTxt(a.codigo_fornecedor) === normTxt(b.codigo_fornecedor)) return 1
  const A = tokens(a.produto), B = tokens(b.produto); if (!A.size || !B.size) return 0
  let c = 0; for (const t of A) if (B.has(t)) c++
  return c / Math.max(A.size, B.size)
}

// Erro comum da IA: pôr o valor UNITÁRIO no lugar do total da linha. Se a soma não fecha com o total da nota,
// procura o conjunto de itens (qtd > 1) cujo total = unitário × qtd faz a soma bater — só corrige se fechar exato.
function repararSoma(itens, total) {
  if (total == null || !itens.length) return []
  const soma = somaItens(itens), falta = Math.round((total - soma) * 100) / 100
  if (Math.abs(falta) <= 0.05) return []
  const cand = itens.map((it, i) => ({ i, d: Math.round((num(it.valor_total) || 0) * ((num(it.quantidade) || 1) - 1) * 100) / 100 })).filter(c => c.d > 0).slice(0, 16)
  for (let mask = 1; mask < (1 << cand.length); mask++) {
    let acc = 0; for (let b = 0; b < cand.length; b++) if (mask & (1 << b)) acc += cand[b].d
    if (Math.abs(acc - falta) <= 0.05) {
      const feitos = []
      for (let b = 0; b < cand.length; b++) if (mask & (1 << b)) {
        const it = itens[cand[b].i]; it.valor_unitario = num(it.valor_total); it.valor_total = Math.round(num(it.valor_total) * num(it.quantidade) * 100) / 100; it._corrigido = 'valor lido era unitário'; feitos.push(it.produto)
      }
      return feitos
    }
  }
  return []
}

// Junta as duas leituras: valida cada uma, escolhe a mais coerente e marca divergências para conferência
function consolidar(g, o) {
  const alertas = []
  const leitores = { gemini: !!g, gpt: !!o }
  for (const r of [g, o]) if (r) { const t = num(r.cabecalho?.valor_total); const fx = repararSoma(r.itens, t); if (fx.length) alertas.push(`Valor corrigido automaticamente (a IA leu o unitário no lugar do total): ${fx.join(', ')}.`) }
  const A = g || o, B = g && o ? o : null
  const cab = { ...A.cabecalho }
  const conferir = {}

  // Cabeçalho: campos em que as duas IAs divergem
  if (B) {
    for (const k of ['cnpj', 'numero_nota', 'serie', 'chave_acesso', 'data_emissao', 'valor_total', 'forma_pagamento']) {
      const x = A.cabecalho?.[k], y = B.cabecalho?.[k]
      const numerico = k === 'valor_total' || k === 'numero_nota' || k === 'serie'
      const nx = k === 'valor_total' ? num(x) : numerico ? String(Number(dig(x))) : dig(x) || normTxt(x), ny = k === 'valor_total' ? num(y) : numerico ? String(Number(dig(y))) : dig(y) || normTxt(y)
      if (x && y && nx !== ny) conferir[k] = { gemini: g.cabecalho[k], gpt: o.cabecalho[k] }
      else if (!x && y) cab[k] = y
    }
    // CNPJ/chave: vale o que passa na validação matemática
    for (const k of ['cnpj', 'chave_acesso']) {
      const ok = k === 'cnpj' ? cnpjValido : chaveValida
      if (conferir[k]) { const alt = [g.cabecalho[k], o.cabecalho[k]].find(v => ok(v)); if (alt) { cab[k] = alt; delete conferir[k] } }
    }
  }
  // A chave de acesso (44 dígitos) traz CNPJ do emitente, série e nº da nota: se for válida, ela manda
  const chave = dig(cab.chave_acesso)
  if (chaveValida(chave)) {
    const cnpjChave = chave.slice(6, 20), serie = String(Number(chave.slice(22, 25))), nnf = String(Number(chave.slice(25, 34)))
    if (dig(cab.cnpj) !== cnpjChave) { if (cab.cnpj) alertas.push(`CNPJ corrigido pela chave de acesso: ${fmtCnpj(cab.cnpj)} → ${fmtCnpj(cnpjChave)}`); cab.cnpj = fmtCnpj(cnpjChave); delete conferir.cnpj }
    if (cab.serie && String(Number(dig(cab.serie))) !== serie) { cab.serie = serie; delete conferir.serie }
    if (cab.numero_nota && String(Number(dig(cab.numero_nota))) !== nnf) { alertas.push(`Nº da nota corrigido pela chave: ${cab.numero_nota} → ${nnf}`); cab.numero_nota = nnf; delete conferir.numero_nota }
  } else if (chave) {
    alertas.push(`Chave de acesso inválida (${chave.length} dígitos) — confira com a nota.`)
    conferir.chave_acesso = conferir.chave_acesso || { lido: cab.chave_acesso }
  }
  if (cab.cnpj && !cnpjValido(cab.cnpj)) { alertas.push(`CNPJ lido (${cab.cnpj}) não passa na validação — confira.`); conferir.cnpj = conferir.cnpj || { lido: cab.cnpj } }

  // Itens: escolhe a leitura cuja soma mais se aproxima do total da nota como base
  const total = num(cab.valor_total)
  let base = A.itens, outra = B ? B.itens : null
  if (B && total != null && Math.abs(somaItens(B.itens) - total) < Math.abs(somaItens(A.itens) - total) - 0.005) { base = B.itens; outra = A.itens }
  const itens = base.map(it => ({ ...it }))
  if (outra) {
    const usados = new Set()
    itens.forEach(it => {
      let best = -1, bs = 0
      outra.forEach((o2, j) => { if (usados.has(j)) return; const s = parecidos(it, o2); if (s > bs) { bs = s; best = j } })
      if (best >= 0 && bs >= 0.5) {
        usados.add(best); const o2 = outra[best], div = []
        for (const k of ['quantidade', 'valor_total', 'codigo_fornecedor', 'ncm']) {
          const a = k === 'codigo_fornecedor' || k === 'ncm' ? normTxt(it[k]) : num(it[k]), b = k === 'codigo_fornecedor' || k === 'ncm' ? normTxt(o2[k]) : num(o2[k])
          if (a != null && b != null && a !== '' && b !== '' && (typeof a === 'number' ? Math.abs(a - b) > 0.005 : a !== b)) div.push({ campo: k, valor: it[k], outra_ia: o2[k] })
        }
        if (div.length) it._conferir = div
      } else it._conferir = [{ campo: 'item', valor: it.produto, outra_ia: 'não encontrado pela outra IA' }]
    })
    outra.forEach((o2, j) => { if (!usados.has(j)) alertas.push(`A outra IA leu um item que esta leitura não tem: ${o2.produto} (${o2.quantidade} ${o2.unidade || ''}, R$ ${o2.valor_total})`) })
  }
  // Soma dos itens × total da nota (frete/desconto podem explicar diferença pequena)
  const soma = somaItens(itens)
  const soma_ok = total == null || Math.abs(soma - total) <= 0.05
  if (!soma_ok) alertas.push(`Soma dos itens (R$ ${soma.toFixed(2)}) não bate com o total da nota (R$ ${total.toFixed(2)}) — diferença de R$ ${(soma - total).toFixed(2)}.`)
  const confiavel = soma_ok && total != null && cnpjValido(cab.cnpj) && chaveValida(cab.chave_acesso)
  if (confiavel && B) {
    // soma dos itens, CNPJ e chave (44 dígitos) batem com a nota: a leitura base é confiável; a outra IA não gera alarme
    itens.forEach(i => { delete i._conferir })
    for (const k of Object.keys(conferir)) delete conferir[k]
    for (let i = alertas.length - 1; i >= 0; i--) if (alertas[i].startsWith('A outra IA leu')) alertas.splice(i, 1)
    alertas.unshift('✅ Leitura conferida: a soma dos itens, o CNPJ e a chave de acesso batem com a nota.')
  }
  const nDiv = itens.filter(i => i._conferir).length
  if (nDiv) alertas.push(`${nDiv} item(ns) com leitura divergente entre as duas IAs — confira os marcados.`)
  if (Object.keys(conferir).length) cab._conferir = conferir
  return { cabecalho: cab, itens, validacao: { leitores, confiavel, soma_itens: soma, total_nota: total, soma_ok, cnpj_ok: cnpjValido(cab.cnpj), chave_ok: chaveValida(cab.chave_acesso), divergencias: nDiv }, alertas }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const fileUrl = body.file_url
    if (!fileUrl) return res.status(400).json({ error: 'file_url obrigatório.' })
    let mime = body.mime
    if (!mime) {
      const u = fileUrl.toLowerCase()
      mime = u.endsWith('.pdf') ? 'application/pdf' : u.endsWith('.png') ? 'image/png' : (u.endsWith('.webp') ? 'image/webp' : 'image/jpeg')
    }
    const [gKeyRaw, oKeyRaw] = await Promise.all([getGeminiKey(), getOpenAIKey()])
    const gKey = (gKeyRaw || '').replace(/[^\x21-\x7E]/g, ''), oKey = (oKeyRaw || '').replace(/[^\x21-\x7E]/g, '')
    if (!gKey && !oKey) return res.status(500).json({ error: 'Nenhuma chave de IA configurada (Gemini/OpenAI).' })

    const fileResp = await fetch(fileUrl)
    if (!fileResp.ok) return res.status(400).json({ error: 'Não foi possível baixar o arquivo da nota.' })
    const b64 = Buffer.from(await fileResp.arrayBuffer()).toString('base64')

    // Duas IAs ao mesmo tempo. Se o Gemini já fechou (soma dos itens, CNPJ e chave batem), não espera o GPT;
    // se não fechou, o GPT vira segunda opinião (espera até 25 s). Se uma cair, segue com a outra.
    const pg = gKey ? lerGemini(gKey, mime, b64) : Promise.reject(new Error('sem chave Gemini'))
    const po = oKey ? lerGPT(oKey, mime, b64) : Promise.reject(new Error('sem chave OpenAI'))
    po.catch(() => {})
    const settle = p => p.then(value => ({ status: 'fulfilled', value }), reason => ({ status: 'rejected', reason }))
    const rg = await settle(pg)
    const g0 = rg.status === 'fulfilled' && rg.value.itens.length ? rg.value : null
    let ro
    if (g0 && consolidar(g0, null).validacao.confiavel) ro = { status: 'rejected', reason: new Error('dispensado — leitura do Gemini conferiu com a nota') }
    else ro = await settle(Promise.race([po, new Promise((_, rej) => setTimeout(() => rej(new Error('GPT demorou demais')), 25000))]))
    const g = rg.status === 'fulfilled' && rg.value.itens.length ? rg.value : null
    const o = ro.status === 'fulfilled' && ro.value.itens.length ? ro.value : null
    if (!g && !o) return res.status(503).json({ error: 'IA indisponível: ' + [rg.reason?.message, ro.reason?.message].filter(Boolean).join(' | ') })

    const c = consolidar(g, o)
    const erros = { gemini: rg.status === 'rejected' ? rg.reason?.message : null, gpt: ro.status === 'rejected' ? ro.reason?.message : null }
    return res.status(200).json({
      ok: true, cabecalho: c.cabecalho, itens: c.itens, total: c.itens.length, multi: (g || o).multi,
      validacao: c.validacao, alertas: c.alertas, leitores_erro: erros,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no OCR da nota' })
  }
}
