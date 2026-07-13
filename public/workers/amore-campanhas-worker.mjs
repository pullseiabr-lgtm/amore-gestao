// ============================================================
// Amore — Worker de Campanhas WhatsApp (roda NO VPS)
// A chave service_role é lida de /root/.amore_key (não fica exposta aqui).
// Deploy no VPS:  pm2 start amore-campanhas-worker.mjs --name amore-camp
// ============================================================
import { readFileSync } from 'fs'
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const SB_SRV = process.env.SB_SRV || (() => { try { return readFileSync('/root/.amore_key', 'utf8').trim() } catch { console.error('ERRO: crie o arquivo /root/.amore_key com a service_role key'); process.exit(1) } })()
const EVO_URL = 'http://localhost:8080'
const EVO_KEY = 'esdras2024chave'
const EVO_INST = 'esdras'
const INTERVALO_MS = 90 * 1000
const LOTE = 15
const JITTER_MIN = 4000, JITTER_MAX = 9000

const H = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, 'Content-Type': 'application/json' }
const sel = (t, q = '') => fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers: H }).then(r => r.json())
const patch = (t, q, row) => fetch(`${SB_URL}/rest/v1/${t}?${q}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) })
const soDig = s => (s || '').replace(/\D/g, '')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const jitter = () => JITTER_MIN + Math.floor(Math.random() * (JITTER_MAX - JITTER_MIN))

async function enviar(number, text) {
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
      method: 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text })
    })
    if (!r.ok) return { ok: false, err: 'evolution_' + r.status }
    return { ok: true }
  } catch (e) { return { ok: false, err: (e.message || '').slice(0, 60) } }
}

async function rodar() {
  const camps = await sel('campaigns', 'status=eq.enviando&select=id')
  if (!camps?.length) return
  let enviados = 0
  for (const c of camps) {
    const cid = c.id
    const fila = await sel('campaign_deliveries', `campaign_id=eq.${cid}&status=eq.pending&select=id,phone,message&limit=${LOTE}`)
    if (!fila?.length) { await patch('campaigns', `id=eq.${cid}`, { status: 'concluida', updated_at: new Date().toISOString() }); continue }
    for (const d of fila) {
      let fone = soDig(d.phone)
      if (fone.length < 10) { await patch('campaign_deliveries', `id=eq.${d.id}`, { status: 'skipped', error_message: 'telefone_invalido' }); continue }
      if (fone.length <= 11) fone = '55' + fone
      const r = await enviar(fone, d.message || '')
      if (r.ok) {
        await patch('campaign_deliveries', `id=eq.${d.id}`, { status: 'sent', sent_at: new Date().toISOString() })
        const cur = await sel('campaigns', `id=eq.${cid}&select=sent_count`)
        await patch('campaigns', `id=eq.${cid}`, { sent_count: (cur?.[0]?.sent_count || 0) + 1 })
        enviados++
      } else {
        await patch('campaign_deliveries', `id=eq.${d.id}`, { status: 'failed', error_message: r.err })
      }
      await sleep(jitter())
    }
  }
  if (enviados) console.log(new Date().toISOString(), `${enviados} mensagem(ns) de campanha enviada(s)`)
}

console.log('Amore campanhas worker iniciado. Varredura a cada 90s, lote de', LOTE, 'com jitter anti-ban.')
rodar().catch(console.error)
setInterval(() => rodar().catch(console.error), INTERVALO_MS)
