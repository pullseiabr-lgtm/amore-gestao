import { useState, useMemo } from 'react'
import { Plus, Star, Clock, Users, CheckSquare, Square, TrendingUp, Award } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import Modal from '../../components/ui/Modal'

// ── Mock data ────────────────────────────────────────────────

type MesaStatus = 'livre' | 'ocupada' | 'reservada' | 'espera'

interface Mesa {
  id: number
  num: string
  status: MesaStatus
  garcom: string
  pax: number
  entrada: string
  consumo: number
}

const MESAS_INIT: Mesa[] = [
  { id: 1,  num: '01', status: 'ocupada',   garcom: 'João Ricardo', pax: 3, entrada: '11:42', consumo: 127.50 },
  { id: 2,  num: '02', status: 'livre',     garcom: '',             pax: 0, entrada: '',       consumo: 0 },
  { id: 3,  num: '03', status: 'ocupada',   garcom: 'Maria Clara',  pax: 2, entrada: '12:05', consumo: 84.20 },
  { id: 4,  num: '04', status: 'reservada', garcom: '',             pax: 4, entrada: '13:00', consumo: 0 },
  { id: 5,  num: '05', status: 'livre',     garcom: '',             pax: 0, entrada: '',       consumo: 0 },
  { id: 6,  num: '06', status: 'ocupada',   garcom: 'Felipe Santos',pax: 5, entrada: '11:30', consumo: 210.00 },
  { id: 7,  num: '07', status: 'livre',     garcom: '',             pax: 0, entrada: '',       consumo: 0 },
  { id: 8,  num: '08', status: 'espera',    garcom: '',             pax: 2, entrada: '12:20', consumo: 0 },
  { id: 9,  num: '09', status: 'ocupada',   garcom: 'João Ricardo', pax: 4, entrada: '12:35', consumo: 142.60 },
  { id: 10, num: '10', status: 'livre',     garcom: '',             pax: 0, entrada: '',       consumo: 0 },
  { id: 11, num: '11', status: 'reservada', garcom: '',             pax: 6, entrada: '14:00', consumo: 0 },
  { id: 12, num: '12', status: 'espera',    garcom: '',             pax: 3, entrada: '12:50', consumo: 0 },
]

interface Atendimento {
  id: number
  mesa: string
  garcom: string
  entrada: string
  saida: string
  tempo: string
  pax: number
  consumo: number
  avaliacao: number
  status: 'Em Atendimento' | 'Finalizado'
  obs: string
}

const ATENDIMENTOS_INIT: Atendimento[] = [
  { id: 1, mesa: '01', garcom: 'João Ricardo',  entrada: '11:42', saida: '',      tempo: '38 min', pax: 3, consumo: 127.50, avaliacao: 5, status: 'Em Atendimento', obs: '' },
  { id: 2, mesa: '03', garcom: 'Maria Clara',   entrada: '12:05', saida: '',      tempo: '23 min', pax: 2, consumo: 84.20,  avaliacao: 0, status: 'Em Atendimento', obs: '' },
  { id: 3, mesa: '06', garcom: 'Felipe Santos', entrada: '11:30', saida: '',      tempo: '50 min', pax: 5, consumo: 210.00, avaliacao: 4, status: 'Em Atendimento', obs: 'Aniversário' },
  { id: 4, mesa: '09', garcom: 'João Ricardo',  entrada: '12:35', saida: '',      tempo: '15 min', pax: 4, consumo: 142.60, avaliacao: 5, status: 'Em Atendimento', obs: '' },
  { id: 5, mesa: '02', garcom: 'Maria Clara',   entrada: '10:10', saida: '11:20', tempo: '70 min', pax: 2, consumo: 98.00,  avaliacao: 5, status: 'Finalizado',      obs: '' },
  { id: 6, mesa: '05', garcom: 'Felipe Santos', entrada: '10:30', saida: '12:00', tempo: '90 min', pax: 3, consumo: 156.80, avaliacao: 4, status: 'Finalizado',     obs: '' },
  { id: 7, mesa: '07', garcom: 'João Ricardo',  entrada: '09:45', saida: '11:10', tempo: '85 min', pax: 4, consumo: 203.40, avaliacao: 5, status: 'Finalizado',     obs: '' },
]

interface Avaliacao {
  id: number
  mesa: string
  garcom: string
  nota: number
  canal: string
  comentario: string
  data: string
}

