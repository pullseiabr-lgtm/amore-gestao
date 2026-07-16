import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Users, SlidersHorizontal, RefreshCw, FileText, X, Plus, Trash2, Send, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'

const sb = supabase as any
const fmt = (n: any) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1rem 1.2rem' }
const LOJAS = ['Amore Paiva', 'Amore CD', 'Todas']
const TIPOS = [['completo', 'Completo'], ['compras', 'Compras (preços)'], ['financeiro', 'Financeiro (impacto)'], ['auditoria', 'Auditoria'], ['executivo', 'Diretoria (resumo)'], ['estoque', 'Estoque']]
const CRIT = [['atencao', 'Atenção+'], ['alerta', 'Alerta+'], ['critico', 'Só crítico'], ['estavel', 'Tudo']]
const STAT: Record<string, { l: string; c: string; e: string }> = {
  reducao: { l: 'Redução', c: '#1D9E75', e: '🟢' }, estavel: { l: 'Estável', c: '#2563EB', e: '🔵' },
  atencao: { l: 'Atenção', c: '#D97706', e: '🟡' }, alerta: { l: 'Alerta', c: '#EA580C', e: '🟠' },
  critico: { l: 'Crítico', c: '#DC2626', e: '🔴' }, sem_historico: { l: 'Sem histórico', c: '#9ca3af', e: '⚪' },
}

export default function RelatoriosPrecosPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<'relatorios' | 'destinatarios' | 'regras'>('relatorios')
  const [caixas, setCaixas] = useState<any[]>([])
  const [dests, setDests] = useState<any[]>([])
  const [regras, setRegras] = useState<any>(null)
  const [rel, setRel] = useState<any | null>(null)
  const [editItens, setEditItens] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, d, r] = await Promise.all([
        sb.from('caixas').select('id,loja,titulo,data_ref,total,qtd_itens').order('data_ref', { ascending: false }).limit(60),
        sb.from('rel_destinatarios').select('*').order('created_at', { ascending: false }),
        sb.from('rel_regras').select('*').eq('id', 1).maybeSingle(),
      ])
      setCaixas(c.data || []); setDests(d.data || []); setRegras(r.data || {})
    } catch { toast('Erro ao carregar (verifique login).', 'error') }
    setLoading(false)
  }, [toast])
  useEffect(() => { load() }, [load])

  const gerar = async (caixa: any) => {
    const { data, error } = await sb.rpc('rel_gerar_caixa', { p_caixa_id: caixa.id })
    if (error || !data || data.erro) { toast('Erro ao gerar relatório.', 'error'); return }
    setRel({ ...data, caixa })
  }

  const tabBtn = (id: any, icon: any, label: string) => (
    <button onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1rem', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, background: tab === id ? '#6B1212' : 'transparent', color: tab === id ? '#fff' : '#6b7280' }}>{icon}{label}</button>
  )

  return (
    <div style={{ padding: '1rem 0' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16, background: '#f9fafb', padding: 6, borderRadius: 12, width: 'fit-content' }}>
        {tabBtn('relatorios', <BarChart3 size={16} />, 'Relatórios de Preços')}
        {tabBtn('destinatarios', <Users size={16} />, 'Destinatários')}
        {tabBtn('regras', <SlidersHorizontal size={16} />, 'Regras & Limites')}
        <button onClick={load} style={{ padding: '.6rem', border: 'none', borderRadius: 10, cursor: 'pointer', background: 'transparent', color: '#6b7280' }}><RefreshCw size={15} /></button>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> : <>
        {tab === 'relatorios' && <div style={card}>
          <b style={{ fontSize: 14 }}>Caixas — gere o relatório comparativo de preços</b>
          <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 12px' }}>Compara cada produto com as últimas 3 compras da loja e classifica ABC. Clique para gerar/ver.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 10 }}>
            {caixas.map(c => (
              <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.titulo}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 8px' }}>{c.loja} · {new Date(c.data_ref).toLocaleDateString('pt-BR')} · {fmt(c.total)} · {c.qtd_itens} itens</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => gerar(c)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.45rem .8rem', borderRadius: 8, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}><FileText size={14} />Relatório</button>
                  <button onClick={() => setEditItens(c)} title="Preencher quantidade e unidade para comparar por unidade" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.45rem .8rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>⚖️ Itens</button>
                </div>
              </div>
            ))}
          </div>
        </div>}

        {tab === 'destinatarios' && <DestinatariosTab dests={dests} reload={load} toast={toast} />}
        {tab === 'regras' && <RegrasTab regras={regras} reload={load} toast={toast} />}
      </>}

      {rel && <RelatorioModal rel={rel} dests={dests} onClose={() => setRel(null)} toast={toast} />}
      {editItens && <ItensEditorModal caixa={editItens} onClose={() => { setEditItens(null); load() }} toast={toast} />}
    </div>
  )
}

