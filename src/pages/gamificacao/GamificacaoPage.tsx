import { useState } from 'react'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import type { Colaborador } from '../../types/database'

const INIT_COLABS: Colaborador[] = [
  { id: 'j1', nome: 'João Ricardo', func: 'Garçom', setor: 'salao', loja: 'Amore Paiva', cor: '#F59E0B', meta_fat: 25000, meta_tick: 45, meta_aval: 4.5, meta_tempo: 15, fat: 28400, tick: 49.2, aval: 4.9, tempo: 14, erros: 1.2, pres: 22, obs: '', created_at: '' },
  { id: 'j2', nome: 'Maria Clara', func: 'Garçonete', setor: 'salao', loja: 'Amore Paiva', cor: '#10B981', meta_fat: 22000, meta_tick: 44, meta_aval: 4.5, meta_tempo: 15, fat: 22000, tick: 46.5, aval: 4.7, tempo: 13, erros: 2.1, pres: 24, obs: '', created_at: '' },
  { id: 'j3', nome: 'Felipe Santos', func: 'Balconista', setor: 'balcao', loja: 'Amore CD', cor: '#CD7C2F', meta_fat: 20000, meta_tick: 42, meta_aval: 4.3, meta_tempo: 12, fat: 18500, tick: 44.2, aval: 4.4, tempo: 9, erros: 1.8, pres: 21, obs: '', created_at: '' },
  { id: 'j4', nome: 'Ana Oliveira', func: 'Cozinheira', setor: 'cozinha', loja: 'Flow CD', cor: '#6366F1', meta_fat: 0, meta_tick: 0, meta_aval: 4.5, meta_tempo: 15, fat: 0, tick: 0, aval: 4.6, tempo: 13, erros: 0, pres: 22, obs: '', created_at: '' },
]

const COLORS = ['#F59E0B', '#10B981', '#CD7C2F', '#6366F1', '#EF4444', '#6B1212', '#3B82F6', '#8B5CF6']

function calcScore(c: Colaborador) {
  const p1 = Math.min(20, c.meta_fat > 0 ? Math.round((c.fat / c.meta_fat) * 20) : 0)
  const p2 = Math.min(20, c.meta_tick > 0 ? Math.round((c.tick / c.meta_tick) * 20) : 0)
  const p3 = Math.min(20, Math.round(((c.aval - 1) / 4) * 20))
  const mt = c.meta_tempo || 15
  const p4 = Math.max(0, c.tempo <= mt ? 20 : c.tempo <= mt + 5 ? Math.round(20 - (c.tempo - mt) * 2) : 0)
  const p5 = Math.min(15, Math.round((c.pres / 26) * 15))
  const p6 = c.erros < 3 ? 0 : c.erros < 6 ? -5 : -15
  const total = Math.max(0, p1 + p2 + p3 + p4 + p5 + p6)
  const nivel = total >= 90 ? { lbl: 'Elite', cls: 'lv-el' } : total >= 75 ? { lbl: 'Ouro', cls: 'lv-ou' } : total >= 60 ? { lbl: 'Prata', cls: 'lv-pr' } : { lbl: 'Bronze', cls: 'lv-br' }
  return { total, nivel }
}

type Tab = 'colabs' | 'ranking' | 'calculadora'

