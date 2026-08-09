import { useState, useEffect, useMemo, useCallback } from 'react'
import { Truck, Search, Plus, X, RefreshCw, List, MessageCircle, PackageCheck, ClipboardCheck, Clock, CalendarDays, CalendarRange, LayoutGrid } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { siteOrigin } from '../../lib/site'

const sb = supabase as any
const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']
const canon = (l: string) => (l === 'Amore Costa Dourada' ? 'Amore CD' : l === 'Flow Paiva' ? 'Amore Paiva' : l === 'Flow Costa Dourada' ? 'Flow CD' : (l || ''))
const soDig = (s: string) => (s || '').replace(/\D/g, '')
const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ddmm = (d?: string) => d ? d.split('-').reverse().slice(0, 2).join('/') : '—'

// 13 status (spec §5)
const STATUS: Record<string, { l: string; c: string; bg: string }> = {
  a_confirmar: { l: 'A confirmar', c: '#B45309', bg: '#FEF3C7' },
  confirmada: { l: 'Confirmada', c: '#1D4ED8', bg: '#DBEAFE' },
  em_separacao: { l: 'Em separação', c: '#4338CA', bg: '#E0E7FF' },
  em_rota: { l: 'Em rota', c: '#0E7490', bg: '#CFFAFE' },
  aguardando: { l: 'Aguardando', c: '#B45309', bg: '#FEF3C7' },
  em_conferencia: { l: 'Em conferência', c: '#7C3AED', bg: '#EDE9FE' },
  recebida: { l: 'Recebida', c: '#15803D', bg: '#DCFCE7' },
  recebida_parcial: { l: 'Recebida parcial', c: '#C2410C', bg: '#FFEDD5' },
  divergencia: { l: 'Divergência', c: '#B91C1C', bg: '#FEE2E2' },
  atrasada: { l: 'Atrasada', c: '#B91C1C', bg: '#FEE2E2' },
  reagendada: { l: 'Reagendada', c: '#475569', bg: '#E2E8F0' },
  recusada: { l: 'Recusada', c: '#991B1B', bg: '#FEE2E2' },
  cancelada: { l: 'Cancelada', c: '#6B7280', bg: '#F3F4F6' },
}
// Não somos a logística do fornecedor — monitoramos o RECEBIMENTO. Sem etapas internas (separação/rota/aguardando).
const STATUS_ORDER = ['a_confirmar', 'confirmada', 'atrasada', 'em_conferencia', 'recebida', 'recebida_parcial', 'divergencia', 'reagendada', 'recusada', 'cancelada']
const FINAIS = ['recebida', 'recebida_parcial', 'cancelada', 'recusada']
const CATS: Record<string, { l: string; e: string; c: string }> = {
  proteinas: { l: 'Proteínas', e: '🥩', c: '#B91C1C' },
  hortifruti: { l: 'Hortifrúti', e: '🥦', c: '#15803D' },
  mercearia: { l: 'Mercearia', e: '🥫', c: '#B45309' },
  bebidas: { l: 'Bebidas', e: '🥤', c: '#1D4ED8' },
  frios: { l: 'Frios e laticínios', e: '🧀', c: '#CA8A04' },
  limpeza: { l: 'Limpeza', e: '🧴', c: '#0891B2' },
  descartaveis: { l: 'Descartáveis', e: '🍴', c: '#6366F1' },
  embalagens: { l: 'Embalagens', e: '📦', c: '#92400E' },
  manutencao: { l: 'Manutenção', e: '🔧', c: '#334155' },
  equipamentos: { l: 'Equipamentos', e: '⚙️', c: '#475569' },
  outros: { l: 'Outros', e: '📋', c: '#6B7280' },
}
const JANELAS = ['Manhã', 'Tarde', 'Noite', '08:00–10:00', '10:00–12:00', '12:00–14:00', '14:00–16:00', '16:00–18:00']
const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const weekStart = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10) }

type Entrega = any

