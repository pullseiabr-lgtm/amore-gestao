import { useState, useEffect, useMemo, useCallback } from 'react'
import { AlertOctagon, BarChart3, CalendarClock, RefreshCw, CheckCircle2, TrendingUp, AlertTriangle, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any
const ABERTAS = ['pendente', 'em_andamento', 'aguardando_retorno', 'aguardando_fornecedor']
const isAberta = (t: any) => ABERTAS.includes(t.status)
const isConcluida = (t: any) => t.status === 'concluido'

function humanTempo(ms: number) {
  const min = Math.round(Math.abs(ms) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  if (h < 24) return `${h}h${m ? ' ' + m + 'min' : ''}`
  const d = Math.floor(h / 24)
  return `${d} dia${d > 1 ? 's' : ''}`
}
// Classe da Central de Alertas
function classe(t: any, now: number): 'critico' | 'importante' | 'info' | 'concluido' {
  if (isConcluida(t)) return 'concluido'
  const venc = t.prazo ? new Date(t.prazo).getTime() < now : false
  if (venc || t.prioridade === 'urgente') return 'critico'
  if (t.prioridade === 'alta') return 'importante'
  return 'info'
}
const CLS: Record<string, { emoji: string; label: string; cor: string; bg: string }> = {
  critico: { emoji: '🔴', label: 'Crítico', cor: '#B42318', bg: '#FEF3F2' },
  importante: { emoji: '🟠', label: 'Importante', cor: '#B54708', bg: '#FFFAEB' },
  info: { emoji: '🔵', label: 'Informativo', cor: '#175CD3', bg: '#EFF8FF' },
  concluido: { emoji: '🟢', label: 'Concluído', cor: '#067647', bg: '#ECFDF3' },
}
const LOJAS = ['', 'Amore Paiva', 'Amore CD', 'Flow CD']

type Tab = 'alertas' | 'dashboard' | 'agenda' | 'cobranca'

export default function LizCentralPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('alertas')
  const [tarefas, setTarefas] = useState<any[]>([])
  const [loja, setLoja] = useState('')
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())
  const [fClasse, setFClasse] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('tarefas').select('id,numero,titulo,loja,setor,status,prioridade,responsavel_nome,prazo,concluido_em,iniciado_em,created_at').order('prazo', { ascending: true, nullsFirst: false }).limit(3000)
    setTarefas(data || []); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

  const filtradas = useMemo(() => tarefas.filter(t => !loja || t.loja === loja), [tarefas, loja])

  const resolver = async (t: any) => {
    await sb.from('tarefas').update({ status: 'concluido', concluido_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', t.id)
    setTarefas(prev => prev.map(x => x.id === t.id ? { ...x, status: 'concluido', concluido_em: new Date().toISOString() } : x))
    toast('Tarefa concluída! ✅')
  }

  const alertas = useMemo(() => {
    const arr = filtradas.map(t => ({ ...t, _cl: classe(t, now) }))
    const ordem: Record<string, number> = { critico: 0, importante: 1, info: 2, concluido: 3 }
    return arr.sort((a, b) => ordem[a._cl] - ordem[b._cl] || (a.prazo || '').localeCompare(b.prazo || ''))
  }, [filtradas, now])
  const cont = useMemo(() => {
    const c: Record<string, number> = { critico: 0, importante: 0, info: 0, concluido: 0 }
    alertas.forEach(a => c[a._cl]++)
    return c
  }, [alertas])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem' }
  const kcard = (label: string, value: string | number, sub?: string, color = '#6B1212') => (
    <div style={{ ...card, flex: 1, minWidth: 150 }}><div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div><div style={{ fontSize: 27, fontWeight: 800, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>{sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}</div>
  )
  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: tab === id ? '#6B1212' : 'transparent', color: tab === id ? '#fff' : '#6b7280' }}>{icon}{label}</button>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 22 }}>🤖</div>
        <div><div style={{ fontWeight: 700, fontSize: 16 }}>Liz — Central Operacional</div><div style={{ fontSize: 12, color: '#9ca3af' }}>Sua assistente acompanhando a operação em tempo real</div></div>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ marginLeft: 'auto', padding: '.5rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          {LOJAS.map(l => <option key={l} value={l}>{l || 'Todas as lojas'}</option>)}
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.5rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} /></button>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 18px', background: '#f9fafb', padding: 6, borderRadius: 12, width: 'fit-content' }}>
        {tabBtn('alertas', <AlertOctagon size={16} />, 'Central de Alertas')}
        {tabBtn('dashboard', <BarChart3 size={16} />, 'Dashboard do Gestor')}
        {tabBtn('agenda', <CalendarClock size={16} />, 'Agenda do Dia')}
        {tabBtn('cobranca', <Send size={16} />, 'Cobrança WhatsApp')}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> : <>

      {tab === 'alertas' && <>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['critico', 'importante', 'info', 'concluido'] as const).map(k => (
            <button key={k} onClick={() => setFClasse(fClasse === k ? '' : k)} style={{ ...card, flex: 1, minWidth: 130, cursor: 'pointer', textAlign: 'left', borderColor: fClasse === k ? CLS[k].cor : '#e5e7eb', borderWidth: fClasse === k ? 2 : 1 }}>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{CLS[k].emoji} {CLS[k].label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: CLS[k].cor }}>{cont[k]}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alertas.filter(a => !fClasse || a._cl === fClasse).slice(0, 200).map(a => {
            const c = CLS[a._cl]
            const venc = a.prazo && new Date(a.prazo).getTime() < now
            const tempo = a.prazo ? (venc ? `vencida há ${humanTempo(new Date(a.prazo).getTime() - now)}` : `vence em ${humanTempo(new Date(a.prazo).getTime() - now)}`) : 'sem prazo'
            return <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '.85rem 1rem', borderRadius: 12, background: c.bg, border: `1px solid ${c.cor}22` }}>
              <span style={{ fontSize: 18 }}>{c.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.titulo}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{a.responsavel_nome || 'Sem responsável'} · {a.loja} · {a.setor}{a.prazo ? ' · ' : ''}<b style={{ color: venc ? c.cor : '#6b7280' }}>{a.prazo ? tempo : ''}</b></div>
              </div>
              {a._cl !== 'concluido'
                ? <button onClick={() => resolver(a)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '.5rem .9rem', border: 'none', borderRadius: 9, background: '#067647', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}><CheckCircle2 size={15} />Resolver</button>
                : <span style={{ fontSize: 12, color: '#067647', fontWeight: 600 }}>✓ Concluída</span>}
            </div>
          })}
          {alertas.filter(a => !fClasse || a._cl === fClasse).length === 0 && <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Nenhum alerta nesta categoria 🎉</div>}
        </div>
      </>}

      {tab === 'dashboard' && <DashboardGestor tarefas={filtradas} now={now} kcard={kcard} card={card} />}

      {tab === 'agenda' && <AgendaDia tarefas={filtradas} now={now} resolver={resolver} card={card} />}

      {tab === 'cobranca' && <CobrancaTab card={card} toast={toast} />}

      </>}
    </div>
  )
}

