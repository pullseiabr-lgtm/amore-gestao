import { useState, useEffect, useCallback } from 'react'
import { Bot, RefreshCw, Power, Pause, Play, Clock, Save, UtensilsCrossed, Bike, CalendarCheck, HelpCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }

const FUNCS: { k: string; label: string; desc: string; icon: React.ReactNode }[] = [
  { k: 'func_cardapio', label: 'Cardápio', desc: 'Responder sobre itens, preços e o menu', icon: <UtensilsCrossed size={18} /> },
  { k: 'func_delivery', label: 'Delivery / Pedidos', desc: 'Anotar pedidos, endereço e pagamento', icon: <Bike size={18} /> },
  { k: 'func_reservas', label: 'Reservas / Mesas', desc: 'Reserva de mesa e disponibilidade', icon: <CalendarCheck size={18} /> },
  { k: 'func_duvidas', label: 'Dúvidas & Horário', desc: 'Horário, endereço, dúvidas gerais', icon: <HelpCircle size={18} /> },
]

function Switch({ on, onChange, color = '#1D9E75' }: { on: boolean; onChange: () => void; color?: string }) {
  return <label style={{ position: 'relative', width: 50, height: 28, flexShrink: 0, cursor: 'pointer' }}>
    <input type="checkbox" checked={on} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
    <span style={{ position: 'absolute', inset: 0, background: on ? color : '#d1d5db', borderRadius: 28, transition: '.2s' }}>
      <span style={{ position: 'absolute', width: 22, height: 22, left: on ? 25 : 3, top: 3, background: '#fff', borderRadius: '50%', transition: '.2s' }} />
    </span>
  </label>
}

