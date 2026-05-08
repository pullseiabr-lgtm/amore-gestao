import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Trash2, Star } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../../components/ui/Modal'
import {
  fetchSalaoMesas, updateSalaoMesa,
  fetchSalaoAtendimentos, insertSalaoAtendimento,
  fetchSalaoAvaliacoes, insertSalaoAvaliacao, deleteSalaoAvaliacao,
  fetchSalaoAvaliacaoEquipe, insertSalaoAvaliacaoEquipe, deleteSalaoAvaliacaoEquipe,
  fetchSalaoChecklist, upsertSalaoChecklistItem, updateSalaoChecklistItem, deleteSalaoChecklistItem,
} from '../../lib/db'
import type { SalaoMesa, SalaoAtendimento, SalaoAvaliacao, SalaoAvaliacaoEquipe, SalaoChecklistItem, CheckStatus, MesaStatus } from '../../types/database'

// ── Types ─────────────────────────────────────────────────────
type Tab = 'checklist' | 'mesas' | 'atendimento' | 'avaliacoes' | 'performance'

// ── Checklist templates ───────────────────────────────────────
interface CheckItem { categoria: string; item: string }

const ABERTURA_ITEMS: CheckItem[] = [
  { categoria: '🪑 SALÃO & MESAS',       item: 'Salão limpo e organizado' },
  { categoria: '🪑 SALÃO & MESAS',       item: 'Mesas alinhadas e niveladas' },
  { categoria: '🪑 SALÃO & MESAS',       item: 'Cardápios limpos e sem rasgados' },
  { categoria: '🪑 SALÃO & MESAS',       item: 'Reservas do dia conferidas' },
  { categoria: '👔 EQUIPE & APRESENTAÇÃO', item: 'Todos colaboradores presentes' },
  { categoria: '👔 EQUIPE & APRESENTAÇÃO', item: 'Uniformes completos e limpos' },
  { categoria: '👔 EQUIPE & APRESENTAÇÃO', item: 'Higiene pessoal em conformidade' },
  { categoria: '👔 EQUIPE & APRESENTAÇÃO', item: 'Briefing de atendimento realizado' },
  { categoria: '⚙️ INFRAESTRUTURA',       item: 'Ar condicionado/ventilação funcionando' },
  { categoria: '⚙️ INFRAESTRUTURA',       item: 'Iluminação adequada' },
  { categoria: '⚙️ INFRAESTRUTURA',       item: 'Música ambiente configurada' },
]

const FECHAMENTO_ITEMS: CheckItem[] = [
  { categoria: '🧹 LIMPEZA FINAL SALÃO', item: 'Mesas limpas e organizadas' },
  { categoria: '🧹 LIMPEZA FINAL SALÃO', item: 'Piso varrido e lavado' },
  { categoria: '🧹 LIMPEZA FINAL SALÃO', item: 'Banheiros limpos e abastecidos' },
  { categoria: '🔒 FECHAMENTO',          item: 'Comandas/pedidos conferidos' },
  { categoria: '🔒 FECHAMENTO',          item: 'Reclamações do dia registradas' },
  { categoria: '🔒 FECHAMENTO',          item: 'Ar condicionado desligado' },
  { categoria: '🔒 FECHAMENTO',          item: 'Luzes do salão apagadas' },
]

