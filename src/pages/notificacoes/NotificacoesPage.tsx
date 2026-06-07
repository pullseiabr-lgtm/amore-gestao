import { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, RefreshCw, Trash2, Check, Filter, Loader, TrendingUp, AlertTriangle } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { fetchNotificacoes, marcarNotificacaoLida, deleteNotificacao } from '../../lib/db'
import type { Notificacao, NotificacaoTipo, NotificacaoStatus } from '../../types/database'

const TIPO_INFO: Record<NotificacaoTipo, { label: string; emoji: string; color: string }> = {
  tarefa:    { label: 'Tarefa',     emoji: '📋', color: '#2563EB' },
  compra:    { label: 'Compra',     emoji: '🛒', color: '#16A34A' },
  cotacao:   { label: 'Cotação',    emoji: '💬', color: '#7C3AED' },
  relatorio: { label: 'Relatório',  emoji: '📊', color: '#B45309' },
  estoque:   { label: 'Estoque',    emoji: '📦', color: '#DC2626' },
  manual:    { label: 'Manual',     emoji: '✍️', color: '#6B7280' },
}

const STATUS_INFO: Record<NotificacaoStatus, { label: string; color: string; bg: string }> = {
  enviado:  { label: 'Enviado',  color: '#15803D', bg: '#D1FAE5' },
  falha:    { label: 'Falha',    color: '#B91C1C', bg: '#FEE2E2' },
  pendente: { label: 'Pendente', color: '#92400E', bg: '#FEF3C7' },
}

const fmtDataHora = (s: string) => {
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return s }
}

function KpiCard({ titulo, valor, cor, icon }: { titulo: string; valor: number | string; cor: string; icon: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 150 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: cor + '22', color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{valor}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{titulo}</div>
      </div>
    </div>
  )
}

