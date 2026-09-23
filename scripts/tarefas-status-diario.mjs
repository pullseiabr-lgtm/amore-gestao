// Status Diário de Tarefas — disparo AUTOMÁTICO às 15h (America/Recife = 18:00 UTC).
// Envia para cada SOLICITANTE um resumo das tarefas ativas dele: status atual,
// responsável, prazo, o que já foi feito, dificuldades/desvio, se está aguardando
// aceite ou pedindo mais prazo. Uma mensagem por solicitante (consolidada).
// Cron (VPS, UTC): 0 18 * * *  node /root/tarefas-status-diario.mjs
const SB = 'https://xdwnsqkzgopymufsuccr.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkd25zcWt6Z29weW11ZnN1Y2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk5NjIsImV4cCI6MjA5Mzc0NTk2Mn0.WXT4cSJuTBMIYYinpfX76eTVPUeDT7qFtyLmhCh89zk';
const SEND = 'https://painel.amorefood.com.br/api/evolution-send';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const STATUS_LABEL = {
  pendente: 'Solicitada', recebida: 'Recebida', em_andamento: 'Em execução',
  aguardando_retorno: 'Aguardando info', aguardando_fornecedor: 'Aguardando material',
  aguardando_validacao: 'Aguardando validação',
};
const j = async p => (await fetch(SB + '/rest/v1/' + p, { headers: H })).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmtD = d => { if (!d) return null; const [a, m, dd] = String(d).slice(0, 10).split('-'); return dd + '/' + m + '/' + a; };
const hojeStr = (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset() - 180); return d.toISOString().slice(0, 10); })(); // America/Recife

function linhaTarefa(t) {
  const st = STATUS_LABEL[t.status] || t.status;
  const prazo = t.prazo ? fmtD(t.prazo) : null;
  const atrasada = prazo && String(t.prazo).slice(0, 10) < hojeStr;
  let l = `• #${String(t.numero ?? '').padStart(4, '0')} *${t.titulo}* — ${st}`;
  l += `\n   👤 ${t.responsavel_nome || 'sem responsável'}`;
  if (prazo) l += ` · ⏰ ${atrasada ? '🔴 atrasada, era ' : ''}${prazo}`;
  if (!t.aceite_status && t.responsavel_nome) l += `\n   ⏳ aguardando o responsável se posicionar`;
  if (t.prazo_extensao_status === 'pendente') l += `\n   📅 pedido de mais prazo aguardando resposta`;
  if (t.dificuldades) l += `\n   ⚠️ dificuldade: ${t.dificuldades}`;
  if (t.resultado_final) l += `\n   📄 feito até agora: ${t.resultado_final}`;
  return l;
}

async function main() {
  // desvio_motivo/apoio_setor são campos V2 (guardados em app_config, não em coluna real) — não dá pra filtrar/selecionar direto via REST.
  const tarefas = await j('tarefas?status=in.(pendente,recebida,em_andamento,aguardando_retorno,aguardando_fornecedor,aguardando_validacao)&solicitante_nome=not.is.null&select=id,numero,titulo,loja,setor,status,responsavel_nome,solicitante_nome,prazo,aceite_status,prazo_extensao_status,dificuldades,resultado_final&order=numero');
  if (!tarefas || !tarefas.length) { console.log(hojeStr + ': nenhuma tarefa ativa, nada a enviar.'); return; }

  const porSolicitante = {};
  for (const t of tarefas) { const s = (t.solicitante_nome || '').trim(); if (!s) continue; (porSolicitante[s] = porSolicitante[s] || []).push(t); }

  const profiles = await j('profiles?select=name,permissions_override');
  const foneDe = nome => {
    const p = profiles.find(x => (x.name || '').trim().toLowerCase() === nome.trim().toLowerCase());
    const perfil = p && p.permissions_override && p.permissions_override.__perfil__;
    return (perfil && perfil.whatsapp || '').replace(/\D/g, '');
  };

  let ok = 0, fail = 0, semFone = 0;
  const nomes = Object.keys(porSolicitante);
  for (let i = 0; i < nomes.length; i++) {
    const nome = nomes[i];
    const lista = porSolicitante[nome];
    const fone = foneDe(nome);
    const atrasadas = lista.filter(t => t.prazo && String(t.prazo).slice(0, 10) < hojeStr).length;
    const msg = `📋 *Status diário das suas tarefas* — ${fmtD(hojeStr)}\n\n${lista.length} tarefa(s) em aberto${atrasadas ? `, *${atrasadas} atrasada(s)*` : ''}:\n\n${lista.map(linhaTarefa).join('\n\n')}\n\nVeja tudo no painel: https://painel.amorefood.com.br/?page=tarefas\n— Envio automático 15h`
    if (!fone) { semFone++; console.log(nome + ': sem WhatsApp cadastrado, pulado.'); continue }
    if (process.argv.includes('--dry')) { console.log('--- DRY RUN ---\n' + nome + ' (' + fone + '):\n' + msg + '\n'); ok++; continue }
    try {
      const r = await fetch(SEND, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: fone, message: msg }) })
      if (r.ok) ok++; else fail++
      console.log(nome + ': ' + r.status)
    } catch (e) { fail++; console.log(nome + ': erro ' + (e && e.message)) }
    if (i < nomes.length - 1) await sleep(3000 + Math.floor(Math.random() * 4000))
  }
  console.log(hojeStr + ' — enviados ' + ok + ' / falhas ' + fail + ' / sem fone ' + semFone)
}
main().catch(e => console.error('ERRO GERAL', e && e.message))