const AVALIACOES_INIT: Avaliacao[] = [
  { id: 1, mesa: '09', garcom: 'João Ricardo',  nota: 5, canal: 'Presencial', comentario: 'Atendimento excelente! Muito rápido.', data: '22/07 12:48' },
  { id: 2, mesa: '03', garcom: 'Maria Clara',   nota: 4, canal: 'Presencial', comentario: 'Ótimo ambiente, um pouco demorado no pico.', data: '22/07 12:10' },
  { id: 3, mesa: '06', garcom: 'Felipe Santos', nota: 5, canal: 'WhatsApp',   comentario: 'Melhor açaí da cidade!', data: '21/07 20:30' },
  { id: 4, mesa: '01', garcom: 'João Ricardo',  nota: 5, canal: 'Presencial', comentario: 'Garçom muito atencioso e ágil.', data: '21/07 19:15' },
  { id: 5, mesa: '05', garcom: 'Felipe Santos', nota: 4, canal: 'Google Maps','comentario': 'Comida ótima, só o barulho era alto.', data: '20/07 21:00' },
  { id: 6, mesa: '02', garcom: 'Maria Clara',   nota: 5, canal: 'Presencial', comentario: 'Ambiente aconchegante, voltaremos!', data: '20/07 14:30' },
  { id: 7, mesa: '07', garcom: 'João Ricardo',  nota: 3, canal: 'iFood',      comentario: 'Esperei mais do que o previsto.', data: '19/07 13:00' },
]

const CHECKLIST_ABERTURA = [
  'Mesas higienizadas e organizadas',
  'Cardápios limpos e disponíveis',
  'Uniforme e apresentação dos colaboradores',
  'Ar-condicionado verificado',
  'Som ambiente regulado',
  'Iluminação adequada',
  'Banheiros limpos e abastecidos',
  'Caixa aberto e conferido',
]

const CHECKLIST_FECHAMENTO = [
  'Mesas limpas e cadeiras recolhidas',
  'Equipamentos desligados',
  'Caixa fechado e conferido',
  'Registro de ocorrências preenchido',
  'Lixo descartado',
  'Luzes apagadas',
  'Portas e janelas trancadas',
  'Relatório de vendas enviado',
]

const GARCONS = ['João Ricardo', 'Maria Clara', 'Felipe Santos']
const CANAIS = ['Presencial', 'WhatsApp', 'Google Maps', 'iFood']

// ── Helpers ──────────────────────────────────────────────────

const STATUS_COLOR: Record<MesaStatus, string> = {
  livre:    'var(--success)',
  ocupada:  'var(--bordo)',
  reservada:'var(--blue)',
  espera:   'var(--warning)',
}
const STATUS_LABEL: Record<MesaStatus, string> = {
  livre:    'Livre',
  ocupada:  'Ocupada',
  reservada:'Reservada',
  espera:   'Em Espera',
}

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function stars(n: number, size = 12) {
  return Array.from({ length: 5 }).map((_, i) => (
    <Star key={i} size={size} fill={i < n ? 'var(--warning)' : 'none'} color={i < n ? 'var(--warning)' : 'var(--border)'} />
  ))
}

type Tab = 'checklist' | 'mesas' | 'atendimento' | 'avaliacoes' | 'performance'

// ── Component ────────────────────────────────────────────────

