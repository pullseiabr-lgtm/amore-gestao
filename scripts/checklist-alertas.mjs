// Operação Padrão — ALERTA WhatsApp no horário + cobrança de justificativa (VPS cron).
//
// A cada execução (sugerido: a cada 5 min) olha os modelos com "Alertar o responsável" ligado:
//   1) garante a execução do dia (mesma regra do /api/checklists-cron);
//   2) na hora_alerta  → avisa os RESPONSÁVEIS para fazer o checklist (1x);
//   3) passou do hora_limite sem concluir → cobra a JUSTIFICATIVA dos responsáveis e avisa os GESTORES (1x).
//
// Uso:
//   node checklist-alertas.mjs            → SIMULAÇÃO (não envia nada, só mostra o que enviaria)
//   node checklist-alertas.mjs --send     → envia de verdade
//   node checklist-alertas.mjs --send --to=5581982710008   → envia TUDO só para esse número (teste), sem marcar como enviado
// Cron sugerido (UTC no VPS; roda a cada 5 min):  */5 * * * *  node /root/checklist-alertas.mjs --send >> /root/checklist-alertas.log 2>&1
// NÃO instalar o cron antes de o Esdras validar a mensagem (--send --to=<número dele>).

const SB = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkd25zcWt6Z29weW11ZnN1Y2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk5NjIsImV4cCI6MjA5Mzc0NTk2Mn0.WXT4cSJuTBMIYYinpfX76eTVPUeDT7qFtyLmhCh89zk'
const SEND_URL = 'https://painel.amorefood.com.br/api/evolution-send'
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }
const SEND = process.argv.includes('--send')
const TO = (process.argv.find(a => a.startsWith('--to=')) || '').slice(5).replace(/\D/g, '')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const get = async q => { const r = await fetch(`${SB}/rest/v1/${q}`, { headers: H }); return r.ok ? r.json() : [] }
const post = async (t, rows) => { const r = await fetch(`${SB}/rest/v1/${t}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(rows) }); return r.ok ? r.json() : [] }
const patch = (t, id, body) => fetch(`${SB}/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) })

// "Agora" em Brasília (UTC-3)
const br = new Date(Date.now() - 3 * 3600000)
const HOJE = br.toISOString().slice(0, 10)
const HHMM = br.toISOString().slice(11, 16)
const minutos = hm => { const [h, m] = String(hm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null }
const NOW = minutos(HHMM)

const aplicaHoje = m => {
  if (!m.ativo) return false
  if (m.recorrencia === 'diario') return true
  if (m.recorrencia === 'semanal') return (m.dias_semana || []).includes(br.getUTCDay())
  if (m.recorrencia === 'mensal') return m.dia_mes === br.getUTCDate()
  return false
}
// Escala do cadastro (app_config.checklist_cadastro): atribuições por setor/loja/turno/dias
function efetivos(m, loja, cad) {
  const dow = br.getUTCDay()
  const out = []
  const add = (nome, f, papel) => { const n = fone(f); if (n && !out.some(o => o.fone === n && o.papel === papel)) out.push({ nome, fone: n, papel }) }
  for (const d of (m.destinatarios || [])) add(d.nome, d.fone, d.papel)
  for (const a of (cad.atribuicoes || [])) {
    if (a.setor !== m.setor) continue
    if (a.loja !== '*' && a.loja !== loja) continue
    if (a.turno && a.turno !== 'qualquer' && m.turno && m.turno !== 'qualquer' && a.turno !== m.turno) continue
    if (a.dias && a.dias.length && !a.dias.includes(dow)) continue
    const pe = (cad.pessoas || []).find(x => x.id === a.pessoa_id)
    if (pe) add(pe.nome, pe.fone, a.papel)
  }
  return out
}
const fone = f => { const d = String(f || '').replace(/\D/g, ''); return d.startsWith('55') ? d : (d.length >= 10 ? '55' + d : d) }

async function enviar(dest, msg) {
  const alvo = TO || fone(dest.fone)
  if (!SEND) { console.log(`[simulação] → ${dest.nome} (${alvo}):\n${msg}\n`); return true }
  const r = await fetch(SEND_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: alvo, message: msg }) })
  console.log(`[${r.ok ? 'ok' : 'FALHA ' + r.status}] ${dest.nome} (${alvo})`)
  return r.ok
}
async function enviarLista(lista, msgDe) {
  let ok = 0
  for (let i = 0; i < lista.length; i++) {
    if (i > 0 && SEND) await sleep(2500 + Math.random() * 5000) // intervalo aleatório (anti-ban)
    if (await enviar(lista[i], msgDe(lista[i]))) ok++
  }
  return ok
}

