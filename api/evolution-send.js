// Vercel Serverless Function — envio via Evolution API (gateway WhatsApp grátis, no VPS).
// As credenciais ficam em variáveis de ambiente (não no código). O cliente só manda { phone, message }.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   EVOLUTION_URL       = http://2.25.193.109:8080
//   EVOLUTION_KEY       = chave global (apikey)
//   EVOLUTION_INSTANCE  = nome da instância conectada (ex: esdras)
// Lê config da Evolution: variáveis de ambiente OU tabela app_config do Supabase
// (assim funciona mesmo em projetos Vercel sem as env vars, desde que tenham VITE_SUPABASE_*).
async function getEvolutionCfg() {
  if (process.env.EVOLUTION_URL && process.env.EVOLUTION_KEY && process.env.EVOLUTION_INSTANCE) {
    return { url: process.env.EVOLUTION_URL, key: process.env.EVOLUTION_KEY, instance: process.env.EVOLUTION_INSTANCE, recipients: process.env.EVOLUTION_RECIPIENTS || '' }
  }
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/app_config?chave=eq.evolution_api&select=valor`, {
      headers: { apikey: process.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}` },
    })
    const rows = await r.json().catch(() => [])
    return rows?.[0]?.valor || null
  } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' })

  const cfg = await getEvolutionCfg()
  const url = cfg?.url, key = cfg?.key, instance = cfg?.instance
  if (!url || !key || !instance) {
    return res.status(503).json({ error: 'Evolution não configurada (env ou app_config.evolution_api).' })
  }

  let body = req.body
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }

  // ── Recuperação de senha por WhatsApp (self-service do login) ──────────────
  // Body: { action:'recover', email }. Acha o WhatsApp no perfil, gera um código
  // (OTP) via service role e manda pelo WhatsApp. Nunca revela se o e-mail existe.
  if (body && body.action === 'recover') {
    const email = String(body.email || '').trim().toLowerCase()
    const generic = { ok: true, sent: false, message: 'Se o e-mail estiver cadastrado com WhatsApp, enviamos um código.' }
    if (!email) return res.status(400).json({ error: 'Informe o e-mail.' })
    const SUPA = process.env.VITE_SUPABASE_URL
    const SR = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
    if (!SUPA || !SR) return res.status(503).json({ error: 'Recuperação por WhatsApp não configurada no servidor (falta SUPABASE_SERVICE_ROLE_KEY).' })
    try {
      const pr = await fetch(`${SUPA}/rest/v1/profiles?select=name,permissions_override&email=eq.${encodeURIComponent(email)}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } })
      const prof = (await pr.json().catch(() => []))?.[0]
      if (!prof) return res.status(200).json(generic)
      const wpp = String(prof?.permissions_override?.__perfil__?.whatsapp || '').replace(/\D/g, '')
      if (!wpp) return res.status(200).json(generic)
      const gl = await fetch(`${SUPA}/auth/v1/admin/generate_link`, { method: 'POST', headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'recovery', email }) })
      const gj = await gl.json().catch(() => ({}))
      const otp = gj?.email_otp || gj?.properties?.email_otp
      if (!otp) return res.status(200).json(generic)
      const link = 'https://painel.amorefood.com.br/redefinir-senha.html?email=' + encodeURIComponent(email)
      const nome = prof.name ? (', ' + String(prof.name).split(' ')[0]) : ''
      const msg = `🔐 *Amore Food — Recuperação de senha*\n\nOlá${nome}! Recebemos um pedido para redefinir sua senha.\n\nSeu código: *${otp}*\n\n1) Abra: ${link}\n2) Aguarde o formulário de código\n3) Informe o código acima e crie a nova senha\n\nVálido por ~1h. Se não foi você, ignore esta mensagem.`
      const send = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify({ number: wpp, text: msg }) })
      const sd = await send.json().catch(() => ({}))
      const mask = wpp.length >= 6 ? wpp.slice(0, 4) + '****' + wpp.slice(-2) : '****'
      return res.status(200).json({ ok: true, sent: true, wpp_mask: mask, id: sd?.key?.id })
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Erro na recuperação por WhatsApp' })
    }
  }

  const { phone, message, image, caption } = body || {}
  if (!phone) return res.status(400).json({ error: 'Informe o número (phone).' })
  // Aceita: só texto (message), só imagem (image), ou imagem+legenda (image+caption/message).
  if (!message && !image) return res.status(400).json({ error: 'Envie message e/ou image.' })

  const fone = String(phone).replace(/\D/g, '')

  try {
    let endpoint, payload
    if (image) {
      // Envio de mídia (imagem) — aceita URL pública ou base64. Legenda = caption || message.
      endpoint = `${url}/message/sendMedia/${instance}`
      payload = { number: fone, mediatype: 'image', mimetype: 'image/jpeg', media: image, caption: caption || message || '', fileName: 'flyer.jpg' }
    } else {
      endpoint = `${url}/message/sendText/${instance}`
      payload = { number: fone, text: message }
    }
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(payload),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) return res.status(r.status).json({ error: data?.message || data?.error || `Evolution HTTP ${r.status}`, data })
    return res.status(200).json({ ok: true, id: data?.key?.id, status: data?.status })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erro ao enviar pela Evolution' })
  }
}