const UNIDADES = ['', 'kg', 'g', 'L', 'ml', 'un', 'cx', 'pct', 'dz']
function ItensEditorModal({ caixa, onClose, toast }: any) {
  const [itens, setItens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [sug, setSug] = useState<any[] | null>(null)
  const [ocr, setOcr] = useState(false)
  const loadItens = async () => { const { data } = await sb.from('caixa_itens').select('*').eq('caixa_id', caixa.id).order('created_at'); setItens(data || []); setLoading(false) }
  useEffect(() => { loadItens() }, [caixa.id])
  const up = (i: number, k: string, v: any) => setItens(arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))

  const lerNotas = async () => {
    setOcr(true); setSug(null)
    try {
      const resp = await fetch('/api/ocr-caixa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caixa_id: caixa.id }) })
      const d = await resp.json()
      if (!resp.ok) { toast(d.error || 'Erro na leitura por IA.', 'error'); setOcr(false); return }
      setSug(d.itens || [])
      toast(`IA leu ${d.total || 0} item(ns) das notas. Confira e adicione. 🔍`)
    } catch { toast('Falha ao chamar a IA.', 'error') }
    setOcr(false)
  }
  const addSug = async (s: any, all = false) => {
    const rows = (all ? sug! : [s]).map(x => ({ caixa_id: caixa.id, descricao: x.produto, quantidade: x.quantidade ?? null, unidade: x.unidade || null, conteudo: x.conteudo || 1, marca: x.marca || null, fornecedor: x.fornecedor || null, valor: x.valor_total ?? 0, data: caixa.data_ref }))
    await sb.from('caixa_itens').insert(rows)
    await loadItens()
    setSug(all ? [] : sug!.filter(x => x !== s))
    toast(all ? 'Itens da IA adicionados!' : 'Item adicionado!')
  }
  const delItem = async (id: string) => { await sb.from('caixa_itens').delete().eq('id', id); loadItens() }
  const precoUnit = (it: any) => {
    const q = Number(it.quantidade), u = (it.unidade || '').toLowerCase(), cont = Number(it.conteudo) || 1
    if (!q || !u) return null
    const f: any = { g: 0.001, ml: 0.001, kg: 1, l: 1, un: 1, dz: 12, cx: cont, pct: cont }
    const qb = q * (f[u] ?? 1); if (!qb) return null
    const base = ['kg', 'g'].includes(u) ? 'kg' : ['l', 'ml'].includes(u) ? 'L' : 'un'
    return { v: (Number(it.valor) / qb), base }
  }
  const salvar = async () => {
    for (const it of itens) {
      await sb.from('caixa_itens').update({ descricao: it.descricao, quantidade: it.quantidade ? Number(it.quantidade) : null, unidade: it.unidade || null, conteudo: Number(it.conteudo) || 1, marca: it.marca || null, fornecedor: it.fornecedor || null, valor: Number(it.valor) }).eq('id', it.id)
    }
    toast('Itens salvos! Agora o relatório compara por unidade. ✅'); onClose()
  }
  const inp: React.CSSProperties = { padding: '.35rem .5rem', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12.5, width: '100%' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(880px,100%)', background: '#fff', borderRadius: 16, padding: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <b style={{ fontSize: 16 }}>⚖️ Itens — {caixa.titulo}</b>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={22} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 10px' }}>Preencha <b>quantidade + unidade</b> (e conteúdo, para caixa/pacote) para comparar por unidade padronizada. O preço unitário é calculado sozinho.</p>
        <button onClick={lerNotas} disabled={ocr} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '.5rem .9rem', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>🔍 {ocr ? 'Lendo as notas com IA…' : 'Ler notas com IA (preencher automático)'}</button>
        {loading ? <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div> :
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 760 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: 6 }}>Descrição</th><th>Qtd</th><th>Unid.</th><th>Conteúdo</th><th>Marca</th><th>Fornecedor</th><th>Valor</th><th>Preço unit.</th><th></th>
              </tr></thead>
              <tbody>
                {itens.map((it, i) => { const pu = precoUnit(it); return (
                  <tr key={it.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 4, minWidth: 160 }}><input style={inp} value={it.descricao || ''} onChange={e => up(i, 'descricao', e.target.value)} /></td>
                    <td style={{ width: 70 }}><input style={inp} type="number" step="0.01" value={it.quantidade ?? ''} onChange={e => up(i, 'quantidade', e.target.value)} /></td>
                    <td style={{ width: 70 }}><select style={inp} value={it.unidade || ''} onChange={e => up(i, 'unidade', e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u || '—'}</option>)}</select></td>
                    <td style={{ width: 70 }}><input style={inp} type="number" step="1" value={it.conteudo ?? 1} onChange={e => up(i, 'conteudo', e.target.value)} disabled={!['cx', 'pct'].includes((it.unidade || '').toLowerCase())} /></td>
                    <td style={{ width: 90 }}><input style={inp} value={it.marca || ''} onChange={e => up(i, 'marca', e.target.value)} /></td>
                    <td style={{ width: 110 }}><input style={inp} value={it.fornecedor || ''} onChange={e => up(i, 'fornecedor', e.target.value)} /></td>
                    <td style={{ width: 80 }}><input style={inp} type="number" step="0.01" value={it.valor ?? ''} onChange={e => up(i, 'valor', e.target.value)} /></td>
                    <td style={{ width: 90, fontWeight: 700, color: pu ? '#1D9E75' : '#9ca3af' }}>{pu ? 'R$ ' + pu.v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '/' + pu.base : '—'}</td>
                    <td><button onClick={() => delItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={13} /></button></td>
                  </tr>) })}
              </tbody>
            </table>
          </div>}
        {sug && sug.length > 0 && <div style={{ marginTop: 14, background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 12, padding: '.9rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b style={{ fontSize: 13.5, color: '#6D28D9' }}>🔍 Sugestões da IA — confira e adicione ({sug.length})</b>
            <button onClick={() => addSug(null, true)} style={{ padding: '.35rem .8rem', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Adicionar todos</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sug.map((s, i) => <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: '#fff', padding: '.45rem .6rem', borderRadius: 8 }}>
              <div style={{ flex: 1 }}><b>{s.produto}</b> <span style={{ color: '#9ca3af' }}>· {s.quantidade ?? '?'} {s.unidade || ''}{s.marca ? ' · ' + s.marca : ''}{s.fornecedor ? ' · ' + s.fornecedor : ''} · {fmt(s.valor_total)}</span></div>
              {s.confianca != null && <span style={{ fontSize: 11, fontWeight: 700, color: s.confianca >= 85 ? '#1D9E75' : s.confianca >= 60 ? '#D97706' : '#DC2626' }}>{s.confianca}%</span>}
              <button onClick={() => addSug(s)} style={{ padding: '.3rem .7rem', borderRadius: 7, border: '1px solid #7C3AED', background: '#fff', color: '#7C3AED', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>+ Usar</button>
            </div>)}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>⚠️ Revise antes de adicionar — a IA pode errar. Itens de baixa confiança precisam de conferência manual.</p>
        </div>}

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={salvar} style={{ padding: '.7rem 1.6rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Salvar itens</button>
        </div>
      </div>
    </div>
  )
}

function RelatorioModal({ rel, dests, onClose, toast }: any) {
  const r = rel.resumo || {}; const itens: any[] = rel.itens || []
  const comVar = itens.filter(i => i.var_anterior != null)
  const topAum = [...comVar].filter(i => i.var_anterior > 0).sort((a, b) => b.var_anterior - a.var_anterior).slice(0, 5)
  const topRed = [...comVar].filter(i => i.var_anterior < 0).sort((a, b) => a.var_anterior - b.var_anterior).slice(0, 5)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    setEnviando(true)
    try {
      const { data } = await sb.rpc('rel_enfileirar', { p_caixa_id: rel.caixa.id })
      toast(`${data || 0} envio(s) na fila. O worker despacha no WhatsApp. 📲`)
    } catch { toast('Erro ao enfileirar envio.', 'error') }
    setEnviando(false)
  }

  const kpi = (l: string, v: any, c = '#6B1212') => <div style={{ background: '#f9fafb', borderRadius: 10, padding: '.6rem .8rem', textAlign: 'center', flex: 1, minWidth: 90 }}><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div><div style={{ fontSize: 11, color: '#9ca3af' }}>{l}</div></div>

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 60, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '3vh 1rem', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(760px,100%)', background: '#fff', borderRadius: 16, padding: '1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div><b style={{ fontSize: 16 }}>📊 Relatório de Preços — {r.loja}</b><div style={{ fontSize: 12, color: '#9ca3af' }}>{r.titulo} · {r.numero ? 'Caixa nº ' + r.numero + ' · ' : ''}{r.data ? new Date(r.data).toLocaleDateString('pt-BR') : ''}</div></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={22} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {kpi('Valor total', fmt(r.valor_total))}
          {kpi('Produtos', r.qtd_produtos)}
          {kpi('Aumentos', r.aumentos, '#DC2626')}
          {kpi('Reduções', r.reducoes, '#1D9E75')}
          {kpi('Sem histórico', r.sem_historico, '#9ca3af')}
          {kpi('Impacto aumentos', fmt(r.impacto_aumentos), '#DC2626')}
          {kpi('Economia', fmt(r.economia), '#1D9E75')}
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11.5, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Produto</th><th>ABC</th><th>Atual</th><th>Anterior</th><th>Média 3</th><th>Variação</th><th>Impacto</th><th>Status</th>
            </tr></thead>
            <tbody>
              {itens.map((i, idx) => { const s = STAT[i.status] || STAT.sem_historico; const uni = (v: any) => v == null ? '—' : (i.por_unidade ? fmt(v) + '/' + i.un_base : fmt(v)); return (
                <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, fontWeight: 500 }}>{i.produto}{i.por_unidade && <span style={{ fontSize: 10.5, color: '#1D9E75', marginLeft: 5 }}>⚖️ un.</span>}</td>
                  <td><span style={{ fontWeight: 700, color: i.classe === 'A' ? '#DC2626' : i.classe === 'B' ? '#D97706' : '#6b7280' }}>{i.classe}</span></td>
                  <td>{uni(i.atual)}</td>
                  <td style={{ color: '#9ca3af' }}>{uni(i.anterior)}</td>
                  <td style={{ color: '#9ca3af' }}>{uni(i.media3)}</td>
                  <td style={{ fontWeight: 600, color: s.c }}>{i.var_anterior != null ? (i.var_anterior > 0 ? '+' : '') + i.var_anterior + '%' : '—'}</td>
                  <td style={{ fontWeight: 600, color: i.impacto > 0 ? '#DC2626' : i.impacto < 0 ? '#1D9E75' : '#9ca3af' }}>{i.impacto ? (i.impacto > 0 ? '+' : '') + fmt(i.impacto) : '—'}</td>
                  <td><span style={{ fontSize: 12, fontWeight: 600, color: s.c }}>{s.e} {s.l}</span></td>
                </tr>) })}
            </tbody>
          </table>
        </div>

        {(topAum.length > 0 || topRed.length > 0) && <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          {topAum.length > 0 && <div style={{ flex: 1, minWidth: 220, background: '#FEF2F2', borderRadius: 10, padding: '.7rem .9rem' }}>
            <b style={{ fontSize: 12.5, color: '#B91C1C', display: 'flex', alignItems: 'center', gap: 4 }}><TrendingUp size={14} />Maiores aumentos</b>
            {topAum.map((i, k) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}><span>{i.produto}</span><b style={{ color: '#DC2626' }}>+{i.var_anterior}%</b></div>)}
          </div>}
          {topRed.length > 0 && <div style={{ flex: 1, minWidth: 220, background: '#ECFDF5', borderRadius: 10, padding: '.7rem .9rem' }}>
            <b style={{ fontSize: 12.5, color: '#1D7A54', display: 'flex', alignItems: 'center', gap: 4 }}><TrendingDown size={14} />Maiores reduções</b>
            {topRed.map((i, k) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 4 }}><span>{i.produto}</span><b style={{ color: '#1D9E75' }}>{i.var_anterior}%</b></div>)}
          </div>}
        </div>}

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={enviar} disabled={enviando || dests.filter((d: any) => d.ativo).length === 0} title={dests.filter((d: any) => d.ativo).length === 0 ? 'Cadastre destinatários primeiro' : ''} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.7rem 1.4rem', borderRadius: 10, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: dests.filter((d: any) => d.ativo).length === 0 ? .5 : 1 }}><Send size={16} />{enviando ? 'Enfileirando…' : 'Enviar aos destinatários'}</button>
        </div>
      </div>
    </div>
  )
}

