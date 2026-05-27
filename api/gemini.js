// Vercel Serverless Function — proxy para Google Gemini API
// Resolve segurança: a API key fica no servidor, nunca exposta ao browser
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' })
  }

  // Prioridade: env var server-side > cliente (evita chave antiga/inválida do localStorage)
  // VITE_GEMINI_API_KEY é plain type — disponível no process.env em alguns contextos Vercel
  const serverKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  const clientKey = req.query.k  // chave enviada pelo browser (do bundle ou localStorage)
  const apiKey = serverKey || clientKey

  if (!apiKey) {
    return res.status(500).json({
      error: 'Gemini API Key não configurada. Acesse Config na Liz e insira sua chave do Google AI Studio (aistudio.google.com).'
    })
  }

  const model = req.query.model || 'gemini-2.5-flash'

  try {
    const body = req.body
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await upstream.json()

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Gemini HTTP ${upstream.status}`
      })
    }

    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no proxy Gemini' })
  }
}
