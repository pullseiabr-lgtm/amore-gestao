// Vercel Serverless Function — proxy para Brave Search API
// Resolve CORS: o browser não pode chamar api.search.brave.com diretamente
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { q, t } = req.query

  if (!q) {
    return res.status(400).json({ error: 'Parâmetro q (query) obrigatório' })
  }

  // Chave: prioridade => parâmetro ?t= (passado pelo client) ou variável de ambiente
  // Sanitiza: remove BOM (U+FEFF), espaços e qualquer caractere fora do ASCII imprimível,
  // pois headers HTTP (ByteString) não aceitam caracteres > 255.
  const apiKey = (t || process.env.VITE_BRAVE_API_KEY || process.env.BRAVE_API_KEY || '')
    .replace(/[^\x21-\x7E]/g, '')

  if (!apiKey) {
    return res.status(500).json({ error: 'Brave API Key não configurada. Informe a chave em Configurações da Liz.' })
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&country=br`

    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
    })

    if (!upstream.ok) {
      const body = await upstream.text()
      return res.status(upstream.status).json({ error: `Brave API: ${upstream.status} — ${body.slice(0, 200)}` })
    }

    const data = await upstream.json()
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no proxy Brave Search' })
  }
}
