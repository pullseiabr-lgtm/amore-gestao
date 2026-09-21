import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loader, Plus, RefreshCw, Wallet, FileCheck2, Send, Check, X, ChevronLeft, Paperclip, Trash2, ExternalLink, AlertTriangle, BarChart3 } from 'lucide-react'
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
  em_analise:           { label: '🕓 Em análise (aprovação)', cor: '#9A3412', bg: '#FFEDD5' },
  prestacao_pendente:   { label: '🔴 Prestação pendente',    cor: '#991B1B', bg: '#FEE2E2' },
  divergencia:          { label: '⚠️ Divergência',           cor: '#9A3412', bg: '#FFEDD5' },
  aguardando_devolucao: { label: '🔄 Aguardando devolução',  cor: '#5B21B6', bg: '#EDE9FE' },
  remanescente:         { label: '🔵 Crédito remanescente',  cor: '#1E40AF', bg: '#DBEAFE' },
  encerrado:            { label: '✅ Encerrado',             cor: '#065F46', bg: '#D1FAE5' },
  reprovado:            { label: '❌ Reprovado',             cor: '#991B1B', bg: '#FEE2E2' },
  cancelado:            { label: '🚫 Cancelado',             cor: '#6B7280', bg: '#F3F4F6' },
  excluido:             { label: '🗑️ Excluído',              cor: '#6B7280', bg: '#F3F4F6' },
}
const st = (s: string) => STATUS[s] || { label: s, cor: '#374151', bg: '#F3F4F6' }
const finLabel = (id: string) => FINALIDADES.find(f => f.id === id)?.label || id

const fmtR$ = (v: number | null | undefined) => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtData = (d: string | null) => { if (!d) return '—'; const [y, m, dd] = d.split('T')[0].split('-'); return `${dd}/${m}/${y}` }
const hoje = () => new Date().toISOString().slice(0, 10)

// ── Nº do caixa (crédito) por linha — reembolso é destacado como CRÉDITO ao colaborador ──
function CaixaTag({ numero, reembolso }: { numero: number | null | undefined; reembolso?: boolean }) {
  if (numero == null) return <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>—</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
      background: reembolso ? '#EDE9FE' : '#F1F5F9', color: reembolso ? '#5B21B6' : '#334155',
      border: `1px solid ${reembolso ? '#DDD6FE' : '#E2E8F0'}`, fontWeight: 700, fontSize: 10.5,
      padding: '2px 8px', borderRadius: 99,
    }}>
      {reembolso ? '🔄' : '💳'} CRD-{numero}{reembolso ? ' · Reembolso' : ''}
    </span>
  )
}

// ── Selo de anexo — destaca e identifica o comprovante (substitui o antigo 📎 solto) ──
function AnexoLink({ url, label = 'Ver anexo' }: { url: string | null | undefined; label?: string }) {
  if (!url) return <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>— sem anexo</span>
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Abrir comprovante anexado"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none',
        background: '#DBEAFE', color: '#1E40AF', fontWeight: 700, fontSize: 10.5, lineHeight: 1.4,
        padding: '2px 8px', borderRadius: 99, border: '1px solid #93C5FD', whiteSpace: 'nowrap',
      }}>
      <Paperclip size={11} /> {label}
    </a>
  )
}

// ── Saldo disponível gerado por um crédito (fica amarrado à LOJA de origem) ──
// Fontes do saldo: remanescente da prestação, devolução ao caixa, ou crédito
// lançado sem aprovação (parte ainda não gasta). Ver GerarCaixaDoSaldo.
function baseSaldoGerado(c: Credito): number {
  if (['cancelado', 'excluido', 'reprovado', 'rascunho'].includes(c.status)) return 0
  const p = c.prestacao || {}
  if (c.estimativa_base?.lancamento_direto && ['disponibilizado', 'em_prestacao'].includes(c.status)) {
    return Math.max(0, (c.valor_aprovado || 0) - (c.total_gasto || 0))
  }
  if (c.status === 'remanescente') return Number(p.remanescente ?? Math.abs(c.saldo || 0)) || 0
  if (c.status === 'encerrado' && p.destino === 'devolucao') return Number(p.devolucao || 0) || 0
  return 0
}
function usadoSaldo(c: Credito): number {
  return ((c.prestacao?.saldo_usos as any[]) || []).reduce((s, u) => s + (Number(u.valor) || 0), 0)
}
function dispSaldo(c: Credito): number {
  return Math.round((baseSaldoGerado(c) - usadoSaldo(c)) * 100) / 100
}

