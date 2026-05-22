import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Search, Trash2, ChevronLeft, Loader, Check, X,
  DollarSign, FileText, Clock, AlertTriangle, CheckCircle2, XCircle,
  Edit3, Download, RefreshCw, User, Calendar, Package, Send,
  ShoppingCart, BarChart2, Lock, Layers, Receipt,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import {
  fetchRequisicoes, insertRequisicao, updateRequisicao, deleteRequisicao,
  fetchRequisicaoItens, insertRequisicaoItem, updateRequisicaoItem, deleteRequisicaoItem,
  fetchReqTimeline, insertReqTimeline,
  fetchEstoqueProdutos,
  fetchFinCreditos, insertFinCredito,
} from '../../lib/db'
import type {
  Requisicao, RequisicaoItem, ReqStatus, ReqPrioridade,
  EstoqueProduto, FinCredito, FinFormaPagamento, ReqTimeline,
} from '../../types/database'

// ── Helpers ───────────────────────────────────────────────────

const fmtDt  = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'
const fmtR$  = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' })
const fmtTs  = (d: string) => new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
const today  = () => new Date().toISOString().slice(0, 10)

// ── Configs ───────────────────────────────────────────────────

const CFG_STATUS: Record<ReqStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  rascunho:              { label:'Rascunho',           color:'#64748b', bg:'#F1F5F9', icon:<FileText size={11} /> },
  enviada:               { label:'Aguard. Aprovação',  color:'#B45309', bg:'#FEF3C7', icon:<Send size={11} /> },
  em_analise:            { label:'Em Análise',         color:'#0369A1', bg:'#E0F2FE', icon:<Clock size={11} /> },
  em_cotacao:            { label:'Em Cotação',         color:'#7C3AED', bg:'#EDE9FE', icon:<ShoppingCart size={11} /> },
  parcialmente_aprovada: { label:'Aprov. Parcial',     color:'#CA8A04', bg:'#FEF9C3', icon:<CheckCircle2 size={11} /> },
  aprovada:              { label:'Aprovada',           color:'#15803D', bg:'#DCFCE7', icon:<Check size={11} /> },
  reprovada:             { label:'Reprovada',          color:'#DC2626', bg:'#FEE2E2', icon:<XCircle size={11} /> },
  compra_realizada:      { label:'Compra Realizada',   color:'#0891B2', bg:'#CFFAFE', icon:<ShoppingCart size={11} /> },
  prestacao_pendente:    { label:'Prestação Pendente', color:'#EA580C', bg:'#FFEDD5', icon:<Receipt size={11} /> },
  em_auditoria:          { label:'Em Auditoria',       color:'#6D28D9', bg:'#EDE9FE', icon:<AlertTriangle size={11} /> },
  concluida:             { label:'Finalizada',         color:'#166534', bg:'#DCFCE7', icon:<CheckCircle2 size={11} /> },
  cancelada:             { label:'Cancelada',          color:'#6B7280', bg:'#F3F4F6', icon:<X size={11} /> },
}

const CFG_PRIO: Record<ReqPrioridade, { label: string; color: string; bg: string }> = {
  baixa:   { label:'Baixa',   color:'#15803D', bg:'#DCFCE7' },
  media:   { label:'Média',   color:'#B45309', bg:'#FEF3C7' },
  alta:    { label:'Alta',    color:'#EA580C', bg:'#FFEDD5' },
  urgente: { label:'Urgente', color:'#DC2626', bg:'#FEE2E2' },
}

const MOTIVOS_BLOQUEIO = [
  'Estoque suficiente','Produto sem necessidade','Compra fora do padrão',
  'Valor elevado','Item suspenso','Outro motivo',
]

const TIMELINE_ICON: Record<string, React.ReactNode> = {
  criacao:<Plus size={11}/>, envio:<Send size={11}/>, aprovacao:<Check size={11}/>,
  reprovacao:<XCircle size={11}/>, ajuste:<Edit3 size={11}/>, bloqueio:<Lock size={11}/>,
  credito:<DollarSign size={11}/>, compra:<ShoppingCart size={11}/>, finalizacao:<CheckCircle2 size={11}/>,
}
const TIMELINE_COLOR: Record<string, string> = {
  criacao:'#0369A1', envio:'#B45309', aprovacao:'#15803D', reprovacao:'#DC2626',
  ajuste:'#7C3AED', bloqueio:'#EA580C', credito:'#0891B2', compra:'#6D28D9', finalizacao:'#166534',
}

const SETORES = ['Cozinha','Salão','Balcão','Administrativo','Limpeza','Manutenção','TI']
const UNIDS   = ['Unidade','Kg','g','L','mL','Caixa','Pacote','Saco','Fardo','Dúzia','Peça','Par','Rolo','Lata','Galão']

// ── PDF ───────────────────────────────────────────────────────

