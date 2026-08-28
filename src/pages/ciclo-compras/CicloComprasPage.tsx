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

// ── Tipos do ciclo (persistidos no blob do pedido em app_config) ──
interface PedidoItem { produto: string; qtd: number; un?: string; preco: number; subtotal?: number }
interface Entrega { id: string; em: string; data: string; hora?: string; responsavel?: string; nf?: string; obs?: string; itens: { produto: string; qtd: number }[] }
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
  const [tab, setTab] = useState<'ciclo' | 'macro' | 'pend' | 'rel'>('ciclo')
  const [aberto, setAberto] = useState<string | null>(null)
  const [semana, setSemana] = useState(() => semanaISO(hoje()).ini)
  const [diaRel, setDiaRel] = useState(hoje())

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
        {([['ciclo', <ClipboardList size={14} />, 'Pedidos & Ciclo'], ['macro', <CalendarDays size={14} />, 'Pedido Macro Semanal'], ['pend', <AlertTriangle size={14} />, 'Pendências'], ['rel', <Send size={14} />, 'Relatório do dia']] as const).map(([id, ic, lb]) => (
          <button key={id} onClick={() => setTab(id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: tab === id ? 'var(--bordo)' : 'var(--card)', color: tab === id ? '#fff' : 'var(--text)' }}>{ic}{lb}</button>
        ))}
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div> : <>
        {tab === 'ciclo' && <TabCiclo pedidos={filtrados} aberto={aberto} setAberto={setAberto} emitirNumero={emitirNumero} salvarPedido={salvarPedido} confirmarFornecedor={confirmarFornecedor} user={user} />}
        {tab === 'macro' && <TabMacro pedidos={filtrados} semana={semana} setSemana={setSemana} />}
        {tab === 'pend' && <TabPendencias pedidos={filtrados} />}
        {tab === 'rel' && <TabRelatorio pedidos={filtrados} dia={diaRel} setDia={setDiaRel} loja={loja} LOJAS={LOJAS} toast={toast} />}
      </>}
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }

