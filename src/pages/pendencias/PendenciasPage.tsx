import { useState } from 'react'
import { Plus, Edit2, Trash2, Search, ChevronDown, ChevronUp } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import type { Pendencia } from '../../types/database'

const INIT: Pendencia[] = [
  { id: 'p1', title: 'Freezer 2 com defeito', description: 'Temperatura irregular. Risco de perda de estoque.', loja: 'Amore Paiva', priority: 'alta', status: 'em_andamento', responsible: 'Carlos Lima', cost: 850, created_by: 'Admin', updated_by: 'Admin', created_at: '2025-07-22T08:30:00Z', updated_at: '2025-07-22T10:30:00Z' },
  { id: 'p2', title: 'Vazamento na pia', description: 'Risco elétrico. Requer atenção imediata.', loja: 'Amore CD', priority: 'alta', status: 'pendente', responsible: null, cost: null, created_by: 'Admin', updated_by: null, created_at: '2025-07-22T09:00:00Z', updated_at: '2025-07-22T09:00:00Z' },
  { id: 'p3', title: 'Troca de lâmpadas salão', description: '3 lâmpadas queimadas no salão principal.', loja: 'Flow CD', priority: 'baixa', status: 'pendente', responsible: null, cost: 45, created_by: 'Admin', updated_by: null, created_at: '2025-07-20T14:00:00Z', updated_at: '2025-07-20T14:00:00Z' },
]

const OS_ITEMS = [
  { id: 'OS-001', title: 'Reparo Freezer 2 — Amore Paiva', status: 'Em Andamento', abertura: '22/07/2025', previsao: '24/07/2025', valor: 'R$ 850', prestador: 'Freeze Tec', loja: 'Amore Paiva', aprovado: 'Admin', timeline: [{ done: true, dt: '22/07 08:30', txt: 'OS aberta — checklist de abertura' }, { done: true, dt: '22/07 14:00', txt: 'Diagnóstico: compressor com falha. Orçamento aprovado' }, { done: false, dt: '24/07 08:00', txt: 'Aguardando peça e execução' }] },
]

const MANUT = [
  { eq: 'Freezer Principal', loja: 'Amore Paiva', tipo: 'Revisão elétrica', ultima: '15/04/25', proxima: '23/07/25', status: 'Agendado', st: 'bg-y' },
  { eq: 'Fogão Industrial', loja: 'Amore CD', tipo: 'Limpeza bocais', ultima: '01/06/25', proxima: '01/09/25', status: 'Ok', st: 'bg-g' },
  { eq: 'Ar-Cond. Salão', loja: 'Flow CD', tipo: 'Limpeza filtros', ultima: '10/05/25', proxima: '10/08/25', status: 'Ok', st: 'bg-g' },
]

type MainTab = 'pend' | 'os' | 'manut'

const PRIORITY_MAP = { alta: { lbl: 'Alta', cls: 'bg-r' }, media: { lbl: 'Média', cls: 'bg-y' }, baixa: { lbl: 'Baixa', cls: 'bg-gr' } }
const STATUS_MAP = { pendente: { lbl: 'Pendente', cls: 'bg-gr' }, em_andamento: { lbl: 'Em Andamento', cls: 'bg-y' }, concluido: { lbl: 'Concluído', cls: 'bg-g' } }

