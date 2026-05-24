import { useState, useEffect } from 'react'
import { Plus, Edit2, Trash2, Search, Loader2 } from 'lucide-react'
import { useDebounce } from '../../hooks/useDebounce'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import { fetchColaboradores, insertColaborador, updateColaborador, deleteColaborador } from '../../lib/db'
import type { Colaborador } from '../../types/database'

const COLORS = ['#F59E0B', '#10B981', '#CD7C2F', '#6366F1', '#EF4444', '#6B1212', '#3B82F6', '#8B5CF6']

// ── Configuração de pesos e critérios ────────────────────────

interface GamConfig {
  peso_fat: number    // pontos máx — faturamento
  peso_tick: number   // pontos máx — ticket médio
  peso_aval: number   // pontos máx — avaliação cliente
  peso_tempo: number  // pontos máx — tempo atendimento
  peso_pres: number   // pontos máx — presença
  pen_erros_m: number // penalidade erros moderados
  pen_erros_a: number // penalidade erros graves
  lim_erros_m: number // limiar erros moderados (qtd)
  lim_erros_a: number // limiar erros graves (qtd)
  dias_uteis: number  // dias úteis no mês
  lv_elite: number    // mínimo para Elite
  lv_ouro: number     // mínimo para Ouro
  lv_prata: number    // mínimo para Prata
}

const GAM_CFG_DEFAULT: GamConfig = {
  peso_fat: 20, peso_tick: 20, peso_aval: 20, peso_tempo: 20, peso_pres: 15,
  pen_erros_m: 5, pen_erros_a: 15, lim_erros_m: 3, lim_erros_a: 6,
  dias_uteis: 26, lv_elite: 90, lv_ouro: 75, lv_prata: 60,
}
const GAM_CFG_KEY = 'amore_gam_config_v1'

function loadGamCfg(): GamConfig {
  try {
    const s = localStorage.getItem(GAM_CFG_KEY)
    return s ? { ...GAM_CFG_DEFAULT, ...JSON.parse(s) } : GAM_CFG_DEFAULT
  } catch { return GAM_CFG_DEFAULT }
}

function calcScore(c: Colaborador, cfg: GamConfig = GAM_CFG_DEFAULT) {
  const p1 = Math.min(cfg.peso_fat, c.meta_fat > 0 ? Math.round((c.fat / c.meta_fat) * cfg.peso_fat) : 0)
  const p2 = Math.min(cfg.peso_tick, c.meta_tick > 0 ? Math.round((c.tick / c.meta_tick) * cfg.peso_tick) : 0)
  const p3 = Math.min(cfg.peso_aval, Math.round(((c.aval - 1) / 4) * cfg.peso_aval))
  const mt = c.meta_tempo || 15
  const p4 = Math.max(0, c.tempo <= mt ? cfg.peso_tempo : c.tempo <= mt + 5 ? Math.round(cfg.peso_tempo - (c.tempo - mt) * (cfg.peso_tempo / 10)) : 0)
  const p5 = Math.min(cfg.peso_pres, Math.round((c.pres / cfg.dias_uteis) * cfg.peso_pres))
  const p6 = c.erros < cfg.lim_erros_m ? 0 : c.erros < cfg.lim_erros_a ? -cfg.pen_erros_m : -cfg.pen_erros_a
  const total = Math.max(0, p1 + p2 + p3 + p4 + p5 + p6)
  const nivel = total >= cfg.lv_elite ? { lbl: 'Elite', cls: 'lv-el' } : total >= cfg.lv_ouro ? { lbl: 'Ouro', cls: 'lv-ou' } : total >= cfg.lv_prata ? { lbl: 'Prata', cls: 'lv-pr' } : { lbl: 'Bronze', cls: 'lv-br' }
  return { total, nivel }
}

type Tab = 'colabs' | 'ranking' | 'recompensas' | 'calculadora' | 'configurar'

interface Badge { id: string; emoji: string; label: string; desc: string; color: string }