function CobrancaTab({ card, toast }: { card: React.CSSProperties; toast: (m: string, t?: any) => void }) {
  const [cfg, setCfg] = useState<any>(null)
  const [log, setLog] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const carregar = useCallback(async () => {
    const [c, l] = await Promise.all([
      sb.from('liz_cobranca_config').select('*').eq('id', 1).maybeSingle(),
      sb.from('liz_cobrancas').select('*').order('created_at', { ascending: false }).limit(50),
    ])
    setCfg(c.data || {}); setLog(l.data || [])
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const set = (k: string, v: any) => setCfg((p: any) => ({ ...p, [k]: v }))
  const salvar = async () => {
    const { error } = await sb.from('liz_cobranca_config').update({
      ativo: !!cfg.ativo, n1_min: +cfg.n1_min || 15, n2_min: +cfg.n2_min || 60, gerente_min: +cfg.gerente_min || 120, diretor_min: +cfg.diretor_min || 240,
      gerente_whats: cfg.gerente_whats || null, diretor_whats: cfg.diretor_whats || null, horario_inicio: +cfg.horario_inicio || 7, horario_fim: +cfg.horario_fim || 21, updated_at: new Date().toISOString(),
    }).eq('id', 1)
    if (error) toast('Erro ao salvar.', 'error'); else toast('Configuração salva!')
  }
  const testar = async () => { setBusy(true); const { data } = await sb.rpc('liz_cobrar'); setBusy(false); carregar(); toast(data?.ativo ? `${data.enviadas} cobrança(s) disparada(s)` : 'Cobrança está DESLIGADA — ative para disparar', data?.ativo ? 'success' : 'error') }
  if (!cfg) return <div style={{ padding: 30, color: '#9ca3af' }}>Carregando…</div>
  const field = (label: string, k: string, w = 90, type = 'number') => <div><div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>{label}</div><input type={type} value={cfg[k] ?? ''} onChange={e => set(k, e.target.value)} style={{ width: w, padding: '.5rem .6rem', border: '1px solid #e5e7eb', borderRadius: 8 }} /></div>
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ ...card, background: cfg.ativo ? '#ECFDF3' : '#fff', borderColor: cfg.ativo ? '#A6F4C5' : '#e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div><b style={{ fontSize: 15 }}>🤖 Cobrança automática da Liz</b><div style={{ fontSize: 13, color: '#6b7280' }}>A Liz cobra as tarefas vencidas pelo WhatsApp, escalando conforme o atraso.</div></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
          <input type="checkbox" checked={!!cfg.ativo} onChange={e => set('ativo', e.target.checked)} style={{ width: 20, height: 20 }} />
          {cfg.ativo ? '🟢 Ligada' : '🔴 Desligada'}
        </label>
      </div>
    </div>
    <div style={card}>
      <b style={{ fontSize: 14 }}>Escada de cobrança (minutos de atraso)</b>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
        {field('🟡 1º aviso ao responsável', 'n1_min')}
        {field('🔴 2º aviso (reforço)', 'n2_min')}
        {field('🚨 Escala p/ gerente', 'gerente_min')}
        {field('🚨 Escala p/ diretor', 'diretor_min')}
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
        {field('WhatsApp do gerente', 'gerente_whats', 170, 'tel')}
        {field('WhatsApp do diretor', 'diretor_whats', 170, 'tel')}
        {field('Horário início (h)', 'horario_inicio', 70)}
        {field('Horário fim (h)', 'horario_fim', 70)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={salvar} style={{ padding: '.6rem 1.2rem', border: 'none', borderRadius: 10, background: '#6B1212', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Salvar configuração</button>
        <button onClick={testar} disabled={busy} style={{ padding: '.6rem 1.2rem', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>{busy ? 'Disparando…' : '▶ Testar cobrança agora'}</button>
      </div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>O responsável recebe no WhatsApp dele (cadastrado no perfil). A Liz varre as tarefas a cada 10 min. Cada nível é enviado uma única vez por tarefa.</div>
    </div>
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '1rem 1.3rem', borderBottom: '1px solid #f3f4f6' }}><b style={{ fontSize: 14 }}>Últimas cobranças enviadas</b></div>
      {log.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhuma cobrança enviada ainda.</div> :
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}><th style={{ padding: 8 }}>Quando</th><th>Nível</th><th>Para</th><th>WhatsApp</th></tr></thead>
          <tbody>{log.map(l => <tr key={l.id} style={{ borderTop: '1px solid #f3f4f6' }}>
            <td style={{ padding: 8 }}>{new Date(l.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
            <td>{['', '🟡 1º aviso', '🔴 2º aviso', '🚨 Gerente', '🚨 Diretor'][l.nivel] || l.nivel}</td>
            <td>{l.destinatario_nome}</td><td>{l.destinatario_fone}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  </div>
}

function DashboardGestor({ tarefas, now, kcard, card }: any) {
  const d = useMemo(() => {
    const abertas = tarefas.filter(isAberta)
    const vencidas = abertas.filter((t: any) => t.prazo && new Date(t.prazo).getTime() < now)
    const concl = tarefas.filter(isConcluida)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const conclHoje = concl.filter((t: any) => t.concluido_em && new Date(t.concluido_em) >= hoje)
    // tempo médio (criação → conclusão) em horas
    const tempos = concl.filter((t: any) => t.concluido_em && t.created_at).map((t: any) => (new Date(t.concluido_em).getTime() - new Date(t.created_at).getTime()) / 3600000)
    const tmedio = tempos.length ? tempos.reduce((a: number, b: number) => a + b, 0) / tempos.length : 0
    // por colaborador
    const col: Record<string, any> = {}
    tarefas.forEach((t: any) => {
      const n = t.responsavel_nome || 'Sem responsável'
      if (!col[n]) col[n] = { nome: n, total: 0, concl: 0, venc: 0, atras: 0 }
      col[n].total++
      if (isConcluida(t)) { col[n].concl++; if (t.prazo && t.concluido_em && new Date(t.concluido_em) > new Date(t.prazo)) col[n].atras++ }
      if (isAberta(t) && t.prazo && new Date(t.prazo).getTime() < now) col[n].venc++
    })
    const colabs = Object.values(col)
    const produtivos = [...colabs].sort((a: any, b: any) => b.concl - a.concl).slice(0, 6)
    const atrasados = [...colabs].filter((c: any) => (c.venc + c.atras) > 0).sort((a: any, b: any) => (b.venc + b.atras) - (a.venc + a.atras)).slice(0, 6)
    // por setor
    const setor: Record<string, any> = {}
    tarefas.forEach((t: any) => { const s = t.setor || 'Geral'; if (!setor[s]) setor[s] = { setor: s, total: 0, venc: 0 }; setor[s].total++; if (isAberta(t) && t.prazo && new Date(t.prazo).getTime() < now) setor[s].venc++ })
    const setores = Object.values(setor).sort((a: any, b: any) => b.venc - a.venc)
    return { abertas: abertas.length, vencidas: vencidas.length, conclHoje: conclHoje.length, tmedio, produtivos, atrasados, setores }
  }, [tarefas, now])

  return <>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      {kcard('Tarefas abertas', d.abertas)}
      {kcard('Vencidas', d.vencidas, 'precisam de ação', '#B42318')}
      {kcard('Concluídas hoje', d.conclHoje, '', '#067647')}
      {kcard('Tempo médio', d.tmedio >= 1 ? d.tmedio.toFixed(1) + 'h' : Math.round(d.tmedio * 60) + 'min', 'para concluir', '#175CD3')}
    </div>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ ...card, flex: 1, minWidth: 260 }}>
        <b style={{ fontSize: 14 }}><TrendingUp size={15} style={{ verticalAlign: -2 }} /> Mais produtivos</b>
        {d.produtivos.map((c: any, i: number) => <div key={c.nome} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '.4rem 0', borderBottom: '1px solid #f3f4f6' }}><span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.'} {c.nome}</span><b style={{ color: '#067647' }}>{c.concl} concluídas</b></div>)}
        {d.produtivos.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Sem dados.</div>}
      </div>
      <div style={{ ...card, flex: 1, minWidth: 260 }}>
        <b style={{ fontSize: 14, color: '#B42318' }}><AlertTriangle size={15} style={{ verticalAlign: -2 }} /> Mais atrasos</b>
        {d.atrasados.map((c: any) => <div key={c.nome} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '.4rem 0', borderBottom: '1px solid #f3f4f6' }}><span>{c.nome}</span><b style={{ color: '#B42318' }}>{c.venc + c.atras} atraso(s)</b></div>)}
        {d.atrasados.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Ninguém com atrasos 🎉</div>}
      </div>
      <div style={{ ...card, flex: 1, minWidth: 260 }}>
        <b style={{ fontSize: 14 }}>Gargalos por setor</b>
        {d.setores.slice(0, 7).map((s: any) => <div key={s.setor} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '.4rem 0', borderBottom: '1px solid #f3f4f6' }}><span>{s.setor}</span><span style={{ color: s.venc > 0 ? '#B42318' : '#9ca3af' }}>{s.venc} vencida(s) / {s.total}</span></div>)}
        {d.setores.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Sem dados.</div>}
      </div>
    </div>
  </>
}

function AgendaDia({ tarefas, now, resolver, card }: any) {
  const hojeStr = new Date().toISOString().split('T')[0]
  const doDia = useMemo(() => tarefas.filter((t: any) => (t.prazo || '').startsWith(hojeStr) || (isAberta(t) && t.prazo && new Date(t.prazo).getTime() < now))
    .sort((a: any, b: any) => (a.prazo || '').localeCompare(b.prazo || '')), [tarefas, now, hojeStr])
  const hora = (p: string | null) => p ? new Date(p).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'
  return <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
    <div style={{ padding: '1rem 1.3rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <b style={{ fontSize: 15 }}>📅 Agenda de hoje — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</b>
      <span style={{ fontSize: 12, color: '#9ca3af' }}>{doDia.length} itens</span>
    </div>
    {doDia.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Nada agendado para hoje 🎉</div> :
      doDia.map((t: any) => {
        const venc = isAberta(t) && t.prazo && new Date(t.prazo).getTime() < now
        const done = isConcluida(t)
        return <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '.85rem 1.3rem', borderBottom: '1px solid #f6f6f6' }}>
          <div style={{ fontWeight: 700, fontSize: 14, width: 52, color: venc ? '#B42318' : '#6B1212' }}>{hora(t.prazo)}</div>
          <div style={{ width: 22, textAlign: 'center' }}>{done ? '✔' : venc ? '⏰' : '⬜'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 14, textDecoration: done ? 'line-through' : 'none', color: done ? '#9ca3af' : 'inherit' }}>{t.titulo}</div>
            <div style={{ fontSize: 12, color: '#9ca3af' }}>{t.responsavel_nome || 'Sem responsável'} · {t.setor}{venc ? ' · atrasada — Liz reorganizou' : ''}</div>
          </div>
          {!done && <button onClick={() => resolver(t)} style={{ padding: '.4rem .8rem', border: 'none', borderRadius: 8, background: '#067647', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Concluir</button>}
        </div>
      })}
  </div>
}