// ═══════════════ ABA: PEDIDOS & CICLO ═══════════════
function TabCiclo({ pedidos, aberto, setAberto, emitirNumero, salvarPedido, confirmarFornecedor, user }: any) {
  const [confModal, setConfModal] = useState<Pedido | null>(null)
  const [recModal, setRecModal] = useState<Pedido | null>(null)
  const [fechModal, setFechModal] = useState<Pedido | null>(null)

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
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--bordo)' }}>{fmtR$(p.total || 0)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>🟢{entLinhas} · 🟡{parcLinhas} · 🔴{naoLinhas}</div>
                </div>
              </div>
              {/* barra de progresso da entrega */}
              {itens.length > 0 && <div style={{ marginTop: 10, height: 7, borderRadius: 4, background: 'var(--bg)', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: `${(entLinhas / itens.length) * 100}%`, background: '#22c55e' }} />
                <div style={{ width: `${(parcLinhas / itens.length) * 100}%`, background: '#f59e0b' }} />
              </div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button onClick={() => setAberto(isAberto ? null : p.chave)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>{isAberto ? 'Ocultar' : '🔎 Conferência'}</button>
                {!p.fechamento?.fechado && <button onClick={() => setRecModal(p)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}><PackageCheck size={14} /> Registrar entrega</button>}
                {!p.fechamento?.fechado && p.confirmacao?.confirmado !== 'sim' && <button onClick={() => setConfModal(p)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>✅ Confirmar fornecedor</button>}
                {!p.fechamento?.fechado && <button onClick={() => setFechModal(p)} className="btn" style={{ padding: '7px 12px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 5, background: pendTotal <= 0.0001 ? '#15803D' : 'var(--bg)', color: pendTotal <= 0.0001 ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}><Lock size={13} /> {pendTotal <= 0.0001 ? 'Fechar pedido' : 'Tratar pendência'}</button>}
                {p.fechamento?.fechado && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>🔒 {p.fechamento.tipo === 'concluido' ? 'Concluído' : 'Encerrado'} por {p.fechamento.por} em {p.fechamento.em ? new Date(p.fechamento.em).toLocaleDateString('pt-BR') : ''}{p.fechamento.motivo ? ` · ${p.fechamento.motivo}` : ''}</span>}
              </div>

              {isAberto && <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido</th><th>Entregue</th><th>Pendente</th><th>Situação</th></tr></thead>
                    <tbody>{itens.map((it, k) => { const s = itemSituacao(p, it); const m = SIT_META[s.sit]; return (
                      <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 6, fontWeight: 600 }}>{it.produto}</td>
                        <td>{s.ped} {it.un || ''}</td>
                        <td>{s.ent} {it.un || ''}</td>
                        <td style={{ fontWeight: 700, color: s.pend > 0 ? '#B91C1C' : 'var(--muted)' }}>{s.pend} {it.un || ''}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, color: m.c, background: m.b, padding: '2px 8px', borderRadius: 12 }}>{m.l}</span></td>
                      </tr>) })}</tbody>
                  </table>
                </div>
                {(p.entregas || []).length > 0 && <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>📥 Entregas registradas</div>
                  {(p.entregas || []).map(e => <div key={e.id} style={{ fontSize: 12, color: 'var(--muted)', padding: '3px 0' }}>{fmtD(e.data)}{e.hora ? ` ${e.hora}` : ''} · {(e.itens || []).length} item(ns){e.responsavel ? ` · ${e.responsavel}` : ''}{e.nf ? ` · NF ${e.nf}` : ''}{e.obs ? ` · ${e.obs}` : ''}</div>)}
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

      {confModal && <ConfirmarModal p={confModal} onClose={() => setConfModal(null)} onSave={confirmarFornecedor} />}
      {recModal && <RegistrarEntregaModal p={recModal} onClose={() => setRecModal(null)} salvarPedido={salvarPedido} user={user} />}
      {fechModal && <FecharModal p={fechModal} onClose={() => setFechModal(null)} salvarPedido={salvarPedido} user={user} />}
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

  const salvar = async () => {
    const linhas = itens.map((it, i) => ({ produto: it.produto, qtd: Number(qts[i]) || 0 })).filter(l => l.qtd > 0)
    if (!linhas.length) { alert('Informe ao menos 1 quantidade recebida.'); return }
    if (!resp.trim()) { alert('Informe o responsável pelo recebimento.'); return }
    setBusy(true)
    const entrega: Entrega = { id: 'e' + Date.now().toString(36), em: new Date().toISOString(), data, hora, responsavel: resp.trim(), nf: nf.trim() || undefined, obs: obs.trim() || undefined, itens: linhas }
    const totalItens = linhas.reduce((s, l) => s + l.qtd, 0)
    await salvarPedido(p.chave, { entregas: [...(p.entregas || []), entrega] },
      { em: new Date().toISOString(), quem: user?.name || 'Painel', acao: 'Entrega registrada', detalhe: `${linhas.length} item(ns), ${totalItens} un`, motivo: nf.trim() ? `NF ${nf.trim()}` : undefined })
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Pedido</th><th>Já entregue</th><th>Recebido agora</th><th>Ficará pendente</th></tr></thead>
          <tbody>{itens.map((it, i) => { const s = itemSituacao(p, it); const receb = Number(qts[i]) || 0; const restante = Math.max(0, Math.round((s.pend - receb) * 1000) / 1000); return (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ padding: 6, fontWeight: 600 }}>{it.produto}</td>
              <td>{s.ped} {it.un || ''}</td>
              <td style={{ color: 'var(--muted)' }}>{s.ent}</td>
              <td style={{ width: 110 }}><input type="number" min={0} step="0.001" value={qts[i]} onChange={e => setQts(q => ({ ...q, [i]: e.target.value }))} style={{ ...inp, width: 100 }} /></td>
              <td style={{ fontWeight: 700, color: restante > 0 ? '#B91C1C' : '#15803D' }}>{restante} {it.un || ''}</td>
            </tr>) })}</tbody>
        </table>
      </div>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '12px 0 4px' }}>Observações (avarias, divergências…)</label>
      <textarea value={obs} onChange={e => setObs(e.target.value)} style={{ ...inp, width: '100%', minHeight: 54, resize: 'vertical' }} />
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>💡 Para leitura de nota por IA, comparativo NF × recebimento e baixa no estoque, use o <strong>📥 Recebimento Inteligente</strong> — aqui o foco é o controle do ciclo (pedido × entregue × pendente).</div>
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
function TabPendencias({ pedidos }: { pedidos: Pedido[] }) {
  const abertos = pedidos.filter(p => !p.fechamento?.fechado)
  const linhas = abertos.flatMap(p => (p.itens || []).map(it => ({ p, it, s: itemSituacao(p, it) })).filter(x => x.s.pend > 0.0001))
    .sort((a, b) => diasAtraso(b.p.prev_entrega) - diasAtraso(a.p.prev_entrega))
  if (!linhas.length) return <div style={{ textAlign: 'center', padding: 40, color: '#15803D', fontSize: 14, border: '1px dashed var(--border)', borderRadius: 10 }}>✅ Nenhuma pendência de entrega em aberto nesta loja.</div>
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🔴 Pendências de entrega em aberto <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 12 }}>· {linhas.length} item(ns)</span></div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 680 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Falta</th><th>Fornecedor</th><th>Pedido</th><th>Loja</th><th>Prev.</th><th>Atraso</th></tr></thead>
          <tbody>{linhas.map((x, k) => { const at = diasAtraso(x.p.prev_entrega); return (
            <tr key={k} style={{ borderTop: '1px solid var(--border)', background: at > 0 ? 'rgba(220,38,38,0.05)' : undefined }}>
              <td style={{ padding: 6, fontWeight: 600 }}>{x.it.produto}</td>
              <td style={{ fontWeight: 700, color: '#B91C1C' }}>{x.s.pend} {x.it.un || ''}</td>
              <td>{x.p.fornecedor}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{x.p.numero || '—'}</td>
              <td>{x.p.loja}</td>
              <td>{fmtD(x.p.prev_entrega)}</td>
              <td style={{ fontWeight: 700, color: at > 0 ? '#B91C1C' : 'var(--muted)' }}>{at > 0 ? `⏰ ${at}d` : '—'}</td>
            </tr>) })}</tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════ ABA: RELATÓRIO DO DIA (17h30) ═══════════════