function calcBadges(c: Colaborador, rank: number, cfg: GamConfig = GAM_CFG_DEFAULT): Badge[] {
  const badges: Badge[] = []
  const sc = calcScore(c, cfg)
  if (sc.total >= 90) badges.push({ id: 'elite', emoji: '🏆', label: 'Elite Performance', desc: `Score ${sc.total}/100`, color: '#D97706' })
  if (sc.total >= 75) badges.push({ id: 'ouro', emoji: '🥇', label: 'Nível Ouro', desc: 'Score ≥ 75 pts', color: '#F59E0B' })
  if (c.meta_fat > 0 && c.fat >= c.meta_fat) badges.push({ id: 'fat', emoji: '💰', label: 'Meta Faturamento', desc: `R$ ${c.fat.toLocaleString('pt-BR')}`, color: '#10B981' })
  if (c.meta_tick > 0 && c.tick >= c.meta_tick) badges.push({ id: 'tick', emoji: '🎯', label: 'Meta Ticket', desc: `R$ ${c.tick.toFixed(2)}`, color: '#6366F1' })
  if (c.aval >= 4.8) badges.push({ id: 'aval', emoji: '⭐', label: 'Avaliação Máxima', desc: `${c.aval} estrelas`, color: '#F59E0B' })
  if (c.pres >= 26) badges.push({ id: 'pres', emoji: '📅', label: 'Presença Total', desc: '26/26 dias', color: '#3B82F6' })
  if (c.erros === 0) badges.push({ id: 'erros', emoji: '✅', label: 'Zero Erros', desc: 'Perfeição no mês', color: '#10B981' })
  if (rank === 0) badges.push({ id: 'campeao', emoji: '👑', label: 'Campeão do Mês', desc: '1º lugar no ranking', color: '#7C3AED' })
  return badges
}

