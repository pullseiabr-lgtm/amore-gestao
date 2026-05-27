import { useState, useEffect, useMemo } from 'react'
import {
  Bell, Activity, Settings2, RefreshCw, AlertTriangle,
  Package, ClipboardList, CheckCircle2, X, Save,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchEnxovalItens,
  fetchAtaAcoesAtrasadas,
  fetchTarefasAtrasadas,
  fetchActivityLog,
  fetchAlertasConfig,
  upsertAlertasConfig,
} from '../../lib/db'
import type { EnxovalItem, AtaAcao, ActivityLog } from '../../types/database'

/* ── tipos ────────────────────────────────────────────────── */
type AlertSev = 'critico' | 'atencao' | 'info'
interface Alerta {
  id: string
  severidade: AlertSev
  modulo: string
  moduloId: string
  titulo: string
  descricao: string
  extra?: string
}

/* ── configurações padrão ────────────────────────────────── */
const DEFAULT_CONFIGS: { tipo: string; label: string; descricao: string; hasThreshold?: boolean }[] = [
  { tipo: 'enxoval_zerado',    label: 'Enxoval — Itens Zerados',    descricao: 'Alertar quando estoque chegar a 0' },
  { tipo: 'enxoval_critico',   label: 'Enxoval — Estoque Crítico',  descricao: 'Alertar quando estoque ≤ mínimo cadastrado' },
  { tipo: 'ata_acao_atrasada', label: 'Atas — Ações Atrasadas',     descricao: 'Alertar quando prazo de ação passou sem conclusão' },
  { tipo: 'tarefa_atrasada',   label: 'Tarefas — Tarefas Atrasadas', descricao: 'Alertar quando prazo de tarefa passou' },
  { tipo: 'preco_variacao',    label: 'Lista Padronizada — Preço',  descricao: 'Alertar quando preço superar o histórico em X%', hasThreshold: true },
]

const SEV_COLORS: Record<AlertSev, string> = { critico: '#ef4444', atencao: '#f59e0b', info: '#3b82f6' }
const SEV_LABELS: Record<AlertSev, string>  = { critico: '🔴 Crítico', atencao: '🟡 Atenção', info: '🔵 Informação' }

