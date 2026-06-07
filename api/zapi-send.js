// Vercel Serverless Function — proxy de envio via Z-API (gateway WhatsApp por QR).
// Recebe as credenciais e a mensagem do cliente e encaminha ao Z-API.
// Não guarda segredos no código (repositório público). Evita bloqueio de CORS no navegador.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const { instance, token, clientToken, phone, message } = body || {}

  if (!instance || !token) return res.status(400).json({ error: 'Informe instance e token do Z-API.' })
  if (!phone) return res.status(400).json({ error: 'Informe o número (phone).' })
  if (!message) return res.status(400).json({ error: 'Mensagem vazia.' })

  const fone = String(phone).replace(/\D/g, '')

  try {
    const headers = { 'Content-Type': 'application/json' }
    if (clientToken) headers['Client-Token'] = clientToken
    const r = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
      method: 'POST', headers, body: JSON.stringify({ phone: fone, message }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: data?.error || data?.message || `Z-API HTTP ${r.status}`, data })
    return res.status(200).json({ ok: true, ...data })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao enviar pelo Z-API' })
  }
}