export default function EntregasPage() {
  const { user } = useAuth()
  const { loja: lojaCtx } = useLoja()
  const { toast } = useToast()
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [pedidos, setPedidos] = useState<any[]>([])
  const [fornecedores, setFornecedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vista, setVista] = useState<'hoje' | 'lista' | 'semana' | 'mes' | 'kanban'>('hoje')
  const [refData, setRefData] = useState(hojeISO())
  const [fLoja, setFLoja] = useState(LOJAS.includes(canon(lojaCtx)) ? canon(lojaCtx) : '')
  const [fStatus, setFStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [mForm, setMForm] = useState<Entrega | null>(null)
  const [mDet, setMDet] = useState<Entrega | null>(null)
  const [mChegou, setMChegou] = useState<Entrega | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [e, p, f] = await Promise.all([
        sb.from('entregas_agendadas').select('*').order('data_prevista', { ascending: true }).limit(2000),
        sb.from('app_config').select('chave,valor').like('chave', 'pedido_%'),
        sb.from('fornecedores').select('nome,whatsapp,telefone,loja'),
      ])
      setEntregas(e.data || [])
      setPedidos((p.data || []).map((r: any) => ({ ref: String(r.chave).replace(/^pedido_/, ''), ...(r.valor || {}) })))
      setFornecedores(f.data || [])
    } catch { toast('Erro ao carregar entregas.', 'error') }
    setLoading(false)
  }, [toast])
  useEffect(() => { load() }, [load])

  const foneFornecedor = useCallback((nome: string) => {
    const n = (nome || '').toLowerCase().trim()
    const f = fornecedores.find(x => (x.nome || '').toLowerCase().trim() === n && soDig(x.whatsapp || x.telefone).length >= 10)
    return f ? soDig(f.whatsapp || f.telefone) : ''
  }, [fornecedores])

  // status efetivo (marca atrasada dinamicamente)
  const efetivo = (e: Entrega) => (e.data_prevista && e.data_prevista < hojeISO() && !FINAIS.includes(e.status) && e.status !== 'cancelada' ? 'atrasada' : e.status)
  const hoje = hojeISO()

  const filtradas = useMemo(() => entregas
    .filter(e => !fLoja || e.loja === fLoja)
    .filter(e => !fStatus || efetivo(e) === fStatus)
    .filter(e => vista !== 'hoje' || e.data_prevista === hoje)
    .filter(e => {
      const q = busca.toLowerCase().trim(); if (!q) return true
      return [e.fornecedor, e.vendedor, e.pedido_numero, e.pedido_ref, e.responsavel].some((x: string) => (x || '').toLowerCase().includes(q))
    })
    .sort((a, b) => (a.data_prevista || '').localeCompare(b.data_prevista || '') || (a.janela || '').localeCompare(b.janela || '')),
    [entregas, fLoja, fStatus, busca, vista])

  // KPIs (do dia de hoje, respeitando loja)
  const doDia = entregas.filter(e => e.data_prevista === hoje && (!fLoja || e.loja === fLoja))
  const kpi = {
    hoje: doDia.length,
    confirmadas: doDia.filter(e => e.status === 'confirmada').length,
    aconfirmar: doDia.filter(e => e.status === 'a_confirmar').length,
    conferencia: doDia.filter(e => e.status === 'em_conferencia').length,
    concluidas: doDia.filter(e => ['recebida', 'recebida_parcial'].includes(e.status)).length,
    atrasadas: entregas.filter(e => (!fLoja || e.loja === fLoja) && efetivo(e) === 'atrasada').length,
    divergencias: doDia.filter(e => e.status === 'divergencia').length,
  }

  const histEntry = (acao: string, de?: string, para?: string) => ({ em: new Date().toISOString(), por: user?.name || 'Painel', acao, de: de || null, para: para || null })

  const mudarStatus = async (e: Entrega, novo: string) => {
    const patch: any = { status: novo, updated_at: new Date().toISOString(), historico: [...(e.historico || []), histEntry('status', e.status, novo)] }
    if (['recebida', 'recebida_parcial', 'recusada'].includes(novo)) patch.concluida_em = new Date().toISOString()
    await sb.from('entregas_agendadas').update(patch).eq('id', e.id)
    toast(`Status → ${STATUS[novo]?.l || novo}`)
    load(); setMDet(null)
  }

  const msgConfirmar = (e: Entrega) => `Olá${e.vendedor ? ', ' + e.vendedor.split(' ')[0] : ''}! Aqui é da *Amore Food* (Compras). Estamos confirmando a entrega do *Pedido ${e.pedido_numero || e.pedido_ref || ''}*, destinado à unidade *${e.loja}*, prevista para *${ddmm(e.data_prevista)}*${e.janela ? ` (${e.janela})` : ''}. Por favor, confirme a programação e a previsão de entrega. Obrigado! 🙏`
  const waConfirm = (e: Entrega) => { const t = soDig(e.vendedor_fone) || foneFornecedor(e.fornecedor); return t ? `https://wa.me/55${t}?text=${encodeURIComponent(msgConfirmar(e))}` : '' }

  const abrirConferencia = (e: Entrega) => {
    if (e.status !== 'em_conferencia') mudarStatus(e, 'em_conferencia')
    if (e.pedido_ref) window.open(`${siteOrigin()}/pedido.html?p=${encodeURIComponent(e.pedido_ref)}`, '_blank')
    else toast('Sem pedido vinculado — abra o recebimento manualmente.', 'error')
  }

  // ── Fase 2: calendário (semana/mês) + kanban + arrastar p/ reagendar ──
  const reagendar = async (id: string, dia: string) => {
    const e = entregas.find((x: Entrega) => x.id === id); if (!e || e.data_prevista === dia) return
    await sb.from('entregas_agendadas').update({ data_prevista: dia, updated_at: new Date().toISOString(), historico: [...(e.historico || []), histEntry('reagendamento', e.data_prevista, dia)] }).eq('id', id)
    toast(`Reagendada para ${ddmm(dia)} 📅`); load()
  }
  const dropDia = (ev: any, dia: string) => { ev.preventDefault(); const id = ev.dataTransfer.getData('text/plain'); if (id) reagendar(id, dia) }
  const dropCol = (ev: any, novo: string) => { ev.preventDefault(); const id = ev.dataTransfer.getData('text/plain'); const e = entregas.find((x: Entrega) => x.id === id); if (e && e.status !== novo) mudarStatus(e, novo) }
  const mini = (e: Entrega) => {
    const st = efetivo(e); const S = STATUS[st] || STATUS.a_confirmar; const cat = (e.categorias && e.categorias[0]) || e.categoria; const C = cat ? CATS[cat] : null
    return <div key={e.id} draggable onDragStart={ev => ev.dataTransfer.setData('text/plain', e.id)} onClick={() => setMDet(e)}
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${C?.c || S.c}`, borderRadius: 8, padding: '5px 8px', fontSize: 11.5, cursor: 'grab', marginBottom: 5 }}>
      <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{C ? C.e + ' ' : ''}{e.fornecedor || '—'}</div>
      <div style={{ color: 'var(--muted)', display: 'flex', justifyContent: 'space-between', gap: 6 }}><span>{e.janela || '—'}</span><span style={{ color: S.c, fontWeight: 600 }}>{S.l}</span></div>
    </div>
  }
  // Card completo do Kanban — monitoramento do recebimento (fornecedor/vendedor, data+horário, itens, categorias, WhatsApp direto)
  const kanbanCard = (e: Entrega) => {
    const st = efetivo(e); const S = STATUS[st] || STATUS.a_confirmar
    const cats = (e.categorias && e.categorias.length ? e.categorias : (e.categoria ? [e.categoria] : []))
    const cor = (cats[0] && CATS[cats[0]]?.c) || S.c
    const wa = waConfirm(e)
    return <div key={e.id} draggable onDragStart={ev => ev.dataTransfer.setData('text/plain', e.id)}
      style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${cor}`, borderRadius: 9, padding: '8px 9px', cursor: 'grab', marginBottom: 7, boxShadow: 'var(--shadow)' }}>
      <div onClick={() => setMDet(e)} style={{ cursor: 'pointer' }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.fornecedor || 'Fornecedor'}</div>
        {e.vendedor && <div style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🧑‍💼 {e.vendedor}</div>}
        <div style={{ fontSize: 11.5, marginTop: 4, fontWeight: 600 }}>📅 {ddmm(e.data_prevista)}{e.janela ? ` · ${e.janela}` : ''}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
          <span>🏪 {e.loja}</span>
          {e.qtd_itens > 0 && <span>📦 {e.qtd_itens} itens</span>}
        </div>
        {cats.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
          {cats.map((c: string) => { const C = CATS[c]; return C ? <span key={c} style={{ fontSize: 10, background: C.c + '22', color: C.c, borderRadius: 6, padding: '1px 6px', fontWeight: 600 }}>{C.e} {C.l}</span> : null })}
        </div>}
      </div>
      {wa && <a href={wa} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()} className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#25D366', color: '#fff', padding: '4px 9px', fontSize: 11, textDecoration: 'none', marginTop: 7, borderRadius: 6 }}><MessageCircle size={12} /> WhatsApp</a>}
    </div>
  }
  const navBar = (label: string, onPrev: () => void, onNext: () => void) => <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
    <button className="btn bo" onClick={onPrev} style={{ padding: '4px 11px' }}>‹</button>
    <strong style={{ fontSize: 14, minWidth: 170, textAlign: 'center' }}>{label}</strong>
    <button className="btn bo" onClick={onNext} style={{ padding: '4px 11px' }}>›</button>
    <button className="btn bo" onClick={() => setRefData(hojeISO())} style={{ padding: '4px 10px', fontSize: 12 }}>Hoje</button>
  </div>
  const renderSemana = () => {
    const ini = weekStart(refData); const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i))
    return <div>
      {navBar(`Semana de ${ddmm(ini)}`, () => setRefData(addDays(refData, -7)), () => setRefData(addDays(refData, 7)))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(130px,1fr))', gap: 8, overflowX: 'auto' }}>
        {dias.map((d, i) => { const doDia = filtradas.filter((e: Entrega) => e.data_prevista === d); const isHoje = d === hoje
          return <div key={d} onDragOver={ev => ev.preventDefault()} onDrop={ev => dropDia(ev, d)} style={{ background: isHoje ? 'color-mix(in srgb,var(--bordo) 7%,var(--card))' : 'var(--bg)', border: `1px solid ${isHoje ? 'var(--bordo)' : 'var(--border)'}`, borderRadius: 10, padding: 8, minHeight: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: isHoje ? 'var(--bordo)' : 'var(--muted)', marginBottom: 6 }}>{DOW[i]} {ddmm(d)}{doDia.length ? ` · ${doDia.length}` : ''}</div>
            {doDia.map(mini)}
          </div> })}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Arraste um card para outro dia para reagendar (o histórico fica registrado).</div>
    </div>
  }
  const renderMes = () => {
    const [y, m] = refData.split('-').map(Number); const primeiro = `${y}-${String(m).padStart(2, '0')}-01`
    const ini = weekStart(primeiro); const celulas = Array.from({ length: 42 }, (_, k) => addDays(ini, k))
    return <div>
      {navBar(`${MESES[m - 1]} ${y}`, () => setRefData(m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`), () => setRefData(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, fontSize: 11 }}>
        {DOW.map(d => <div key={d} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 700, padding: 4 }}>{d}</div>)}
        {celulas.map(d => { const doDia = filtradas.filter((e: Entrega) => e.data_prevista === d); const noMes = Number(d.slice(5, 7)) === m; const isHoje = d === hoje
          return <div key={d} onDragOver={ev => ev.preventDefault()} onDrop={ev => dropDia(ev, d)} style={{ minHeight: 76, background: isHoje ? 'color-mix(in srgb,var(--bordo) 8%,var(--card))' : 'var(--card)', border: `1px solid ${isHoje ? 'var(--bordo)' : 'var(--border)'}`, borderRadius: 8, padding: 5, opacity: noMes ? .45 : 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--muted)' }}>{Number(d.slice(8, 10))}</div>
            {doDia.slice(0, 3).map((e: Entrega) => { const cat = (e.categorias && e.categorias[0]) || e.categoria; const C = cat ? CATS[cat] : null; return <div key={e.id} draggable onDragStart={ev => ev.dataTransfer.setData('text/plain', e.id)} onClick={() => setMDet(e)} title={e.fornecedor} style={{ cursor: 'grab', fontSize: 10, background: 'var(--bg)', borderLeft: `2px solid ${C?.c || STATUS[efetivo(e)]?.c}`, borderRadius: 4, padding: '1px 4px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{C ? C.e : '•'} {e.fornecedor}</div> })}
            {doDia.length > 3 && <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>+{doDia.length - 3}</div>}
          </div> })}
      </div>
    </div>
  }
  const renderKanban = () => {
    const cols = STATUS_ORDER
    return <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
      {cols.map(col => { const cards = filtradas.filter((e: Entrega) => efetivo(e) === col); const S = STATUS[col]
        return <div key={col} onDragOver={ev => ev.preventDefault()} onDrop={ev => dropCol(ev, col)} style={{ minWidth: 224, flex: '0 0 224px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: S.c, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}><span>{S.l}</span><span style={{ background: S.bg, color: S.c, borderRadius: 10, padding: '0 7px' }}>{cards.length}</span></div>
          {cards.map(kanbanCard)}
        </div> })}
    </div>
  }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Truck size={22} /></div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Agendamento de Entregas</h2>
          <div style={{ fontSize: 12.5, opacity: .85 }}>Central operacional: o que chega, quando, quem entrega, quem recebe e o status de cada entrega.</div>
        </div>
        <button className="btn" onClick={() => setMForm({ loja: fLoja || 'Amore Paiva', data_prevista: hoje, status: 'a_confirmar', categorias: [] })} style={{ background: '#fff', color: 'var(--bordo)', padding: '9px 15px' }}><Plus size={16} /> Agendar entrega</button>
        <button className="btn bo" onClick={load} style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff', padding: '9px 12px' }}><RefreshCw size={15} /></button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 14 }}>
        {[['Hoje', kpi.hoje, 'var(--bordo)'], ['A confirmar', kpi.aconfirmar, '#B45309'], ['Confirmadas', kpi.confirmadas, '#1D4ED8'], ['Em conferência', kpi.conferencia, '#7C3AED'], ['Concluídas', kpi.concluidas, '#15803D'], ['Atrasadas', kpi.atrasadas, '#B91C1C'], ['Divergências', kpi.divergencias, '#B91C1C']].map(([l, n, c]: any) => (
          <div key={l} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', borderLeft: `4px solid ${c}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: c }}>{n}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filtros + vista */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {([['hoje', 'Hoje', <Clock size={13} />], ['semana', 'Semana', <CalendarDays size={13} />], ['mes', 'Mês', <CalendarRange size={13} />], ['lista', 'Lista', <List size={13} />], ['kanban', 'Kanban', <LayoutGrid size={13} />]] as const).map(([v, l, ic]) => (
            <button key={v} className="btn" onClick={() => setVista(v)} style={{ padding: '6px 11px', fontSize: 12.5, background: vista === v ? 'var(--bordo)' : 'transparent', color: vista === v ? '#fff' : 'var(--text)', border: 'none' }}>{ic} {l}</button>
          ))}
        </div>
        <div className="sw-wrap" style={{ flex: 1, minWidth: 180, position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="srch" placeholder="Buscar fornecedor, vendedor, pedido…" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="flt" value={fLoja} onChange={e => setFLoja(e.target.value)}><option value="">Todas as unidades</option>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
        <select className="flt" value={fStatus} onChange={e => setFStatus(e.target.value)}><option value="">Todos os status</option>{STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS[s].l}</option>)}</select>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Carregando…</div> :
        vista === 'semana' ? renderSemana() :
        vista === 'mes' ? renderMes() :
        vista === 'kanban' ? renderKanban() :
        filtradas.length === 0 ? <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 }}><Truck size={34} /><div style={{ marginTop: 8 }}>{vista === 'hoje' ? 'Nenhuma entrega prevista para hoje.' : 'Nenhuma entrega encontrada.'}</div><div style={{ fontSize: 12.5, marginTop: 4 }}>Use “Agendar entrega” para programar a partir de um pedido de compra.</div></div> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
            {filtradas.map(e => {
              const st = efetivo(e); const S = STATUS[st] || STATUS.a_confirmar
              const cat = (e.categorias && e.categorias[0]) || e.categoria
              const C = cat ? CATS[cat] : null
              const wa = waConfirm(e)
              return (
                <div key={e.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `4px solid ${C?.c || 'var(--border)'}`, borderRadius: 12, padding: '12px 14px', boxShadow: 'var(--shadow)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div onClick={() => setMDet(e)} style={{ cursor: 'pointer', flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{C ? C.e + ' ' : ''}{e.fornecedor || 'Fornecedor'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{e.vendedor || '—'}{e.pedido_numero || e.pedido_ref ? ` · Pedido ${e.pedido_numero || e.pedido_ref}` : ''}</div>
                    </div>
                    <span className="pill" style={{ background: S.bg, color: S.c, fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>{S.l}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 12, color: 'var(--muted)', margin: '8px 0' }}>
                    <span>🏪 {e.loja}</span>
                    <span>📅 {ddmm(e.data_prevista)}{e.janela ? ` · ${e.janela}` : ''}</span>
                    {e.qtd_itens > 0 && <span>📦 {e.qtd_itens} itens</span>}
                    {e.valor > 0 && <span>💰 {brl(e.valor)}</span>}
                    {e.responsavel && <span>👤 {e.responsavel}</span>}
                    {e.parcial && <span style={{ color: '#C2410C', fontWeight: 600 }}>⚠ parcial</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn" style={{ background: '#25D366', color: '#fff', padding: '6px 10px', fontSize: 12, textDecoration: 'none' }}><MessageCircle size={13} /> WhatsApp</a>}
                    {!e.chegada_em && !FINAIS.includes(e.status) && <button className="btn" onClick={() => setMChegou(e)} style={{ padding: '6px 10px', fontSize: 12, background: '#0891B2', color: '#fff' }}><PackageCheck size={13} /> Chegou</button>}
                    <button className="btn bo" onClick={() => abrirConferencia(e)} style={{ padding: '6px 10px', fontSize: 12 }}><ClipboardCheck size={13} /> Conferência</button>
                  </div>
                </div>
              )
            })}
          </div>}

      {mForm && <FormEntrega e={mForm} pedidos={pedidos} foneFornecedor={foneFornecedor} user={user} onClose={() => setMForm(null)} onSaved={() => { setMForm(null); load() }} toast={toast} />}
      {mDet && <DetalheEntrega e={mDet} wa={waConfirm(mDet)} onClose={() => setMDet(null)} onStatus={mudarStatus} onEdit={() => { setMDet(null); setMForm(mDet) }} onConf={() => { setMDet(null); abrirConferencia(mDet) }} />}
      {mChegou && <ChegouModal e={mChegou} user={user} onClose={() => setMChegou(null)} onSaved={() => { setMChegou(null); load() }} toast={toast} />}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }
function Modal({ title, onClose, children, wide }: any) {
  return <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: wide ? 620 : 460, maxHeight: '92vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><strong style={{ fontSize: 16 }}>{title}</strong><button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button></div>
      {children}
    </div>
  </div>
}

function FormEntrega({ e, pedidos, foneFornecedor, user, onClose, onSaved, toast }: any) {
  const [f, setF] = useState<any>({ categorias: [], parcial: false, ...e })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const aplicarPedido = (ref: string) => {
    const p = pedidos.find((x: any) => x.ref === ref); if (!p) { set('pedido_ref', ''); return }
    setF((cur: any) => ({
      ...cur, pedido_ref: ref, pedido_numero: ref, fornecedor: p.fornecedor || cur.fornecedor,
      loja: canon(p.loja) || cur.loja, qtd_itens: (p.itens || []).length, valor: p.total || 0,
      pagamento: p.pagamento || cur.pagamento, responsavel: p.recebimento_responsavel || cur.responsavel,
      vendedor_fone: cur.vendedor_fone || foneFornecedor(p.fornecedor || ''),
    }))
  }
  const toggleCat = (c: string) => set('categorias', (f.categorias || []).includes(c) ? f.categorias.filter((x: string) => x !== c) : [...(f.categorias || []), c])
  const salvar = async () => {
    if (!f.loja) { toast('Selecione a unidade.', 'error'); return }
    setSaving(true)
    try {
      const rec: any = {
        loja: f.loja, fornecedor: f.fornecedor || null, vendedor: f.vendedor || null, vendedor_fone: soDig(f.vendedor_fone) || null,
        pedido_ref: f.pedido_ref || null, pedido_numero: f.pedido_numero || null, categoria: (f.categorias || [])[0] || null, categorias: f.categorias || [],
        qtd_itens: Number(f.qtd_itens) || 0, valor: Number(f.valor) || 0, pagamento: f.pagamento || null,
        data_prevista: f.data_prevista || null, janela: f.janela || null, responsavel: f.responsavel || null,
        status: f.status || 'a_confirmar', obs: f.obs || null, parcial: !!f.parcial, updated_at: new Date().toISOString(),
      }
      if (e.id) {
        rec.historico = [...(e.historico || []), { em: new Date().toISOString(), por: user?.name || 'Painel', acao: 'edicao' }]
        await sb.from('entregas_agendadas').update(rec).eq('id', e.id)
      } else {
        rec.created_by = user?.name || null
        rec.historico = [{ em: new Date().toISOString(), por: user?.name || 'Painel', acao: 'criacao' }]
        await sb.from('entregas_agendadas').insert(rec)
      }
      toast(e.id ? 'Entrega atualizada!' : 'Entrega agendada! 📦')
      onSaved()
    } catch { toast('Erro ao salvar.', 'error') }
    setSaving(false)
  }
  return <Modal title={e.id ? 'Editar entrega' : '📦 Agendar entrega'} onClose={onClose} wide>
    <label style={lbl}>Pedido de compra (opcional — preenche os dados)</label>
    <select style={inp} value={f.pedido_ref || ''} onChange={ev => aplicarPedido(ev.target.value)}>
      <option value="">— sem pedido / manual —</option>
      {pedidos.map((p: any) => <option key={p.ref} value={p.ref}>{(p.fornecedor || 'Pedido')} · {canon(p.loja)} · {(p.data || (p.em || '').slice(0, 10))} · {(p.itens || []).length} itens</option>)}
    </select>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
      <div><label style={lbl}>Fornecedor</label><input style={inp} value={f.fornecedor || ''} onChange={ev => set('fornecedor', ev.target.value)} /></div>
      <div><label style={lbl}>Unidade de destino</label><select style={inp} value={f.loja || ''} onChange={ev => set('loja', ev.target.value)}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select></div>
      <div><label style={lbl}>Vendedor / representante</label><input style={inp} value={f.vendedor || ''} onChange={ev => set('vendedor', ev.target.value)} /></div>
      <div><label style={lbl}>WhatsApp do vendedor</label><input style={inp} value={f.vendedor_fone || ''} onChange={ev => set('vendedor_fone', ev.target.value)} placeholder="(81) 9..." /></div>
      <div><label style={lbl}>Data prevista</label><input type="date" style={inp} value={f.data_prevista || ''} onChange={ev => set('data_prevista', ev.target.value)} /></div>
      <div><label style={lbl}>Janela / horário</label><input list="janelas" style={inp} value={f.janela || ''} onChange={ev => set('janela', ev.target.value)} placeholder="Manhã / 08:00–10:00" /><datalist id="janelas">{JANELAS.map(j => <option key={j} value={j} />)}</datalist></div>
      <div><label style={lbl}>Responsável (recebimento)</label><input style={inp} value={f.responsavel || ''} onChange={ev => set('responsavel', ev.target.value)} /></div>
      <div><label style={lbl}>Condição de pagamento</label><input style={inp} value={f.pagamento || ''} onChange={ev => set('pagamento', ev.target.value)} /></div>
      <div><label style={lbl}>Qtd. itens</label><input type="number" style={inp} value={f.qtd_itens || ''} onChange={ev => set('qtd_itens', ev.target.value)} /></div>
      <div><label style={lbl}>Valor (R$)</label><input type="number" style={inp} value={f.valor || ''} onChange={ev => set('valor', ev.target.value)} /></div>
    </div>
    <label style={{ ...lbl, marginTop: 10 }}>Categorias dos produtos</label>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {Object.entries(CATS).map(([k, c]) => { const on = (f.categorias || []).includes(k); return <button key={k} onClick={() => toggleCat(k)} className="btn" style={{ padding: '5px 10px', fontSize: 12, background: on ? c.c : 'var(--bg)', color: on ? '#fff' : 'var(--text)', border: `1px solid ${on ? c.c : 'var(--border)'}` }}>{c.e} {c.l}</button> })}
    </div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '12px 0 4px', cursor: 'pointer' }}><input type="checkbox" checked={!!f.parcial} onChange={ev => set('parcial', ev.target.checked)} /> Entrega será parcial</label>
    <label style={lbl}>Observações para o recebimento</label>
    <textarea style={{ ...inp, resize: 'vertical' }} rows={2} value={f.obs || ''} onChange={ev => set('obs', ev.target.value)} />
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
      <button className="btn bo" onClick={onClose}>Cancelar</button>
      <button className="btn bp" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : (e.id ? 'Salvar' : '📅 Agendar')}</button>
    </div>
  </Modal>
}

