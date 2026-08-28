import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { Repeat, RefreshCw, Loader2, PackageCheck, AlertTriangle, CheckCircle2, Hash, Send, X, ClipboardList, CalendarDays, History, Lock, Copy, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (s?: string) => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s }
const hoje = () => new Date().toISOString().slice(0, 10)
const agoraHora = () => new Date().toTimeString().slice(0, 5)
const normP = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const LOJAS_FALLBACK = ['Amore CD', 'Amore Paiva', 'Flow CD']
const num6 = (n: number) => String(n).padStart(6, '0')

// ── Tipos de ocorrência/desvio (mesma taxonomia do Recebimento Inteligente) ──
const OCORRENCIAS: { v: string; l: string }[] = [
  { v: 'produto_diferente', l: 'Produto diferente do pedido' },
  { v: 'quantidade_divergente', l: 'Quantidade divergente' },
  { v: 'valor_divergente', l: 'Valor diferente do pedido' },
  { v: 'produto_faltando', l: 'Produto faltando (não entregue)' },
  { v: 'produto_faturado_nao_entregue', l: 'Faturado, mas não entregue' },
  { v: 'produto_excedente', l: 'Produto excedente' },
  { v: 'embalagem_danificada', l: 'Embalagem danificada' },
  { v: 'produto_avariado', l: 'Produto avariado' },
  { v: 'validade_curta', l: 'Validade curta' },
  { v: 'produto_vencido', l: 'Produto vencido' },
  { v: 'qualidade_fora_padrao', l: 'Qualidade fora do padrão' },
  { v: 'peso_divergente', l: 'Peso divergente' },
  { v: 'outro', l: 'Outro' },
]
const ocorrLabel = (v: string) => OCORRENCIAS.find(o => o.v === v)?.l || v

// ── Tipos do ciclo (persistidos no blob do pedido em app_config) ──
interface PedidoItem { produto: string; qtd: number; un?: string; preco: number; subtotal?: number }
interface EntregaItem { produto: string; qtd: number; desvio?: { tipo: string; descricao?: string } }
interface Entrega { id: string; em: string; data: string; hora?: string; responsavel?: string; nf?: string; obs?: string; itens: EntregaItem[] }
interface Fechamento { fechado: boolean; em?: string; por?: string; motivo?: string; tipo?: string }
interface HistEv { em: string; quem: string; acao: string; detalhe?: string; de?: string; para?: string; motivo?: string }
interface Pedido {
  chave: string; fornecedor: string; loja: string; data?: string; total?: number
  pagamento?: string; recebimento_responsavel?: string; itens?: PedidoItem[]
  numero?: string; prev_entrega?: string
  confirmacao?: { confirmado?: string; data?: string; previsao?: string; obs?: string }
  entregas?: Entrega[]; fechamento?: Fechamento; historico?: HistEv[]
}

// ── Situação por item ──
function entregueDe(p: Pedido, produto: string): number {
  const n = normP(produto)
  return (p.entregas || []).reduce((s, e) => s + (e.itens || []).filter(i => normP(i.produto) === n).reduce((a, i) => a + (Number(i.qtd) || 0), 0), 0)
}
function itemSituacao(p: Pedido, it: PedidoItem) {
  const ped = Number(it.qtd) || 0
  const ent = entregueDe(p, it.produto)
  const pend = Math.max(0, Math.round((ped - ent) * 1000) / 1000)
  const sit = ent <= 0 ? 'nao' : pend <= 0.0001 ? 'ok' : 'parcial'
  return { ped, ent: Math.round(ent * 1000) / 1000, pend, sit }
}
const SIT_META: Record<string, { l: string; dot: string; c: string; b: string }> = {
  ok: { l: '🟢 Concluído', dot: '🟢', c: '#15803D', b: '#DCFCE7' },
  parcial: { l: '🟡 Parcial', dot: '🟡', c: '#B45309', b: '#FEF3C7' },
  nao: { l: '🔴 Não entregue', dot: '🔴', c: '#B91C1C', b: '#FEE2E2' },
}
// valor efetivamente entregue (soma qtd entregue × preço do item do pedido)
function valorEntregue(p: Pedido): number {
  return (p.itens || []).reduce((s, it) => s + itemSituacao(p, it).ent * (Number(it.preco) || 0), 0)
}
function valorPendente(p: Pedido): number {
  return (p.itens || []).reduce((s, it) => s + itemSituacao(p, it).pend * (Number(it.preco) || 0), 0)
}
// desvios registrados nas entregas do pedido
function desviosDe(p: Pedido): { produto: string; tipo: string; descricao?: string; data?: string }[] {
  const out: { produto: string; tipo: string; descricao?: string; data?: string }[] = []
  ;(p.entregas || []).forEach(e => (e.itens || []).forEach(i => { if (i.desvio?.tipo) out.push({ produto: i.produto, tipo: i.desvio.tipo, descricao: i.desvio.descricao, data: e.data }) }))
  return out
}

// ── Status do ciclo (pedido inteiro) ──
function cicloStatus(p: Pedido): { key: string; l: string; c: string; b: string } {
  const itens = p.itens || []
  const entTotal = itens.reduce((s, it) => s + entregueDe(p, it.produto), 0)
  const pendTotal = itens.reduce((s, it) => s + itemSituacao(p, it).pend, 0)
  if (p.fechamento?.fechado) {
    return p.fechamento.tipo === 'concluido'
      ? { key: 'concluido', l: '🟢 Concluído', c: '#15803D', b: '#DCFCE7' }
      : { key: 'encerrado', l: '⚫ Encerrado (tratado)', c: '#374151', b: '#E5E7EB' }
  }
  if (entTotal > 0 && pendTotal > 0.0001) return { key: 'parcial', l: '🟡 Entregue parcialmente', c: '#B45309', b: '#FEF3C7' }
  if (entTotal > 0 && pendTotal <= 0.0001) return { key: 'recebido', l: '🟢 Recebido — a fechar', c: '#0F766E', b: '#CCFBF1' }
  if (p.confirmacao?.confirmado === 'sim') return { key: 'confirmado', l: '🔵 Confirmado p/ fornecedor', c: '#1D4ED8', b: '#DBEAFE' }
  return { key: 'aguardando', l: '🟠 Aguardando entrega', c: '#C2410C', b: '#FFEDD5' }
}
const semanaISO = (d: string) => { // segunda a domingo que contém d
  const dt = new Date(d + 'T00:00:00'); const dow = (dt.getDay() + 6) % 7
  const seg = new Date(dt); seg.setDate(dt.getDate() - dow)
  const dom = new Date(seg); dom.setDate(seg.getDate() + 6)
  return { ini: seg.toISOString().slice(0, 10), fim: dom.toISOString().slice(0, 10) }
}
const diasAtraso = (prev?: string) => { if (!prev) return 0; const d = Math.floor((Date.parse(hoje()) - Date.parse(prev.slice(0, 10))) / 86400000); return d > 0 ? d : 0 }

