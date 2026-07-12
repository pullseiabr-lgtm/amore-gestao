import { useState, useEffect, useMemo, useCallback } from 'react'
import { Trophy, MessageSquare, QrCode, RefreshCw, AlertTriangle, TrendingUp, Plus, Trash2, ExternalLink, Download, ChefHat } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any
const FEEDBACK_URL = 'https://painel.amorefood.com.br/feedback.html'

const LOJAS = [
  { key: '', label: 'Todas as lojas' },
  { key: 'Amore Paiva', label: 'Amore Paiva', slug: 'paiva' },
  { key: 'Amore CD', label: 'Amore Costa Dourada', slug: 'cd' },
]
const slugLoja = (l: string) => (l === 'Amore CD' ? 'cd' : l === 'Amore Paiva' ? 'paiva' : l)
const EXP: Record<string, { v: number; e: string; l: string; c: string }> = {
  excelente: { v: 5, e: '😍', l: 'Excelente', c: '#10B981' },
  boa:       { v: 4, e: '🙂', l: 'Muito boa', c: '#84CC16' },
  regular:   { v: 3, e: '😐', l: 'Regular',   c: '#F59E0B' },
  ruim:      { v: 2, e: '🙁', l: 'Ruim',      c: '#F97316' },
  pessima:   { v: 1, e: '😡', l: 'Péssima',   c: '#EF4444' },
}
const qrImg = (data: string, size = 220) => `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=6&data=${encodeURIComponent(data)}`
const notaFb = (f: any) => { const n = [f.nota_atendimento, f.nota_comida, f.nota_agilidade].filter((x: any) => x != null); return n.length ? n.reduce((a: number, b: number) => a + b, 0) / n.length : (EXP[f.experiencia]?.v ?? 0) }

type Tab = 'dashboard' | 'ranking' | 'cozinha' | 'feedbacks' | 'garcons'