export default function SalaoPage() {
  const { theme } = useTheme()
  const [tab, setTab] = useState<Tab>('mesas')
  const [loja, setLoja] = useState(theme.stores[0] || 'Amore CD')

  // Checklist state
  const [aberturaChecks, setAberturaChecks] = useState<boolean[]>(CHECKLIST_ABERTURA.map(() => false))
  const [fechamentoChecks, setFechamentoChecks] = useState<boolean[]>(CHECKLIST_FECHAMENTO.map(() => false))
  const [aberturaResp, setAberturaResp] = useState('')
  const [aberturaObs, setAberturaObs] = useState('')
  const [fechamentoResp, setFechamentoResp] = useState('')
  const [fechamentoObs, setFechamentoObs] = useState('')

  // Mesas state
  const [mesas, setMesas] = useState<Mesa[]>(MESAS_INIT)

  // Atendimento state
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>(ATENDIMENTOS_INIT)
  const [showAtendForm, setShowAtendForm] = useState(false)
  const [atendForm, setAtendForm] = useState({
    mesa: '', garcom: '', entrada: '', saida: '', pax: 2, consumo: '', avaliacao: 5, status: 'Em Atendimento' as Atendimento['status'], obs: '',
  })

  // Avaliações state
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>(AVALIACOES_INIT)
  const [showAvalForm, setShowAvalForm] = useState(false)
  const [avalForm, setAvalForm] = useState({ mesa: '', garcom: '', nota: 5, canal: 'Presencial', comentario: '' })

  // KPIs
  const livres    = mesas.filter(m => m.status === 'livre').length
  const ocupadas  = mesas.filter(m => m.status === 'ocupada').length
  const reservadas= mesas.filter(m => m.status === 'reservada').length
  const espera    = mesas.filter(m => m.status === 'espera').length

  // Avaliação media
  const avalNota = avaliacoes.filter(a => a.nota > 0)
  const mediaGeral = avalNota.length ? (avalNota.reduce((s, a) => s + a.nota, 0) / avalNota.length) : 0
  const distrib = [5, 4, 3, 2, 1].map(n => ({ n, count: avaliacoes.filter(a => a.nota === n).length }))

  // Performance per garçom
  const perfData = useMemo(() => GARCONS.map(g => {
    const at = atendimentos.filter(a => a.garcom === g)
    const fat = at.reduce((s, a) => s + a.consumo, 0)
    const av = at.filter(a => a.avaliacao > 0)
    const media = av.length ? av.reduce((s, a) => s + a.avaliacao, 0) / av.length : 0
    const score = Math.round((media / 5) * 60 + Math.min(at.length * 5, 40))
    return { garcom: g, mesas: at.length, fat, ticket: at.length ? fat / at.length : 0, media, score }
  }).sort((a, b) => b.score - a.score), [atendimentos])

  const saveAtendimento = () => {
    if (!atendForm.mesa || !atendForm.garcom) return
    const novo: Atendimento = {
      id: Date.now(),
      mesa: atendForm.mesa, garcom: atendForm.garcom,
      entrada: atendForm.entrada || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      saida: atendForm.saida, tempo: '—',
      pax: atendForm.pax,
      consumo: parseFloat(atendForm.consumo.replace(',', '.').replace(/[^\d.]/g, '')) || 0,
      avaliacao: atendForm.avaliacao, status: atendForm.status, obs: atendForm.obs,
    }
    setAtendimentos(prev => [novo, ...prev])
    // Update mesa status
    setMesas(prev => prev.map(m => m.num === atendForm.mesa ? { ...m, status: 'ocupada', garcom: atendForm.garcom, entrada: novo.entrada, pax: atendForm.pax } : m))
    setShowAtendForm(false)
    setAtendForm({ mesa: '', garcom: '', entrada: '', saida: '', pax: 2, consumo: '', avaliacao: 5, status: 'Em Atendimento', obs: '' })
  }

  const saveAvaliacao = () => {
    if (!avalForm.nota) return
    const nova: Avaliacao = {
      id: Date.now(), mesa: avalForm.mesa, garcom: avalForm.garcom,
      nota: avalForm.nota, canal: avalForm.canal, comentario: avalForm.comentario,
      data: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    }
    setAvaliacoes(prev => [nova, ...prev])
    setShowAvalForm(false)
    setAvalForm({ mesa: '', garcom: '', nota: 5, canal: 'Presencial', comentario: '' })
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'checklist',   label: '✅ Checklist' },
    { key: 'mesas',       label: '🪑 Mesas' },
    { key: 'atendimento', label: '👥 Atendimento' },
    { key: 'avaliacoes',  label: '⭐ Avaliações' },
    { key: 'performance', label: '📊 Performance' },
  ]

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        {[
          { lbl: 'Mesas Livres',    val: `${livres} de ${mesas.length} mesas`, sub: 'disponíveis agora',     col: 'var(--success)', icon: <CheckSquare size={15}/> },
          { lbl: 'Mesas Ocupadas',  val: String(ocupadas),                      sub: 'Atendimento ativo',     col: 'var(--bordo)',   icon: <Users size={15}/> },
          { lbl: 'Reservadas',      val: String(reservadas),                    sub: 'Aguardando clientes',   col: 'var(--blue)',    icon: <Clock size={15}/> },
          { lbl: 'Em Espera',       val: String(espera),                        sub: 'Clientes na fila',      col: 'var(--warning)', icon: <TrendingUp size={15}/> },
        ].map((k, i) => (
          <div className="kpi" key={i}>
            <div className="kpi-ac" style={{ background: k.col }} />
            <div className="kpi-lbl">{k.lbl}</div>
            <div className="kpi-val">{k.val}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="fb" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <div className="tabs" style={{ margin: 0 }}>
          {TABS.map(t => (
            <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <select className="flt" value={loja} onChange={e => setLoja(e.target.value)}>
          {theme.stores.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* ── CHECKLIST ── */}
      {tab === 'checklist' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Abertura */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">✅ Checklist Abertura — Salão</span>
              <span className="badge bg-gr" style={{ fontSize: 11 }}>
                {aberturaChecks.filter(Boolean).length}/{CHECKLIST_ABERTURA.length}
              </span>
            </div>
            <div className="card-bd" style={{ padding: '4px 14px 12px' }}>
              {CHECKLIST_ABERTURA.map((item, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={aberturaChecks[i]}
                    onChange={() => setAberturaChecks(prev => prev.map((v, j) => j === i ? !v : v))}
                    style={{ width: 15, height: 15, accentColor: 'var(--success)', cursor: 'pointer' }} />
                  <span style={{ textDecoration: aberturaChecks[i] ? 'line-through' : 'none', color: aberturaChecks[i] ? 'var(--muted)' : 'var(--text)' }}>{item}</span>
                </label>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div className="fg">
                  <label className="fl">Responsável</label>
                  <input className="inp" value={aberturaResp} onChange={e => setAberturaResp(e.target.value)} placeholder="Nome" />
                </div>
                <div className="fg">
                  <label className="fl">Observações</label>
                  <input className="inp" value={aberturaObs} onChange={e => setAberturaObs(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <button className="btn bp bsm" style={{ marginTop: 10, width: '100%' }}>💾 Salvar Registro</button>
            </div>
          </div>

          {/* Fechamento */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">🔒 Checklist Fechamento — Salão</span>
              <span className="badge bg-t" style={{ fontSize: 11 }}>
                {fechamentoChecks.filter(Boolean).length}/{CHECKLIST_FECHAMENTO.length}
              </span>
            </div>
            <div className="card-bd" style={{ padding: '4px 14px 12px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', padding: '6px 0 10px', fontStyle: 'italic' }}>
                Preencher ao encerrar o turno
              </div>
              {CHECKLIST_FECHAMENTO.map((item, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={fechamentoChecks[i]}
                    onChange={() => setFechamentoChecks(prev => prev.map((v, j) => j === i ? !v : v))}
                    style={{ width: 15, height: 15, accentColor: 'var(--bordo)', cursor: 'pointer' }} />
                  <span style={{ textDecoration: fechamentoChecks[i] ? 'line-through' : 'none', color: fechamentoChecks[i] ? 'var(--muted)' : 'var(--text)' }}>{item}</span>
                </label>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div className="fg">
                  <label className="fl">Responsável</label>
                  <input className="inp" value={fechamentoResp} onChange={e => setFechamentoResp(e.target.value)} placeholder="Nome" />
                </div>
                <div className="fg">
                  <label className="fl">Observações</label>
                  <input className="inp" value={fechamentoObs} onChange={e => setFechamentoObs(e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <button className="btn bsm" style={{ marginTop: 10, width: '100%', border: '1px solid var(--bordo)', color: 'var(--bordo)' }}>💾 Salvar Registro</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MESAS ── */}
      {tab === 'mesas' && (
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">🪑 Mapa de Mesas — {loja}</span>
            <div style={{ display: 'flex', gap: 10 }}>
              {(Object.entries(STATUS_LABEL) as [MesaStatus, string][]).map(([k, v]) => (
                <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLOR[k], display: 'inline-block' }} />
                  {v}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: '0 14px 14px' }}>
            {mesas.map(m => (
              <div key={m.id}
                style={{ border: `2px solid ${STATUS_COLOR[m.status]}`, borderRadius: 12, padding: '14px 10px', textAlign: 'center', cursor: 'pointer', background: m.status === 'livre' ? 'transparent' : `${STATUS_COLOR[m.status]}15`, transition: 'all .15s' }}
                onClick={() => {
                  if (m.status === 'livre') {
                    setAtendForm(f => ({ ...f, mesa: m.num }))
                    setShowAtendForm(true)
                  }
                }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: STATUS_COLOR[m.status] }}>M{m.num}</div>
                <div style={{ fontSize: 11, color: STATUS_COLOR[m.status], fontWeight: 700, marginBottom: 4 }}>{STATUS_LABEL[m.status]}</div>
                {m.pax > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.pax} pax</div>}
                {m.garcom && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{m.garcom.split(' ')[0]}</div>}
                {m.entrada && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.entrada}</div>}
                {m.consumo > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>{fmtBRL(m.consumo)}</div>}
                {m.status === 'livre' && <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}>clique p/ abrir</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ATENDIMENTO ── */}
      {tab === 'atendimento' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Métricas de serviço */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { lbl: 'T. Médio Abordagem', val: '2 min', meta: 'Meta: <3 min', ok: true },
              { lbl: 'T. Médio Pedido',    val: '4 min', meta: 'Meta: <5 min', ok: true },
              { lbl: 'T. Médio Entrega',   val: '13 min',meta: 'Meta: <15 min',ok: true },
              { lbl: 'Taxa de Erro',        val: '1,8%',  meta: 'Pedidos errados', ok: true },
            ].map((m, i) => (
              <div key={i} className="card" style={{ padding: '12px 14px', margin: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{m.lbl}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.ok ? 'var(--success)' : 'var(--danger)' }}>{m.val}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{m.meta}</div>
              </div>
            ))}
          </div>

          {/* Tabela */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">👥 Registro de Atendimentos</span>
              <button className="btn bp bsm" onClick={() => setShowAtendForm(true)}><Plus size={11} /> Novo Atendimento</button>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Mesa</th><th>Garçom</th><th>Entrada</th><th>Saída</th>
                    <th>Tempo</th><th>Pessoas</th><th>Consumo</th><th>Avaliação</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {atendimentos.map(a => (
                    <tr key={a.id}>
                      <td><strong>Mesa {a.mesa}</strong></td>
                      <td>{a.garcom}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{a.entrada}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{a.saida || '—'}</td>
                      <td><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} color="var(--muted)" />{a.tempo}</span></td>
                      <td>{a.pax} pax</td>
                      <td><strong style={{ color: 'var(--success)' }}>{a.consumo > 0 ? fmtBRL(a.consumo) : '—'}</strong></td>
                      <td><span style={{ display: 'flex', gap: 1 }}>{a.avaliacao > 0 ? stars(a.avaliacao) : <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>}</span></td>
                      <td>
                        <span className={`badge ${a.status === 'Finalizado' ? 'bg-gr' : 'bg-b'}`}>{a.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── AVALIAÇÕES ── */}
      {tab === 'avaliacoes' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14 }}>
          {/* Distribuição */}
          <div className="card">
            <div className="card-hd"><span className="card-tt">Distribuição</span></div>
            <div className="card-bd" style={{ padding: '8px 14px 14px' }}>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--bordo)' }}>{mediaGeral.toFixed(1)}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 3, marginBottom: 4 }}>{stars(Math.round(mediaGeral), 16)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Média Geral · {avaliacoes.length} avaliações</div>
              </div>
              {distrib.map(d => (
                <div key={d.n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, width: 14, textAlign: 'right' }}>{d.n}</span>
                  <Star size={12} fill="var(--warning)" color="var(--warning)" />
                  <div style={{ flex: 1, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--warning)', borderRadius: 4, width: `${avaliacoes.length ? (d.count / avaliacoes.length) * 100 : 0}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--muted)', width: 24, textAlign: 'right' }}>{d.count}</span>
                </div>
              ))}

              <div style={{ marginTop: 16, padding: '12px', background: 'var(--cream)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>🎯 Metas x Resultado</div>
                {[
                  { lbl: 'Ticket Médio',       real: 'R$ 202', meta: 'R$ 200', ok: true },
                  { lbl: 'T. Atendimento',     real: '11 min', meta: '15 min', ok: true },
                  { lbl: 'Taxa de Erro',        real: '0%',     meta: '<3%',    ok: true },
                  { lbl: 'Avaliação',           real: '4,9',    meta: '4,5',    ok: true },
                ].map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                    <span style={{ color: 'var(--muted)' }}>{m.lbl}</span>
                    <span>
                      <strong style={{ color: m.ok ? 'var(--success)' : 'var(--danger)' }}>{m.real}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}> · meta {m.meta}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Avaliações recentes */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">⭐ Avaliações Recentes</span>
              <button className="btn bp bsm" onClick={() => setShowAvalForm(true)}><Plus size={11} /> Registrar</button>
            </div>
            <div className="card-bd" style={{ padding: '0 14px 14px' }}>
              {avaliacoes.map(a => (
                <div key={a.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <div>
                      <strong style={{ fontSize: 13 }}>Mesa {a.mesa || '—'}</strong>
                      {a.garcom && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>· {a.garcom}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>{stars(a.nota)}</div>
                  </div>
                  {a.comentario && <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>{a.comentario}</div>}
                  <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                    <span>{a.data}</span>
                    <span className="badge bg-t" style={{ fontSize: 10 }}>{a.canal}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PERFORMANCE ── */}
      {tab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Pódio */}
          <div className="card">
            <div className="card-hd"><span className="card-tt">🏆 Ranking do Dia</span></div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 20, padding: '16px 14px 20px' }}>
              {perfData.slice(0, 3).map((p, i) => {
                const medals = ['🥇', '🥈', '🥉']
                const heights = [90, 70, 55]
                const tiers = ['Elite', 'Ouro', 'Prata']
                const initials = p.garcom.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <div key={p.garcom} style={{ textAlign: 'center', order: i === 0 ? 1 : i === 1 ? 0 : 2 }}>
                    <div style={{ fontSize: 22 }}>{medals[i]}</div>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--bordo)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, margin: '6px auto' }}>{initials}</div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.garcom.split(' ')[0]}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.garcom.split(' ').slice(1).join(' ')}</div>
                    <div style={{ background: i === 0 ? 'var(--warning)' : i === 1 ? '#aaa' : '#cd7f32', height: heights[i], width: 80, borderRadius: '6px 6px 0 0', margin: '8px auto 0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                      <div style={{ color: '#fff', fontWeight: 900, fontSize: 20 }}>{p.score}</div>
                      <div style={{ color: '#fff', fontSize: 10, opacity: .85 }}>{tiers[i]}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tabela de métricas */}
          <div className="card">
            <div className="card-hd"><span className="card-tt">📊 Métricas por Garçom</span></div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Garçom</th><th>Loja</th><th>Mesas</th><th>Faturamento</th>
                    <th>Ticket Médio</th><th>T. Médio</th><th>Avaliação</th><th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {perfData.map((p, i) => {
                    const initials = p.garcom.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                    const tiers = ['Elite', 'Ouro', 'Prata', 'Bronze']
                    const tierColors = ['var(--warning)', '#aaa', '#cd7f32', 'var(--muted)']
                    return (
                      <tr key={p.garcom}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bordo)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{initials}</div>
                            <strong>{p.garcom}</strong>
                          </div>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{loja}</td>
                        <td>{p.mesas}</td>
                        <td><strong style={{ color: 'var(--success)' }}>{fmtBRL(p.fat)}</strong></td>
                        <td>{fmtBRL(p.ticket)}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>~14 min</td>
                        <td><span style={{ display: 'flex', gap: 1 }}>{stars(Math.round(p.media))}</span></td>
                        <td>
                          <span style={{ background: `${tierColors[i]}22`, color: tierColors[i], padding: '2px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12 }}>
                            {tiers[i] || 'Bronze'} {p.score}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Indicadores de qualidade */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {perfData.slice(0, 3).map(p => (
              <div className="card" key={p.garcom}>
                <div className="card-hd"><span className="card-tt" style={{ fontSize: 13 }}>{p.garcom}</span></div>
                <div className="card-bd" style={{ padding: '6px 14px 14px' }}>
                  {[
                    { lbl: 'Abordagem',       val: '2 min', ok: true },
                    { lbl: 'Pedido',           val: '4 min', ok: true },
                    { lbl: 'Entrega',          val: '13 min',ok: true },
                    { lbl: 'Apresent. Prato',  val: '4,8 ⭐',ok: true },
                    { lbl: 'Cordialidade',     val: '5,0 ⭐',ok: true },
                    { lbl: 'Postura',          val: '4,5 ⭐',ok: true },
                    { lbl: 'Erros',            val: '0',     ok: true },
                    { lbl: 'Devoluções',       val: '0',     ok: true },
                  ].map((row, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ color: 'var(--muted)' }}>{row.lbl}</span>
                      <strong style={{ color: row.ok ? 'var(--success)' : 'var(--danger)' }}>{row.val}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal Novo Atendimento ── */}
      {showAtendForm && (
        <Modal title="Novo Atendimento" open={showAtendForm} onClose={() => setShowAtendForm(false)} size="lg">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="fg">
              <label className="fl">Mesa *</label>
              <select className="inp" value={atendForm.mesa} onChange={e => setAtendForm(f => ({ ...f, mesa: e.target.value }))}>
                <option value="">Selecione...</option>
                {mesas.map(m => <option key={m.id} value={m.num}>Mesa {m.num} — {STATUS_LABEL[m.status]}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Garçom *</label>
              <select className="inp" value={atendForm.garcom} onChange={e => setAtendForm(f => ({ ...f, garcom: e.target.value }))}>
                <option value="">Selecione...</option>
                {GARCONS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Hora Entrada</label>
              <input className="inp" type="time" value={atendForm.entrada} onChange={e => setAtendForm(f => ({ ...f, entrada: e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Hora Saída</label>
              <input className="inp" type="time" value={atendForm.saida} onChange={e => setAtendForm(f => ({ ...f, saida: e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Nº Pessoas</label>
              <input className="inp" type="number" min={1} max={20} value={atendForm.pax} onChange={e => setAtendForm(f => ({ ...f, pax: Number(e.target.value) }))} />
            </div>
            <div className="fg">
              <label className="fl">Consumo Total (R$)</label>
              <input className="inp" value={atendForm.consumo} onChange={e => setAtendForm(f => ({ ...f, consumo: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="fg">
              <label className="fl">Avaliação</label>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setAtendForm(f => ({ ...f, avaliacao: n }))}
                    style={{ fontSize: 22, background: 'none', border: 'none', cursor: 'pointer', color: n <= atendForm.avaliacao ? 'var(--warning)' : 'var(--border)', padding: 0 }}>★</button>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Status</label>
              <select className="inp" value={atendForm.status} onChange={e => setAtendForm(f => ({ ...f, status: e.target.value as Atendimento['status'] }))}>
                <option>Em Atendimento</option>
                <option>Finalizado</option>
              </select>
            </div>
          </div>
          <div className="fg">
            <label className="fl">Observação</label>
            <input className="inp" value={atendForm.obs} onChange={e => setAtendForm(f => ({ ...f, obs: e.target.value }))} placeholder="Ex: aniversário, alergia, etc." />
          </div>
          <div className="fb" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn bsm" onClick={() => setShowAtendForm(false)}>Cancelar</button>
            <button className="btn bp bsm" onClick={saveAtendimento} disabled={!atendForm.mesa || !atendForm.garcom}>
              ✓ Registrar
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal Registrar Avaliação ── */}
      {showAvalForm && (
        <Modal title="Registrar Avaliação de Cliente" open={showAvalForm} onClose={() => setShowAvalForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="fg">
              <label className="fl">Mesa</label>
              <select className="inp" value={avalForm.mesa} onChange={e => setAvalForm(f => ({ ...f, mesa: e.target.value }))}>
                <option value="">Selecione...</option>
                {mesas.map(m => <option key={m.id} value={m.num}>Mesa {m.num}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Garçom</label>
              <select className="inp" value={avalForm.garcom} onChange={e => setAvalForm(f => ({ ...f, garcom: e.target.value }))}>
                <option value="">Selecione...</option>
                {GARCONS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Nota *</label>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button" onClick={() => setAvalForm(f => ({ ...f, nota: n }))}
                    style={{ fontSize: 24, background: 'none', border: 'none', cursor: 'pointer', color: n <= avalForm.nota ? 'var(--warning)' : 'var(--border)', padding: 0 }}>★</button>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Canal</label>
              <select className="inp" value={avalForm.canal} onChange={e => setAvalForm(f => ({ ...f, canal: e.target.value }))}>
                {CANAIS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="fg">
            <label className="fl">Comentário do Cliente</label>
            <textarea className="inp" rows={3} value={avalForm.comentario} onChange={e => setAvalForm(f => ({ ...f, comentario: e.target.value }))} placeholder="O que o cliente disse..." />
          </div>
          <div className="fb" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn bsm" onClick={() => setShowAvalForm(false)}>Cancelar</button>
            <button className="btn bp bsm" onClick={saveAvaliacao}>✓ Registrar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