// ── Mock fallback ─────────────────────────────────────────────
const MESAS_MOCK: SalaoMesa[] = [
  { id:'1',  loja:'Amore Paiva', numero:1,  status:'livre',     garcom:null,           pax:0, entrada:null,    reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
  { id:'2',  loja:'Amore Paiva', numero:2,  status:'ocupada',   garcom:'João Ricardo', pax:3, entrada:'13:15', reserva_hora:null,  consumo:127.50, created_at:'', updated_at:'' },
  { id:'3',  loja:'Amore Paiva', numero:3,  status:'livre',     garcom:null,           pax:0, entrada:null,    reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
  { id:'4',  loja:'Amore Paiva', numero:4,  status:'reservada', garcom:null,           pax:4, entrada:null,    reserva_hora:'14:00', consumo:0,   created_at:'', updated_at:'' },
  { id:'5',  loja:'Amore Paiva', numero:5,  status:'ocupada',   garcom:'Maria Clara',  pax:2, entrada:'13:20', reserva_hora:null,  consumo:84.20,  created_at:'', updated_at:'' },
  { id:'6',  loja:'Amore Paiva', numero:6,  status:'livre',     garcom:null,           pax:0, entrada:null,    reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
  { id:'7',  loja:'Amore Paiva', numero:7,  status:'livre',     garcom:null,           pax:0, entrada:null,    reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
  { id:'8',  loja:'Amore Paiva', numero:8,  status:'ocupada',   garcom:'João Ricardo', pax:5, entrada:'12:50', reserva_hora:null,  consumo:210.00, created_at:'', updated_at:'' },
  { id:'9',  loja:'Amore Paiva', numero:9,  status:'reservada', garcom:null,           pax:6, entrada:null,    reserva_hora:'15:00', consumo:0,   created_at:'', updated_at:'' },
  { id:'10', loja:'Amore Paiva', numero:10, status:'livre',     garcom:null,           pax:0, entrada:null,    reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
  { id:'11', loja:'Amore Paiva', numero:11, status:'espera',    garcom:null,           pax:2, entrada:'13:40', reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
  { id:'12', loja:'Amore Paiva', numero:12, status:'livre',     garcom:null,           pax:0, entrada:null,    reserva_hora:null,  consumo:0,      created_at:'', updated_at:'' },
]

const AVALIACOES_MOCK: SalaoAvaliacao[] = [
  { id:'1', loja:'Amore Paiva', mesa:3,  garcom:'João Ricardo', nota:5, canal:'Presencial', comentario:'Atendimento excelente! Muito rápido.',   data_aval: new Date(Date.now()-7200000).toISOString(),  created_at:'' },
  { id:'2', loja:'Amore Paiva', mesa:7,  garcom:'Maria Clara',  nota:4, canal:'Presencial', comentario:'Açaí gostoso, atendimento ótimo.',        data_aval: new Date(Date.now()-3600000).toISOString(),  created_at:'' },
  { id:'3', loja:'Amore Paiva', mesa:1,  garcom:'João Ricardo', nota:5, canal:'Presencial', comentario:'Loja linda e açaí perfeito!',             data_aval: new Date(Date.now()-10800000).toISOString(), created_at:'' },
  { id:'4', loja:'Amore Paiva', mesa:6,  garcom:'João Ricardo', nota:5, canal:'WhatsApp',   comentario:'Melhor açaí da cidade!',                  data_aval: new Date(Date.now()-86400000).toISOString(), created_at:'' },
  { id:'5', loja:'Amore Paiva', mesa:5,  garcom:'Maria Clara',  nota:5, canal:'Presencial', comentario:'Ambiente aconchegante, voltaremos!',      data_aval: new Date(Date.now()-93600000).toISOString(), created_at:'' },
  { id:'6', loja:'Amore Paiva', mesa:4,  garcom:'Maria Clara',  nota:4, canal:'Google Maps',comentario:'Comida ótima, só o barulho era alto.',    data_aval: new Date(Date.now()-259200000).toISOString(),created_at:'' },
  { id:'7', loja:'Amore Paiva', mesa:8,  garcom:'João Ricardo', nota:5, canal:'iFood',      comentario:'Pedido chegou perfeito e no prazo!',      data_aval: new Date(Date.now()-266400000).toISOString(),created_at:'' },
  { id:'8', loja:'Amore Paiva', mesa:9,  garcom:'Maria Clara',  nota:3, canal:'Presencial', comentario:'Esperei mais do que o previsto.',         data_aval: new Date(Date.now()-345600000).toISOString(),created_at:'' },
]

const ATEND_MOCK: SalaoAtendimento[] = [
  { id:'1', loja:'Amore Paiva', mesa:2,  garcom:'João Ricardo', entrada:'11:42', saida:null,    tempo_min:null, pax:3, consumo:127.50, avaliacao:5, status:'em_atendimento', abordagem_min:1.8, pedido_min:3.5, entrega_min:11, apresent_prato:5, cordialidade:5, postura:4, erros:0, devolucoes:0, obs:null, created_by:null, created_at:'' },
  { id:'2', loja:'Amore Paiva', mesa:5,  garcom:'Maria Clara',  entrada:'12:05', saida:null,    tempo_min:null, pax:2, consumo:84.20,  avaliacao:0, status:'em_atendimento', abordagem_min:2.1, pedido_min:4.2, entrega_min:13, apresent_prato:4, cordialidade:4, postura:4, erros:1, devolucoes:0, obs:null, created_by:null, created_at:'' },
  { id:'3', loja:'Amore Paiva', mesa:8,  garcom:'João Ricardo', entrada:'12:35', saida:null,    tempo_min:null, pax:5, consumo:210.00, avaliacao:5, status:'em_atendimento', abordagem_min:1.6, pedido_min:3.2, entrega_min:10, apresent_prato:5, cordialidade:5, postura:5, erros:0, devolucoes:0, obs:null, created_by:null, created_at:'' },
  { id:'4', loja:'Amore Paiva', mesa:1,  garcom:'Maria Clara',  entrada:'10:10', saida:'11:20', tempo_min:70,   pax:2, consumo:98.00,  avaliacao:5, status:'finalizado',     abordagem_min:2.0, pedido_min:4.0, entrega_min:14, apresent_prato:5, cordialidade:5, postura:5, erros:0, devolucoes:0, obs:null, created_by:null, created_at:'' },
  { id:'5', loja:'Amore Paiva', mesa:3,  garcom:'João Ricardo', entrada:'10:30', saida:'12:00', tempo_min:90,   pax:3, consumo:156.80, avaliacao:4, status:'finalizado',     abordagem_min:1.9, pedido_min:3.8, entrega_min:12, apresent_prato:5, cordialidade:4, postura:5, erros:0, devolucoes:0, obs:null, created_by:null, created_at:'' },
  { id:'6', loja:'Amore Paiva', mesa:6,  garcom:'Maria Clara',  entrada:'09:45', saida:'11:10', tempo_min:85,   pax:4, consumo:203.40, avaliacao:5, status:'finalizado',     abordagem_min:2.2, pedido_min:4.5, entrega_min:13, apresent_prato:4, cordialidade:5, postura:4, erros:0, devolucoes:0, obs:null, created_by:null, created_at:'' },
]

const AVAL_EQUIPE_MOCK: SalaoAvaliacaoEquipe[] = [
  { id:'1', loja:'Amore Paiva', colaborador:'João Ricardo', data_aval:'2025-07-22', uniforme:5, higiene:5, postura:5, comunicacao:4, equipe:5, avaliado_por:'Admin', created_at:'' },
  { id:'2', loja:'Amore Paiva', colaborador:'Maria Clara',  data_aval:'2025-07-22', uniforme:5, higiene:4, postura:4, comunicacao:5, equipe:4, avaliado_por:'Admin', created_at:'' },
]

// ── Helpers ───────────────────────────────────────────────────
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
const STATUS_CHECK: Record<CheckStatus, { label: string; emoji: string; color: string }> = {
  pendente:      { label: 'Pendente',      emoji: '⏳', color: 'var(--warning)' },
  ok:            { label: 'OK',            emoji: '✅', color: 'var(--success)' },
  nao_conforme:  { label: 'Não conforme',  emoji: '❌', color: 'var(--danger)'  },
}
const TIER_COLORS = ['var(--warning)', '#aaa', '#cd7f32', 'var(--muted)']
const TIER_BG     = ['#FEF9C3', '#F1F5F9', '#FEF0E6', '#F3F4F6']
const TIER_LABELS = ['Elite', 'Ouro', 'Prata', 'Bronze']
const CANAIS = ['Presencial', 'WhatsApp', 'Google Maps', 'iFood', 'Outro']

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtData(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function fmtDataCurta(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}
function starsRow(nota: number, size = 14, interactive = false, onClick?: (n: number) => void) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i} size={size}
      fill={i < nota ? 'var(--warning)' : 'none'}
      color={i < nota ? 'var(--warning)' : 'var(--border)'}
      style={{ cursor: interactive ? 'pointer' : 'default' }}
      onClick={interactive && onClick ? () => onClick(i + 1) : undefined}
    />
  ))
}
function initials(nome: string) {
  return nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function avg(vals: number[]) {
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
}

// ── ChecklistPanel ────────────────────────────────────────────
interface ChecklistPanelProps {
  tipo: 'abertura' | 'fechamento'
  items: CheckItem[]
  records: SalaoChecklistItem[]
  loja: string
  data: string
  colaborador: string
  onStatusChange: (item: CheckItem, status: CheckStatus) => void
  onSave: (tipo: 'abertura' | 'fechamento', responsavel: string, obs: string) => void
  onAddItem: () => void
  onDeleteItem: (id: string) => void
  saving: boolean
}

function ChecklistPanel({ tipo, items, records, onStatusChange, onSave, onDeleteItem, saving }: ChecklistPanelProps) {
  const [responsavel, setResponsavel] = useState('')
  const [obs, setObs] = useState('')

  const getStatus = (item: string): CheckStatus => {
    const r = records.find(r => r.tipo === tipo && r.item === item)
    return r ? r.status : 'pendente'
  }
  const getCount = (categoria: string) => {
    const catItems = items.filter(i => i.categoria === categoria)
    return catItems.filter(i => getStatus(i.item) === 'ok').length
  }

  const categorias = [...new Set(items.map(i => i.categoria))]
  const totalOk = items.filter(i => getStatus(i.item) === 'ok').length

  const isAbertura = tipo === 'abertura'
  const headerColor = isAbertura ? 'var(--success)' : 'var(--bordo)'
  const icon = isAbertura ? '✅' : '🔒'
  const title = isAbertura ? 'Checklist Abertura — Salão' : 'Checklist Fechamento — Salão'

  return (
    <div className="card" style={{ border: `2px solid ${headerColor}20` }}>
      {/* Header */}
      <div className="card-hd" style={{ borderBottom: `2px solid ${headerColor}20` }}>
        <span className="card-tt" style={{ fontSize: 13 }}>{icon} {title}</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--cream)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>
          {totalOk}/{items.length} itens
        </span>
      </div>

      <div style={{ padding: '0 0 8px' }}>
        {!isAbertura && (
          <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>
            Preencher ao encerrar o turno
          </div>
        )}

        {categorias.map(cat => {
          const catItems = items.filter(i => i.categoria === cat)
          const catOk = getCount(cat)
          return (
            <div key={cat}>
              {/* Categoria header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 16px 6px', background: 'var(--cream)',
                borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{cat}</span>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{catOk}/{catItems.length}</span>
              </div>

              {/* Items */}
              {catItems.map(ci => {
                const st = getStatus(ci.item)
                const rec = records.find(r => r.tipo === tipo && r.item === ci.item)
                return (
                  <div key={ci.item} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 16px', borderBottom: '1px solid var(--border)',
                  }}>
                    <select
                      value={st}
                      onChange={e => onStatusChange(ci, e.target.value as CheckStatus)}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                        fontSize: 11, fontWeight: 600, background: '#fff',
                        color: STATUS_CHECK[st].color, outline: 'none', cursor: 'pointer',
                        minWidth: 130,
                      }}
                    >
                      {Object.entries(STATUS_CHECK).map(([k, v]) => (
                        <option key={k} value={k}>{v.emoji} {v.label}</option>
                      ))}
                    </select>
                    <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text)' }}>{ci.item}</span>
                    {rec && (
                      <button
                        className="ib rd"
                        onClick={() => onDeleteItem(rec.id)}
                        title="Remover"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Responsável + Observações */}
        <div style={{ padding: '12px 16px 8px', display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <div className="fg" style={{ margin: 0 }}>
            <label className="fl">Responsável</label>
            <input
              className="inp"
              value={responsavel}
              onChange={e => setResponsavel(e.target.value)}
              placeholder="Nome do garçom responsável"
            />
          </div>
          <div className="fg" style={{ margin: 0 }}>
            <label className="fl">Observações</label>
            <textarea
              className="inp txa"
              rows={2}
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Pendências, não conformidades..."
              style={{ resize: 'none', minHeight: 56 }}
            />
          </div>
          <button
            className={`btn bsm ${isAbertura ? 'bp' : ''}`}
            style={!isAbertura ? { border: '1px solid var(--bordo)', color: 'var(--bordo)' } : {}}
            onClick={() => onSave(tipo, responsavel, obs)}
            disabled={saving}
          >
            💾 {saving ? 'Salvando...' : 'Salvar Registro'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────
export default function SalaoPage() {
  const { theme } = useTheme()
  const { user } = useAuth()

  const [tab, setTab] = useState<Tab>('checklist')
  const [loja, setLoja] = useState('Todas as Lojas')
  const [dataFiltro, setDataFiltro] = useState(new Date().toISOString().slice(0, 10))
  const [garcomFiltro, setGarcomFiltro] = useState('Todos os Garçons')
  const [notaFiltro, setNotaFiltro] = useState('Todas as Notas')
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7))

  // Data
  const [mesas, setMesas] = useState<SalaoMesa[]>(MESAS_MOCK)
  const [atendimentos, setAtendimentos] = useState<SalaoAtendimento[]>(ATEND_MOCK)
  const [avaliacoes, setAvaliacoes] = useState<SalaoAvaliacao[]>(AVALIACOES_MOCK)
  const [avalEquipe, setAvalEquipe] = useState<SalaoAvaliacaoEquipe[]>(AVAL_EQUIPE_MOCK)
  const [checkRecords, setCheckRecords] = useState<SalaoChecklistItem[]>([])
  const [saving, setSaving] = useState(false)

  // Modals
  const [showAtendModal, setShowAtendModal] = useState(false)
  const [showAvalModal, setShowAvalModal]   = useState(false)
  const [showEquipeModal, setShowEquipeModal] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItemTipo, setNewItemTipo] = useState<'abertura'|'fechamento'>('abertura')

  // Forms
  const [atendForm, setAtendForm] = useState({
    mesa: '', garcom: '', entrada: '', saida: '', pax: 2, consumo: '',
    abordagem_min: '', pedido_min: '', entrega_min: '',
    apresent_prato: 5, cordialidade: 5, postura: 5, erros: 0, devolucoes: 0,
    avaliacao: 5, obs: '', status: 'em_atendimento' as SalaoAtendimento['status'],
  })
  const [avalForm, setAvalForm] = useState({ mesa: '', garcom: '', nota: 5, canal: 'Presencial', comentario: '' })
  const [equipeForm, setEquipeForm] = useState({ colaborador: '', uniforme: 5, higiene: 5, postura: 5, comunicacao: 5, equipe: 5 })
  const [newItemForm, setNewItemForm] = useState({ tipo: 'abertura' as 'abertura'|'fechamento', categoria: '', item: '' })

  // Colaboradores da loja
  const garcons = useMemo(() => {
    const s = new Set(atendimentos.map(a => a.garcom))
    return [...s]
  }, [atendimentos])

  // Fetch data
  const load = useCallback(async () => {
    try {
      const [m, a, av, ae] = await Promise.all([
        fetchSalaoMesas(loja === 'Todas as Lojas' ? undefined : loja),
        fetchSalaoAtendimentos(loja === 'Todas as Lojas' ? undefined : loja),
        fetchSalaoAvaliacoes(loja === 'Todas as Lojas' ? undefined : loja),
        fetchSalaoAvaliacaoEquipe(loja === 'Todas as Lojas' ? undefined : loja),
      ])
      if (m.length) setMesas(m)
      if (a.length) setAtendimentos(a)
      if (av.length) setAvaliacoes(av)
      if (ae.length) setAvalEquipe(ae)
    } catch { /* usa mock */ }
  }, [loja])

  const loadChecklist = useCallback(async () => {
    const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
    try {
      const recs = await fetchSalaoChecklist(lojaEf, dataFiltro)
      setCheckRecords(recs)
    } catch { /* silent */ }
  }, [loja, dataFiltro, theme.stores])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'checklist') loadChecklist() }, [tab, loadChecklist])

  // ── KPIs mesas ──────────────────────────────────────────────
  const mesasFiltradas = loja === 'Todas as Lojas' ? mesas : mesas.filter(m => m.loja === loja)
  const livres    = mesasFiltradas.filter(m => m.status === 'livre').length
  const ocupadas  = mesasFiltradas.filter(m => m.status === 'ocupada').length
  const reservadas= mesasFiltradas.filter(m => m.status === 'reservada').length
  const espera    = mesasFiltradas.filter(m => m.status === 'espera').length

  // ── Avaliações ───────────────────────────────────────────────
  const avalFiltradas = useMemo(() => {
    return avaliacoes.filter(a => {
      const lojaOk  = loja === 'Todas as Lojas' || a.loja === loja
      const notaOk  = notaFiltro === 'Todas as Notas' || a.nota === parseInt(notaFiltro)
      const garcOk  = garcomFiltro === 'Todos os Garçons' || a.garcom === garcomFiltro
      return lojaOk && notaOk && garcOk
    })
  }, [avaliacoes, loja, notaFiltro, garcomFiltro])

  const mediaGeral = useMemo(() => {
    if (!avalFiltradas.length) return 0
    return avalFiltradas.reduce((s, a) => s + a.nota, 0) / avalFiltradas.length
  }, [avalFiltradas])

  const distrib = useMemo(() =>
    [5,4,3,2,1].map(n => ({ n, count: avalFiltradas.filter(a => a.nota === n).length }))
  , [avalFiltradas])

  // ── Performance por garçom ───────────────────────────────────
  const perfData = useMemo(() => {
    const atendFilt = atendimentos.filter(a => {
      const lojaOk = loja === 'Todas as Lojas' || a.loja === loja
      const mesOk  = a.created_at ? a.created_at.startsWith(mesFiltro) : true
      const gOk    = garcomFiltro === 'Todos os Garçons' || a.garcom === garcomFiltro
      return lojaOk && mesOk && gOk
    })

    return garcons.map(g => {
      const at = atendFilt.filter(a => a.garcom === g)
      const fat = at.reduce((s, a) => s + a.consumo, 0)
      const ticket = at.length ? fat / at.length : 0
      const avs = at.filter(a => a.avaliacao > 0)
      const mediaAval = avs.length ? avg(avs.map(a => a.avaliacao)) : 0
      const abord = at.filter(a => a.abordagem_min).map(a => a.abordagem_min!)
      const ped   = at.filter(a => a.pedido_min).map(a => a.pedido_min!)
      const ent   = at.filter(a => a.entrega_min).map(a => a.entrega_min!)
      const erros = at.reduce((s, a) => s + a.erros, 0)
      const devol = at.reduce((s, a) => s + a.devolucoes, 0)
      const total = at.reduce((s, a) => s + a.consumo, 0)
      const apresent = avg(at.map(a => a.apresent_prato))
      const cord   = avg(at.map(a => a.cordialidade))
      const post   = avg(at.map(a => a.postura))
      const convRate = at.length ? Math.min(94, 80 + at.length * 2) : 0
      const score = Math.round((mediaAval / 5) * 60 + Math.min(at.length * 3, 40))
      const lojaG = at[0]?.loja ?? (theme.stores[0] || 'Amore Paiva')
      return {
        garcom: g, loja: lojaG, mesas: at.length, fat, ticket, total,
        mediaAval, abord: abord.length ? avg(abord) : 2.0,
        ped: ped.length ? avg(ped) : 4.0,
        ent: ent.length ? avg(ent) : 13.0,
        erros, devol, apresent: apresent || 4.5, cord: cord || 4.8, post: post || 4.6,
        convRate, score,
      }
    }).sort((a, b) => b.score - a.score)
  }, [atendimentos, garcons, loja, mesFiltro, garcomFiltro, theme.stores])

  // ── Indicadores de qualidade ─────────────────────────────────
  const qualidade = useMemo(() => {
    return garcons.filter(g => garcomFiltro === 'Todos os Garçons' || g === garcomFiltro)
      .map(g => {
        const at = atendimentos.filter(a => a.garcom === g && (loja === 'Todas as Lojas' || a.loja === loja))
        return {
          garcom: g,
          abord:  at.filter(a => a.abordagem_min).length ? avg(at.filter(a => a.abordagem_min).map(a => a.abordagem_min!)) : 2.0,
          ped:    at.filter(a => a.pedido_min).length ? avg(at.filter(a => a.pedido_min).map(a => a.pedido_min!)) : 4.0,
          ent:    at.filter(a => a.entrega_min).length ? avg(at.filter(a => a.entrega_min).map(a => a.entrega_min!)) : 13.0,
          apresent: avg(at.map(a => a.apresent_prato)) || 4.5,
          cord:     avg(at.map(a => a.cordialidade)) || 4.8,
          post:     avg(at.map(a => a.postura)) || 4.6,
          erros:    at.reduce((s, a) => s + a.erros, 0),
          devol:    at.reduce((s, a) => s + a.devolucoes, 0),
        }
      })
  }, [atendimentos, garcons, loja, garcomFiltro])

  // ── Handlers Checklist ───────────────────────────────────────
  const handleCheckStatus = async (ci: CheckItem, status: CheckStatus) => {
    const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
    const existing = checkRecords.find(r => r.tipo === (ABERTURA_ITEMS.includes(ci) ? 'abertura' : 'fechamento') && r.item === ci.item)
    const tipo = ABERTURA_ITEMS.find(i => i.item === ci.item) ? 'abertura' : 'fechamento'
    try {
      if (existing) {
        const updated = await updateSalaoChecklistItem(existing.id, { status })
        setCheckRecords(prev => prev.map(r => r.id === existing.id ? { ...r, ...updated } : r))
      } else {
        const novo = await upsertSalaoChecklistItem({
          loja: lojaEf, data_reg: dataFiltro, tipo, categoria: ci.categoria,
          item: ci.item, status, colaborador: garcomFiltro !== 'Todos os Garçons' ? garcomFiltro : null,
          responsavel: null, observacoes: null, criado_por: user?.name || null,
        })
        setCheckRecords(prev => [...prev, novo])
      }
    } catch {
      // fallback local
      if (existing) {
        setCheckRecords(prev => prev.map(r => r.id === existing.id ? { ...r, status } : r))
      } else {
        setCheckRecords(prev => [...prev, {
          id: String(Date.now()), loja: lojaEf, data_reg: dataFiltro, tipo,
          categoria: ci.categoria, item: ci.item, status,
          colaborador: null, responsavel: null, observacoes: null, criado_por: null, created_at: new Date().toISOString(),
        }])
      }
    }
  }

  const handleSaveChecklist = async (tipo: 'abertura'|'fechamento', responsavel: string, obs: string) => {
    setSaving(true)
    const items = tipo === 'abertura' ? ABERTURA_ITEMS : FECHAMENTO_ITEMS
    const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
    try {
      for (const ci of items) {
        const existing = checkRecords.find(r => r.tipo === tipo && r.item === ci.item)
        if (existing) {
          await updateSalaoChecklistItem(existing.id, { responsavel, observacoes: obs })
        } else {
          await upsertSalaoChecklistItem({
            loja: lojaEf, data_reg: dataFiltro, tipo, categoria: ci.categoria,
            item: ci.item, status: 'pendente', colaborador: null, responsavel, observacoes: obs,
            criado_por: user?.name || null,
          })
        }
      }
      await loadChecklist()
    } catch { /* silent */ } finally {
      setSaving(false)
    }
  }

  const handleDeleteCheckItem = async (id: string) => {
    try {
      await deleteSalaoChecklistItem(id)
      setCheckRecords(prev => prev.filter(r => r.id !== id))
    } catch {
      setCheckRecords(prev => prev.filter(r => r.id !== id))
    }
  }

  // ── Handler Atendimento ──────────────────────────────────────
  const saveAtendimento = async () => {
    if (!atendForm.mesa || !atendForm.garcom) return
    const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const novo: Omit<SalaoAtendimento, 'id'|'created_at'> = {
      loja: lojaEf,
      mesa: parseInt(atendForm.mesa),
      garcom: atendForm.garcom,
      entrada: atendForm.entrada || now,
      saida: atendForm.saida || null,
      tempo_min: null,
      pax: atendForm.pax,
      consumo: parseFloat(atendForm.consumo.replace(',', '.').replace(/[^\d.]/g, '')) || 0,
      avaliacao: atendForm.avaliacao,
      status: atendForm.status,
      abordagem_min: atendForm.abordagem_min ? parseFloat(atendForm.abordagem_min) : null,
      pedido_min:    atendForm.pedido_min    ? parseFloat(atendForm.pedido_min)    : null,
      entrega_min:   atendForm.entrega_min   ? parseFloat(atendForm.entrega_min)   : null,
      apresent_prato: atendForm.apresent_prato,
      cordialidade:   atendForm.cordialidade,
      postura:        atendForm.postura,
      erros:          atendForm.erros,
      devolucoes:     atendForm.devolucoes,
      obs: atendForm.obs || null,
      created_by: user?.name || null,
    }
    try {
      const saved = await insertSalaoAtendimento(novo)
      setAtendimentos(prev => [saved, ...prev])
      // update mesa status
      const mesa = mesas.find(m => m.numero === parseInt(atendForm.mesa))
      if (mesa && atendForm.status === 'em_atendimento') {
        try {
          const updMesa = await updateSalaoMesa(mesa.id, { status: 'ocupada', garcom: atendForm.garcom, pax: atendForm.pax, entrada: novo.entrada })
          setMesas(prev => prev.map(m => m.id === mesa.id ? updMesa : m))
        } catch {
          setMesas(prev => prev.map(m => m.numero === parseInt(atendForm.mesa) ? { ...m, status: 'ocupada', garcom: atendForm.garcom, pax: atendForm.pax, entrada: novo.entrada } : m))
        }
      }
    } catch {
      setAtendimentos(prev => [{ ...novo, id: String(Date.now()), created_at: new Date().toISOString() }, ...prev])
    }
    setShowAtendModal(false)
    setAtendForm({ mesa:'', garcom:'', entrada:'', saida:'', pax:2, consumo:'', abordagem_min:'', pedido_min:'', entrega_min:'', apresent_prato:5, cordialidade:5, postura:5, erros:0, devolucoes:0, avaliacao:5, obs:'', status:'em_atendimento' })
  }

  // ── Handler Avaliação ────────────────────────────────────────
  const saveAvaliacao = async () => {
    const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
    const nova: Omit<SalaoAvaliacao, 'id'|'created_at'> = {
      loja: lojaEf,
      mesa: avalForm.mesa ? parseInt(avalForm.mesa) : null,
      garcom: avalForm.garcom || null,
      nota: avalForm.nota,
      canal: avalForm.canal,
      comentario: avalForm.comentario || null,
      data_aval: new Date().toISOString(),
    }
    try {
      const saved = await insertSalaoAvaliacao(nova)
      setAvaliacoes(prev => [saved, ...prev])
    } catch {
      setAvaliacoes(prev => [{ ...nova, id: String(Date.now()), created_at: new Date().toISOString() }, ...prev])
    }
    setShowAvalModal(false)
    setAvalForm({ mesa:'', garcom:'', nota:5, canal:'Presencial', comentario:'' })
  }

  const deleteAvaliacao = async (id: string) => {
    try { await deleteSalaoAvaliacao(id) } catch { /* silent */ }
    setAvaliacoes(prev => prev.filter(a => a.id !== id))
  }

  // ── Handler Avaliação Equipe ─────────────────────────────────
  const saveAvalEquipe = async () => {
    if (!equipeForm.colaborador) return
    const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
    const nova: Omit<SalaoAvaliacaoEquipe, 'id'|'created_at'> = {
      loja: lojaEf,
      colaborador: equipeForm.colaborador,
      data_aval: new Date().toISOString().slice(0, 10),
      uniforme: equipeForm.uniforme,
      higiene: equipeForm.higiene,
      postura: equipeForm.postura,
      comunicacao: equipeForm.comunicacao,
      equipe: equipeForm.equipe,
      avaliado_por: user?.name || 'Admin',
    }
    try {
      const saved = await insertSalaoAvaliacaoEquipe(nova)
      setAvalEquipe(prev => [saved, ...prev])
    } catch {
      setAvalEquipe(prev => [{ ...nova, id: String(Date.now()), created_at: new Date().toISOString() }, ...prev])
    }
    setShowEquipeModal(false)
    setEquipeForm({ colaborador:'', uniforme:5, higiene:5, postura:5, comunicacao:5, equipe:5 })
  }

  const deleteAvalEquipe = async (id: string) => {
    try { await deleteSalaoAvaliacaoEquipe(id) } catch { /* silent */ }
    setAvalEquipe(prev => prev.filter(a => a.id !== id))
  }

  // ── Tabs config ──────────────────────────────────────────────
  const TABS: { key: Tab; label: string }[] = [
    { key: 'checklist',   label: '📋 Checklist Salão' },
    { key: 'mesas',       label: '🪑 Mesas' },
    { key: 'atendimento', label: '👥 Atendimento' },
    { key: 'avaliacoes',  label: '⭐ Avaliações' },
    { key: 'performance', label: '📊 Performance' },
  ]

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>

      {/* ══ TABS BAR ══ */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
        background: '#EEE9E4', borderRadius: 10, padding: '4px 4px',
        marginBottom: 12,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
            style={{ fontSize: 12 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ CHECKLIST ══ */}
      {tab === 'checklist' && (
        <div>
          {/* Filter bar */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <select className="flt inp" value={loja} onChange={e => setLoja(e.target.value)} style={{ maxWidth: 160 }}>
              <option value="Todas as Lojas">🏪 Todas as Lojas</option>
              {theme.stores.map(s => <option key={s}>{s}</option>)}
            </select>
            <input
              type="date" className="inp" value={dataFiltro}
              onChange={e => setDataFiltro(e.target.value)}
              style={{ maxWidth: 160 }}
            />
            <select className="flt inp" value={garcomFiltro} onChange={e => setGarcomFiltro(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="Todos Colaboradores">Todos Colaboradores</option>
              {garcons.map(g => <option key={g}>{g}</option>)}
            </select>
            <button className="btn bp bsm" onClick={() => setShowAddItem(true)}>
              <Plus size={11} /> Adicionar Item
            </button>
            <button className="btn bsm" style={{ border: '1px solid var(--border)' }} onClick={() => { handleSaveChecklist('abertura','',''); handleSaveChecklist('fechamento','','') }} disabled={saving}>
              💾 Salvar Registro
            </button>
          </div>

          {/* Checklists */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <ChecklistPanel
              tipo="abertura" items={ABERTURA_ITEMS} records={checkRecords}
              loja={loja} data={dataFiltro} colaborador={garcomFiltro}
              onStatusChange={handleCheckStatus}
              onSave={handleSaveChecklist}
              onAddItem={() => { setNewItemTipo('abertura'); setShowAddItem(true) }}
              onDeleteItem={handleDeleteCheckItem}
              saving={saving}
            />
            <ChecklistPanel
              tipo="fechamento" items={FECHAMENTO_ITEMS} records={checkRecords}
              loja={loja} data={dataFiltro} colaborador={garcomFiltro}
              onStatusChange={handleCheckStatus}
              onSave={handleSaveChecklist}
              onAddItem={() => { setNewItemTipo('fechamento'); setShowAddItem(true) }}
              onDeleteItem={handleDeleteCheckItem}
              saving={saving}
            />
          </div>

          {/* Avaliação de Equipe */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">Avaliação de Equipe</span>
              <button className="btn bp bsm" onClick={() => setShowEquipeModal(true)}>
                <Plus size={11} /> Avaliar Colaborador
              </button>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>COLABORADOR</th>
                    <th>DATA</th>
                    <th>UNIFORME</th>
                    <th>HIGIENE</th>
                    <th>POSTURA</th>
                    <th>COMUNICAÇÃO</th>
                    <th>EQUIPE</th>
                    <th>MÉDIA</th>
                    <th>AVALIADO POR</th>
                    <th>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {avalEquipe.map(ae => {
                    const media = avg([ae.uniforme, ae.higiene, ae.postura, ae.comunicacao, ae.equipe])
                    return (
                      <tr key={ae.id}>
                        <td><strong>{ae.colaborador}</strong></td>
                        <td style={{ color: 'var(--muted)', fontSize: 11 }}>{fmtDataCurta(ae.data_aval)}</td>
                        <td><span style={{ display:'flex', gap:1 }}>{starsRow(ae.uniforme, 12)}</span></td>
                        <td><span style={{ display:'flex', gap:1 }}>{starsRow(ae.higiene, 12)}</span></td>
                        <td><span style={{ display:'flex', gap:1 }}>{starsRow(ae.postura, 12)}</span></td>
                        <td><span style={{ display:'flex', gap:1 }}>{starsRow(ae.comunicacao, 12)}</span></td>
                        <td><span style={{ display:'flex', gap:1 }}>{starsRow(ae.equipe, 12)}</span></td>
                        <td><strong style={{ color:'var(--bordo)' }}>{media.toFixed(1)}</strong></td>
                        <td style={{ color:'var(--muted)', fontSize:11 }}>{ae.avaliado_por}</td>
                        <td>
                          <div className="ab">
                            <button className="ib rd" onClick={() => deleteAvalEquipe(ae.id)} title="Remover">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!avalEquipe.length && (
                    <tr><td colSpan={10} style={{ textAlign:'center', color:'var(--muted)', padding:24 }}>Nenhuma avaliação registrada</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ MESAS ══ */}
      {tab === 'mesas' && (
        <div>
          {/* Filter bar */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <select className="inp" value={loja} onChange={e => setLoja(e.target.value)} style={{ maxWidth:160 }}>
              <option value="Todas as Lojas">🏪 Todas as Lojas</option>
              {theme.stores.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn bp bsm" onClick={() => setShowAtendModal(true)}>
              <Plus size={11} /> Registrar Atendimento
            </button>
          </div>

          {/* KPIs */}
          <div className="kpi-grid" style={{ marginBottom: 16 }}>
            {[
              { lbl:'MESAS LIVRES',    val:`${livres}`, sub:`de ${mesasFiltradas.length} mesas`,  col:'var(--success)' },
              { lbl:'MESAS OCUPADAS',  val:`${ocupadas}`,  sub:'Atendimento ativo',   col:'var(--bordo)' },
              { lbl:'RESERVADAS',      val:`${reservadas}`,sub:'Aguardando clientes',  col:'var(--blue)' },
              { lbl:'EM ESPERA',       val:`${espera}`,    sub:'Clientes na fila',    col:'var(--warning)' },
            ].map((k, i) => (
              <div className="kpi" key={i}>
                <div className="kpi-ac" style={{ background: k.col }} />
                <div className="kpi-lbl">{k.lbl}</div>
                <div className="kpi-val">{k.val}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Mapa */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">Mapa de Mesas</span>
              <div style={{ display:'flex', gap:12 }}>
                {(Object.entries(STATUS_LABEL) as [MesaStatus, string][]).map(([k, v]) => (
                  <span key={k} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:STATUS_COLOR[k], display:'inline-block' }} />
                    {v}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px, 1fr))', gap:12, padding:'16px' }}>
              {mesasFiltradas.map(m => (
                <div
                  key={m.id}
                  onClick={() => { if (m.status === 'livre') { setAtendForm(f => ({ ...f, mesa: String(m.numero) })); setShowAtendModal(true) } }}
                  style={{
                    border: `2px solid ${STATUS_COLOR[m.status]}`,
                    borderRadius: 12, padding: '16px 12px', textAlign: 'center',
                    cursor: m.status === 'livre' ? 'pointer' : 'default',
                    background: m.status === 'livre' ? '#fff' : `${STATUS_COLOR[m.status]}12`,
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>Mesa</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: STATUS_COLOR[m.status], lineHeight: 1.1 }}>{m.numero}</div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: STATUS_COLOR[m.status],
                    marginTop: 4, marginBottom: m.pax || m.reserva_hora ? 6 : 0,
                  }}>{STATUS_LABEL[m.status]}</div>
                  {m.status === 'reservada' && m.reserva_hora && (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Reserva {m.reserva_hora}</div>
                  )}
                  {m.status === 'reservada' && m.pax > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.pax} pessoas</div>
                  )}
                  {m.status === 'ocupada' && m.garcom && (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.garcom.split(' ')[0]}</div>
                  )}
                  {m.status === 'ocupada' && m.pax > 0 && m.entrada && (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.pax} pess. · {m.entrada}</div>
                  )}
                  {m.status === 'espera' && m.pax > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{m.pax} pess. aguardando</div>
                  )}
                  {m.consumo > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>{fmtBRL(m.consumo)}</div>
                  )}
                  {m.status === 'livre' && (
                    <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}>clique p/ abrir</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ ATENDIMENTO ══ */}
      {tab === 'atendimento' && (
        <div>
          {/* Filter bar */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <select className="inp" value={garcomFiltro} onChange={e => setGarcomFiltro(e.target.value)} style={{ maxWidth:200 }}>
              <option value="Todos os Garçons">Todos os Garçons</option>
              {garcons.map(g => <option key={g}>{g}</option>)}
            </select>
            <input type="date" className="inp" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} style={{ maxWidth:160 }} />
            <select className="inp" value={loja} onChange={e => setLoja(e.target.value)} style={{ maxWidth:160 }}>
              <option value="Todas as Lojas">Todas Lojas</option>
              {theme.stores.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className="btn bp bsm" onClick={() => setShowAtendModal(true)}>
              <Plus size={11} /> Novo Atendimento
            </button>
          </div>

          {/* KPIs */}
          <div className="kpi-grid" style={{ marginBottom:16 }}>
            {[
              { lbl:'TEMPO MÉDIO ABORDAGEM', val:'2 min',  sub:'Meta: <3 min' },
              { lbl:'TEMPO MÉDIO PEDIDO',    val:'4 min',  sub:'Meta: <5 min' },
              { lbl:'TEMPO MÉDIO ENTREGA',   val:'13 min', sub:'Meta: <15 min' },
              { lbl:'TAXA DE ERRO',          val:'1,8%',   sub:'Pedidos errados' },
            ].map((k, i) => (
              <div className="kpi" key={i}>
                <div className="kpi-ac" style={{ background: 'var(--success)' }} />
                <div className="kpi-lbl">{k.lbl}</div>
                <div className="kpi-val" style={{ color:'var(--success)', fontSize:18 }}>{k.val}</div>
                <div className="kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Tabela indicadores */}
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">Indicadores de Qualidade por Garçom</span>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>GARÇOM</th>
                    <th>ABORDAGEM</th>
                    <th>PEDIDO</th>
                    <th>ENTREGA</th>
                    <th>APRESENT. PRATO</th>
                    <th>CORDIALIDADE</th>
                    <th>POSTURA</th>
                    <th>ERROS</th>
                    <th>DEVOL.</th>
                  </tr>
                </thead>
                <tbody>
                  {qualidade.map(q => (
                    <tr key={q.garcom}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--bordo)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:10 }}>
                            {initials(q.garcom)}
                          </div>
                          <strong style={{ fontSize:12 }}>{q.garcom}</strong>
                        </div>
                      </td>
                      <td>
                        <span style={{ background:'#ECFDF5', color:'var(--success)', padding:'2px 7px', borderRadius:6, fontSize:11, fontWeight:600 }}>
                          {q.abord.toFixed(1)} min
                        </span>
                      </td>
                      <td>
                        <span style={{ background:'#ECFDF5', color:'var(--success)', padding:'2px 7px', borderRadius:6, fontSize:11, fontWeight:600 }}>
                          {q.ped.toFixed(1)} min
                        </span>
                      </td>
                      <td>
                        <span style={{ background:'#ECFDF5', color:'var(--success)', padding:'2px 7px', borderRadius:6, fontSize:11, fontWeight:600 }}>
                          {q.ent.toFixed(0)} min
                        </span>
                      </td>
                      <td><span style={{ display:'flex', gap:1 }}>{starsRow(Math.round(q.apresent), 12)}</span></td>
                      <td><span style={{ display:'flex', gap:1 }}>{starsRow(Math.round(q.cord), 12)}</span></td>
                      <td><span style={{ display:'flex', gap:1 }}>{starsRow(Math.round(q.post), 12)}</span></td>
                      <td>
                        <strong style={{ color: q.erros > 0 ? 'var(--danger)' : 'var(--success)' }}>{q.erros}</strong>
                      </td>
                      <td>
                        <strong style={{ color: q.devol > 0 ? 'var(--warning)' : 'var(--success)' }}>{q.devol}</strong>
                      </td>
                    </tr>
                  ))}
                  {!qualidade.length && (
                    <tr><td colSpan={9} style={{ textAlign:'center', color:'var(--muted)', padding:24 }}>Nenhum atendimento registrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ AVALIAÇÕES ══ */}
      {tab === 'avaliacoes' && (
        <div>
          {/* Filter bar */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <select className="inp" value={garcomFiltro} onChange={e => setGarcomFiltro(e.target.value)} style={{ maxWidth:200 }}>
              <option value="Todos os Garçons">Todos os Garçons</option>
              {garcons.map(g => <option key={g}>{g}</option>)}
            </select>
            <input type="date" className="inp" value={dataFiltro} onChange={e => setDataFiltro(e.target.value)} style={{ maxWidth:160 }} />
            <select className="inp" value={notaFiltro} onChange={e => setNotaFiltro(e.target.value)} style={{ maxWidth:160 }}>
              <option value="Todas as Notas">Todas as Notas</option>
              {[5,4,3,2,1].map(n => <option key={n} value={String(n)}>{n} estrela{n > 1 ? 's':''}</option>)}
            </select>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {/* Distribuição */}
            <div className="card">
              <div className="card-hd"><span className="card-tt">Distribuição de Notas</span></div>
              <div className="card-bd">
                {distrib.map(d => (
                  <div key={d.n} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                    <span style={{ display:'flex', gap:1, width:80 }}>{starsRow(d.n, 12)}</span>
                    <div style={{ flex:1, height:10, background:'var(--border)', borderRadius:5, overflow:'hidden' }}>
                      <div style={{
                        height:'100%', borderRadius:5, transition:'.5s',
                        background: d.n >= 4 ? 'var(--success)' : d.n === 3 ? 'var(--warning)' : 'var(--danger)',
                        width: `${avalFiltradas.length ? (d.count / avalFiltradas.length) * 100 : 0}%`,
                      }} />
                    </div>
                    <span style={{ fontSize:11, color:'var(--muted)', width:80, textAlign:'right' }}>
                      {d.count} avaliação{d.count !== 1 ? 'ões':''}
                    </span>
                  </div>
                ))}

                <div style={{ textAlign:'center', marginTop:20, padding:'16px 0' }}>
                  <div style={{ fontSize:13, color:'var(--muted)', marginBottom:6 }}>Média Geral</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                    <span style={{ fontSize:40, fontWeight:900, color:'var(--bordo)' }}>{mediaGeral.toFixed(1)}</span>
                    <Star size={32} fill="var(--warning)" color="var(--warning)" />
                  </div>
                </div>
              </div>
            </div>

            {/* Últimas avaliações */}
            <div className="card">
              <div className="card-hd">
                <span className="card-tt">Últimas Avaliações</span>
                <button className="btn bp bsm" onClick={() => setShowAvalModal(true)}>
                  <Plus size={11} /> Registrar
                </button>
              </div>
              <div className="card-bd" style={{ padding:'0 16px 16px', maxHeight:440, overflowY:'auto' }}>
                {avalFiltradas.map(a => (
                  <div key={a.id} style={{ padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                      <div>
                        <strong style={{ fontSize:13 }}>
                          {a.mesa ? `Mesa ${a.mesa}` : '—'}
                          {a.garcom && <span style={{ fontWeight:400, color:'var(--muted)', marginLeft:5, fontSize:12 }}>· {a.garcom}</span>}
                        </strong>
                      </div>
                      <div style={{ display:'flex', gap:2, alignItems:'center' }}>
                        <span style={{ display:'flex', gap:1 }}>{starsRow(a.nota, 13)}</span>
                        <button className="ib rd" style={{ marginLeft:4 }} onClick={() => deleteAvaliacao(a.id)}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    {a.comentario && (
                      <div style={{ fontSize:12, color:'var(--text)', marginBottom:6 }}>{a.comentario}</div>
                    )}
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtData(a.data_aval)}</span>
                      <span className="badge bg-t" style={{ fontSize:10 }}>{a.canal}</span>
                    </div>
                  </div>
                ))}
                {!avalFiltradas.length && (
                  <div style={{ textAlign:'center', color:'var(--muted)', padding:32, fontSize:13 }}>Nenhuma avaliação encontrada</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ PERFORMANCE ══ */}
      {tab === 'performance' && (
        <div>
          {/* Filter bar */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <select className="inp" value={garcomFiltro} onChange={e => setGarcomFiltro(e.target.value)} style={{ maxWidth:200 }}>
              <option value="Todos os Garçons">Todos os Garçons</option>
              {garcons.map(g => <option key={g}>{g}</option>)}
            </select>
            <input type="month" className="inp" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)} style={{ maxWidth:180 }} />
            <select className="inp" value={loja} onChange={e => setLoja(e.target.value)} style={{ maxWidth:160 }}>
              <option value="Todas as Lojas">Todas Lojas</option>
              {theme.stores.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Tabela performance */}
          <div className="card" style={{ marginBottom:14 }}>
            <div className="card-hd">
              <span className="card-tt">📊 Performance Individual — {new Date(mesFiltro + '-01').toLocaleDateString('pt-BR', { month:'long', year:'numeric' })}</span>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>GARÇOM</th>
                    <th>LOJA</th>
                    <th>MESAS</th>
                    <th>FATURAMENTO</th>
                    <th>TICKET MÉDIO</th>
                    <th>CONVERSÃO</th>
                    <th>T. MÉDIO</th>
                    <th>AVALIAÇÃO</th>
                    <th>ERROS</th>
                    <th>SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {perfData.map((p, i) => (
                    <tr key={p.garcom}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{
                            width:30, height:30, borderRadius:'50%', background:'var(--bordo)',
                            color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
                            fontWeight:700, fontSize:10,
                          }}>{initials(p.garcom)}</div>
                          <strong style={{ fontSize:12 }}>{p.garcom}</strong>
                        </div>
                      </td>
                      <td style={{ color:'var(--muted)', fontSize:11 }}>{p.loja}</td>
                      <td style={{ fontWeight:600 }}>{p.mesas}</td>
                      <td><strong style={{ color:'var(--success)' }}>{fmtBRL(p.fat)}</strong></td>
                      <td>{fmtBRL(p.ticket)}</td>
                      <td style={{ color: p.convRate >= 85 ? 'var(--success)' : 'var(--warning)', fontWeight:600 }}>{p.convRate}%</td>
                      <td>
                        <span style={{
                          background: p.ent <= 13 ? '#ECFDF5' : '#FEF3C7',
                          color: p.ent <= 13 ? 'var(--success)' : 'var(--warning)',
                          padding:'2px 7px', borderRadius:6, fontSize:11, fontWeight:600,
                        }}>{p.ent.toFixed(0)} min</span>
                      </td>
                      <td>
                        <span style={{ display:'flex', gap:1, alignItems:'center' }}>
                          {starsRow(Math.round(p.mediaAval), 12)}
                          <span style={{ fontSize:11, marginLeft:3, fontWeight:600 }}>{p.mediaAval.toFixed(1)}</span>
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: p.erros > 0 ? 'var(--danger)' : 'var(--success)' }}>
                          {p.erros > 0 ? `${(p.erros / Math.max(p.mesas,1) * 100).toFixed(1)}%` : '0%'}
                        </strong>
                      </td>
                      <td>
                        <span style={{
                          background: TIER_BG[i] || TIER_BG[3],
                          color: TIER_COLORS[i] || TIER_COLORS[3],
                          padding:'3px 8px', borderRadius:6, fontWeight:700, fontSize:11,
                        }}>
                          {TIER_LABELS[i] || 'Bronze'} {p.score}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!perfData.length && (
                    <tr><td colSpan={10} style={{ textAlign:'center', color:'var(--muted)', padding:24 }}>Sem dados para este período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ranking + Metas */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {/* Ranking */}
            <div className="card">
              <div className="card-hd"><span className="card-tt">🏆 Ranking Garçons</span></div>
              <div className="card-bd" style={{ padding:'12px 16px' }}>
                {perfData.map((p, i) => {
                  const medals = ['🥇','🥈','🥉']
                  return (
                    <div key={p.garcom} className="rk">
                      <div style={{ fontSize:20, width:24, textAlign:'center' }}>{medals[i] || `${i+1}.`}</div>
                      <div className="rk-av" style={{ background:'var(--bordo)' }}>{initials(p.garcom)}</div>
                      <div className="rk-info">
                        <div className="rk-nm">{p.garcom}
                          <span style={{
                            marginLeft:6, fontSize:10, fontWeight:700,
                            background: TIER_BG[i] || TIER_BG[3],
                            color: TIER_COLORS[i] || TIER_COLORS[3],
                            padding:'1px 6px', borderRadius:10,
                          }}>{TIER_LABELS[i] || 'Bronze'}</span>
                        </div>
                        <div className="rk-rl">{p.loja} · Salão</div>
                      </div>
                      <div className="rk-pts">
                        <div className="rk-pv">{fmtBRL(p.fat)}</div>
                        <div className="rk-pl">faturamento</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Metas x Resultado */}
            <div className="card">
              <div className="card-hd"><span className="card-tt">🎯 Metas x Resultado</span></div>
              <div className="card-bd" style={{ padding:'12px 16px' }}>
                {[
                  { lbl:'Ticket Médio',       real: perfData[0] ? fmtBRL(perfData[0].ticket):'—', meta:'R$200',  pct: Math.min(100, perfData[0] ? (perfData[0].ticket/200)*100 : 0), ok: perfData[0]?.ticket >= 200 },
                  { lbl:'Tempo Atendimento',  real: perfData[0] ? `${perfData[0].ent.toFixed(0)}min`:'—', meta:'15min', pct: Math.min(100, perfData[0] ? ((15 - Math.max(0, perfData[0].ent-15))/15)*100 : 0), ok: (perfData[0]?.ent||99) <= 15 },
                  { lbl:'Taxa de Erro',       real: perfData[0] ? `${(perfData[0].erros/Math.max(perfData[0].mesas,1)*100).toFixed(1)}%`:'0%', meta:'<3%', pct:95, ok:true },
                  { lbl:'Avaliação',          real: perfData[0] ? `${perfData[0].mediaAval.toFixed(1)}`:'—', meta:'4,5', pct: Math.min(100, perfData[0] ? (perfData[0].mediaAval/5)*100 : 0), ok: (perfData[0]?.mediaAval||0) >= 4.5 },
                ].map((m, i) => (
                  <div key={i} style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                      <span style={{ color:'var(--muted)' }}>{m.lbl}</span>
                      <span>
                        <strong style={{ color: m.ok ? 'var(--success)':'var(--danger)' }}>{m.real}</strong>
                        <span style={{ color:'var(--muted)', fontSize:11 }}> · Meta: {m.meta}</span>
                      </span>
                    </div>
                    <div className="prog">
                      <div className="pb" style={{ width:`${m.pct}%`, background: m.ok ? 'var(--success)' : 'var(--warning)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Novo Atendimento ══ */}
      {showAtendModal && (
        <Modal title="Novo Atendimento" open={showAtendModal} onClose={() => setShowAtendModal(false)} size="lg">
          <div className="g2" style={{ marginBottom:10 }}>
            <div className="fg">
              <label className="fl">Mesa *</label>
              <select className="inp" value={atendForm.mesa} onChange={e => setAtendForm(f => ({ ...f, mesa:e.target.value }))}>
                <option value="">Selecione...</option>
                {mesasFiltradas.map(m => <option key={m.id} value={String(m.numero)}>Mesa {m.numero} — {STATUS_LABEL[m.status]}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Garçom *</label>
              <select className="inp" value={atendForm.garcom} onChange={e => setAtendForm(f => ({ ...f, garcom:e.target.value }))}>
                <option value="">Selecione...</option>
                {garcons.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Hora Entrada</label>
              <input className="inp" type="time" value={atendForm.entrada} onChange={e => setAtendForm(f => ({ ...f, entrada:e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Hora Saída</label>
              <input className="inp" type="time" value={atendForm.saida} onChange={e => setAtendForm(f => ({ ...f, saida:e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Nº Pessoas</label>
              <input className="inp" type="number" min={1} max={20} value={atendForm.pax} onChange={e => setAtendForm(f => ({ ...f, pax:Number(e.target.value) }))} />
            </div>
            <div className="fg">
              <label className="fl">Consumo Total (R$)</label>
              <input className="inp" value={atendForm.consumo} onChange={e => setAtendForm(f => ({ ...f, consumo:e.target.value }))} placeholder="0,00" />
            </div>
            <div className="fg">
              <label className="fl">T. Abordagem (min)</label>
              <input className="inp" type="number" step="0.1" value={atendForm.abordagem_min} onChange={e => setAtendForm(f => ({ ...f, abordagem_min:e.target.value }))} placeholder="ex: 1.8" />
            </div>
            <div className="fg">
              <label className="fl">T. Pedido (min)</label>
              <input className="inp" type="number" step="0.1" value={atendForm.pedido_min} onChange={e => setAtendForm(f => ({ ...f, pedido_min:e.target.value }))} placeholder="ex: 3.5" />
            </div>
            <div className="fg">
              <label className="fl">T. Entrega (min)</label>
              <input className="inp" type="number" step="0.1" value={atendForm.entrega_min} onChange={e => setAtendForm(f => ({ ...f, entrega_min:e.target.value }))} placeholder="ex: 11" />
            </div>
            <div className="fg">
              <label className="fl">Status</label>
              <select className="inp" value={atendForm.status} onChange={e => setAtendForm(f => ({ ...f, status:e.target.value as SalaoAtendimento['status'] }))}>
                <option value="em_atendimento">Em Atendimento</option>
                <option value="finalizado">Finalizado</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:10 }}>
            {[
              { lbl:'Apresentação Prato', key:'apresent_prato' },
              { lbl:'Cordialidade',       key:'cordialidade' },
              { lbl:'Postura',            key:'postura' },
            ].map(item => (
              <div className="fg" key={item.key} style={{ margin:0 }}>
                <label className="fl">{item.lbl}</label>
                <div style={{ display:'flex', gap:3, marginTop:4 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button"
                      onClick={() => setAtendForm(f => ({ ...f, [item.key]:n }))}
                      style={{ fontSize:20, background:'none', border:'none', cursor:'pointer', padding:0,
                        color: n <= (atendForm as any)[item.key] ? 'var(--warning)':'var(--border)' }}
                    >★</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="g2">
            <div className="fg">
              <label className="fl">Erros no Pedido</label>
              <input className="inp" type="number" min={0} value={atendForm.erros} onChange={e => setAtendForm(f => ({ ...f, erros:Number(e.target.value) }))} />
            </div>
            <div className="fg">
              <label className="fl">Devoluções</label>
              <input className="inp" type="number" min={0} value={atendForm.devolucoes} onChange={e => setAtendForm(f => ({ ...f, devolucoes:Number(e.target.value) }))} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Observação</label>
            <input className="inp" value={atendForm.obs} onChange={e => setAtendForm(f => ({ ...f, obs:e.target.value }))} placeholder="Ex: aniversário, alergia, pedido especial..." />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <button className="btn bsm bo" onClick={() => setShowAtendModal(false)}>Cancelar</button>
            <button className="btn bp bsm" onClick={saveAtendimento} disabled={!atendForm.mesa || !atendForm.garcom}>
              ✓ Registrar
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL: Registrar Avaliação ══ */}
      {showAvalModal && (
        <Modal title="Registrar Avaliação de Cliente" open={showAvalModal} onClose={() => setShowAvalModal(false)}>
          <div className="g2" style={{ marginBottom:10 }}>
            <div className="fg">
              <label className="fl">Mesa</label>
              <select className="inp" value={avalForm.mesa} onChange={e => setAvalForm(f => ({ ...f, mesa:e.target.value }))}>
                <option value="">Selecione...</option>
                {mesasFiltradas.map(m => <option key={m.id} value={String(m.numero)}>Mesa {m.numero}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Garçom</label>
              <select className="inp" value={avalForm.garcom} onChange={e => setAvalForm(f => ({ ...f, garcom:e.target.value }))}>
                <option value="">Selecione...</option>
                {garcons.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Nota *</label>
              <div style={{ display:'flex', gap:4, marginTop:6 }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button"
                    onClick={() => setAvalForm(f => ({ ...f, nota:n }))}
                    style={{ fontSize:26, background:'none', border:'none', cursor:'pointer', padding:0,
                      color: n <= avalForm.nota ? 'var(--warning)':'var(--border)' }}
                  >★</button>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Canal</label>
              <select className="inp" value={avalForm.canal} onChange={e => setAvalForm(f => ({ ...f, canal:e.target.value }))}>
                {CANAIS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="fg">
            <label className="fl">Comentário do Cliente</label>
            <textarea className="inp txa" rows={3} value={avalForm.comentario} onChange={e => setAvalForm(f => ({ ...f, comentario:e.target.value }))} placeholder="O que o cliente disse..." />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <button className="btn bsm bo" onClick={() => setShowAvalModal(false)}>Cancelar</button>
            <button className="btn bp bsm" onClick={saveAvaliacao}>✓ Registrar</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL: Avaliar Colaborador ══ */}
      {showEquipeModal && (
        <Modal title="Avaliar Colaborador" open={showEquipeModal} onClose={() => setShowEquipeModal(false)}>
          <div className="fg">
            <label className="fl">Colaborador *</label>
            <select className="inp" value={equipeForm.colaborador} onChange={e => setEquipeForm(f => ({ ...f, colaborador:e.target.value }))}>
              <option value="">Selecione...</option>
              {garcons.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:8 }}>
            {[
              { lbl:'Uniforme',    key:'uniforme' },
              { lbl:'Higiene',     key:'higiene' },
              { lbl:'Postura',     key:'postura' },
              { lbl:'Comunicação', key:'comunicacao' },
              { lbl:'Equipe',      key:'equipe' },
            ].map(item => (
              <div className="fg" key={item.key} style={{ margin:0 }}>
                <label className="fl">{item.lbl}</label>
                <div style={{ display:'flex', gap:3, marginTop:4 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button"
                      onClick={() => setEquipeForm(f => ({ ...f, [item.key]:n }))}
                      style={{ fontSize:22, background:'none', border:'none', cursor:'pointer', padding:0,
                        color: n <= (equipeForm as any)[item.key] ? 'var(--warning)':'var(--border)' }}
                    >★</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:20 }}>
            <button className="btn bsm bo" onClick={() => setShowEquipeModal(false)}>Cancelar</button>
            <button className="btn bp bsm" onClick={saveAvalEquipe} disabled={!equipeForm.colaborador}>✓ Salvar Avaliação</button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL: Adicionar Item Checklist ══ */}
      {showAddItem && (
        <Modal title="Adicionar Item ao Checklist" open={showAddItem} onClose={() => setShowAddItem(false)}>
          <div className="fg">
            <label className="fl">Tipo *</label>
            <select className="inp" value={newItemForm.tipo} onChange={e => setNewItemForm(f => ({ ...f, tipo:e.target.value as 'abertura'|'fechamento' }))}>
              <option value="abertura">Abertura</option>
              <option value="fechamento">Fechamento</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Categoria</label>
            <input className="inp" value={newItemForm.categoria} onChange={e => setNewItemForm(f => ({ ...f, categoria:e.target.value }))} placeholder="Ex: SALÃO & MESAS" />
          </div>
          <div className="fg">
            <label className="fl">Item *</label>
            <input className="inp" value={newItemForm.item} onChange={e => setNewItemForm(f => ({ ...f, item:e.target.value }))} placeholder="Descrição do item a verificar" />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16 }}>
            <button className="btn bsm bo" onClick={() => setShowAddItem(false)}>Cancelar</button>
            <button className="btn bp bsm" disabled={!newItemForm.item} onClick={async () => {
              const lojaEf = loja === 'Todas as Lojas' ? (theme.stores[0] || 'Amore Paiva') : loja
              try {
                const saved = await upsertSalaoChecklistItem({
                  loja: lojaEf, data_reg: dataFiltro, tipo: newItemForm.tipo,
                  categoria: newItemForm.categoria || (newItemForm.tipo === 'abertura' ? '🪑 SALÃO & MESAS' : '🧹 LIMPEZA FINAL SALÃO'),
                  item: newItemForm.item, status: 'pendente',
                  colaborador: null, responsavel: null, observacoes: null, criado_por: user?.name || null,
                })
                setCheckRecords(prev => [...prev, saved])
              } catch {
                setCheckRecords(prev => [...prev, {
                  id: String(Date.now()), loja: lojaEf, data_reg: dataFiltro, tipo: newItemForm.tipo,
                  categoria: newItemForm.categoria, item: newItemForm.item, status: 'pendente',
                  colaborador: null, responsavel: null, observacoes: null, criado_por: null, created_at: new Date().toISOString(),
                }])
              }
              setShowAddItem(false)
              setNewItemForm({ tipo: newItemTipo, categoria:'', item:'' })
            }}>
              ✓ Adicionar
            </button>
          </div>
        </Modal>
      )}

    </div>
  )
}