const MOD_COLORS: Record<string, string> = {
  'Enxoval': '#6366f1', 'Atas': '#8b5cf6', 'Tarefas': '#ec4899', 'Lista Padronizada': '#f59e0b',
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/* ══════════════════════════════════════════════════════════ */
export default function AlertasPage() {
  const { can } = useAuth()
  const { loja }       = useLoja()

  const [tab, setTab] = useState<'alertas' | 'atividades' | 'configurar'>('alertas')

  const [enxovalItens, setEnxovalItens] = useState<EnxovalItem[]>([])
  const [ataAcoes,     setAtaAcoes]     = useState<(AtaAcao & { ata_titulo?: string })[]>([])
  const [tarefasAtrasadas, setTarefasAtrasadas] = useState<{ titulo: string; responsavel_nome?: string | null; prazo?: string | null }[]>([])
  const [auditLog,     setAuditLog]     = useState<ActivityLog[]>([])
  const [configForm,   setConfigForm]   = useState<Record<string, { ativo: boolean; threshold: number }>>({})
  const [loading,      setLoading]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)

  // filters for activity log
  const [logSearch,  setLogSearch]  = useState('')
  const [logModulo,  setLogModulo]  = useState('')

  const load = async () => {
    if (!loja) return
    setLoading(true)
    const [itens, acoes, tarefas, log, cfgs] = await Promise.all([
      fetchEnxovalItens(loja),
      fetchAtaAcoesAtrasadas(loja),
      fetchTarefasAtrasadas(loja),
      fetchActivityLog(loja, 300),
      fetchAlertasConfig(loja),
    ])
    setEnxovalItens(itens)
    setAtaAcoes(acoes)
    setTarefasAtrasadas(tarefas)
    setAuditLog(log)

    // Init config form with existing or defaults
    const form: Record<string, { ativo: boolean; threshold: number }> = {}
    DEFAULT_CONFIGS.forEach(d => {
      const ex = cfgs.find(c => c.tipo === d.tipo)
      form[d.tipo] = {
        ativo:     ex?.ativo     ?? true,
        threshold: ex?.threshold ?? (d.tipo === 'preco_variacao' ? 10 : 0),
      }
    })
    setConfigForm(form)
    setLoading(false)
  }
  useEffect(() => { load() }, [loja])

  /* ── computed alerts ── */
  const alertas = useMemo((): Alerta[] => {
    const result: Alerta[] = []
    const cfg = (tipo: string) => configForm[tipo]?.ativo ?? true

    // Enxoval zerado
    if (cfg('enxoval_zerado')) {
      enxovalItens.filter(i => i.ativo && i.estoque_atual === 0).forEach(i =>
        result.push({
          id: `enx-zero-${i.id}`,
          severidade: 'critico',
          modulo: 'Enxoval',
          moduloId: 'enxoval',
          titulo: `Estoque zerado: ${i.nome}`,
          descricao: `${i.categoria} · ${i.unidade} · Mínimo: ${i.estoque_minimo}`,
          extra: 'Estoque: 0',
        })
      )
    }

    // Enxoval crítico (estoque > 0 mas <= mínimo)
    if (cfg('enxoval_critico')) {
      enxovalItens
        .filter(i => i.ativo && i.estoque_atual > 0 && i.estoque_minimo > 0 && i.estoque_atual <= i.estoque_minimo)
        .forEach(i =>
          result.push({
            id: `enx-crit-${i.id}`,
            severidade: 'atencao',
            modulo: 'Enxoval',
            moduloId: 'enxoval',
            titulo: `Estoque crítico: ${i.nome}`,
            descricao: `${i.categoria} · ${i.unidade}`,
            extra: `Atual: ${i.estoque_atual} / Mínimo: ${i.estoque_minimo}`,
          })
        )
    }

    // Ata ações atrasadas
    if (cfg('ata_acao_atrasada')) {
      ataAcoes.forEach(a =>
        result.push({
          id: `ata-${a.id}`,
          severidade: 'atencao',
          modulo: 'Atas',
          moduloId: 'atas',
          titulo: `Ação atrasada: ${a.descricao}`,
          descricao: `Responsável: ${a.responsavel}${a.ata_titulo ? ` · Ata: ${a.ata_titulo}` : ''}`,
          extra: a.prazo ? `Prazo: ${new Date(a.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}` : undefined,
        })
      )
    }

    // Tarefas atrasadas
    if (cfg('tarefa_atrasada')) {
      tarefasAtrasadas.forEach((t, idx) =>
        result.push({
          id: `tar-${idx}`,
          severidade: 'atencao',
          modulo: 'Tarefas',
          moduloId: 'tarefas',
          titulo: `Tarefa atrasada: ${t.titulo}`,
          descricao: t.responsavel_nome ? `Responsável: ${t.responsavel_nome}` : 'Sem responsável atribuído',
          extra: t.prazo ? `Prazo: ${new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}` : undefined,
        })
      )
    }

    return result.sort((a, b) => {
      const order: Record<AlertSev, number> = { critico: 0, atencao: 1, info: 2 }
      return order[a.severidade] - order[b.severidade]
    })
  }, [enxovalItens, ataAcoes, tarefasAtrasadas, configForm])

  const criticCount  = alertas.filter(a => a.severidade === 'critico').length
  const atencaoCount = alertas.filter(a => a.severidade === 'atencao').length

  /* ── navigate to module ── */
  const navigate = (pageId: string) => {
    document.dispatchEvent(new CustomEvent('amore-nav', { detail: pageId }))
  }

  /* ── save configs ── */
  const saveConfigs = async () => {
    if (!loja) return
    setSaving(true)
    try {
      await Promise.all(
        Object.entries(configForm).map(([tipo, data]) => upsertAlertasConfig(loja, tipo, data))
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      await load()
    } finally { setSaving(false) }
  }

  /* ── filtered log ── */
  const filteredLog = useMemo(() => auditLog.filter(l => {
    if (logSearch && !l.descricao.toLowerCase().includes(logSearch.toLowerCase()) && !l.usuario?.toLowerCase().includes(logSearch.toLowerCase())) return false
    if (logModulo && l.modulo !== logModulo) return false
    return true
  }), [auditLog, logSearch, logModulo])

  const modulosList = [...new Set(auditLog.map(l => l.modulo))].sort()

  /* ══════════ RENDER ══════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── KPI strip ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px,1fr))', gap: 10 }}>
        {[
          { label: 'Alertas Críticos',  value: criticCount,           color: '#ef4444', icon: <AlertTriangle size={18} />, onClick: () => setTab('alertas') },
          { label: 'Atenções',           value: atencaoCount,          color: '#f59e0b', icon: <Bell size={18} />,          onClick: () => setTab('alertas') },
          { label: 'Estoque Zerado',     value: enxovalItens.filter(i => i.ativo && i.estoque_atual === 0).length, color: '#ef4444', icon: <Package size={18} />, onClick: () => navigate('enxoval') },
          { label: 'Ações Atrasadas',    value: ataAcoes.length,       color: '#f59e0b', icon: <ClipboardList size={18} />, onClick: () => navigate('atas') },
          { label: 'Tarefas Atrasadas',  value: tarefasAtrasadas.length, color: '#f59e0b', icon: <CheckCircle2 size={18} />, onClick: () => navigate('tarefas') },
          { label: 'Log de Atividades',  value: auditLog.length,       color: '#6366f1', icon: <Activity size={18} />,     onClick: () => setTab('atividades') },
        ].map(k => (
          <div key={k.label} onClick={k.onClick}
            style={{ background: 'var(--card-bg)', borderRadius: 10, padding: '12px 16px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color .15s' }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = k.color}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'}>
            <div style={{ color: k.color, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['alertas', 'atividades', 'configurar'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: tab === t ? 'var(--primary)' : 'var(--card-bg)', color: tab === t ? '#fff' : 'var(--text-secondary)',
              position: 'relative' }}>
            {t === 'alertas' ? '🔔 Alertas' : t === 'atividades' ? '📜 Atividades' : '⚙️ Configurar'}
            {t === 'alertas' && alertas.length > 0 && (
              <span style={{ marginLeft: 6, background: criticCount > 0 ? '#ef4444' : '#f59e0b', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                {alertas.length}
              </span>
            )}
          </button>
        ))}
        <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>Carregando...</div>}

      {/* ══ Tab: Alertas ══ */}
      {!loading && tab === 'alertas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {alertas.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)', background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <CheckCircle2 size={44} style={{ marginBottom: 14, color: '#10b981', opacity: 0.8 }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: '#10b981', margin: 0 }}>Tudo certo! Nenhum alerta ativo</p>
              <p style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>Todos os módulos monitorados estão operando dentro do esperado</p>
            </div>
          ) : (
            (['critico', 'atencao', 'info'] as AlertSev[]).map(sev => {
              const items = alertas.filter(a => a.severidade === sev)
              if (items.length === 0) return null
              const color = SEV_COLORS[sev]
              return (
                <div key={sev}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color, letterSpacing: 0.3 }}>{SEV_LABELS[sev]}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>· {items.length} ocorrência{items.length > 1 ? 's' : ''}</span>
                    <div style={{ flex: 1, height: 1, background: color + '30', marginLeft: 4 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(a => {
                      const modColor = MOD_COLORS[a.modulo] || '#6b7280'
                      return (
                        <div key={a.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 10, background: color + '0c', border: `1px solid ${color}30` }}>
                          <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>{a.titulo}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, color: modColor }}>{a.modulo}</span>
                              <span>{a.descricao}</span>
                            </div>
                            {a.extra && <div style={{ fontSize: 11, color, marginTop: 3, fontWeight: 700 }}>{a.extra}</div>}
                          </div>
                          <button onClick={() => navigate(a.moduloId)}
                            style={{ padding: '5px 14px', borderRadius: 7, border: `1px solid ${color}60`, background: 'transparent', color, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            Ver módulo →
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ══ Tab: Atividades ══ */}
      {!loading && tab === 'atividades' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <Activity size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input value={logSearch} onChange={e => setLogSearch(e.target.value)} placeholder="Buscar usuário ou descrição..."
                style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <select value={logModulo} onChange={e => setLogModulo(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-secondary)', fontSize: 13 }}>
              <option value="">Todos os módulos</option>
              {modulosList.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(logSearch || logModulo) && (
              <button onClick={() => { setLogSearch(''); setLogModulo('') }}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <X size={12} /> Limpar
              </button>
            )}
          </div>

          <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {filteredLog.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
                <Activity size={36} style={{ marginBottom: 12, opacity: 0.35 }} />
                <p style={{ fontWeight: 600 }}>
                  {auditLog.length === 0 ? 'Nenhuma atividade registrada ainda' : 'Nenhum resultado para o filtro'}
                </p>
                {auditLog.length === 0 && (
                  <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    O log é alimentado automaticamente à medida que os usuários utilizam o sistema
                  </p>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Data/Hora', 'Usuário', 'Módulo', 'Ação', 'Descrição'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', fontSize: 11, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLog.map(l => {
                      const modColor = MOD_COLORS[l.modulo] || '#6b7280'
                      return (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{l.usuario || '—'}</td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 5, background: modColor + '18', color: modColor, fontWeight: 700, fontSize: 11 }}>{l.modulo}</span>
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 5, background: 'var(--border)', color: 'var(--text-secondary)', fontSize: 11 }}>{l.acao}</span>
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.descricao}>{l.descricao}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {filteredLog.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
              {filteredLog.length} de {auditLog.length} atividades
            </div>
          )}
        </div>
      )}

      {/* ══ Tab: Configurar ══ */}
      {!loading && tab === 'configurar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Settings2 size={18} color="var(--primary)" />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Configurações de Alertas</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Ative ou desative alertas e ajuste os limites por módulo</div>
              </div>
            </div>

            {DEFAULT_CONFIGS.map((d, idx) => {
              const f = configForm[d.tipo] || { ativo: true, threshold: d.tipo === 'preco_variacao' ? 10 : 0 }
              const canEdit = can('alertas', 'edit')
              return (
                <div key={d.tipo} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: idx < DEFAULT_CONFIGS.length - 1 ? '1px solid var(--border)' : 'none', opacity: f.ativo ? 1 : 0.5 }}>
                  {canEdit ? (
                    <input type="checkbox" id={`cfg-${d.tipo}`} checked={f.ativo}
                      onChange={e => setConfigForm(p => ({ ...p, [d.tipo]: { ...f, ativo: e.target.checked } }))}
                      style={{ width: 17, height: 17, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                  ) : (
                    <div style={{ width: 17, height: 17, borderRadius: 3, background: f.ativo ? 'var(--primary)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {f.ativo && <CheckCircle2 size={11} color="#fff" />}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <label htmlFor={`cfg-${d.tipo}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', cursor: canEdit ? 'pointer' : 'default', display: 'block' }}>
                      {d.label}
                    </label>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{d.descricao}</div>
                  </div>
                  {d.hasThreshold && canEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="number" min={1} max={100} value={f.threshold || 10}
                        onChange={e => setConfigForm(p => ({ ...p, [d.tipo]: { ...f, threshold: Math.max(1, +e.target.value) } }))}
                        style={{ width: 64, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: 13, textAlign: 'center' }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>%</span>
                    </div>
                  )}
                  {d.hasThreshold && !canEdit && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>{f.threshold}%</span>
                  )}
                </div>
              )
            })}

            {can('alertas', 'edit') && (
              <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={saveConfigs} disabled={saving}
                  style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Save size={14} /> {saving ? 'Salvando...' : 'Salvar Configurações'}
                </button>
                {saved && <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✅ Salvo com sucesso!</span>}
              </div>
            )}
            {!can('alertas', 'edit') && (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 16, fontStyle: 'italic' }}>
                Apenas gestores e administradores podem alterar as configurações de alertas.
              </p>
            )}
          </div>

          {/* Info sobre rastreabilidade */}
          <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} /> Rastreabilidade
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {[
                { label: 'Entradas registradas', value: auditLog.filter(l => l.acao === 'Entrada').length },
                { label: 'Saídas registradas',   value: auditLog.filter(l => l.acao === 'Saída').length },
                { label: 'Aprovações',            value: auditLog.filter(l => l.acao === 'aprovar').length },
                { label: 'Usuários ativos',       value: [...new Set(auditLog.map(l => l.usuario).filter(Boolean))].length },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              O log de rastreabilidade é alimentado automaticamente pelas ações dos módulos Enxoval e Atas.
              Os demais módulos passarão a ser rastreados progressivamente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