// Link direto (página pública mobile) do checklist DESTA loja/setor, já identificando o responsável
const linkDe = (ex, d) => `\n🔗 Abrir e preencher pelo celular:\nhttps://painel.amorefood.com.br/checklist.html?id=${ex.id || 'SIMULACAO'}&r=${fone(d.fone)}`
const linkPainel = '\n🔗 Painel: https://painel.amorefood.com.br/?page=checklists&aba=vista'

async function main() {
  const [tenant, modelos, execHoje, cadRows] = await Promise.all([
    get('tenant_settings?slug=eq.default&select=stores'),
    get('checklist_modelos?ativo=eq.true&alertar=eq.true&select=*'),
    get(`checklist_execucoes?data=eq.${HOJE}&select=*`),
    get('app_config?chave=eq.checklist_cadastro&select=valor'),
  ])
  const cad = cadRows?.[0]?.valor || { pessoas: [], atribuicoes: [] }
  const lojas = (tenant?.[0]?.stores || []).filter(l => l && l !== 'Todas as Lojas')
  console.log(`${HOJE} ${HHMM} BRT · ${modelos.length} modelo(s) com alerta · ${SEND ? (TO ? 'TESTE → ' + TO : 'ENVIO REAL') : 'SIMULAÇÃO'}`)

  for (const m of modelos) {
    // avulso/manual: só alerta se já existe execução hoje; os recorrentes seguem a recorrência
    if (!m.hora_alerta || (!aplicaHoje(m) && !execHoje.some(e => e.modelo_id === m.id))) continue

    for (const lj of lojas.filter(l => m.loja == null || m.loja === l)) {
      // quem faz / quem recebe = pessoas do modelo + escala do cadastro (setor, loja, turno, dia da semana)
      const dest = efetivos(m, lj, cad)
      const resp = dest.filter(d => d.papel === 'responsavel')
      const gest = dest.filter(d => d.papel === 'gestor')
      if (!resp.length) continue
      let ex = execHoje.find(e => e.modelo_id === m.id && e.loja === lj)
      if (!ex && !aplicaHoje(m)) continue
      if (!ex) {
        if (SEND && !TO) ex = (await post('checklist_execucoes', [{ modelo_id: m.id, loja: lj, titulo: m.titulo, setor: m.setor, data: HOJE, turno: m.turno, status: 'pendente', respostas: [], hora_limite: m.hora_limite, created_by: 'alerta' }]))?.[0]
        else ex = { id: null, status: 'pendente', alerta_enviado_em: null, atraso_alertado_em: null }
        if (!ex) continue
      }
      if (ex.status === 'concluido') continue

      const tAlerta = minutos(m.hora_alerta)
      const tLimite = minutos(m.hora_limite)
      const marca = async b => { if (SEND && !TO && ex.id) await patch('checklist_execucoes', ex.id, b) }

      // 1) hora de fazer (janela de 3h para não disparar coisa velha)
      if (!ex.alerta_enviado_em && tAlerta != null && NOW >= tAlerta && NOW - tAlerta <= 180) {
        const n = await enviarLista(resp, d => `⏰ *Hora do checklist*\n\nOlá, ${String(d.nome || '').split(' ')[0] || 'tudo bem'}! Está na hora de fazer o checklist *${m.titulo}* (${m.setor}) da loja *${lj}*.${m.hora_limite ? `\nLimite: *${m.hora_limite}*.` : ''}\nAs fotos saem com horário e setor.${linkDe(ex, d)}`)
        if (n) await marca({ alerta_enviado_em: new Date().toISOString() })
      }

      // 2) passou do limite sem concluir → cobra justificativa + avisa gestores
      if (!ex.atraso_alertado_em && tLimite != null && NOW > tLimite && NOW - tLimite <= 360) {
        const n = await enviarLista(resp, d => `🚨 *Checklist atrasado*\n\n${String(d.nome || '').split(' ')[0] || 'Olá'}, o checklist *${m.titulo}* (${lj}) passou do limite das *${m.hora_limite}* e ainda não foi concluído.\n\nPor favor, *justifique o atraso* pelo link e conclua o quanto antes.${linkDe(ex, d)}`)
        if (gest.length) await enviarLista(gest, d => `🚨 *Checklist atrasado — ${lj}*\n\n*${m.titulo}* (${m.setor}) passou do limite das ${m.hora_limite} e não foi concluído. Responsável(is): ${resp.map(r => r.nome).join(', ')}.${linkPainel}`)
        if (n) await marca({ atraso_alertado_em: new Date().toISOString(), ...(ex.status === 'pendente' ? { status: 'atrasado' } : {}) })
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1) })
