/**
 * Vercel Serverless Function — proxy para Brave Search API
 * Evita bloqueio CORS ao chamar a API diretamente do browser.
 *
 * GET /api/brave-search?q=<query>[&t=<api_key>]
 *   q  → texto da busca
 *   t  → Brave API key do cliente (opcional se BRAVE_API_KEY env var definida)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const q     = req.query?.q
  const token = req.query?.t || process.env.BRAVE_API_KEY

  if (!q) {
    res.status(400).json({ error: 'Missing q parameter' })
    return
  }
  if (!token) {
    res.status(503).json({ error: 'Brave API key not configured' })
    return
  }

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', q)
    url.searchParams.set('count', '6')
    url.searchParams.set('country', 'BR')
    url.searchParams.set('search_lang', 'pt')

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': token,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      res.status(response.status).json({ error: data?.message || `HTTP ${response.status}` })
      return
    }

    // Cache de 10 minutos (resultados de preço não mudam tão rápido)
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60')
    res.status(200).json(data)
  } catch (err) {
    res.status(500).json({ error: 'Proxy error: ' + err.message })
  }
}