export default function GamificacaoPage() {
  const { can } = useAuth()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('colabs')
  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [loadingColabs, setLoadingColabs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gamCfg, setGamCfg] = useState<GamConfig>(loadGamCfg)
  const [search, setSearch] = useState('')
  const searchDebounced = useDebounce(search, 280)
  const [filterSetor, setFilterSetor] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editColab, setEditColab] = useState<Colaborador | null>(null)
  const [form, setForm] = useState({ nome: '', func: '', setor: 'salao' as Colaborador['setor'], loja: 'Amore CD', cor: COLORS[0], fat: '', tick: '', aval: '', tempo: '', erros: '', pres: '', meta_fat: '', meta_tick: '', meta_aval: '', meta_tempo: '' })
  const [confirmDel, setConfirmDel] = useState<Colaborador | null>(null)
  const [rankingMode, setRankingMode] = useState<'individual' | 'setor'>('individual')

  useEffect(() => {
    fetchColaboradores()
      .then(setColabs)
      .catch(() => toast('Erro ao carregar colaboradores.', 'error'))
      .finally(() => setLoadingColabs(false))
  }, [])

  const filtered = colabs.filter(c => {
    const q = searchDebounced.toLowerCase()
    return (!q || c.nome.toLowerCase().includes(q)) && (!filterSetor || c.setor === filterSetor)
  })

  const sorted = [...colabs].sort((a, b) => calcScore(b, gamCfg).total - calcScore(a, gamCfg).total)

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

  const save = async () => {
    if (!form.nome.trim()) { toast('Preencha o nome.', 'error'); return }
    setSaving(true)
    const payload = { nome: form.nome, func: form.func, setor: form.setor, loja: form.loja, cor: form.cor, meta_fat: +form.meta_fat || 0, meta_tick: +form.meta_tick || 0, meta_aval: +form.meta_aval || 0, meta_tempo: +form.meta_tempo || 0, fat: +form.fat || 0, tick: +form.tick || 0, aval: +form.aval || 0, tempo: +form.tempo || 0, erros: +form.erros || 0, pres: +form.pres || 0, obs: '', periodo_ref: null, recompensas: null }
    try {
      if (editColab) {
        const updated = await updateColaborador(editColab.id, payload)
        setColabs(prev => prev.map(c => c.id === editColab.id ? updated : c))
        toast('Colaborador atualizado!')
      } else {
        const created = await insertColaborador(payload)
        setColabs(prev => [created, ...prev])
        toast(`${form.nome} cadastrado!`)
      }
      setShowForm(false)
    } catch {
      toast('Erro ao salvar. Tente novamente.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const del = async (c: Colaborador) => {
    try {
      await deleteColaborador(c.id)
      setColabs(prev => prev.filter(x => x.id !== c.id))
      toast(`${c.nome} removido.`, 'error')
    } catch {
      toast('Erro ao excluir.', 'error')
    }
  }

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
        {([['colabs', '👥 Colaboradores'], ['ranking', '🏆 Ranking'], ['recompensas', '🎁 Recompensas'], ['calculadora', '🧮 Calculadora'], ['configurar', '⚙️ Configurar']] as [Tab, string][]).map(([id, lbl]) => (
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
          {loadingColabs && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 size={22} className="spin" /></div>}
          <div className="cc-grid">
            {filtered.map(c => {
              const sc = calcScore(c, gamCfg)
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
          {/* Toggle Individual / Por Setor */}
          <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
            <button
              className={`btn bsm${rankingMode === 'individual' ? ' bp' : ' bo'}`}
              onClick={() => setRankingMode('individual')}
            >👤 Individual</button>
            <button
              className={`btn bsm${rankingMode === 'setor' ? ' bp' : ' bo'}`}
              onClick={() => setRankingMode('setor')}
            >🏢 Por Setor</button>
          </div>

          {rankingMode === 'individual' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 11, marginBottom: 14 }}>
                {sorted.slice(0, 3).map((c, i) => {
                  const sc = calcScore(c, gamCfg)
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
                    const sc = calcScore(c, gamCfg)
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
            </>
          )}

          {rankingMode === 'setor' && (() => {
            const setorNames: Record<string, string> = { salao: '🍽️ Salão', cozinha: '👨‍🍳 Cozinha', balcao: '☕ Balcão' }
            const setorKeys = ['salao', 'cozinha', 'balcao'] as Colaborador['setor'][]
            const grouped: Record<string, Colaborador[]> = { salao: [], cozinha: [], balcao: [] }
            sorted.forEach(c => { if (grouped[c.setor]) grouped[c.setor].push(c) })
            const setorAvg = (members: Colaborador[]) =>
              members.length === 0 ? 0 : Math.round(members.reduce((sum, c) => sum + calcScore(c, gamCfg).total, 0) / members.length)
            const maxAvg = Math.max(...setorKeys.map(s => setorAvg(grouped[s])), 1)
            return (
              <>
                {setorKeys.filter(s => grouped[s].length > 0).map(s => {
                  const members = grouped[s]
                  const avg = setorAvg(members)
                  return (
                    <div className="card" key={s} style={{ marginBottom: 12 }}>
                      <div className="card-hd">
                        <span className="card-tt">{setorNames[s]}</span>
                        <span className="badge bg-br">{members.length} membros · média {avg} pts</span>
                      </div>
                      <div className="card-bd" style={{ padding: '7px 11px' }}>
                        {members.map((c, i) => {
                          const sc = calcScore(c, gamCfg)
                          return (
                            <div className="rk" key={c.id}>
                              <span className="rk-n" style={{ color: ['var(--warning)', '#9CA3AF', '#CD7C2F'][i] || 'var(--muted)' }}>{['🥇','🥈','🥉'][i] || i + 1}</span>
                              <div className="rk-av" style={{ background: c.cor }}>{c.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                              <div className="rk-info">
                                <div className="rk-nm">{c.nome} <span className={`lv ${sc.nivel.cls}`}>{sc.nivel.lbl}</span></div>
                                <div className="rk-rl">{c.func} · {c.loja}</div>
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
                  )
                })}

                {/* Resumo comparativo por setor */}
                <div className="card">
                  <div className="card-hd"><span className="card-tt">Resumo por Setor</span><span className="badge bg-br">Média comparativa</span></div>
                  <div className="card-bd" style={{ padding: '11px 14px' }}>
                    {setorKeys.filter(s => grouped[s].length > 0).map(s => {
                      const avg = setorAvg(grouped[s])
                      const pct = Math.round((avg / maxAvg) * 100)
                      return (
                        <div className="bc-row" key={s} style={{ marginBottom: 10 }}>
                          <div className="bc-lbl" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{setorNames[s]} <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 400 }}>({grouped[s].length} membros)</span></div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="bc-out" style={{ flex: 1 }}>
                              <div className="bc-in" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="bc-val" style={{ fontSize: 12, fontWeight: 700, color: 'var(--bordo)', minWidth: 48 }}>{avg} pts</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}

      {tab === 'recompensas' && (
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-hd">
              <span className="card-tt">🎁 Recompensas & Conquistas</span>
              <span className="badge bg-b">{sorted.length} colaboradores</span>
            </div>
            <div className="card-bd" style={{ padding: '11px 14px', fontSize: 11, color: 'var(--muted)' }}>
              Badges são calculados automaticamente com base nos indicadores do mês atual.
              Um colaborador pode conquistar múltiplos badges ao mesmo tempo.
            </div>
          </div>

          {/* Resumo de badges totais */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { emoji: '🏆', label: 'Elite', count: sorted.filter(c => calcScore(c, gamCfg).total >= gamCfg.lv_elite).length, color: '#D97706' },
              { emoji: '💰', label: 'Meta Fat.', count: sorted.filter(c => c.meta_fat > 0 && c.fat >= c.meta_fat).length, color: '#10B981' },
              { emoji: '⭐', label: 'Aval. Máx', count: sorted.filter(c => c.aval >= 4.8).length, color: '#F59E0B' },
              { emoji: '✅', label: 'Zero Erros', count: sorted.filter(c => c.erros === 0).length, color: '#6366F1' },
            ].map(item => (
              <div key={item.label} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{item.emoji}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: item.color }}>{item.count}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Cards de colaboradores com badges */}
          <div className="cc-grid">
            {sorted.map((c, rank) => {
              const badges = calcBadges(c, rank, gamCfg)
              const sc = calcScore(c, gamCfg)
              return (
                <div className="cc" key={c.id}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                    <div className="cc-ring" style={{ background: c.cor, width: 40, height: 40, fontSize: 13, flexShrink: 0 }}>
                      {c.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nome}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.func} · {c.loja}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <span className={`lv ${sc.nivel.cls}`}>{sc.nivel.lbl}</span>
                        <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--bordo)' }}>{sc.total} pts</span>
                      </div>
                    </div>
                  </div>
                  {badges.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
                      Sem conquistas este mês
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {badges.map(b => (
                        <div key={b.id} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          background: b.color + '18', border: `1px solid ${b.color}40`,
                          borderRadius: 20, padding: '4px 8px', fontSize: 10.5,
                        }}>
                          <span style={{ fontSize: 13 }}>{b.emoji}</span>
                          <div>
                            <div style={{ fontWeight: 700, color: b.color, lineHeight: 1.1 }}>{b.label}</div>
                            <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{b.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'calculadora' && (
        <ScoreCalc />
      )}

      {tab === 'configurar' && (
        <ConfigurarGamificacao
          cfg={gamCfg}
          onChange={newCfg => {
            setGamCfg(newCfg)
            localStorage.setItem(GAM_CFG_KEY, JSON.stringify(newCfg))
          }}
        />
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editColab ? 'Editar Colaborador' : 'Novo Colaborador'} size="lg"
        footer={<><button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button><button className="btn bp" onClick={save} disabled={saving}>{saving && <Loader2 size={12} className="spin" />}Salvar</button></>}>
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

// ── Painel de Configuração ───────────────────────────────────

function ConfigurarGamificacao({ cfg, onChange }: { cfg: GamConfig; onChange: (c: GamConfig) => void }) {
  const { toast } = useToast()
  const [form, setForm] = useState<GamConfig>({ ...cfg })

  const set = (k: keyof GamConfig, v: number) => setForm(f => ({ ...f, [k]: v }))
  const n = (v: string) => parseFloat(v) || 0

  const somaPos = form.peso_fat + form.peso_tick + form.peso_aval + form.peso_tempo + form.peso_pres
  const totalOk = somaPos === 100

  const salvar = () => {
    if (!totalOk) { toast('A soma dos pesos de pontuação deve ser 100 pts', 'error'); return }
    if (form.lv_prata >= form.lv_ouro || form.lv_ouro >= form.lv_elite) {
      toast('Limiares de nível devem ser: Prata < Ouro < Elite', 'error'); return
    }
    onChange(form)
    toast('Configuração salva com sucesso!')
  }

  const resetar = () => {
    setForm({ ...GAM_CFG_DEFAULT })
    onChange(GAM_CFG_DEFAULT)
    localStorage.removeItem(GAM_CFG_KEY)
    toast('Configuração restaurada para o padrão!')
  }

  const Row = ({ label, k, step = 1, min = 0, max = 100 }: { label: string; k: keyof GamConfig; step?: number; min?: number; max?: number }) => (
    <div className="fg">
      <label className="fl" style={{ fontSize: 11 }}>{label}</label>
      <input className="inp" type="number" step={step} min={min} max={max}
        value={form[k]}
        onChange={e => set(k, n(e.target.value))} />
    </div>
  )

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>⚙️ Configuração da Gamificação</h3>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          Ajuste os pesos de pontuação, critérios de penalidade e limiares de nível sem necessidade de programação.
        </p>
      </div>

      {/* Alerta de soma */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 9, marginBottom: 16,
        background: totalOk ? '#D1FAE5' : '#FEF3C7',
        color: totalOk ? '#065F46' : '#92400E',
        fontSize: 12, fontWeight: 700,
      }}>
        <span style={{ fontSize: 16 }}>{totalOk ? '✅' : '⚠️'}</span>
        Soma dos pesos de pontuação: <strong>{somaPos} / 100 pts</strong>
        {!totalOk && <span style={{ fontWeight: 400, marginLeft: 4 }}>— ajuste para totalizar 100</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Pesos positivos */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: 'var(--bordo-bg)', color: 'var(--bordo)', borderRadius: 6, padding: '3px 8px', fontSize: 10 }}>PONTUAÇÃO</span>
            Pesos de critérios positivos
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Row label="Faturamento (pts)" k="peso_fat" />
            <Row label="Ticket Médio (pts)" k="peso_tick" />
            <Row label="Avaliação Cliente (pts)" k="peso_aval" />
            <Row label="Tempo Atendimento (pts)" k="peso_tempo" />
            <Row label="Presença (pts)" k="peso_pres" />
            <div className="fg" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <div style={{ fontSize: 11, color: somaPos === 100 ? 'var(--success)' : 'var(--warning)', fontWeight: 700 }}>
                Total: {somaPos} / 100
              </div>
            </div>
          </div>
        </div>

        {/* Penalidades */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#FEE2E2', color: 'var(--danger)', borderRadius: 6, padding: '3px 8px', fontSize: 10 }}>PENALIDADE</span>
            Controle de erros
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Row label="Limiar erros moderado (qtd)" k="lim_erros_m" min={1} />
            <Row label="Limiar erros grave (qtd)" k="lim_erros_a" min={1} />
            <Row label="Penalidade moderada (pts)" k="pen_erros_m" min={0} max={50} />
            <Row label="Penalidade grave (pts)" k="pen_erros_a" min={0} max={50} />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', background: 'var(--bg)', padding: '8px 10px', borderRadius: 7 }}>
            &lt; {form.lim_erros_m} erros: sem penalidade<br/>
            {form.lim_erros_m}–{form.lim_erros_a - 1} erros: −{form.pen_erros_m} pts<br/>
            ≥ {form.lim_erros_a} erros: −{form.pen_erros_a} pts
          </div>
        </div>

        {/* Dias úteis */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#EDE9FE', color: '#7C3AED', borderRadius: 6, padding: '3px 8px', fontSize: 10 }}>CALENDÁRIO</span>
            Referência do mês
          </div>
          <Row label="Dias úteis no mês (padrão 26)" k="dias_uteis" min={20} max={31} />
        </div>

        {/* Limiares de nível */}
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 6, padding: '3px 8px', fontSize: 10 }}>NÍVEIS</span>
            Limiares de nível
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div className="fg">
              <label className="fl" style={{ fontSize: 11, color: '#9CA3AF' }}>🥉 Prata ≥</label>
              <input className="inp" type="number" min={0} max={99} value={form.lv_prata} onChange={e => set('lv_prata', n(e.target.value))} />
            </div>
            <div className="fg">
              <label className="fl" style={{ fontSize: 11, color: '#F59E0B' }}>🥇 Ouro ≥</label>
              <input className="inp" type="number" min={0} max={99} value={form.lv_ouro} onChange={e => set('lv_ouro', n(e.target.value))} />
            </div>
            <div className="fg">
              <label className="fl" style={{ fontSize: 11, color: '#D97706' }}>🏆 Elite ≥</label>
              <input className="inp" type="number" min={0} max={100} value={form.lv_elite} onChange={e => set('lv_elite', n(e.target.value))} />
            </div>
          </div>
        </div>
      </div>

      {/* Ações */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <button className="btn bo" onClick={resetar} style={{ fontSize: 12 }}>
          ↺ Restaurar padrão
        </button>
        <button className="btn bp" onClick={salvar} style={{ fontSize: 12 }}>
          ✓ Salvar configuração
        </button>
      </div>
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
