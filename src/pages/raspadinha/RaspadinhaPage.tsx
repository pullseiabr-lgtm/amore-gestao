import { useState, useEffect, useMemo, useCallback } from 'react'
import { Ticket, BarChart3, Users, QrCode, RefreshCw, CheckCircle2, XCircle, SlidersHorizontal, Lock, ShieldCheck, Play, Pause, Save, ListOrdered, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import { fetchRaspBloqueio, setRaspBloqueio, pausarPremio, editarPremio, fetchRaspConfig, saveRaspConfig, type RaspBloqueio, type RaspCronoItem, type RaspReinicio, type RaspEscopo, type RaspCronoTipo, type RaspTetos } from '../../lib/db'

const sb = supabase as any
const RASP_URL = 'https://painel.amorefood.com.br/raspadinha.html'
const slugLoja = (l: string) => (l === 'Amore CD' ? 'cd' : l === 'Amore Paiva' ? 'paiva' : l)
const qrImg = (data: string, size = 200) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(data)}`
const fmtDT = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtD = (d: string | null) => d ? d.split('-').reverse().join('/') : '—'
const STATUS_COR: Record<string, string> = { disponivel: '#3B82F6', resgatado: '#10B981', expirado: '#9ca3af', cancelado: '#EF4444', bloqueado: '#EF4444' }

type Tab = 'dashboard' | 'cronograma' | 'gerenciar' | 'validar' | 'participantes' | 'qr'

export default function RaspadinhaPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const userName = user?.name || (user as any)?.email || 'Painel'
  const [tab, setTab] = useState<Tab>('dashboard')
  const [campanhas, setCampanhas] = useState<any[]>([])
  const [campId, setCampId] = useState<string>('')
  const [premios, setPremios] = useState<any[]>([])
  const [parts, setParts] = useState<any[]>([])
  const [bloq, setBloq] = useState<RaspBloqueio | null>(null)
  const [loading, setLoading] = useState(true)

  const loadCamps = useCallback(async () => {
    const { data } = await sb.from('rasp_campanhas').select('*').order('created_at', { ascending: false })
    setCampanhas(data || [])
    if (!campId && data && data.length) setCampId(data[0].id)
  }, [campId])

  const loadCamp = useCallback(async () => {
    if (!campId) { setLoading(false); return }
    setLoading(true)
    const [pr, pa] = await Promise.all([
      sb.from('rasp_premios').select('*').eq('campanha_id', campId).order('ordem'),
      sb.from('rasp_participacoes').select('*').eq('campanha_id', campId).order('created_at', { ascending: false }).limit(3000),
    ])
    setPremios(pr.data || []); setParts(pa.data || []); setLoading(false)
  }, [campId])

  const loadBloq = useCallback(async () => { setBloq(await fetchRaspBloqueio()) }, [])

  useEffect(() => { loadCamps() }, [loadCamps])
  useEffect(() => { loadCamp() }, [loadCamp])
  useEffect(() => { loadBloq() }, [loadBloq])

  const camp = campanhas.find(c => c.id === campId)
  const kpi = useMemo(() => {
    const total = parts.length
    const ganhos = parts.filter(p => p.ganhou).length
    const resg = parts.filter(p => p.status === 'resgatado').length
    const contatos = new Set(parts.map(p => p.telefone)).size
    const estoque = premios.reduce((s, p) => s + p.quantidade, 0)
    const distrib = premios.reduce((s, p) => s + p.distribuidos, 0)
    return { total, ganhos, resg, contatos, estoque, distrib, taxaResg: ganhos ? Math.round((resg / ganhos) * 100) : 0, restante: estoque - distrib }
  }, [parts, premios])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem' }
  const kcard = (label: string, value: string | number, sub?: string, color = '#8B1212') => (
    <div style={{ ...card, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: tab === id ? '#8B1212' : 'transparent', color: tab === id ? '#fff' : '#6b7280' }}>{icon}{label}</button>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      {bloq?.bloqueada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B42318', borderRadius: 12, padding: '.7rem 1rem', marginBottom: 14, fontSize: 14 }}>
          <Lock size={18} />
          <div><b>Premiações bloqueadas.</b> Os clientes conseguem jogar, mas todas as raspadinhas mostram “Não foi dessa vez”. {bloq.por && <>Bloqueado por {bloq.por}{bloq.em ? ` em ${fmtDT(bloq.em)}` : ''}.</>} Reative na aba <b>Prêmios &amp; Status</b>.</div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={campId} onChange={e => setCampId(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb', maxWidth: 320 }}>
          {campanhas.length === 0 && <option>Nenhuma campanha</option>}
          {campanhas.map(c => <option key={c.id} value={c.id}>{c.nome} {c.status !== 'ativa' ? `(${c.status})` : ''}</option>)}
        </select>
        <button onClick={() => { loadCamps(); loadCamp() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} />Atualizar</button>
        {camp && <span style={{ fontSize: 12, color: '#6b7280' }}>{fmtD(camp.data_inicio)} → {fmtD(camp.data_fim)} · {(camp.unidades || []).join(', ') || 'Todas'}</span>}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, background: '#f9fafb', padding: 6, borderRadius: 12, width: 'fit-content' }}>
        {tabBtn('dashboard', <BarChart3 size={16} />, 'Dashboard')}
        {tabBtn('cronograma', <ListOrdered size={16} />, 'Cronograma')}
        {tabBtn('gerenciar', <SlidersHorizontal size={16} />, 'Prêmios & Status')}
        {tabBtn('validar', <Ticket size={16} />, 'Validar Cupom')}
        {tabBtn('participantes', <Users size={16} />, 'Participantes')}
        {tabBtn('qr', <QrCode size={16} />, 'QR Codes')}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> : !camp ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Nenhuma campanha cadastrada.</div> : <>

      {tab === 'dashboard' && <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {kcard('Participações', kpi.total)}
          {kcard('Prêmios liberados', kpi.ganhos, `${kpi.restante} em estoque`, '#3B82F6')}
          {kcard('Resgatados', kpi.resg, `${kpi.taxaResg}% de resgate`, '#10B981')}
          {kcard('Contatos captados', kpi.contatos, 'clientes únicos', '#E0A83E')}
        </div>
        <div style={card}>
          <b style={{ fontSize: 14 }}>Estoque de prêmios</b>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 14 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Prêmio</th><th>Total</th><th>Liberados</th><th>Resgatados</th><th>Restante</th><th>Progresso</th>
            </tr></thead>
            <tbody>
              {premios.map(p => { const pct = p.quantidade ? Math.round((p.distribuidos / p.quantidade) * 100) : 0
                return <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{p.is_premio ? '🎁' : '—'} {p.nome}</td>
                  <td>{p.quantidade}</td><td>{p.distribuidos}</td><td>{p.resgatados}</td><td>{p.quantidade - p.distribuidos}</td>
                  <td style={{ width: 160 }}><div style={{ height: 10, background: '#f3f4f6', borderRadius: 5, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: p.cor || '#8B1212' }} /></div></td>
                </tr> })}
            </tbody>
          </table>
        </div>
      </>}

      {tab === 'cronograma' && <CronogramaTab campId={campId} camp={camp} premios={premios} parts={parts} userName={userName} toast={toast} />}

      {tab === 'gerenciar' && <GerenciarTab premios={premios} bloq={bloq} userName={userName} toast={toast} onDone={() => { loadCamp(); loadBloq() }} />}

      {tab === 'validar' && <ValidarTab validador={user?.name || (user as any)?.email || 'Atendente'} toast={toast} onDone={loadCamp} />}

      {tab === 'participantes' && <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <b style={{ fontSize: 14 }}>Participantes ({parts.length})</b>
          <button onClick={() => exportCsv(parts)} style={{ padding: '.45rem .9rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13 }}>⬇ Exportar CSV</button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Data</th><th>Cliente</th><th>WhatsApp</th><th>Unidade</th><th>Prêmio</th><th>Cupom</th><th>Status</th>
            </tr></thead>
            <tbody>
              {parts.length === 0 ? <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhuma participação ainda.</td></tr> :
                parts.map(p => <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{fmtDT(p.created_at)}</td>
                  <td style={{ fontWeight: 600 }}>{p.nome}</td><td>{p.telefone}</td><td>{p.unidade}</td>
                  <td>{p.ganhou ? p.premio_nome : '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{p.cupom || '—'}</td>
                  <td><span style={{ background: (STATUS_COR[p.status] || '#9ca3af') + '22', color: STATUS_COR[p.status] || '#6b7280', padding: '.2rem .6rem', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{p.status}</span></td>
                </tr>)}
            </tbody>
          </table>
        </div>
      </div>}

      {tab === 'qr' && <div style={{ ...card }}>
        <b style={{ fontSize: 14 }}>QR Codes da campanha — 1 por unidade</b>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 14px' }}>Imprima e coloque nas mesas/balcão de cada loja. Cada QR já identifica a unidade.</p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {(camp.unidades && camp.unidades.length ? camp.unidades : ['Amore Paiva', 'Amore CD']).map((u: string) => {
            const link = `${RASP_URL}?loja=${slugLoja(u)}&c=${camp.slug}`
            return <div key={u} style={{ textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
              <img src={qrImg(link, 190)} alt={u} style={{ width: 170, height: 170, display: 'block', margin: '0 auto' }} />
              <div style={{ fontWeight: 700, marginTop: 8 }}>{u === 'Amore CD' ? 'Amore Costa Dourada' : u}</div>
              <a href={qrImg(link, 700)} download={`QR_Raspadinha_${u}.png`} style={{ fontSize: 12, color: '#8B1212' }}>⬇ Baixar</a>
              <span style={{ margin: '0 6px', color: '#e5e7eb' }}>·</span>
              <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6b7280' }}>Testar</a>
            </div>
          })}
        </div>
      </div>}

      </>}
    </div>
  )
}

// Espelho da lógica do motor (api/rasp-sortear.js) para prévia/planejamento no painel.
function raspEscolherEntrada(crono: RaspCronoItem[], posicao: number): RaspCronoItem | null {
  for (const e of crono) {
    if (!e || !e.premio_id) continue
    if ((e.tipo || 'posicao') === 'intervalo') {
      const cada = Number(e.cada) || 0
      if (cada <= 0 || posicao % cada !== 0) continue
      const vez = posicao / cada, q = Number(e.qtd) || 0
      if (q > 0 && vez > q) continue
      return e
    } else if (Number(e.pos) === posicao) return e
  }
  return null
}
function raspInicioPeriodo(reinicio: string, desde: string | null, dataInicio?: string | null): string | null {
  const TZ = -3, loc = new Date(Date.now() + TZ * 3600 * 1000)
  const y = loc.getUTCFullYear(), m = loc.getUTCMonth(), d = loc.getUTCDate(), dow = loc.getUTCDay()
  const u = (Y: number, M: number, D: number) => new Date(Date.UTC(Y, M, D, 0, 0, 0) - TZ * 3600 * 1000).toISOString()
  if (reinicio === 'diario') return u(y, m, d)
  if (reinicio === 'semanal') { const diff = (dow + 6) % 7; const mon = new Date(Date.UTC(y, m, d) - diff * 86400000); return new Date(mon.getTime() - TZ * 3600 * 1000).toISOString() }
  if (reinicio === 'mensal') return u(y, m, 1)
  if (reinicio === 'manual') return desde || null
  return dataInicio ? dataInicio + 'T00:00:00Z' : null
}
const REINICIOS: { v: RaspReinicio; label: string }[] = [
  { v: 'campanha', label: 'Por campanha (não reinicia)' },
  { v: 'diario', label: 'Diário (todo dia começa no nº 1)' },
  { v: 'semanal', label: 'Semanal (recomeça na segunda)' },
  { v: 'mensal', label: 'Mensal (recomeça no dia 1º)' },
  { v: 'manual', label: 'Manual (eu zero quando quiser)' },
]

function CronogramaTab({ campId, camp, premios, parts, userName, toast }: { campId: string; camp: any; premios: any[]; parts: any[]; userName: string; toast: (m: string, t?: any) => void }) {
  const [crono, setCrono] = useState<RaspCronoItem[]>([])
  const [reinicio, setReinicio] = useState<RaspReinicio>('campanha')
  const [escopo, setEscopo] = useState<RaspEscopo>('campanha')
  const [desde, setDesde] = useState<string | null>(null)
  const [tetos, setTetos] = useState<RaspTetos>({})
  const [prev, setPrev] = useState<string>('500')
  const [info, setInfo] = useState<{ by?: string; at?: string }>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const reais = premios.filter(p => p.is_premio !== false)
  const nomePremio = (id: string) => reais.find(p => String(p.id) === String(id))?.nome || '—'

  const load = useCallback(async () => {
    setLoading(true)
    const cfg = await fetchRaspConfig(campId)
    setCrono((cfg?.cronograma || []).map(c => ({ tipo: c.tipo || 'posicao', pos: c.pos, cada: c.cada, premio_id: c.premio_id, qtd: c.qtd, custo: c.custo })))
    setReinicio(cfg?.reinicio || 'campanha')
    setEscopo(cfg?.escopo || 'campanha')
    setDesde(cfg?.desde || null)
    setTetos(cfg?.tetos || {})
    setInfo({ by: cfg?.updated_by, at: cfg?.updated_at })
    setLoading(false)
  }, [campId])
  useEffect(() => { load() }, [load])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem' }
  const inp: React.CSSProperties = { padding: '.5rem .6rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14 }

  // contagem por período (e por unidade, se o escopo for por unidade)
  const ini = raspInicioPeriodo(reinicio, desde, camp?.data_inicio)
  const noPeriodo = ini ? parts.filter(p => p.created_at >= ini) : parts
  const unidades: string[] = (camp?.unidades && camp.unidades.length ? camp.unidades : Array.from(new Set(parts.map(p => p.unidade).filter(Boolean))))
  const contagemUnidade = unidades.map(u => ({ u, n: noPeriodo.filter(p => p.unidade === u).length }))
  const contadasTotal = noPeriodo.length
  const proximaGlobal = contadasTotal + 1

  const addRow = () => {
    const usados = new Set(crono.filter(c => (c.tipo || 'posicao') === 'posicao').map(c => c.pos))
    let p = 10; while (usados.has(p)) p += 10
    setCrono(c => [...c, { tipo: 'posicao', pos: p, premio_id: reais[0]?.id || '', qtd: 0, custo: 0 }])
  }
  const setRow = (i: number, patch: Partial<RaspCronoItem>) => setCrono(c => c.map((r, j) => j === i ? { ...r, ...patch } : r))
  const delRow = (i: number) => setCrono(c => c.filter((_, j) => j !== i))
  const moveRow = (i: number, dir: -1 | 1) => setCrono(c => { const j = i + dir; if (j < 0 || j >= c.length) return c; const n = [...c]; [n[i], n[j]] = [n[j], n[i]]; return n })

  const limpar = () => crono
    .filter(c => c.premio_id && ((c.tipo || 'posicao') === 'intervalo' ? Number(c.cada) > 0 : Number(c.pos) > 0))
    .map(c => (c.tipo || 'posicao') === 'intervalo'
      ? { tipo: 'intervalo' as const, cada: Math.floor(Number(c.cada)), premio_id: c.premio_id, qtd: Math.max(0, Math.floor(Number(c.qtd) || 0)), custo: Number(c.custo) || 0 }
      : { tipo: 'posicao' as const, pos: Math.floor(Number(c.pos)), premio_id: c.premio_id, custo: Number(c.custo) || 0 })

  const tetosLimpo = (): RaspTetos => {
    const t: RaspTetos = {}
    const n = (v: unknown) => Math.max(0, Number(v) || 0)
    if (n(tetos.orcamento)) t.orcamento = n(tetos.orcamento)
    if (n(tetos.pct_max)) t.pct_max = n(tetos.pct_max)
    if (n(tetos.max_dia)) t.max_dia = n(tetos.max_dia)
    if (n(tetos.max_semana)) t.max_semana = n(tetos.max_semana)
    if (n(tetos.max_mes)) t.max_mes = n(tetos.max_mes)
    return t
  }
  const salvar = async () => {
    const limpo = limpar()
    const poss = limpo.filter(c => c.tipo === 'posicao').map(c => c.pos)
    if (new Set(poss).size !== poss.length) { toast('Há posições exatas repetidas no cronograma.', 'error'); return }
    setBusy(true)
    try {
      await saveRaspConfig(campId, { cronograma: limpo, reinicio, escopo, desde, tetos: tetosLimpo() }, userName)
      toast('Cronograma e tetos salvos. ✅'); await load()
    } catch { toast('Não foi possível salvar. Tente novamente.', 'error') }
    setBusy(false)
  }
  const zerarAgora = async () => {
    if (!window.confirm('Zerar o contador agora? A fila de avaliações recomeça do nº 1 a partir deste momento (passa para reinício MANUAL). As participações antigas continuam salvas.')) return
    const agora = new Date().toISOString()
    setBusy(true)
    try {
      await saveRaspConfig(campId, { cronograma: limpar(), reinicio: 'manual', escopo, desde: agora, tetos: tetosLimpo() }, userName)
      setReinicio('manual'); setDesde(agora)
      toast('Contador zerado. A próxima será a nº 1.'); await load()
    } catch { toast('Não foi possível zerar.', 'error') }
    setBusy(false)
  }

  // prévia das próximas 12 (nível campanha)
  const sim = Array.from({ length: 12 }, (_, i) => {
    const pos = proximaGlobal + i
    const e = raspEscolherEntrada(crono, pos)
    return { pos, premio: e ? nomePremio(e.premio_id) : 'Não foi dessa vez' }
  })

  // planejamento (§6): previsão de N avaliações
  const N = Math.max(0, Math.floor(Number(prev) || 0))
  const plano = (() => {
    const porPremio: Record<string, { nome: string; fires: number; custo: number }> = {}
    let premiadas = 0, custoTotal = 0
    for (const e of crono) {
      if (!e.premio_id) continue
      let fires = 0
      if ((e.tipo || 'posicao') === 'intervalo') {
        const cada = Number(e.cada) || 0
        if (cada > 0) { const q = Number(e.qtd) || 0; fires = Math.min(Math.floor(N / cada), q > 0 ? q : Infinity) }
      } else { fires = Number(e.pos) > 0 && Number(e.pos) <= N ? 1 : 0 }
      if (!isFinite(fires) || fires <= 0) continue
      const custo = fires * (Number(e.custo) || 0)
      premiadas += fires; custoTotal += custo
      const k = e.premio_id
      if (!porPremio[k]) porPremio[k] = { nome: nomePremio(k), fires: 0, custo: 0 }
      porPremio[k].fires += fires; porPremio[k].custo += custo
    }
    return { lista: Object.values(porPremio).sort((a, b) => b.fires - a.fires), premiadas, custoTotal, naoPrem: Math.max(0, N - premiadas), pct: N ? (premiadas / N) * 100 : 0 }
  })()
  const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // status ao vivo dos tetos (§13)
  const custoMap: Record<string, number> = {}
  for (const e of crono) if (e.premio_id) custoMap[String(e.premio_id)] = Number(e.custo) || 0
  const winsPeriodo = noPeriodo.filter(p => p.ganhou)
  const custoReal = winsPeriodo.reduce((s, p) => s + (custoMap[String(p.premio_id)] || 0), 0)
  const pctAtual = contadasTotal ? (winsPeriodo.length / contadasTotal) * 100 : 0
  const iniDia = raspInicioPeriodo('diario', null), iniSem = raspInicioPeriodo('semanal', null), iniMes = raspInicioPeriodo('mensal', null)
  const winsHoje = parts.filter(p => p.ganhou && iniDia && p.created_at >= iniDia).length
  const winsSemana = parts.filter(p => p.ganhou && iniSem && p.created_at >= iniSem).length
  const winsMes = parts.filter(p => p.ganhou && iniMes && p.created_at >= iniMes).length
  const setT = (f: keyof RaspTetos, v: string) => setTetos(t => ({ ...t, [f]: v === '' ? undefined : Math.max(0, Number(v) || 0) }))
  const estourou = { orc: !!tetos.orcamento && custoReal >= tetos.orcamento, pct: !!tetos.pct_max && pctAtual >= tetos.pct_max, dia: !!tetos.max_dia && winsHoje >= tetos.max_dia, sem: !!tetos.max_semana && winsSemana >= tetos.max_semana, mes: !!tetos.max_mes && winsMes >= tetos.max_mes }
  const algumEstourou = Object.values(estourou).some(Boolean)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando cronograma…</div>

  return <>
    {/* Configuração geral */}
    <div style={{ ...card, marginBottom: 14 }}>
      <b style={{ fontSize: 14 }}>📅 Cronograma por avaliações</b>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 12px' }}>
        Defina os prêmios por <b>posição exata</b> (avaliação nº X) ou por <b>intervalo</b> (a cada N avaliações). O que não estiver programado entrega “Não foi dessa vez”. Enquanto não houver cronograma salvo (ou com a campanha bloqueada em “Prêmios & Status”), ninguém ganha.
      </p>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>Reinício do contador
          <select value={reinicio} onChange={e => setReinicio(e.target.value as RaspReinicio)} style={{ ...inp, minWidth: 250 }}>
            {REINICIOS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 13, color: '#374151', display: 'flex', flexDirection: 'column', gap: 4 }}>Contador
          <select value={escopo} onChange={e => setEscopo(e.target.value as RaspEscopo)} style={{ ...inp, minWidth: 230 }}>
            <option value="campanha">Único (soma todas as unidades)</option>
            <option value="unidade">Separado por unidade</option>
          </select>
        </label>
        <button onClick={zerarAgora} disabled={busy} style={{ padding: '.55rem .9rem', borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#B42318', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>↺ Zerar contador agora</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
        {escopo === 'unidade'
          ? contagemUnidade.map(c => <div key={c.u} style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '.6rem .9rem', minWidth: 150 }}>
              <div style={{ fontSize: 12, color: '#0369A1' }}>{c.u}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0369A1' }}>{c.n} <span style={{ fontSize: 12, fontWeight: 500 }}>avaliações · próxima nº {c.n + 1}</span></div>
            </div>)
          : <>
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '.6rem .9rem' }}>
              <div style={{ fontSize: 12, color: '#0369A1' }}>Avaliações contadas no período</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0369A1' }}>{contadasTotal}</div>
            </div>
            <div style={{ background: '#FEF9C3', border: '1px solid #FDE68A', borderRadius: 10, padding: '.6rem .9rem' }}>
              <div style={{ fontSize: 12, color: '#92400E' }}>Próxima raspadinha será a nº</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#92400E' }}>{proximaGlobal}</div>
            </div>
          </>}
      </div>
    </div>

    {/* Editor do cronograma */}
    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <b style={{ fontSize: 14 }}>Premiações programadas</b>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.45rem .8rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><Plus size={14} />Adicionar prêmio</button>
          <button onClick={salvar} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.45rem .9rem', borderRadius: 8, border: 'none', background: '#8B1212', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: busy ? .6 : 1 }}><Save size={14} />{busy ? 'Salvando…' : 'Salvar cronograma'}</button>
        </div>
      </div>
      {reais.length === 0 && <div style={{ fontSize: 13, color: '#B42318', marginTop: 10 }}>Cadastre prêmios na aba “Prêmios & Status” antes de montar o cronograma.</div>}
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '6px 0 0' }}>Quando duas regras caem na mesma avaliação, vale a que estiver <b>mais acima</b> na lista (use as setas para ordenar).</p>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
            <th style={{ padding: 8, width: 130 }}>Tipo</th><th style={{ width: 120 }}>Quando</th><th>Prêmio</th><th style={{ width: 120 }}>Máx. sorteios</th><th style={{ width: 110 }}>Custo unit.</th><th style={{ width: 90 }}></th>
          </tr></thead>
          <tbody>
            {crono.length === 0 ? <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9ca3af' }}>Nenhum prêmio programado. Todas as raspadinhas mostram “Não foi dessa vez”.</td></tr> :
              crono.map((r, i) => { const isInt = (r.tipo || 'posicao') === 'intervalo'
                return <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>
                    <select value={r.tipo || 'posicao'} onChange={e => setRow(i, { tipo: e.target.value as RaspCronoTipo })} style={{ ...inp, width: 118 }}>
                      <option value="posicao">Posição nº</option>
                      <option value="intervalo">A cada N</option>
                    </select>
                  </td>
                  <td style={{ padding: 8 }}>
                    {isInt
                      ? <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 12, color: '#9ca3af' }}>a cada</span><input type="number" min={1} value={r.cada ?? ''} onChange={e => setRow(i, { cada: Math.floor(Number(e.target.value) || 0) })} style={{ ...inp, width: 70 }} /></span>
                      : <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 12, color: '#9ca3af' }}>nº</span><input type="number" min={1} value={r.pos ?? ''} onChange={e => setRow(i, { pos: Math.floor(Number(e.target.value) || 0) })} style={{ ...inp, width: 80 }} /></span>}
                  </td>
                  <td style={{ padding: 8 }}>
                    <select value={r.premio_id} onChange={e => setRow(i, { premio_id: e.target.value })} style={{ ...inp, minWidth: 190 }}>
                      <option value="">— escolha o prêmio —</option>
                      {reais.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 8 }}>
                    {isInt
                      ? <input type="number" min={0} value={r.qtd ?? ''} onChange={e => setRow(i, { qtd: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} placeholder="0 = s/ limite" style={{ ...inp, width: 100 }} />
                      : <span style={{ fontSize: 13, color: '#9ca3af' }}>1 vez</span>}
                  </td>
                  <td style={{ padding: 8 }}><input type="number" min={0} step="0.01" value={r.custo ?? ''} onChange={e => setRow(i, { custo: Number(e.target.value) || 0 })} placeholder="R$" style={{ ...inp, width: 90 }} /></td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => moveRow(i, -1)} title="Subir" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: 15 }}>▲</button>
                      <button onClick={() => moveRow(i, 1)} title="Descer" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: 15 }}>▼</button>
                      <button onClick={() => delRow(i)} title="Remover" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr> })}
          </tbody>
        </table>
      </div>
      {info.at && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>Última alteração: {info.by || 'Painel'} · {fmtDT(info.at)}</div>}
    </div>

    {/* Tetos de segurança (§13) */}
    <div style={{ ...card, marginBottom: 14, borderColor: algumEstourou ? '#FCA5A5' : '#e5e7eb' }}>
      <b style={{ fontSize: 14 }}>🛡️ Tetos de segurança & orçamento</b>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '6px 0 0' }}>
        Limites que <b>bloqueiam os prêmios automaticamente</b> quando atingidos (a jogada vira “Não foi dessa vez”). Deixe em branco (ou 0) para não limitar. Custo usa o valor que você preencheu em cada prêmio no cronograma.
      </p>
      {algumEstourou && <div style={{ fontSize: 13, color: '#B42318', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.5rem .7rem', margin: '10px 0' }}>⛔ Um teto foi atingido — os prêmios estão bloqueados agora (só “Não foi”). Aumente o limite ou aguarde o período reiniciar.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
        {[
          { f: 'orcamento' as const, label: 'Orçamento (R$)', atual: brl(custoReal), hit: estourou.orc, hint: 'custo no período' },
          { f: 'pct_max' as const, label: '% máx. premiadas', atual: pctAtual.toFixed(1) + '%', hit: estourou.pct, hint: 'no período' },
          { f: 'max_dia' as const, label: 'Máx. prêmios/dia', atual: String(winsHoje), hit: estourou.dia, hint: 'hoje' },
          { f: 'max_semana' as const, label: 'Máx. prêmios/semana', atual: String(winsSemana), hit: estourou.sem, hint: 'nesta semana' },
          { f: 'max_mes' as const, label: 'Máx. prêmios/mês', atual: String(winsMes), hit: estourou.mes, hint: 'neste mês' },
        ].map(t => (
          <div key={t.f} style={{ border: '1px solid ' + (t.hit ? '#FCA5A5' : '#e5e7eb'), background: t.hit ? '#FEF2F2' : '#fff', borderRadius: 10, padding: '.7rem .8rem' }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>{t.label}</div>
            <input type="number" min={0} step={t.f === 'orcamento' ? '0.01' : '1'} value={tetos[t.f] ?? ''} onChange={e => setT(t.f, e.target.value)} placeholder="sem limite" style={{ ...inp, width: '100%' }} />
            <div style={{ fontSize: 11, color: t.hit ? '#B42318' : '#9ca3af', marginTop: 4 }}>Atual: <b>{t.atual}</b> {t.hint}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={salvar} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '.45rem .9rem', borderRadius: 8, border: 'none', background: '#8B1212', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, opacity: busy ? .6 : 1 }}><Save size={14} />{busy ? 'Salvando…' : 'Salvar tetos'}</button>
        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 10 }}>(salva junto com o cronograma)</span>
      </div>
    </div>

    {/* Planejamento (§6) */}
    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>📊 Planejamento da campanha</b>
        <span style={{ fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>Previsão de <input type="number" min={0} value={prev} onChange={e => setPrev(e.target.value)} style={{ ...inp, width: 100 }} /> avaliações</span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
        <div style={{ ...card, padding: '.7rem .9rem', minWidth: 120 }}><div style={{ fontSize: 12, color: '#9ca3af' }}>Premiadas</div><div style={{ fontSize: 20, fontWeight: 800, color: '#067647' }}>{plano.premiadas}</div></div>
        <div style={{ ...card, padding: '.7rem .9rem', minWidth: 120 }}><div style={{ fontSize: 12, color: '#9ca3af' }}>Não premiadas</div><div style={{ fontSize: 20, fontWeight: 800, color: '#6b7280' }}>{plano.naoPrem}</div></div>
        <div style={{ ...card, padding: '.7rem .9rem', minWidth: 120 }}><div style={{ fontSize: 12, color: '#9ca3af' }}>% de premiação</div><div style={{ fontSize: 20, fontWeight: 800, color: '#0369A1' }}>{plano.pct.toFixed(1)}%</div></div>
        <div style={{ ...card, padding: '.7rem .9rem', minWidth: 140 }}><div style={{ fontSize: 12, color: '#9ca3af' }}>Custo estimado</div><div style={{ fontSize: 20, fontWeight: 800, color: '#8B1212' }}>{brl(plano.custoTotal)}</div></div>
      </div>
      {plano.lista.length > 0 && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Prêmio</th><th>Qtd. sorteios</th><th>Custo total</th></tr></thead>
        <tbody>{plano.lista.map((p, i) => <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}><td style={{ padding: 6, fontWeight: 600 }}>🎁 {p.nome}</td><td>{p.fires}</td><td>{brl(p.custo)}</td></tr>)}</tbody>
      </table>}
    </div>

    {/* Prévia */}
    <div style={card}>
      <b style={{ fontSize: 14 }}>🔮 Prévia das próximas 12 raspadinhas</b>
      <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 10px' }}>A partir da posição atual{escopo === 'unidade' ? ' (contador geral; por unidade varia)' : ''}, considerando o cronograma acima.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {sim.map(s => { const premiado = s.premio !== 'Não foi dessa vez'
          return <div key={s.pos} style={{ border: '1px solid ' + (premiado ? '#A6F4C5' : '#e5e7eb'), background: premiado ? '#F0FDF4' : '#fff', borderRadius: 10, padding: '.5rem .7rem', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>nº {s.pos}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: premiado ? '#067647' : '#9ca3af' }}>{premiado ? '🎁 ' + s.premio : 'Não foi'}</div>
          </div> })}
      </div>
    </div>
  </>
}

function GerenciarTab({ premios, bloq, userName, toast, onDone }: { premios: any[]; bloq: RaspBloqueio | null; userName: string; toast: (m: string, t?: any) => void; onDone: () => void }) {
  const [busy, setBusy] = useState('')
  const [edits, setEdits] = useState<Record<string, { nome: string; descricao: string; programada: string }>>({})
  const reais = premios.filter(p => p.is_premio !== false)

  useEffect(() => {
    const m: Record<string, { nome: string; descricao: string; programada: string }> = {}
    for (const p of premios) {
      if (p.is_premio === false) continue
      const prog = bloq?.prizes?.[p.id]?.programada ?? p.quantidade
      m[p.id] = { nome: p.nome || '', descricao: p.descricao || '', programada: String(prog) }
    }
    setEdits(m)
  }, [premios, bloq])

  const bloqueada = !!bloq?.bloqueada
  const setField = (id: string, f: 'nome' | 'descricao' | 'programada', v: string) =>
    setEdits(e => ({ ...e, [id]: { ...(e[id] || { nome: '', descricao: '', programada: '0' }), [f]: v } }))

  const wrap = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try { await fn(); toast(ok); onDone() }
    catch { toast('Não foi possível concluir. Tente novamente.', 'error') }
    setBusy('')
  }
  const toggleBloqueio = () => wrap('bloq', () => setRaspBloqueio(!bloqueada, userName), !bloqueada ? 'Premiações bloqueadas.' : 'Premiações reativadas.')
  const togglePausa = (p: any) => wrap('pz' + p.id, () => pausarPremio(p.id, !(bloq?.prizes?.[p.id]?.pausado), p.nome, userName), !(bloq?.prizes?.[p.id]?.pausado) ? `“${p.nome}” pausado.` : `“${p.nome}” reativado.`)
  const salvar = (p: any) => {
    const e = edits[p.id]; if (!e) return
    const prog = Math.max(0, Math.floor(Number(e.programada) || 0))
    wrap('pz' + p.id, () => editarPremio(p.id, { nome: e.nome.trim(), descricao: e.descricao.trim(), programada: prog }, userName), `“${e.nome.trim()}” salvo.`)
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem' }
  const inp: React.CSSProperties = { padding: '.5rem .6rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, width: '100%' }

  return <>
    {/* Status da campanha */}
    <div style={{ ...card, marginBottom: 14, borderColor: bloqueada ? '#FCA5A5' : '#A6F4C5', background: bloqueada ? '#FEF2F2' : '#F0FDF4' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {bloqueada ? <Lock size={26} style={{ color: '#B42318' }} /> : <ShieldCheck size={26} style={{ color: '#067647' }} />}
          <div>
            <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>Status da campanha</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: bloqueada ? '#B42318' : '#067647' }}>{bloqueada ? '🔴 Premiações BLOQUEADAS' : '🟢 Premiações ATIVAS'}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {bloqueada
                ? 'Os clientes jogam normalmente, mas todas as raspadinhas mostram “Não foi dessa vez”.'
                : 'As raspadinhas liberam prêmios conforme o estoque programado abaixo.'}
            </div>
          </div>
        </div>
        <button onClick={toggleBloqueio} disabled={busy === 'bloq'}
          style={{ padding: '.7rem 1.2rem', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#fff', background: bloqueada ? '#059669' : '#DC2626', opacity: busy === 'bloq' ? .6 : 1 }}>
          {busy === 'bloq' ? 'Aplicando…' : bloqueada ? '▶ Ativar premiações' : '⏸ Bloquear tudo'}
        </button>
      </div>
      {bloq?.em && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10 }}>Última alteração: {bloq.por || 'Sistema'} · {fmtDT(bloq.em)}</div>}
    </div>

    {/* Editor de prêmios */}
    <div style={{ ...card, marginBottom: 14 }}>
      <b style={{ fontSize: 14 }}>🎁 Prêmios da campanha</b>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 6px' }}>
        Edite o nome, a mensagem e a quantidade programada de cada prêmio. Use <b>Pausar</b> para tirar um prêmio específico do sorteio sem perder a quantidade — ele volta ao ativar.
      </p>
      {bloqueada && <div style={{ fontSize: 12, color: '#B42318', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '.5rem .7rem', marginBottom: 10 }}>⚠️ A campanha está bloqueada no geral — nenhum prêmio é liberado agora, independente das pausas individuais. Ative a campanha acima para o sorteio voltar a valer.</div>}
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 720 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
            <th style={{ padding: 8, minWidth: 150 }}>Prêmio</th><th style={{ minWidth: 220 }}>Mensagem</th><th style={{ width: 110 }}>Qtd. programada</th><th style={{ width: 90 }}>Liberados</th><th style={{ width: 90 }}>Situação</th><th style={{ width: 190 }}>Ações</th>
          </tr></thead>
          <tbody>
            {reais.length === 0 ? <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhum prêmio cadastrado nesta campanha.</td></tr> :
              reais.map(p => {
                const e = edits[p.id] || { nome: p.nome, descricao: p.descricao || '', programada: String(p.quantidade) }
                const pausado = !!bloq?.prizes?.[p.id]?.pausado
                const off = bloqueada || pausado
                const bz = busy === 'pz' + p.id
                return <tr key={p.id} style={{ borderTop: '1px solid #f3f4f6', opacity: off ? .7 : 1 }}>
                  <td style={{ padding: 8 }}><input value={e.nome} onChange={ev => setField(p.id, 'nome', ev.target.value)} style={inp} /></td>
                  <td style={{ padding: 8 }}><input value={e.descricao} onChange={ev => setField(p.id, 'descricao', ev.target.value)} style={inp} /></td>
                  <td style={{ padding: 8 }}><input type="number" min={0} value={e.programada} onChange={ev => setField(p.id, 'programada', ev.target.value)} style={{ ...inp, width: 90 }} /></td>
                  <td style={{ padding: 8, color: '#6b7280' }}>{p.distribuidos} / {p.resgatados} resg.</td>
                  <td style={{ padding: 8 }}>
                    <span style={{ background: (pausado ? '#F59E0B' : '#10B981') + '22', color: pausado ? '#B45309' : '#067647', padding: '.2rem .55rem', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{pausado ? 'Pausado' : 'Ativo'}</span>
                  </td>
                  <td style={{ padding: 8 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => salvar(p)} disabled={bz} title="Salvar alterações"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.4rem .7rem', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#8B1212', color: '#fff', fontSize: 13, fontWeight: 600, opacity: bz ? .6 : 1 }}><Save size={14} />Salvar</button>
                      <button onClick={() => togglePausa(p)} disabled={bz} title={pausado ? 'Voltar ao sorteio' : 'Tirar do sorteio'}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '.4rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'pointer', background: '#fff', color: pausado ? '#067647' : '#B45309', fontSize: 13, fontWeight: 600, opacity: bz ? .6 : 1 }}>
                        {pausado ? <><Play size={14} />Retomar</> : <><Pause size={14} />Pausar</>}
                      </button>
                    </div>
                  </td>
                </tr>
              })}
          </tbody>
        </table>
      </div>
    </div>

    {/* Histórico */}
    <div style={card}>
      <b style={{ fontSize: 14 }}>📋 Histórico de alterações</b>
      {(!bloq?.historico || bloq.historico.length === 0)
        ? <p style={{ fontSize: 13, color: '#9ca3af', margin: '8px 0 0' }}>Nenhuma alteração registrada ainda.</p>
        : <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...bloq.historico].reverse().slice(0, 30).map((h, i) => (
              <div key={i} style={{ fontSize: 13, display: 'flex', gap: 8, borderTop: i ? '1px solid #f3f4f6' : 'none', paddingTop: i ? 6 : 0 }}>
                <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtDT(h.em)}</span>
                <span><b>{h.por}</b> {h.acao}</span>
              </div>
            ))}
          </div>}
    </div>
  </>
}

function ValidarTab({ validador, toast, onDone }: { validador: string; toast: (m: string, t?: any) => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const validar = async () => {
    const cod = codigo.trim(); if (!cod) return
    setBusy(true); setRes(null)
    try {
      const { data, error } = await sb.rpc('rasp_resgatar', { p_cupom: cod, p_validador: validador })
      if (error) { setRes({ erro: 'falha' }) }
      else { setRes(data); if (data.ok) { toast('Cupom resgatado! ✅'); onDone() } }
    } catch { setRes({ erro: 'falha' }) }
    setBusy(false)
  }
  const ERRMSG: Record<string, string> = { cupom_inexistente: 'Cupom não encontrado.', ja_resgatado: 'Este cupom JÁ foi resgatado.', expirado: 'Cupom expirado.', cupom_cancelado: 'Cupom cancelado.', cupom_bloqueado: 'Cupom bloqueado.', falha: 'Erro ao validar. Tente novamente.' }
  return <div style={{ maxWidth: 460, margin: '0 auto' }}>
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '1.6rem', textAlign: 'center' }}>
      <Ticket size={34} style={{ color: '#8B1212' }} />
      <h3 style={{ color: '#8B1212', margin: '.5rem 0 .2rem' }}>Validar cupom</h3>
      <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>Digite o código apresentado pelo cliente.</p>
      <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && validar()} placeholder="AMR-XXX-XXXX"
        style={{ width: '100%', padding: '.9rem 1rem', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 20, fontWeight: 700, textAlign: 'center', letterSpacing: '.05em', fontFamily: 'monospace' }} />
      <button onClick={validar} disabled={busy} style={{ width: '100%', marginTop: 12, padding: '1rem', border: 'none', borderRadius: 12, background: '#8B1212', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Verificando…' : 'Validar e utilizar'}</button>
      {res && <div style={{ marginTop: 18, padding: '1.1rem', borderRadius: 12, background: res.ok ? '#ECFDF3' : '#FEF2F2', border: `1px solid ${res.ok ? '#A6F4C5' : '#FCA5A5'}` }}>
        {res.ok ? <>
          <CheckCircle2 size={40} style={{ color: '#10B981' }} />
          <div style={{ fontSize: 18, fontWeight: 800, color: '#067647', marginTop: 6 }}>Resgate confirmado!</div>
          <div style={{ fontSize: 15, marginTop: 4 }}><b>{res.premio}</b></div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Cliente: {res.nome} · {res.unidade}</div>
        </> : <>
          <XCircle size={40} style={{ color: '#EF4444' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#B42318', marginTop: 6 }}>{ERRMSG[res.erro] || 'Não foi possível resgatar.'}</div>
          {res.resgatado_em && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Resgatado em {fmtDT(res.resgatado_em)} por {res.validado_por}</div>}
        </>}
      </div>}
    </div>
  </div>
}

function exportCsv(parts: any[]) {
  const head = ['Data', 'Nome', 'WhatsApp', 'Unidade', 'Premio', 'Cupom', 'Status', 'Validade']
  const linhas = parts.map(p => [fmtDT(p.created_at), p.nome, p.telefone, p.unidade, p.ganhou ? p.premio_nome : '', p.cupom || '', p.status, fmtD(p.validade)].map(x => `"${(x || '').toString().replace(/"/g, '""')}"`).join(','))
  const csv = [head.join(','), ...linhas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'raspadinha_participantes.csv'; a.click()
}