function DestinatariosTab({ dests, reload, toast }: any) {
  const vazio = { nome: '', cargo: '', setor: '', unidade: 'Amore Paiva', whatsapp: '', email: '', tipo_relatorio: 'completo', criticidade_min: 'atencao', ativo: true }
  const [f, setF] = useState<any>(vazio)
  const up = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const salvar = async () => {
    if (!f.nome.trim() || !f.whatsapp.trim()) { toast('Nome e WhatsApp são obrigatórios.', 'error'); return }
    const { error } = await sb.from('rel_destinatarios').insert({ ...f, whatsapp: f.whatsapp.replace(/\D/g, '') })
    if (error) { toast('Erro ao salvar.', 'error'); return }
    setF(vazio); reload(); toast('Destinatário cadastrado!')
  }
  const del = async (id: string) => { await sb.from('rel_destinatarios').delete().eq('id', id); reload() }
  const toggle = async (d: any) => { await sb.from('rel_destinatarios').update({ ativo: !d.ativo }).eq('id', d.id); reload() }
  const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={card}>
      <b style={{ fontSize: 14 }}>Novo destinatário</b>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 8, marginTop: 10 }}>
        <input style={inp} placeholder="Nome*" value={f.nome} onChange={e => up('nome', e.target.value)} />
        <input style={inp} placeholder="Cargo" value={f.cargo} onChange={e => up('cargo', e.target.value)} />
        <input style={inp} placeholder="WhatsApp*" value={f.whatsapp} onChange={e => up('whatsapp', e.target.value)} />
        <select style={inp} value={f.unidade} onChange={e => up('unidade', e.target.value)}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
        <select style={inp} value={f.tipo_relatorio} onChange={e => up('tipo_relatorio', e.target.value)}>{TIPOS.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
        <select style={inp} value={f.criticidade_min} onChange={e => up('criticidade_min', e.target.value)}>{CRIT.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select>
      </div>
      <button onClick={salvar} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '.5rem 1rem', borderRadius: 8, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}><Plus size={15} />Adicionar</button>
    </div>
    <div style={card}>
      <b style={{ fontSize: 14 }}>Destinatários ({dests.length})</b>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {dests.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum destinatário ainda.</div> :
          dests.map((d: any) => <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8 }}>
            <div style={{ flex: 1 }}><b>{d.nome}</b> <span style={{ color: '#9ca3af' }}>· {d.cargo || '—'} · {d.unidade} · {TIPOS.find(t => t[0] === d.tipo_relatorio)?.[1]}</span></div>
            <span style={{ color: '#6b7280' }}>{d.whatsapp}</span>
            <button onClick={() => toggle(d)} style={{ fontSize: 11, fontWeight: 700, border: 'none', borderRadius: 20, padding: '2px 8px', cursor: 'pointer', background: d.ativo ? '#ECFDF5' : '#f3f4f6', color: d.ativo ? '#1D7A54' : '#9ca3af' }}>{d.ativo ? 'ativo' : 'inativo'}</button>
            <button onClick={() => del(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={14} /></button>
          </div>)}
      </div>
    </div>
  </div>
}

