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
"itens":[{"produto":"nome curto","categoria":"","quantidade":numero,"unidade":"kg|g|L|ml|un|cx|pct|dz","conteudo":numero,"marca":"","fornecedor":"","preco_unitario":numero,"valor_total":numero,"confianca":0a100}]}
Regras: quantidade é numérica (ex.: "3x1kg" => quantidade 3, unidade "kg"). "conteudo" = unidades internas quando caixa/pacote (senão 1). unidade deve ser uma das listadas. data_emissao no formato ISO. Campo ilegível = null. Não invente dados.`

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

    const apiKey = ((await getGeminiKey()) || '').replace(/[^\x21-\x7E]/g, '')
    if (!apiKey) return res.status(500).json({ error: 'Gemini API Key não configurada.' })

    const fileResp = await fetch(fileUrl)
    if (!fileResp.ok) return res.status(400).json({ error: 'Não foi possível baixar o arquivo da nota.' })
    const b64 = Buffer.from(await fileResp.arrayBuffer()).toString('base64')

    const gBody = {
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', maxOutputTokens: 8192 },
    }
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    let txt = null, lastErr = 'Falha na IA', finish = null
    for (const model of models) {
      for (let t = 0; t < 2; t++) {
        const up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gBody),
        })
        const data = await up.json().catch(() => ({}))
        if (up.ok) {
          txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || null
          finish = data?.candidates?.[0]?.finishReason || null
          if (txt) break
          lastErr = 'IA retornou vazio (finishReason=' + finish + ')'
          continue
        }
        lastErr = data?.error?.message || `HTTP ${up.status}`
        if (up.status === 429 || up.status === 503) { await new Promise(r => setTimeout(r, 900 * (t + 1))); continue }
        break
      }
      if (txt) break
    }
    if (!txt) return res.status(503).json({ error: 'IA indisponível: ' + lastErr })

    let parsed = {}
    let parseErr = null
    try { parsed = JSON.parse(txt.replace(/```json|```/g, '').trim()) } catch (e) { parsed = {}; parseErr = e.message }
    const cabecalho = parsed.cabecalho || {}
    const itens = Array.isArray(parsed.itens) ? parsed.itens : []
    const out = { ok: true, cabecalho, itens, total: itens.length }
    if (!itens.length) out._debug = { finish, parseErr, rawHead: String(txt).slice(0, 400) }
    return res.status(200).json(out)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no OCR da nota' })
  }
}