export default function GamificacaoPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('colabs')
  const [colabs, setColabs] = useState(INIT_COLABS)
  const [search, setSearch] = useState('')
  const [filterSetor, setFilterSetor] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editColab, setEditColab] = useState<Colaborador | null>(null)
  const [form, setForm] = useState({ nome: '', func: '', setor: 'salao' as Colaborador['setor'], loja: 'Amore CD', cor: COLORS[0], fat: '', tick: '', aval: '', tempo: '', erros: '', pres: '', meta_fat: '', meta_tick: '', meta_aval: '', meta_tempo: '' })
  const [confirmDel, setConfirmDel] = useState<Colaborador | null>(null)

  const filtered = colabs.filter(c => {
    const q = search.toLowerCase()
    return (!q || c.nome.toLowerCase().includes(q)) && (!filterSetor || c.setor === filterSetor)
  })

  const sorted = [...colabs].sort((a, b) => calcScore(b).total - calcScore(a).total)

  const openNew = () => {
    setEditColab(null)
    setForm({ nome: '', func: '', setor: 'salao', loja: 'Amore CD', cor: COLORS[colabs.length % COLORS.length], fat: '', tick: '', aval: '', tempo: '', erros: '', pres: '', meta_fat: '25000', meta_tick: '45', meta_aval: '4.5', meta_tempo: '15' })
    setShowForm(true)
  }

  const openEdit = (c: Colaborador) => {
    setEditColab(c)
    setForm({ nome: c.nome, func: c.func, setor: c.setor, loja: c.loja, cor: c.cor, fat: String(c.fat), tick: String(c.tick), aval: String(c.aval), tempo: String(c.tempo), erros: String(c.erros), pres: String(c.pres), meta_fat: String(c.meta_fat), meta_tick: String(c.meta_tick), meta_aval: String(c.meta_aval), meta_tempo: String(c.meta_tempo) })
    setShowForm(true)
  }

  const save = () => {
    if (!form.nome.trim()) { toast('Preencha o nome.', 'error'); return }
    const n: Colaborador = { id: editColab?.id || 'c' + Date.now(), nome: form.nome, func: form.func, setor: form.setor, loja: form.loja, cor: form.cor, meta_fat: +form.meta_fat || 0, meta_tick: +form.meta_tick || 0, meta_aval: +form.meta_aval || 0, meta_tempo: +form.meta_tempo || 0, fat: +form.fat || 0, tick: +form.tick || 0, aval: +form.aval || 0, tempo: +form.tempo || 0, erros: +form.erros || 0, pres: +form.pres || 0, obs: '', created_at: '' }
    if (editColab) setColabs(prev => prev.map(c => c.id === editColab.id ? n : c))
    else setColabs(prev => [n, ...prev])
    toast(editColab ? 'Colaborador atualizado!' : `${form.nome} cadastrado!`)
    setShowForm(false)
  }

  const del = (c: Colaborador) => { setColabs(prev => prev.filter(x => x.id !== c.id)); toast(`${c.nome} removido.`, 'error') }

  const setorLabel = { salao: 'Salão', cozinha: 'Cozinha', balcao: 'Balcão' }

  return (
    <div>
      <div className="gam-hd">
        <div style={{ fontSize: 17, fontWeight: 800 }}>Sistema de Gamificação & Performance</div>
        <div style={{ fontSize: 11.5, opacity: .75, marginTop: 3 }}>Score individual automático · Indicadores editáveis · Metas configuráveis</div>
        <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '3px 10px', fontSize: 10.5 }}>{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
          <span style={{ background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '3px 10px', fontSize: 10.5 }}>{colabs.length} colaboradores</span>
        </div>
      </div>

      <div className="tabs">
        {([['colabs', '👥 Colaboradores'], ['ranking', '🏆 Ranking'], ['calculadora', '🧮 Calculadora Score']] as [Tab, string][]).map(([id, lbl]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab === 'colabs' && (
        <div>
          <div className="fb">
            <div className="sw-wrap">
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input className="srch" placeholder="Buscar colaborador..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="flt" value={filterSetor} onChange={e => setFilterSetor(e.target.value)}>
              <option value="">Todos Setores</option>
              <option value="salao">Salão</option>
              <option value="cozinha">Cozinha</option>
              <option value="balcao">Balcão</option>
            </select>
            {can('gamificacao', 'create') && <button className="btn bp bsm" onClick={openNew}><Plus size={11} />Novo Colaborador</button>}
          </div>
          <div className="cc-grid">
            {filtered.map(c => {
              const sc = calcScore(c)
              return (
                <div className="cc" key={c.id}>
                  <div style={{ display: 'flex', gap: 11, marginBottom: 10 }}>
                    <div className="cc-ring" style={{ background: c.cor, width: 44, height: 44, fontSize: 14, marginBottom: 0, flexShrink: 0 }}>
                      {c.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nome}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.func} · {setorLabel[c.setor]}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <span className={`lv ${sc.nivel.cls}`}>{sc.nivel.lbl}</span>
                        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--bordo)' }}>{sc.total} pts</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {can('gamificacao', 'edit') && <button className="ib" onClick={() => openEdit(c)}><Edit2 size={11} /></button>}
                      {can('gamificacao', 'delete') && <button className="ib rd" onClick={() => setConfirmDel(c)}><Trash2 size={11} /></button>}
                    </div>
                  </div>
                  <div className="prog" style={{ marginBottom: 8 }}><div className="pb" style={{ width: `${sc.total}%`, background: c.cor }} /></div>
                  <div className="cc-meta">
                    <div className="cc-m"><span>Faturamento</span><strong>R$ {c.fat.toLocaleString('pt-BR')}</strong></div>
                    <div className="cc-m"><span>Ticket Médio</span><strong>R$ {c.tick.toFixed(2)}</strong></div>
                    <div className="cc-m"><span>Avaliação</span><strong>{c.aval} ⭐</strong></div>
                    <div className="cc-m"><span>Tempo</span><strong>{c.tempo} min</strong></div>
                    <div className="cc-m"><span>Presença</span><strong>{c.pres}/26 dias</strong></div>
                    <div className="cc-m"><span>Loja</span><strong>{c.loja}</strong></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'ranking' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, marginBottom: 14 }}>
            {sorted.slice(0, 3).map((c, i) => {
              const sc = calcScore(c)
              const colors = ['var(--warning)', '#9CA3AF', '#CD7C2F']
              const emojis = ['🥇', '🥈', '🥉']
              return (
                <div className="card" key={c.id} style={{ borderTop: `3px solid ${colors[i]}` }}>
                  <div className="card-bd" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 5 }}>{emojis[i]}</div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{c.nome}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.loja} · {c.func}</div>
                    <span className={`lv ${sc.nivel.cls}`} style={{ margin: '6px auto', display: 'inline-flex' }}>{sc.nivel.lbl}</span>
                    <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--bordo)', margin: '6px 0' }}>{sc.total} pts</div>
                    <div className="prog"><div className="pb" style={{ width: `${sc.total}%`, background: colors[i] }} /></div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="card">
            <div className="card-hd"><span className="card-tt">Ranking Completo</span><span className="badge bg-br">{sorted.length} colaboradores</span></div>
            <div className="card-bd" style={{ padding: '7px 11px' }}>
              {sorted.map((c, i) => {
                const sc = calcScore(c)
                return (
                  <div className="rk" key={c.id}>
                    <span className="rk-n" style={{ color: ['var(--warning)', '#9CA3AF', '#CD7C2F'][i] || 'var(--muted)' }}>{['🥇','🥈','🥉'][i] || i + 1}</span>
                    <div className="rk-av" style={{ background: c.cor }}>{c.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                    <div className="rk-info">
                      <div className="rk-nm">{c.nome} <span className={`lv ${sc.nivel.cls}`}>{sc.nivel.lbl}</span></div>
                      <div className="rk-rl">{c.loja} · {setorLabel[c.setor]}</div>
                    </div>
                    <div className="rk-pts">
                      <div className="rk-pv">{sc.total} pts</div>
                      <div className="rk-pl">score mensal</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'calculadora' && (
        <ScoreCalc />
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editColab ? 'Editar Colaborador' : 'Novo Colaborador'} size="lg"
        footer={<><button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn bp" onClick={save}>Salvar</button></>}>
        <div className="g2">
          <div className="fg" style={{ gridColumn: '1/-1' }}>
            <label className="fl">Nome completo <span className="rq">*</span></label>
            <input className="inp" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} />
          </div>
          <div className="fg"><label className="fl">Função</label><input className="inp" value={form.func} onChange={e => setForm(p => ({ ...p, func: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Setor</label>
            <select className="sel" value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value as Colaborador['setor'] }))}>
              <option value="salao">Salão</option><option value="cozinha">Cozinha</option><option value="balcao">Balcão</option>
            </select>
          </div>
          <div className="fg"><label className="fl">Loja</label>
            <select className="sel" value={form.loja} onChange={e => setForm(p => ({ ...p, loja: e.target.value }))}>
              {['Amore CD', 'Amore Paiva', 'Flow CD'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Cor do avatar</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COLORS.map(c => <button key={c} type="button" onClick={() => setForm(p => ({ ...p, cor: c }))} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: form.cor === c ? '3px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />)}
            </div>
          </div>
        </div>
        <div className="dv" />
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Metas do mês</div>
        <div className="g2">
          <div className="fg"><label className="fl">Meta Faturamento (R$)</label><input className="inp" type="number" value={form.meta_fat} onChange={e => setForm(p => ({ ...p, meta_fat: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Meta Ticket Médio (R$)</label><input className="inp" type="number" value={form.meta_tick} onChange={e => setForm(p => ({ ...p, meta_tick: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Meta Avaliação (⭐)</label><input className="inp" type="number" step="0.1" value={form.meta_aval} onChange={e => setForm(p => ({ ...p, meta_aval: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Meta Tempo (min)</label><input className="inp" type="number" value={form.meta_tempo} onChange={e => setForm(p => ({ ...p, meta_tempo: e.target.value }))} /></div>
        </div>
        <div className="dv" />
        <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Resultados do mês</div>
        <div className="g2">
          <div className="fg"><label className="fl">Faturamento Real (R$)</label><input className="inp" type="number" value={form.fat} onChange={e => setForm(p => ({ ...p, fat: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Ticket Médio Real (R$)</label><input className="inp" type="number" value={form.tick} onChange={e => setForm(p => ({ ...p, tick: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Avaliação (⭐)</label><input className="inp" type="number" step="0.1" value={form.aval} onChange={e => setForm(p => ({ ...p, aval: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Tempo Médio (min)</label><input className="inp" type="number" value={form.tempo} onChange={e => setForm(p => ({ ...p, tempo: e.target.value }))} /></div>
          <div className="fg"><label className="fl">% Erros de Pedido</label><input className="inp" type="number" step="0.1" value={form.erros} onChange={e => setForm(p => ({ ...p, erros: e.target.value }))} /></div>
          <div className="fg"><label className="fl">Presença (dias)</label><input className="inp" type="number" max="26" value={form.pres} onChange={e => setForm(p => ({ ...p, pres: e.target.value }))} /></div>
        </div>
      </Modal>
      <Confirm open={!!confirmDel} message={`Excluir colaborador "${confirmDel?.nome}"?`} onConfirm={() => confirmDel && del(confirmDel)} onCancel={() => setConfirmDel(null)} />
    </div>
  )

}

function ScoreCalc() {
  const [v, setV] = useState({ fat: 28400, fat_m: 25000, tick: 49.2, tick_m: 45, aval: 4.9, tempo: 14, erros: 1.2, pres: 22 })
  const p1 = Math.min(20, v.fat_m > 0 ? Math.round((v.fat / v.fat_m) * 20) : 0)
  const p2 = Math.min(20, v.tick_m > 0 ? Math.round((v.tick / v.tick_m) * 20) : 0)
  const p3 = Math.min(20, Math.round(((v.aval - 1) / 4) * 20))
  const p5 = Math.min(15, Math.round((v.pres / 26) * 15))
  const p6 = v.erros < 3 ? 0 : v.erros < 6 ? -5 : -15
  const total = Math.max(0, p1 + p2 + p3 + 20 + p5 + p6)
  const nivel = total >= 90 ? { lbl: 'Elite', cls: 'lv-el' } : total >= 75 ? { lbl: 'Ouro', cls: 'lv-ou' } : total >= 60 ? { lbl: 'Prata', cls: 'lv-pr' } : { lbl: 'Bronze', cls: 'lv-br' }
  const inp = (label: string, key: keyof typeof v, step = 1) => (
    <div className="fg"><label className="fl">{label}</label><input className="inp" type="number" step={step} value={v[key]} onChange={e => setV(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} /></div>
  )
  return (
    <div className="card">
      <div className="card-hd"><span className="card-tt">Calculadora de Score Automático</span><span className="badge bg-b">Simulação manual</span></div>
      <div className="card-bd">
        <div className="g2" style={{ marginBottom: 13 }}>
          {inp('Faturamento Real (R$)', 'fat')}
          {inp('Meta Faturamento (R$)', 'fat_m')}
          {inp('Ticket Médio Real (R$)', 'tick', 0.01)}
          {inp('Meta Ticket (R$)', 'tick_m')}
          {inp('Avaliação Cliente (1–5 ⭐)', 'aval', 0.1)}
          {inp('Tempo Atendimento (min)', 'tempo')}
          {inp('% Erros de Pedido', 'erros', 0.1)}
          {inp('Presença (dias, máx 26)', 'pres')}
        </div>
        <div style={{ background: 'var(--cream)', borderRadius: 9, padding: 15 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 9, marginBottom: 13 }}>
            {[['Faturamento', p1, 20], ['Ticket', p2, 20], ['Avaliação', p3, 20], ['Presença', p5, 15]].map(([lbl, pts, max]) => (
              <div key={lbl as string} style={{ textAlign: 'center', padding: 9, background: '#fff', borderRadius: 7, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9.5, color: 'var(--muted)', marginBottom: 3 }}>{lbl}</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--bordo)' }}>{pts}</div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>/{max}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Score Final</div>
            <div style={{ fontSize: 44, fontWeight: 900, fontFamily: 'Plus Jakarta Sans', color: 'var(--bordo)' }}>{total}</div>
            <span className={`lv ${nivel.cls}`} style={{ display: 'inline-flex', margin: '4px auto', fontSize: 11 }}>{nivel.lbl}</span>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5 }}>Bronze &lt;60 · Prata 60–74 · Ouro 75–89 · Elite 90+</div>
          </div>
        </div>
      </div>
    </div>
  )
}