function gerarPDF(req: Requisicao, itens: RequisicaoItem[], company: string) {
  const bl  = itens.filter(i => i.bloqueado)
  const ok  = itens.filter(i => !i.bloqueado)
  const tot = ok.reduce((a, i) => a + (i.quantidade_aprovada ?? i.quantidade) * (i.preco_referencia ?? 0), 0)
  const w   = window.open('', '_blank', 'width=1000,height=750')
  if (!w) return
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>REQ-${String(req.numero).padStart(4,'0')}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',sans-serif}
body{color:#1a1a1a;padding:32px;font-size:12px}
.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6B1212;padding-bottom:16px;margin-bottom:20px}
.logo{font-size:22px;font-weight:800;color:#6B1212}
.rn{font-size:28px;font-weight:900;color:#6B1212}
h2{font-size:13px;font-weight:700;color:#6B1212;margin:16px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:3px}
.gr{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.f label{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.f span{display:block;font-weight:600;font-size:12px;margin-top:2px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
.kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
.kpi .v{font-size:18px;font-weight:800;color:#6B1212}.kpi .l{font-size:9px;color:#6b7280;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
th{background:#6B1212;color:#fff;padding:5px 8px;text-align:left;font-weight:600}
td{padding:4px 8px;border-bottom:1px solid #f3f4f6}tr:nth-child(even) td{background:#fafafa}
.badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:9px;font-weight:700}
.bl{background:#FEE2E2;color:#DC2626}.ok{background:#DCFCE7;color:#15803D}
.ass{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:28px}
.as{border-top:1px solid #000;padding-top:6px;font-size:9px;text-align:center}
@media print{button{display:none}}
</style></head><body>
<div class="hd">
  <div><div class="logo">${company}</div><div style="font-size:10px;color:#6b7280;margin-top:3px">Requisição de Compras</div></div>
  <div style="text-align:right">
    <div class="rn">REQ-${String(req.numero).padStart(4,'0')}</div>
    <div style="font-size:10px;color:#6b7280">${fmtDt(req.created_at)}</div>
    <div style="margin-top:3px;display:inline-block;padding:2px 9px;border-radius:10px;background:${CFG_STATUS[req.status].bg};color:${CFG_STATUS[req.status].color};font-size:10px;font-weight:700">${CFG_STATUS[req.status].label}</div>
  </div>
</div>
<div class="gr">
  <div class="f"><label>Unidade</label><span>${req.loja}</span></div>
  <div class="f"><label>Setor</label><span>${req.setor||'—'}</span></div>
  <div class="f"><label>Prioridade</label><span>${CFG_PRIO[req.prioridade].label}</span></div>
  <div class="f"><label>Responsável</label><span>${req.responsavel_nome||'—'}</span></div>
  <div class="f"><label>Data Necessidade</label><span>${fmtDt(req.data_necessidade)}</span></div>
  <div class="f"><label>Centro de Custo</label><span>${req.centro_custo||'—'}</span></div>
</div>
${req.aprovador_nome?`<div class="gr" style="grid-template-columns:1fr 1fr">
  <div class="f"><label>Aprovador</label><span>${req.aprovador_nome}</span></div>
  <div class="f"><label>Data Aprovação</label><span>${req.aprovador_at?fmtTs(req.aprovador_at):'—'}</span></div>
  ${req.obs_aprovacao?`<div class="f" style="grid-column:1/-1"><label>Obs. Aprovação</label><span>${req.obs_aprovacao}</span></div>`:''}
</div>`:''}
<div class="kpis">
  <div class="kpi"><div class="v">${itens.length}</div><div class="l">Total Itens</div></div>
  <div class="kpi"><div class="v">${ok.length}</div><div class="l">Aprovados</div></div>
  <div class="kpi"><div class="v">${bl.length}</div><div class="l">Bloqueados</div></div>
  <div class="kpi"><div class="v">${fmtR$(tot)}</div><div class="l">Valor Aprovado</div></div>
</div>
<h2>Itens da Requisição</h2>
<table><thead><tr><th>Produto</th><th>Categoria</th><th>Qtd Sol.</th><th>Qtd Aprov.</th><th>Un</th><th>Ref. Preço</th><th>Fornecedor</th><th>Status</th></tr></thead>
<tbody>${itens.map(i=>`<tr>
  <td><strong>${i.produto_nome}</strong></td><td>${i.categoria||'—'}</td>
  <td>${i.quantidade}</td>
  <td>${i.bloqueado?'<span class="badge bl">Bloqueado</span>':(i.quantidade_aprovada??i.quantidade)}</td>
  <td>${i.unidade}</td><td>${i.preco_referencia?fmtR$(i.preco_referencia):'—'}</td>
  <td>${i.fornecedor_nome||'—'}</td>
  <td><span class="badge ${i.bloqueado?'bl':'ok'}">${i.bloqueado?'Bloqueado':'Aprovado'}</span></td>
</tr>`).join('')}</tbody></table>
${bl.length?`<h2>Itens Bloqueados</h2><table><thead><tr><th>Produto</th><th>Motivo</th></tr></thead>
<tbody>${bl.map(i=>`<tr><td>${i.produto_nome}</td><td>${i.motivo_bloqueio||'—'}</td></tr>`).join('')}</tbody></table>`:''}
${req.observacoes?`<h2>Observações</h2><p style="padding:8px;background:#f9fafb;border-radius:6px">${req.observacoes}</p>`:''}
<div class="ass">
  <div class="as">Responsável<br><br><br>${req.responsavel_nome||'_______________'}</div>
  <div class="as">Gestor Aprovador<br><br><br>${req.aprovador_nome||'_______________'}</div>
  <div class="as">Financeiro<br><br><br>_______________</div>
  <div class="as">Auditoria<br><br><br>_______________</div>
</div>
<script>window.onload=()=>window.print()</script>
</body></html>`)
  w.document.close()
}

// ── useToast ──────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState('')
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 3000) }
  const ToastEl = msg ? (
    <div style={{ position:'fixed', bottom:24, right:24, background:'#1e293b', color:'white', padding:'10px 18px', borderRadius:10, fontSize:13, fontWeight:600, zIndex:9999, boxShadow:'0 4px 20px rgba(0,0,0,.3)' }}>{msg}</div>
  ) : null
  return { toast, ToastEl }
}

// ── Badges ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReqStatus }) {
  const c = CFG_STATUS[status]
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:c.bg, color:c.color, whiteSpace:'nowrap' }}>{c.icon} {c.label}</span>
}
function PrioBadge({ prio }: { prio: ReqPrioridade }) {
  const c = CFG_PRIO[prio]
  return <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:12, background:c.bg, color:c.color, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:'.5px' }}>{c.label}</span>
}

// ── AnaliseCard — análise de estoque por item ─────────────────

function AnaliseCard({ item, produtos }: { item: RequisicaoItem; produtos: EstoqueProduto[] }) {
  const q = item.produto_nome.toLowerCase().split(' ')[0]
  const prod = produtos.find(p => p.nome.toLowerCase().includes(q) || q.includes(p.nome.toLowerCase().split(' ')[0]))
  if (!prod) return <div style={{ fontSize:10, color:'var(--muted)', padding:'4px 8px', background:'#f8fafc', borderRadius:6 }}>Produto não encontrado no estoque</div>

  const pct = prod.nivel_ideal > 0 ? Math.min(100, Math.round(prod.nivel_atual / prod.nivel_ideal * 100)) : 0
  const lvl = prod.nivel_atual <= 0 ? 'ruptura' : prod.nivel_atual <= prod.nivel_minimo ? 'critico' : prod.nivel_atual <= prod.nivel_ideal ? 'repor' : 'ok'
  const sug = Math.max(0, prod.nivel_ideal - prod.nivel_atual)

  const A = { ruptura:{ label:'⚡ Ruptura!', c:'#DC2626', b:'#FEE2E2' }, critico:{ label:'🚨 Crítico', c:'#EA580C', b:'#FFEDD5' }, repor:{ label:'⚠️ Repor', c:'#B45309', b:'#FEF3C7' }, ok:{ label:'✅ OK', c:'#15803D', b:'#DCFCE7' } }[lvl]
  const barColor = lvl==='ruptura'?'#DC2626':lvl==='critico'?'#EA580C':lvl==='repor'?'#F59E0B':'#22C55E'

  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'8px 10px', fontSize:11 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
        <span style={{ fontWeight:700, fontSize:12 }}>{prod.nome}</span>
        <span style={{ padding:'2px 7px', borderRadius:16, fontSize:10, fontWeight:700, background:A.b, color:A.c }}>{A.label}</span>
      </div>
      <div style={{ background:'#e5e7eb', borderRadius:4, height:5, marginBottom:5 }}>
        <div style={{ width:`${pct}%`, height:'100%', borderRadius:4, background:barColor }} />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4, fontSize:10, color:'var(--muted)' }}>
        <div><strong style={{ color:'#1e293b' }}>{prod.nivel_atual}</strong> atual</div>
        <div><strong style={{ color:'#1e293b' }}>{prod.nivel_minimo}</strong> mínimo</div>
        <div><strong style={{ color:'#1e293b' }}>{prod.nivel_ideal}</strong> ideal</div>
      </div>
      {sug > 0 && <div style={{ marginTop:4, fontSize:10, color:'#0369A1' }}>💡 Sugestão: <strong>{sug}</strong> para atingir ideal</div>}
      {!item.bloqueado && item.quantidade > sug * 1.5 && sug > 0 && <div style={{ marginTop:3, fontSize:10, color:'#EA580C', fontWeight:600 }}>⚠️ Qtd solicitada acima do necessário</div>}
      {lvl==='ok' && prod.nivel_atual > prod.nivel_ideal && <div style={{ marginTop:3, fontSize:10, color:'#15803D', fontWeight:600 }}>✅ Estoque suficiente</div>}
      {prod.preco_unitario > 0 && <div style={{ marginTop:3, fontSize:10, color:'var(--muted)' }}>Ref: <strong>{fmtR$(prod.preco_unitario)}</strong>/un</div>}
    </div>
  )
}

// ── Modal Item ────────────────────────────────────────────────

function ModalItem({ item, produtos, onSalvo, onFechar }: {
  item: Partial<RequisicaoItem> | null; produtos: EstoqueProduto[]
  onSalvo: (i: Partial<RequisicaoItem>) => void; onFechar: () => void
}) {
  const [form, setForm] = useState<Partial<RequisicaoItem>>({
    produto_nome:'', categoria:'', quantidade:1, unidade:'Unidade',
    preco_referencia:undefined, fornecedor_nome:'', observacoes:'',
    bloqueado:false, motivo_bloqueio:null, quantidade_aprovada:null,
    ...item,
  })
  const [sug, setSug] = useState<EstoqueProduto[]>([])
  const onNome = (v: string) => { setForm(f=>({...f,produto_nome:v})); setSug(v.length>1?produtos.filter(p=>p.nome.toLowerCase().includes(v.toLowerCase())).slice(0,6):[]) }
  const pick = (p: EstoqueProduto) => { setForm(f=>({...f,produto_nome:p.nome,categoria:p.categoria,unidade:p.gramatura||'Unidade',preco_referencia:p.preco_unitario||undefined})); setSug([]) }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:14, padding:24, width:500, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <span style={{ fontWeight:800, fontSize:15 }}>{item?.id?'Editar Item':'Adicionar Item'}</span>
          <button className="ib rd" onClick={onFechar}><X size={15} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
          <div style={{ position:'relative' }}>
            <label className="form-label">Produto *</label>
            <input className="form-input" value={form.produto_nome} onChange={e=>onNome(e.target.value)} placeholder="Nome do produto" autoFocus />
            {sug.length>0&&<div style={{ position:'absolute', top:'100%', left:0, right:0, background:'white', border:'1px solid #e5e7eb', borderRadius:8, zIndex:10, boxShadow:'0 8px 24px rgba(0,0,0,.12)', maxHeight:180, overflowY:'auto' }}>
              {sug.map(p=><div key={p.id} onClick={()=>pick(p)} style={{ padding:'7px 12px', cursor:'pointer', fontSize:12, borderBottom:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between' }}
                onMouseEnter={e=>(e.currentTarget.style.background='#f0fdf4')} onMouseLeave={e=>(e.currentTarget.style.background='white')}>
                <span><strong>{p.nome}</strong> <span style={{ color:'var(--muted)', fontSize:11 }}>{p.categoria}</span></span>
                <span style={{ color:'var(--muted)', fontSize:11 }}>{p.nivel_atual}/{p.nivel_ideal}</span>
              </div>)}
            </div>}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label className="form-label">Categoria</label><input className="form-input" value={form.categoria||''} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} /></div>
            <div><label className="form-label">Fornecedor Sugerido</label><input className="form-input" value={form.fornecedor_nome||''} onChange={e=>setForm(f=>({...f,fornecedor_nome:e.target.value}))} /></div>
            <div><label className="form-label">Quantidade *</label><input className="form-input" type="number" min={0} step="0.001" value={form.quantidade} onChange={e=>setForm(f=>({...f,quantidade:Number(e.target.value)}))} /></div>
            <div><label className="form-label">Unidade</label><select className="form-input" value={form.unidade} onChange={e=>setForm(f=>({...f,unidade:e.target.value}))}>{UNIDS.map(u=><option key={u}>{u}</option>)}</select></div>
            <div><label className="form-label">Último Valor (R$)</label><input className="form-input" type="number" min={0} step="0.01" value={form.preco_referencia??''} onChange={e=>setForm(f=>({...f,preco_referencia:e.target.value?Number(e.target.value):undefined}))} placeholder="0,00" /></div>
          </div>
          <div><label className="form-label">Observação</label><input className="form-input" value={form.observacoes||''} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))} /></div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button className="ib" onClick={onFechar}>Cancelar</button>
            <button className="btn" disabled={!form.produto_nome?.trim()} onClick={()=>{if(form.produto_nome?.trim())onSalvo(form)}}>
              <Check size={13} /> {item?.id?'Salvar':'Adicionar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Modal Aprovação ───────────────────────────────────────────

type IS = { bloqueado: boolean; motivo: string; qtd: number }

function ModalAprovacao({ req, itens, userName, onSalvo, onFechar }: {
  req: Requisicao; itens: RequisicaoItem[]; userName: string
  onSalvo: (acao: 'aprovada'|'parcialmente_aprovada'|'reprovada'|'rascunho', st: Record<string, IS>, obs: string) => void
  onFechar: () => void
}) {
  const [obs, setObs] = useState('')
  const [st, setSt] = useState<Record<string, IS>>(() => {
    const init: Record<string, IS> = {}
    itens.forEach(i=>{ init[i.id]={ bloqueado:i.bloqueado, motivo:i.motivo_bloqueio||'', qtd:i.quantidade_aprovada??i.quantidade } })
    return init
  })

  const toggle = (id: string) => setSt(s=>({...s,[id]:{...s[id],bloqueado:!s[id].bloqueado}}))
  const anyBl  = Object.values(st).some(s=>s.bloqueado)
  const allBl  = itens.length > 0 && Object.values(st).every(s=>s.bloqueado)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1100, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:30, overflowY:'auto' }}>
      <div style={{ background:'white', borderRadius:14, padding:24, width:680, maxWidth:'95vw', marginBottom:30, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div><div style={{ fontWeight:800, fontSize:16 }}>Análise & Aprovação</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>REQ-{String(req.numero).padStart(4,'0')} · {req.titulo}</div></div>
          <button className="ib rd" onClick={onFechar}><X size={15} /></button>
        </div>
        <div style={{ border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden', marginBottom:14 }}>
          <div style={{ background:'#f8fafc', padding:'7px 12px', fontSize:10, fontWeight:700, color:'var(--muted)', display:'grid', gridTemplateColumns:'1fr 80px 80px 1fr', gap:8 }}>
            <span>PRODUTO</span><span>QTD SOL.</span><span>QTD APROV.</span><span>BLOQUEAR?</span>
          </div>
          {itens.map(item=>{
            const s = st[item.id]
            return (
              <div key={item.id} style={{ padding:'9px 12px', borderTop:'1px solid #f3f4f6', background:s?.bloqueado?'#FFF5F5':'white' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 80px 1fr', gap:8, alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:12 }}>{item.produto_nome}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{item.categoria} · {item.fornecedor_nome||'—'}</div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{item.quantidade} {item.unidade}</div>
                  <div><input type="number" min={0} step="0.001" value={s?.qtd??item.quantidade}
                    onChange={e=>setSt(s=>({...s,[item.id]:{...s[item.id],qtd:Number(e.target.value)}}))}
                    disabled={s?.bloqueado}
                    style={{ width:'100%', padding:'3px 6px', borderRadius:5, border:'1px solid #e5e7eb', fontSize:12, opacity:s?.bloqueado?.4:1 }} /></div>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:12 }}>
                      <input type="checkbox" checked={s?.bloqueado} onChange={()=>toggle(item.id)} />
                      <Lock size={11} style={{ color:s?.bloqueado?'#EA580C':'#9ca3af' }} /> Bloquear
                    </label>
                    {s?.bloqueado&&<select value={s.motivo} onChange={e=>setSt(s=>({...s,[item.id]:{...s[item.id],motivo:e.target.value}}))}
                      style={{ flex:1, padding:'3px 5px', borderRadius:5, border:'1px solid #FCA5A5', fontSize:10, background:'#FFF5F5' }}>
                      <option value="">Motivo...</option>
                      {MOTIVOS_BLOQUEIO.map(m=><option key={m}>{m}</option>)}
                    </select>}
                  </div>
                </div>
                {item.preco_referencia&&<div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>
                  Ref: {fmtR$(item.preco_referencia)} · Estimado: {fmtR$((s?.qtd??item.quantidade)*item.preco_referencia)}
                </div>}
              </div>
            )
          })}
        </div>
        <div style={{ marginBottom:12 }}>
          <label className="form-label">Observação da Aprovação</label>
          <textarea className="form-input" rows={2} value={obs} onChange={e=>setObs(e.target.value)} placeholder="Notas para o solicitante..." style={{ resize:'vertical' }} />
        </div>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
          <button className="btn" onClick={()=>onSalvo('aprovada',st,obs)} style={{ background:'#15803D', flex:1 }}><CheckCircle2 size={13} /> Aprovar Tudo</button>
          {anyBl&&!allBl&&<button className="btn" onClick={()=>onSalvo('parcialmente_aprovada',st,obs)} style={{ background:'#CA8A04', flex:1 }}><Check size={13} /> Aprov. Parcial</button>}
          <button className="btn" onClick={()=>onSalvo('reprovada',st,obs)} style={{ background:'#DC2626', flex:1 }}><XCircle size={13} /> Reprovar</button>
          <button className="ib" onClick={()=>onSalvo('rascunho',st,obs)} style={{ flex:1, justifyContent:'center' }}><Edit3 size={13} /> Solicitar Ajuste</button>
        </div>
      </div>
    </div>
  )
}

// ── Modal Crédito ─────────────────────────────────────────────

function ModalCredito({ req, onCriar, onFechar }: {
  req: Requisicao
  onCriar: (c: Partial<FinCredito>) => void
  onFechar: () => void
}) {
  const [f, setF] = useState({
    valor_liberado: req.total_estimado,
    responsavel_nome: req.responsavel_nome,
    responsavel_cargo: '',
    forma_pagamento: 'pix' as FinFormaPagamento,
    prazo_prestacao: '',
    objetivo: `Compras REQ-${String(req.numero).padStart(4,'0')}: ${req.titulo}`,
    observacoes: '',
    setor: req.setor||'',
  })
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'white', borderRadius:14, padding:24, width:500, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontWeight:800, fontSize:15 }}>Liberar Crédito Financeiro</div>
          <button className="ib rd" onClick={onFechar}><X size={15} /></button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div><label className="form-label">Valor (R$) *</label><input className="form-input" type="number" min={0} step="0.01" value={f.valor_liberado} onChange={e=>setF(x=>({...x,valor_liberado:Number(e.target.value)}))} /></div>
            <div><label className="form-label">Forma Pagamento</label><select className="form-input" value={f.forma_pagamento} onChange={e=>setF(x=>({...x,forma_pagamento:e.target.value as FinFormaPagamento}))}>
              <option value="pix">PIX</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option><option value="transferencia">Transferência</option>
            </select></div>
            <div><label className="form-label">Responsável</label><input className="form-input" value={f.responsavel_nome} onChange={e=>setF(x=>({...x,responsavel_nome:e.target.value}))} /></div>
            <div><label className="form-label">Cargo</label><input className="form-input" value={f.responsavel_cargo} onChange={e=>setF(x=>({...x,responsavel_cargo:e.target.value}))} placeholder="Cargo" /></div>
            <div><label className="form-label">Prazo Prestação</label><input className="form-input" type="date" value={f.prazo_prestacao} onChange={e=>setF(x=>({...x,prazo_prestacao:e.target.value}))} /></div>
            <div><label className="form-label">Setor / CC</label><input className="form-input" value={f.setor} onChange={e=>setF(x=>({...x,setor:e.target.value}))} /></div>
          </div>
          <div><label className="form-label">Objetivo *</label><textarea className="form-input" rows={2} value={f.objetivo} onChange={e=>setF(x=>({...x,objetivo:e.target.value}))} style={{ resize:'vertical' }} /></div>
          <div><label className="form-label">Observações</label><textarea className="form-input" rows={2} value={f.observacoes} onChange={e=>setF(x=>({...x,observacoes:e.target.value}))} style={{ resize:'vertical' }} /></div>
          <div style={{ display:'flex', gap:7, justifyContent:'flex-end', marginTop:4 }}>
            <button className="ib" onClick={onFechar}>Cancelar</button>
            <button className="btn" disabled={!f.objetivo.trim()} onClick={()=>{if(f.objetivo.trim())onCriar({...f,prazo_prestacao:f.prazo_prestacao||null})}}>
              <DollarSign size={13} /> Liberar Crédito
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── FormularioView ────────────────────────────────────────────

function FormularioView({ req, loja, userName, produtos, onSalvo, onVoltar }: {
  req: Requisicao|null; loja: string; userName: string; produtos: EstoqueProduto[]
  onSalvo: (r: Partial<Requisicao>, itens: Partial<RequisicaoItem>[], submit: boolean) => Promise<void>
  onVoltar: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<Requisicao>>({
    loja, titulo:'', setor:'', responsavel_nome:userName,
    prioridade:'media', data_necessidade:null, centro_custo:'', observacoes:'',
    ...req,
  })
  const [itens, setItens] = useState<Partial<RequisicaoItem>[]>([])
  const [ldItens, setLdItens] = useState(false)
  const [mItem, setMItem] = useState<{ open:boolean; item:Partial<RequisicaoItem>|null }>({ open:false, item:null })

  useEffect(() => {
    if (req?.id) { setLdItens(true); fetchRequisicaoItens(req.id).then(setItens).catch(()=>{}).finally(()=>setLdItens(false)) }
  }, [req?.id])

  const addI = (i: Partial<RequisicaoItem>) => {
    if (mItem.item?.id) setItens(p=>p.map(x=>x===mItem.item?{...x,...i}:x))
    else setItens(p=>[...p,{...i}])
    setMItem({ open:false, item:null })
  }

  const totalEst = itens.reduce((a,i)=>a+(i.quantidade??0)*(i.preco_referencia??0),0)

  const save = async (submit: boolean) => {
    if (!form.titulo?.trim()) return
    setSaving(true)
    try { await onSalvo({ ...form, total_estimado:totalEst }, itens, submit) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <button className="ib" onClick={onVoltar}><ChevronLeft size={15} /></button>
        <div>
          <h2 style={{ fontSize:17, fontWeight:800, margin:0 }}>{req?`Editar REQ-${String(req.numero).padStart(4,'0')}`:'Nova Requisição'}</h2>
          <p style={{ fontSize:11, color:'var(--muted)', margin:0 }}>Preencha as informações e adicione os itens</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header"><span className="card-tt">Informações Gerais</span></div>
        <div style={{ padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:11 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Título da Requisição *</label>
            <input className="form-input" value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))} placeholder="Ex.: Compra mensal — Cozinha" autoFocus />
          </div>
          <div><label className="form-label">Unidade</label><input className="form-input" value={form.loja} readOnly style={{ opacity:.7 }} /></div>
          <div><label className="form-label">Setor</label><select className="form-input" value={form.setor||''} onChange={e=>setForm(f=>({...f,setor:e.target.value}))}>
            <option value="">Selecione...</option>{SETORES.map(s=><option key={s}>{s}</option>)}
          </select></div>
          <div><label className="form-label">Responsável *</label><input className="form-input" value={form.responsavel_nome} onChange={e=>setForm(f=>({...f,responsavel_nome:e.target.value}))} /></div>
          <div><label className="form-label">Prioridade</label><select className="form-input" value={form.prioridade} onChange={e=>setForm(f=>({...f,prioridade:e.target.value as ReqPrioridade}))}>
            <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option>
          </select></div>
          <div><label className="form-label">Data de Necessidade</label><input className="form-input" type="date" value={form.data_necessidade||''} onChange={e=>setForm(f=>({...f,data_necessidade:e.target.value||null}))} /></div>
          <div><label className="form-label">Centro de Custo</label><input className="form-input" value={form.centro_custo||''} onChange={e=>setForm(f=>({...f,centro_custo:e.target.value}))} /></div>
          <div style={{ gridColumn:'1/-1' }}><label className="form-label">Observações</label>
            <textarea className="form-input" rows={2} value={form.observacoes||''} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))} style={{ resize:'vertical' }} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-header" style={{ display:'flex', justifyContent:'space-between' }}>
          <span className="card-tt"><Package size={13} style={{ display:'inline', marginRight:4 }} />Itens ({itens.length})</span>
          <button className="btn" style={{ padding:'5px 11px', fontSize:12 }} onClick={()=>setMItem({ open:true, item:null })}><Plus size={12} /> Adicionar</button>
        </div>
        {ldItens&&<div style={{ padding:16, textAlign:'center' }}><Loader size={18} className="spin" /></div>}
        {!ldItens&&itens.length===0&&<div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}><Package size={28} style={{ opacity:.2, display:'block', margin:'0 auto 6px' }} />Nenhum item ainda</div>}
        {!ldItens&&itens.length>0&&<div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'var(--bg2)' }}>
              {['Produto','Categoria','Qtd','Un','Ref. Preço','Fornecedor',''].map(h=><th key={h} style={{ padding:'5px 9px', textAlign:'left', fontWeight:700, fontSize:10, color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>{h}</th>)}
            </tr></thead>
            <tbody>{itens.map((item,idx)=>(
              <tr key={idx} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'6px 9px', fontWeight:700 }}>{item.produto_nome}</td>
                <td style={{ padding:'6px 9px', color:'var(--muted)' }}>{item.categoria||'—'}</td>
                <td style={{ padding:'6px 9px' }}>{item.quantidade}</td>
                <td style={{ padding:'6px 9px', color:'var(--muted)' }}>{item.unidade}</td>
                <td style={{ padding:'6px 9px' }}>{item.preco_referencia?fmtR$(item.preco_referencia):'—'}</td>
                <td style={{ padding:'6px 9px', color:'var(--muted)' }}>{item.fornecedor_nome||'—'}</td>
                <td style={{ padding:'6px 9px' }}>
                  <div className="ab" style={{ gap:3 }}>
                    <button className="ib" onClick={()=>setMItem({ open:true, item })}><Edit3 size={11} /></button>
                    <button className="ib rd" onClick={()=>setItens(p=>p.filter((_,i)=>i!==idx))}><Trash2 size={11} /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
        {itens.length>0&&<div style={{ padding:'7px 14px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', fontSize:12, fontWeight:700 }}>
          Total estimado: <span style={{ color:'var(--bordo)', marginLeft:7 }}>{fmtR$(totalEst)}</span>
        </div>}
      </div>

      <div style={{ display:'flex', gap:7, justifyContent:'flex-end' }}>
        <button className="ib" onClick={onVoltar}>Cancelar</button>
        <button className="btn" disabled={saving||!form.titulo?.trim()} onClick={()=>save(false)}>
          {saving?<Loader size={13} className="spin"/>:<Check size={13}/>} Salvar Rascunho
        </button>
        <button className="btn" disabled={saving||!form.titulo?.trim()||itens.length===0} onClick={()=>save(true)} style={{ background:'#B45309' }}>
          {saving?<Loader size={13} className="spin"/>:<Send size={13}/>} Enviar para Aprovação
        </button>
      </div>

      {mItem.open&&<ModalItem item={mItem.item} produtos={produtos} onSalvo={addI} onFechar={()=>setMItem({ open:false, item:null })} />}
    </div>
  )
}

// ── DetalheView ───────────────────────────────────────────────

function DetalheView({ req, loja, userName, produtos, creditos, onEditar, onVoltar, onAtualizar, toast }: {
  req: Requisicao; loja: string; userName: string
  produtos: EstoqueProduto[]; creditos: FinCredito[]
  onEditar: ()=>void; onVoltar: ()=>void
  onAtualizar: (r: Requisicao) => void
  toast: (m: string) => void
}) {
  const [itens, setItens] = useState<RequisicaoItem[]>([])
  const [tl, setTl] = useState<ReqTimeline[]>([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState<'produtos'|'aprovacao'|'financeiro'|'timeline'>('produtos')
  const [mAprov, setMAprov] = useState(false)
  const [mCred, setMCred] = useState(false)
  const [credVinc, setCredVinc] = useState<FinCredito|null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [is, t] = await Promise.all([fetchRequisicaoItens(req.id), fetchReqTimeline(req.id)])
    setItens(is); setTl(t); setLoading(false)
  }, [req.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (req.credito_id) setCredVinc(creditos.find(c=>c.id===req.credito_id)||null) }, [req.credito_id, creditos])

  const tEntry = async (tipo: string, desc: string) => { await insertReqTimeline({ requisicao_id:req.id, tipo, descricao:desc, usuario:userName, dados:null }) }

  const handleEnviar = async () => {
    const u = await updateRequisicao(req.id, { status:'enviada' })
    await tEntry('envio',`Enviada para aprovação por ${userName}`)
    onAtualizar(u); toast('Enviada para aprovação!'); load()
  }

  const handleAprov = async (acao: 'aprovada'|'parcialmente_aprovada'|'reprovada'|'rascunho', st: Record<string, IS>, obs: string) => {
    for (const item of itens) {
      const s = st[item.id]
      if (s) await updateRequisicaoItem(item.id, { bloqueado:s.bloqueado, motivo_bloqueio:s.bloqueado?s.motivo:null, quantidade_aprovada:s.bloqueado?null:s.qtd, status:s.bloqueado?'cancelado':'aprovado' })
    }
    const u = await updateRequisicao(req.id, { status:acao, aprovador_nome:userName, aprovador_at:new Date().toISOString(), obs_aprovacao:obs||null })
    const bl = itens.filter(i=>st[i.id]?.bloqueado).map(i=>i.produto_nome)
    const desc = acao==='aprovada'?`Aprovada por ${userName}`:acao==='parcialmente_aprovada'?`Aprovada parcialmente. Bloqueados: ${bl.join(', ')}`:acao==='reprovada'?`Reprovada por ${userName}`:`Ajuste solicitado por ${userName}`
    await tEntry(acao==='rascunho'?'ajuste':acao==='reprovada'?'reprovacao':'aprovacao', desc)
    for (const nome of bl) await tEntry('bloqueio',`Item bloqueado: ${nome} — ${st[itens.find(i=>i.produto_nome===nome)?.id||'']?.motivo||''}`)
    onAtualizar(u); toast(`${CFG_STATUS[acao].label}!`); setMAprov(false); load()
  }

  const handleCompra = async () => {
    const u = await updateRequisicao(req.id, { status:'compra_realizada' })
    await tEntry('compra',`Compra realizada por ${userName}`)
    onAtualizar(u); toast('Compra realizada!'); load()
  }

  const handleCriarCred = async (c: Partial<FinCredito>) => {
    const cr = await insertFinCredito({ loja, responsavel_nome:c.responsavel_nome!, responsavel_cargo:c.responsavel_cargo||null, supervisor_nome:null, setor:c.setor||null, valor_liberado:c.valor_liberado!, data_liberacao:today(), objetivo:c.objetivo!, forma_pagamento:c.forma_pagamento!, prazo_prestacao:c.prazo_prestacao||null, observacoes:c.observacoes||null, status:'aberto', created_by:userName })
    await updateRequisicao(req.id, { credito_id:cr.id })
    await tEntry('credito',`Crédito #${cr.numero} liberado: ${fmtR$(cr.valor_liberado)} para ${cr.responsavel_nome}`)
    setCredVinc(cr); onAtualizar({ ...req, credito_id:cr.id } as Requisicao)
    toast('Crédito liberado!'); setMCred(false); load()
  }

  const handleFinalizar = async () => {
    const u = await updateRequisicao(req.id, { status:'concluida' })
    await tEntry('finalizacao',`Finalizada por ${userName}`)
    onAtualizar(u); toast('Finalizada!'); load()
  }

  const handleCancelar = async () => {
    if (!confirm('Cancelar esta requisição?')) return
    const u = await updateRequisicao(req.id, { status:'cancelada' })
    await tEntry('ajuste',`Cancelada por ${userName}`)
    onAtualizar(u); toast('Cancelada.')
  }

  const s = req.status
  const canEnviar  = s==='rascunho'
  const canAprovar = s==='enviada'||s==='em_analise'
  const canCompra  = s==='aprovada'||s==='parcialmente_aprovada'
  const canCred    = canCompra&&!req.credito_id
  const canFinal   = s==='compra_realizada'||s==='prestacao_pendente'||s==='em_auditoria'
  const canCancel  = !['concluida','cancelada','compra_realizada'].includes(s)

  const TABS = [{ id:'produtos', l:'🛒 Produtos' },{ id:'aprovacao', l:'✅ Aprovação' },{ id:'financeiro', l:'💳 Financeiro' },{ id:'timeline', l:'📅 Histórico' }] as const

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:14 }}>
        <button className="ib" onClick={onVoltar} style={{ marginTop:4 }}><ChevronLeft size={15} /></button>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <h2 style={{ fontSize:17, fontWeight:800, margin:0 }}>REQ-{String(req.numero).padStart(4,'0')}</h2>
            <PrioBadge prio={req.prioridade} />
            <StatusBadge status={req.status} />
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginTop:2 }}>{req.titulo}</div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{req.loja} · {req.setor||'—'} · {req.responsavel_nome} · {fmtDt(req.created_at)}</div>
        </div>
        <div className="ab" style={{ flexWrap:'wrap', justifyContent:'flex-end', gap:5 }}>
          {canEnviar&&<button className="btn" style={{ background:'#B45309', padding:'5px 11px', fontSize:12 }} onClick={handleEnviar}><Send size={12}/> Enviar</button>}
          {canAprovar&&<button className="btn" style={{ padding:'5px 11px', fontSize:12 }} onClick={()=>setMAprov(true)}><CheckCircle2 size={12}/> Analisar</button>}
          {canCompra&&<button className="btn" style={{ background:'#0891B2', padding:'5px 11px', fontSize:12 }} onClick={handleCompra}><ShoppingCart size={12}/> Compra Realiz.</button>}
          {canFinal&&<button className="btn" style={{ background:'#15803D', padding:'5px 11px', fontSize:12 }} onClick={handleFinalizar}><CheckCircle2 size={12}/> Finalizar</button>}
          <button className="ib" style={{ padding:'5px 9px' }} onClick={()=>gerarPDF(req,itens,loja)}><Download size={13}/></button>
          <button className="ib" style={{ padding:'5px 9px' }} onClick={onEditar}><Edit3 size={13}/></button>
          {canCancel&&<button className="ib rd" style={{ padding:'5px 9px' }} onClick={handleCancelar}><X size={13}/></button>}
        </div>
      </div>

      {/* Sub-tabs */}
      <div style={{ display:'flex', gap:3, borderBottom:'2px solid var(--border)', marginBottom:14 }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)}
            style={{ padding:'6px 13px', fontSize:12, fontWeight:600, background:'none', border:'none', cursor:'pointer', borderBottom:subTab===t.id?'2px solid var(--bordo)':'2px solid transparent', color:subTab===t.id?'var(--bordo)':'var(--muted)', marginBottom:-2 }}>
            {t.l}
          </button>
        ))}
      </div>

      {loading&&<div style={{ padding:28, textAlign:'center' }}><Loader size={24} className="spin" /></div>}

      {!loading&&<>
        {/* PRODUTOS */}
        {subTab==='produtos'&&<div>
          {itens.length===0&&<div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Nenhum item nesta requisição.</div>}
          {itens.map(item=>(
            <div key={item.id} className="card" style={{ marginBottom:10, border:item.bloqueado?'1px solid #FCA5A5':'1px solid var(--border)' }}>
              <div style={{ padding:'11px 14px', display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:180 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                    <span style={{ fontWeight:800, fontSize:13 }}>{item.produto_nome}</span>
                    {item.bloqueado&&<span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:12, background:'#FEE2E2', color:'#DC2626' }}><Lock size={9} style={{ display:'inline' }} /> Bloqueado</span>}
                    {!item.bloqueado&&item.quantidade_aprovada!==null&&<span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:12, background:'#DCFCE7', color:'#15803D' }}>✓ Aprovado</span>}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:5, fontSize:11 }}>
                    <div style={{ color:'var(--muted)' }}>Qtd solicitada: <strong>{item.quantidade} {item.unidade}</strong></div>
                    {item.quantidade_aprovada!==null&&!item.bloqueado&&<div style={{ color:'#15803D' }}>Qtd aprovada: <strong>{item.quantidade_aprovada} {item.unidade}</strong></div>}
                    <div style={{ color:'var(--muted)' }}>Fornecedor: <strong>{item.fornecedor_nome||'—'}</strong></div>
                    {item.preco_referencia&&<div style={{ color:'var(--muted)' }}>Ref: <strong>{fmtR$(item.preco_referencia)}</strong></div>}
                  </div>
                  {item.bloqueado&&item.motivo_bloqueio&&<div style={{ marginTop:5, fontSize:11, color:'#DC2626', fontWeight:600 }}>Motivo: {item.motivo_bloqueio}</div>}
                  {item.observacoes&&<div style={{ marginTop:3, fontSize:11, color:'var(--muted)' }}>{item.observacoes}</div>}
                </div>
                <div style={{ minWidth:200 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:'.5px' }}>Análise de Estoque</div>
                  <AnaliseCard item={item} produtos={produtos} />
                </div>
              </div>
            </div>
          ))}
          {itens.length>0&&<div style={{ padding:'6px 0', display:'flex', justifyContent:'flex-end', gap:18, fontSize:12, fontWeight:700, color:'var(--muted)' }}>
            <span>Total estim: <strong style={{ color:'var(--bordo)' }}>{fmtR$(req.total_estimado)}</strong></span>
            <span>Itens: <strong>{itens.length}</strong></span>
            <span>Bloqueados: <strong style={{ color:'#DC2626' }}>{itens.filter(i=>i.bloqueado).length}</strong></span>
          </div>}
        </div>}

        {/* APROVAÇÃO */}
        {subTab==='aprovacao'&&<div>
          <div className="card" style={{ marginBottom:12 }}>
            <div className="card-header"><span className="card-tt">Status da Aprovação</span></div>
            <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:11 }}>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Status</div><div style={{ marginTop:3 }}><StatusBadge status={req.status} /></div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Aprovador</div><div style={{ fontWeight:700, fontSize:13, marginTop:3 }}>{req.aprovador_nome||'—'}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Data Decisão</div><div style={{ fontWeight:600, fontSize:12, marginTop:3 }}>{req.aprovador_at?fmtTs(req.aprovador_at):'—'}</div></div>
            </div>
            {req.obs_aprovacao&&<div style={{ margin:'0 14px 12px', padding:'8px 12px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, fontSize:12, color:'#166534' }}><strong>Obs.:</strong> {req.obs_aprovacao}</div>}
          </div>
          {canAprovar&&<div style={{ textAlign:'center', padding:'16px 0' }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:10 }}>Esta requisição aguarda aprovação</div>
            <button className="btn" onClick={()=>setMAprov(true)} style={{ padding:'9px 22px' }}><CheckCircle2 size={15}/> Abrir Análise & Aprovação</button>
          </div>}
          {itens.length>0&&<div className="card">
            <div className="card-header"><span className="card-tt">Resumo dos Itens</span></div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead><tr style={{ background:'var(--bg2)' }}>
                  {['Produto','Qtd Sol.','Qtd Aprov.','Un','Ref. Preço','Status'].map(h=><th key={h} style={{ padding:'5px 9px', textAlign:'left', fontWeight:700, fontSize:10, color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>{h}</th>)}
                </tr></thead>
                <tbody>{itens.map(item=>(
                  <tr key={item.id} style={{ borderBottom:'1px solid var(--border)', background:item.bloqueado?'#FFF5F5':undefined }}>
                    <td style={{ padding:'5px 9px', fontWeight:600 }}>{item.produto_nome}</td>
                    <td style={{ padding:'5px 9px' }}>{item.quantidade}</td>
                    <td style={{ padding:'5px 9px' }}>{item.bloqueado?'—':(item.quantidade_aprovada??'—')}</td>
                    <td style={{ padding:'5px 9px', color:'var(--muted)' }}>{item.unidade}</td>
                    <td style={{ padding:'5px 9px' }}>{item.preco_referencia?fmtR$(item.preco_referencia):'—'}</td>
                    <td style={{ padding:'5px 9px' }}>
                      {item.bloqueado?<span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10, background:'#FEE2E2', color:'#DC2626' }}>Bloqueado</span>
                        :item.quantidade_aprovada!==null?<span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10, background:'#DCFCE7', color:'#15803D' }}>Aprovado</span>
                        :<span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:10, background:'#F1F5F9', color:'#64748b' }}>Pendente</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>}
        </div>}

        {/* FINANCEIRO */}
        {subTab==='financeiro'&&<div>
          {credVinc?<div className="card" style={{ marginBottom:12 }}>
            <div className="card-header" style={{ display:'flex', justifyContent:'space-between' }}>
              <span className="card-tt"><DollarSign size={13} style={{ display:'inline', marginRight:4 }} />Crédito Vinculado</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:12, background:'#DCFCE7', color:'#15803D' }}>Ativo</span>
            </div>
            <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10 }}>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Nº Crédito</div><div style={{ fontWeight:700 }}>CR-{String(credVinc.numero).padStart(4,'0')}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Valor Liberado</div><div style={{ fontWeight:800, color:'var(--bordo)', fontSize:16 }}>{fmtR$(credVinc.valor_liberado)}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Responsável</div><div style={{ fontWeight:700 }}>{credVinc.responsavel_nome}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Forma Pgto</div><div style={{ fontWeight:700 }}>{credVinc.forma_pagamento.toUpperCase()}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Data Liberação</div><div style={{ fontWeight:600 }}>{fmtDt(credVinc.data_liberacao)}</div></div>
              <div><div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase' }}>Prazo Prestação</div><div style={{ fontWeight:600 }}>{fmtDt(credVinc.prazo_prestacao)}</div></div>
            </div>
          </div>:<div className="card" style={{ marginBottom:12 }}>
            <div style={{ padding:22, textAlign:'center' }}>
              <DollarSign size={36} style={{ opacity:.2, marginBottom:7 }} />
              <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>Nenhum crédito vinculado</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>{canCred?'Libere crédito para esta compra':'Requisição precisa estar aprovada'}</div>
              {canCred&&<button className="btn" onClick={()=>setMCred(true)} style={{ padding:'7px 18px' }}><DollarSign size={13}/> Liberar Crédito</button>}
            </div>
          </div>}
          <div className="card">
            <div className="card-header"><span className="card-tt">Confronto Financeiro</span></div>
            <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:10 }}>
              {[
                { l:'Valor Estimado', v:req.total_estimado, c:'#0369A1' },
                { l:'Crédito Liberado', v:credVinc?.valor_liberado??0, c:'#15803D' },
                { l:'Valor Final', v:req.total_final, c:'var(--bordo)' },
                { l:'Saldo', v:(credVinc?.valor_liberado??0)-req.total_final, c:(credVinc?.valor_liberado??0)-req.total_final>=0?'#15803D':'#DC2626' },
              ].map(k=>(
                <div key={k.l} style={{ background:'var(--bg2)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:3 }}>{k.l}</div>
                  <div style={{ fontSize:17, fontWeight:800, color:k.c }}>{fmtR$(k.v)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>}

        {/* TIMELINE */}
        {subTab==='timeline'&&<div>
          {tl.length===0&&<div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:13 }}><Clock size={28} style={{ opacity:.2, display:'block', margin:'0 auto 7px' }} />Nenhum evento registrado.</div>}
          <div style={{ position:'relative', paddingLeft:26 }}>
            <div style={{ position:'absolute', left:9, top:0, bottom:0, width:2, background:'var(--border)' }} />
            {tl.map(ev=>{
              const ic = TIMELINE_ICON[ev.tipo]??<Clock size={10}/>
              const cl = TIMELINE_COLOR[ev.tipo]??'#64748b'
              return (
                <div key={ev.id} style={{ position:'relative', marginBottom:14 }}>
                  <div style={{ position:'absolute', left:-22, top:2, width:18, height:18, borderRadius:'50%', background:cl, color:'white', display:'flex', alignItems:'center', justifyContent:'center' }}>{ic}</div>
                  <div style={{ background:'var(--bg2)', borderRadius:8, padding:'8px 12px', border:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ fontSize:12, fontWeight:600 }}>{ev.descricao}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtTs(ev.created_at)}</div>
                    </div>
                    {ev.usuario&&<div style={{ fontSize:10, color:'var(--muted)', marginTop:1 }}>por {ev.usuario}</div>}
                  </div>
                </div>
              )
            })}
            {tl.length>0&&<div style={{ position:'relative' }}>
              <div style={{ position:'absolute', left:-22, top:2, width:18, height:18, borderRadius:'50%', background:'var(--border)' }} />
              <div style={{ fontSize:11, color:'var(--muted)', paddingTop:3 }}>Criada em {fmtDt(req.created_at)} por {req.created_by||req.responsavel_nome}</div>
            </div>}
          </div>
        </div>}
      </>}

      {mAprov&&<ModalAprovacao req={req} itens={itens} userName={userName} onSalvo={handleAprov} onFechar={()=>setMAprov(false)} />}
      {mCred&&<ModalCredito req={req} onCriar={handleCriarCred} onFechar={()=>setMCred(false)} />}
    </div>
  )
}

