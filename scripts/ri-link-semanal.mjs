// Requisição Inteligente — envio SEMANAL do link (VPS cron).
// Todo sábado 18h (Recife) = 21:00 UTC:  0 21 * * 6  cd /root && /usr/bin/node /root/ri-link-semanal.mjs >> /root/ri-link-semanal.log 2>&1
// Destinatários: app_config 'ri_agenda_semanal' (ver docs/ri_agenda_semanal.sql). Teste sem enviar: --dry
const SB = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkd25zcWt6Z29weW11ZnN1Y2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk5NjIsImV4cCI6MjA5Mzc0NTk2Mn0.WXT4cSJuTBMIYYinpfX76eTVPUeDT7qFtyLmhCh89zk'
const SEND = 'https://painel.amorefood.com.br/api/evolution-send'
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }
const DRY = process.argv.includes('--dry')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fmt = d => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Recife', dateStyle: 'short', timeStyle: 'short' })

const SAUDACAO = [
  n => `Olá, ${n}! 👋`, n => `Oi, ${n}! Tudo bem? 😊`, n => `Boa tarde, ${n}! 👋`,
]
const CORPO = [
  loja => `Chegou a hora da *requisição de compra da ${loja}* desta semana.`,
  loja => `Está liberada a *requisição semanal da ${loja}*.`,
]

const r = await fetch(SB + '/rest/v1/rpc/ri_agenda_gerar', { method: 'POST', headers: H, body: '{}' })
const lista = await r.json()
if (!r.ok) { console.error(new Date().toISOString(), 'erro ao gerar links', JSON.stringify(lista)); process.exit(1) }
console.log(new Date().toISOString(), 'destinatários:', lista.length)

let i = 0
for (const d of lista) {
  const lojaLabel = ({ 'Amore CD': 'Amore Costa Dourada', 'Flow CD': 'Flow Costa Dourada' })[d.loja] || d.loja
  const nome = String(d.nome).split(' ')[0]
  const msg = `${SAUDACAO[i % SAUDACAO.length](nome)}\n\n${CORPO[i % CORPO.length](lojaLabel)}\nMarque o que precisa repor e informe as quantidades — dá para salvar e continuar depois.\n\nhttps://painel.amorefood.com.br/requisicao-inteligente.html?t=${d.token}\n\n⏰ Válido até ${fmt(d.validade)}.\n_Painel Amore_`
  if (DRY) { console.log('[dry]', d.fone, '\n' + msg); i++; continue }
  if (i > 0) await sleep(20000 + Math.random() * 40000) // anti-ban: intervalo aleatório
  try {
    const res = await fetch(SEND, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: d.fone, message: msg, nome: d.nome }) })
    console.log(new Date().toISOString(), 'enviado', d.nome, d.loja, res.status)
  } catch (e) { console.error('falha', d.nome, e.message) }
  i++
}