export default function CicloComprasPage() {
  const { loja } = useLoja()
  const { theme } = useTheme()
  const LOJAS = (theme?.stores && theme.stores.length ? theme.stores : LOJAS_FALLBACK)
  const { user } = useAuth()
  const { toast } = useToast()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'conf' | 'ciclo' | 'macro' | 'pend' | 'rel'>('conf')
  const [aberto, setAberto] = useState<string | null>(null)
  const [semana, setSemana] = useState(() => semanaISO(hoje()).ini)
  const [diaRel, setDiaRel] = useState(hoje())
  const [recModal, setRecModal] = useState<Pedido | null>(null)
  const [confModal, setConfModal] = useState<Pedido | null>(null)
  const [fechModal, setFechModal] = useState<Pedido | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('app_config').select('chave,valor').like('chave', 'pedido_%')
    const list: Pedido[] = (data || []).map((r: any) => ({ chave: r.chave, ...(r.valor || {}) }))
    list.sort((a, b) => (String(b.data || '') + b.chave).localeCompare(String(a.data || '') + a.chave))
    setPedidos(list); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const daLoja = (p: Pedido) => loja === 'Todas as Lojas' || !loja || p.loja === loja
  const filtrados = useMemo(() => pedidos.filter(daLoja), [pedidos, loja])

  // grava alterações no blob do pedido, preservando os demais campos
  const salvarPedido = async (chave: string, patch: Partial<Pedido>, hist?: HistEv) => {
    const atual = pedidos.find(p => p.chave === chave)
    if (!atual) return
    const { chave: _c, ...rest } = { ...atual, ...patch }
    const valor: any = { ...rest }
    if (hist) valor.historico = [...(atual.historico || []), hist]
    await sb.from('app_config').upsert({ chave, valor }, { onConflict: 'chave' })
    await load()
  }

  // ── Numeração automática PC-<sig>-<ano>-###### ──
  const emitirNumero = async (p: Pedido) => {
    if (p.numero) return
    const ano = new Date().getFullYear()
    const sig = /flow/i.test(p.loja || '') ? 'FL' : 'AM'
    const { data } = await sb.from('app_config').select('valor').eq('chave', 'ciclo_pc_seq').maybeSingle()
    const seqMap = (data?.valor || {}) as Record<string, number>
    const prox = (Number(seqMap[String(ano)]) || 0) + 1
    seqMap[String(ano)] = prox
    await sb.from('app_config').upsert({ chave: 'ciclo_pc_seq', valor: seqMap }, { onConflict: 'chave' })
    const numero = `PC-${sig}-${ano}-${num6(prox)}`
    await salvarPedido(p.chave, { numero }, { em: new Date().toISOString(), quem: user?.name || 'Painel', acao: 'Nº emitido', detalhe: numero })
    toast(`Pedido numerado: ${numero} ✅`)
  }

  const confirmarFornecedor = async (p: Pedido, prev: string, obs: string) => {
    await salvarPedido(p.chave, { confirmacao: { confirmado: 'sim', data: new Date().toISOString(), previsao: prev || undefined, obs: obs || undefined }, ...(prev ? { prev_entrega: prev } : {}) },
      { em: new Date().toISOString(), quem: user?.name || 'Painel', acao: 'Confirmado pelo fornecedor', detalhe: prev ? `Previsão ${fmtD(prev)}` : '', motivo: obs || undefined })
    toast('Confirmação do fornecedor registrada. 🔵')
  }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Repeat size={24} /></div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Ciclo de Compras & Recebimento</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Requisição → Pedido → Confirmação → Entrega → Conferência → Pendências → Fechamento — Loja <strong>{loja}</strong></div>
        </div>
        <button onClick={load} title="Atualizar" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}><RefreshCw size={16} /></button>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {([['conf', <PackageCheck size={14} />, 'Conferência por Loja'], ['ciclo', <ClipboardList size={14} />, 'Pedidos & Ciclo'], ['macro', <CalendarDays size={14} />, 'Pedido Macro Semanal'], ['pend', <AlertTriangle size={14} />, 'Pendências'], ['rel', <Send size={14} />, 'Relatório do dia']] as const).map(([id, ic, lb]) => (
          <button key={id} onClick={() => setTab(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === id ? 'var(--bordo)' : 'var(--card)', color: tab === id ? '#fff' : 'var(--text)' }}>{ic}{lb}</button>
        ))}
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div> : <>
        {tab === 'conf' && <TabConferencia pedidos={filtrados} loja={loja} diaRel={diaRel} setDiaRel={setDiaRel} reload={load} user={user} toast={toast} />}
        {tab === 'ciclo' && <TabCiclo pedidos={filtrados} aberto={aberto} setAberto={setAberto} emitirNumero={emitirNumero} openRec={setRecModal} openConf={setConfModal} openFech={setFechModal} />}
        {tab === 'macro' && <TabMacro pedidos={filtrados} semana={semana} setSemana={setSemana} />}
        {tab === 'pend' && <TabPendencias pedidos={filtrados} openRec={setRecModal} />}
        {tab === 'rel' && <TabRelatorio pedidos={filtrados} dia={diaRel} setDia={setDiaRel} loja={loja} LOJAS={LOJAS} toast={toast} salvarPedido={salvarPedido} />}
      </>}

      {confModal && <ConfirmarModal p={confModal} onClose={() => setConfModal(null)} onSave={confirmarFornecedor} />}
      {recModal && <RegistrarEntregaModal p={recModal} onClose={() => setRecModal(null)} salvarPedido={salvarPedido} user={user} />}
      {fechModal && <FecharModal p={fechModal} onClose={() => setFechModal(null)} salvarPedido={salvarPedido} user={user} />}
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }

// ═══════════════ ABA: PEDIDOS & CICLO ═══════════════
function TabCiclo({ pedidos, aberto, setAberto, emitirNumero, openRec, openConf, openFech }: any) {
  if (!pedidos.length) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>Nenhum pedido nesta loja. Gere pedidos em <strong>🧾 Pedidos de Compra</strong> — eles entram automaticamente no ciclo aqui.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pedidos.map((p: Pedido) => {
        const st = cicloStatus(p)
        const itens = p.itens || []
        const pendTotal = itens.reduce((s, it) => s + itemSituacao(p, it).pend, 0)
        const entLinhas = itens.filter(it => itemSituacao(p, it).sit === 'ok').length
        const parcLinhas = itens.filter(it => itemSituacao(p, it).sit === 'parcial').length
        const naoLinhas = itens.filter(it => itemSituacao(p, it).sit === 'nao').length
        const isAberto = aberto === p.chave
        const atraso = diasAtraso(p.prev_entrega)
        return (
          <Fragment key={p.chave}>
            <div style={{ ...card }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {p.numero
                      ? <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: 'var(--bordo)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px' }}>{p.numero}</span>
                      : <button onClick={() => emitirNumero(p)} className="btn" style={{ padding: '4px 9px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--bg)', color: 'var(--text)', border: '1px dashed var(--border)' }}><Hash size={12} /> Emitir Nº</button>}
                    <span style={{ fontWeight: 700, fontSize: 14.5 }}>{p.fornecedor || 'Fornecedor'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
                    {p.loja} · {fmtD(p.data)} · {itens.length} itens{p.prev_entrega ? ` · prev. ${fmtD(p.prev_entrega)}` : ''}{atraso > 0 && !p.fechamento?.fechado ? ` · ⏰ ${atraso}d atraso` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 11px', borderRadius: 20, background: st.b, color: st.c, whiteSpace: 'nowrap' }}>{st.l}</span>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bordo)' }}>{fmtR$(p.total || 0)}</div>
                  <div style={{ fontSize: 10.5, color: '#15803D', fontWeight: 700 }}>entregue {fmtR$(valorEntregue(p))}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>🟢{entLinhas} · 🟡{parcLinhas} · 🔴{naoLinhas}{desviosDe(p).length ? ` · ⚠${desviosDe(p).length}` : ''}</div>
                </div>
              </div>
              {/* barra de progresso da entrega */}
              {itens.length > 0 && <div style={{ marginTop: 10, height: 7, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${(entLinhas / itens.length) * 100}%`, background: '#22c55e' }} />
                <div style={{ width: `${(parcLinhas / itens.length) * 100}%`, background: '#f59e0b' }} />
              </div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => setAberto(isAberto ? null : p.chave)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>{isAberto ? 'Ocultar' : '🔎 Conferência'}</button>
                {!p.fechamento?.fechado && <button onClick={() => openRec(p)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><PackageCheck size={14} /> Registrar entrega</button>}
                {!p.fechamento?.fechado && p.confirmacao?.confirmado !== 'sim' && <button onClick={() => openConf(p)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>✅ Confirmar fornecedor</button>}
                {!p.fechamento?.fechado && <button onClick={() => openFech(p)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5, background: pendTotal <= 0.0001 ? '#15803D' : 'var(--bg)', color: pendTotal <= 0.0001 ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}><Lock size={13} /> {pendTotal <= 0.0001 ? 'Fechar pedido' : 'Tratar pendência'}</button>}
                {p.fechamento?.fechado && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>🔒 {p.fechamento.tipo === 'concluido' ? 'Concluído' : 'Encerrado'} por {p.fechamento.por} em {p.fechamento.em ? new Date(p.fechamento.em).toLocaleDateString('pt-BR') : ''}{p.fechamento.motivo ? ` · ${p.fechamento.motivo}` : ''}</span>}
              </div>

              {isAberto && <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido</th><th>Entregue</th><th>Pendente</th><th>Valor entregue</th><th>Situação</th></tr></thead>
                    <tbody>{itens.map((it, k) => { const s = itemSituacao(p, it); const m = SIT_META[s.sit]; return (
                      <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 6, fontWeight: 600 }}>{it.produto}</td>
                        <td>{s.ped} {it.un || ''}</td>
                        <td>{s.ent} {it.un || ''}</td>
                        <td style={{ fontWeight: 700, color: s.pend > 0 ? '#B91C1C' : 'var(--muted)' }}>{s.pend} {it.un || ''}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{s.ent > 0 ? fmtR$(s.ent * (Number(it.preco) || 0)) : '—'}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, color: m.c, background: m.b, padding: '2px 8px', borderRadius: 12 }}>{m.l}</span></td>
                      </tr>) })}</tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', fontSize: 12 }}>
                  <span style={{ color: '#15803D', fontWeight: 700 }}>✓ Entregue: {fmtR$(valorEntregue(p))}</span>
                  <span style={{ color: pendTotal > 0.0001 ? '#B91C1C' : 'var(--muted)', fontWeight: 700 }}>Falta: {fmtR$(valorPendente(p))}</span>
                </div>
                {desviosDe(p).length > 0 && <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#B91C1C', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={12} /> Desvios / ocorrências</div>
                  {desviosDe(p).map((d, k) => <div key={k} style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 0' }}>{fmtD(d.data)} · <strong>{d.produto}</strong> — {ocorrLabel(d.tipo)}{d.descricao ? `: ${d.descricao}` : ''}</div>)}
                </div>}
                {(p.entregas || []).length > 0 && <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>📥 Entregas registradas</div>
                  {(p.entregas || []).map(e => { const nd = (e.itens || []).filter(i => i.desvio?.tipo).length; return <div key={e.id} style={{ fontSize: 12, color: 'var(--muted)', padding: '3px 0' }}>{fmtD(e.data)}{e.hora ? ` ${e.hora}` : ''} · {(e.itens || []).filter(i => (Number(i.qtd) || 0) > 0).length} item(ns){e.responsavel ? ` · ${e.responsavel}` : ''}{e.nf ? ` · NF ${e.nf}` : ''}{nd ? ` · ⚠ ${nd} desvio(s)` : ''}{e.obs ? ` · ${e.obs}` : ''}</div> })}
                </div>}
                {(p.historico || []).length > 0 && <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}><History size={12} /> Histórico</div>
                  {(p.historico || []).slice().reverse().map((h, k) => <div key={k} style={{ fontSize: 11.5, color: 'var(--muted)', padding: '2px 0' }}>{new Date(h.em).toLocaleString('pt-BR')} — <strong>{h.quem}</strong>: {h.acao}{h.detalhe ? ` (${h.detalhe})` : ''}{h.de != null ? ` · de ${h.de} → ${h.para}` : ''}{h.motivo ? ` · motivo: ${h.motivo}` : ''}</div>)}
                </div>}
              </div>}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

// ── Modal: confirmação do fornecedor ──
function ConfirmarModal({ p, onClose, onSave }: { p: Pedido; onClose: () => void; onSave: any }) {
  const [prev, setPrev] = useState(p.prev_entrega || p.data || hoje())
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Overlay onClose={onClose} title="✅ Confirmação do fornecedor">
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{p.fornecedor} · {p.loja}. Registre a confirmação e a previsão de entrega — isso antecipa possíveis rupturas.</div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Previsão de entrega</label>
      <input type="date" value={prev} onChange={e => setPrev(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 10 }} />
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Observações do fornecedor (alterações de qtd, etc.)</label>
      <textarea value={obs} onChange={e => setObs(e.target.value)} style={{ ...inp, width: '100%', minHeight: 60, resize: 'vertical' }} placeholder="Ex.: sem acém hoje, entrega parcial amanhã…" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
        <button className="btn" onClick={async () => { setBusy(true); await onSave(p, prev, obs); setBusy(false); onClose() }} disabled={busy} style={{ padding: '9px 16px', opacity: busy ? .6 : 1 }}>{busy ? 'Salvando…' : 'Confirmar'}</button>
      </div>
    </Overlay>
  )
}

// ── Modal: registrar entrega/conferência (parcial suportada) ──
function RegistrarEntregaModal({ p, onClose, salvarPedido, user }: { p: Pedido; onClose: () => void; salvarPedido: any; user: any }) {
  const itens = p.itens || []
  const [qts, setQts] = useState<Record<number, string>>(() => {
    const o: Record<number, string> = {}
    itens.forEach((it, i) => { o[i] = String(itemSituacao(p, it).pend || '') })
    return o
  })
  const [data, setData] = useState(hoje())
  const [hora, setHora] = useState(agoraHora())
  const [resp, setResp] = useState(user?.name || '')
  const [nf, setNf] = useState('')
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [desv, setDesv] = useState<Record<number, { tipo: string; descricao: string }>>({})
  const [desvOpen, setDesvOpen] = useState<Set<number>>(new Set())
  const toggleDesv = (i: number) => setDesvOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })
  const setDesvio = (i: number, patch: Partial<{ tipo: string; descricao: string }>) => setDesv(d => ({ ...d, [i]: { tipo: d[i]?.tipo ?? '', descricao: d[i]?.descricao ?? '', ...patch } }))
  const valorTotal = itens.reduce((s, it, i) => s + (Number(qts[i]) || 0) * (Number(it.preco) || 0), 0)
  const nDesvios = Object.values(desv).filter(d => d?.tipo).length

  const salvar = async () => {
    const linhas: EntregaItem[] = itens.map((it, i) => {
      const qtd = Number(qts[i]) || 0
      const d = desv[i]?.tipo ? { tipo: desv[i].tipo, descricao: desv[i].descricao?.trim() || undefined } : undefined
      return { produto: it.produto, qtd, desvio: d }
    }).filter(l => l.qtd > 0 || l.desvio) // inclui item não entregue se tiver desvio (ex.: faturado e não entregue)
    if (!linhas.length) { alert('Informe ao menos 1 quantidade recebida ou registre um desvio.'); return }
    if (!resp.trim()) { alert('Informe o responsável pelo recebimento.'); return }
    setBusy(true)
    const entrega: Entrega = { id: 'e' + Date.now().toString(36), em: new Date().toISOString(), data, hora, responsavel: resp.trim(), nf: nf.trim() || undefined, obs: obs.trim() || undefined, itens: linhas }
    const totalItens = linhas.filter(l => l.qtd > 0).length
    const detDesv = nDesvios ? `, ${nDesvios} desvio(s)` : ''
    await salvarPedido(p.chave, { entregas: [...(p.entregas || []), entrega] },
      { em: new Date().toISOString(), quem: user?.name || 'Painel', acao: 'Entrega registrada', detalhe: `${totalItens} item(ns), ${fmtR$(valorTotal)}${detDesv}`, motivo: nf.trim() ? `NF ${nf.trim()}` : undefined })
    setBusy(false); onClose()
  }

  return (
    <Overlay onClose={onClose} title="📥 Registrar entrega & conferência" wide>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{p.numero ? p.numero + ' · ' : ''}{p.fornecedor} · {p.loja}. Informe o que <strong>chegou agora</strong> (o pendente é sugerido). Entregas parciais somam ao total — o pedido só fecha quando o pendente zerar.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Data<input type="date" value={data} onChange={e => setData(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Hora<input type="time" value={hora} onChange={e => setHora(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Recebido por<input value={resp} onChange={e => setResp(e.target.value)} placeholder="Nome" style={inp} /></label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Nº da nota fiscal<input value={nf} onChange={e => setNf(e.target.value)} placeholder="Opcional" style={inp} /></label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido</th><th>Já entr.</th><th>Recebido agora</th><th>Ficará pend.</th><th>Valor</th><th>Desvio</th></tr></thead>
          <tbody>{itens.map((it, i) => { const s = itemSituacao(p, it); const receb = Number(qts[i]) || 0; const restante = Math.max(0, Math.round((s.pend - receb) * 1000) / 1000); const vLin = receb * (Number(it.preco) || 0); const temD = !!desv[i]?.tipo; return (
            <Fragment key={i}>
            <tr style={{ borderTop: '1px solid var(--border)', background: temD ? 'rgba(220,38,38,0.05)' : undefined }}>
              <td style={{ padding: 6, fontWeight: 600 }}>{it.produto}</td>
              <td>{s.ped} {it.un || ''}</td>
              <td style={{ color: 'var(--muted)' }}>{s.ent}</td>
              <td style={{ width: 96 }}><input type="number" min={0} step="0.001" value={qts[i]} onChange={e => setQts(q => ({ ...q, [i]: e.target.value }))} style={{ ...inp, width: 88 }} /></td>
              <td style={{ fontWeight: 700, color: restante > 0 ? '#B91C1C' : '#15803D' }}>{restante} {it.un || ''}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{vLin > 0 ? fmtR$(vLin) : '—'}</td>
              <td><button onClick={() => toggleDesv(i)} title="Registrar desvio/ocorrência" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '4px 7px', borderRadius: 7, border: '1px solid ' + (temD ? '#DC2626' : 'var(--border)'), background: temD ? '#FEE2E2' : 'var(--bg)', color: temD ? '#DC2626' : 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}><AlertTriangle size={12} />{temD ? 'Desvio' : 'Ok'}</button></td>
            </tr>
            {desvOpen.has(i) && <tr style={{ background: 'rgba(245,158,11,0.06)' }}><td colSpan={7} style={{ padding: '8px 6px' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ minWidth: 220 }}><label style={{ fontSize: 11, color: 'var(--muted)' }}>Tipo de ocorrência</label>
                  <select style={{ ...inp, width: '100%' }} value={desv[i]?.tipo || ''} onChange={e => setDesvio(i, { tipo: e.target.value })}><option value="">— sem desvio —</option>{OCORRENCIAS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
                <div style={{ flex: 1, minWidth: 220 }}><label style={{ fontSize: 11, color: 'var(--muted)' }}>Descrição</label>
                  <input style={{ ...inp, width: '100%' }} value={desv[i]?.descricao || ''} onChange={e => setDesvio(i, { descricao: e.target.value })} placeholder="Detalhe o ocorrido" /></div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>💡 Item faturado e não entregue? Deixe a qtd 0 e marque o desvio.</div>
              </div>
            </td></tr>}
            </Fragment>) })}</tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{nDesvios > 0 ? `⚠ ${nDesvios} desvio(s) registrado(s) · ` : ''}itens só entram no relatório do dia da entrega.</span>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Valor desta entrega: <span style={{ color: 'var(--bordo)' }}>{fmtR$(valorTotal)}</span></div>
      </div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '12px 0 4px' }}>Observações gerais da entrega</label>
      <textarea value={obs} onChange={e => setObs(e.target.value)} style={{ ...inp, width: '100%', minHeight: 54, resize: 'vertical' }} />
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>💡 Para leitura de nota por IA, comparativo NF × recebimento e baixa no estoque, use o <strong>📥 Recebimento Inteligente</strong> — aqui o foco é o controle do ciclo (pedido × entregue × pendente × desvios × valor).</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
        <button className="btn" onClick={salvar} disabled={busy} style={{ padding: '9px 16px', opacity: busy ? .6 : 1 }}>{busy ? 'Salvando…' : 'Registrar entrega'}</button>
      </div>
    </Overlay>
  )
}

// ── Modal: fechar / tratar pendência ──
function FecharModal({ p, onClose, salvarPedido, user }: { p: Pedido; onClose: () => void; salvarPedido: any; user: any }) {
  const pendTotal = (p.itens || []).reduce((s, it) => s + itemSituacao(p, it).pend, 0)
  const concluido = pendTotal <= 0.0001
  const [tipo, setTipo] = useState(concluido ? 'concluido' : 'tratado_cancelado')
  const [motivo, setMotivo] = useState('')
  const [busy, setBusy] = useState(false)
  const TIPOS = concluido
    ? [['concluido', 'Concluído — tudo entregue']]
    : [['tratado_cancelado', 'Pendência cancelada (não virá)'], ['tratado_substituido', 'Substituído por outro pedido/fornecedor'], ['tratado_aceito', 'Aceito parcial (encerrar assim mesmo)']]
  const fechar = async () => {
    if (!concluido && !motivo.trim()) { alert('Descreva como a pendência foi tratada.'); return }
    setBusy(true)
    const fechamento: Fechamento = { fechado: true, em: new Date().toISOString(), por: user?.name || 'Painel', tipo, motivo: motivo.trim() || undefined }
    await salvarPedido(p.chave, { fechamento },
      { em: new Date().toISOString(), quem: user?.name || 'Painel', acao: concluido ? 'Pedido fechado (concluído)' : 'Pendência tratada — pedido encerrado', detalhe: (TIPOS.find(t => t[0] === tipo) || [])[1] as string, motivo: motivo.trim() || undefined })
    setBusy(false); onClose()
  }
  return (
    <Overlay onClose={onClose} title={concluido ? '🔒 Fechar pedido' : '⚠️ Tratar pendência e encerrar'}>
      {concluido
        ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#15803D', background: '#DCFCE7', border: '1px solid #A7F3D0', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}><CheckCircle2 size={16} /> Todos os itens foram entregues. O pedido pode ser fechado como <strong>concluído</strong>.</div>
        : <div style={{ fontSize: 13, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>Ainda há <strong>{Math.round(pendTotal * 1000) / 1000}</strong> em pendência. Um pedido só encerra se a pendência for formalmente tratada — descreva abaixo.</div>}
      {!concluido && <>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Como tratar</label>
        <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inp, width: '100%', marginBottom: 10 }}>{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Motivo / providência *</label>
        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} style={{ ...inp, width: '100%', minHeight: 60, resize: 'vertical' }} placeholder="Ex.: fornecedor não terá o item; compra emergencial feita no pedido PC-AM-2026-000130." />
      </>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={onClose} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
        <button className="btn" onClick={fechar} disabled={busy} style={{ padding: '9px 16px', background: '#15803D', opacity: busy ? .6 : 1 }}>{busy ? 'Fechando…' : concluido ? 'Fechar como concluído' : 'Encerrar pedido'}</button>
      </div>
    </Overlay>
  )
}

// ═══════════════ ABA: CONFERÊNCIA POR LOJA (editável) ═══════════════
// Loja por loja, produto a produto: Pedido · Chegou (editável) · Falta.
// Editar "Chegou" e salvar registra a entrega no(s) pedido(s) daquela loja (atualiza tudo).
// Barra de disparo: escolhe quem recebe o relatório e envia o link.
function TabConferencia({ pedidos, loja, diaRel, setDiaRel, reload, user, toast }: any) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string>('')
  const [soFalta, setSoFalta] = useState(false)
  // disparo
  const [profs, setProfs] = useState<{ nome: string; fone: string }[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [fone, setFone] = useState('')
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { (async () => {
    const { data } = await sb.from('profiles').select('name,permissions_override')
    const seen = new Set<string>(); const uniq: { nome: string; fone: string }[] = []
    ;(data || []).forEach((p: any) => { const perf = p.permissions_override?.__perfil__ || {}; const f = String(perf.whatsapp || perf.telefone || '').replace(/\D/g, ''); if (p.name && f.length >= 10 && !seen.has(f)) { seen.add(f); uniq.push({ nome: p.name, fone: f }) } })
    uniq.sort((a, b) => a.nome.localeCompare(b.nome)); setProfs(uniq)
  })() }, [])
  const toggleSel = (f: string) => setSel(s => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n })
  const lojaParam = loja && loja !== 'Todas as Lojas' ? '&loja=' + encodeURIComponent(loja) : ''
  const link = `${siteOrigin()}/relatorio-ciclo.html?d=${diaRel}${lojaParam}`
  const dispararRelatorio = async () => {
    const alvos = new Set<string>(sel)
    const f = fone.replace(/\D/g, ''); if (f.length >= 10) alvos.add(f)
    if (!alvos.size) { toast('Escolha quem vai receber ou informe um WhatsApp.', 'error'); return }
    const msg = `🔄 *Ciclo de Compras — Conferência por Loja*\n${fmtD(diaRel)}${loja && loja !== 'Todas as Lojas' ? ` · ${loja}` : ' · Todas as lojas'}\n\nPor produto: Pedido × Chegou × Falta (loja por loja):\n${link}\n— Compras Amore 💚`
    setEnviando(true)
    try { let ok = 0; for (const a of alvos) { if (await enviarWhatsApp(a, msg)) ok++ }; toast(`Relatório enviado para ${ok}/${alvos.size} destino(s). ✅`) }
    catch { toast('Não foi possível enviar.', 'error') } finally { setEnviando(false) }
  }

  // pedidos abertos agrupados por loja → produtos consolidados
  const porLoja = useMemo(() => {
    const abertos = (pedidos as Pedido[]).filter(p => !p.fechamento?.fechado)
    const lojas: Record<string, { produtos: Record<string, { produto: string; un: string; pedido: number; chegou: number; pedidos: { chave: string; pend: number }[] }> }> = {}
    abertos.forEach(p => {
      const L = p.loja || '—'
      if (!lojas[L]) lojas[L] = { produtos: {} }
      ;(p.itens || []).forEach(it => {
        const k = normP(it.produto)
        const s = itemSituacao(p, it)
        if (!lojas[L].produtos[k]) lojas[L].produtos[k] = { produto: it.produto, un: it.un || '', pedido: 0, chegou: 0, pedidos: [] }
        const row = lojas[L].produtos[k]
        row.pedido += s.ped; row.chegou += s.ent
        if (s.pend > 0.0001) row.pedidos.push({ chave: p.chave, pend: s.pend })
      })
    })
    return Object.entries(lojas).map(([loja, o]) => ({
      loja,
      produtos: Object.values(o.produtos).map(r => ({ ...r, pedido: Math.round(r.pedido * 1000) / 1000, chegou: Math.round(r.chegou * 1000) / 1000 }))
        .sort((a, b) => (b.pedido - b.chegou) - (a.pedido - a.chegou)),
    })).sort((a, b) => a.loja.localeCompare(b.loja))
  }, [pedidos])

  const salvarLoja = async (loja: string, produtos: any[]) => {
    // acumula deltas de "chegou" por pedido → uma entrega por pedido (data de hoje)
    const porPedido: Record<string, { chave: string; itens: { produto: string; qtd: number }[] }> = {}
    let mudou = 0
    for (const r of produtos) {
      const k = loja + '|' + normP(r.produto)
      const raw = edits[k]
      if (raw == null || raw === '') continue
      const novo = Number(raw)
      if (isNaN(novo)) continue
      let delta = Math.round((novo - r.chegou) * 1000) / 1000
      if (delta <= 0.0001) continue // só aplica aumento de "chegou"
      mudou++
      // distribui o delta nos pedidos com pendência (primeiro que aparece)
      for (const ped of r.pedidos) {
        if (delta <= 0.0001) break
        const usar = Math.min(delta, ped.pend)
        if (usar <= 0.0001) continue
        if (!porPedido[ped.chave]) porPedido[ped.chave] = { chave: ped.chave, itens: [] }
        porPedido[ped.chave].itens.push({ produto: r.produto, qtd: Math.round(usar * 1000) / 1000 })
        delta = Math.round((delta - usar) * 1000) / 1000
      }
    }
    if (!mudou) { toast('Nada para atualizar nesta loja — edite "Chegou".', 'error'); return }
    const chaves = Object.keys(porPedido)
    if (!chaves.length) { toast('Os valores informados já estão entregues (sem pendência).', 'error'); return }
    setBusy(loja)
    try {
      for (const chave of chaves) {
        const p = (pedidos as Pedido[]).find(x => x.chave === chave); if (!p) continue
        const entrega: Entrega = { id: 'e' + Date.now().toString(36) + Math.floor(Math.random() * 99), em: new Date().toISOString(), data: hoje(), hora: agoraHora(), responsavel: user?.name || 'Conferência', obs: 'Conferência por loja', itens: porPedido[chave].itens }
        const totalItens = porPedido[chave].itens.length
        const { chave: _c, ...rest } = { ...p }
        const valor: any = { ...rest, entregas: [...(p.entregas || []), entrega], historico: [...(p.historico || []), { em: new Date().toISOString(), quem: user?.name || 'Painel', acao: 'Entrega (conferência por loja)', detalhe: `${totalItens} item(ns)` }] }
        await sb.from('app_config').upsert({ chave, valor }, { onConflict: 'chave' })
      }
      toast(`Conferência de ${loja} atualizada. ✅`)
      setEdits({}); await reload()
    } catch { toast('Não foi possível atualizar.', 'error') }
    finally { setBusy('') }
  }

  if (!porLoja.length) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>Nenhum pedido em aberto para conferir. Gere pedidos em <strong>🧾 Pedidos de Compra</strong>.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, fontSize: 12.5, color: 'var(--muted)' }}>Confira <strong>loja por loja</strong>: quanto foi pedido, quanto chegou e o que falta. Edite <strong>Chegou</strong> e salve — atualiza os pedidos, as pendências e a Gestão de Compras.</div>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={soFalta} onChange={e => setSoFalta(e.target.checked)} /> Só o que falta</label>
      </div>

      {/* Barra de disparo — escolher quem recebe + enviar */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>📲 Disparar relatório</div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>Dia <input type="date" value={diaRel} onChange={e => setDiaRel(e.target.value)} style={{ ...inp, padding: '5px 8px' }} /></label>
          <div style={{ flex: 1 }} />
          <a href={link} target="_blank" rel="noreferrer" className="btn" style={{ padding: '7px 12px', fontSize: 12, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}><ExternalLink size={13} /> Abrir</a>
          <button onClick={async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado. 📋') } catch { toast('Não foi possível copiar.', 'error') } }} className="btn" style={{ padding: '7px 12px', fontSize: 12, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Copy size={13} /> Copiar</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>Direcione para quem vai receber:</div>
        {profs.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {profs.map(pr => { const on = sel.has(pr.fone); return (
            <button key={pr.fone} onClick={() => toggleSel(pr.fone)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--bordo)' : 'var(--border)'), background: on ? 'var(--bordo)' : 'var(--bg)', color: on ? '#fff' : 'var(--text)' }}>{on ? '✓ ' : ''}{pr.nome}</button>
          ) })}
        </div>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Ou um WhatsApp avulso<input value={fone} onChange={e => setFone(e.target.value)} placeholder="Ex.: 81 99999-9999" style={{ ...inp, minWidth: 180 }} /></label>
          <div style={{ flex: 1 }} />
          <button onClick={dispararRelatorio} disabled={enviando} className="btn" style={{ padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: enviando ? .6 : 1 }}><Send size={15} /> {enviando ? 'Enviando…' : `Disparar (${sel.size + (fone.replace(/\D/g, '').length >= 10 ? 1 : 0)})`}</button>
        </div>
      </div>

      {porLoja.map(({ loja, produtos }) => {
        const lista = soFalta ? produtos.filter(r => (r.pedido - r.chegou) > 0.0001) : produtos
        const totFalta = produtos.reduce((s, r) => s + Math.max(0, r.pedido - r.chegou), 0)
        return (
          <div key={loja} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--bordo)' }}>🏪 {loja}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{produtos.length} produto(s){totFalta > 0.0001 ? ` · falta entregar itens` : ' · tudo entregue'}</div>
              <div style={{ flex: 1 }} />
              <button onClick={() => salvarLoja(loja, produtos)} disabled={busy === loja} className="btn" style={{ padding: '8px 15px', fontSize: 12.5, opacity: busy === loja ? .6 : 1 }}>{busy === loja ? 'Salvando…' : '💾 Salvar atualização'}</button>
            </div>
            {lista.length === 0 ? <div style={{ fontSize: 12.5, color: '#15803D' }}>✅ Tudo entregue nesta loja.</div> : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido</th><th>Chegou</th><th>Falta</th></tr></thead>
                <tbody>{lista.map((r, k) => {
                  const key = loja + '|' + normP(r.produto)
                  const chegouEdit = edits[key] != null ? edits[key] : String(r.chegou)
                  const chegouNum = Number(chegouEdit) || 0
                  const falta = Math.max(0, Math.round((r.pedido - chegouNum) * 1000) / 1000)
                  return (
                    <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{r.produto}</td>
                      <td>{r.pedido} {r.un}</td>
                      <td style={{ width: 120 }}><input type="number" min={0} step="0.001" value={chegouEdit} onChange={e => setEdits(ed => ({ ...ed, [key]: e.target.value }))} style={{ ...inp, width: 104, ...(chegouNum > r.chegou + 0.0001 ? { borderColor: '#15803D', background: 'rgba(34,197,94,0.06)' } : {}) }} /> {r.un}</td>
                      <td style={{ fontWeight: 700, color: falta > 0.0001 ? '#B91C1C' : '#15803D' }}>{falta} {r.un}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>💡 Aumentar <strong>Chegou</strong> e salvar registra a entrega (data de hoje) e some da pendência. Para corrigir uma entrega lançada errada, use a aba <strong>Pedidos & Ciclo</strong>.</div>
            </div>}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════ ABA: PEDIDO MACRO SEMANAL ═══════════════
function TabMacro({ pedidos, semana, setSemana }: any) {
  const { ini, fim } = semanaISO(semana)
  const daSemana = (pedidos as Pedido[]).filter(p => { const d = (p.data || '').slice(0, 10); return d >= ini && d <= fim })
  // consolidação por produto
  const porProduto = useMemo(() => {
    const m: Record<string, { nome: string; un: string; ped: number; ent: number }> = {}
    daSemana.forEach(p => (p.itens || []).forEach(it => {
      const s = itemSituacao(p, it); const k = normP(it.produto)
      if (!m[k]) m[k] = { nome: it.produto, un: it.un || '', ped: 0, ent: 0 }
      m[k].ped += s.ped; m[k].ent += s.ent
    }))
    return Object.values(m).map(r => ({ ...r, ped: Math.round(r.ped * 1000) / 1000, ent: Math.round(r.ent * 1000) / 1000, falta: Math.max(0, Math.round((r.ped - r.ent) * 1000) / 1000) }))
      .sort((a, b) => b.falta - a.falta)
  }, [daSemana])
  const linhas = daSemana.flatMap(p => (p.itens || []).map(it => itemSituacao(p, it).sit))
  const tot = linhas.length, ent = linhas.filter(s => s === 'ok').length, parc = linhas.filter(s => s === 'parcial').length, nao = linhas.filter(s => s === 'nao').length
  const semAnterior = () => { const d = new Date(ini + 'T00:00:00'); d.setDate(d.getDate() - 7); setSemana(d.toISOString().slice(0, 10)) }
  const semProxima = () => { const d = new Date(ini + 'T00:00:00'); d.setDate(d.getDate() + 7); setSemana(d.toISOString().slice(0, 10)) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={semAnterior} className="btn" style={{ padding: '6px 12px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>◀</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>Semana {fmtD(ini)} — {fmtD(fim)} <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· {daSemana.length} pedido(s)</span></div>
        <button onClick={semProxima} className="btn" style={{ padding: '6px 12px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>▶</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
        {[['Total de itens', tot, 'var(--text)'], ['🟢 Entregues', ent, '#15803D'], ['🟡 Parcial', parc, '#B45309'], ['🔴 Pendentes', nao, '#B91C1C']].map(([l, v, c]) => (
          <div key={l as string} style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: c as string }}>{v as number}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{l as string}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Controle por produto <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· consolidado da semana</span></div>
        {porProduto.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nenhum pedido nesta semana.</div> : <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido total</th><th>Entregue</th><th>Falta entregar</th><th>Situação</th></tr></thead>
            <tbody>{porProduto.map((r, k) => { const sit = r.falta <= 0.0001 ? 'ok' : r.ent > 0 ? 'parcial' : 'nao'; const m = SIT_META[sit]; return (
              <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: 6, fontWeight: 600 }}>{r.nome}</td>
                <td>{r.ped} {r.un}</td>
                <td>{r.ent} {r.un}</td>
                <td style={{ fontWeight: 700, color: r.falta > 0 ? '#B91C1C' : 'var(--muted)' }}>{r.falta} {r.un}</td>
                <td><span style={{ fontSize: 11, fontWeight: 700, color: m.c, background: m.b, padding: '2px 8px', borderRadius: 12 }}>{m.l}</span></td>
              </tr>) })}</tbody>
          </table>
        </div>}
      </div>
    </div>
  )
}

// ═══════════════ ABA: PENDÊNCIAS ═══════════════
function TabPendencias({ pedidos, openRec }: { pedidos: Pedido[]; openRec: (p: Pedido) => void }) {
  const abertos = pedidos.filter(p => !p.fechamento?.fechado)
  // agrupa por pedido (só os que têm item pendente), ordenado por atraso
  const grupos = abertos.map(p => ({ p, itens: (p.itens || []).map(it => ({ it, s: itemSituacao(p, it) })).filter(x => x.s.pend > 0.0001) }))
    .filter(g => g.itens.length > 0)
    .sort((a, b) => diasAtraso(b.p.prev_entrega) - diasAtraso(a.p.prev_entrega))
  const totItens = grupos.reduce((s, g) => s + g.itens.length, 0)
  const totFalta = grupos.reduce((s, g) => s + valorPendente(g.p), 0)
  if (!grupos.length) return <div style={{ textAlign: 'center', padding: 40, color: '#15803D', fontSize: 14, border: '1px dashed var(--border)', borderRadius: 10 }}>✅ Nenhuma pendência de entrega em aberto nesta loja.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...card, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>🔴 Pendências de entrega em aberto</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{grupos.length} pedido(s) · {totItens} item(ns) · falta <strong style={{ color: '#B91C1C' }}>{fmtR$(totFalta)}</strong></div>
      </div>
      {grupos.map(({ p, itens }) => { const at = diasAtraso(p.prev_entrega); return (
        <div key={p.chave} style={{ ...card, ...(at > 0 ? { borderLeft: '4px solid #DC2626' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{p.fornecedor} {p.numero && <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: 'var(--muted)' }}>· {p.numero}</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.loja} · prev. {fmtD(p.prev_entrega)}{at > 0 ? ` · ⏰ ${at}d atraso` : ''} · falta {fmtR$(valorPendente(p))}</div>
            </div>
            <button onClick={() => openRec(p)} className="btn" style={{ padding: '7px 13px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><PackageCheck size={14} /> Atualizar entrega</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 460 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido</th><th>Entregue</th><th>Falta</th><th>Valor falta</th></tr></thead>
              <tbody>{itens.map(({ it, s }, k) => (
                <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 6, fontWeight: 600 }}>{it.produto}</td>
                  <td>{s.ped} {it.un || ''}</td>
                  <td style={{ color: 'var(--muted)' }}>{s.ent} {it.un || ''}</td>
                  <td style={{ fontWeight: 700, color: '#B91C1C' }}>{s.pend} {it.un || ''}</td>
                  <td>{fmtR$(s.pend * (Number(it.preco) || 0))}</td>
                </tr>) )}</tbody>
            </table>
          </div>
        </div>
      ) })}
    </div>
  )
}

// ═══════════════ ABA: RELATÓRIO DO DIA ═══════════════
// Fluxo: às 16h o relatório vai automático para o comprador (Esdras, cron VPS);
// ele revisa, alimenta as OBSERVAÇÕES, escolhe o usuário e faz o disparo manual.
function TabRelatorio({ pedidos, dia, setDia, loja, LOJAS, toast }: any) {
  const [lojaRel, setLojaRel] = useState(LOJAS.includes(loja) ? loja : 'Todas')
  const [fone, setFone] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [obs, setObs] = useState('')
  const [obsMap, setObsMap] = useState<Record<string, string>>({})
  const [salvandoObs, setSalvandoObs] = useState(false)
  const [profs, setProfs] = useState<{ nome: string; fone: string }[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const obsKey = `${lojaRel}|${dia}`

  // usuários com WhatsApp (para o disparo manual)
  useEffect(() => { (async () => {
    const { data } = await sb.from('profiles').select('name,permissions_override')
    const seen = new Set<string>(); const uniq: { nome: string; fone: string }[] = []
    ;(data || []).forEach((p: any) => { const perf = p.permissions_override?.__perfil__ || {}; const fone = String(perf.whatsapp || perf.telefone || '').replace(/\D/g, ''); if (p.name && fone.length >= 10 && !seen.has(fone)) { seen.add(fone); uniq.push({ nome: p.name, fone }) } })
    uniq.sort((a, b) => a.nome.localeCompare(b.nome)); setProfs(uniq)
  })() }, [])
  // observações salvas (app_config ciclo_rel_obs) — para o relatório mostrar
  useEffect(() => { (async () => { const { data } = await sb.from('app_config').select('valor').eq('chave', 'ciclo_rel_obs').maybeSingle(); setObsMap(data?.valor || {}) })() }, [])
  useEffect(() => { setObs(obsMap[obsKey] || '') }, [obsMap, obsKey])

  const salvarObs = async (avisar = true) => {
    setSalvandoObs(true)
    try { const novo = { ...obsMap, [obsKey]: obs }; setObsMap(novo); await sb.from('app_config').upsert({ chave: 'ciclo_rel_obs', valor: novo }, { onConflict: 'chave' }); if (avisar) toast('Observações salvas — já aparecem no relatório. ✅') }
    catch { if (avisar) toast('Não foi possível salvar as observações.', 'error') }
    finally { setSalvandoObs(false) }
  }
  const toggleSel = (fone: string) => setSel(s => { const n = new Set(s); n.has(fone) ? n.delete(fone) : n.add(fone); return n })

  const texto = useMemo(() => {
    const lista = (pedidos as Pedido[]).filter(p => lojaRel === 'Todas' || p.loja === lojaRel)
    const entregasDia: { p: Pedido; e: Entrega }[] = []
    lista.forEach(p => (p.entregas || []).forEach(e => { if ((e.data || '').slice(0, 10) === dia) entregasDia.push({ p, e }) }))
    const itensDia = entregasDia.flatMap(({ p, e }) => (e.itens || []).map(i => ({ p, i }))).filter(x => (Number(x.i.qtd) || 0) > 0)
    const nProdutos = new Set(itensDia.map(x => normP(x.i.produto))).size
    const precoDe = (p: Pedido, produto: string) => { const pit = (p.itens || []).find(x => normP(x.produto) === normP(produto)); return pit ? Number(pit.preco) || 0 : 0 }
    const valorDia = itensDia.reduce((s, x) => s + (Number(x.i.qtd) || 0) * precoDe(x.p, x.i.produto), 0)
    const nDesviosDia = entregasDia.reduce((s, x) => s + (x.e.itens || []).filter(i => i.desvio?.tipo).length, 0)
    const concluidosHoje = lista.filter(p => p.fechamento?.fechado && (p.fechamento.em || '').slice(0, 10) === dia && p.fechamento.tipo === 'concluido')
    const pend = lista.filter(p => !p.fechamento?.fechado).flatMap(p => (p.itens || []).map(it => ({ p, it, s: itemSituacao(p, it) })).filter(x => x.s.pend > 0.0001))

    let t = `📦 *RELATÓRIO DIÁRIO DE RECEBIMENTO*\n${fmtD(dia)} · ${lojaRel === 'Todas' ? 'Todas as lojas' : lojaRel}\n`
    t += `\n*Entregue no dia:* ${nProdutos} produto(s) · ${fmtR$(valorDia)} · ${concluidosHoje.length} pedido(s) concluído(s)${nDesviosDia ? ` · ⚠ ${nDesviosDia} desvio(s)` : ''}\n`
    if (entregasDia.length) {
      t += `\n📥 *ENTREGUE HOJE* (pedido → entregue · falta · valor)`
      entregasDia.forEach(({ p, e }) => {
        t += `\n• ${p.numero || p.fornecedor} — ${p.fornecedor}${e.hora ? ` (${e.hora})` : ''}${e.responsavel ? ` · recebeu ${e.responsavel}` : ''}${e.nf ? ` · NF ${e.nf}` : ''}`
        ;(e.itens || []).forEach(i => { const pit = (p.itens || []).find(x => normP(x.produto) === normP(i.produto)); const s = pit ? itemSituacao(p, pit) : null; const v = (Number(i.qtd) || 0) * (pit ? Number(pit.preco) || 0 : 0); t += `\n   - ${i.produto}: ped ${s ? s.ped : '—'} → entregue ${i.qtd}${s ? ` · falta ${s.pend}` : ''}${v > 0 ? ` · ${fmtR$(v)}` : ''}${i.desvio?.tipo ? ` · ⚠ ${ocorrLabel(i.desvio.tipo)}` : ''}` })
      })
    }
    if (pend.length) {
      t += `\n\n🔴 *PENDÊNCIAS DE ENTREGA*`
      const porPed: Record<string, { p: Pedido; itens: typeof pend }> = {}
      pend.forEach(x => { const k = x.p.chave; if (!porPed[k]) porPed[k] = { p: x.p, itens: [] }; porPed[k].itens.push(x) })
      Object.values(porPed).forEach(({ p, itens }) => {
        const at = diasAtraso(p.prev_entrega)
        t += `\n\nPedido: ${p.numero || '—'}\nFornecedor: ${p.fornecedor}${p.prev_entrega ? ` · prev. ${fmtD(p.prev_entrega)}` : ''}${at > 0 ? ` · ⏰ ${at}d atraso` : ''}`
        itens.forEach(x => t += `\n• ${x.it.produto} — faltam ${x.s.pend} ${x.it.un || ''}`)
      })
    } else {
      t += `\n\n✅ Sem pendências de entrega em aberto.`
    }
    if (obs.trim()) t += `\n\n📝 *OBSERVAÇÕES:* ${obs.trim()}`
    return t
  }, [pedidos, dia, lojaRel, obs])

  const link = useMemo(() => `${siteOrigin()}/relatorio-ciclo.html?d=${dia}${lojaRel !== 'Todas' ? '&loja=' + encodeURIComponent(lojaRel) : ''}`, [dia, lojaRel])
  const msgLink = useMemo(() => `📦 *Relatório Diário de Recebimento — Ciclo de Compras*\n${fmtD(dia)} · ${lojaRel === 'Todas' ? 'Todas as lojas' : lojaRel}\n\nEntregas do dia (pedido × entregue × falta × valor) e pendências no link:\n${link}${obs.trim() ? `\n\n📝 Observações: ${obs.trim()}` : ''}\n— Compras Amore 💚`, [dia, lojaRel, link, obs])

  const enviar = async () => {
    const alvos = new Set<string>(sel)
    const f = fone.replace(/\D/g, ''); if (f.length >= 10) alvos.add(f)
    if (!alvos.size) { toast('Escolha ao menos um usuário ou informe um WhatsApp.', 'error'); return }
    setEnviando(true)
    try {
      await salvarObs(false) // grava as observações para o link já mostrá-las
      let ok = 0; for (const a of alvos) { if (await enviarWhatsApp(a, msgLink)) ok++ }
      toast(`Relatório enviado para ${ok}/${alvos.size} destino(s). ✅`)
    } catch { toast('Não foi possível enviar.', 'error') } finally { setEnviando(false) }
  }
  const copiarLink = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado. 📋') } catch { toast('Não foi possível copiar.', 'error') } }
  const copiarTexto = async () => { try { await navigator.clipboard.writeText(texto); toast('Texto copiado. 📋') } catch { toast('Não foi possível copiar.', 'error') } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Dia<input type="date" value={dia} onChange={e => setDia(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Loja<select value={lojaRel} onChange={e => setLojaRel(e.target.value)} style={inp}><option value="Todas">Todas as lojas</option>{LOJAS.map((l: string) => <option key={l} value={l}>{l}</option>)}</select></label>
        <div style={{ flex: 1 }} />
        <a href={link} target="_blank" rel="noreferrer" className="btn" style={{ padding: '9px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ExternalLink size={14} /> Abrir</a>
        <button onClick={copiarLink} className="btn" style={{ padding: '9px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Copy size={14} /> Copiar link</button>
      </div>

      {/* Observações do comprador */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>📝 Observações do comprador <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11.5 }}>· entram no relatório e no disparo ({fmtD(dia)}{lojaRel !== 'Todas' ? ` · ${lojaRel}` : ''})</span></div>
        <textarea value={obs} onChange={e => setObs(e.target.value)} style={{ ...inp, width: '100%', minHeight: 64, resize: 'vertical' }} placeholder="Ex.: cobrar acém do frigorífico; combinei reposição amanhã; conferir validade do leite…" />
        <div style={{ marginTop: 8 }}><button onClick={() => salvarObs(true)} disabled={salvandoObs} className="btn" style={{ padding: '7px 14px', fontSize: 12.5, opacity: salvandoObs ? .6 : 1 }}>{salvandoObs ? 'Salvando…' : '💾 Salvar observações'}</button></div>
      </div>

      {/* Escolher usuário + disparo manual */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>📲 Enviar relatório <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11.5 }}>· escolha o(s) usuário(s) e dispare manualmente</span></div>
        {profs.length === 0 ? <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>Nenhum usuário com WhatsApp cadastrado. Use o campo abaixo para digitar um número.</div>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {profs.map(pr => { const on = sel.has(pr.fone); return (
              <button key={pr.fone} onClick={() => toggleSel(pr.fone)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--bordo)' : 'var(--border)'), background: on ? 'var(--bordo)' : 'var(--bg)', color: on ? '#fff' : 'var(--text)' }}>{on ? '✓ ' : ''}{pr.nome}</button>
            ) })}
          </div>}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Ou um WhatsApp avulso<input value={fone} onChange={e => setFone(e.target.value)} placeholder="Ex.: 81 99999-9999" style={{ ...inp, minWidth: 180 }} /></label>
          <div style={{ flex: 1 }} />
          <button onClick={enviar} disabled={enviando} className="btn" style={{ padding: '10px 18px', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: enviando ? .6 : 1 }}><Send size={15} /> {enviando ? 'Enviando…' : `Disparar (${sel.size + (fone.replace(/\D/g, '').length >= 10 ? 1 : 0)})`}</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Prévia do relatório · o WhatsApp envia o <b>link da página</b> + suas observações. Automação: às <b>16h</b> vai automático para o comprador revisar antes do disparo (cron VPS).</div>
          <button onClick={copiarTexto} className="btn" style={{ padding: '5px 10px', fontSize: 11.5, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Copy size={12} /> Copiar texto</button>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, margin: 0, lineHeight: 1.5 }}>{texto}</pre>
      </div>
    </div>
  )
}

// ── Overlay reutilizável ──
function Overlay({ children, onClose, title, wide }: { children: React.ReactNode; onClose: () => void; title: string; wide?: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: wide ? 720 : 480, margin: '24px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <strong style={{ fontSize: 16 }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