function DetalheEntrega({ e, wa, onClose, onStatus, onEdit, onConf }: any) {
  const st = e.data_prevista && e.data_prevista < hojeISO() && !FINAIS.includes(e.status) && e.status !== 'cancelada' ? 'atrasada' : e.status
  const S = STATUS[st] || STATUS.a_confirmar
  const row = (l: string, v: any) => v ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}><span style={{ color: 'var(--muted)' }}>{l}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v}</span></div> : null
  return <Modal title={`${e.fornecedor || 'Entrega'} — ${e.loja}`} onClose={onClose} wide>
    <div style={{ marginBottom: 8 }}><span className="pill" style={{ background: S.bg, color: S.c, fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 20 }}>{S.l}</span></div>
    {row('Vendedor', e.vendedor)}
    {row('WhatsApp', e.vendedor_fone)}
    {row('Pedido', e.pedido_numero || e.pedido_ref)}
    {row('Data / janela', `${ddmm(e.data_prevista)}${e.janela ? ' · ' + e.janela : ''}`)}
    {row('Categorias', (e.categorias || []).map((c: string) => CATS[c]?.l || c).join(', '))}
    {row('Itens', e.qtd_itens || null)}
    {row('Valor', e.valor ? brl(e.valor) : null)}
    {row('Pagamento', e.pagamento)}
    {row('Responsável', e.responsavel)}
    {row('Parcial', e.parcial ? 'Sim' : null)}
    {row('Chegada', e.chegada_em ? new Date(e.chegada_em).toLocaleString('pt-BR') : null)}
    {row('Entregador / placa', [e.entregador, e.veiculo_placa].filter(Boolean).join(' · '))}
    {e.obs && <div style={{ marginTop: 8, fontSize: 13, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', borderLeft: '3px solid var(--bordo)' }}>📝 {e.obs}</div>}
    <label style={{ ...lbl, marginTop: 12 }}>Mudar status</label>
    <select style={inp} value={e.status} onChange={ev => onStatus(e, ev.target.value)}>{STATUS_ORDER.filter(s => s !== 'atrasada').map(s => <option key={s} value={s}>{STATUS[s].l}</option>)}</select>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 14 }}>
      {wa && <a href={wa} target="_blank" rel="noreferrer" className="btn" style={{ background: '#25D366', color: '#fff', textDecoration: 'none', padding: '9px 14px' }}><MessageCircle size={14} /> WhatsApp</a>}
      <button className="btn bo" onClick={onEdit} style={{ padding: '9px 14px' }}>Editar</button>
      <button className="btn bp" onClick={onConf} style={{ padding: '9px 14px' }}><ClipboardCheck size={14} /> Iniciar conferência</button>
    </div>
  </Modal>
}