function RegrasTab({ regras, reload, toast }: any) {
  const [r, setR] = useState<any>(regras || {})
  useEffect(() => { setR(regras || {}) }, [regras])
  const salvar = async () => {
    await sb.from('rel_regras').update({ t_atencao: Number(r.t_atencao), t_alerta: Number(r.t_alerta), t_critico: Number(r.t_critico), curva_a_fator: Number(r.curva_a_fator), updated_at: new Date().toISOString() }).eq('id', 1)
    toast('Regras salvas!'); reload()
  }
  const row = (label: string, k: string, sufixo = '%') => <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '.5rem 0', borderTop: '1px solid #f3f4f6' }}>
    <div style={{ flex: 1, fontSize: 13.5 }}>{label}</div>
    <input type="number" step="0.5" value={r[k] ?? ''} onChange={e => setR((p: any) => ({ ...p, [k]: e.target.value }))} style={{ width: 90, padding: '.4rem .6rem', borderRadius: 8, border: '1px solid #e5e7eb', textAlign: 'right' }} /><span style={{ color: '#9ca3af', width: 16 }}>{sufixo}</span>
  </div>
  return <div style={{ ...card, maxWidth: 520 }}>
    <b style={{ fontSize: 14 }}>Limites de variação de preço</b>
    <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '4px 0 6px' }}>Define quando um aumento vira Atenção, Alerta ou Crítico. Produtos Curva A usam limites mais rígidos.</p>
    {row('🟡 Atenção — aumento acima de', 't_atencao')}
    {row('🟠 Alerta — aumento acima de', 't_alerta')}
    {row('🔴 Crítico — aumento acima de', 't_critico')}
    {row('Curva A — fator de rigidez (0,5 = metade)', 'curva_a_fator', '×')}
    <button onClick={salvar} style={{ marginTop: 12, padding: '.6rem 1.4rem', borderRadius: 10, border: 'none', background: '#6B1212', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Salvar regras</button>
  </div>
}
