// ============================================================
// Amore — Worker de envio da Raspadinha da Avaliação (roda NO VPS)
// A chave service_role é lida de /root/.amore_key (não fica exposta aqui).
// Deploy no VPS:  pm2 start amore-raspadinha-worker.mjs --name amore-rasp
// ============================================================
import { readFileSync } from 'fs'
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const SB_SRV = process.env.SB_SRV || (() => { try { return readFileSync('/root/.amore_key', 'utf8').trim() } catch { console.error('ERRO: crie o arquivo /root/.amore_key com a service_role key'); process.exit(1) } })()
const EVO_URL = 'http://localhost:8080'
const EVO_KEY = 'esdras2024chave'
const EVO_INST = 'esdras'
const INTERVALO_MS = 60 * 1000

const H = { apikey: SB_SRV, Authorization: `Bearer ${SB_SRV}`, 'Content-Type': 'application/json' }
const sel = (t, q = '') => fetch(`${SB_URL}/rest/v1/${t}?${q}`, { headers: H }).then(r => r.json())
const patch = (t, q, row) => fetch(`${SB_URL}/rest/v1/${t}?${q}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(row) })
const soDig = s => (s || '').replace(/\D/g, '')
const brDate = d => d ? d.split('-').reverse().join('/') : ''

async function enviar(number, text) {
  try {
    const r = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
      method: 'POST', headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number, text })
    })
    return r.ok
  } catch (e) { console.error('envio falhou', e.message); return false }
}

async function rodar() {
  // pega prêmios ganhos com token (avaliação + aniversário), ainda não enviados
  const alvos = await sel('rasp_participacoes',
    `ganhou=eq.true&notificado_em=is.null&telefone=not.is.null&token=not.is.null&select=id,nome,telefone,unidade,premio_nome,cupom,validade,token,origem&limit=30`)
  if (!alvos?.length) return

  let n = 0
  for (const p of alvos) {
    let fone = soDig(p.telefone)
    if (fone.length < 10) { await patch('rasp_participacoes', `id=eq.${p.id}`, { notificado_em: new Date().toISOString() }); continue }
    if (fone.length <= 11) fone = '55' + fone
    const nome = (p.nome || '').split(' ')[0]
    const link = `https://painel.amorefood.com.br/raspar.html?t=${p.token}`
    const msg = p.origem === 'aniversario'
      ? `🎉 Feliz aniversário, ${nome}! 🎂\n\n` +
        `A Amore preparou um presente especial pra comemorar com você!\n` +
        `Raspe e descubra:\n${link}\n\n` +
        `Aproveite muito o seu dia! 💚`
      : `Obrigado por avaliar a Amore, ${nome}! 💚\n\n` +
        `Você tem uma *raspadinha* esperando! 🎁\n` +
        `Raspe e descubra seu presente:\n${link}\n\n` +
        `Boa sorte! 🍀`
    const ok = await enviar(fone, msg)
    await patch('rasp_participacoes', `id=eq.${p.id}`, { notificado_em: new Date().toISOString() })
    if (ok) n++
    await new Promise(r => setTimeout(r, 1500))
  }
  if (n) console.log(new Date().toISOString(), `${n} raspadinha(s) enviada(s)`)
}

console.log('Amore raspadinha worker iniciado. Varredura a cada 1 min.')
rodar().catch(console.error)
setInterval(() => rodar().catch(console.error), INTERVALO_MS)