export default function AvaliacoesPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [loja, setLoja] = useState('')
  const [dias, setDias] = useState(30)
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [garcons, setGarcons] = useState<any[]>([])
  const [config, setConfig] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState<number>(() => Number(localStorage.getItem('amore_fb_meta') || 100))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [f, g, c] = await Promise.all([
        sb.from('feedbacks').select('*').order('created_at', { ascending: false }).limit(2000),
        sb.from('garcons').select('*').order('nome'),
        sb.from('fb_config').select('*'),
      ])
      setFeedbacks(f.data || []); setGarcons(g.data || []); setConfig(c.data || [])
    } catch { toast('Erro ao carregar avaliações.', 'error') }
    setLoading(false)
  }, [toast])

  useEffect(() => { load() }, [load])

  // Alerta em tempo real para notas baixas
  useEffect(() => {
    const ch = sb.channel('fb-alerts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feedbacks' }, (payload: any) => {
      const f = payload.new
      if (f && (f.experiencia === 'ruim' || f.experiencia === 'pessima' || f.voltaria === false)) {
        toast(`⚠️ Avaliação "${EXP[f.experiencia]?.l || f.experiencia}" — ${f.loja}${f.garcom ? ' · ' + f.garcom : ''}${f.mesa ? ' · Mesa ' + f.mesa : ''}`, 'error')
      }
      setFeedbacks(prev => [f, ...prev])
    }).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [toast])

  const fbFiltrado = useMemo(() => {
    const lim = Date.now() - dias * 864e5
    return feedbacks.filter(f => (!loja || f.loja === loja) && new Date(f.created_at).getTime() >= lim)
  }, [feedbacks, loja, dias])

  const kpi = useMemo(() => {
    const t = fbFiltrado.length
    const sat = fbFiltrado.filter(f => f.experiencia === 'excelente' || f.experiencia === 'boa').length
    const google = fbFiltrado.filter(f => f.foi_google).length
    const notaM = t ? fbFiltrado.reduce((a, f) => a + notaFb(f), 0) / t : 0
    const seteDias = Date.now() - 7 * 864e5
    const semana = feedbacks.filter(f => (!loja || f.loja === loja) && new Date(f.created_at).getTime() >= seteDias).length
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const googleMes = feedbacks.filter(f => (!loja || f.loja === loja) && f.foi_google && new Date(f.created_at) >= inicioMes).length
    const dist: Record<string, number> = {}
    fbFiltrado.forEach(f => { dist[f.experiencia] = (dist[f.experiencia] || 0) + 1 })
    const motivos: Record<string, number> = {}
    fbFiltrado.forEach(f => { if (f.motivo) motivos[f.motivo] = (motivos[f.motivo] || 0) + 1 })
    return {
      total: t, sat, google, notaM,
      pctSat: t ? Math.round((sat / t) * 100) : 0,
      convGoogle: sat ? Math.round((google / sat) * 100) : 0,
      semana, googleMes, dist,
      motivos: Object.entries(motivos).sort((a, b) => b[1] - a[1]),
    }
  }, [fbFiltrado, feedbacks, loja])

  const ranking = useMemo(() => {
    const m: Record<string, any> = {}
    fbFiltrado.forEach(f => {
      const g = f.garcom || '—'
      if (!m[g]) m[g] = { nome: g, n: 0, soma: 0, sat: 0, google: 0 }
      m[g].n++; m[g].soma += notaFb(f)
      if (f.experiencia === 'excelente' || f.experiencia === 'boa') m[g].sat++
      if (f.foi_google) m[g].google++
    })
    // Gamificação: +10 por avaliação no Google, +2 por avaliação satisfeita
    return Object.values(m).map((r: any) => ({ ...r, media: r.n ? r.soma / r.n : 0, pctSat: r.n ? Math.round((r.sat / r.n) * 100) : 0, pontos: r.google * 10 + r.sat * 2 }))
      .sort((a: any, b: any) => b.pontos - a.pontos || b.google - a.google || b.media - a.media)
  }, [fbFiltrado])

  // Cozinha: qualidade medida pela nota de "Comida" dos feedbacks (sem depender de PDV/prato)
  const cozinha = useMemo(() => {
    const comFood = fbFiltrado.filter(f => f.nota_comida != null)
    const t = comFood.length
    const media = t ? comFood.reduce((a, f) => a + f.nota_comida, 0) / t : 0
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    comFood.forEach(f => { dist[f.nota_comida] = (dist[f.nota_comida] || 0) + 1 })
    const baixa = comFood.filter(f => f.nota_comida <= 3).length
    const MOT_COZINHA = ['Qualidade do prato', 'Comida fria', 'Demora']
    const recFood: Record<string, number> = {}
    fbFiltrado.forEach(f => { if (MOT_COZINHA.includes(f.motivo)) recFood[f.motivo] = (recFood[f.motivo] || 0) + 1 })
    const porLoja = ['Amore Paiva', 'Amore CD'].map(l => {
      const arr = comFood.filter(f => f.loja === l)
      return { loja: l === 'Amore CD' ? 'Costa Dourada' : 'Paiva', n: arr.length, media: arr.length ? arr.reduce((a, f) => a + f.nota_comida, 0) / arr.length : null }
    })
    return { media, dist, total: t, baixa, pctBaixa: t ? Math.round((baixa / t) * 100) : 0, recFood: Object.entries(recFood).sort((a, b) => b[1] - a[1]), porLoja }
  }, [fbFiltrado])

  const alertas = useMemo(() => fbFiltrado.filter(f => f.experiencia === 'ruim' || f.experiencia === 'pessima' || f.voltaria === false), [fbFiltrado])

  const card: React.CSSProperties = { background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 14, padding: '1rem 1.2rem' }
  const kcard = (label: string, value: string | number, sub?: string, color = '#6B1212') => (
    <div style={{ ...card, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
  const tabBtn = (id: Tab, icon: React.ReactNode, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 500, background: tab === id ? '#6B1212' : 'transparent', color: tab === id ? '#fff' : '#6b7280' }}>{icon}{label}</button>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={loja} onChange={e => setLoja(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          {LOJAS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
        <select value={dias} onChange={e => setDias(Number(e.target.value))} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={3650}>Todo o período</option>
        </select>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem .9rem', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}><RefreshCw size={15} />Atualizar</button>
        {alertas.length > 0 && <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: '#FEF2F2', color: '#B91C1C', padding: '.5rem .9rem', borderRadius: 10, fontWeight: 600, fontSize: 13 }}><AlertTriangle size={16} />{alertas.length} alerta(s) de insatisfação</span>}
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18, background: '#f9fafb', padding: 6, borderRadius: 12, width: 'fit-content' }}>
        {tabBtn('dashboard', <TrendingUp size={16} />, 'Dashboard')}
        {tabBtn('ranking', <Trophy size={16} />, 'Ranking Garçons')}
        {tabBtn('cozinha', <ChefHat size={16} />, 'Cozinha')}
        {tabBtn('feedbacks', <MessageSquare size={16} />, 'Feedbacks')}
        {tabBtn('garcons', <QrCode size={16} />, 'Garçons & QR')}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> : <>

      {/* ===== DASHBOARD ===== */}
      {tab === 'dashboard' && <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {kcard('Avaliações', kpi.total, `${kpi.semana} nesta semana`)}
          {kcard('Nota média', kpi.notaM.toFixed(1) + ' ⭐', 'de 5,0', '#F59E0B')}
          {kcard('Satisfação', kpi.pctSat + '%', `${kpi.sat} satisfeitos`, '#10B981')}
          {kcard('Foram ao Google', kpi.google, `${kpi.convGoogle}% de conversão`, '#3B82F6')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...card, flex: 2, minWidth: 280 }}>
            <b style={{ fontSize: 14 }}>Distribuição das experiências</b>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.keys(EXP).map(k => {
                const n = kpi.dist[k] || 0; const pct = kpi.total ? Math.round((n / kpi.total) * 100) : 0
                return <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 90, fontSize: 13 }}>{EXP[k].e} {EXP[k].l}</span>
                  <div style={{ flex: 1, height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: EXP[k].c }} /></div>
                  <span style={{ width: 56, textAlign: 'right', fontSize: 13, color: '#6b7280' }}>{n} · {pct}%</span>
                </div>
              })}
            </div>
          </div>
          <div style={{ ...card, flex: 1, minWidth: 230 }}>
            <b style={{ fontSize: 14 }}>Meta do mês (Google)</b>
            <div style={{ fontSize: 34, fontWeight: 700, color: '#6B1212', marginTop: 8 }}>{kpi.googleMes}<span style={{ fontSize: 18, color: '#9ca3af' }}> / {meta}</span></div>
            <div style={{ height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden', margin: '8px 0' }}><div style={{ width: Math.min(100, meta ? (kpi.googleMes / meta) * 100 : 0) + '%', height: '100%', background: '#6B1212' }} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>Meta:
              <input type="number" value={meta} onChange={e => { const v = Number(e.target.value); setMeta(v); localStorage.setItem('amore_fb_meta', String(v)) }} style={{ width: 70, padding: '.3rem .5rem', borderRadius: 8, border: '1px solid #e5e7eb' }} /> avaliações
            </div>
            <div style={{ marginTop: 14 }}>
              <b style={{ fontSize: 13 }}>Principais reclamações</b>
              {kpi.motivos.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Nenhuma 🎉</div> :
                kpi.motivos.slice(0, 5).map(([m, n]) => <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 6 }}><span>{m}</span><b style={{ color: '#B91C1C' }}>{n as number}</b></div>)}
            </div>
          </div>
        </div>
      </>}

      {/* ===== RANKING ===== */}
      {tab === 'ranking' && <div style={card}>
        <b style={{ fontSize: 14 }}>Ranking de garçons — gamificação (+10 por avaliação Google, +2 por satisfeito)</b>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 14 }}>
          <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 12, textTransform: 'uppercase' }}>
            <th style={{ padding: 8 }}>#</th><th>Garçom</th><th>Avaliações</th><th>Nota média</th><th>Satisfação</th><th>Google</th><th>Pontos</th>
          </tr></thead>
          <tbody>
            {ranking.length === 0 ? <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Sem dados no período.</td></tr> :
              ranking.map((r: any, i: number) => <tr key={r.nome} style={{ borderTop: '1px solid #f3f4f6' }}>
                <td style={{ padding: 8 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td style={{ fontWeight: 600 }}>{r.nome}</td><td>{r.n}</td>
                <td>{r.media.toFixed(1)} ⭐</td><td>{r.pctSat}%</td>
                <td><b style={{ color: '#3B82F6' }}>{r.google}</b></td>
                <td><span style={{ background: '#FEF3C7', color: '#92400E', padding: '.15rem .55rem', borderRadius: 20, fontWeight: 700, fontSize: 13 }}>{r.pontos} pts</span></td>
              </tr>)}
          </tbody>
        </table>
      </div>}

      {/* ===== COZINHA (nota de Comida) ===== */}
      {tab === 'cozinha' && <>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {kcard('Nota da Comida', cozinha.media.toFixed(1) + ' ⭐', `${cozinha.total} avaliações`, '#F59E0B')}
          {kcard('Precisam de atenção', cozinha.pctBaixa + '%', `${cozinha.baixa} com nota ≤ 3`, '#EF4444')}
          {kcard('Satisfeitos c/ a comida', (cozinha.total - cozinha.baixa) + '', 'notas 4 e 5', '#10B981')}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ ...card, flex: 2, minWidth: 280 }}>
            <b style={{ fontSize: 14 }}>Notas da comida</b>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[5, 4, 3, 2, 1].map(s => {
                const n = cozinha.dist[s] || 0; const pct = cozinha.total ? Math.round((n / cozinha.total) * 100) : 0
                return <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 60, fontSize: 13 }}>{s} ⭐</span>
                  <div style={{ flex: 1, height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: pct + '%', height: '100%', background: s >= 4 ? '#10B981' : s === 3 ? '#F59E0B' : '#EF4444' }} /></div>
                  <span style={{ width: 56, textAlign: 'right', fontSize: 13, color: '#6b7280' }}>{n} · {pct}%</span>
                </div>
              })}
            </div>
            <div style={{ marginTop: 16 }}>
              <b style={{ fontSize: 13 }}>Comida por loja</b>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                {cozinha.porLoja.map(l => <div key={l.loja} style={{ flex: 1, background: '#f9fafb', borderRadius: 10, padding: '.7rem .9rem' }}>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{l.loja}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#6B1212' }}>{l.media != null ? l.media.toFixed(1) + ' ⭐' : '—'}</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{l.n} avaliações</div>
                </div>)}
              </div>
            </div>
          </div>
          <div style={{ ...card, flex: 1, minWidth: 230 }}>
            <b style={{ fontSize: 14, color: '#B91C1C' }}>Reclamações da cozinha</b>
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 10px' }}>Motivos ligados à comida/preparo.</p>
            {cozinha.recFood.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhuma reclamação 🎉</div> :
              cozinha.recFood.map(([m, n]) => <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '.4rem 0', borderBottom: '1px solid #f3f4f6' }}><span>{m}</span><b style={{ color: '#B91C1C' }}>{n as number}</b></div>)}
          </div>
        </div>
      </>}

      {/* ===== FEEDBACKS ===== */}
      {tab === 'feedbacks' && <div style={card}>
        <b style={{ fontSize: 14 }}>Feedbacks recebidos ({fbFiltrado.length})</b>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
          {fbFiltrado.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhum feedback no período.</div> :
            fbFiltrado.map(f => {
              const baixo = f.experiencia === 'ruim' || f.experiencia === 'pessima' || f.voltaria === false
              return <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '.7rem .9rem', borderRadius: 10, background: baixo ? '#FEF2F2' : '#f9fafb', border: baixo ? '1px solid #FCA5A5' : '1px solid transparent' }}>
                <span style={{ fontSize: 24 }}>{EXP[f.experiencia]?.e || '❓'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{EXP[f.experiencia]?.l || f.experiencia} <span style={{ fontWeight: 400, color: '#9ca3af' }}>· {f.loja}{f.garcom ? ' · ' + f.garcom : ''}{f.mesa ? ' · Mesa ' + f.mesa : ''}</span></div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    Atend. {f.nota_atendimento ?? '–'}⭐ · Comida {f.nota_comida ?? '–'}⭐ · Agil. {f.nota_agilidade ?? '–'}⭐
                    {f.voltaria === false && <span style={{ color: '#B91C1C', fontWeight: 600 }}> · não voltaria</span>}
                    {f.motivo && <span style={{ color: '#B91C1C' }}> · {f.motivo}</span>}
                    {f.foi_google && <span style={{ color: '#3B82F6' }}> · avaliou no Google ✓</span>}
                  </div>
                  {f.observacoes && <div style={{ fontSize: 13, color: '#374151', marginTop: 6, padding: '.5rem .7rem', background: '#fff', borderRadius: 8, borderLeft: '3px solid #6B1212', fontStyle: 'italic' }}>💬 “{f.observacoes}”</div>}
                </div>
                <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>{new Date(f.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            })}
        </div>
      </div>}

      {/* ===== GARÇONS & QR + CONFIG ===== */}
      {tab === 'garcons' && <GarconsTab garcons={garcons} config={config} reload={load} toast={toast} />}

      </>}
    </div>
  )
}

