import { useState, useEffect, useMemo, useCallback } from 'react'
import { Users, Search, RefreshCw, Download, Gift, Star, Cake, MessageCircle, X, Ban, Tag as TagIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any

const LOJAS = [
  { key: '', label: 'Todas as lojas' },
  { key: 'Amore Paiva', label: 'Amore Paiva' },
  { key: 'Amore CD', label: 'Amore Costa Dourada' },
]
type Seg =
  | 'todos' | 'aniv_hoje' | 'aniv_semana' | 'aniv_mes'
  | 'cinco_estrelas' | 'nota_baixa' | 'ganhou_nao_resgatou'
  | 'sem_30' | 'sem_60' | 'sem_90' | 'mkt_sim' | 'mkt_nao' | 'frequentes'
const SEGS: { key: Seg; label: string }[] = [
  { key: 'todos', label: 'Todos os clientes' },
  { key: 'aniv_hoje', label: '🎂 Aniversariantes de hoje' },
  { key: 'aniv_semana', label: '🎂 Aniversariantes da semana' },
  { key: 'aniv_mes', label: '🎂 Aniversariantes do mês' },
  { key: 'cinco_estrelas', label: '⭐ Avaliaram 5 estrelas' },
  { key: 'nota_baixa', label: '⚠️ Avaliaram com nota baixa' },
  { key: 'ganhou_nao_resgatou', label: '🎁 Ganhou e não resgatou' },
  { key: 'sem_30', label: '⏳ Sem visita há 30+ dias' },
  { key: 'sem_60', label: '⏳ Sem visita há 60+ dias' },
  { key: 'sem_90', label: '⏳ Sem visita há 90+ dias' },
  { key: 'mkt_sim', label: '✅ Autorizaram marketing' },
  { key: 'mkt_nao', label: '🚫 Não autorizaram marketing' },
  { key: 'frequentes', label: '🔁 Clientes frequentes (3+)' },
]

const fmtFone = (p: string) => {
  const d = (p || '').replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return p
}
const fmtAniv = (c: any) => c.birthday_day && c.birthday_month ? `${String(c.birthday_day).padStart(2, '0')}/${String(c.birthday_month).padStart(2, '0')}` : '—'
const diasDe = (iso: string) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1rem 1.2rem' }

export default function ClientesPage() {
  const { toast } = useToast()
  const [clientes, setClientes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loja, setLoja] = useState('')
  const [seg, setSeg] = useState<Seg>('todos')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<any | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.from('customers').select('*').order('created_at', { ascending: false }).limit(5000)
      if (error) throw error
      setClientes(data || [])
    } catch { toast('Erro ao carregar clientes. (verifique se está logado)', 'error') }
    setLoading(false)
  }, [toast])
  useEffect(() => { load() }, [load])

  const hoje = new Date()
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const dia = hoje.getDate(), mes = hoje.getMonth() + 1
    return clientes.filter(c => {
      if (loja && c.origin_store !== loja) return false
      if (q && !((c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q.replace(/\D/g, '')))) return false
      switch (seg) {
        case 'aniv_hoje': return c.birthday_day === dia && c.birthday_month === mes
        case 'aniv_semana': { if (!c.birthday_day || !c.birthday_month) return false; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); if (c.birthday_day === d.getDate() && c.birthday_month === d.getMonth() + 1) return true } return false }
        case 'aniv_mes': return c.birthday_month === mes
        case 'cinco_estrelas': return Number(c.nota_media) >= 4.5
        case 'nota_baixa': return Number(c.nota_media) > 0 && Number(c.nota_media) <= 3
        case 'ganhou_nao_resgatou': return (c.premios_recebidos || 0) > (c.premios_resgatados || 0)
        case 'sem_30': return (diasDe(c.last_seen_at) ?? 0) >= 30
        case 'sem_60': return (diasDe(c.last_seen_at) ?? 0) >= 60
        case 'sem_90': return (diasDe(c.last_seen_at) ?? 0) >= 90
        case 'mkt_sim': return !!c.consent_whatsapp && c.status !== 'opt_out'
        case 'mkt_nao': return !c.consent_whatsapp || c.status === 'opt_out'
        case 'frequentes': return (c.avaliacoes_count || 0) >= 3
        default: return true
      }
    })
  }, [clientes, loja, seg, busca])

  const kpi = useMemo(() => {
    const t = clientes.length
    const novos = clientes.filter(c => (diasDe(c.created_at) ?? 999) <= 30).length
    const mkt = clientes.filter(c => c.consent_whatsapp && c.status !== 'opt_out').length
    const anivMes = clientes.filter(c => c.birthday_month === hoje.getMonth() + 1).length
    return { t, novos, mkt, pctMkt: t ? Math.round((mkt / t) * 100) : 0, anivMes }
  }, [clientes])

  const exportar = () => {
    const head = ['nome', 'whatsapp', 'email', 'aniversario', 'loja', 'avaliacoes', 'nota_media', 'raspadinhas', 'premios_recebidos', 'premios_resgatados', 'ultimo_premio', 'marketing', 'aniversario_ok', 'status', 'tags']
    const linhas = filtrados.map(c => [c.name, c.phone, c.email || '', fmtAniv(c), c.origin_store || '', c.avaliacoes_count || 0, c.nota_media || '', c.raspadinhas_count || 0, c.premios_recebidos || 0, c.premios_resgatados || 0, c.ultimo_premio || '', c.consent_whatsapp ? 'sim' : 'nao', c.consent_birthday ? 'sim' : 'nao', c.status || '', (c.tags || []).join('|')])
    const csv = [head, ...linhas].map(l => l.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clientes_amore.csv'; a.click()
  }

  const kcard = (label: string, value: React.ReactNode, sub: string, icon: React.ReactNode, color = '#6B1212') => (
    <div style={{ ...card, flex: 1, minWidth: 170, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '18', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>{label} · {sub}</div>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {kcard('Clientes', kpi.t, `${kpi.novos} novos (30d)`, <Users size={20} />)}
        {kcard('Marketing OK', kpi.pctMkt + '%', `${kpi.mkt} autorizaram`, <MessageCircle size={20} />, '#1D9E75')}
        {kcard('Aniversariantes', kpi.anivMes, 'neste mês', <Cake size={20} />, '#D4537E')}
      </div>

      {/* filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 11, color: '#9ca3af' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou WhatsApp" style={{ width: '100%', padding: '.55rem .8rem .55rem 2rem', borderRadius: 10, border: '1px solid #e5e7eb' }} />
        </div>
        <select value={seg} onChange={e => setSeg(e.target.value as Seg)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          {SEGS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          {LOJAS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} />Atualizar</button>
        <button onClick={exportar} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem .9rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer' }}><Download size={15} />Exportar ({filtrados.length})</button>
      </div>

      <div style={card}>
        <b style={{ fontSize: 14 }}>Clientes ({filtrados.length})</b>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 720 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Cliente</th><th>WhatsApp</th><th>Loja</th><th>Aniv.</th><th>Aval.</th><th>Nota</th><th>Prêmios</th><th>Mkt</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Carregando…</td></tr> :
                filtrados.length === 0 ? <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Nenhum cliente neste filtro.</td></tr> :
                  filtrados.slice(0, 500).map(c => (
                    <tr key={c.id} onClick={() => setSel(c)} style={{ borderTop: '1px solid #f3f4f6', cursor: 'pointer', background: c.status === 'opt_out' ? '#fafafa' : '#fff' }}>
                      <td style={{ padding: 8 }}>
                        <div style={{ fontWeight: 600 }}>{c.name || '—'} {c.status === 'opt_out' && <span style={{ fontSize: 11, color: '#B91C1C' }}>· opt-out</span>}</div>
                        {(c.tags || []).length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>{c.tags.map((t: string) => <span key={t} style={{ fontSize: 10.5, background: '#EEF2FF', color: '#4338CA', padding: '1px 6px', borderRadius: 20 }}>{t}</span>)}</div>}
                      </td>
                      <td>{fmtFone(c.phone)}</td>
                      <td>{c.origin_store === 'Amore CD' ? 'Costa Dourada' : (c.origin_store || '—')}</td>
                      <td>{fmtAniv(c)}</td>
                      <td>{c.avaliacoes_count || 0}</td>
                      <td>{c.nota_media ? Number(c.nota_media).toFixed(1) + '⭐' : '—'}</td>
                      <td>{c.premios_recebidos || 0}{(c.premios_recebidos || 0) > (c.premios_resgatados || 0) ? <span style={{ color: '#D97706' }}> · {(c.premios_recebidos - c.premios_resgatados)} a resgatar</span> : ''}</td>
                      <td>{c.consent_whatsapp && c.status !== 'opt_out' ? '✅' : '—'}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      {sel && <ClienteDrawer c={sel} onClose={() => setSel(null)} reload={load} toast={toast} />}
    </div>
  )
}

function ClienteDrawer({ c, onClose, reload, toast }: { c: any; onClose: () => void; reload: () => void; toast: (m: string, t?: any) => void }) {
  const [avaliacoes, setAvaliacoes] = useState<any[]>([])
  const [premios, setPremios] = useState<any[]>([])
  const [consents, setConsents] = useState<any[]>([])
  const [tags, setTags] = useState<string>((c.tags || []).join(', '))
  const [obs, setObs] = useState<string>(c.obs_internas || '')

  useEffect(() => {
    (async () => {
      const [f, p, cc] = await Promise.all([
        sb.from('feedbacks').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }),
        sb.from('rasp_participacoes').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }),
        sb.from('customer_consents').select('*').eq('customer_id', c.id).order('accepted_at', { ascending: false }).limit(30),
      ])
      setAvaliacoes(f.data || []); setPremios(p.data || []); setConsents(cc.data || [])
    })()
  }, [c.id])

  const copiarPriv = () => {
    if (!c.prefs_token) { toast('Cliente sem link (dados excluídos).', 'error'); return }
    navigator.clipboard.writeText(`https://painel.amorefood.com.br/privacidade.html?t=${c.prefs_token}`)
    toast('Link de privacidade copiado!')
  }
  const excluirLGPD = async () => {
    if (!c.prefs_token) { toast('Dados já excluídos.', 'error'); return }
    if (!confirm('EXCLUIR os dados pessoais deste cliente (LGPD)? O histórico é anonimizado e a ação é permanente.')) return
    const { data } = await sb.rpc('cliente_excluir', { p_token: c.prefs_token })
    if (data?.ok) { toast('Dados excluídos/anonimizados.'); reload(); onClose() } else { toast('Não foi possível excluir.', 'error') }
  }
  const CONSENT_LBL: Record<string, string> = { obrigatorio_beneficio: 'Benefício', marketing: 'Marketing', aniversario: 'Aniversário', exclusao_lgpd: 'Exclusão LGPD' }

  const salvar = async () => {
    const arr = tags.split(',').map(s => s.trim()).filter(Boolean)
    const { error } = await sb.from('customers').update({ tags: arr, obs_internas: obs || null, updated_at: new Date().toISOString() }).eq('id', c.id)
    if (error) { toast('Erro ao salvar.', 'error'); return }
    toast('Cliente atualizado!'); reload(); onClose()
  }
  const optOut = async () => {
    if (!confirm('Registrar opt-out? O cliente deixará de receber comunicações de marketing.')) return
    await sb.from('customers').update({ consent_whatsapp: false, consent_birthday: false, status: 'opt_out', updated_at: new Date().toISOString() }).eq('id', c.id)
    await sb.from('customer_consents').insert([
      { customer_id: c.id, consent_type: 'marketing', accepted: false, source: 'painel-optout', revoked_at: new Date().toISOString() },
      { customer_id: c.id, consent_type: 'aniversario', accepted: false, source: 'painel-optout', revoked_at: new Date().toISOString() },
    ])
    toast('Opt-out registrado.'); reload(); onClose()
  }

  const EXP: Record<string, string> = { excelente: '😍', boa: '🙂', regular: '😐', ruim: '🙁', pessima: '😡' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(460px, 100%)', background: '#fff', height: '100%', overflowY: 'auto', padding: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{c.name || '—'}</div>
            <div style={{ color: '#6b7280', fontSize: 14 }}>{fmtFone(c.phone)}{c.email ? ' · ' + c.email : ''}</div>
            <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{c.origin_store || ''} · Aniv. {fmtAniv(c)} · desde {new Date(c.created_at).toLocaleDateString('pt-BR')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={22} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          <Chip icon={<Star size={13} />} label={`${c.avaliacoes_count || 0} aval. · ${c.nota_media ? Number(c.nota_media).toFixed(1) : '–'}⭐`} />
          <Chip icon={<Gift size={13} />} label={`${c.premios_recebidos || 0} prêmios · ${c.premios_resgatados || 0} resgatados`} />
          <Chip icon={<MessageCircle size={13} />} label={c.consent_whatsapp && c.status !== 'opt_out' ? 'Marketing ✓' : 'Sem marketing'} color={c.consent_whatsapp && c.status !== 'opt_out' ? '#1D9E75' : '#9ca3af'} />
        </div>

        {/* tags + obs */}
        <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}><TagIcon size={13} /> Tags (separadas por vírgula)</label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="VIP, aniversariante, delivery..." style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 10, border: '1px solid #e5e7eb', margin: '4px 0 10px' }} />
        <label style={{ fontSize: 12, color: '#6b7280' }}>Observações internas</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} style={{ width: '100%', padding: '.5rem .7rem', borderRadius: 10, border: '1px solid #e5e7eb', margin: '4px 0 10px', resize: 'vertical', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button onClick={salvar} style={{ flex: 1, padding: '.6rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Salvar</button>
          <button onClick={optOut} title="LGPD — parar comunicações" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem .9rem', borderRadius: 10, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}><Ban size={15} />Opt-out</button>
        </div>

        {/* LGPD */}
        <div style={{ background: '#f9fafb', borderRadius: 12, padding: '.8rem .9rem', marginBottom: 18 }}>
          <b style={{ fontSize: 13 }}>🔒 Privacidade (LGPD)</b>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button onClick={copiarPriv} style={{ flex: 1, minWidth: 150, padding: '.5rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 12.5 }}>🔗 Copiar link do cliente</button>
            <button onClick={excluirLGPD} style={{ padding: '.5rem .8rem', borderRadius: 8, border: '1px solid #FCA5A5', background: '#fff', color: '#B91C1C', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>🗑️ Excluir dados</button>
          </div>
          {consents.length > 0 && <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 4 }}>Histórico de consentimentos</div>
            <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {consents.map(cc => <div key={cc.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4b5563' }}>
                <span>{cc.accepted ? '✅' : '🚫'} {CONSENT_LBL[cc.consent_type] || cc.consent_type} <span style={{ color: '#9ca3af' }}>· {cc.source || ''}</span></span>
                <span style={{ color: '#9ca3af' }}>{new Date(cc.accepted_at || cc.revoked_at).toLocaleDateString('pt-BR')}</span>
              </div>)}
            </div>
          </div>}
        </div>

        {/* prêmios */}
        <b style={{ fontSize: 14 }}>Prêmios & raspadinhas ({premios.length})</b>
        <div style={{ margin: '8px 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {premios.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma raspadinha ainda.</div> :
            premios.map(p => <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
              <span>{p.ganhou ? '🎁' : '🤞'} {p.premio_nome}{p.cupom ? <b style={{ marginLeft: 6, color: '#6B1212' }}>{p.cupom}</b> : ''}</span>
              <span style={{ color: p.status === 'resgatado' ? '#1D9E75' : '#9ca3af', fontWeight: 600 }}>{p.ganhou ? (p.status === 'resgatado' ? 'resgatado' : 'a resgatar') : '—'}</span>
            </div>)}
        </div>

        {/* avaliações */}
        <b style={{ fontSize: 14 }}>Avaliações ({avaliacoes.length})</b>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {avaliacoes.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma avaliação vinculada.</div> :
            avaliacoes.map(f => <div key={f.id} style={{ fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
              <div>{EXP[f.experiencia] || '❓'} <b>{f.loja}</b>{f.garcom ? ' · ' + f.garcom : ''} <span style={{ color: '#9ca3af' }}>· {new Date(f.created_at).toLocaleDateString('pt-BR')}</span></div>
              {f.observacoes && <div style={{ color: '#374151', fontStyle: 'italic', marginTop: 3 }}>💬 “{f.observacoes}”</div>}
            </div>)}
        </div>
      </div>
    </div>
  )
}

function Chip({ icon, label, color = '#6B1212' }: { icon: React.ReactNode; label: string; color?: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, background: color + '14', color, padding: '.35rem .7rem', borderRadius: 20, fontWeight: 600 }}>{icon}{label}</span>
}
