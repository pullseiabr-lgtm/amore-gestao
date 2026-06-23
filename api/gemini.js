// Vercel Serverless Function — proxy para Google Gemini API
// Resolve segurança: a API key fica no servidor, nunca exposta ao browser
//
// Resolve a chave do Gemini com 3 níveis de fallback (mesma estratégia da Evolution):
//   1. env var server-side (VITE_GEMINI_API_KEY / GEMINI_API_KEY)
//   2. tabela app_config do Supabase (chave 'gemini_api', valor { key })
//      → funciona mesmo em projetos/contas Vercel SEM a env var, desde que tenham VITE_SUPABASE_*
//   3. chave enviada pelo browser (?k=, do bundle ou localStorage)
async function getGeminiKey(clientKey) {
  const envKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (envKey) return envKey
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/app_config?chave=eq.gemini_api&select=valor`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
    })
    const rows = await r.json().catch(() => [])
    const k = rows?.[0]?.valor?.key
    if (k) return k
  } catch { /* cai para a chave do cliente */ }
  return clientKey || ''
}

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

  // Prioridade: env var server-side > app_config (Supabase) > cliente
  const resolvedKey = await getGeminiKey(req.query.k)
  // Sanitiza: remove BOM (U+FEFF), espaços e caracteres não-ASCII que invalidam a chave
  const apiKey = (resolvedKey || '').replace(/[^\x21-\x7E]/g, '')

  if (!apiKey) {
    return res.status(500).json({
      error: 'Gemini API Key não configurada. Acesse Config na Liz e insira sua chave do Google AI Studio (aistudio.google.com).'
    })
  }

  const requested = req.query.model || 'gemini-2.5-flash'
  // Modelo pedido + 1 fallback com quota disponível (lite), caso o principal esteja sobrecarregado.
  // Mantido curto p/ não estourar o timeout da função.
  const modelos = [requested, 'gemini-2.5-flash-lite'].filter((m, i, a) => a.indexOf(m) === i)
  const body = req.body
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))

  // Detecta erro transitório (sobrecarga / indisponível) que vale a pena tentar de novo
  const ehTransitorio = (status, msg) =>
    status === 429 || status === 503 || status === 500 ||
    /high demand|overloaded|unavailable|try again|temporar/i.test(msg || '')

  try {
    let ultimoErro = { status: 500, msg: 'Falha ao chamar o Gemini' }

    for (const model of modelos) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
      // Até 2 tentativas por modelo, com backoff, em caso de sobrecarga
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        let upstream, data
        try {
          upstream = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          data = await upstream.json()
        } catch (e) {
          ultimoErro = { status: 502, msg: e.message || 'Falha de rede' }
          await sleep(500 * (tentativa + 1))
          continue
        }

        if (upstream.ok) return res.status(200).json(data)

        const msg = data?.error?.message || `Gemini HTTP ${upstream.status}`
        ultimoErro = { status: upstream.status, msg }

        if (ehTransitorio(upstream.status, msg) && tentativa < 2) {
          await sleep(700 * (tentativa + 1)) // 700ms, 1400ms
          continue
        }
        break // erro não-transitório → tenta o próximo modelo
      }
    }

    // Esgotou tentativas e modelos
    const amigavel = ehTransitorio(ultimoErro.status, ultimoErro.msg)
      ? 'A IA está com alta demanda no momento. Tente novamente em alguns segundos.'
      : ultimoErro.msg
    return res.status(ultimoErro.status === 200 ? 503 : ultimoErro.status).json({ error: amigavel })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro interno no proxy Gemini' })
  }
}