function GarconsTab({ garcons, config, reload, toast }: { garcons: any[]; config: any[]; reload: () => void; toast: (m: string, t?: any) => void }) {
  const [nome, setNome] = useState(''); const [lojaG, setLojaG] = useState('Amore Paiva')
  const add = async () => {
    if (!nome.trim()) { toast('Informe o nome do garçom.', 'error'); return }
    const { error } = await sb.from('garcons').insert({ nome: nome.trim(), loja: lojaG })
    if (error) { toast('Erro ao salvar.', 'error'); return }
    setNome(''); reload(); toast('Garçom cadastrado!')
  }
  const del = async (id: string) => { await sb.from('garcons').delete().eq('id', id); reload() }
  const salvarGoogle = async (l: string, url: string) => { await sb.from('fb_config').upsert({ loja: l, google_url: url }, { onConflict: 'loja' }); toast('Link do Google salvo!') }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.2rem' }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    {/* config Google */}
    <div style={card}>
      <b style={{ fontSize: 14 }}>Links de avaliação do Google (por loja)</b>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 12px' }}>Cole o link direto de avaliação de cada unidade (Google Meu Negócio → "Peça avaliações").</p>
      {['Amore Paiva', 'Amore CD'].map(l => {
        const cfg = config.find(c => c.loja === l)
        return <ConfigRow key={l} loja={l} label={l === 'Amore CD' ? 'Amore Costa Dourada' : l} url={cfg?.google_url || ''} onSave={salvarGoogle} />
      })}
    </div>

    {/* garçons */}
    <div style={card}>
      <b style={{ fontSize: 14 }}>Garçons — QR exclusivo por atendente</b>
      <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 12px' }}>Cada garçom tem um QR que já registra quem atendeu — permite ranking e bonificação por avaliação.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do garçom" style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb', flex: 1, minWidth: 160 }} />
        <select value={lojaG} onChange={e => setLojaG(e.target.value)} style={{ padding: '.55rem .8rem', borderRadius: 10, border: '1px solid #e5e7eb' }}>
          <option value="Amore Paiva">Amore Paiva</option><option value="Amore CD">Amore Costa Dourada</option>
        </select>
        <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.55rem 1rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer' }}><Plus size={16} />Adicionar</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {garcons.length === 0 ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Nenhum garçom cadastrado ainda.</div> :
          garcons.map(g => {
            const link = `${FEEDBACK_URL}?loja=${slugLoja(g.loja)}&g=${encodeURIComponent(g.nome)}`
            return <div key={g.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, textAlign: 'center' }}>
              <img src={qrImg(link, 180)} alt={g.nome} style={{ width: '100%', maxWidth: 160, aspectRatio: '1', margin: '0 auto', display: 'block' }} />
              <div style={{ fontWeight: 600, marginTop: 8 }}>{g.nome}</div>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>{g.loja === 'Amore CD' ? 'Costa Dourada' : 'Paiva'}</div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                <a href={qrImg(link, 600)} download={`QR_${g.nome}.png`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B1212', textDecoration: 'none' }}><Download size={13} />Baixar</a>
                <a href={link} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6b7280', textDecoration: 'none' }}><ExternalLink size={13} />Testar</a>
                <button onClick={() => del(g.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={14} /></button>
              </div>
            </div>
          })}
      </div>
    </div>
  </div>
}

function ConfigRow({ loja, label, url, onSave }: { loja: string; label: string; url: string; onSave: (l: string, u: string) => void }) {
  const [v, setV] = useState(url)
  useEffect(() => { setV(url) }, [url])
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
    <span style={{ width: 140, fontSize: 13, fontWeight: 500 }}>{label}</span>
    <input value={v} onChange={e => setV(e.target.value)} placeholder="https://g.page/... ou maps.app.goo.gl/..." style={{ flex: 1, minWidth: 220, padding: '.5rem .7rem', borderRadius: 10, border: '1px solid #e5e7eb' }} />
    <button onClick={() => onSave(loja, v)} style={{ padding: '.5rem .9rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontSize: 13 }}>Salvar</button>
  </div>
}