// ── Página ───────────────────────────────────────────────────
export default function CreditosPage() {
  const { loja } = useLoja()
  const { user, can } = useAuth()
  const podeAprovar = can('financeiro', 'create') || user?.role === 'admin' || user?.role === 'super_admin'

  const [tab, setTab] = useState<'solicitacoes' | 'prestacao' | 'saldos' | 'painel'>('solicitacoes')
  const [creditos, setCreditos] = useState<Credito[]>([])
  const [despesasAll, setDespesasAll] = useState<Despesa[]>([])
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [fUnidade, setFUnidade] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [busca, setBusca] = useState('')
  const [prestacaoId, setPrestacaoId] = useState<string | null>(null)
  const [saldoSrc, setSaldoSrc] = useState<Credito | null>(null)   // crédito origem ao gerar caixa do saldo

  const load = useCallback(async () => {
    setLoading(true)
    const [cr, dp] = await Promise.all([
      sb.from('creditos').select('*').order('created_at', { ascending: false }),
      sb.from('credito_despesas').select('*').order('data', { ascending: false }),
    ])
    setCreditos((cr.data as Credito[]) || [])
    setDespesasAll((dp.data as Despesa[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load(); fetchProfiles().then(setProfiles).catch(() => {}) }, [load])

  const filtrados = useMemo(() => creditos.filter(c => {
    // Excluídos ficam ocultos por padrão (o registro é mantido), mas aparecem ao filtrar por "Excluído".
    if (c.status === 'excluido' && fStatus !== 'excluido') return false
    if (fUnidade && c.unidade !== fUnidade) return false
    if (fStatus && c.status !== fStatus) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!(`${c.numero} ${c.solicitante_nome} ${finLabel(c.finalidade)} ${c.setor || ''} ${c.subcategoria || ''}`.toLowerCase().includes(q))) return false
    }
    return true
  }), [creditos, fUnidade, fStatus, busca])

  // Saldos disponíveis (por loja) — crédito que gerou saldo ainda não consumido
  const saldos = useMemo(() => creditos.filter(c => dispSaldo(c) > 0.001)
    .sort((a, b) => (a.unidade || '').localeCompare(b.unidade || '')), [creditos])
  const totalSaldoDisp = useMemo(() => saldos.reduce((s, c) => s + dispSaldo(c), 0), [saldos])

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
          <button className={`btn ${tab === 'saldos' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('saldos')}><Wallet size={13} /> Saldos disponíveis{saldos.length > 0 && <span className="badge" style={{ background: '#DCFCE7', color: '#166534' }}>{saldos.length}</span>}</button>
          <button className={`btn ${tab === 'painel' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('painel')}><BarChart3 size={13} /> Painel / Gestão</button>
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
        <Kpi titulo="🏦 Saldo disponível" valor={fmtR$(totalSaldoDisp)} />
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
      ) : tab === 'prestacao' ? (
        <PrestacaoContas creditos={creditos} selId={prestacaoId} setSelId={setPrestacaoId} onChange={load} user={user} />
      ) : tab === 'saldos' ? (
        <SaldosDisponiveis saldos={saldos} onGerar={setSaldoSrc} />
      ) : (
        <PainelGestaoCred creditos={creditos} despesas={despesasAll} />
      )}

      {novoOpen && <NovoCredito onClose={() => setNovoOpen(false)} onSaved={load} lojaAtual={loja} profiles={profiles} user={user} />}
      {saldoSrc && <GerarCaixaDoSaldo origem={saldoSrc} onClose={() => setSaldoSrc(null)} onSaved={load} profiles={profiles} user={user} />}
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
  // Cancelar / Excluir mantendo o REGISTRO (nunca apaga do banco): grava ação, motivo e quem fez.
  // Liberado para qualquer crédito NÃO UTILIZADO (sem despesas) e ainda não encerrado/cancelado/excluído.
  const podeCancelar = (c.total_gasto || 0) === 0 && !['encerrado', 'cancelado', 'excluido', 'remanescente'].includes(c.status)
  const registrarAudit = async (acao: 'cancelado' | 'excluido', motivo: string): Promise<boolean> => {
    // Integridade do saldo: não deixa cancelar/excluir crédito cujo saldo já foi usado em outro caixa.
    if (usadoSaldo(c) > 0.001) { alert('Este crédito já gerou saldo que foi usado em outro caixa. Estorne/cancele primeiro o caixa que usou o saldo.'); return false }
    // Se foi financiado por um saldo de outro crédito, devolve o valor à origem (estorno).
    const orig = c.estimativa_base?.origem_saldo
    if (orig?.credito_id) {
      try {
        const { data: src } = await sb.from('creditos').select('prestacao, numero').eq('id', orig.credito_id).maybeSingle()
        if (src) {
          const usos = ((src.prestacao?.saldo_usos as any[]) || []).filter((u: any) => u.credito_id !== c.id)
          await sb.from('creditos').update({ prestacao: { ...(src.prestacao || {}), saldo_usos: usos }, updated_at: new Date().toISOString() }).eq('id', orig.credito_id)
          try { await sb.from('credito_movimentos').insert({ credito_id: orig.credito_id, tipo: 'saldo_estorno', valor: c.valor_aprovado || 0, data: hoje(), obs: `Estorno do saldo — CRD-${c.numero} ${acao}`, created_by: user?.name || 'Painel' }) } catch { /* segue */ }
        }
      } catch { /* segue */ }
    }
    const prest = { ...(c.prestacao || {}), cancelamento: { acao, motivo, por: user?.name || 'Painel', em: new Date().toISOString(), status_anterior: c.status } }
    await sb.from('creditos').update({ status: acao, prestacao: prest, updated_at: new Date().toISOString() }).eq('id', c.id)
    try { await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: acao, valor: 0, data: hoje(), obs: `${acao === 'excluido' ? 'Excluído' : 'Cancelado'} por ${user?.name || 'Painel'} (era ${st(c.status).label.replace(/^[^ ]+ /, '')}): ${motivo}`, created_by: user?.name || 'Painel' }) } catch { /* segue */ }
    return true
  }
  const cancelar = async () => {
    const motivo = prompt(`Cancelar o crédito CRD-${c.numero}? (mantém o registro do cancelamento e quem fez)\n\nMotivo:`)
    if (!motivo) return
    setBusy(true); await registrarAudit('cancelado', motivo); setBusy(false); onChange()
  }
  const excluir = async () => {
    const motivo = prompt(`Excluir o crédito CRD-${c.numero} (criado errado)?\nO registro é mantido para auditoria (quem/quando/motivo).\n\nMotivo:`)
    if (!motivo) return
    setBusy(true); await registrarAudit('excluido', motivo); setBusy(false); onChange()
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
      {c.prestacao?.cancelamento && (
        <div style={{ fontSize: 11, color: '#6B7280', background: '#F3F4F6', padding: '6px 8px', borderRadius: 6 }}>
          {c.prestacao.cancelamento.acao === 'excluido' ? '🗑️ Excluído' : '🚫 Cancelado'} por <b>{c.prestacao.cancelamento.por}</b> em {fmtData(c.prestacao.cancelamento.em)}{c.prestacao.cancelamento.motivo ? ` — ${c.prestacao.cancelamento.motivo}` : ''}
        </div>
      )}
      {c.estimativa_base?.lancamento_direto && (
        <div style={{ fontSize: 11, color: '#166534', background: '#D1FAE5', padding: '6px 8px', borderRadius: 6 }}>⚡ Crédito lançado direto (sem aprovação)</div>
      )}
      {c.estimativa_base?.origem_saldo && (
        <div style={{ fontSize: 11, color: '#166534', background: '#DCFCE7', padding: '6px 8px', borderRadius: 6 }}>🏦 Gerado do saldo de <b>CRD-{c.estimativa_base.origem_saldo.numero}</b> ({c.estimativa_base.origem_saldo.loja})</div>
      )}
      {dispSaldo(c) > 0.001 && (
        <div style={{ fontSize: 11, color: '#1E40AF', background: '#DBEAFE', padding: '6px 8px', borderRadius: 6 }}>🏦 Saldo disponível gerado: <b>{fmtR$(dispSaldo(c))}</b> · usar só na {c.unidade}</div>
      )}
      {c.estimativa_base?.reembolso_proprio && (
        <div style={{ fontSize: 11, color: '#5B21B6', background: '#EDE9FE', padding: '6px 8px', borderRadius: 6, lineHeight: 1.5 }}>
          🔄 <b>Reembolso — recurso próprio</b><br />
          Autorizado por: <b>{c.estimativa_base.reembolso_proprio.autorizado_por || '—'}</b>
          {c.estimativa_base.reembolso_proprio.data_compra ? ` · Compra em ${fmtData(c.estimativa_base.reembolso_proprio.data_compra)}` : ''}
          {c.estimativa_base.reembolso_proprio.necessidade ? <><br />Necessidade: {c.estimativa_base.reembolso_proprio.necessidade}</> : null}
        </div>
      )}

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
        {['disponibilizado', 'em_prestacao', 'prestacao_pendente', 'divergencia', 'aguardando_devolucao', 'em_analise'].includes(c.status) && !busy && (
          <button className="btn bp bsm" onClick={onPrestar}><FileCheck2 size={12} /> {c.status === 'em_analise' ? 'Editar / corrigir' : 'Prestar contas'}</button>
        )}
        <a href={linkPublico} target="_blank" rel="noreferrer" className="btn bo bsm" style={{ textDecoration: 'none' }}><ExternalLink size={12} /> Ver</a>
        {(podeAprovar || user?.role === 'admin' || user?.role === 'super_admin') && !busy && podeCancelar && (
          <>
            <button className="btn bo bsm" onClick={cancelar} title="Cancelar (mantém o registro)" style={{ color: '#B45309' }}><X size={12} /> Cancelar</button>
            <button className="btn bo bsm" onClick={excluir} title="Excluir (mantém o registro)" style={{ color: '#991B1B' }}><Trash2 size={12} /> Excluir</button>
          </>
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
    reembolso_proprio: false, autorizado_por: '', data_compra: hoje(), necessidade: '',
    lancamento_direto: false,
  })
  const [anexo, setAnexo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const fin = FINALIDADES.find(x => x.id === f.finalidade)
  const set = (k: string, v: string) => setF(o => ({ ...o, [k]: v }))

  const salvar = async () => {
    if (!f.solicitante_nome.trim()) { alert('Informe o solicitante.'); return }
    const valor = Number(String(f.valor_solicitado).replace(',', '.')) || 0
    if (f.reembolso_proprio) {
      // Compra com recurso próprio: não exige valor solicitado antecipado,
      // mas exige quem autorizou e a necessidade da compra.
      if (!f.autorizado_por.trim()) { alert('Informe quem autorizou a compra.'); return }
      if (!f.necessidade.trim()) { alert('Descreva a necessidade da compra com recurso próprio.'); return }
    } else if (!(valor > 0)) {
      alert('Informe um valor solicitado válido.'); return
    }
    setSalvando(true)
    try {
      let anexo_url: string | null = null
      if (anexo) anexo_url = await uploadAnexo(anexo, 'creditos')
      const solId = profiles.find(p => p.name === f.solicitante_nome)?.id || null
      const finalidade = f.reembolso_proprio ? 'reembolso' : f.finalidade
      const finObj = FINALIDADES.find(x => x.id === finalidade)
      const centro_custo = [f.unidade, f.setor, finObj?.label.replace(/^[^ ]+ /, ''), f.subcategoria].filter(Boolean).join(' > ')
      const direto = f.lancamento_direto && !f.reembolso_proprio
      const estimativa_base = f.reembolso_proprio
        ? { reembolso_proprio: { autorizado_por: f.autorizado_por.trim(), data_compra: f.data_compra, necessidade: f.necessidade.trim() } }
        : direto ? { lancamento_direto: true } : null
      // Status: reembolso → prestação; lançamento direto → já disponibilizado (sem aprovação); senão → solicitado
      const status = f.reembolso_proprio ? 'em_prestacao' : direto ? 'disponibilizado' : 'solicitado'
      const { data: novo } = await sb.from('creditos').insert({
        solicitante_nome: f.solicitante_nome.trim(), solicitante_id: solId, setor: f.setor || null, unidade: f.unidade,
        data_solicitacao: f.data_solicitacao, data_necessaria: f.data_necessaria || null,
        finalidade, subcategoria: f.subcategoria || null, prioridade: f.prioridade,
        valor_solicitado: valor, valor_aprovado: direto ? valor : null,
        aprovado_por: direto ? `Lançamento direto — ${user?.name || 'Painel'}` : null,
        aprovado_em: direto ? new Date().toISOString() : null,
        forma_recebimento: f.forma_recebimento, centro_custo, estimativa_base,
        observacao: f.observacao || null, anexo_url,
        status, created_by: user?.name || 'Painel',
      }).select('id').single()
      // Lançamento direto: registra a liberação no caixa (rastreabilidade), sem passar por aprovação.
      if (direto && novo?.id) {
        try { await sb.from('credito_movimentos').insert({ credito_id: novo.id, tipo: 'liberacao', valor, data: hoje(), obs: `Crédito lançado direto (sem aprovação) — ${f.unidade}`, created_by: user?.name || 'Painel' }) } catch { /* segue */ }
      }
      onSaved(); onClose()
    } catch (e: any) { alert('Falha ao salvar: ' + (e?.message || e)) }
    setSalvando(false)
  }

  return (
    <div className="ov open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="mhd"><b>{f.reembolso_proprio ? '🔄 Reembolso — recurso próprio' : '💳 Solicitar Crédito'}</b><button className="btn bo bsm" onClick={onClose}><X size={13} /></button></div>
        <div className="mbd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="fg" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, background: f.reembolso_proprio ? '#EDE9FE' : 'var(--bg2,#F8FAFC)', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', margin: 0 }}>
            <input type="checkbox" checked={f.reembolso_proprio} onChange={e => setF(o => ({ ...o, reembolso_proprio: e.target.checked, lancamento_direto: e.target.checked ? false : o.lancamento_direto, finalidade: e.target.checked ? 'reembolso' : 'compras_semana', subcategoria: '' }))} />
            <span style={{ fontSize: 12 }}><b>🔄 Compra com recurso próprio (reembolso)</b> — o colaborador já pagou do próprio bolso e pede o valor de volta. Não é preciso solicitar crédito antes.</span>
          </label>
          {!f.reembolso_proprio && (
            <label className="fg" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, background: f.lancamento_direto ? '#D1FAE5' : 'var(--bg2,#F8FAFC)', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={f.lancamento_direto} onChange={e => setF(o => ({ ...o, lancamento_direto: e.target.checked }))} />
              <span style={{ fontSize: 12 }}><b>⚡ Crédito já disponível (sem aprovação)</b> — lança o crédito direto como disponibilizado, sem passar pela aprovação. O valor entra como saldo da loja.</span>
            </label>
          )}
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
            <select className="sel" value={f.finalidade} disabled={f.reembolso_proprio} onChange={e => { set('finalidade', e.target.value); set('subcategoria', '') }}>{FINALIDADES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          </div>
          <div className="fg"><label className="fl">Subcategoria</label>
            {fin && fin.subs.length > 0
              ? <select className="sel" value={f.subcategoria} onChange={e => set('subcategoria', e.target.value)}><option value="">—</option>{fin.subs.map(s => <option key={s}>{s}</option>)}</select>
              : <input className="inp" value={f.subcategoria} onChange={e => set('subcategoria', e.target.value)} placeholder="Opcional" />}
          </div>
          <div className="fg"><label className="fl">Data da solicitação</label><input type="date" className="inp" value={f.data_solicitacao} onChange={e => set('data_solicitacao', e.target.value)} /></div>
          <div className="fg"><label className="fl">Data necessária</label><input type="date" className="inp" value={f.data_necessaria} onChange={e => set('data_necessaria', e.target.value)} /></div>
          <div className="fg"><label className="fl">{f.reembolso_proprio ? 'Valor gasto a reembolsar (R$)' : 'Valor solicitado (R$) *'}</label><input className="inp" inputMode="decimal" value={f.valor_solicitado} onChange={e => set('valor_solicitado', e.target.value)} placeholder="0,00" /></div>
          <div className="fg"><label className="fl">Forma de recebimento</label>
            <select className="sel" value={f.forma_recebimento} onChange={e => set('forma_recebimento', e.target.value)}>{FORMAS.map(x => <option key={x}>{x}</option>)}</select>
          </div>
          {f.reembolso_proprio && (
            <>
              <div className="fg"><label className="fl">Quem autorizou a compra *</label><input className="inp" list="prof-list" value={f.autorizado_por} onChange={e => set('autorizado_por', e.target.value)} placeholder="Nome de quem autorizou" /></div>
              <div className="fg"><label className="fl">Data da compra *</label><input type="date" className="inp" value={f.data_compra} onChange={e => set('data_compra', e.target.value)} /></div>
              <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl">Necessidade — por que comprou com recurso próprio *</label><textarea className="inp" rows={2} value={f.necessidade} onChange={e => set('necessidade', e.target.value)} placeholder="Ex.: urgência na cozinha, sem tempo de solicitar crédito, autorizado por…" /></div>
            </>
          )}
          <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl">Observação</label><textarea className="inp" rows={2} value={f.observacao} onChange={e => set('observacao', e.target.value)} /></div>
          <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl">Anexo / comprovante prévio</label>
            <label className="btn bo bsm" style={{ cursor: 'pointer', margin: 0, width: 'fit-content' }}>
              <Paperclip size={12} /> {anexo ? anexo.name : 'Anexar arquivo'}
              <input type="file" hidden onChange={e => setAnexo(e.target.files?.[0] || null)} />
            </label>
          </div>
          {f.finalidade === 'compras_semana' && !f.reembolso_proprio && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--muted)', background: 'var(--bg2,#F8FAFC)', padding: '8px 10px', borderRadius: 6 }}>
              💡 Estimativa automática por custo médio e histórico entra na <b>Fase 2</b>. Por ora, informe o valor manualmente.
            </div>
          )}
          {f.reembolso_proprio && (
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#5B21B6', background: '#EDE9FE', padding: '8px 10px', borderRadius: 6 }}>
              🔄 Ao salvar, este registro vai direto para a <b>Prestação de Contas</b>: anexe as notas/comprovantes da compra e concilie para gerar o <b>reembolso ao colaborador</b>, que segue para aprovação (Wagner/Aline).
            </div>
          )}
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
          <button className="btn bp bsm" onClick={salvar} disabled={salvando}>{salvando ? <Loader className="spin" size={13} /> : <Check size={13} />} {f.reembolso_proprio ? 'Registrar reembolso' : 'Solicitar'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Prestação de contas ──────────────────────────────────────
function PrestacaoContas({ creditos, selId, setSelId, onChange, user }: {
  creditos: Credito[]; selId: string | null; setSelId: (id: string | null) => void; onChange: () => void; user: any
}) {
  const elegiveis = creditos.filter(c => ['aprovado', 'disponibilizado', 'em_prestacao', 'prestacao_pendente', 'divergencia', 'aguardando_devolucao', 'em_analise'].includes(c.status))
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
  const rp = c.estimativa_base?.reembolso_proprio
  const isReembolsoProprio = !!rp
  const [justificativa, setJustificativa] = useState(rp?.necessidade || '')
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
  const opcoesDestino = isReembolsoProprio
    ? [{ id: 'reembolso', label: '🔴 Reembolsar colaborador' }]
    : saldo > 0.001
      ? [{ id: 'devolucao', label: '💵 Devolução ao caixa' }, { id: 'remanescente', label: '🔄 Crédito remanescente' }]
      : saldo < -0.001
        ? [{ id: 'complemento', label: '➕ Complemento' }, { id: 'reembolso', label: '🔴 Reembolso ao colaborador' }]
        : [{ id: 'zerado', label: '🟢 Crédito totalmente utilizado' }]

  const encerrar = async () => {
    if (isReembolsoProprio && totalGasto <= 0) { alert('Lance ao menos uma despesa (nota/comprovante) da compra antes de enviar o reembolso.'); return }
    const dst = isReembolsoProprio ? 'reembolso' : (saldo === 0 ? 'zerado' : destino)
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
      const valorReembolso = isReembolsoProprio ? totalGasto : absSaldo
      const just = justificativa.trim() || (rp?.necessidade || '')
      if (!just) { alert('Reembolso: descreva a justificativa.'); return }
      prestacao.reembolso = valorReembolso
      if (isReembolsoProprio) prestacao.reembolso_proprio = rp
      await sb.from('credito_movimentos').insert({ credito_id: c.id, tipo: 'reembolso', valor: valorReembolso, data: hoje(), obs: isReembolsoProprio ? `Reembolso recurso próprio — ${just}` : just, created_by: user?.name || 'Painel' })
    }
    // A prestação NÃO encerra na hora: vai para ANÁLISE e é enviada a Wagner/Aline para aprovar.
    prestacao.status_final = novoStatus  // status que assume quando aprovada
    await sb.from('creditos').update({ status: 'em_analise', destino_saldo: dst, saldo, total_gasto: totalGasto, prestacao, updated_at: new Date().toISOString() }).eq('id', c.id)
    // dispara Wagner e Aline pela VPS (Evolution)
    let aprovadores: { nome: string; fone: string }[] = [{ nome: 'Wagner', fone: '5581994135602' }, { nome: 'Aline', fone: '5581994573420' }]
    try { const { data } = await sb.from('app_config').select('valor').eq('chave', 'credito_aprovadores').maybeSingle(); if (Array.isArray(data?.valor?.lista) && data.valor.lista.length) aprovadores = data.valor.lista } catch { /* fallback */ }
    const link = `https://painel.amorefood.com.br/credito.html?id=${c.id}`
    const destinoTxt = dst === 'devolucao' ? `Devolução ${fmtR$(absSaldo)}` : dst === 'remanescente' ? `Remanescente ${fmtR$(absSaldo)}` : dst === 'reembolso' ? `Reembolso ${fmtR$(absSaldo)}` : dst === 'complemento' ? `Complemento ${fmtR$(absSaldo)}` : 'Totalmente utilizado'
    const msg = isReembolsoProprio
      ? `🔄 *Reembolso para aprovar* — CRD-${c.numero}\n${c.solicitante_nome} · ${c.unidade}${c.setor ? ' · ' + c.setor : ''}\n🧾 Compra com recurso próprio · Valor a reembolsar *${fmtR$(totalGasto)}*\n👤 Autorizado por: ${rp?.autorizado_por || '—'}${rp?.data_compra ? ` · Compra em ${fmtData(rp.data_compra)}` : ''}\n📝 ${rp?.necessidade || justificativa || ''}\n\n👉 Abrir para conferir e *aprovar*:\n${link}`
      : `🧾 *Prestação de contas para aprovar* — CRD-${c.numero}\n${c.solicitante_nome} · ${c.unidade}${c.setor ? ' · ' + c.setor : ''}\n💰 Crédito ${fmtR$(credito)} · Gasto ${fmtR$(totalGasto)} · Saldo ${fmtR$(saldo)}\n📌 ${destinoTxt}\n\n👉 Abrir para conferir e *aprovar / apontar divergência*:\n${link}`
    let okSend = 0
    for (const a of aprovadores) { try { const rr = await fetch('/api/evolution-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: a.fone, message: msg }) }); if (rr.ok) okSend++ } catch { /* segue */ } }
    onChange(); onVoltar()
    alert(okSend > 0 ? 'Prestação enviada para análise de Wagner e Aline 📲' : '⚠ Prestação registrada em análise, mas o WhatsApp falhou (VPS). Envie o link manualmente aos aprovadores.')
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
        {c.status === 'em_analise' && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#9A3412', background: '#FFEDD5', padding: '8px 10px', borderRadius: 8 }}>
            🕓 <b>Em análise de aprovação.</b> Você ainda pode <b>lançar, corrigir ou excluir despesas</b>. Ao concluir, use o botão abaixo para <b>reenviar a prestação corrigida</b> para os aprovadores.
          </div>
        )}
        {isReembolsoProprio && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#5B21B6', background: '#EDE9FE', padding: '8px 10px', borderRadius: 8, lineHeight: 1.5 }}>
            🔄 <b>Reembolso — compra com recurso próprio</b><br />
            Autorizado por: <b>{rp.autorizado_por || '—'}</b>{rp.data_compra ? ` · Compra em ${fmtData(rp.data_compra)}` : ''}
            {rp.necessidade ? <><br />Necessidade: {rp.necessidade}</> : null}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginTop: 12 }}>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{isReembolsoProprio ? 'Crédito prévio' : 'Crédito original'}</div><div style={{ fontSize: 18, fontWeight: 800 }}>{isReembolsoProprio ? 'Recurso próprio' : fmtR$(credito)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{isReembolsoProprio ? 'Gasto (a reembolsar)' : 'Despesas'}</div><div style={{ fontSize: 18, fontWeight: 800, color: '#B45309' }}>{fmtR$(totalGasto)}</div></div>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{isReembolsoProprio ? 'Reembolso' : 'Saldo'}</div><div style={{ fontSize: 18, fontWeight: 800, color: isReembolsoProprio ? '#5B21B6' : (saldo < 0 ? '#DC2626' : '#166534') }}>{fmtR$(isReembolsoProprio ? totalGasto : saldo)}</div></div>
        </div>
      </div>

      {/* Lista de despesas */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🧾 Despesas realizadas</div>
        {loading ? <Loader className="spin" /> : despesas.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhuma despesa lançada.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={{ padding: 6 }}>Data</th><th>Caixa</th><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th style={{ textAlign: 'right' }}>Valor</th><th>Anexo</th><th></th>
              </tr></thead>
              <tbody>{despesas.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{fmtData(d.data)}</td>
                  <td><CaixaTag numero={c.numero} reembolso={isReembolsoProprio} /></td>
                  <td>{d.descricao}</td><td>{d.categoria}</td><td>{d.fornecedor || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtR$(d.valor)}</td>
                  <td><AnexoLink url={d.comprovante_url} label="Ver NF" /></td>
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
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{isReembolsoProprio ? '✅ Conciliação e reembolso' : '✅ Conciliação e encerramento'}</div>
          {isReembolsoProprio ? (
            <div style={{ fontSize: 13, marginBottom: 10, color: '#5B21B6' }}>
              🔄 Reembolso de <b>{fmtR$(totalGasto)}</b> a <b>{c.solicitante_nome}</b> (compra paga com recurso próprio).
            </div>
          ) : (
            <>
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
            </>
          )}
          {(isReembolsoProprio || destino === 'complemento' || destino === 'reembolso' || (saldo < -0.001)) && (
            <div className="fg" style={{ marginBottom: 10 }}><label className="fl">{isReembolsoProprio ? 'Necessidade / justificativa do reembolso (obrigatória)' : 'Justificativa (obrigatória)'}</label><textarea className="inp" rows={2} value={justificativa} onChange={e => setJustificativa(e.target.value)} /></div>
          )}
          {!isReembolsoProprio && <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>Conciliação: Crédito {fmtR$(credito)} = Despesas {fmtR$(totalGasto)} {saldo >= 0 ? '+' : '−'} {fmtR$(Math.abs(saldo))} ({saldo >= 0 ? 'saldo' : 'excedente'}).</div>}
          <button className="btn bp bsm" onClick={encerrar}><FileCheck2 size={13} /> {isReembolsoProprio ? 'Enviar reembolso para aprovação' : (c.status === 'em_analise' ? 'Reenviar prestação corrigida' : 'Enviar prestação para aprovação')}</button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>⚠️ Nenhum crédito é encerrado sem prestação de contas conciliada.</div>
        </div>
      )}
      {c.status === 'remanescente' && (
        <div className="card" style={{ padding: 16, background: '#DBEAFE' }}>🔵 Crédito remanescente de {fmtR$(Math.abs(saldo))} vinculado a {c.solicitante_nome}. Poderá ser usado na próxima compra autorizada.</div>
      )}
    </div>
  )
}

// ── Rótulo da fonte do saldo ─────────────────────────────────
function fonteSaldo(c: Credito): string {
  if (c.estimativa_base?.lancamento_direto) return 'Crédito lançado direto (sem aprovação)'
  if (c.status === 'remanescente') return 'Remanescente de prestação'
  if ((c.prestacao || {}).destino === 'devolucao') return 'Devolução ao caixa'
  return 'Saldo'
}

// ── Aba: Saldos disponíveis (por loja) ───────────────────────
function SaldosDisponiveis({ saldos, onGerar }: { saldos: Credito[]; onGerar: (c: Credito) => void }) {
  if (saldos.length === 0) {
    return <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>Nenhum saldo disponível no momento. Saldos aparecem aqui quando um crédito gera remanescente, devolução ao caixa, ou é lançado direto sem aprovação.</div>
  }
  // agrupa por loja
  const porLoja: Record<string, Credito[]> = {}
  for (const c of saldos) (porLoja[c.unidade] = porLoja[c.unidade] || []).push(c)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>💡 O saldo fica <b>amarrado à loja que o gerou</b> e só pode virar crédito para compras da <b>mesma loja</b> (preserva a análise financeira de cada unidade).</div>
      {Object.entries(porLoja).map(([lojaNome, lista]) => {
        const totalLoja = lista.reduce((s, c) => s + dispSaldo(c), 0)
        return (
          <div key={lojaNome}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, color: 'var(--bordo)' }}>🏦 {lojaNome}</span>
              <span className="badge" style={{ background: '#DCFCE7', color: '#166534' }}>Disponível: {fmtR$(totalLoja)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
              {lista.map(c => {
                const base = baseSaldoGerado(c), usado = usadoSaldo(c), disp = dispSaldo(c)
                const usos = (c.prestacao?.saldo_usos as any[]) || []
                return (
                  <div key={c.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 800, color: 'var(--bordo)' }}>CRD-{c.numero}</span>
                      <span className="badge" style={{ background: '#DBEAFE', color: '#1E40AF', fontSize: 10 }}>{fonteSaldo(c)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Origem: {c.solicitante_nome} · {c.unidade}{c.setor ? ' · ' + c.setor : ''}</div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, flexWrap: 'wrap' }}>
                      <span>Gerado: <b>{fmtR$(base)}</b></span>
                      {usado > 0 && <span style={{ color: '#B45309' }}>Usado: <b>{fmtR$(usado)}</b></span>}
                      <span style={{ color: '#166534' }}>Disponível: <b>{fmtR$(disp)}</b></span>
                    </div>
                    {usos.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--bg2,#F8FAFC)', padding: '6px 8px', borderRadius: 6 }}>
                        <b>Onde foi usado:</b>
                        {usos.map((u, i) => <div key={i}>• CRD-{u.numero} — {fmtR$(u.valor)}{u.por ? ` · ${u.por}` : ''}{u.em ? ` · ${fmtData(u.em)}` : ''}</div>)}
                      </div>
                    )}
                    <button className="btn bp bsm" style={{ marginTop: 2, width: 'fit-content' }} onClick={() => onGerar(c)}><Plus size={12} /> Gerar caixa deste saldo</button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Modal: gerar caixa (crédito) consumindo um saldo existente ──
function GerarCaixaDoSaldo({ origem, onClose, onSaved, profiles, user }: {
  origem: Credito; onClose: () => void; onSaved: () => void; profiles: any[]; user: any
}) {
  const disp = dispSaldo(origem)
  const [f, setF] = useState({ solicitante_nome: user?.name || '', setor: '', finalidade: 'compras_semana', subcategoria: '', valor: String(disp), observacao: '' })
  const [salvando, setSalvando] = useState(false)
  const fin = FINALIDADES.find(x => x.id === f.finalidade)
  const set = (k: string, v: string) => setF(o => ({ ...o, [k]: v }))

  const salvar = async () => {
    const valor = Number(String(f.valor).replace(',', '.'))
    if (!(valor > 0)) { alert('Informe um valor válido.'); return }
    if (valor > disp + 0.001) { alert(`Valor acima do saldo disponível (${fmtR$(disp)}).`); return }
    if (!f.solicitante_nome.trim()) { alert('Informe o solicitante.'); return }
    setSalvando(true)
    try {
      const solId = profiles.find(p => p.name === f.solicitante_nome)?.id || null
      const finObj = FINALIDADES.find(x => x.id === f.finalidade)
      const centro_custo = [origem.unidade, f.setor, finObj?.label.replace(/^[^ ]+ /, ''), f.subcategoria].filter(Boolean).join(' > ')
      // 1) novo crédito (caixa) já disponibilizado, financiado pelo saldo — MESMA loja da origem
      const { data: novo } = await sb.from('creditos').insert({
        solicitante_nome: f.solicitante_nome.trim(), solicitante_id: solId, setor: f.setor || null, unidade: origem.unidade,
        data_solicitacao: hoje(), finalidade: f.finalidade, subcategoria: f.subcategoria || null, prioridade: 'media',
        valor_solicitado: valor, valor_aprovado: valor,
        aprovado_por: `Saldo CRD-${origem.numero} — ${user?.name || 'Painel'}`, aprovado_em: new Date().toISOString(),
        forma_recebimento: null, centro_custo,
        estimativa_base: { origem_saldo: { credito_id: origem.id, numero: origem.numero, loja: origem.unidade, colaborador: origem.solicitante_nome } },
        observacao: f.observacao || null, status: 'disponibilizado', created_by: user?.name || 'Painel',
      }).select('id, numero').single()
      if (!novo?.id) throw new Error('não retornou o novo crédito')
      // 2) movimento de entrada no novo
      try { await sb.from('credito_movimentos').insert({ credito_id: novo.id, tipo: 'liberacao', valor, data: hoje(), obs: `Crédito gerado do saldo de CRD-${origem.numero} (${origem.unidade})`, created_by: user?.name || 'Painel' }) } catch { /* segue */ }
      // 3) amarra na origem: registra o uso do saldo (onde foi usado) + movimento de saída
      const usos = ((origem.prestacao?.saldo_usos as any[]) || []).concat([{ credito_id: novo.id, numero: novo.numero, loja: origem.unidade, valor, por: user?.name || 'Painel', em: new Date().toISOString() }])
      await sb.from('creditos').update({ prestacao: { ...(origem.prestacao || {}), saldo_usos: usos }, updated_at: new Date().toISOString() }).eq('id', origem.id)
      try { await sb.from('credito_movimentos').insert({ credito_id: origem.id, tipo: 'saldo_saida', valor, data: hoje(), obs: `Saldo usado para gerar CRD-${novo.numero} (${origem.unidade})`, created_by: user?.name || 'Painel' }) } catch { /* segue */ }
      onSaved(); onClose()
    } catch (e: any) { alert('Falha ao gerar: ' + (e?.message || e)) }
    setSalvando(false)
  }

  return (
    <div className="ov open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="mhd"><b>🏦 Gerar caixa do saldo — CRD-{origem.numero}</b><button className="btn bo bsm" onClick={onClose}><X size={13} /></button></div>
        <div className="mbd" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#166534', background: '#DCFCE7', padding: '8px 10px', borderRadius: 8 }}>
            Usando saldo de <b>CRD-{origem.numero}</b> · {origem.solicitante_nome} · <b>{origem.unidade}</b><br />
            Disponível: <b>{fmtR$(disp)}</b> · O novo caixa fica travado na loja <b>{origem.unidade}</b>.
          </div>
          <div className="fg"><label className="fl">Solicitante *</label>
            <input className="inp" list="prof-list-saldo" value={f.solicitante_nome} onChange={e => set('solicitante_nome', e.target.value)} placeholder="Nome" />
            <datalist id="prof-list-saldo">{profiles.map(p => <option key={p.id} value={p.name} />)}</datalist>
          </div>
          <div className="fg"><label className="fl">Setor</label><input className="inp" value={f.setor} onChange={e => set('setor', e.target.value)} placeholder="Cozinha, Logística…" /></div>
          <div className="fg"><label className="fl">Finalidade *</label>
            <select className="sel" value={f.finalidade} onChange={e => { set('finalidade', e.target.value); set('subcategoria', '') }}>{FINALIDADES.filter(x => x.id !== 'reembolso').map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
          </div>
          <div className="fg"><label className="fl">Subcategoria</label>
            {fin && fin.subs.length > 0
              ? <select className="sel" value={f.subcategoria} onChange={e => set('subcategoria', e.target.value)}><option value="">—</option>{fin.subs.map(s => <option key={s}>{s}</option>)}</select>
              : <input className="inp" value={f.subcategoria} onChange={e => set('subcategoria', e.target.value)} placeholder="Opcional" />}
          </div>
          <div className="fg"><label className="fl">Valor a usar (R$) *</label><input className="inp" inputMode="decimal" value={f.valor} onChange={e => set('valor', e.target.value)} placeholder="0,00" /></div>
          <div className="fg" style={{ gridColumn: '1 / -1' }}><label className="fl">Observação</label><textarea className="inp" rows={2} value={f.observacao} onChange={e => set('observacao', e.target.value)} /></div>
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
          <button className="btn bp bsm" onClick={salvar} disabled={salvando}>{salvando ? <Loader className="spin" size={13} /> : <Check size={13} />} Gerar caixa</button>
        </div>
      </div>
    </div>
  )
}

// ── Origem do crédito (como foi gerado) ──────────────────────
function origemCred(c: Credito): string {
  if (c.estimativa_base?.origem_saldo) return '🏦 Gerado de saldo'
  if (c.estimativa_base?.reembolso_proprio) return '🔄 Reembolso (recurso próprio)'
  if (c.estimativa_base?.lancamento_direto) return '⚡ Lançado direto (sem aprovação)'
  return '📝 Solicitação aprovada'
}

// ── Aba: Painel / Gestão (análise financeira do módulo) ──────
function PainelGestaoCred({ creditos, despesas }: { creditos: Credito[]; despesas: Despesa[] }) {
  const hojeStr = new Date().toISOString().slice(0, 10)
  const [dataIni, setDataIni] = useState(hojeStr.slice(0, 8) + '01')
  const [dataFim, setDataFim] = useState(hojeStr)
  const [fLoja, setFLoja] = useState('')

  const credById = useMemo(() => { const m: Record<string, Credito> = {}; for (const c of creditos) m[c.id] = c; return m }, [creditos])
  const ativos = (c: Credito) => !['cancelado', 'excluido', 'reprovado'].includes(c.status)

  const credFiltrados = useMemo(() => creditos.filter(c => {
    if (!ativos(c)) return false
    const d = (c.data_solicitacao || c.created_at || '').slice(0, 10)
    if (d < dataIni || d > dataFim) return false
    if (fLoja && c.unidade !== fLoja) return false
    return true
  }), [creditos, dataIni, dataFim, fLoja])

  const despFiltradas = useMemo(() => despesas.filter(d => {
    const dd = (d.data || '').slice(0, 10)
    if (dd < dataIni || dd > dataFim) return false
    const loja = credById[d.credito_id]?.unidade
    if (fLoja && loja !== fLoja) return false
    return true
  }).map(d => { const cr = credById[d.credito_id]; return { ...d, _loja: cr?.unidade || '—', _num: cr?.numero ?? null, _reemb: !!cr?.estimativa_base?.reembolso_proprio } })
    .sort((a, b) => (a.data < b.data ? 1 : -1)), [despesas, credById, dataIni, dataFim, fLoja])

  const sum = (arr: Credito[], f: (c: Credito) => number) => arr.reduce((s, c) => s + (f(c) || 0), 0)
  const pv = (c: Credito, k: string) => Number((c.prestacao || {})[k] || 0)

  const tot = useMemo(() => ({
    qtd: credFiltrados.length,
    solicitado: sum(credFiltrados, c => c.valor_solicitado || 0),
    aprovado: sum(credFiltrados, c => c.valor_aprovado || 0),
    despesas: despFiltradas.reduce((s, d) => s + (d.valor || 0), 0),
    reembolso: sum(credFiltrados, c => pv(c, 'reembolso')),
    devolucao: sum(credFiltrados, c => pv(c, 'devolucao')),
    remanescente: sum(credFiltrados, c => pv(c, 'remanescente')),
    complemento: sum(credFiltrados, c => pv(c, 'complemento')),
  }), [credFiltrados, despFiltradas])

  const porLoja = useMemo(() => LOJAS.map(loja => {
    const cs = credFiltrados.filter(c => c.unidade === loja)
    const ds = despFiltradas.filter(d => d._loja === loja)
    const saldoAtual = creditos.filter(c => c.unidade === loja).reduce((s, c) => s + dispSaldo(c), 0)
    const devPend = creditos.filter(c => c.unidade === loja && c.status === 'aguardando_devolucao').reduce((s, c) => s + Math.abs(c.saldo || 0), 0)
    return {
      loja, qtd: cs.length,
      aprovado: cs.reduce((s, c) => s + (c.valor_aprovado || 0), 0),
      despesas: ds.reduce((s, d) => s + (d.valor || 0), 0),
      reembolso: cs.reduce((s, c) => s + pv(c, 'reembolso'), 0),
      devolucao: cs.reduce((s, c) => s + pv(c, 'devolucao'), 0),
      saldoAtual, devPend,
    }
  }).filter(l => l.qtd > 0 || l.saldoAtual > 0 || l.despesas > 0), [credFiltrados, despFiltradas, creditos])

  const porOrigem = useMemo(() => {
    const m: Record<string, { qtd: number; valor: number }> = {}
    for (const c of credFiltrados) { const o = origemCred(c); (m[o] = m[o] || { qtd: 0, valor: 0 }); m[o].qtd++; m[o].valor += (c.valor_aprovado || c.valor_solicitado || 0) }
    return Object.entries(m).sort((a, b) => b[1].valor - a[1].valor)
  }, [credFiltrados])

  const porStatus = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of credFiltrados) m[c.status] = (m[c.status] || 0) + 1
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [credFiltrados])

  const saldoDispTotal = useMemo(() => creditos.reduce((s, c) => s + dispSaldo(c), 0), [creditos])

  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em' }
  const tdN: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', fontWeight: 700 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="fg" style={{ margin: 0 }}><label className="fl">De</label><input type="date" className="inp" value={dataIni} onChange={e => setDataIni(e.target.value)} /></div>
        <div className="fg" style={{ margin: 0 }}><label className="fl">Até</label><input type="date" className="inp" value={dataFim} onChange={e => setDataFim(e.target.value)} /></div>
        <div className="fg" style={{ margin: 0 }}><label className="fl">Loja</label>
          <select className="sel" value={fLoja} onChange={e => setFLoja(e.target.value)}><option value="">Todas as lojas</option>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn bo bsm" onClick={() => { setDataIni(hojeStr.slice(0, 8) + '01'); setDataFim(hojeStr) }}>Mês atual</button>
          <button className="btn bo bsm" onClick={() => { setDataIni(hojeStr.slice(0, 4) + '-01-01'); setDataFim(hojeStr) }}>Ano</button>
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 800, color: 'var(--bordo)', marginBottom: 8 }}>📊 Totais no período {fLoja && `· ${fLoja}`}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <Kpi titulo="📄 Créditos" valor={String(tot.qtd)} />
          <Kpi titulo="✅ Aprovado" valor={fmtR$(tot.aprovado)} />
          <Kpi titulo="🧾 Despesas" valor={fmtR$(tot.despesas)} />
          <Kpi titulo="🔄 Reembolsos" valor={fmtR$(tot.reembolso)} />
          <Kpi titulo="💵 Devoluções" valor={fmtR$(tot.devolucao)} />
          <Kpi titulo="🔵 Remanescente" valor={fmtR$(tot.remanescente)} />
          <Kpi titulo="➕ Complementos" valor={fmtR$(tot.complemento)} />
          <Kpi titulo="🏦 Saldo disponível (agora)" valor={fmtR$(saldoDispTotal)} />
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🏬 Por loja</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Loja</th><th style={{ ...th, textAlign: 'right' }}>Créditos</th><th style={{ ...th, textAlign: 'right' }}>Aprovado</th>
              <th style={{ ...th, textAlign: 'right' }}>Despesas</th><th style={{ ...th, textAlign: 'right' }}>Reembolso</th>
              <th style={{ ...th, textAlign: 'right' }}>Devolução</th><th style={{ ...th, textAlign: 'right' }}>Saldo disp. (agora)</th><th style={{ ...th, textAlign: 'right' }}>Devol. pendente</th>
            </tr></thead>
            <tbody>{porLoja.length === 0 ? <tr><td colSpan={8} style={{ padding: 10, color: 'var(--muted)' }}>Sem dados no período.</td></tr> : porLoja.map(l => (
              <tr key={l.loja} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 700 }}>{l.loja}</td>
                <td style={tdN}>{l.qtd}</td><td style={tdN}>{fmtR$(l.aprovado)}</td>
                <td style={{ ...tdN, color: '#B45309' }}>{fmtR$(l.despesas)}</td>
                <td style={tdN}>{fmtR$(l.reembolso)}</td><td style={tdN}>{fmtR$(l.devolucao)}</td>
                <td style={{ ...tdN, color: '#166534' }}>{fmtR$(l.saldoAtual)}</td>
                <td style={{ ...tdN, color: l.devPend > 0 ? '#5B21B6' : 'var(--muted)' }}>{fmtR$(l.devPend)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🎯 Por origem do crédito</div>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Origem</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th><th style={{ ...th, textAlign: 'right' }}>Valor</th></tr></thead>
            <tbody>{porOrigem.length === 0 ? <tr><td colSpan={3} style={{ padding: 10, color: 'var(--muted)' }}>Sem dados.</td></tr> : porOrigem.map(([o, v]) => (
              <tr key={o} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: '6px 8px' }}>{o}</td><td style={tdN}>{v.qtd}</td><td style={tdN}>{fmtR$(v.valor)}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>🧾 Prestações por status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {porStatus.length === 0 ? <span style={{ color: 'var(--muted)', fontSize: 13 }}>Sem dados.</span> : porStatus.map(([s, n]) => (
              <span key={s} className="badge" style={{ background: st(s).bg, color: st(s).cor, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>{st(s).label}: {n}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700 }}>🧾 Despesas geradas no período</div>
          <span className="badge" style={{ background: '#FEF3C7', color: '#92400E' }}>Total: {fmtR$(tot.despesas)} · {despFiltradas.length} lançamento(s)</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Data</th><th style={th}>Caixa</th><th style={th}>Loja</th><th style={th}>Descrição</th><th style={th}>Categoria</th><th style={th}>Fornecedor</th><th style={th}>Anexo</th><th style={{ ...th, textAlign: 'right' }}>Valor</th>
            </tr></thead>
            <tbody>{despFiltradas.length === 0 ? <tr><td colSpan={8} style={{ padding: 10, color: 'var(--muted)' }}>Nenhuma despesa no período.</td></tr> : despFiltradas.slice(0, 300).map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--border)', background: d._reemb ? '#FAF5FF' : undefined }}>
                <td style={{ padding: '6px 8px' }}>{fmtData(d.data)}</td>
                <td style={{ padding: '6px 8px' }}><CaixaTag numero={d._num} reembolso={d._reemb} /></td>
                <td style={{ padding: '6px 8px' }}>{d._loja}</td>
                <td style={{ padding: '6px 8px' }}>{d.descricao}</td>
                <td style={{ padding: '6px 8px' }}>{d.categoria || '—'}</td>
                <td style={{ padding: '6px 8px' }}>{d.fornecedor || '—'}</td>
                <td style={{ padding: '6px 8px' }}>{d.comprovante_url ? <AnexoLink url={d.comprovante_url} label="NF" /> : ''}</td>
                <td style={tdN}>{fmtR$(d.valor)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {despFiltradas.length > 300 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Mostrando as 300 primeiras. Refine o período/loja.</div>}
      </div>
    </div>
  )
}
