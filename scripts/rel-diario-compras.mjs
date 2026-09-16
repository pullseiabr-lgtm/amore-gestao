// Relatório Diário de Compras — disparo AUTOMÁTICO (VPS cron).
// Envia por loja o resumo (comprado × falta × %) + link da Gestão da Lista para
// os gerentes (Carlos/Joais/Diego) e acompanhantes (Aline/Wagner/Esdras).
// Uso: node rel-diario-compras.mjs [YYYY-MM-DD]
// Cron sugerido (VPS UTC, 18h Recife): 0 21 * * *  node /root/rel-diario-compras.mjs
const SB='https://xdwnsqkzgopymufsuccr.supabase.co';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkd25zcWt6Z29weW11ZnN1Y2NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNjk5NjIsImV4cCI6MjA5Mzc0NTk2Mn0.WXT4cSJuTBMIYYinpfX76eTVPUeDT7qFtyLmhCh89zk';
const SEND='https://painel.amorefood.com.br/api/evolution-send';
const H={apikey:ANON,Authorization:'Bearer '+ANON,'Content-Type':'application/json'};
const SUF={'Flow CD':'flow','Amore CD':'amore_cd','Amore Paiva':'amore_paiva'};
const GERENTE={'Amore Paiva':{nome:'Carlos',fone:'5581997725519'},'Flow CD':{nome:'Joais',fone:'5581994943074'},'Amore CD':{nome:'Diego',fone:'5581989694374'}};
const SEGUIDORES=[{nome:'Aline',fone:'5581994573420'},{nome:'Wagner',fone:'5581994135602'},{nome:'Esdras',fone:'5581982710008'}];
const j=async p=>(await fetch(SB+'/rest/v1/'+p,{headers:H})).json();
const brl=n=>'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const linkLoja=L=>'https://painel.amorefood.com.br/montar-pedido.html?loja='+(SUF[L]||'');
const dataBR=d=>d.split('-').reverse().join('/');

const DATA=process.argv[2]||(()=>{const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset()-180);return d.toISOString().slice(0,10);})(); // 180=UTC-3 Recife

async function build(){
  const peds=await j('pedidos_compra?created_at=gte.'+DATA+'T00:00:00&created_at=lte.'+DATA+'T23:59:59.999&select=numero,loja,fornecedor,requisicao_id,total&order=numero');
  const lojas={};let totPeds=0,totValor=0;
  for(const p of (peds||[])){const L=p.loja||'—';(lojas[L]=lojas[L]||{peds:[],reqs:{},valor:0});lojas[L].peds.push(p);lojas[L].valor+=Number(p.total||0);if(p.requisicao_id)lojas[L].reqs[p.requisicao_id]=true;totPeds++;totValor+=Number(p.total||0);}
  for(const L of Object.keys(lojas)){
    const arr=[];
    for(const rid of Object.keys(lojas[L].reqs)){
      const r=(await j('requisicoes?id=eq.'+rid+'&select=numero,titulo'))[0];if(!r)continue;
      const its=await j('requisicao_itens?requisicao_id=eq.'+rid+'&select=id');
      const ids=its.map(x=>x.id);
      const pci=ids.length?await j('pedido_compra_itens?requisicao_item_id=in.('+ids.join(',')+')&select=requisicao_item_id'):[];
      const cov={};(pci||[]).forEach(x=>cov[x.requisicao_item_id]=true);
      const faltam=its.filter(x=>!cov[x.id]).length;
      arr.push({numero:r.numero,pct:its.length?Math.round((its.length-faltam)/its.length*1000)/10:0,faltam,tot:its.length});
    }
    arr.sort((a,b)=>a.numero-b.numero);lojas[L].reqsArr=arr;
  }
  return {lojas,totPeds,totValor};
}
const resumo=l=>l.reqsArr.map(r=>'• REQ-'+String(r.numero).padStart(4,'0')+': *'+r.pct+'%* '+(r.faltam?'(faltam '+r.faltam+')':'(completa)')).join('\n');
function msgGerente(L,l){const gm=GERENTE[L];return 'Olá, '+gm.nome+'! 👋 *Relatório de compras '+dataBR(DATA)+'* — *'+L+'*.\n\n✅ Comprado: *'+brl(l.valor)+'* ('+l.peds.length+' pedido[s]).\n'+resumo(l)+'\n\nVeja item a item o comprado e o que falta:\n'+linkLoja(L)+'\n\nObrigado! 💚';}
function msgSeguidor(nome,d){let c='Olá, '+nome+'! 👋 *Relatório GERAL de compras '+dataBR(DATA)+'* — '+d.totPeds+' pedidos · *'+brl(d.totValor)+'*.\n';const ordem=['Amore Paiva','Flow CD','Amore CD'];for(const L of Object.keys(d.lojas).sort((a,b)=>ordem.indexOf(a)-ordem.indexOf(b))){const l=d.lojas[L];const ic=L==='Flow CD'?'🟢':L==='Amore CD'?'🔵':'🟣';c+='\n'+ic+' *'+L+'* — '+brl(l.valor)+'\n'+resumo(l)+'\n'+linkLoja(L)+'\n';}return c+'\nObrigado! 💚';}
async function send(fone,message){try{const r=await fetch(SEND,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:fone,message})});return r.ok;}catch(e){return false;}}

(async()=>{
  const d=await build();
  if(!Object.keys(d.lojas).length){console.log(DATA+': nenhum pedido gerado, nada a enviar.');return;}
  const fila=[];
  for(const L of Object.keys(d.lojas))if(GERENTE[L])fila.push({nome:GERENTE[L].nome,fone:GERENTE[L].fone,msg:msgGerente(L,d.lojas[L])});
  for(const s of SEGUIDORES)fila.push({nome:s.nome,fone:s.fone,msg:msgSeguidor(s.nome,d)});
  let ok=0,fail=0;
  for(let i=0;i<fila.length;i++){(await send(fila[i].fone,fila[i].msg))?ok++:fail++;console.log(fila[i].nome+': '+(ok>fail?'ok':'?'));if(i<fila.length-1)await sleep(5000+Math.floor(Math.random()*6000));}
  console.log(DATA+' — enviados '+ok+' / falhas '+fail);
})();
