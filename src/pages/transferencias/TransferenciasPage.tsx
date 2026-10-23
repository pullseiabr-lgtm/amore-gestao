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
  tipo: string
  valor_produtos: number
  custo_logistico: number
  financeiro_status: string | null
  quitado_por: string | null
  quitado_em: string | null
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
  custo_compra_unit: number
  custo_fonte: string | null
  ultima_compra_data: string | null
  fornecedor: string | null
  nota_fiscal: string | null
  logistica_rateada: number
  custo_unit_final: number
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
const r2 = (v: number) => Math.round(v * 100) / 100
const num = (v: any) => Number(String(v ?? '').replace(',', '.')) || 0
const isVenda = (t: { tipo?: string }) => t.tipo === 'venda'
const tipoLabel = (t: { tipo?: string }) => isVenda(t) ? '💰 Venda interna' : '🔄 Transferência'
const FONTE: Record<string, string> = { prestacao_contas: 'Prestação de contas', cadastro_estoque: 'Entrada/cadastro de estoque', manual: 'Informado manualmente' }

// Último custo de compra: prestação de contas (caixa_itens da loja, mesma unidade) → fallback preço do cadastro de estoque
interface CustoInfo { custo: number; fonte: string; data: string | null; fornecedor: string | null; nf: string | null }
async function buscarUltimoCusto(loja: string, nome: string, unidade: string, precoCadastro: number, fornCadastro: string | null): Promise<CustoInfo | null> {
  const un = (unidade || '').trim().toLowerCase()
  try {
    const { data } = await sb.from('caixa_itens')
      .select('descricao, quantidade, unidade, valor, data, fornecedor, documento, caixas!inner(loja, data_ref)')
      .eq('caixas.loja', loja).ilike('descricao', nome.trim().replace(/[%_]/g, ' ')).gt('quantidade', 0).gt('valor', 0).limit(30)
    const rows = ((data as any[]) || [])
      .filter(r => (r.unidade || '').trim().toLowerCase() === un)
      .map(r => ({ ...r, dt: r.data || r.caixas?.data_ref || '' }))
      .sort((a, b) => String(b.dt).localeCompare(String(a.dt)))
    if (rows[0]) {
      const r = rows[0]
      return { custo: r2(Number(r.valor) / Number(r.quantidade)), fonte: 'prestacao_contas', data: r.dt || null, fornecedor: r.fornecedor || null, nf: r.documento || null }
    }
  } catch { /* cai no fallback */ }
  if (precoCadastro > 0) return { custo: precoCadastro, fonte: 'cadastro_estoque', data: null, fornecedor: fornCadastro, nf: null }
  return null
}
// Rateio proporcional ao valor de cada item (ou à quantidade, se não houver valor); o último item absorve o arredondamento
function ratear(itens: { qtd: number; custo: number }[], logistica: number): number[] {
  const base = itens.map(i => i.qtd * i.custo)
  let pesos = base
  let tot = base.reduce((a, b) => a + b, 0)
  if (!(tot > 0)) { pesos = itens.map(i => i.qtd); tot = pesos.reduce((a, b) => a + b, 0) }
  if (!(tot > 0) || !(logistica > 0)) return itens.map(() => 0)
  let acum = 0
  return itens.map((_, k) => {
    if (k === itens.length - 1) return r2(logistica - acum)
    const v = r2(logistica * pesos[k] / tot); acum += v; return v
  })
}