// ── DashboardView ─────────────────────────────────────────────

function DashboardView({ reqs }: { reqs: Requisicao[] }) {
  const mes = new Date().getMonth(), ano = new Date().getFullYear()
  const doMes    = reqs.filter(r=>{ const d=new Date(r.created_at); return d.getMonth()===mes&&d.getFullYear()===ano })
  const pendentes= reqs.filter(r=>['enviada','em_analise'].includes(r.status)).length
  const aprovadas= reqs.filter(r=>['aprovada','parcialmente_aprovada','compra_realizada'].includes(r.status)).length
  const totalAprov=reqs.filter(r=>['aprovada','parcialmente_aprovada'].includes(r.status)).reduce((a,r)=>a+r.total_estimado,0)
  const reprovadas=reqs.filter(r=>r.status==='reprovada').length

  const dist = (Object.entries(CFG_STATUS) as [ReqStatus, typeof CFG_STATUS[ReqStatus]][])
    .map(([k,v])=>({ k, l:v.label, c:v.color, n:reqs.filter(r=>r.status===k).length }))
    .filter(x=>x.n>0).sort((a,b)=>b.n-a.n)
  const mx = Math.max(...dist.map(x=>x.n),1)

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:11, marginBottom:18 }}>
        {[
          { l:'Este mês', v:doMes.length, ic:<BarChart2 size={17}/>, c:'#0369A1', bg:'#E0F2FE' },
          { l:'Aguard. Aprovação', v:pendentes, ic:<Clock size={17}/>, c:'#B45309', bg:'#FEF3C7' },
          { l:'Aprovadas', v:aprovadas, ic:<CheckCircle2 size={17}/>, c:'#15803D', bg:'#DCFCE7' },
          { l:'Valor Aprovado', v:fmtR$(totalAprov), ic:<DollarSign size={17}/>, c:'var(--bordo)', bg:'var(--bordo-bg)' },
          { l:'Reprovadas', v:reprovadas, ic:<XCircle size={17}/>, c:'#DC2626', bg:'#FEE2E2' },
          { l:'Total Geral', v:reqs.length, ic:<Layers size={17}/>, c:'#6D28D9', bg:'#EDE9FE' },
        ].map(k=>(
          <div key={k.l} style={{ background:'white', border:'1px solid var(--border)', borderRadius:13, padding:'13px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:42, height:42, borderRadius:11, background:k.bg, display:'flex', alignItems:'center', justifyContent:'center', color:k.c, flexShrink:0 }}>{k.ic}</div>
            <div><div style={{ fontSize:19, fontWeight:800, color:k.c, lineHeight:1 }}>{k.v}</div><div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{k.l}</div></div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div className="card">
          <div className="card-header"><span className="card-tt">Distribuição por Status</span></div>
          <div style={{ padding:'10px 14px' }}>
            {dist.length===0&&<div style={{ fontSize:12, color:'var(--muted)', textAlign:'center', padding:14 }}>Sem dados</div>}
            {dist.map(s=>(
              <div key={s.k} style={{ marginBottom:9 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:2 }}>
                  <span style={{ fontWeight:600, color:s.c }}>{s.l}</span>
                  <span style={{ fontWeight:700 }}>{s.n}</span>
                </div>
                <div style={{ background:'#f1f5f9', borderRadius:5, height:5 }}>
                  <div style={{ width:`${s.n/mx*100}%`, height:'100%', borderRadius:5, background:s.c }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-tt">Por Prioridade</span></div>
          <div style={{ padding:'10px 14px' }}>
            {(['urgente','alta','media','baixa'] as ReqPrioridade[]).map(p=>{
              const n=reqs.filter(r=>r.prioridade===p).length, cfg=CFG_PRIO[p]
              return (
                <div key={p} style={{ display:'flex', alignItems:'center', gap:9, marginBottom:9 }}>
                  <PrioBadge prio={p} />
                  <div style={{ flex:1, background:'#f1f5f9', borderRadius:5, height:5 }}>
                    <div style={{ width:`${reqs.length>0?n/reqs.length*100:0}%`, height:'100%', borderRadius:5, background:cfg.color }} />
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, minWidth:18, textAlign:'right' }}>{n}</span>
                </div>
              )
            })}
            <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid var(--border)', fontSize:11, color:'var(--muted)' }}>
              Total: <strong style={{ color:'var(--text)' }}>{reqs.length}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ListaView ─────────────────────────────────────────────────

function ListaView({ reqs, loja, lojas, onNova, onDetalhe, onEditar, onDelete, loading }: {
  reqs: Requisicao[]; loja: string; lojas: string[]
  onNova: ()=>void; onDetalhe: (r:Requisicao)=>void; onEditar: (r:Requisicao)=>void
  onDelete: (id:string)=>void; loading: boolean
}) {
  const [srch, setSrch] = useState('')
  const [fSt, setFSt] = useState<ReqStatus|''>('')
  const [fPr, setFPr] = useState<ReqPrioridade|''>('')
  const [fLj, setFLj] = useState(loja==='Todas as Lojas'?'':loja)

  const fil = reqs.filter(r=>{
    if (fSt && r.status!==fSt) return false
    if (fPr && r.prioridade!==fPr) return false
    if (fLj && r.loja!==fLj) return false
    if (srch) { const q=srch.toLowerCase(); return r.titulo.toLowerCase().includes(q)||r.responsavel_nome.toLowerCase().includes(q)||String(r.numero).includes(q) }
    return true
  })

  return (
    <div>
      <div style={{ display:'flex', gap:7, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
        <div style={{ position:'relative', flex:'1 1 180px', minWidth:150 }}>
          <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }} />
          <input className="form-input" value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Buscar..." style={{ paddingLeft:30 }} />
        </div>
        <select className="form-input" style={{ width:155 }} value={fSt} onChange={e=>setFSt(e.target.value as ReqStatus|'')}>
          <option value="">Todos os status</option>
          {(Object.entries(CFG_STATUS) as [ReqStatus, typeof CFG_STATUS[ReqStatus]][]).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="form-input" style={{ width:125 }} value={fPr} onChange={e=>setFPr(e.target.value as ReqPrioridade|'')}>
          <option value="">Todas prioridades</option>
          {(Object.entries(CFG_PRIO) as [ReqPrioridade, typeof CFG_PRIO[ReqPrioridade]][]).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        {loja==='Todas as Lojas'&&<select className="form-input" style={{ width:140 }} value={fLj} onChange={e=>setFLj(e.target.value)}>
          <option value="">Todas as lojas</option>
          {lojas.map(l=><option key={l}>{l}</option>)}
        </select>}
        <button className="btn" onClick={onNova} style={{ marginLeft:'auto', flexShrink:0 }}><Plus size={13}/> Nova Requisição</button>
      </div>

      {loading&&<div style={{ padding:28, textAlign:'center' }}><Loader size={22} className="spin" /></div>}

      {!loading&&fil.length===0&&<div style={{ padding:36, textAlign:'center', color:'var(--muted)' }}>
        <ShoppingCart size={36} style={{ opacity:.2, display:'block', margin:'0 auto 9px' }} />
        <div style={{ fontSize:14, fontWeight:600, marginBottom:5 }}>Nenhuma requisição encontrada</div>
        <div style={{ fontSize:12 }}>Crie uma nova requisição para começar</div>
      </div>}

      {!loading&&fil.length>0&&<div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead><tr style={{ background:'var(--bg2)' }}>
            {['Nº','Título','Unidade','Setor','Responsável','Prioridade','Status','Data',''].map(h=><th key={h} style={{ padding:'7px 9px', textAlign:'left', fontWeight:700, fontSize:10, color:'var(--muted)', borderBottom:'2px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>)}
          </tr></thead>
          <tbody>{fil.map(r=>(
            <tr key={r.id} onClick={()=>onDetalhe(r)} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg2)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <td style={{ padding:'8px 9px', fontWeight:800, color:'var(--bordo)', whiteSpace:'nowrap' }}>REQ-{String(r.numero).padStart(4,'0')}</td>
              <td style={{ padding:'8px 9px', fontWeight:600, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.titulo}</td>
              <td style={{ padding:'8px 9px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.loja}</td>
              <td style={{ padding:'8px 9px', color:'var(--muted)' }}>{r.setor||'—'}</td>
              <td style={{ padding:'8px 9px', color:'var(--muted)', whiteSpace:'nowrap' }}>{r.responsavel_nome}</td>
              <td style={{ padding:'8px 9px' }}><PrioBadge prio={r.prioridade} /></td>
              <td style={{ padding:'8px 9px' }}><StatusBadge status={r.status} /></td>
              <td style={{ padding:'8px 9px', color:'var(--muted)', whiteSpace:'nowrap' }}>{fmtDt(r.created_at)}</td>
              <td style={{ padding:'8px 9px' }} onClick={e=>e.stopPropagation()}>
                <div className="ab" style={{ gap:3 }}>
                  <button className="ib" onClick={()=>onEditar(r)}><Edit3 size={11}/></button>
                  <button className="ib rd" onClick={()=>onDelete(r.id)}><Trash2 size={11}/></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
        <div style={{ padding:'6px 0', fontSize:11, color:'var(--muted)' }}>{fil.length} requisição(ões)</div>
      </div>}
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────

export default function RequisoesPage() {
  const { user, profile } = useAuth()
  const { theme } = useTheme()
  const { toast, ToastEl } = useToast()
  const loja     = profile?.loja ?? 'Todas as Lojas'
  const userName = profile?.name ?? user?.email ?? 'Usuário'

  const [tab, setTab] = useState<'lista'|'dashboard'>('lista')
  const [view, setView] = useState<'lista'|'form'|'detalhe'>('lista')
  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [sel, setSel] = useState<Requisicao|null>(null)
  const [prods, setProds] = useState<EstoqueProduto[]>([])
  const [creds, setCreds] = useState<FinCredito[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [rs, ps, cs] = await Promise.all([
        fetchRequisicoes(loja!=='Todas as Lojas'?loja:undefined),
        fetchEstoqueProdutos(loja!=='Todas as Lojas'?loja:undefined),
        fetchFinCreditos(loja).catch(()=>[] as FinCredito[]),
      ])
      setReqs(rs); setProds(ps); setCreds(cs)
    } catch { toast('Erro ao carregar') }
    finally { setLoading(false) }
  }, [loja])

  useEffect(() => { loadAll() }, [loadAll])

  const handleSalvo = async (formData: Partial<Requisicao>, itens: Partial<RequisicaoItem>[], submit: boolean) => {
    let req: Requisicao
    if (sel?.id) {
      req = await updateRequisicao(sel.id, { ...formData, status:submit?'enviada':(formData.status||'rascunho') })
      const old = await fetchRequisicaoItens(req.id)
      for (const o of old) await deleteRequisicaoItem(o.id)
    } else {
      req = await insertRequisicao({ loja:formData.loja!, titulo:formData.titulo!, setor:formData.setor||null, responsavel_nome:formData.responsavel_nome||userName, prioridade:formData.prioridade||'media', data_necessidade:formData.data_necessidade||null, centro_custo:formData.centro_custo||null, total_estimado:formData.total_estimado||0, total_final:0, observacoes:formData.observacoes||null, status:submit?'enviada':'rascunho', aprovador_nome:null, aprovador_at:null, obs_aprovacao:null, credito_id:null, created_by:userName })
      await insertReqTimeline({ requisicao_id:req.id, tipo:'criacao', descricao:`Requisição criada por ${userName}`, usuario:userName, dados:null })
    }
    for (const item of itens) {
      await insertRequisicaoItem({ requisicao_id:req.id, produto_nome:item.produto_nome!, categoria:item.categoria||null, quantidade:item.quantidade!, unidade:item.unidade||'Unidade', preco_referencia:item.preco_referencia||null, preco_cotado:null, preco_final:null, fornecedor_nome:item.fornecedor_nome||null, status:'pendente', observacoes:item.observacoes||null, bloqueado:false, motivo_bloqueio:null, quantidade_aprovada:null })
    }
    if (submit) await insertReqTimeline({ requisicao_id:req.id, tipo:'envio', descricao:`Enviada para aprovação por ${userName}`, usuario:userName, dados:null })
    setReqs(p=>sel?.id?p.map(r=>r.id===req.id?req:r):[req,...p])
    toast(submit?'Enviada para aprovação!':'Rascunho salvo!'); setView('lista'); setSel(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta requisição?')) return
    await deleteRequisicao(id); setReqs(p=>p.filter(r=>r.id!==id)); toast('Excluída.')
  }

  const handleAtualizar = (u: Requisicao) => { setReqs(p=>p.map(r=>r.id===u.id?u:r)); setSel(u) }

  return (
    <div style={{ padding:'20px 20px 40px' }}>
      {ToastEl}

      {view==='lista'&&(
        <div style={{ display:'flex', gap:5, marginBottom:18 }}>
          {[{ id:'lista', l:'📋 Requisições' },{ id:'dashboard', l:'📊 Painel' }].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id as 'lista'|'dashboard')}
              style={{ padding:'7px 17px', fontSize:13, fontWeight:700, borderRadius:9, border:tab===t.id?'1px solid var(--bordo)':'1px solid var(--border)', background:tab===t.id?'var(--bordo)':'transparent', color:tab===t.id?'white':'var(--muted)', cursor:'pointer' }}>
              {t.l}
            </button>
          ))}
          <button className="ib" style={{ marginLeft:'auto' }} onClick={loadAll} title="Atualizar"><RefreshCw size={13}/></button>
        </div>
      )}

      {view==='lista'&&tab==='lista'&&<ListaView reqs={reqs} loja={loja} lojas={theme.stores||[]} onNova={()=>{setSel(null);setView('form')}} onDetalhe={r=>{setSel(r);setView('detalhe')}} onEditar={r=>{setSel(r);setView('form')}} onDelete={handleDelete} loading={loading} />}
      {view==='lista'&&tab==='dashboard'&&<DashboardView reqs={reqs} />}
      {view==='form'&&<FormularioView req={sel} loja={loja} userName={userName} produtos={prods} onSalvo={handleSalvo} onVoltar={()=>{setView('lista');setSel(null)}} />}
      {view==='detalhe'&&sel&&<DetalheView req={sel} loja={loja} userName={userName} produtos={prods} creditos={creds} onEditar={()=>{setSel(sel);setView('form')}} onVoltar={()=>{setView('lista');setSel(null)}} onAtualizar={handleAtualizar} toast={toast} />}
    </div>
  )
}
