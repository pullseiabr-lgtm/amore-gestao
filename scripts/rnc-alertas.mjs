// Alertas diários da RNC Interna (VPS cron, 15h Recife = 18:05 UTC).
// Prazo vence amanhã / em atraso -> responsável; RNC resolvida aguardando validação -> quem abriu.
const SB = 'https://xdwnsqkzgopymufsuccr.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkd25zcWt6Z29weW11ZnN1Y2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk5NjIsImV4cCI6MjA5Mzc0NTk2Mn0.WXT4cSJuTBMIYYinpfX76eTVPUeDT7qFtyLmhCh89zk';
const SEND = 'https://painel.amorefood.com.br/api/evolution-send';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };
const j = async p => (await fetch(SB + '/rest/v1/' + p, { headers: H })).json();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hoje = (() => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset() - 180); return d.toISOString().slice(0, 10); })();
const dias = d => Math.round((new Date(String(d).slice(0, 10) + 'T00:00:00') - new Date(hoje + 'T00:00:00')) / 86400000);
const link = id => 'https://painel.amorefood.com.br/?page=tarefas&rnc=' + id;
(async () => {
  const rncs = await j('rnc?status=neq.encerrada&select=id,numero,fornecedor,produto,responsavel,aberto_por,prazo,status');
  if (!Array.isArray(rncs)) { console.log('erro', JSON.stringify(rncs)); return; }
  const profiles = await j('profiles?select=name,permissions_override');
  const fone = n => { const p = profiles.find(x => (x.name || '').trim().toLowerCase() === (n || '').trim().toLowerCase()); return ((p && p.permissions_override && p.permissions_override.__perfil__ && p.permissions_override.__perfil__.whatsapp) || '').replace(/\D/g, ''); };
  const fila = [];
  for (const r of rncs) {
    if (r.status === 'resolvida') { if (r.aberto_por) fila.push([r.aberto_por, `🔵 *${r.numero}* aguarda sua validação para encerramento.\n${r.fornecedor || ''} · ${r.produto || ''}\n\n${link(r.id)}`]); continue; }
    if (!r.prazo || !r.responsavel) continue;
    const d = dias(r.prazo);
    if (d === 1) fila.push([r.responsavel, `⚠️ *${r.numero}* vence amanhã.\n${r.fornecedor || ''} · ${r.produto || ''}\n\n${link(r.id)}`]);
    else if (d === 0) fila.push([r.responsavel, `⚠️ *${r.numero}* vence hoje.\n${r.fornecedor || ''} · ${r.produto || ''}\n\n${link(r.id)}`]);
    else if (d < 0) fila.push([r.responsavel, `🔴 *${r.numero}* está em atraso há ${-d} dia(s).\n${r.fornecedor || ''} · ${r.produto || ''}\n\n${link(r.id)}`]);
  }
  let ok = 0;
  for (const [nome, msg] of fila) {
    const f = fone(nome);
    if (!f) { console.log(nome + ': sem WhatsApp'); continue; }
    if (process.argv.includes('--dry')) { console.log('DRY', nome, f, '\n' + msg + '\n'); ok++; continue; }
    try { const r = await fetch(SEND, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: f, message: msg + '\n_Amore Gestão_' }) }); if (r.ok) ok++; } catch (e) { }
    await sleep(3000 + Math.floor(Math.random() * 4000));
  }
  console.log(hoje + ' — alertas enviados: ' + ok + '/' + fila.length);
})();
