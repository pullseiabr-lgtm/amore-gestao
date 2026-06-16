// Vercel Serverless Function — envio via Evolution API (gateway WhatsApp grátis, no VPS).
// As credenciais ficam em variáveis de ambiente (não no código). O cliente só manda { phone, message }.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   EVOLUTION_URL       = http://2.25.193.109:8080
//   EVOLUTION_KEY       = chave global (apikey)
//   EVOLUTION_INSTANCE  = nome da instância conectada (ex: esdras)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const url = process.env.EVOLUTION_URL
  const key = process.env.EVOLUTION_KEY
  const instance = process.env.EVOLUTION_INSTANCE
  if (!url || !key || !instance) {
    return res.status(503).json({ error: 'Evolution não configurada (EVOLUTION_URL / EVOLUTION_KEY / EVOLUTION_INSTANCE).' })
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const { phone, message } = body || {}
  if (!phone)   return res.status(400).json({ error: 'Informe o número (phone).' })
  if (!message) return res.status(400).json({ error: 'Mensagem vazia.' })

  const fone = String(phone).replace(/\D/g, '')

  try {
    const r = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: fone, text: message }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: data?.message || data?.error || `Evolution HTTP ${r.status}`, data })
    return res.status(200).json({ ok: true, id: data?.key?.id, status: data?.status })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao enviar pela Evolution' })
  }
}
