import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader, Plus, RefreshCw, ArrowLeftRight, Send, Check, X, ChevronLeft, Trash2, PackageCheck, Truck, ClipboardCheck, AlertTriangle, History } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

// Tabelas do módulo ainda não estão no types/database.ts → cliente destipado (como em Créditos/db.ts)
const sb = supabase as any

// ── Tipos locais ─────────────────────────────────────────────
interface Transf {
  id: string
  numero: number
  unidade_origem: string
  unidade_destino: string
  solicitante_nome: string
  solicitante_id: string | null
  motivo: string | null
  status: string
  aprovado_por: string | null
  aprovado_em: string | null
  reprovado_motivo: string | null
  separado_por: string | null
  separado_em: string | null
  enviado_por: string | null
  enviado_em: string | null
  recebido_por: string | null
  recebido_em: string | null
  tem_divergencia: boolean
  obs_aprovacao: string | null
  obs_recebimento: string | null
  valor_total: number
  created_by: string | null
  created_at: string
}
interface TransfItem {
  id: string
  transferencia_id: string
  produto_origem_id: string | null
  produto_destino_id: string | null
  produto_nome: string
  unidade: string
  qtd_solicitada: number
  qtd_aprovada: number | null
  qtd_enviada: number | null
  qtd_recebida: number | null
  saldo_origem_no_pedido: number | null
  preco_unitario: number
  lote: string | null
}
interface TimelineEv { id: string; evento: string; descricao: string | null; quem: string | null; quando: string; meta: any }

// ── Constantes ───────────────────────────────────────────────
const LOJAS = ['Amore CD', 'Amore Paiva', 'Flow CD']

const STATUS: Record<string, { label: string; cor: string; bg: string }> = {
  solicitada:  { label: '🔵 Solicitada',  cor: '#1E40AF', bg: '#DBEAFE' },
  em_analise:  { label: '🕓 Em análise',   cor: '#9A3412', bg: '#FFEDD5' },
  aprovada:    { label: '🟢 Aprovada',     cor: '#166534', bg: '#DCFCE7' },
  separacao:   { label: '📦 Separação',    cor: '#3730A3', bg: '#E0E7FF' },
  enviada:     { label: '🚚 Enviada',      cor: '#5B21B6', bg: '#EDE9FE' },
  recebida:    { label: '✅ Recebida',     cor: '#065F46', bg: '#D1FAE5' },
  reprovada:   { label: '❌ Reprovada',    cor: '#991B1B', bg: '#FEE2E2' },
  cancelada:   { label: '🚫 Cancelada',    cor: '#6B7280', bg: '#F3F4F6' },
}
const st = (s: string) => STATUS[s] || { label: s, cor: '#374151', bg: '#F3F4F6' }

const fmtNum = (v: number | null | undefined) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const fmtR$ = (v: number | null | undefined) => v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDataH = (d: string | null) => { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }
const nowISO = () => new Date().toISOString()