export default function ControleAgentePage() {
  const { toast } = useToast()
  const [cfg, setCfg] = useState<any | null>(null)
  const [status, setStatus] = useState<any | null>(null)
  const [execs, setExecs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, s, e] = await Promise.all([
        sb.from('agente_config').select('*').eq('id', 1).maybeSingle(),
        sb.rpc('agente_status'),
        sb.from('agente_execucoes').select('*').order('created_at', { ascending: false }).limit(50),
      ])
      setCfg(c.data || null); setStatus(s.data || null); setExecs(e.data || [])
    } catch { toast('Erro ao carregar (verifique login).', 'error') }
    setLoading(false)
  }, [toast])
  useEffect(() => { load() }, [load])

  const up = (patch: any) => { setCfg((p: any) => ({ ...p, ...patch })); setDirty(true) }

  const salvar = async (extra?: any) => {
    const row = { ...cfg, ...extra, updated_at: new Date().toISOString() }
    const { error } = await sb.from('agente_config').update(row).eq('id', 1)
    if (error) { toast('Erro ao salvar.', 'error'); return }
    setDirty(false); toast('Configuração salva!'); const { data } = await sb.rpc('agente_status'); setStatus(data)
  }
  const pausar = async (horas: number | 'limpar') => {
    const val = horas === 'limpar' ? null : new Date(Date.now() + horas * 3600e3).toISOString()
    up({ pausado_ate: val }); await salvar({ pausado_ate: val })
  }
  const toggleMaster = async () => { const v = !cfg.master_ativo; up({ master_ativo: v }); await salvar({ master_ativo: v }) }

  if (loading || !cfg) return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div>

  const st = status || {}
  const statusInfo = !st.ativo
    ? { txt: st.motivo === 'pausado' ? 'PAUSADO' : st.motivo === 'fora_horario' ? 'FORA DO HORÁRIO' : 'DESLIGADO', cor: '#B91C1C', bg: '#FEF2F2' }
    : { txt: 'ATENDENDO', cor: '#1D7A54', bg: '#eafaf1' }
  const pausadoAte = cfg.pausado_ate && new Date(cfg.pausado_ate) > new Date() ? new Date(cfg.pausado_ate) : null

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* STATUS + MASTER */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#6B121218', color: '#6B1212', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bot size={26} /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Agente de Atendimento (WhatsApp)</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, background: statusInfo.bg, color: statusInfo.cor, padding: '.25rem .7rem', borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusInfo.cor }} />{statusInfo.txt}
            {pausadoAte && <span style={{ fontWeight: 500 }}>· até {pausadoAte.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        </div>
        <button onClick={toggleMaster} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.7rem 1.2rem', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, background: cfg.master_ativo ? '#FEF2F2' : '#1D9E75', color: cfg.master_ativo ? '#B91C1C' : '#fff' }}>
          <Power size={18} />{cfg.master_ativo ? 'Desligar agente' : 'Ligar agente'}
        </button>
        <button onClick={load} title="Atualizar" style={{ padding: '.7rem', borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={16} /></button>
      </div>

      {/* PAUSA RÁPIDA */}
      <div style={card}>
        <b style={{ fontSize: 14 }}>⏸️ Pausa rápida</b>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 10px' }}>Para o agente temporariamente (ele volta sozinho no fim do tempo).</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pausadoAte
            ? <button onClick={() => pausar('limpar')} style={btn('#1D9E75')}><Play size={15} />Retomar agora</button>
            : <>
              <button onClick={() => pausar(1)} style={btn('#D97706', true)}><Pause size={15} />1 hora</button>
              <button onClick={() => pausar(2)} style={btn('#D97706', true)}><Pause size={15} />2 horas</button>
              <button onClick={() => pausar(4)} style={btn('#D97706', true)}><Pause size={15} />4 horas</button>
              <button onClick={() => pausar(12)} style={btn('#D97706', true)}><Pause size={15} />Até amanhã</button>
            </>}
        </div>
      </div>

      {/* FUNÇÕES */}
      <div style={card}>
        <b style={{ fontSize: 14 }}>🎛️ Funções do agente</b>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 12px' }}>Ligue/desligue o que o agente responde. Ex.: desligar Delivery e manter o resto.</p>
        {FUNCS.map(f => (
          <div key={f.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '.7rem 0', borderTop: '1px solid #f3f4f6' }}>
            <div style={{ color: '#6B1212' }}>{f.icon}</div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{f.desc}</div></div>
            <Switch on={!!cfg[f.k]} onChange={() => { const v = !cfg[f.k]; up({ [f.k]: v }); salvar({ [f.k]: v }) }} />
          </div>
        ))}
      </div>

      {/* HORÁRIO */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={18} style={{ color: '#6B1212' }} />
          <b style={{ fontSize: 14, flex: 1 }}>Horário de funcionamento</b>
          <Switch on={!!cfg.horario_ativo} onChange={() => up({ horario_ativo: !cfg.horario_ativo })} color="#6B1212" />
        </div>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: '6px 0 10px' }}>Quando ligado, o agente só atende nos dias e horas abaixo. Fora disso, responde a mensagem automática.</p>
        {cfg.horario_ativo && <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {DIAS.map((d, i) => {
              const on = (cfg.horario_dias || []).includes(i)
              return <button key={i} onClick={() => { const arr = new Set(cfg.horario_dias || []); on ? arr.delete(i) : arr.add(i); up({ horario_dias: [...arr].sort() }) }}
                style={{ padding: '.4rem .7rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: on ? '#6B1212' : '#f3f4f6', color: on ? '#fff' : '#6b7280' }}>{d}</button>
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 14 }}>
            <span>Das</span>
            <select value={cfg.horario_inicio} onChange={e => up({ horario_inicio: Number(e.target.value) })} style={sel}>{hrs()}</select>
            <span>às</span>
            <select value={cfg.horario_fim} onChange={e => up({ horario_fim: Number(e.target.value) })} style={sel}>{hrs()}</select>
            <span style={{ color: '#9ca3af', fontSize: 12 }}>(horário de Recife)</span>
          </div>
        </>}
      </div>

      {/* MENSAGEM FORA */}
      <div style={card}>
        <b style={{ fontSize: 14 }}>💬 Mensagem automática (quando desligado/fora do horário)</b>
        <textarea value={cfg.msg_fora || ''} onChange={e => up({ msg_fora: e.target.value })} rows={3}
          style={{ width: '100%', padding: '.7rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', marginTop: 8, resize: 'vertical', fontFamily: 'inherit', fontSize: 14 }} />
      </div>

      {dirty && <div style={{ position: 'sticky', bottom: 12, textAlign: 'center' }}>
        <button onClick={() => salvar()} style={{ ...btn('#6B1212'), display: 'inline-flex', padding: '.8rem 2rem', boxShadow: '0 8px 20px rgba(107,18,18,.3)' }}><Save size={16} />Salvar alterações</button>
      </div>}

      {/* EXECUÇÕES */}
      <div style={card}>
        <b style={{ fontSize: 14 }}>📋 Execuções recentes ({execs.length})</b>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 10px' }}>Cada atendimento/ação que o agente registra aparece aqui.</p>
        {execs.length === 0
          ? <div style={{ fontSize: 13, color: '#9ca3af', padding: '10px 0' }}>Nenhuma execução registrada ainda. (Aparece assim que o agente estiver conectado ao painel.)</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {execs.map(x => <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#6B1212', background: '#6B121214', padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase' }}>{x.tipo || '—'}</span>
              <span style={{ flex: 1 }}>{x.resumo || x.cliente || x.telefone || '—'}</span>
              <span style={{ color: '#9ca3af', whiteSpace: 'nowrap' }}>{new Date(x.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>)}
          </div>}
      </div>
    </div>
  )
}
const btn = (cor: string, ghost = false): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', borderRadius: 10, border: ghost ? `1px solid ${cor}55` : 'none', background: ghost ? '#fff' : cor, color: ghost ? cor : '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13.5 })
const sel: React.CSSProperties = { padding: '.45rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }
function hrs() { return Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}h</option>) }