function TabRelatorio({ pedidos, dia, setDia, loja, LOJAS, toast }: any) {
  const [lojaRel, setLojaRel] = useState(LOJAS.includes(loja) ? loja : 'Todas')
  const [fone, setFone] = useState('')
  const [enviando, setEnviando] = useState(false)

  const texto = useMemo(() => {
    const lista = (pedidos as Pedido[]).filter(p => lojaRel === 'Todas' || p.loja === lojaRel)
    // entregas do dia
    const entregasDia: { p: Pedido; e: Entrega }[] = []
    lista.forEach(p => (p.entregas || []).forEach(e => { if ((e.data || '').slice(0, 10) === dia) entregasDia.push({ p, e }) }))
    const nRecebidos = entregasDia.reduce((s, x) => s + (x.e.itens || []).length, 0)
    const concluidosHoje = lista.filter(p => p.fechamento?.fechado && (p.fechamento.em || '').slice(0, 10) === dia && p.fechamento.tipo === 'concluido')
    // pendências abertas
    const pend = lista.filter(p => !p.fechamento?.fechado).flatMap(p => (p.itens || []).map(it => ({ p, it, s: itemSituacao(p, it) })).filter(x => x.s.pend > 0.0001))

    let t = `📦 *RELATÓRIO DIÁRIO DE RECEBIMENTO*\n${fmtD(dia)} · ${lojaRel === 'Todas' ? 'Todas as lojas' : lojaRel}\n`
    t += `\n*Entregas do dia:* ${entregasDia.length} · ${nRecebidos} item(ns) recebido(s) · ${concluidosHoje.length} pedido(s) concluído(s)\n`
    if (entregasDia.length) {
      t += `\n📥 *ENTREGUE HOJE*`
      entregasDia.forEach(({ p, e }) => { t += `\n• ${p.numero || p.fornecedor} — ${p.fornecedor}${e.hora ? ` (${e.hora})` : ''}${e.responsavel ? ` · recebeu ${e.responsavel}` : ''}${e.nf ? ` · NF ${e.nf}` : ''}`; (e.itens || []).forEach(i => t += `\n   - ${i.qtd} ${i.produto}`) })
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
    return t
  }, [pedidos, dia, lojaRel])

  const link = useMemo(() => `${siteOrigin()}/relatorio-ciclo.html?d=${dia}${lojaRel !== 'Todas' ? '&loja=' + encodeURIComponent(lojaRel) : ''}`, [dia, lojaRel])
  const msgLink = useMemo(() => `📦 *Relatório Diário de Recebimento — Ciclo de Compras*\n${fmtD(dia)} · ${lojaRel === 'Todas' ? 'Todas as lojas' : lojaRel}\n\nEntregas do dia e pendências em aberto no link (layout do painel):\n${link}\n— Compras Amore 💚`, [dia, lojaRel, link])

  const enviar = async () => {
    const f = fone.replace(/\D/g, '')
    if (f.length < 10) { toast('Informe um WhatsApp com DDD.', 'error'); return }
    setEnviando(true)
    try { const ok = await enviarWhatsApp(f, msgLink); toast(ok ? 'Link do relatório enviado. ✅' : 'Não foi possível enviar.', ok ? 'success' : 'error') }
    catch { toast('Não foi possível enviar.', 'error') }
    finally { setEnviando(false) }
  }
  const copiarLink = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado. 📋') } catch { toast('Não foi possível copiar.', 'error') } }
  const copiarTexto = async () => { try { await navigator.clipboard.writeText(texto); toast('Texto copiado. 📋') } catch { toast('Não foi possível copiar.', 'error') } }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...card, display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Dia<input type="date" value={dia} onChange={e => setDia(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Loja<select value={lojaRel} onChange={e => setLojaRel(e.target.value)} style={inp}><option value="Todas">Todas as lojas</option>{LOJAS.map((l: string) => <option key={l} value={l}>{l}</option>)}</select></label>
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>WhatsApp destino<input value={fone} onChange={e => setFone(e.target.value)} placeholder="Ex.: 81 99999-9999" style={{ ...inp, minWidth: 170 }} /></label>
        <a href={link} target="_blank" rel="noreferrer" className="btn" style={{ padding: '9px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ExternalLink size={14} /> Abrir</a>
        <button onClick={copiarLink} className="btn" style={{ padding: '9px 14px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Copy size={14} /> Copiar link</button>
        <button onClick={enviar} disabled={enviando} className="btn" style={{ padding: '9px 16px', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: enviando ? .6 : 1 }}><Send size={14} /> {enviando ? 'Enviando…' : 'Enviar link'}</button>
      </div>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Prévia do relatório · o WhatsApp envia o <b>link da página</b> (layout do painel). Agendamento fixo 17h30 entra na próxima fase (cron do VPS).</div>
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