function ChegouModal({ e, user, onClose, onSaved, toast }: any) {
  const [f, setF] = useState({ entregador: '', veiculo_placa: '', recebido_por: user?.name || '' })
  const [saving, setSaving] = useState(false)
  const salvar = async () => {
    setSaving(true)
    try {
      await sb.from('entregas_agendadas').update({
        status: 'em_conferencia', chegada_em: new Date().toISOString(),
        entregador: f.entregador || null, veiculo_placa: f.veiculo_placa || null, recebido_por: f.recebido_por || null,
        updated_at: new Date().toISOString(),
        historico: [...(e.historico || []), { em: new Date().toISOString(), por: user?.name || 'Painel', acao: 'chegada', entregador: f.entregador || null }],
      }).eq('id', e.id)
      toast('Chegada registrada — em conferência. 🚚')
      onSaved()
    } catch { toast('Erro ao registrar.', 'error') }
    setSaving(false)
  }
  return <Modal title="🚚 Fornecedor chegou" onClose={onClose}>
    <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{e.fornecedor} · Pedido {e.pedido_numero || e.pedido_ref || '—'} · {e.loja}</div>
    <label style={lbl}>Entregador</label><input style={inp} value={f.entregador} onChange={ev => setF(p => ({ ...p, entregador: ev.target.value }))} placeholder="nome de quem entregou" />
    <label style={{ ...lbl, marginTop: 10 }}>Placa do veículo (opcional)</label><input style={inp} value={f.veiculo_placa} onChange={ev => setF(p => ({ ...p, veiculo_placa: ev.target.value }))} placeholder="ABC-1D23" />
    <label style={{ ...lbl, marginTop: 10 }}>Quem recebeu</label><input style={inp} value={f.recebido_por} onChange={ev => setF(p => ({ ...p, recebido_por: ev.target.value }))} />
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
      <button className="btn bo" onClick={onClose}>Cancelar</button>
      <button className="btn bp" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : '✅ Registrar chegada'}</button>
    </div>
  </Modal>
}