// ── WhatsApp: aprovadores + link do relatório (mesmo padrão de Caixas/Créditos) ──
async function getAprovadores(): Promise<{ nome: string; fone: string }[]> {
  try {
    const { data } = await sb.from('app_config').select('valor').eq('chave', 'credito_aprovadores').maybeSingle()
    const lista = data?.valor?.lista
    if (Array.isArray(lista) && lista.length) return lista
  } catch { /* usa fallback */ }
  return [{ nome: 'Wagner', fone: '5581994135602' }, { nome: 'Aline', fone: '5581994573420' }]
}
const linkTransf = (id: string) => `https://painel.amorefood.com.br/transferencia.html?id=${id}`
function msgTransf(t: { numero: number; tipo: string; unidade_origem: string; unidade_destino: string; valor_total: number; solicitante_nome: string; motivo: string | null; status: string; id: string }, nItens: number, pedirAprovacao: boolean) {
  const venda = t.tipo === 'venda'
  return `${venda ? '💰 *Venda entre lojas*' : '🔄 *Transferência entre unidades*'} — TR-${t.numero}\n${t.unidade_origem} ➜ ${t.unidade_destino}\n📦 ${nItens} item(ns) · Total: ${fmtR$(t.valor_total)}\n👤 Solicitante: ${t.solicitante_nome}${t.motivo ? `\n📝 Motivo: ${t.motivo}` : ''}\n📌 Status: ${st(t.status).label.replace(/^[^ ]+ /, '')}\n\n${pedirAprovacao ? '👉 Abrir o relatório e *aprovar / reprovar*:' : '📄 Relatório completo:'}\n${linkTransf(t.id)}`
}
async function enviarWhats(destinos: { nome: string; fone: string }[], message: string): Promise<number> {
  let ok = 0
  for (const d of destinos) {
    try {
      const r = await fetch('/api/evolution-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: d.fone, message }) })
      if (r.ok) ok++
    } catch { /* segue */ }
  }
  return ok
}

// Contatos para envio: aprovadores + equipe com WhatsApp no perfil
async function getContatos(): Promise<{ nome: string; fone: string; grupo: string }[]> {
  const out: { nome: string; fone: string; grupo: string }[] = []
  const vistos = new Set<string>()
  const add = (nome: string, fone: string, grupo: string) => {
    let f = String(fone || '').replace(/\D/g, ''); if (f.length < 10) return
    if (!f.startsWith('55')) f = '55' + f
    if (vistos.has(f)) return; vistos.add(f); out.push({ nome, fone: f, grupo })
  }
  for (const a of await getAprovadores()) add(a.nome, a.fone, 'Aprovadores')
  try {
    const { data } = await sb.from('profiles').select('name, permissions_override')
    for (const p of (data as any[]) || []) add(p.name || 'Colaborador', p.permissions_override?.__perfil__?.whatsapp, 'Equipe')
  } catch { /* só aprovadores */ }
  return out
}
function msgCompleta(t: Transf, itens: TransfItem[], pedirAprovacao: boolean) {
  const linhas = itens.map(i => `• ${i.produto_nome} — ${fmtNum(i.qtd_enviada ?? i.qtd_solicitada)} ${i.unidade} × ${fmtR$(i.custo_compra_unit > 0 ? i.custo_compra_unit : i.preco_unitario)}`).join('\n')
  const base = msgTransf(t, itens.length, pedirAprovacao)
  const [cab, ...resto] = base.split('\n\n')
  return `${cab}\n\n${linhas}\n💵 Produtos: ${fmtR$(t.valor_produtos)} · Logística: ${fmtR$(t.custo_logistico)}\n\n${resto.join('\n\n')}`
}

// Modal: enviar informações da transferência por WhatsApp (escolhe destinatários, edita a mensagem)
function EnviarWhatsModal({ t, itens, user, onClose, onSent }: { t: Transf; itens: TransfItem[]; user: any; onClose: () => void; onSent: () => void }) {
  const [contatos, setContatos] = useState<{ nome: string; fone: string; grupo: string }[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [msg, setMsg] = useState(() => msgCompleta(t, itens, ['solicitada', 'em_analise'].includes(t.status)))
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { getContatos().then(c => { setContatos(c); setSel(new Set(c.filter(x => x.grupo === 'Aprovadores').map(x => x.fone))) }) }, [])
  const toggle = (f: string) => setSel(s => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n })

  const enviar = async () => {
    const destinos = contatos.filter(c => sel.has(c.fone)).map(c => ({ nome: c.nome, fone: c.fone }))
    for (const n of extra.split(/[,;\n]/)) { const f = n.replace(/\D/g, ''); if (f.length >= 10) destinos.push({ nome: f, fone: f.startsWith('55') ? f : '55' + f }) }
    if (destinos.length === 0) { alert('Escolha ao menos um destinatário.'); return }
    if (!msg.trim()) { alert('A mensagem está vazia.'); return }
    setEnviando(true)
    let ok = 0
    for (let k = 0; k < destinos.length; k++) {
      if (k > 0) await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000)) // intervalo variável (anti-bloqueio)
      ok += await enviarWhats([destinos[k]], msg)
    }
    await sb.from('transferencia_timeline').insert({ transferencia_id: t.id, evento: 'whatsapp', descricao: ok > 0 ? `Informações enviadas por WhatsApp a ${destinos.map(d => d.nome).join(', ')} (${ok}/${destinos.length})` : 'Falha no envio por WhatsApp', quem: `${user?.name || 'Painel'}${user?.email ? ' · ' + user.email : ''}` })
    setEnviando(false)
    alert(ok > 0 ? `✅ Enviado a ${ok} de ${destinos.length} destinatário(s).` : '⚠ Falha no envio (VPS/Evolution).')
    if (ok > 0) { onSent(); onClose() }
  }

  const grupos = Array.from(new Set(contatos.map(c => c.grupo)))
  return (
    <div className="ov open" onClick={enviando ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="mhd"><b>📲 Enviar TR-{t.numero} por WhatsApp</b><button className="btn bo bsm" onClick={onClose} disabled={enviando}><X size={13} /></button></div>
        <div className="mbd">
          <label className="fl">Destinatários</label>
          {contatos.length === 0 ? <Loader className="spin" size={14} /> : grupos.map(g => (
            <div key={g} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{g}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                {contatos.filter(c => c.grupo === g).map(c => (
                  <label key={c.fone} style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center', padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 99, cursor: 'pointer', background: sel.has(c.fone) ? '#DCFCE7' : 'transparent' }}>
                    <input type="checkbox" checked={sel.has(c.fone)} onChange={() => toggle(c.fone)} /> {c.nome}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="fg" style={{ marginTop: 8 }}><label className="fl">Outros números (com DDD, separados por vírgula)</label>
            <input className="inp" placeholder="81999999999, 81988888888" value={extra} onChange={e => setExtra(e.target.value)} /></div>
          <div className="fg"><label className="fl">Mensagem (pode editar)</label>
            <textarea className="inp" rows={11} value={msg} onChange={e => setMsg(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 12.5 }} /></div>
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose} disabled={enviando}>Cancelar</button>
          <button className="btn bp bsm" onClick={enviar} disabled={enviando}>{enviando ? <Loader className="spin" size={13} /> : <Send size={13} />} Enviar</button>
        </div>
      </div>
    </div>
  )
}

// ── Página ───────────────────────────────────────────────────
export default function TransferenciasPage() {
  const { loja } = useLoja()
  const { user, can } = useAuth()
  const podeGerir = can('estoque', 'create') || user?.role === 'admin' || user?.role === 'super_admin'

  const [tab, setTab] = useState<'pendentes' | 'transito' | 'historico' | 'dashboard' | 'relatorios'>('pendentes')
  const [novoTipo, setNovoTipo] = useState<'transferencia' | 'venda'>('transferencia')
  const [fTipo, setFTipo] = useState('')
  const [transfs, setTransfs] = useState<Transf[]>([])
  const [loading, setLoading] = useState(true)
  const [novoOpen, setNovoOpen] = useState(false)
  const [zap, setZap] = useState<{ t: Transf; itens: TransfItem[] } | null>(null)
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
    if (fTipo && (t.tipo || 'transferencia') !== fTipo) return false
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
      aReceber: transfs.filter(t => isVenda(t) && t.status === 'recebida' && t.financeiro_status === 'a_receber').reduce((s, t) => s + (t.valor_total || 0), 0),
      logisticaMes: doMes.filter(t => t.status === 'recebida').reduce((s, t) => s + (t.custo_logistico || 0), 0),
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
          <button className={`btn ${tab === 'relatorios' ? 'bp' : 'bo'} bsm`} onClick={() => setTab('relatorios')}>📊 Relatórios</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn bo bsm" onClick={load} title="Atualizar"><RefreshCw size={13} /></button>
          <button className="btn bo bsm" onClick={() => { setNovoTipo('venda'); setNovoOpen(true) }}><Plus size={13} /> Nova Venda entre Lojas</button>
          <button className="btn bp bsm" onClick={() => { setNovoTipo('transferencia'); setNovoOpen(true) }}><Plus size={13} /> Nova Transferência</button>
        </div>
      </div>

      {tab === 'relatorios' ? (
        <RelatoriosTransf transfs={transfs} onAbrir={setSelId} />
      ) : tab === 'dashboard' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          <Kpi titulo="⏳ Pendentes de aprovação" valor={String(kpi.pendAprov)} />
          <Kpi titulo="🚚 Em trânsito" valor={String(kpi.transito)} />
          <Kpi titulo="✅ Recebidas" valor={String(kpi.recebidas)} />
          <Kpi titulo="⚠️ Com divergência" valor={String(kpi.divergencia)} destaque={kpi.divergencia > 0} />
          <Kpi titulo="🔄 Transferências no mês" valor={String(kpi.qtdMes)} />
          <Kpi titulo="💰 Valor movimentado (mês)" valor={fmtR$(kpi.valorMes)} />
          <Kpi titulo="🧾 Vendas internas a receber" valor={fmtR$(kpi.aReceber)} destaque={kpi.aReceber > 0} />
          <Kpi titulo="🚛 Logística (mês, concluídas)" valor={fmtR$(kpi.logisticaMes)} />
        </div>
      ) : (
        <>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <select className="sel" value={fUnidade} onChange={e => setFUnidade(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">Todas as unidades</option>
              {LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select className="sel" value={fTipo} onChange={e => setFTipo(e.target.value)} style={{ maxWidth: 190 }}>
              <option value="">Vendas e transferências</option>
              <option value="venda">💰 Só vendas internas</option>
              <option value="transferencia">🔄 Só transferências</option>
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
              {listaAtual.map(t => <TransfCard key={t.id} t={t} onAbrir={() => setSelId(t.id)} onZap={async () => {
                const { data } = await sb.from('transferencia_itens').select('*').eq('transferencia_id', t.id).order('created_at')
                setZap({ t, itens: (data as TransfItem[]) || [] })
              }} />)}
            </div>
          )}
        </>
      )}

      {zap && <EnviarWhatsModal t={zap.t} itens={zap.itens} user={user} onClose={() => setZap(null)} onSent={load} />}
      {novoOpen && <NovaTransf onClose={() => setNovoOpen(false)} onSaved={load} lojaAtual={loja} user={user} tipoInicial={novoTipo} />}
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
function TransfCard({ t, onAbrir, onZap }: { t: Transf; onAbrir: () => void; onZap: () => void }) {
  const s = st(t.status)
  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }} onClick={onAbrir}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontWeight: 800, color: 'var(--bordo)' }}>TR-{t.numero}</span>
        <span className="badge" style={{ background: s.bg, color: s.cor, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{s.label}</span>
        {isVenda(t) && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 7px', borderRadius: 99 }}>💰 Venda</span>}
        {t.tem_divergencia && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#DC2626', fontWeight: 700 }}><AlertTriangle size={11} style={{ verticalAlign: -1 }} /> Divergência</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        {t.unidade_origem} <ArrowLeftRight size={13} style={{ color: 'var(--muted)' }} /> {t.unidade_destino}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Solicitante: {t.solicitante_nome}</div>
      {t.motivo && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Motivo: {t.motivo}</div>}
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>Criada em {fmtDataH(t.created_at)}{t.valor_total > 0 ? ` · ${fmtR$(t.valor_total)}` : ''}</div>
      <button className="btn bo bsm" style={{ alignSelf: 'flex-start' }} onClick={e => { e.stopPropagation(); onZap() }}>📲 Enviar por WhatsApp</button>
    </div>
  )
}

// ── Modal: nova transferência / venda interna ────────────────
interface ProdOrig { id: string; nome: string; gramatura: string; nivel_atual: number; preco_unitario: number; categoria: string; fornecedor_nome: string | null }
// produto_origem_id nulo = item digitado manualmente (sem cadastro/saldo na origem); key identifica a linha na lista
interface ItemNovo { key: string; produto_origem_id: string | null; produto_nome: string; unidade: string; qtd: string; saldo: number | null; custo: CustoInfo }
function NovaTransf({ onClose, onSaved, lojaAtual, user, tipoInicial }: { onClose: () => void; onSaved: () => void; lojaAtual: string; user: any; tipoInicial: 'transferencia' | 'venda' }) {
  const [tipo, setTipo] = useState<'transferencia' | 'venda'>(tipoInicial)
  const [origem, setOrigem] = useState('')
  const [destino, setDestino] = useState(LOJAS.includes(lojaAtual) ? lojaAtual : 'Amore CD')
  const [motivo, setMotivo] = useState('')
  const [logistica, setLogistica] = useState('')
  const [prods, setProds] = useState<ProdOrig[]>([])
  const [loadingProds, setLoadingProds] = useState(false)
  const [itens, setItens] = useState<ItemNovo[]>([])
  const [sel, setSel] = useState('')
  const [busca, setBusca] = useState('')
  const [qtd, setQtd] = useState('')
  const [custoSel, setCustoSel] = useState<CustoInfo | null | 'carregando'>(null)
  const [salvando, setSalvando] = useState(false)
  const [modo, setModo] = useState<'estoque' | 'manual'>('estoque')
  const [mNome, setMNome] = useState('')
  const [mUn, setMUn] = useState('un')
  const [mCusto, setMCusto] = useState('')

  useEffect(() => {
    if (!origem) { setProds([]); return }
    setLoadingProds(true)
    sb.from('estoque_produtos').select('id, nome, gramatura, nivel_atual, preco_unitario, categoria, fornecedor_nome')
      .eq('loja', origem).eq('ativo', true).gt('nivel_atual', 0).order('nome')
      .then(({ data }: any) => { setProds((data as ProdOrig[]) || []); setLoadingProds(false) })
  }, [origem])

  const prodSel = prods.find(p => p.id === sel)
  // ao escolher o produto, busca o último custo de compra automaticamente
  useEffect(() => {
    if (!prodSel) { setCustoSel(null); return }
    let vivo = true
    setCustoSel('carregando')
    buscarUltimoCusto(origem, prodSel.nome, prodSel.gramatura, Number(prodSel.preco_unitario) || 0, prodSel.fornecedor_nome)
      .then(c => { if (vivo) setCustoSel(c) })
    return () => { vivo = false }
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const prodsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? prods.filter(p => p.nome.toLowerCase().includes(q)) : prods
  }, [prods, busca])

  const addItem = () => {
    if (!prodSel) { alert('Escolha um produto.'); return }
    const q = num(qtd)
    if (!(q > 0)) { alert('Informe a quantidade.'); return }
    if (q > prodSel.nivel_atual) { alert(`Quantidade (${fmtNum(q)}) maior que o saldo disponível (${fmtNum(prodSel.nivel_atual)} ${prodSel.gramatura}).`); return }
    if (!custoSel || custoSel === 'carregando') {
      alert('Este produto não tem compra válida registrada (prestação de contas ou cadastro de estoque com preço). Regularize o cadastro antes de movimentar.'); return
    }
    if (itens.some(i => i.key === prodSel.id)) { alert('Produto já adicionado.'); return }
    setItens(o => [...o, { key: prodSel.id, produto_origem_id: prodSel.id, produto_nome: prodSel.nome, unidade: prodSel.gramatura, qtd: String(q), saldo: prodSel.nivel_atual, custo: custoSel }])
    setSel(''); setQtd('')
  }
  const addManual = () => {
    const nome = mNome.trim()
    if (!nome) { alert('Informe o nome do produto.'); return }
    const un = mUn.trim() || 'un'
    const q = num(qtd)
    if (!(q > 0)) { alert('Informe a quantidade.'); return }
    const c = num(mCusto)
    if (!(c > 0)) { alert('Informe o custo unitário (R$) do produto.'); return }
    const key = 'manual:' + nome.toLowerCase() + '|' + un.toLowerCase()
    if (itens.some(i => i.key === key)) { alert('Produto já adicionado.'); return }
    setItens(o => [...o, { key, produto_origem_id: null, produto_nome: nome, unidade: un, qtd: String(q), saldo: null, custo: { custo: r2(c), fonte: 'manual', data: null, fornecedor: null, nf: null } }])
    setMNome(''); setQtd(''); setMCusto('')
  }
  const removeItem = (key: string) => setItens(o => o.filter(i => i.key !== key))

  const log = num(logistica)
  const rateio = useMemo(() => ratear(itens.map(i => ({ qtd: num(i.qtd), custo: i.custo.custo })), log), [itens, log])
  const valorProdutos = r2(itens.reduce((s, i) => s + num(i.qtd) * i.custo.custo, 0))
  const total = r2(valorProdutos + log)

  const salvar = async () => {
    if (!origem || !destino) { alert('Escolha as unidades de origem e destino.'); return }
    if (origem === destino) { alert('Origem e destino devem ser diferentes.'); return }
    if (itens.length === 0) { alert('Adicione ao menos um produto.'); return }
    if (log < 0) { alert('Custo logístico inválido.'); return }
    if (itens.some(i => i.saldo != null && num(i.qtd) > i.saldo)) { alert('Há item acima do saldo disponível.'); return }
    setSalvando(true)
    try {
      const { data: tData, error } = await sb.from('transferencias').insert({
        unidade_origem: origem, unidade_destino: destino, tipo,
        solicitante_nome: user?.name || 'Painel', solicitante_id: null,
        motivo: motivo || null, status: 'solicitada',
        valor_produtos: valorProdutos, custo_logistico: log, valor_total: total,
        created_by: user?.name || 'Painel',
      }).select('id, numero').single()
      if (error) throw error
      const tid = tData.id
      const rows = itens.map((i, k) => {
        const q = num(i.qtd)
        return {
          transferencia_id: tid, produto_origem_id: i.produto_origem_id, produto_nome: i.produto_nome,
          unidade: i.unidade, qtd_solicitada: q, saldo_origem_no_pedido: i.saldo, preco_unitario: i.custo.custo,
          custo_compra_unit: i.custo.custo, custo_fonte: i.custo.fonte, ultima_compra_data: i.custo.data,
          fornecedor: i.custo.fornecedor, nota_fiscal: i.custo.nf,
          logistica_rateada: rateio[k], custo_unit_final: r2(i.custo.custo + (q > 0 ? rateio[k] / q : 0)),
        }
      })
      const { error: e2 } = await sb.from('transferencia_itens').insert(rows)
      if (e2) throw e2
      await sb.from('transferencia_timeline').insert({ transferencia_id: tid, evento: 'solicitada', descricao: `${tipoLabel({ tipo })} · ${itens.length} item(ns) · ${origem} → ${destino} · total ${fmtR$(total)}`, quem: user?.name || 'Painel' })
      // pede autorização: manda o relatório (link) por WhatsApp para os aprovadores
      const aprovadores = await getAprovadores()
      const ok = await enviarWhats(aprovadores, msgTransf({ id: tid, numero: tData.numero, tipo, unidade_origem: origem, unidade_destino: destino, valor_total: total, solicitante_nome: user?.name || 'Painel', motivo: motivo || null, status: 'solicitada' }, itens.length, true))
      await sb.from('transferencia_timeline').insert({ transferencia_id: tid, evento: 'whatsapp', descricao: ok > 0 ? `Relatório enviado por WhatsApp a ${aprovadores.map(a => a.nome).join(', ')} para autorização` : 'Falha no envio por WhatsApp aos aprovadores', quem: user?.name || 'Painel' })
      if (ok === 0) alert('⚠ Solicitação salva, mas o aviso no WhatsApp falhou. Abra a transferência e use "Enviar por WhatsApp".')
      onSaved(); onClose()
    } catch (e: any) { alert('Falha ao salvar: ' + (e?.message || e)) }
    setSalvando(false)
  }

  return (
    <div className="ov open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="mhd"><b>{tipo === 'venda' ? '💰 Nova Venda entre Lojas' : '🔄 Nova Transferência'}</b><button className="btn bo bsm" onClick={onClose}><X size={13} /></button></div>
        <div className="mbd">
          <div className="fg"><label className="fl">Tipo de operação</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className={`btn ${tipo === 'venda' ? 'bp' : 'bo'} bsm`} onClick={() => setTipo('venda')}>💰 Venda de produtos para outra loja</button>
              <button className={`btn ${tipo === 'transferencia' ? 'bp' : 'bo'} bsm`} onClick={() => setTipo('transferencia')}>🔄 Transferência sem venda</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              {tipo === 'venda' ? 'Vendida pelo custo da última compra, sem margem; gera valor a pagar/receber entre as lojas.' : 'Apenas move o estoque; não gera venda nem receita de mercadoria.'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            <div className="fg"><label className="fl">Loja de origem *</label>
              <select className="sel" value={origem} onChange={e => { setOrigem(e.target.value); setItens([]); setSel('') }}>
                <option value="">Selecione…</option>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Loja de destino *</label>
              <select className="sel" value={destino} onChange={e => setDestino(e.target.value)}>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select>
            </div>
          </div>
          <div className="fg"><label className="fl">Observações / motivo</label><input className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Necessidade operacional…" /></div>

          <div style={{ borderTop: '1px dashed var(--border)', marginTop: 8, paddingTop: 10 }}>
            <label className="fl">Produtos</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <button className={`btn ${modo === 'estoque' ? 'bp' : 'bo'} bsm`} onClick={() => setModo('estoque')}>📦 Do estoque {origem ? `de ${origem}` : 'da loja'}</button>
              <button className={`btn ${modo === 'manual' ? 'bp' : 'bo'} bsm`} onClick={() => setModo('manual')}>✍️ Inserir manualmente</button>
            </div>
            {modo === 'manual' ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, alignItems: 'end' }}>
                  <div className="fg" style={{ margin: 0, gridColumn: 'span 2' }}><label className="fl">Produto *</label>
                    <input className="inp" placeholder="Nome do produto" value={mNome} onChange={e => setMNome(e.target.value)} /></div>
                  <div className="fg" style={{ margin: 0 }}><label className="fl">Unidade</label>
                    <input className="inp" placeholder="un, kg, cx…" value={mUn} onChange={e => setMUn(e.target.value)} /></div>
                  <div className="fg" style={{ margin: 0 }}><label className="fl">Qtd *</label>
                    <input className="inp" inputMode="decimal" placeholder="0" value={qtd} onChange={e => setQtd(e.target.value)} /></div>
                  <div className="fg" style={{ margin: 0 }}><label className="fl">Custo unit. (R$) *</label>
                    <input className="inp" inputMode="decimal" placeholder="0,00" value={mCusto} onChange={e => setMCusto(e.target.value)} /></div>
                  <button className="btn bp bsm" onClick={addManual}><Plus size={12} /> Adicionar</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Item fora do estoque da origem: ao enviar, o sistema dá entrada manual no estoque da origem e em seguida registra a saída; ao receber, entra no destino.</div>
              </>
            ) : !origem ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Escolha a loja de origem para listar os produtos disponíveis.</div>
            ) : loadingProds ? <Loader className="spin" size={14} /> : (
              <>
                <input className="inp" placeholder="Filtrar produto…" value={busca} onChange={e => setBusca(e.target.value)} style={{ marginBottom: 6 }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, alignItems: 'end' }}>
                  <div className="fg" style={{ margin: 0, gridColumn: 'span 2' }}>
                    <select className="sel" value={sel} onChange={e => setSel(e.target.value)}>
                      <option value="">Selecione o produto…</option>
                      {prodsFiltrados.map(p => <option key={p.id} value={p.id}>{p.nome} — saldo {fmtNum(p.nivel_atual)} {p.gramatura}</option>)}
                    </select>
                    {prodsFiltrados.length === 0 && (
                      <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 4 }}>
                        {prods.length === 0 ? `Nenhum produto com saldo em ${origem}.` : 'Nenhum produto encontrado nesse filtro.'}{' '}
                        <a href="#" onClick={e => { e.preventDefault(); setMNome(busca.trim()); setModo('manual') }} style={{ fontWeight: 700 }}>Inserir manualmente</a>
                      </div>
                    )}
                  </div>
                  <div className="fg" style={{ margin: 0 }}>
                    <input className="inp" inputMode="decimal" placeholder={`Qtd${prodSel ? ' (' + prodSel.gramatura + ')' : ''}`} value={qtd} onChange={e => setQtd(e.target.value)} />
                  </div>
                  <button className="btn bp bsm" onClick={addItem}><Plus size={12} /> Adicionar</button>
                </div>
              </>
            )}
            {prodSel && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.6 }}>
                Saldo disponível: <b>{fmtNum(prodSel.nivel_atual)} {prodSel.gramatura}</b>
                {custoSel === 'carregando' ? ' · buscando última compra…'
                  : custoSel ? <> · Último custo: <b>{fmtR$(custoSel.custo)}/{prodSel.gramatura}</b> ({FONTE[custoSel.fonte]}{custoSel.data ? ' · ' + new Date(custoSel.data + 'T12:00:00').toLocaleDateString('pt-BR') : ''}{custoSel.fornecedor ? ' · ' + custoSel.fornecedor : ''}{custoSel.nf ? ' · NF/doc ' + custoSel.nf : ''})</>
                  : <span style={{ color: '#DC2626', fontWeight: 700 }}> · ⛔ Sem compra válida registrada — regularize o cadastro para movimentar.</span>}
              </div>
            )}
          </div>

          {itens.length > 0 && (
            <div style={{ marginTop: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={{ padding: 6 }}>Produto</th><th style={{ textAlign: 'right' }}>Qtd</th><th style={{ textAlign: 'right' }}>Custo un.</th><th style={{ textAlign: 'right' }}>Subtotal</th><th style={{ textAlign: 'right' }}>Logíst.</th><th style={{ textAlign: 'right' }}>Custo c/ log.</th><th></th></tr></thead>
                <tbody>{itens.map((i, k) => {
                  const q = num(i.qtd)
                  return (
                    <tr key={i.key} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}>{i.produto_nome}{i.produto_origem_id == null && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 6px', borderRadius: 99, marginLeft: 6 }}>manual</span>}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtNum(q)} {i.unidade}</td>
                      <td style={{ textAlign: 'right' }}>{fmtR$(i.custo.custo)}</td>
                      <td style={{ textAlign: 'right' }}>{fmtR$(r2(q * i.custo.custo))}</td>
                      <td style={{ textAlign: 'right' }}>{fmtR$(rateio[k])}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtR$(r2(i.custo.custo + (q > 0 ? rateio[k] / q : 0)))}</td>
                      <td style={{ textAlign: 'right' }}><button className="btn bo bsm" style={{ color: '#991B1B', padding: '2px 6px' }} onClick={() => removeItem(i.key)}><Trash2 size={11} /></button></td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}

          <div style={{ borderTop: '1px dashed var(--border)', marginTop: 10, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
            <div className="fg" style={{ margin: 0 }}><label className="fl">Custo logístico total (R$)</label>
              <input className="inp" inputMode="decimal" placeholder="0,00" value={logistica} onChange={e => setLogistica(e.target.value)} /></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Valor dos produtos</div><b>{fmtR$(valorProdutos)}</b></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Logística</div><b>{fmtR$(log)}</b></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total da operação</div><b style={{ color: 'var(--bordo)', fontSize: 16 }}>{fmtR$(total)}</b></div>
          </div>
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
          <button className="btn bp bsm" onClick={salvar} disabled={salvando}>{salvando ? <Loader className="spin" size={13} /> : <Check size={13} />} {tipo === 'venda' ? 'Solicitar venda' : 'Solicitar transferência'}</button>
        </div>
      </div>
    </div>
  )
}

const must = (r: any) => { if (r?.error) throw new Error(r.error.message || String(r.error)); return r }
// ── Modal: editar transferência (cabeçalho, lojas e itens) com auditoria ──
interface EItem { id: string | null; produto_origem_id: string | null; nome: string; unidade: string; qtd: string; custo: string; fonte: string | null; data: string | null; fornecedor: string | null; nf: string | null; saldo: number | null }
function EditarTransf({ t, itens, user, onClose, onSaved }: { t: Transf; itens: TransfItem[]; user: any; onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo] = useState(t.tipo || 'transferencia')
  const [origem, setOrigem] = useState(t.unidade_origem)
  const [destino, setDestino] = useState(t.unidade_destino)
  const [motivo, setMotivo] = useState(t.motivo || '')
  const [logistica, setLogistica] = useState(String(t.custo_logistico || ''))
  const [rows, setRows] = useState<EItem[]>(() => itens.map(i => ({
    id: i.id, produto_origem_id: i.produto_origem_id, nome: i.produto_nome, unidade: i.unidade, qtd: String(i.qtd_solicitada),
    custo: String(i.custo_compra_unit > 0 ? i.custo_compra_unit : i.preco_unitario || ''), fonte: i.custo_fonte, data: i.ultima_compra_data, fornecedor: i.fornecedor, nf: i.nota_fiscal, saldo: i.saldo_origem_no_pedido,
  })))
  const [prods, setProds] = useState<ProdOrig[]>([])
  const [selP, setSelP] = useState('')
  const [nNome, setNNome] = useState(''); const [nUn, setNUn] = useState('un'); const [nQtd, setNQtd] = useState(''); const [nCusto, setNCusto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregarProds = async (loja: string) => {
    const { data } = await sb.from('estoque_produtos').select('id, nome, gramatura, nivel_atual, preco_unitario, categoria, fornecedor_nome').eq('loja', loja).eq('ativo', true).order('nome')
    const lista = (data as ProdOrig[]) || []
    setProds(lista); return lista
  }
  useEffect(() => { carregarProds(origem) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // trocar a loja de origem religa cada item ao produto de mesmo nome na nova origem (ou vira item manual)
  const trocarOrigem = async (nova: string) => {
    setOrigem(nova)
    const lista = await carregarProds(nova)
    setRows(rs => rs.map(r => {
      const p = lista.find(x => x.nome.trim().toLowerCase() === r.nome.trim().toLowerCase())
      return p ? { ...r, produto_origem_id: p.id, saldo: p.nivel_atual } : { ...r, produto_origem_id: null, saldo: null }
    }))
  }
  const setRow = (k: number, patch: Partial<EItem>) => setRows(rs => rs.map((r, i) => i === k ? { ...r, ...patch } : r))

  const addDoEstoque = async () => {
    const p = prods.find(x => x.id === selP); if (!p) return
    const c = await buscarUltimoCusto(origem, p.nome, p.gramatura, Number(p.preco_unitario) || 0, p.fornecedor_nome)
    setRows(rs => [...rs, { id: null, produto_origem_id: p.id, nome: p.nome, unidade: p.gramatura, qtd: '1', custo: c ? String(c.custo) : '', fonte: c?.fonte || 'manual', data: c?.data || null, fornecedor: c?.fornecedor || null, nf: c?.nf || null, saldo: p.nivel_atual }])
    setSelP('')
  }
  const addManual = () => {
    if (!nNome.trim()) { alert('Informe o nome do produto.'); return }
    if (!(num(nQtd) > 0)) { alert('Informe a quantidade.'); return }
    if (!(num(nCusto) > 0)) { alert('Informe o custo unitário (R$).'); return }
    setRows(rs => [...rs, { id: null, produto_origem_id: null, nome: nNome.trim(), unidade: nUn.trim() || 'un', qtd: nQtd, custo: nCusto, fonte: 'manual', data: null, fornecedor: null, nf: null, saldo: null }])
    setNNome(''); setNQtd(''); setNCusto('')
  }

  const log = num(logistica)
  const rateio = useMemo(() => ratear(rows.map(i => ({ qtd: num(i.qtd), custo: num(i.custo) })), log), [rows, log])
  const valorProdutos = r2(rows.reduce((s, i) => s + num(i.qtd) * num(i.custo), 0))
  const total = r2(valorProdutos + log)
  const movido = ['enviada', 'recebida'].includes(t.status)

  const salvar = async () => {
    if (!origem || !destino) { alert('Escolha as unidades de origem e destino.'); return }
    if (origem === destino) { alert('Origem e destino devem ser diferentes.'); return }
    if (rows.length === 0) { alert('A transferência precisa de ao menos um item.'); return }
    if (rows.some(r => !r.nome.trim() || !(num(r.qtd) > 0))) { alert('Há item sem nome ou com quantidade inválida.'); return }
    if (rows.some(r => !(num(r.custo) > 0))) { alert('Há item sem custo unitário.'); return }
    if (log < 0) { alert('Custo logístico inválido.'); return }

    // ── diferenças (para auditoria e para saber se mexe em estoque) ──
    const orig = new Map(itens.map(i => [i.id, i]))
    const mudancas: string[] = []
    const camp = (rot: string, a: any, b: any) => { if (String(a ?? '') !== String(b ?? '')) mudancas.push(`${rot}: ${a || '—'} → ${b || '—'}`) }
    camp('Origem', t.unidade_origem, origem); camp('Destino', t.unidade_destino, destino)
    camp('Tipo', t.tipo === 'venda' ? 'Venda' : 'Transferência', tipo === 'venda' ? 'Venda' : 'Transferência')
    camp('Motivo', t.motivo, motivo.trim() || null)
    if (r2(t.custo_logistico || 0) !== r2(log)) mudancas.push(`Logística: ${fmtR$(t.custo_logistico)} → ${fmtR$(log)}`)
    let itensMudaram = false
    for (const r of rows) {
      if (!r.id) { mudancas.push(`+ Item: ${r.nome} · ${r.qtd} ${r.unidade} × ${fmtR$(num(r.custo))}`); itensMudaram = true; continue }
      const o = orig.get(r.id)!
      const oc = o.custo_compra_unit > 0 ? o.custo_compra_unit : o.preco_unitario
      const d: string[] = []
      if (o.produto_nome.trim() !== r.nome.trim()) d.push(`nome ${o.produto_nome} → ${r.nome}`)
      if ((o.unidade || '') !== r.unidade.trim()) d.push(`un. ${o.unidade} → ${r.unidade}`)
      if (num(o.qtd_solicitada) !== num(r.qtd)) d.push(`qtd ${fmtNum(o.qtd_solicitada)} → ${fmtNum(num(r.qtd))}`)
      if (r2(oc) !== r2(num(r.custo))) d.push(`custo ${fmtR$(oc)} → ${fmtR$(num(r.custo))}`)
      if ((o.produto_origem_id || null) !== (r.produto_origem_id || null)) { d.push(r.produto_origem_id ? 'religado ao estoque da origem' : 'sem vínculo com estoque (manual)'); itensMudaram = true }
      if (d.length) { mudancas.push(`Item ${o.produto_nome}: ${d.join('; ')}`); if (d.some(x => !x.startsWith('custo'))) itensMudaram = true }
    }
    for (const o of itens) if (!rows.some(r => r.id === o.id)) { mudancas.push(`− Item removido: ${o.produto_nome} · ${fmtNum(o.qtd_solicitada)} ${o.unidade}`); itensMudaram = true }
    if (mudancas.length === 0) { alert('Nenhuma alteração feita.'); return }
    const mexeEstoque = movido && (origem !== t.unidade_origem || destino !== t.unidade_destino || itensMudaram)
    if (mexeEstoque) {
      const q = `Esta transferência já ${t.status === 'recebida' ? 'foi RECEBIDA' : 'foi ENVIADA'}.\n\nPara alterar lojas/itens o sistema vai ESTORNAR as movimentações de estoque já feitas (devolve na origem${t.status === 'recebida' ? ' e retira do destino' : ''}) e a operação volta para "Em separação" para ser enviada de novo.${t.financeiro_status === 'quitado' ? '\n\n⚠ O acerto financeiro quitado será reaberto.' : ''}\n\nConfirmar?`
      if (!confirm(q)) return
    } else if (!confirm(`Salvar ${mudancas.length} alteração(ões)?\n\n${mudancas.join('\n')}`)) return

    setSalvando(true)
    const quem = `${user?.name || 'Painel'}${user?.email ? ' · ' + user.email : ''}`
    try {
      let novoStatus = t.status
      const reset: Record<string, any> = {}
      if (mexeEstoque) {
        for (const it of itens) {
          const qEnv = Number(it.qtd_enviada || 0), qRec = Number(it.qtd_recebida || 0)
          if (qEnv > 0 && it.produto_origem_id) {
            const { data: p } = await sb.from('estoque_produtos').select('nivel_atual').eq('id', it.produto_origem_id).maybeSingle()
            const antes = Number(p?.nivel_atual ?? 0)
            must(await sb.from('estoque_produtos').update({ nivel_atual: antes + qEnv, updated_at: nowISO() }).eq('id', it.produto_origem_id))
            must(await sb.from('estoque_movimentacoes').insert({ loja: t.unidade_origem, produto_id: it.produto_origem_id, produto_nome: it.produto_nome, tipo: 'estorno_saida', quantidade: qEnv, unidade: it.unidade, saldo_antes: antes, saldo_depois: antes + qEnv, motivo: `Estorno por edição TR-${t.numero} (${quem})`, created_by: user?.name || 'Painel' }))
          }
          if (t.status === 'recebida' && qRec > 0 && it.produto_destino_id) {
            const { data: p } = await sb.from('estoque_produtos').select('nivel_atual').eq('id', it.produto_destino_id).maybeSingle()
            const antes = Number(p?.nivel_atual ?? 0), depois = Math.max(0, antes - qRec)
            must(await sb.from('estoque_produtos').update({ nivel_atual: depois, updated_at: nowISO() }).eq('id', it.produto_destino_id))
            must(await sb.from('estoque_movimentacoes').insert({ loja: t.unidade_destino, produto_id: it.produto_destino_id, produto_nome: it.produto_nome, tipo: 'estorno_entrada', quantidade: qRec, unidade: it.unidade, saldo_antes: antes, saldo_depois: depois, motivo: `Estorno por edição TR-${t.numero} (${quem})`, created_by: user?.name || 'Painel' }))
          }
        }
        novoStatus = 'separacao'
        Object.assign(reset, { enviado_por: null, enviado_em: null, recebido_por: null, recebido_em: null, tem_divergencia: false, obs_recebimento: null, financeiro_status: null, quitado_por: null, quitado_em: null })
      }
      const aprovado = !['solicitada', 'em_analise'].includes(novoStatus)
      const { error } = await sb.from('transferencias').update({
        unidade_origem: origem, unidade_destino: destino, tipo, motivo: motivo.trim() || null,
        valor_produtos: valorProdutos, custo_logistico: log, valor_total: total, status: novoStatus, updated_at: nowISO(), ...reset,
        ...(!mexeEstoque && t.status === 'recebida' ? { financeiro_status: tipo === 'venda' ? (t.financeiro_status || 'a_receber') : null } : {}),
      }).eq('id', t.id)
      if (error) throw error
      // itens: remove os excluídos, atualiza os existentes, insere os novos
      for (const o of itens) if (!rows.some(r => r.id === o.id)) must(await sb.from('transferencia_itens').delete().eq('id', o.id))
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k], q = num(r.qtd), c = r2(num(r.custo))
        const campos: Record<string, any> = {
          produto_origem_id: r.produto_origem_id, produto_nome: r.nome.trim(), unidade: r.unidade.trim() || 'un', qtd_solicitada: q,
          qtd_aprovada: aprovado ? q : null, saldo_origem_no_pedido: r.saldo, preco_unitario: c, custo_compra_unit: c,
          custo_fonte: r.fonte, ultima_compra_data: r.data, fornecedor: r.fornecedor, nota_fiscal: r.nf,
          logistica_rateada: rateio[k], custo_unit_final: r2(c + (q > 0 ? rateio[k] / q : 0)),
          ...(mexeEstoque || !r.id ? { qtd_enviada: null, qtd_recebida: null, produto_destino_id: null } : {}),
        }
        if (r.id) must(await sb.from('transferencia_itens').update(campos).eq('id', r.id))
        else must(await sb.from('transferencia_itens').insert({ ...campos, transferencia_id: t.id }))
      }
      await sb.from('transferencia_timeline').insert({
        transferencia_id: t.id, evento: 'editada', quem,
        descricao: `${mudancas.join(' | ')}${mexeEstoque ? ' | ↩ movimentações estornadas; voltou para Em separação' : ''}`,
        meta: { usuario: user?.name || null, login: user?.email || null, usuario_id: user?.id || null, em: nowISO(), mudancas, estorno: mexeEstoque },
      })
      onSaved(); onClose()
    } catch (e: any) { alert('Falha ao salvar a edição: ' + (e?.message || e) + '\nConfira a transferência antes de tentar de novo.') }
    setSalvando(false)
  }

  return (
    <div className="ov open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="mhd"><b>✏️ Editar TR-{t.numero}</b><button className="btn bo bsm" onClick={onClose}><X size={13} /></button></div>
        <div className="mbd">
          {movido && <div style={{ fontSize: 12, background: '#FEF3C7', color: '#92400E', padding: '8px 10px', borderRadius: 8, marginBottom: 10 }}>⚠ Já {t.status === 'recebida' ? 'recebida' : 'enviada'}: alterar lojas ou itens estorna o estoque movimentado e volta a operação para “Em separação”. Mudar só motivo, logística ou tipo não mexe no estoque.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            <div className="fg"><label className="fl">Tipo</label>
              <select className="sel" value={tipo} onChange={e => setTipo(e.target.value)}><option value="venda">💰 Venda entre lojas</option><option value="transferencia">🔄 Transferência sem venda</option></select></div>
            <div className="fg"><label className="fl">Loja de origem</label>
              <select className="sel" value={origem} onChange={e => trocarOrigem(e.target.value)}>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
            <div className="fg"><label className="fl">Loja de destino</label>
              <select className="sel" value={destino} onChange={e => setDestino(e.target.value)}>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
          </div>
          <div className="fg"><label className="fl">Observações / motivo</label><input className="inp" value={motivo} onChange={e => setMotivo(e.target.value)} /></div>

          <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 10, overflowX: 'auto' }}>
            <label className="fl">Itens</label>
            <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)' }}><th style={{ padding: 4 }}>Produto</th><th>Un.</th><th>Qtd</th><th>Custo un. (R$)</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr></thead>
              <tbody>{rows.map((r, k) => (
                <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 4, minWidth: 180 }}>
                    <input className="inp" value={r.nome} onChange={e => setRow(k, { nome: e.target.value })} style={{ padding: '4px 8px' }} />
                    <div style={{ fontSize: 10, color: r.produto_origem_id ? 'var(--muted)' : '#92400E', fontWeight: 700 }}>{r.produto_origem_id ? `estoque de ${origem}${r.saldo != null ? ' · saldo ' + fmtNum(r.saldo) : ''}` : 'manual (sem vínculo c/ estoque da origem)'}</div>
                  </td>
                  <td><input className="inp" value={r.unidade} onChange={e => setRow(k, { unidade: e.target.value })} style={{ width: 64, padding: '4px 8px' }} /></td>
                  <td><input className="inp" inputMode="decimal" value={r.qtd} onChange={e => setRow(k, { qtd: e.target.value })} style={{ width: 80, padding: '4px 8px', textAlign: 'right' }} /></td>
                  <td><input className="inp" inputMode="decimal" value={r.custo} onChange={e => setRow(k, { custo: e.target.value })} style={{ width: 92, padding: '4px 8px', textAlign: 'right' }} /></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtR$(r2(num(r.qtd) * num(r.custo)))}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn bo bsm" style={{ color: '#991B1B', padding: '2px 6px' }} onClick={() => setRows(rs => rs.filter((_, i) => i !== k))}><Trash2 size={11} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px dashed var(--border)', marginTop: 8, paddingTop: 10 }}>
            <label className="fl">Adicionar item</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <select className="sel" value={selP} onChange={e => setSelP(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
                <option value="">Do estoque de {origem}…</option>
                {prods.map(p => <option key={p.id} value={p.id}>{p.nome} — saldo {fmtNum(p.nivel_atual)} {p.gramatura}</option>)}
              </select>
              <button className="btn bp bsm" onClick={addDoEstoque} disabled={!selP}><Plus size={12} /> Adicionar</button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input className="inp" placeholder="Ou manual: nome" value={nNome} onChange={e => setNNome(e.target.value)} style={{ flex: 2, minWidth: 160 }} />
              <input className="inp" placeholder="un" value={nUn} onChange={e => setNUn(e.target.value)} style={{ width: 60 }} />
              <input className="inp" inputMode="decimal" placeholder="Qtd" value={nQtd} onChange={e => setNQtd(e.target.value)} style={{ width: 80 }} />
              <input className="inp" inputMode="decimal" placeholder="Custo un." value={nCusto} onChange={e => setNCusto(e.target.value)} style={{ width: 100 }} />
              <button className="btn bo bsm" onClick={addManual}><Plus size={12} /> Manual</button>
            </div>
          </div>

          <div style={{ borderTop: '1px dashed var(--border)', marginTop: 10, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, alignItems: 'end' }}>
            <div className="fg" style={{ margin: 0 }}><label className="fl">Custo logístico total (R$)</label><input className="inp" inputMode="decimal" placeholder="0,00" value={logistica} onChange={e => setLogistica(e.target.value)} /></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Valor dos produtos</div><b>{fmtR$(valorProdutos)}</b></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total da operação</div><b style={{ color: 'var(--bordo)', fontSize: 16 }}>{fmtR$(total)}</b></div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>A edição fica registrada no histórico com quem alterou (nome e login), data/hora e o que mudou (antes → depois).</div>
        </div>
        <div className="mft">
          <button className="btn bo bsm" onClick={onClose}>Cancelar</button>
          <button className="btn bp bsm" onClick={salvar} disabled={salvando}>{salvando ? <Loader className="spin" size={13} /> : <Check size={13} />} Salvar alterações</button>
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
  const [editOpen, setEditOpen] = useState(false)
  const [whatsOpen, setWhatsOpen] = useState(false)

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
  // Reivindica a transição de status de forma atômica (evita baixa/entrada duplicada por duplo clique, F5 ou 2 usuários)
  const reivindicar = async (de: string, para: string, patch: Record<string, any>) => {
    const { data } = await sb.from('transferencias').update({ status: para, ...patch, updated_at: nowISO() }).eq('id', id).eq('status', de).select('id')
    return Array.isArray(data) && data.length > 0
  }
  const tipoMov = (sufixo: 'saida' | 'entrada') => isVenda(t) ? `venda_interna_${sufixo}` : `transferencia_${sufixo}`
  const rotulo = isVenda(t) ? 'Venda' : 'Transferência'

  // ENVIO → baixa no estoque da origem
  const enviar = async () => {
    const envios = itens.map(it => ({ it, qtd: num(edits[it.id] ?? String(it.qtd_aprovada ?? it.qtd_solicitada)) }))
    if (envios.some(e => !(e.qtd >= 0))) { alert('Quantidades inválidas.'); return }
    if (envios.some(e => e.qtd > (e.it.qtd_aprovada ?? e.it.qtd_solicitada))) { alert('Não é possível enviar mais do que o aprovado.'); return }
    // valida saldo REAL atual da origem antes de qualquer baixa
    const saldos: Record<string, number> = {}
    for (const { it, qtd } of envios) {
      if (qtd <= 0 || !it.produto_origem_id) continue
      const { data: pd } = await sb.from('estoque_produtos').select('nivel_atual').eq('id', it.produto_origem_id).single()
      saldos[it.id] = Number(pd?.nivel_atual ?? 0)
      if (qtd > saldos[it.id]) { alert(`Saldo insuficiente na origem para "${it.produto_nome}": disponível ${fmtNum(saldos[it.id])}, a enviar ${fmtNum(qtd)}.\nConfira o estoque físico e ajuste antes de enviar.`); return }
      if (!(it.custo_compra_unit > 0) && !(it.preco_unitario > 0)) { alert(`"${it.produto_nome}" está sem custo de compra válido. Regularize o cadastro.`); return }
    }
    if (!confirm('Confirmar ENVIO? Isto dá baixa no estoque da loja de origem.')) return
    setBusy(true)
    try {
      const ok = await reivindicar('separacao', 'enviada', { enviado_por: user?.name || 'Painel', enviado_em: nowISO() })
      if (!ok) { setBusy(false); alert('Esta operação já foi processada por outro usuário/aba. Atualizando…'); await load(); return }
      for (const { it, qtd } of envios) {
        if (qtd <= 0) { await sb.from('transferencia_itens').update({ qtd_enviada: 0 }).eq('id', it.id); continue }
        if (!it.produto_origem_id) {
          // item manual: dá entrada no estoque da origem (cria o produto se não existir) para a saída ficar registrada e rastreável
          const { data: ex } = await sb.from('estoque_produtos').select('id, nivel_atual').ilike('nome', it.produto_nome.trim()).eq('loja', t.unidade_origem).eq('ativo', true).maybeSingle()
          let pid: string | null = ex?.id ?? null
          const base = Number(ex?.nivel_atual ?? 0)
          if (pid) await sb.from('estoque_produtos').update({ nivel_atual: base + qtd, updated_at: nowISO() }).eq('id', pid)
          else {
            const { data: np } = await sb.from('estoque_produtos').insert({
              loja: t.unidade_origem, nome: it.produto_nome, gramatura: it.unidade || 'un', categoria: 'Entrada manual',
              nivel_atual: qtd, preco_unitario: it.custo_compra_unit || it.preco_unitario || 0, ativo: true,
            }).select('id').single()
            pid = np?.id ?? null
          }
          await sb.from('estoque_movimentacoes').insert({
            loja: t.unidade_origem, produto_id: pid, produto_nome: it.produto_nome, tipo: 'entrada_manual', quantidade: qtd, unidade: it.unidade,
            saldo_antes: base, saldo_depois: base + qtd, motivo: `Entrada manual p/ ${rotulo} TR-${t.numero} → ${t.unidade_destino}`, created_by: user?.name || 'Painel',
          })
          it.produto_origem_id = pid
          if (pid) await sb.from('transferencia_itens').update({ produto_origem_id: pid }).eq('id', it.id)
          saldos[it.id] = base + qtd
        }
        const antes = saldos[it.id] ?? 0
        const depois = Math.max(0, antes - qtd)
        if (it.produto_origem_id) await sb.from('estoque_produtos').update({ nivel_atual: depois, updated_at: nowISO() }).eq('id', it.produto_origem_id)
        await sb.from('estoque_movimentacoes').insert({
          loja: t.unidade_origem, produto_id: it.produto_origem_id, produto_nome: it.produto_nome,
          tipo: tipoMov('saida'), quantidade: qtd, unidade: it.unidade, saldo_antes: antes, saldo_depois: depois,
          motivo: `${rotulo} TR-${t.numero} → ${t.unidade_destino}`, nota_fiscal: it.nota_fiscal || null, created_by: user?.name || 'Painel',
        })
        await sb.from('transferencia_itens').update({ qtd_enviada: qtd }).eq('id', it.id)
      }
      await registrarTimeline('enviada', `Produtos enviados · baixa no estoque da origem${isVenda(t) ? ' · venda interna' : ''}`)
      setEdits({})
      setBusy(false); await load(); onChange()
    } catch (e: any) { setBusy(false); alert('Falha no envio: ' + (e?.message || e) + '\nConfira o histórico/estoque antes de tentar de novo.'); await load() }
  }
  // RECEBIMENTO → entrada no destino (custo com logística) + divergência
  const receber = async () => {
    const receb = itens.map(it => ({ it, qtd: num(edits[it.id] ?? String(it.qtd_enviada ?? 0)) }))
    if (receb.some(e => !(e.qtd >= 0))) { alert('Quantidades inválidas.'); return }
    if (!confirm('Confirmar RECEBIMENTO? Isto dá entrada no estoque da loja de destino.')) return
    setBusy(true)
    try {
      let divergencia = false
      for (const { it, qtd } of receb) if ((it.qtd_enviada ?? 0) !== qtd) divergencia = true
      const ok = await reivindicar('enviada', 'recebida', {
        recebido_por: user?.name || 'Painel', recebido_em: nowISO(), tem_divergencia: divergencia,
        ...(isVenda(t) ? { financeiro_status: 'a_receber' } : {}),
      })
      if (!ok) { setBusy(false); alert('Esta operação já foi recebida por outro usuário/aba. Atualizando…'); await load(); return }
      for (const { it, qtd } of receb) {
        if (qtd <= 0) { await sb.from('transferencia_itens').update({ qtd_recebida: 0 }).eq('id', it.id); continue }
        // custo de entrada no destino = custo de compra + logística rateada por unidade
        const q0 = it.qtd_enviada || qtd
        const custoEntrada = it.custo_unit_final > 0 ? it.custo_unit_final : r2((it.custo_compra_unit || it.preco_unitario || 0) + (q0 > 0 ? (it.logistica_rateada || 0) / q0 : 0))
        const { data: pd } = await sb.from('estoque_produtos').select('id, nivel_atual, preco_unitario')
          .ilike('nome', it.produto_nome.trim()).eq('loja', t.unidade_destino).eq('ativo', true).maybeSingle()
        let antes = 0, depois = qtd, destId: string | null = null
        if (pd) {
          antes = Number(pd.nivel_atual ?? 0)
          const precoAtual = Number(pd.preco_unitario ?? custoEntrada)
          depois = antes + qtd
          const cmp = depois > 0 ? (antes * precoAtual + qtd * custoEntrada) / depois : precoAtual
          await sb.from('estoque_produtos').update({ nivel_atual: depois, preco_unitario: r2(cmp), updated_at: nowISO() }).eq('id', pd.id)
          destId = pd.id
        } else {
          const { data: novoP } = await sb.from('estoque_produtos').insert({
            loja: t.unidade_destino, nome: it.produto_nome, gramatura: it.unidade || 'un',
            categoria: isVenda(t) ? 'Compra interna' : 'Transferência', nivel_atual: qtd, preco_unitario: custoEntrada, ativo: true,
            fornecedor_nome: it.fornecedor || null,
          }).select('id').single()
          destId = novoP?.id ?? null
        }
        await sb.from('transferencia_itens').update({ qtd_recebida: qtd, produto_destino_id: destId }).eq('id', it.id)
        await sb.from('estoque_movimentacoes').insert({
          loja: t.unidade_destino, produto_id: destId, produto_nome: it.produto_nome,
          tipo: tipoMov('entrada'), quantidade: qtd, unidade: it.unidade, saldo_antes: antes, saldo_depois: depois,
          motivo: `${rotulo} TR-${t.numero} ← ${t.unidade_origem}`, nota_fiscal: it.nota_fiscal || null, created_by: user?.name || 'Painel',
        })
      }
      await registrarTimeline('recebida', divergencia ? 'Recebido COM divergência (enviado ≠ recebido)' : 'Recebido conforme enviado', { divergencia })
      if (divergencia) await registrarTimeline('divergencia', 'Divergência entre enviado e recebido — verificar', {})
      if (isVenda(t)) await registrarTimeline('financeiro', `Compra interna registrada: ${t.unidade_destino} deve ${fmtR$(t.valor_total)} a ${t.unidade_origem} (produtos ${fmtR$(t.valor_produtos)} + logística ${fmtR$(t.custo_logistico)})`)
      setEdits({})
      setBusy(false); await load(); onChange()
    } catch (e: any) { setBusy(false); alert('Falha no recebimento: ' + (e?.message || e) + '\nConfira o histórico/estoque antes de tentar de novo.'); await load() }
  }
  // Quitação da venda interna (acerto entre as lojas)
  const quitar = async () => {
    if (!confirm(`Confirmar que ${t.unidade_destino} pagou ${fmtR$(t.valor_total)} a ${t.unidade_origem}?`)) return
    setBusy(true)
    const { data } = await sb.from('transferencias').update({ financeiro_status: 'quitado', quitado_por: user?.name || 'Painel', quitado_em: nowISO() }).eq('id', id).eq('financeiro_status', 'a_receber').select('id')
    if (Array.isArray(data) && data.length) await registrarTimeline('financeiro', `Acerto financeiro quitado (${fmtR$(t.valor_total)})`)
    setBusy(false); await load(); onChange()
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
          <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: 99 }}>{tipoLabel(t)}</span>
          {isVenda(t) && t.financeiro_status && <span style={{ fontSize: 11, fontWeight: 700, color: t.financeiro_status === 'quitado' ? '#166534' : '#B45309' }}>{t.financeiro_status === 'quitado' ? '✔ Quitada' : '⏳ A receber'}</span>}
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
              <th style={{ textAlign: 'right' }}>Custo compra</th>
              <th style={{ textAlign: 'right' }}>Logíst.</th>
              <th style={{ textAlign: 'right' }}>Custo c/ log.</th>
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
                  <td style={{ textAlign: 'right' }} title={`${FONTE[it.custo_fonte || ''] || 'custo'}${it.ultima_compra_data ? ' · ' + it.ultima_compra_data : ''}${it.fornecedor ? ' · ' + it.fornecedor : ''}${it.nota_fiscal ? ' · NF ' + it.nota_fiscal : ''}`}>{it.custo_compra_unit > 0 ? fmtR$(it.custo_compra_unit) : fmtR$(it.preco_unitario)}</td>
                  <td style={{ textAlign: 'right' }}>{fmtR$(it.logistica_rateada)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{it.custo_unit_final > 0 ? fmtR$(it.custo_unit_final) : '—'}</td>
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
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>* Saldo da origem registrado no momento da solicitação. Passe o mouse sobre o custo para ver fonte, data, fornecedor e NF.</div>
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 10, padding: '10px 12px', background: 'var(--bg, #FAF7F5)', borderRadius: 8, fontSize: 13 }}>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Valor dos produtos</div><b>{fmtR$(t.valor_produtos)}</b></div>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Logística</div><b>{fmtR$(t.custo_logistico)}</b></div>
          <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total da operação</div><b style={{ color: 'var(--bordo)' }}>{fmtR$(t.valor_total)}</b></div>
          {isVenda(t) && <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Financeiro</div><b>{t.unidade_destino} paga a {t.unidade_origem}{t.quitado_em ? ' · quitado ' + fmtDataH(t.quitado_em) + ' por ' + t.quitado_por : ''}</b></div>}
        </div>

        {/* Ações do fluxo */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
          {busy && <Loader className="spin" size={16} />}
          {!busy && <a className="btn bo bsm" href={linkTransf(id)} target="_blank" rel="noreferrer">📄 Relatório</a>}
          {!busy && <button className="btn bo bsm" onClick={() => setWhatsOpen(true)}>📲 Enviar por WhatsApp</button>}
          {!busy && <button className="btn bp bsm" onClick={() => setEditOpen(true)}>✏️ Editar / corrigir</button>}
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
          {!busy && isVenda(t) && t.status === 'recebida' && t.financeiro_status === 'a_receber' && podeGerir && (
            <button className="btn bp bsm" onClick={quitar}><Check size={12} /> Marcar acerto como quitado</button>
          )}
          {!busy && !somenteLeitura && t.status !== 'enviada' && (
            <button className="btn bo bsm" onClick={cancelar} style={{ marginLeft: 'auto', color: '#991B1B' }}><Trash2 size={12} /> Cancelar</button>
          )}
        </div>
      </div>

      {whatsOpen && <EnviarWhatsModal t={t} itens={itens} user={user} onClose={() => setWhatsOpen(false)} onSent={load} />}
      {editOpen && <EditarTransf t={t} itens={itens} user={user} onClose={() => setEditOpen(false)} onSaved={() => { load(); onChange() }} />}

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

// ── Relatórios ───────────────────────────────────────────────
function RelatoriosTransf({ transfs, onAbrir }: { transfs: Transf[]; onAbrir: (id: string) => void }) {
  const hoje = new Date()
  const [de, setDe] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10))
  const [ate, setAte] = useState(hoje.toISOString().slice(0, 10))
  const [fLoja, setFLoja] = useState('')
  const [itens, setItens] = useState<(TransfItem & { _t?: Transf })[]>([])
  const [loadingIt, setLoadingIt] = useState(false)

  const lista = useMemo(() => transfs.filter(t => {
    const d = (t.created_at || '').slice(0, 10)
    if (d < de || d > ate) return false
    if (fLoja && t.unidade_origem !== fLoja && t.unidade_destino !== fLoja) return false
    return true
  }), [transfs, de, ate, fLoja])
  const concluidas = useMemo(() => lista.filter(t => t.status === 'recebida'), [lista])

  useEffect(() => {
    const ids = concluidas.map(t => t.id)
    if (ids.length === 0) { setItens([]); return }
    setLoadingIt(true)
    sb.from('transferencia_itens').select('*').in('transferencia_id', ids).then(({ data }: any) => { setItens(data || []); setLoadingIt(false) })
  }, [concluidas])

  const porLoja = useMemo(() => LOJAS.map(l => {
    const sai = concluidas.filter(t => t.unidade_origem === l), ent = concluidas.filter(t => t.unidade_destino === l)
    const soma = (a: Transf[], f: (t: Transf) => number) => a.reduce((s, t) => s + f(t), 0)
    return {
      loja: l,
      vendas: soma(sai.filter(isVenda), t => t.valor_total), compras: soma(ent.filter(isVenda), t => t.valor_total),
      transfEnv: soma(sai.filter(t => !isVenda(t)), t => t.valor_total), transfRec: soma(ent.filter(t => !isVenda(t)), t => t.valor_total),
      logistica: soma(sai.concat(ent), t => t.custo_logistico),
    }
  }), [concluidas])

  // valor a pagar/receber entre unidades (vendas recebidas ainda não quitadas)
  const acertos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of concluidas.filter(t => isVenda(t) && t.financeiro_status === 'a_receber')) {
      const k = `${t.unidade_destino}→${t.unidade_origem}`; m[k] = (m[k] || 0) + t.valor_total
    }
    return Object.entries(m)
  }, [concluidas])

  const porProduto = useMemo(() => {
    const m: Record<string, { nome: string; un: string; qtd: number; valor: number; ult: number; ops: number }> = {}
    for (const it of itens) {
      const q = it.qtd_recebida ?? it.qtd_enviada ?? 0
      const k = (it.produto_nome || '').trim().toLowerCase()
      const r = m[k] || (m[k] = { nome: it.produto_nome, un: it.unidade, qtd: 0, valor: 0, ult: 0, ops: 0 })
      r.qtd += q; r.valor += q * (it.custo_unit_final || it.preco_unitario || 0); r.ult = it.custo_compra_unit || it.preco_unitario || r.ult; r.ops++
    }
    return Object.values(m).sort((a, b) => b.valor - a.valor)
  }, [itens])

  const totVendido = concluidas.filter(isVenda).reduce((s, t) => s + t.valor_total, 0)
  const totTransf = concluidas.filter(t => !isVenda(t)).reduce((s, t) => s + t.valor_total, 0)
  const totLog = concluidas.reduce((s, t) => s + (t.custo_logistico || 0), 0)

  const exportarCSV = () => {
    const linhas = [['Nº', 'Tipo', 'Status', 'Origem', 'Destino', 'Solicitante', 'Aprovador', 'Expedição', 'Recebimento', 'Criada em', 'Valor produtos', 'Logística', 'Total', 'Financeiro']]
    for (const t of lista) linhas.push([`TR-${t.numero}`, isVenda(t) ? 'Venda' : 'Transferência', t.status, t.unidade_origem, t.unidade_destino, t.solicitante_nome, t.aprovado_por || '', t.enviado_por || '', t.recebido_por || '', fmtDataH(t.created_at), String(t.valor_produtos ?? 0).replace('.', ','), String(t.custo_logistico ?? 0).replace('.', ','), String(t.valor_total ?? 0).replace('.', ','), t.financeiro_status || ''])
    const csv = '﻿' + linhas.map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `transferencias_${de}_${ate}.csv`; a.click()
  }

  const th: React.CSSProperties = { padding: 6, textAlign: 'right', color: 'var(--muted)', fontWeight: 600 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
        <div className="fg" style={{ margin: 0 }}><label className="fl">De</label><input type="date" className="inp" value={de} onChange={e => setDe(e.target.value)} /></div>
        <div className="fg" style={{ margin: 0 }}><label className="fl">Até</label><input type="date" className="inp" value={ate} onChange={e => setAte(e.target.value)} /></div>
        <select className="sel" value={fLoja} onChange={e => setFLoja(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">Todas as lojas</option>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <button className="btn bo bsm" onClick={exportarCSV} style={{ marginLeft: 'auto' }}>⬇ Exportar CSV</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
        <Kpi titulo="💰 Total vendido (concluídas)" valor={fmtR$(totVendido)} />
        <Kpi titulo="🔄 Total transferido" valor={fmtR$(totTransf)} />
        <Kpi titulo="🚛 Custo logístico" valor={fmtR$(totLog)} />
        <Kpi titulo="📄 Operações no período" valor={String(lista.length)} />
      </div>

      <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🏬 Por loja (operações recebidas)</div>
        <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Loja</th><th style={th}>Vendas (saída)</th><th style={th}>Compras internas (entrada)</th><th style={th}>Transf. enviadas</th><th style={th}>Transf. recebidas</th><th style={th}>Logística</th></tr></thead>
          <tbody>{porLoja.map(r => (
            <tr key={r.loja} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 6, fontWeight: 700 }}>{r.loja}</td>
              <td style={{ textAlign: 'right' }}>{fmtR$(r.vendas)}</td><td style={{ textAlign: 'right' }}>{fmtR$(r.compras)}</td>
              <td style={{ textAlign: 'right' }}>{fmtR$(r.transfEnv)}</td><td style={{ textAlign: 'right' }}>{fmtR$(r.transfRec)}</td>
              <td style={{ textAlign: 'right' }}>{fmtR$(r.logistica)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🧾 A pagar / a receber entre unidades (vendas não quitadas)</div>
        {acertos.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhum acerto pendente no período.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            {acertos.map(([k, v]) => { const [dev, cred] = k.split('→'); return <div key={k}><b>{dev}</b> deve <b style={{ color: '#B45309' }}>{fmtR$(v)}</b> a <b>{cred}</b></div> })}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>📦 Por produto {loadingIt && <Loader className="spin" size={12} />}</div>
        {porProduto.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sem movimentações concluídas no período.</div> : (
          <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Produto</th><th style={th}>Qtd movimentada</th><th style={th}>Último custo de compra</th><th style={th}>Valor c/ logística</th><th style={th}>Operações</th></tr></thead>
            <tbody>{porProduto.slice(0, 60).map(r => (
              <tr key={r.nome} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 6 }}>{r.nome}</td>
                <td style={{ textAlign: 'right' }}>{fmtNum(r.qtd)} {r.un}</td><td style={{ textAlign: 'right' }}>{fmtR$(r.ult)}</td>
                <td style={{ textAlign: 'right' }}>{fmtR$(r.valor)}</td><td style={{ textAlign: 'right' }}>{r.ops}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ padding: 14, overflowX: 'auto' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>🔍 Auditoria (solicitante · aprovador · expedição · recebimento)</div>
        {lista.length === 0 ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Nenhuma operação no período.</div> : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...th, textAlign: 'left' }}>Nº</th><th style={{ ...th, textAlign: 'left' }}>Tipo / Rota</th><th style={{ ...th, textAlign: 'left' }}>Solicitou</th><th style={{ ...th, textAlign: 'left' }}>Aprovou</th><th style={{ ...th, textAlign: 'left' }}>Enviou</th><th style={{ ...th, textAlign: 'left' }}>Recebeu</th><th style={th}>Total</th></tr></thead>
            <tbody>{lista.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => onAbrir(t.id)}>
                <td style={{ padding: 6, fontWeight: 700, color: 'var(--bordo)' }}>TR-{t.numero}</td>
                <td>{isVenda(t) ? '💰' : '🔄'} {t.unidade_origem} → {t.unidade_destino} <span style={{ color: 'var(--muted)' }}>({st(t.status).label.replace(/^[^ ]+ /, '')})</span></td>
                <td>{t.solicitante_nome}</td><td>{t.aprovado_por || '—'}</td><td>{t.enviado_por || '—'}</td><td>{t.recebido_por || '—'}</td>
                <td style={{ textAlign: 'right' }}>{fmtR$(t.valor_total)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}