export default function NotificacoesPage() {
  const { loja } = useLoja()
  const [itens, setItens] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)
  const [fTipo, setFTipo] = useState<'' | NotificacaoTipo>('')
  const [fStatus, setFStatus] = useState<'' | NotificacaoStatus>('')
  const [fSetor, setFSetor] = useState('')
  const [aba, setAba] = useState<'lista' | 'dashboard'>('lista')

  const load = useCallback(async () => {
    setLoading(true)
    try { setItens(await fetchNotificacoes(loja, 300)) } catch { setItens([]) }
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const setores = useMemo(() => [...new Set(itens.map(i => i.setor).filter(Boolean) as string[])].sort(), [itens])

  const filtrados = itens
    .filter(i => !fTipo || i.tipo === fTipo)
    .filter(i => !fStatus || i.status === fStatus)
    .filter(i => !fSetor || i.setor === fSetor)

  // ── Métricas (dashboard) ──
  const total = itens.length
  const enviados = itens.filter(i => i.status === 'enviado').length
  const falhas = itens.filter(i => i.status === 'falha').length
  const naoLidas = itens.filter(i => !i.lida).length
  const taxaSucesso = total ? Math.round((enviados / total) * 100) : 0

  const porTipo = useMemo(() => {
    const m: Record<string, number> = {}
    itens.forEach(i => { m[i.tipo] = (m[i.tipo] || 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [itens])

  const porSetor = useMemo(() => {
    const m: Record<string, { total: number; falha: number }> = {}
    itens.forEach(i => {
      const k = i.setor || '(sem setor)'
      if (!m[k]) m[k] = { total: 0, falha: 0 }
      m[k].total++
      if (i.status === 'falha') m[k].falha++
    })
    return Object.entries(m).sort((a, b) => b[1].total - a[1].total)
  }, [itens])

  const maxTipo = Math.max(1, ...porTipo.map(([, v]) => v))
  const maxSetor = Math.max(1, ...porSetor.map(([, v]) => v.total))

  const handleLida = async (n: Notificacao) => {
    await marcarNotificacaoLida(n.id, !n.lida)
    setItens(prev => prev.map(i => i.id === n.id ? { ...i, lida: !n.lida } : i))
  }
  const handleDelete = async (id: string) => {
    await deleteNotificacao(id)
    setItens(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div>
      {/* Cabeçalho + abas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bordo-bg)', padding: 4, borderRadius: 10 }}>
          {(['lista', 'dashboard'] as const).map(t => (
            <button key={t} onClick={() => setAba(t)}
              style={{
                border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 7, fontSize: 13,
                fontWeight: aba === t ? 700 : 500,
                background: aba === t ? 'var(--bordo)' : 'transparent',
                color: aba === t ? '#fff' : 'var(--muted)',
              }}>
              {t === 'lista' ? '🔔 Histórico' : '📊 Dashboard'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn bo bsm" onClick={load} disabled={loading}>
          {loading ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <KpiCard titulo="Total enviadas" valor={total} cor="#2563EB" icon={<Bell size={18} />} />
        <KpiCard titulo="Entregues" valor={enviados} cor="#16A34A" icon={<Check size={18} />} />
        <KpiCard titulo="Falhas" valor={falhas} cor="#DC2626" icon={<AlertTriangle size={18} />} />
        <KpiCard titulo="Taxa de sucesso" valor={`${taxaSucesso}%`} cor="#7C3AED" icon={<TrendingUp size={18} />} />
        <KpiCard titulo="Não lidas" valor={naoLidas} cor="#B45309" icon={<Filter size={18} />} />
      </div>

      {aba === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800 }}>Por tipo de notificação</h3>
            {porTipo.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem dados ainda.</div>}
            {porTipo.map(([tipo, v]) => {
              const info = TIPO_INFO[tipo as NotificacaoTipo] || TIPO_INFO.manual
              return (
                <div key={tipo} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{info.emoji} {info.label}</span><strong>{v}</strong>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(v / maxTipo) * 100}%`, background: info.color, borderRadius: 99 }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 800 }}>Por setor</h3>
            {porSetor.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem dados ainda.</div>}
            {porSetor.map(([setor, v]) => (
              <div key={setor} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span>{setor}</span>
                  <strong>{v.total}{v.falha > 0 && <span style={{ color: '#DC2626', fontWeight: 600 }}> · {v.falha} falha(s)</span>}</strong>
                </div>
                <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(v.total / maxSetor) * 100}%`, background: 'var(--bordo)', borderRadius: 99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'lista' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
            <Filter size={14} style={{ color: 'var(--muted)' }} />
            <select className="sel" style={{ fontSize: 12 }} value={fTipo} onChange={e => setFTipo(e.target.value as any)}>
              <option value="">Todos os tipos</option>
              {Object.entries(TIPO_INFO).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
            <select className="sel" style={{ fontSize: 12 }} value={fStatus} onChange={e => setFStatus(e.target.value as any)}>
              <option value="">Todos os status</option>
              {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="sel" style={{ fontSize: 12 }} value={fSetor} onChange={e => setFSetor(e.target.value)}>
              <option value="">Todos os setores</option>
              {setores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{filtrados.length} registro(s)</span>
          </div>

          {loading && <div style={{ padding: 40, textAlign: 'center' }}><Loader size={20} className="spin" /></div>}
          {!loading && filtrados.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              <Bell size={28} style={{ opacity: 0.4, marginBottom: 8 }} /><br />
              Nenhuma notificação registrada ainda.<br />
              <span style={{ fontSize: 12 }}>Os envios de WhatsApp (tarefas, compras, cotações, relatórios) aparecem aqui automaticamente.</span>
            </div>
          )}

          {!loading && filtrados.map(n => {
            const info = TIPO_INFO[n.tipo] || TIPO_INFO.manual
            const st = STATUS_INFO[n.status] || STATUS_INFO.pendente
            return (
              <div key={n.id} style={{
                display: 'flex', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border)',
                background: n.lida ? 'transparent' : 'var(--bordo-bg)', alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: 20, flexShrink: 0 }}>{info.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{n.titulo || info.label}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                    {n.setor && <span style={{ fontSize: 10, color: 'var(--muted)' }}>· {n.setor}</span>}
                  </div>
                  {n.mensagem && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4, whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{n.mensagem}</div>}
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 5, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>🕒 {fmtDataHora(n.created_at)}</span>
                    {n.destinatario_nome && <span>👤 {n.destinatario_nome}</span>}
                    {n.destinatario_telefone && <span>📱 {n.destinatario_telefone}</span>}
                    {n.erro && <span style={{ color: '#DC2626' }}>⚠ {n.erro}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button className="ib" title={n.lida ? 'Marcar como não lida' : 'Marcar como lida'} onClick={() => handleLida(n)} style={{ color: n.lida ? 'var(--muted)' : 'var(--success)' }}><Check size={14} /></button>
                  <button className="ib rd" title="Excluir" onClick={() => handleDelete(n.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
