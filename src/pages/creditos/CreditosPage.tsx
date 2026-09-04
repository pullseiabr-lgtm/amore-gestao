import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loader, Plus, RefreshCw, Wallet, FileCheck2, Send, Check, X, ChevronLeft, Paperclip, Trash2, ExternalLink, AlertTriangle } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { enviarWhatsApp } from '../../lib/notify'
import { fetchProfiles, uploadAnexo } from '../../lib/db'

// Tabelas do módulo ainda não estão no types/database.ts → usar cliente destipado (como db.ts)
const sb = supabase as any

// ── Tipos locais ─────────────────────────────────────────────
interface Credito {
  id: string
  numero: number
  solicitante_nome: string
  solicitante_id: string | null
  setor: string | null
  unidade: string
  data_solicitacao: string
  data_necessaria: string | null
  finalidade: string
  subcategoria: string | null
  prioridade: string
  valor_solicitado: number
  valor_estimado: number | null
  valor_aprovado: number | null
  forma_recebimento: string | null
  centro_custo: string | null
  estimativa_base: any
  observacao: string | null
  anexo_url: string | null
  status: string
  prazo_utilizacao: string | null
  aprovado_por: string | null
  aprovado_em: string | null
  reprovado_motivo: string | null
  total_gasto: number
  saldo: number | null
  destino_saldo: string | null
  prestacao: any
  created_by: string | null
  created_at: string
}
interface Despesa {
  id: string
  credito_id: string
  descricao: string
  categoria: string | null
  fornecedor: string | null
  valor: number
  data: string
  forma_pagamento: string | null
  comprovante_url: string | null
  centro_custo: string | null
  created_at: string
}

// ── Constantes ───────────────────────────────────────────────
const LOJAS = ['Amore CD', 'Amore Paiva', 'Flow CD']
const FORMAS = ['Pix', 'Dinheiro', 'Transferência', 'Cartão']
const PRIORIDADES = [
  { id: 'baixa', label: 'Baixa', cor: '#6B7280' },
  { id: 'media', label: 'Média', cor: '#2563EB' },
  { id: 'alta', label: 'Alta', cor: '#EA580C' },
  { id: 'urgente', label: 'Urgente', cor: '#DC2626' },
]
const FINALIDADES = [
  { id: 'compras_semana', label: '🛒 Compras da semana', subs: [] as string[] },
  { id: 'logistica', label: '🚚 Logística', subs: ['Combustível', 'Pedágio', 'Estacionamento', 'Frete', 'Transporte'] },
  { id: 'servico', label: '🔧 Prestação de serviço', subs: ['Manutenção', 'Elétrica', 'Hidráulica', 'Equipamentos', 'Serviços terceirizados'] },
  { id: 'outras', label: '🧾 Outras despesas', subs: ['Material de escritório', 'Material de limpeza', 'Pequenas compras', 'Taxas', 'Urgências'] },
  { id: 'reembolso', label: '🔄 Reembolso', subs: [] },
]
const CAT_DESPESA = ['Compra', 'Logística', 'Serviço', 'Outras']

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  rascunho:             { label: '🟡 Rascunho',              cor: '#92400E', bg: '#FEF3C7' },
  solicitado:           { label: '🔵 Solicitado',            cor: '#1E40AF', bg: '#DBEAFE' },
  em_aprovacao:         { label: '🟠 Em aprovação',          cor: '#9A3412', bg: '#FFEDD5' },
  aprovado:             { label: '🟢 Aprovado',              cor: '#166534', bg: '#DCFCE7' },
  disponibilizado:      { label: '💰 Crédito disponibilizado', cor: '#166534', bg: '#D1FAE5' },
  em_prestacao:         { label: '🧾 Em prestação de contas', cor: '#3730A3', bg: '#E0E7FF' },
  prestacao_pendente:   { label: '🔴 Prestação pendente',    cor: '#991B1B', bg: '#FEE2E2' },
  divergencia:          { label: '⚠️ Divergência',           cor: '#9A3412', bg: '#FFEDD5' },
  aguardando_devolucao: { label: '🔄 Aguardando devolução',  cor: '#5B21B6', bg: '#EDE9FE' },
  remanescente:         { label: '🔵 Crédito remanescente',  cor: '#1E40AF', bg: '#DBEAFE' },
  encerrado:            { label: '✅ Encerrado',             cor: '#065F46', bg: '#D1FAE5' },
  reprovado:            { label: '❌ Reprovado',             cor: '#991B1B', bg: '#FEE2E2' },
}
const st = (s: string) => STATUS[s] || { label: s, cor: '#374151', bg: '#F3F4F6' }
const finLabel = (id: string) => FINALIDADES.find(f => f.id === id)?.label || id