export default function PendenciasPage() {
  const { can, user } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState<MainTab>('pend')
  const [items, setItems] = useState<Pendencia[]>(INIT)
  const [search, setSearch] = useState('')
  const [filterPrio, setFilterPrio] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [openOS, setOpenOS] = useState<string[]>(['OS-001'])
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<Pendencia | null>(null)
  const [form, setForm] = useState({ title: '', description: '', loja: 'Amore CD', priority: 'media' as Pendencia['priority'], status: 'pendente' as Pendencia['status'], responsible: '', cost: '' })
  const [confirmDel, setConfirmDel] = useState<Pendencia | null>(null)

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    return (!q || i.title.toLowerCase().includes(q) || i.loja.toLowerCase().includes(q))
      && (!filterPrio || i.priority === filterPrio)
      && (!filterStatus || i.status === filterStatus)
  })

  const openNew = () => { setEditItem(null); setForm({ title: '', description: '', loja: 'Amore CD', priority: 'media', status: 'pendente', responsible: '', cost: '' }); setShowForm(true) }
  const openEdit = (p: Pendencia) => { setEditItem(p); setForm({ title: p.title, description: p.description || '', loja: p.loja, priority: p.priority, status: p.status, responsible: p.responsible || '', cost: p.cost?.toString() || '' }); setShowForm(true) }

  const save = () => {
    if (!form.title.trim()) { toast('Preencha o título.', 'error'); return }
    if (editItem) {
      setItems(prev => prev.map(p => p.id === editItem.id ? { ...p, ...form, cost: form.cost ? parseFloat(form.cost) : null, updated_by: user?.name || 'Admin', updated_at: new Date().toISOString() } : p))
      toast('Pendência atualizada!')
    } else {
      setItems(prev => [{ id: 'p' + Date.now(), ...form, cost: form.cost ? parseFloat(form.cost) : null, created_by: user?.name || 'Admin', updated_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...prev])
      toast('Pendência criada!')
    }
    setShowForm(false)
  }

  const del = (p: Pendencia) => { setItems(prev => prev.filter(x => x.id !== p.id)); toast(`"${p.title}" excluída.`, 'error') }

  const toggleOS = (id: string) => setOpenOS(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div>
      <div className="tabs">
        {([['pend', 'Pendências'], ['os', 'Ordens de Serviço'], ['manut', 'Manutenção']] as [MainTab, string][]).map(([id, lbl]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === 'pend' && (
        <div>
          <div className="fb">
            <div className="sw-wrap">
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input className="srch" placeholder="Buscar pendência..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="flt" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos Status</option>
              <option value="pendente">Pendente</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
            </select>
            <select className="flt" value={filterPrio} onChange={e => setFilterPrio(e.target.value)}>
              <option value="">Todas Prioridades</option>
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
            {can('pendencias', 'create') && <button className="btn bp bsm" onClick={openNew}><Plus size={11} />Nova Pendência</button>}
          </div>
          <div className="card">
            <div className="tw">
              <table>
                <thead><tr><th>ID</th><th>Título</th><th>Loja</th><th>Prioridade</th><th>Status</th><th>Responsável</th><th>Custo</th><th>Ações</th></tr></thead>
                <tbody>
                  {filtered.map((p, i) => {
                    const pi = PRIORITY_MAP[p.priority]
                    const si = STATUS_MAP[p.status]
                    return (
                      <tr key={p.id}>
                        <td><span className="badge bg-br">#{String(i + 1).padStart(3, '0')}</span></td>
                        <td><strong>{p.title}</strong>{p.description && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{p.description.slice(0, 60)}{p.description.length > 60 ? '...' : ''}</div>}</td>
                        <td>{p.loja}</td>
                        <td><span className={`badge ${pi.cls}`}>{pi.lbl}</span></td>
                        <td><span className={`badge ${si.cls}`}>{si.lbl}</span></td>
                        <td>{p.responsible || '—'}</td>
                        <td>{p.cost ? `R$ ${p.cost.toFixed(0)}` : '—'}</td>
                        <td><div className="ab">
                          {can('pendencias', 'edit') && <button className="ib" onClick={() => openEdit(p)}><Edit2 size={11} /></button>}
                          {can('pendencias', 'delete') && <button className="ib rd" onClick={() => setConfirmDel(p)}><Trash2 size={11} /></button>}
                        </div></td>
                      </tr>
                    )
                  })}
                  {!filtered.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>Nenhuma pendência encontrada</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'os' && (
        <div>
          {OS_ITEMS.map(os => {
            const open = openOS.includes(os.id)
            return (
              <div key={os.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ padding: '11px 13px', background: 'var(--cream)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => toggleOS(os.id)}>
                  <span className="badge bg-br">{os.id}</span>
                  <span style={{ fontWeight: 600, fontSize: 12.5, flex: 1 }}>{os.title}</span>
                  <span className="badge bg-y" style={{ marginLeft: 'auto' }}>{os.status}</span>
                  {open ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                </div>
                {open && (
                  <div style={{ padding: 13, borderTop: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 11 }}>
                      {[['Abertura', os.abertura], ['Previsão', os.previsao], ['Valor', os.valor], ['Prestador', os.prestador], ['Loja', os.loja], ['Aprovado', os.aprovado]].map(([lbl, v]) => (
                        <div key={lbl}><label style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 1 }}>{lbl}</label><span style={{ fontSize: 12, fontWeight: 500 }}>{v}</span></div>
                      ))}
                    </div>
                    <div className="dv" />
                    <div className="tl">
                      {os.timeline.map((t, i) => (
                        <div key={i} className={`tl-i${t.done ? ' done' : ''}`}>
                          <div className="tl-dt">{t.dt}</div>
                          <div style={{ fontSize: 12 }}>{t.txt}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'manut' && (
        <div className="card">
          <div className="tw">
            <table>
              <thead><tr><th>Equipamento</th><th>Loja</th><th>Tipo</th><th>Última</th><th>Próxima</th><th>Status</th></tr></thead>
              <tbody>
                {MANUT.map((m, i) => (
                  <tr key={i}>
                    <td>{m.eq}</td><td>{m.loja}</td><td>{m.tipo}</td><td>{m.ultima}</td>
                    <td><strong style={{ color: m.st === 'bg-y' ? 'var(--warning)' : 'var(--text)' }}>{m.proxima}</strong></td>
                    <td><span className={`badge ${m.st}`}>{m.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editItem ? 'Editar Pendência' : 'Nova Pendência'}
        footer={<><button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn bp" onClick={save}>Salvar</button></>}>
        <div className="g2">
          <div className="fg" style={{ gridColumn: '1/-1' }}>
            <label className="fl">Título <span className="rq">*</span></label>
            <input className="inp" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="fg" style={{ gridColumn: '1/-1' }}>
            <label className="fl">Descrição</label>
            <textarea className="txa" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl">Loja</label>
            <select className="sel" value={form.loja} onChange={e => setForm(p => ({ ...p, loja: e.target.value }))}>
              {['Amore CD', 'Amore Paiva', 'Flow CD'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Prioridade</label>
            <select className="sel" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value as Pendencia['priority'] }))}>
              <option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Status</label>
            <select className="sel" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as Pendencia['status'] }))}>
              <option value="pendente">Pendente</option><option value="em_andamento">Em Andamento</option><option value="concluido">Concluído</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Responsável</label>
            <input className="inp" value={form.responsible} onChange={e => setForm(p => ({ ...p, responsible: e.target.value }))} />
          </div>
          <div className="fg" style={{ gridColumn: '1/-1' }}>
            <label className="fl">Custo estimado (R$)</label>
            <input className="inp" type="number" value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
          </div>
        </div>
      </Modal>
      <Confirm open={!!confirmDel} message={`Excluir "${confirmDel?.title}"?`} onConfirm={() => confirmDel && del(confirmDel)} onCancel={() => setConfirmDel(null)} />
    </div>
  )
}
