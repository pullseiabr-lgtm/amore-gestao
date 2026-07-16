// Vercel Serverless Function — OCR/IA de notas fiscais de um caixa (Gemini vision)
// Recebe { caixa_id } ou { pdf_url }, baixa o PDF no servidor, envia ao Gemini
// e devolve os itens estruturados extraídos das notas (para conferência humana).
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

const PROMPT = `Você lê notas fiscais e recibos de compras de restaurante. Analise TODAS as notas/recibos deste PDF (pode ignorar a tabela-resumo da primeira página). Extraia CADA produto comprado.
Responda APENAS um JSON array válido (sem markdown, sem texto fora do array), no formato:
[{"produto":"nome curto do produto","quantidade":numero,"unidade":"kg|g|L|ml|un|cx|pct|dz","conteudo":numero,"marca":"","fornecedor":"","preco_unitario":numero,"valor_total":numero,"confianca":0a100}]
Regras: quantidade é numérica (ex.: "3x1kg" => quantidade 3, unidade "kg"). "conteudo" = unidades internas quando for caixa/pacote (senão 1). unidade deve ser uma das listadas. Campo ilegível = null. Não invente dados.`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    let pdfUrl = body.pdf_url
    const caixaId = body.caixa_id

    if (!pdfUrl && caixaId) {
      const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/caixas?id=eq.${caixaId}&select=anexo_url`, {
        headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
      })
      const rows = await r.json().catch(() => [])
      pdfUrl = rows?.[0]?.anexo_url
    }
    if (!pdfUrl) return res.status(400).json({ error: 'Caixa sem PDF anexado.' })

    const apiKey = ((await getGeminiKey()) || '').replace(/[^\x21-\x7E]/g, '')
    if (!apiKey) return res.status(500).json({ error: 'Gemini API Key não configurada.' })

    // baixa o PDF no servidor (evita limite de body do navegador)
    const pdfResp = await fetch(pdfUrl)
    if (!pdfResp.ok) return res.status(400).json({ error: 'Não foi possível baixar o PDF do caixa.' })
    const b64 = Buffer.from(await pdfResp.arrayBuffer()).toString('base64')

    const gBody = {
      contents: [{ parts: [{ inline_data: { mime_type: 'application/pdf', data: b64 } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    let txt = null, lastErr = 'Falha na IA'
    for (const model of models) {
      for (let t = 0; t < 2; t++) {
        const up = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(gBody),
        })
        const data = await up.json().catch(() => ({}))
        if (up.ok) { txt = data?.candidates?.[0]?.content?.parts?.[0]?.text; break }
        lastErr = data?.error?.message || `HTTP ${up.status}`
        if (up.status === 429 || up.status === 503) { await new Promise(r => setTimeout(r, 900 * (t + 1))); continue }
        break
      }
      if (txt) break
    }
    if (!txt) return res.status(503).json({ error: 'IA indisponível: ' + lastErr })

    let itens = []
    try { itens = JSON.parse(txt.replace(/```json|```/g, '').trim()) } catch { itens = [] }
    if (!Array.isArray(itens)) itens = []
    return res.status(200).json({ ok: true, itens, total: itens.length })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no OCR' })
  }
}