const fmtR$ = (v: number | null | undefined) => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtData = (d: string | null) => { if (!d) return '—'; const [y, m, dd] = d.split('T')[0].split('-'); return `${dd}/${m}/${y}` }
const hoje = () => new Date().toISOString().slice(0, 10)

// ── Página ───────────────────────────────────────────────────
export default function CreditosPage() {
  const { loja } = useLoja()
  const { user, can } = useAuth()
  const podeAprovar = can('financeiro', 'create') || user?.role === 'admin' || user?.role === 'super_admin'

  const [tab, setTab] = useState<'solicitacoes' | 'prestacao'>('solicitacoes')
  const [creditos, setCreditos] = useState<Credito[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [fUnidade, setFUnidade] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [prestacaoId, setPrestacaoId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('creditos').select('*').order('created_at', { ascending: false })
    setCreditos((data as Credito[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load(); fetchProfiles().then(setProfiles).catch(() => {}) }, [load])

  const filtrados = useMemo(() => creditos.filter(c => {
    if (fUnidade && c.unidade !== fUnidade) return false
    if (fStatus && c.status !== fStatus) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!(`${c.numero} ${c.solicitante_nome} ${finLabel(c.finalidade)} ${c.setor || ''} ${c.subcategoria || ''}`.toLowerCase().includes(q))) return false
    }
    return true
  }), [creditos, fUnidade, fStatus, busca])

  // KPIs
  const kpi = useMemo(() => {
    const solicitado = creditos.reduce((s, c) => s + (c.valor_solicitado || 0), 0)
    const aprovado = creditos.filter(c => c.valor_aprovado != null).reduce((s, c) => s + (c.valor_aprovado || 0), 0)
    const emAberto = creditos.filter(c => ['aprovado', 'disponibilizado', 'em_prestacao', 'prestacao_pendente', 'divergencia'].includes(c.status)).reduce((s, c) => s + (c.valor_aprovado || 0), 0)
    const gasto = creditos.reduce((s, c) => s + (c.total_gasto || 0), 0)
    const pendentes = creditos.filter(c => ['disponibilizado', 'em_prestacao', 'prestacao_pendente', 'divergencia'].includes(c.status)).length
    const divergencias = creditos.filter(c => c.status === 'divergencia').length
    return { solicitado, aprovado, emAberto, gasto, pendentes, divergencias }
  }, [creditos])

  return (
    <div>
      {/* Cabeçalho + abas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={`btn ${tab === 'solicitacoes' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('solicitacoes')}><Wallet size={13} /> Solicitações</button>
          <button className={`btn ${tab === 'prestacao' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('prestacao')}><FileCheck2 size={13} /> Prestação de Contas</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn bo bsm" onClick={load} title="Atualizar"><RefreshCw size={13} /></button>
          {tab === 'solicitacoes' && <button className="btn bp bsm" onClick={() => setNovoOpen(true)}><Plus size={13} /> Solicitar Crédito</button>}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi titulo="💰 Solicitados" valor={fmtR$(kpi.solicitado)} />
        <Kpi titulo="✅ Aprovados" valor={fmtR$(kpi.aprovado)} />
        <Kpi titulo="💳 Em aberto" valor={fmtR$(kpi.emAberto)} />
        <Kpi titulo="🧾 Despesas" valor={fmtR$(kpi.gasto)} />
        <Kpi titulo="⏳ Prestações pendentes" valor={String(kpi.pendentes)} />
        <Kpi titulo="⚠️ Divergências" valor={String(kpi.divergencias)} destaque={kpi.divergencias > 0} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spin" /></div>
      ) : tab === 'solicitacoes' ? (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <select className="sel" value={fUnidade} onChange={e => setFUnidade(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="">Todas as unidades</option>
              {LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select className="sel" value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="">Todos os status</option>
              {Object.keys(STATUS).map(s => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <input className="inp" placeholder="Buscar nº, solicitante, finalidade…" value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          </div>

          {filtrados.length === 0 ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Nenhuma solicitação de crédito ainda.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
              {filtrados.map(c => (
                <CreditoCard key={c.id} c={c} podeAprovar={podeAprovar} user={user}
                  onChange={load} onPrestar={() => { setPrestacaoId(c.id); setTab('prestacao') }} />
              ))}
            </div>
          )}
        </>
      ) : (
        <PrestacaoContas creditos={creditos} selId={prestacaoId} setSelId={setPrestacaoId} onChange={load} user={user} />
      )}

      {novoOpen && <NovoCredito onClose={() => setNovoOpen(false)} onSaved={load} lojaAtual={loja} profiles={profiles} user={user} />}
    </div>
  )
}

function Kpi({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="card" style={{ padding: '12px 14px', borderLeft: `3px solid ${destaque ? '#DC2626' : 'var(--bordo)'}` }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{titulo}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: destaque ? '#DC2626' : 'var(--bordo)' }}>{valor}</div>
    </div>
  )
}

// ── Card de crédito ──────────────────────────────────────────
function CreditoCard({ c, podeAprovar, user, onChange, onPrestar }: {
  c: Credito; podeAprovar: boolean; user: any; onChange: () => void; onPrestar: () => void
}) {
  const [busy, setBusy] = useState(false)
  const s = st(c.status)
  const prio = PRIORIDADES.find(p => p.id === c.prioridade)
  const linkPublico = `${location.origin}/credito.html?id=${c.id}`

  const atualizar = async (patch: Partial<Credito>) => {
    setBusy(true)
    await sb.from('creditos').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', c.id)
    setBusy(false); onChange()
  }

  const enviarAprovacao = async () => {
    if (!confirm('Enviar esta solicitação para aprovação (aviso por WhatsApp ao aprovador)?')) return
    setBusy(true)
    await sb.from('creditos').update({ status: 'em_aprovacao', updated_at: new Date().toISOString() }).eq('id', c.id)
    // Avisa aprovadores (app_config credito_aprovadores; fallback Wagner + Esdras)
    let lista: { nome: string; fone: string }[] = [{ nome: 'Wagner', fone: '5581994135602' }, { nome: 'Esdras', fone: '5581982710008' }]
    try {
      const { data } = await sb.from('app_config').select('valor').eq('chave', 'credito_aprovadores').maybeSingle()
      if (data?.valor?.lista?.length) lista = data.valor.lista
    } catch { /* usa fallback */ }
    const msg = `💳 *Nova solicitação de crédito — ${c.unidade}*\n\nCRD-${c.numero} · ${c.solicitante_nome}\nFinalidade: ${finLabel(c.finalidade)}${c.subcategoria ? ' · ' + c.subcategoria : ''}\nValor solicitado: *${fmtR$(c.valor_solicitado)}*\nPrioridade: ${prio?.label || c.prioridade}\n\nAprovar no link:\n${linkPublico}`
    for (const a of lista) {
      await enviarWhatsApp(a.fone, msg, undefined, { tipo: 'compra', modulo: 'creditos', titulo: `Crédito CRD-${c.numero}`, setor: c.setor || undefined })
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000))
    }
    setBusy(false); onChange()
    alert('Enviado para aprovação ✅')
  }

  const aprovar = async () => {
    const v = prompt('Valor a aprovar (R$):', String(c.valor_solicitado))
    if (v == null) return
    const valor = Number(v.replace(',', '.'))
    if (!(valor > 0)) { alert('Valor inválido.'); return }
    await atualizar({ status: 'aprovado', valor_aprovado: valor, aprovado_por: user?.name || 'Painel', aprovado_em: new Date().toISOString() })
  }
  const reprovar = async () => {
    const motivo = prompt('Motivo da reprovação:')
    if (!motivo) return
    await atualizar({ status: 'reprovado', reprovado_motivo: motivo })
  }
  const disponibilizar = async () => {
    if (!confirm(`Confirmar disponibilização de ${fmtR$(c.valor_aprovado)} para ${c.solicitante_nome}?`)) return
    setBusy(true)
    await sb.from('creditos').update({ status: 'disponibilizado', updated_at: new Date().toISOString() }).eq('id', c.id)
    await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'liberacao', valor: c.valor_aprovado, data: hoje(), obs: 'Crédito disponibilizado', created_by: user?.name || 'Painel' })
    setBusy(false); onChange()
  }
  const excluir = async () => {
    if (!confirm(`Excluir a solicitação CRD-${c.numero}? Esta ação não pode ser desfeita.`)) return
    await sb.from('creditos').delete().eq('id', c.id); onChange()
  }

  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800, color: 'var(--bordo)' }}>CRD-{c.numero}</span>
        <span className="badge" style={{ background: s.bg, color: s.cor, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
        {prio && <span style={{ marginLeft: 'auto', fontSize: 10, color: prio.cor, fontWeight: 700 }}>● {prio.label}</span>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.solicitante_nome} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {c.unidade}{c.setor ? ' · ' + c.setor : ''}</span></div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{finLabel(c.finalidade)}{c.subcategoria ? ' · ' + c.subcategoria : ''}</div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap' }}>
        <span>Solicitado: <b>{fmtR$(c.valor_solicitado)}</b></span>
        {c.valor_aprovado != null && <span style={{ color: '#166534' }}>Aprovado: <b>{fmtR$(c.valor_aprovado)}</b></span>}
        {c.total_gasto > 0 && <span>Gasto: <b>{fmtR$(c.total_gasto)}</b></span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Solicitado em {fmtData(c.data_solicitacao)}{c.data_necessaria ? ` · precisa em ${fmtData(c.data_necessaria)}` : ''}</div>
      {c.reprovado_motivo && <div style={{ fontSize: 11, color: '#991B1B', background: '#FEE2E2', padding: '4px 8px', borderRadius: 6 }}>❌ {c.reprovado_motivo}</div>}

      {/* Ações por status */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {busy && <Loader className="spin" size={14} />}
        {(c.status === 'rascunho' || c.status === 'solicitado') && !busy && (
          <button className="btn bp bsm" onClick={enviarAprovacao}><Send size={12} /> Enviar p/ aprovação</button>
        )}
        {(c.status === 'em_aprovacao' || c.status === 'solicitado') && podeAprovar && !busy && (
          <>
            <button className="btn bp bsm" onClick={aprovar}><Check size={12} /> Aprovar</button>
            <button className="btn bo bsm" onClick={reprovar}><X size={12} /> Reprovar</button>
          </>
        )}
        {c.status === 'aprovado' && !busy && (
          <>
            <button className="btn bp bsm" onClick={onPrestar}><FileCheck2 size={12} /> Prestar contas</button>
            <button className="btn bo bsm" onClick={disponibilizar}><Wallet size={12} /> Só disponibilizar</button>
          </>
        )}
        {['disponibilizado', 'em_prestacao', 'prestacao_pendente', 'divergencia', 'aguardando_devolucao'].includes(c.status) && !busy && (
          <button className="btn bp bsm" onClick={onPrestar}><FileCheck2 size={12} /> Prestar contas</button>
        )}
        <a href={linkPublico} target="_blank" rel="noreferrer" className="btn bo bsm" style={{ textDecoration: 'none' }}><ExternalLink size={12} /> Ver</a>
        {(user?.role === 'admin' || user?.role === 'super_admin') && !busy && c.total_gasto === 0 && (
          <button className="btn bo bsm" onClick={excluir} title="Excluir" style={{ color: '#991B1B' }}><Trash2 size={12} /></button>
        )}
      </div>
    </div>
  )
}

// ── Modal: nova solicitação ──────────────────────────────────
function NovoCredito({ onClose, onSaved, lojaAtual, profiles, user }: {
  onClose: () => void; onSaved: () => void; lojaAtual: string; profiles: any[]; user: any
}) {
  const [f, setF] = useState({
    solicitante_nome: user?.name || '', setor: '', unidade: LOJAS.includes(lojaAtual) ? lojaAtual : 'Amore CD',
    data_solicitacao: hoje(), data_necessaria: '', finalidade: 'compras_semana', subcategoria: '',
    prioridade: 'media', valor_solicitado: '', forma_recebimento: 'Pix', observacao: '',
  })
  const [anexo, setAnexo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const fin = FINALIDADES.find(x => x.id === f.finalidade)
  const set = (k: string, v: string) => setF(o => ({ ...o, [k]: v }))

  const salvar = async () => {
    if (!f.solicitante_nome.trim()) { alert('Informe o solicitante.'); return }
    const valor = Number(String(f.valor_solicitado).replace(',', '.'))
    if (!(valor > 0)) { alert('Informe um valor solicitado válido.'); return }
    setSalvando(true)
    try {
      let anexo_url: string | null = null
      if (anexo) anexo_url = await uploadAnexo(anexo, 'creditos')
      const solId = profiles.find(p => p.name === f.solicitante_nome)?.id || null
      const centro_custo = [f.unidade, f.setor, fin?.label.replace(/^[^ ]+ /, ''), f.subcategoria].filter(Boolean).join(' > ')
      await sb.from('creditos').insert({
        solicitante_nome: f.solicitante_nome.trim(), solicitante_id: solId, setor: f.setor || null, unidade: f.unidade,
        data_solicitacao: f.data_solicitacao, data_necessaria: f.data_necessaria || null,
        finalidade: f.finalidade, subcategoria: f.subcategoria || null, prioridade: f.prioridade,
        valor_solicitado: valor, forma_recebimento: f.forma_recebimento, centro_custo,
        observacao: f.observacao || null, anexo_url, status: 'solicitado', created_by: user?.name || 'Painel',
      })
      onSaved(); onClose()
    } catch (e: any) { alert('Falha ao salvar: ' + (e?.message || e)) }
    setSalvando(false)
  }

  return (
    <div className="ov open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="mhd"><b>💳 Solicitar Crédito</b><button className="btn bo bsm" onClick={onClose}><X size={13} /></button></div>
        <div className="mbd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg"><label className="fl">Solicitante *</label>
            <input className="inp" list="prof-list" value={f.solicitante_nome} onChange={e => set('solicitante_nome', e.target.value)} placeholder="Nome" />
            <datalist id="prof-list">{profiles.map(p => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <div className="fg"><label className="fl">Setor</label><input className="inp" value={f.setor} onChange={e => set('setor', e.target.value)} placeholder="Cozinha, Logística…" /></div>
          <div className="fg"><label className="fl">Unidade *</label>
            <select className="sel" value={f.unidade} onChange={e => set('unidade', e.target.value)}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          </div>
          <div className="fg"><label className="fl">Prioridade</label>
            <select className="sel" value={f.prioridade} onChange={e => set('prioridade', e.target.value)}>{PRIORIDADES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
          </div>
          <div className="fg"><label className="fl">Finalidade *</label>
            <select className="sel" value={f.finalidade} onChange={e => { set('finalidade', e.target.value); set('subcategoria', '') }}>{FINALIDADES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          </div>
          <div className="fg"><label className="fl">Subcategoria</label>
            {fin && fin.subs.length > 0
              ? <select className="sel" value={f.subcategoria} onChange={e => set('subcategoria', e.target.value)}><option value="">—</option>{fin.subs.map(s => <option key={s}>{s}</option>)}</select>
              : <input className="inp" value={f.subcategoria} onChange={e => set('subcategoria', e.target.value)} placeholder="Opcional" />}
          </div>
          <div className="fg"><label className="fl">Data da solicitação</label><input type="date" className="inp" value={f.data_solicitacao} onChange={e => set('data_solicitacao', e.target.value)} /></div>
          <div className="fg"><label className="fl">Data necessária</label><input type="date" className="inp" value={f.data_necessaria} onChange={e => set('data_necessaria', e.target.value)} /></div>
          <div className="fg"><label className="fl">Valor solicitado (R$) *</label><input className="inp" inputMode="decimal" value={f.valor_solicitado} onChange={e => set('valor_solicitado', e.target.value)} placeholder="0,00" /></div>
          <div className="fg"><label className="fl">Forma de recebimento</label>
            <select className="sel" value={f.forma_recebimento} onChange={e => set('forma_recebimento', e.target.value)}>{FORMAS.map(x => <option key={x}>{x}</option>)}</select>
          </div>
          <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl">Observação</label><textarea className="inp" rows={2} value={f.observacao} onChange={e => set('observacao', e.target.value)} /></div>
          <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl">Anexo / comprovante prévio</label>
            <label className="btn bo bsm" style={{ cursor: 'pointer', margin: 0, width: 'fit-content' }}>
              <Paperclip size={12} /> {anexo ? anexo.name : 'Anexar arquivo'}
              <input type="file" hidden onChange={e => setAnexo(e.target.files?.[0] || null)} />
            </label>
          </div>
          {f.finalidade === 'compras_semana' && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--bg2,#F8FAFC)', padding: '8px 10px', borderRadius: 6 }}>
              💡 Estimativa automática por custo médio e histórico entra na <b>Fase 2</b>. Por ora, informe o valor manualmente.
            </div>
          )}
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
          <button className="btn bp bsm" onClick={salvar} disabled={salvando}>{salvando ? <Loader className="spin" size={13} /> : <Check size={13} />} Solicitar</button>
        </div>
      </div>
    </div>
  )
}

// ── Prestação de contas ──────────────────────────────────────
function PrestacaoContas({ creditos, selId, setSelId, onChange, user }: {
  creditos: Credito[]; selId: string | null; setSelId: (id: string | null) => void; onChange: () => void; user: any
}) {
  const elegiveis = creditos.filter(c => ['aprovado', 'disponibilizado', 'em_prestacao', 'prestacao_pendente', 'divergencia', 'aguardando_devolucao'].includes(c.status))
  const c = creditos.find(x => x.id === selId) || null

  if (!c) {
    return (
      <div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 13, marginBottom: 10, color: 'var(--muted)' }}>Selecione um crédito disponibilizado para prestar contas:</div>
          {elegiveis.length === 0 ? <div style={{ color: 'var(--muted)' }}>Nenhum crédito aguardando prestação.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 10 }}>
              {elegiveis.map(e => (
                <button key={e.id} className="card" onClick={() => setSelId(e.id)} style={{ padding: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 800, color: 'var(--bordo)' }}>CRD-{e.numero}</div>
                  <div style={{ fontSize: 12 }}>{e.solicitante_nome} · {e.unidade}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{finLabel(e.finalidade)}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Crédito: <b>{fmtR$(e.valor_aprovado)}</b> · Gasto: <b>{fmtR$(e.total_gasto)}</b></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }
  return <PrestacaoDetalhe c={c} onVoltar={() => setSelId(null)} onChange={onChange} user={user} />
}

function PrestacaoDetalhe({ c, onVoltar, onChange, user }: { c: Credito; onVoltar: () => void; onChange: () => void; user: any }) {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [loading, setLoading] = useState(true)
  const [nd, setNd] = useState({ descricao: '', categoria: 'Compra', fornecedor: '', valor: '', data: hoje(), forma_pagamento: '' })
  const [comprovante, setComprovante] = useState<File | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [destino, setDestino] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('credito_despesas').select('*').eq('credito_id', c.id).order('data')
    setDespesas((data as Despesa[]) || [])
    setLoading(false)
  }, [c.id])
  useEffect(() => { load() }, [load])

  // Disponibiliza automaticamente ao abrir a prestação de um crédito aprovado
  // (mantém o registro de liberação no caixa, sem exigir o clique manual).
  const dispRef = useRef(false)
  useEffect(() => {
    if (c.status === 'aprovado' && !dispRef.current) {
      dispRef.current = true
      ;(async () => {
        await sb.from('creditos').update({ status: 'disponibilizado', updated_at: new Date().toISOString() }).eq('id', c.id)
        await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'liberacao', valor: c.valor_aprovado, data: hoje(), obs: 'Crédito disponibilizado (automático ao prestar contas)', created_by: user?.name || 'Painel' })
        onChange()
      })()
    }
  }, [c.status, c.id, c.valor_aprovado, user, onChange])

  const totalGasto = despesas.reduce((s, d) => s + (d.valor || 0), 0)
  const credito = c.valor_aprovado || 0
  const saldo = credito - totalGasto

  const addDespesa = async () => {
    const valor = Number(String(nd.valor).replace(',', '.'))
    if (!nd.descricao.trim() || !(valor > 0)) { alert('Informe descrição e valor da despesa.'); return }
    setAddBusy(true)
    try {
      let comprovante_url: string | null = null
      if (comprovante) comprovante_url = await uploadAnexo(comprovante, 'creditos')
      await sb.from('credito_despesas').insert({
        credito_id: c.id, descricao: nd.descricao.trim(), categoria: nd.categoria, fornecedor: nd.fornecedor || null,
        valor, data: nd.data, forma_pagamento: nd.forma_pagamento || null, comprovante_url, centro_custo: c.centro_custo, created_by: user?.name || 'Painel',
      })
      // Atualiza total e marca em prestação
      const novoTotal = totalGasto + valor
      await sb.from('creditos').update({ total_gasto: novoTotal, saldo: credito - novoTotal, status: 'em_prestacao', updated_at: new Date().toISOString() }).eq('id', c.id)
      await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'despesa', valor, data: nd.data, obs: nd.descricao.trim(), created_by: user?.name || 'Painel' })
      setNd({ descricao: '', categoria: 'Compra', fornecedor: '', valor: '', data: hoje(), forma_pagamento: '' }); setComprovante(null)
      await load(); onChange()
    } catch (e: any) { alert('Falha: ' + (e?.message || e)) }
    setAddBusy(false)
  }

  const excluirDespesa = async (d: Despesa) => {
    if (!confirm('Excluir esta despesa?')) return
    await sb.from('credito_despesas').delete().eq('id', d.id)
    const novoTotal = totalGasto - d.valor
    await sb.from('creditos').update({ total_gasto: novoTotal, saldo: credito - novoTotal, updated_at: new Date().toISOString() }).eq('id', c.id)
    await load(); onChange()
  }

  // Opções de destino conforme saldo
  const opcoesDestino = saldo > 0.001
    ? [{ id: 'devolucao', label: '💵 Devolução ao caixa' }, { id: 'remanescente', label: '🔄 Crédito remanescente' }]
    : saldo < -0.001
      ? [{ id: 'complemento', label: '➕ Complemento' }, { id: 'reembolso', label: '🔴 Reembolso ao colaborador' }]
      : [{ id: 'zerado', label: '🟢 Crédito totalmente utilizado' }]

  const encerrar = async () => {
    const dst = saldo === 0 ? 'zerado' : destino
    if (!dst) { alert('Escolha o destino do saldo.'); return }
    // Conciliação: crédito = despesas + (devolução|remanescente) ; ou complemento/reembolso cobre o excesso
    const absSaldo = Math.abs(saldo)
    // Trava: divergência exige justificativa (aqui a divergência só existiria se houver diferença não explicada;
    // como o destino cobre todo o saldo, exigimos justificativa apenas quando o usuário declara valor divergente)
    let novoStatus = 'encerrado'
    let prestacao: any = {
      total_gasto: totalGasto, saldo, destino: dst,
      conciliado_em: new Date().toISOString(), conciliado_por: user?.name || 'Painel',
      justificativa: justificativa || null,
    }
    if (dst === 'devolucao') {
      prestacao.devolucao = absSaldo
      novoStatus = 'aguardando_devolucao'
      await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'devolucao', valor: absSaldo, data: hoje(), obs: 'Devolução de saldo ao caixa', created_by: user?.name || 'Painel' })
    } else if (dst === 'remanescente') {
      prestacao.remanescente = absSaldo
      novoStatus = 'remanescente'
    } else if (dst === 'complemento') {
      if (!justificativa.trim()) { alert('Gasto acima do crédito: descreva a justificativa do complemento.'); return }
      prestacao.complemento = absSaldo
      await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'complemento', valor: absSaldo, data: hoje(), obs: justificativa, created_by: user?.name || 'Painel' })
    } else if (dst === 'reembolso') {
      if (!justificativa.trim()) { alert('Reembolso: descreva a justificativa.'); return }
      prestacao.reembolso = absSaldo
      await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'reembolso', valor: absSaldo, data: hoje(), obs: justificativa, created_by: user?.name || 'Painel' })
    }
    await sb.from('creditos').update({ status: novoStatus, destino_saldo: dst, saldo, total_gasto: totalGasto, prestacao, updated_at: new Date().toISOString() }).eq('id', c.id)
    onChange(); onVoltar()
    alert('Prestação de contas registrada ✅')
  }

  const confirmarDevolucao = async () => {
    await sb.from('creditos').update({ status: 'encerrado', updated_at: new Date().toISOString() }).eq('id', c.id)
    onChange(); onVoltar()
  }

  return (
    <div>
      <button className="btn bo bsm" onClick={onVoltar} style={{ marginBottom: 12 }}><ChevronLeft size={12} /> Voltar</button>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: 'var(--bordo)', fontSize: 16 }}>CRD-{c.numero}</span>
          <span className="badge" style={{ background: st(c.status).bg, color: st(c.status).cor, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{st(c.status).label}</span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.solicitante_nome} · {c.unidade} · {finLabel(c.finalidade)}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginTop: 12 }}>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Crédito original</div><div style={{ fontSize: 18, fontWeight: 800 }}>{fmtR$(credito)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Despesas</div><div style={{ fontSize: 18, fontWeight: 800, color: '#B45309' }}>{fmtR$(totalGasto)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Saldo</div><div style={{ fontSize: 18, fontWeight: 800, color: saldo < 0 ? '#DC2626' : '#166534' }}>{fmtR$(saldo)}</div></div>
        </div>
      </div>

      {/* Lista de despesas */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🧾 Despesas realizadas</div>
        {loading ? <Loader className="spin" /> : despesas.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma despesa lançada.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: 6 }}>Data</th><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th style={{ textAlign: 'right' }}>Valor</th><th></th><th></th>
              </tr></thead>
              <tbody>{despesas.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{fmtData(d.data)}</td><td>{d.descricao}</td><td>{d.categoria}</td><td>{d.fornecedor || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtR$(d.valor)}</td>
                  <td>{d.comprovante_url ? <a href={d.comprovante_url} target="_blank" rel="noreferrer">📎</a> : ''}</td>
                  <td><button className="btn bo bsm" style={{ color: '#991B1B', padding: '2px 6px' }} onClick={() => excluirDespesa(d)}><Trash2 size={11} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* Adicionar despesa */}
        {c.status !== 'encerrado' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 12, alignItems: 'end', borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
            <div className="fg"><label className="fl">Descrição</label><input className="inp" value={nd.descricao} onChange={e => setNd(o => ({ ...o, descricao: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Categoria</label><select className="sel" value={nd.categoria} onChange={e => setNd(o => ({ ...o, categoria: e.target.value }))}>{CAT_DESPESA.map(x => <option key={x}>{x}</option>)}</select></div>
            <div className="fg"><label className="fl">Fornecedor</label><input className="inp" value={nd.fornecedor} onChange={e => setNd(o => ({ ...o, fornecedor: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Valor (R$)</label><input className="inp" inputMode="decimal" value={nd.valor} onChange={e => setNd(o => ({ ...o, valor: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Data</label><input type="date" className="inp" value={nd.data} onChange={e => setNd(o => ({ ...o, data: e.target.value }))} /></div>
            <div className="fg"><label className="fl">Comprovante</label>
              <label className="btn bo bsm" style={{ cursor: 'pointer', margin: 0 }}><Paperclip size={11} /> {comprovante ? '1 arq.' : 'Foto/NF'}<input type="file" accept="image/*,application/pdf" hidden onChange={e => setComprovante(e.target.files?.[0] || null)} /></label>
            </div>
            <button className="btn bp bsm" onClick={addDespesa} disabled={addBusy}>{addBusy ? <Loader className="spin" size={12} /> : <Plus size={12} />} Lançar</button>
          </div>
        )}
      </div>

      {/* Conciliação / encerramento */}
      {c.status === 'aguardando_devolucao' ? (
        <div className="card" style={{ padding: 16, background: '#EDE9FE' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>🔄 Aguardando devolução de {fmtR$(Math.abs(saldo))}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Confirme quando o valor for devolvido ao caixa.</div>
          <button className="btn bp bsm" onClick={confirmarDevolucao}><Check size={12} /> Confirmar devolução e encerrar</button>
        </div>
      ) : c.status !== 'encerrado' && c.status !== 'remanescente' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>✅ Conciliação e encerramento</div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            {saldo > 0.001 && <span>Sobrou <b style={{ color: '#166534' }}>{fmtR$(saldo)}</b>. O que fazer com o saldo?</span>}
            {saldo < -0.001 && <span style={{ color: '#DC2626' }}><AlertTriangle size={14} style={{ verticalAlign: -2 }} /> Despesa superior ao crédito em <b>{fmtR$(Math.abs(saldo))}</b>.</span>}
            {Math.abs(saldo) <= 0.001 && <span>🟢 Crédito totalmente utilizado, sem saldo.</span>}
          </div>
          {Math.abs(saldo) > 0.001 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {opcoesDestino.map(o => (
                <button key={o.id} className={`btn ${destino === o.id ? 'bp' : 'bo'} bsm`} onClick={() => setDestino(o.id)}>{o.label}</button>
              ))}
            </div>
          )}
          {(destino === 'complemento' || destino === 'reembolso' || (saldo < -0.001)) && (
            <div className="fg" style={{ marginBottom: 10 }}><label className="fl">Justificativa (obrigatória)</label><textarea className="inp" rows={2} value={justificativa} onChange={e => setJustificativa(e.target.value)} /></div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Conciliação: Crédito {fmtR$(credito)} = Despesas {fmtR$(totalGasto)} {saldo >= 0 ? '+' : '−'} {fmtR$(Math.abs(saldo))} ({saldo >= 0 ? 'saldo' : 'excedente'}).</div>
          <button className="btn bp bsm" onClick={encerrar}><FileCheck2 size={13} /> Registrar prestação de contas</button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>⚠️ Nenhum crédito é encerrado sem prestação de contas conciliada.</div>
        </div>
      )}
      {c.status === 'remanescente' && (
        <div className="card" style={{ padding: 16, background: '#DBEAFE' }}>🔵 Crédito remanescente de {fmtR$(Math.abs(saldo))} vinculado a {c.solicitante_nome}. Poderá ser usado na próxima compra autorizada.</div>
      )}
    </div>
  )
}