// ── Página ───────────────────────────────────────────────────
export default function TransferenciasPage() {
  const { loja } = useLoja()
  const { user, can } = useAuth()
  const podeGerir = can('estoque', 'create') || user?.role === 'admin' || user?.role === 'super_admin'

  const [tab, setTab] = useState<'pendentes' | 'transito' | 'historico' | 'dashboard'>('pendentes')
  const [transfs, setTransfs] = useState<Transf[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [fUnidade, setFUnidade] = useState('')
  const [busca, setBusca] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('transferencias').select('*').order('created_at', { ascending: false })
    setTransfs((data as Transf[]) || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const pendentes = useMemo(() => transfs.filter(t => ['solicitada', 'em_analise'].includes(t.status)), [transfs])
  const emTransito = useMemo(() => transfs.filter(t => ['aprovada', 'separacao', 'enviada'].includes(t.status)), [transfs])

  const filtrar = (lista: Transf[]) => lista.filter(t => {
    if (fUnidade && t.unidade_origem !== fUnidade && t.unidade_destino !== fUnidade) return false
    if (busca) {
      const q = busca.toLowerCase()
      if (!(`TR-${t.numero} ${t.solicitante_nome} ${t.unidade_origem} ${t.unidade_destino} ${t.motivo || ''}`.toLowerCase().includes(q))) return false
    }
    return true
  })

  const kpi = useMemo(() => {
    const mes = new Date().toISOString().slice(0, 7)
    const doMes = transfs.filter(t => (t.created_at || '').slice(0, 7) === mes)
    return {
      pendAprov: transfs.filter(t => ['solicitada', 'em_analise'].includes(t.status)).length,
      transito: transfs.filter(t => ['aprovada', 'separacao', 'enviada'].includes(t.status)).length,
      recebidas: transfs.filter(t => t.status === 'recebida').length,
      divergencia: transfs.filter(t => t.tem_divergencia).length,
      valorMes: doMes.reduce((s, t) => s + (t.valor_total || 0), 0),
      qtdMes: doMes.length,
    }
  }, [transfs])

  if (selId) return <TransfDetalhe id={selId} onVoltar={() => setSelId(null)} onChange={load} user={user} podeGerir={podeGerir} />

  const listaAtual = tab === 'pendentes' ? filtrar(pendentes) : tab === 'transito' ? filtrar(emTransito) : filtrar(transfs)

  return (
    <div>
      {/* Cabeçalho + abas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={`btn ${tab === 'pendentes' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('pendentes')}><ClipboardCheck size={13} /> Pendentes {pendentes.length > 0 && <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>{pendentes.length}</span>}</button>
          <button className={`btn ${tab === 'transito' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('transito')}><Truck size={13} /> Em Trânsito {emTransito.length > 0 && <span className="badge" style={{ background: '#EDE9FE', color: '#5B21B6' }}>{emTransito.length}</span>}</button>
          <button className={`btn ${tab === 'historico' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('historico')}><History size={13} /> Histórico</button>
          <button className={`btn ${tab === 'dashboard' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('dashboard')}><ArrowLeftRight size={13} /> Dashboard</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn bo bsm" onClick={load} title="Atualizar"><RefreshCw size={13} /></button>
          <button className="btn bp bsm" onClick={() => setNovoOpen(true)}><Plus size={13} /> Nova Transferência</button>
        </div>
      </div>

      {tab === 'dashboard' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <Kpi titulo="⏳ Pendentes de aprovação" valor={String(kpi.pendAprov)} />
          <Kpi titulo="🚚 Em trânsito" valor={String(kpi.transito)} />
          <Kpi titulo="✅ Recebidas" valor={String(kpi.recebidas)} />
          <Kpi titulo="⚠️ Com divergência" valor={String(kpi.divergencia)} destaque={kpi.divergencia > 0} />
          <Kpi titulo="🔄 Transferências no mês" valor={String(kpi.qtdMes)} />
          <Kpi titulo="💰 Valor movimentado (mês)" valor={fmtR$(kpi.valorMes)} />
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <select className="sel" value={fUnidade} onChange={e => setFUnidade(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">Todas as unidades</option>
              {LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <input className="inp" placeholder="Buscar nº, solicitante, unidade…" value={busca} onChange={e => setBusca(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spin" /></div>
          ) : listaAtual.length === 0 ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}>
              {tab === 'pendentes' ? 'Nenhuma transferência aguardando aprovação.' : tab === 'transito' ? 'Nenhuma transferência em trânsito.' : 'Nenhuma transferência registrada ainda.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
              {listaAtual.map(t => <TransfCard key={t.id} t={t} onAbrir={() => setSelId(t.id)} />)}
            </div>
          )}
        </>
      )}

      {novoOpen && <NovaTransf onClose={() => setNovoOpen(false)} onSaved={load} lojaAtual={loja} user={user} />}
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

// ── Card ─────────────────────────────────────────────────────
function TransfCard({ t, onAbrir }: { t: Transf; onAbrir: () => void }) {
  const s = st(t.status)
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }} onClick={onAbrir}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800, color: 'var(--bordo)' }}>TR-{t.numero}</span>
        <span className="badge" style={{ background: s.bg, color: s.cor, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
        {t.tem_divergencia && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#DC2626', fontWeight: 700 }}><AlertTriangle size={11} style={{ verticalAlign: -1 }} /> Divergência</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        {t.unidade_origem} <ArrowLeftRight size={13} style={{ color: 'var(--muted)' }} /> {t.unidade_destino}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Solicitante: {t.solicitante_nome}</div>
      {t.motivo && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Motivo: {t.motivo}</div>}
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Criada em {fmtDataH(t.created_at)}{t.valor_total > 0 ? ` · ${fmtR$(t.valor_total)}` : ''}</div>
    </div>
  )
}

// ── Modal: nova transferência ────────────────────────────────
interface ProdOrig { id: string; nome: string; gramatura: string; nivel_atual: number; preco_unitario: number; categoria: string }
function NovaTransf({ onClose, onSaved, lojaAtual, user }: { onClose: () => void; onSaved: () => void; lojaAtual: string; user: any }) {
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState(LOJAS.includes(lojaAtual) ? lojaAtual : 'Amore CD')
  const [motivo, setMotivo] = useState('')
  const [prods, setProds] = useState<ProdOrig[]>([])
  const [loadingProds, setLoadingProds] = useState(false)
  const [itens, setItens] = useState<{ produto_origem_id: string; produto_nome: string; unidade: string; qtd: string; saldo: number; preco: number }[]>([])
  const [sel, setSel] = useState('')
  const [qtd, setQtd] = useState('')
  const [salvando, setSalvando] = useState(false)

  // carrega produtos da origem quando escolhida
  useEffect(() => {
    if (!origem) { setProds([]); return }
    setLoadingProds(true)
    sb.from('estoque_produtos').select('id, nome, gramatura, nivel_atual, preco_unitario, categoria')
      .eq('loja', origem).eq('ativo', true).order('nome')
      .then(({ data }: any) => { setProds((data as ProdOrig[]) || []); setLoadingProds(false) })
  }, [origem])

  const prodSel = prods.find(p => p.id === sel)
  const addItem = () => {
    if (!prodSel) { alert('Escolha um produto.'); return }
    const q = Number(String(qtd).replace(',', '.'))
    if (!(q > 0)) { alert('Informe a quantidade.'); return }
    if (q > prodSel.nivel_atual) { if (!confirm(`Quantidade (${q}) maior que o saldo da origem (${prodSel.nivel_atual}). Continuar mesmo assim?`)) return }
    if (itens.some(i => i.produto_origem_id === prodSel.id)) { alert('Produto já adicionado.'); return }
    setItens(o => [...o, { produto_origem_id: prodSel.id, produto_nome: prodSel.nome, unidade: prodSel.gramatura, qtd: String(q), saldo: prodSel.nivel_atual, preco: prodSel.preco_unitario }])
    setSel(''); setQtd('')
  }
  const removeItem = (id: string) => setItens(o => o.filter(i => i.produto_origem_id !== id))

  const salvar = async () => {
    if (!origem || !destino) { alert('Escolha as unidades de origem e destino.'); return }
    if (origem === destino) { alert('Origem e destino devem ser diferentes.'); return }
    if (itens.length === 0) { alert('Adicione ao menos um produto.'); return }
    setSalvando(true)
    try {
      const valor_total = itens.reduce((s, i) => s + Number(i.qtd) * (i.preco || 0), 0)
      const { data: tData, error } = await sb.from('transferencias').insert({
        unidade_origem: origem, unidade_destino: destino,
        solicitante_nome: user?.name || 'Painel', solicitante_id: null,
        motivo: motivo || null, status: 'solicitada',
        valor_total: Math.round(valor_total * 100) / 100, created_by: user?.name || 'Painel',
      }).select('id, numero').single()
      if (error) throw error
      const tid = tData.id
      const rows = itens.map(i => ({
        transferencia_id: tid, produto_origem_id: i.produto_origem_id, produto_nome: i.produto_nome,
        unidade: i.unidade, qtd_solicitada: Number(i.qtd), saldo_origem_no_pedido: i.saldo, preco_unitario: i.preco || 0,
      }))
      await sb.from('transferencia_itens').insert(rows)
      await sb.from('transferencia_timeline').insert({ transferencia_id: tid, evento: 'solicitada', descricao: `${itens.length} item(ns) · ${origem} → ${destino}`, quem: user?.name || 'Painel' })
      onSaved(); onClose()
    } catch (e: any) { alert('Falha ao salvar: ' + (e?.message || e)) }
    setSalvando(false)
  }

  return (
    <div className="ov open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="mhd"><b>🔄 Nova Transferência</b><button className="btn bo bsm" onClick={onClose}><X size={13} /></button></div>
        <div className="mbd">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="fg"><label className="fl">Unidade de origem *</label>
              <select className="sel" value={origem} onChange={e => { setOrigem(e.target.value); setItens([]) }}>
                <option value="">Selecione…</option>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Unidade de destino *</label>
              <select className="sel" value={destino} onChange={e => setDestino(e.target.value)}>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select>
            </div>
          </div>
          <div className="fg"><label className="fl">Motivo</label><input className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Necessidade operacional…" /></div>

          {/* Adicionar produto */}
          <div style={{ borderTop: '1px dashed var(--border)', marginTop: 8, paddingTop: 10 }}>
            <label className="fl">Produtos da origem {origem && `(${origem})`}</label>
            {!origem ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Escolha a unidade de origem para listar os produtos com saldo.</div>
            ) : loadingProds ? <Loader className="spin" size={14} /> : (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
                <div className="fg" style={{ margin: 0 }}>
                  <select className="sel" value={sel} onChange={e => setSel(e.target.value)}>
                    <option value="">Selecione o produto…</option>
                    {prods.map(p => <option key={p.id} value={p.id}>{p.nome} — saldo {fmtNum(p.nivel_atual)} {p.gramatura}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ margin: 0 }}>
                  <input className="inp" inputMode="decimal" placeholder={`Qtd${prodSel ? ' (' + prodSel.gramatura + ')' : ''}`} value={qtd} onChange={e => setQtd(e.target.value)} />
                </div>
                <button className="btn bp bsm" onClick={addItem}><Plus size={12} /> Add</button>
              </div>
            )}
            {prodSel && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Saldo disponível na origem: <b>{fmtNum(prodSel.nivel_atual)} {prodSel.gramatura}</b></div>}
          </div>

          {/* Itens adicionados */}
          {itens.length > 0 && (
            <div style={{ marginTop: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={{ padding: 6 }}>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Saldo origem</th><th></th></tr></thead>
                <tbody>{itens.map(i => (
                  <tr key={i.produto_origem_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 6 }}>{i.produto_nome}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNum(Number(i.qtd))} {i.unidade}</td>
                    <td style={{ textAlign: 'right', color: Number(i.qtd) > i.saldo ? '#DC2626' : 'var(--muted)' }}>{fmtNum(i.saldo)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn bo bsm" style={{ color: '#991B1B', padding: '2px 6px' }} onClick={() => removeItem(i.produto_origem_id)}><Trash2 size={11} /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
          <button className="btn bp bsm" onClick={salvar} disabled={salvando}>{salvando ? <Loader className="spin" size={13} /> : <Check size={13} />} Solicitar transferência</button>
        </div>
      </div>
    </div>
  )
}

// ── Detalhe / fluxo ──────────────────────────────────────────
function TransfDetalhe({ id, onVoltar, onChange, user, podeGerir }: { id: string; onVoltar: () => void; onChange: () => void; user: any; podeGerir: boolean }) {
  const [t, setT] = useState<Transf | null>(null)
  const [itens, setItens] = useState<TransfItem[]>([])
  const [timeline, setTimeline] = useState<TimelineEv[]>([])
  const [saldosDestino, setSaldosDestino] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [edits, setEdits] = useState<Record<string, string>>({}) // itemId → valor (qtd enviada/recebida em edição)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: td }, { data: itd }, { data: tld }] = await Promise.all([
      sb.from('transferencias').select('*').eq('id', id).single(),
      sb.from('transferencia_itens').select('*').eq('transferencia_id', id).order('created_at'),
      sb.from('transferencia_timeline').select('*').eq('transferencia_id', id).order('quando', { ascending: false }),
    ])
    setT(td as Transf); setItens((itd as TransfItem[]) || []); setTimeline((tld as TimelineEv[]) || [])
    if (td) {
      const { data: pd } = await sb.from('estoque_produtos').select('nome, nivel_atual').eq('loja', (td as Transf).unidade_destino).eq('ativo', true)
      const map: Record<string, number> = {}
      for (const p of (pd || [])) map[(p.nome || '').trim().toLowerCase()] = p.nivel_atual
      setSaldosDestino(map)
    }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  const registrarTimeline = async (evento: string, descricao: string, meta?: any) => {
    await sb.from('transferencia_timeline').insert({ transferencia_id: id, evento, descricao, quem: user?.name || 'Painel', meta: meta ?? null })
  }
  const patchT = async (patch: Partial<Transf>) => {
    await sb.from('transferencias').update({ ...patch, updated_at: nowISO() }).eq('id', id)
  }

  if (loading || !t) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader className="spin" /></div>
  const s = st(t.status)
  const somenteLeitura = ['recebida', 'reprovada', 'cancelada'].includes(t.status)

  // ── Ações do fluxo ─────────────────────────────────────────
  const aprovar = async () => {
    if (!confirm('Aprovar esta transferência?')) return
    setBusy(true)
    // qtd_aprovada = qtd_solicitada por padrão
    for (const it of itens) await sb.from('transferencia_itens').update({ qtd_aprovada: it.qtd_aprovada ?? it.qtd_solicitada }).eq('id', it.id)
    await patchT({ status: 'aprovada', aprovado_por: user?.name || 'Painel', aprovado_em: nowISO() })
    await registrarTimeline('aprovada', 'Transferência aprovada')
    setBusy(false); await load(); onChange()
  }
  const reprovar = async () => {
    const motivo = prompt('Motivo da reprovação:'); if (!motivo) return
    setBusy(true)
    await patchT({ status: 'reprovada', reprovado_motivo: motivo })
    await registrarTimeline('reprovada', motivo)
    setBusy(false); await load(); onChange()
  }
  const cancelar = async () => {
    if (!confirm('Cancelar esta transferência? (não movimenta estoque)')) return
    setBusy(true)
    await patchT({ status: 'cancelada' })
    await registrarTimeline('cancelada', 'Transferência cancelada')
    setBusy(false); await load(); onChange()
  }
  const separar = async () => {
    setBusy(true)
    await patchT({ status: 'separacao', separado_por: user?.name || 'Painel', separado_em: nowISO() })
    await registrarTimeline('separada', 'Separação confirmada na origem')
    setBusy(false); await load(); onChange()
  }
  // ENVIO → baixa no estoque da origem
  const enviar = async () => {
    // qtd enviada = edição ou qtd aprovada
    const envios = itens.map(it => ({ it, qtd: Number(edits[it.id] ?? String(it.qtd_aprovada ?? it.qtd_solicitada)) }))
    if (envios.some(e => !(e.qtd >= 0))) { alert('Quantidades inválidas.'); return }
    if (!confirm('Confirmar ENVIO? Isto dá baixa no estoque da unidade de origem.')) return
    setBusy(true)
    try {
      for (const { it, qtd } of envios) {
        if (qtd <= 0) { await sb.from('transferencia_itens').update({ qtd_enviada: 0 }).eq('id', it.id); continue }
        // baixa saldo na origem (trava: não deixa negativo)
        if (it.produto_origem_id) {
          const { data: pd } = await sb.from('estoque_produtos').select('nivel_atual').eq('id', it.produto_origem_id).single()
          const atual = Number(pd?.nivel_atual ?? 0)
          const novo = Math.max(0, atual - qtd)
          await sb.from('estoque_produtos').update({ nivel_atual: novo, updated_at: nowISO() }).eq('id', it.produto_origem_id)
        }
        await sb.from('estoque_movimentacoes').insert({
          loja: t.unidade_origem, produto_id: it.produto_origem_id, produto_nome: it.produto_nome,
          tipo: 'transferencia_saida', quantidade: qtd, unidade: it.unidade,
          motivo: `Transferência TR-${t.numero} → ${t.unidade_destino}`, created_by: user?.name || 'Painel',
        })
        await sb.from('transferencia_itens').update({ qtd_enviada: qtd }).eq('id', it.id)
      }
      await patchT({ status: 'enviada', enviado_por: user?.name || 'Painel', enviado_em: nowISO() })
      await registrarTimeline('enviada', 'Produtos enviados · baixa no estoque da origem')
      setEdits({})
      setBusy(false); await load(); onChange()
    } catch (e: any) { setBusy(false); alert('Falha no envio: ' + (e?.message || e)) }
  }
  // RECEBIMENTO → entrada no destino + divergência
  const receber = async () => {
    const receb = itens.map(it => ({ it, qtd: Number(edits[it.id] ?? String(it.qtd_enviada ?? 0)) }))
    if (receb.some(e => !(e.qtd >= 0))) { alert('Quantidades inválidas.'); return }
    if (!confirm('Confirmar RECEBIMENTO? Isto dá entrada no estoque da unidade de destino.')) return
    setBusy(true)
    try {
      let divergencia = false
      for (const { it, qtd } of receb) {
        if ((it.qtd_enviada ?? 0) !== qtd) divergencia = true
        if (qtd <= 0) { await sb.from('transferencia_itens').update({ qtd_recebida: 0 }).eq('id', it.id); continue }
        // casa produto no destino por nome; cria se não existir
        const { data: pd } = await sb.from('estoque_produtos').select('id, nivel_atual, preco_unitario')
          .ilike('nome', it.produto_nome.trim()).eq('loja', t.unidade_destino).eq('ativo', true).maybeSingle()
        if (pd) {
          const atual = Number(pd.nivel_atual ?? 0)
          const precoAtual = Number(pd.preco_unitario ?? it.preco_unitario)
          const novo = atual + qtd
          const cmp = novo > 0 ? (atual * precoAtual + qtd * (it.preco_unitario || precoAtual)) / novo : precoAtual
          await sb.from('estoque_produtos').update({ nivel_atual: novo, preco_unitario: Math.round(cmp * 100) / 100, updated_at: nowISO() }).eq('id', pd.id)
          await sb.from('transferencia_itens').update({ qtd_recebida: qtd, produto_destino_id: pd.id }).eq('id', it.id)
        } else {
          const { data: novoP } = await sb.from('estoque_produtos').insert({
            loja: t.unidade_destino, nome: it.produto_nome, gramatura: it.unidade || 'un',
            categoria: 'Transferência', nivel_atual: qtd, preco_unitario: it.preco_unitario || 0, ativo: true,
          }).select('id').single()
          await sb.from('transferencia_itens').update({ qtd_recebida: qtd, produto_destino_id: novoP?.id ?? null }).eq('id', it.id)
        }
        await sb.from('estoque_movimentacoes').insert({
          loja: t.unidade_destino, produto_id: null, produto_nome: it.produto_nome,
          tipo: 'transferencia_entrada', quantidade: qtd, unidade: it.unidade,
          motivo: `Transferência TR-${t.numero} ← ${t.unidade_origem}`, created_by: user?.name || 'Painel',
        })
      }
      await patchT({ status: 'recebida', recebido_por: user?.name || 'Painel', recebido_em: nowISO(), tem_divergencia: divergencia })
      await registrarTimeline('recebida', divergencia ? 'Recebido COM divergência (enviado ≠ recebido)' : 'Recebido conforme enviado', { divergencia })
      if (divergencia) await registrarTimeline('divergencia', 'Divergência entre enviado e recebido — verificar', {})
      setEdits({})
      setBusy(false); await load(); onChange()
    } catch (e: any) { setBusy(false); alert('Falha no recebimento: ' + (e?.message || e)) }
  }

  // colunas visíveis por fase
  const mostrarEnvio = t.status === 'separacao'
  const mostrarReceb = t.status === 'enviada'

  return (
    <div>
      <button className="btn bo bsm" onClick={onVoltar} style={{ marginBottom: 12 }}><ChevronLeft size={12} /> Voltar</button>

      {/* Cabeçalho */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: 'var(--bordo)', fontSize: 16 }}>TR-{t.numero}</span>
          <span className="badge" style={{ background: s.bg, color: s.cor, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
          {t.tem_divergencia && <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> Divergência</span>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {t.unidade_origem} <ArrowLeftRight size={15} style={{ color: 'var(--muted)' }} /> {t.unidade_destino}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
          Solicitante: <b>{t.solicitante_nome}</b> · {fmtDataH(t.created_at)}{t.motivo ? ` · Motivo: ${t.motivo}` : ''}
        </div>
        {t.reprovado_motivo && <div style={{ fontSize: 12, color: '#991B1B', background: '#FEE2E2', padding: '6px 10px', borderRadius: 6, marginTop: 8 }}>❌ Reprovada: {t.reprovado_motivo}</div>}
      </div>

      {/* Itens */}
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>📦 Itens da transferência</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: 6 }}>Produto</th>
              <th style={{ textAlign: 'right' }}>Solicitado</th>
              <th style={{ textAlign: 'right' }}>Saldo origem*</th>
              <th style={{ textAlign: 'right' }}>Saldo destino</th>
              {(t.status !== 'solicitada' && t.status !== 'em_analise') && <th style={{ textAlign: 'right' }}>Enviado</th>}
              {(t.status === 'recebida') && <th style={{ textAlign: 'right' }}>Recebido</th>}
              {(mostrarEnvio || mostrarReceb) && <th style={{ textAlign: 'right' }}>{mostrarEnvio ? 'Enviar' : 'Receber'}</th>}
            </tr></thead>
            <tbody>{itens.map(it => {
              const saldoDest = saldosDestino[(it.produto_nome || '').trim().toLowerCase()]
              const div = t.status === 'recebida' && (it.qtd_enviada ?? 0) !== (it.qtd_recebida ?? 0)
              return (
                <tr key={it.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6 }}>{it.produto_nome}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNum(it.qtd_solicitada)} {it.unidade}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmtNum(it.saldo_origem_no_pedido)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{saldoDest != null ? fmtNum(saldoDest) : '—'}</td>
                  {(t.status !== 'solicitada' && t.status !== 'em_analise') && <td style={{ textAlign: 'right' }}>{fmtNum(it.qtd_enviada)}</td>}
                  {(t.status === 'recebida') && <td style={{ textAlign: 'right', color: div ? '#DC2626' : '#166534', fontWeight: 700 }}>{fmtNum(it.qtd_recebida)}{div ? ' ⚠' : ''}</td>}
                  {(mostrarEnvio || mostrarReceb) && (
                    <td style={{ textAlign: 'right' }}>
                      <input className="inp" inputMode="decimal" style={{ width: 90, textAlign: 'right', padding: '4px 8px' }}
                        value={edits[it.id] ?? String(mostrarEnvio ? (it.qtd_aprovada ?? it.qtd_solicitada) : (it.qtd_enviada ?? 0))}
                        onChange={e => setEdits(o => ({ ...o, [it.id]: e.target.value }))} />
                    </td>
                  )}
                </tr>
              )
            })}</tbody>
          </table>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>* Saldo da origem registrado no momento da solicitação.</div>

        {/* Ações do fluxo */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
          {busy && <Loader className="spin" size={16} />}
          {!busy && (t.status === 'solicitada' || t.status === 'em_analise') && podeGerir && (
            <>
              <button className="btn bp bsm" onClick={aprovar}><Check size={12} /> Aprovar</button>
              <button className="btn bo bsm" onClick={reprovar} style={{ color: '#991B1B' }}><X size={12} /> Reprovar</button>
            </>
          )}
          {!busy && t.status === 'aprovada' && (
            <button className="btn bp bsm" onClick={separar}><PackageCheck size={12} /> Confirmar separação</button>
          )}
          {!busy && mostrarEnvio && (
            <button className="btn bp bsm" onClick={enviar}><Send size={12} /> Confirmar envio (baixa na origem)</button>
          )}
          {!busy && mostrarReceb && (
            <button className="btn bp bsm" onClick={receber}><ClipboardCheck size={12} /> Confirmar recebimento (entrada no destino)</button>
          )}
          {!busy && !somenteLeitura && t.status !== 'enviada' && (
            <button className="btn bo bsm" onClick={cancelar} style={{ marginLeft: 'auto', color: '#991B1B' }}><Trash2 size={12} /> Cancelar</button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🕒 Histórico / auditoria</div>
        {timeline.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem eventos.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.map(ev => (
              <div key={ev.id} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                <div style={{ minWidth: 120, color: 'var(--muted)' }}>{fmtDataH(ev.quando)}</div>
                <div><b>{st(ev.evento).label.replace(/^[^ ]+ /, '') || ev.evento}</b>{ev.quem ? ` · ${ev.quem}` : ''}{ev.descricao ? <span style={{ color: 'var(--muted)' }}> — {ev.descricao}</span> : ''}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
