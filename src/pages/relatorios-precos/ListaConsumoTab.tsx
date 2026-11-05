import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { Search, Download, Copy, ChevronDown, ChevronRight } from 'lucide-react'

const sb = supabase as any
const brl = (n: any) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qtdFmt = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const dataBR = (d?: string | null) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—')
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const LOGISTICA = new Set(['combustivel', 'pedagio'])
const LOJAS = ['Todas', 'Amore Paiva', 'Amore CD', 'Flow CD']
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1rem 1.2rem' }

type Compra = { data: string | null; caixa: string; caixaId: string; loja: string; fornecedor: string; qtd: number; un: string; valor: number; doc: string }
type Linha = { chave: string; nome: string; categoria: string; valor: number; nCompras: number; qtdPorUn: Record<string, number>; compras: Compra[] }

export default function ListaConsumoTab() {
  const [loja, setLoja] = useState('Todas')
  const [dias, setDias] = useState(30)
  const [cat, setCat] = useState('Todas')
  const [busca, setBusca] = useState('')
  const [comLogistica, setComLogistica] = useState(false)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<any[]>([])
  const [aberto, setAberto] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ini = iso(new Date(Date.now() - dias * 864e5))
      let q = sb.from('caixas').select('id,loja,titulo,data_ref').gte('data_ref', ini)
      if (loja !== 'Todas') q = q.eq('loja', loja)
      const { data: cx } = await q.limit(1000)
      const ids = (cx || []).map((c: any) => c.id)
      const mapa: Record<string, any> = {}; (cx || []).forEach((c: any) => { mapa[c.id] = c })
      const out: any[] = []
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await sb.from('caixa_itens').select('*').in('caixa_id', ids.slice(i, i + 100))
        ;(data || []).forEach((it: any) => out.push({ ...it, _caixa: mapa[it.caixa_id] }))
      }
      setRows(out)
    } catch { setRows([]) }
    setLoading(false)
  }, [loja, dias])
  useEffect(() => { load() }, [load])

  const categorias = useMemo(() => ['Todas', ...[...new Set(rows.map(r => r.categoria || 'Outros'))].sort()], [rows])

  const linhas: Linha[] = useMemo(() => {
    const m: Record<string, Linha> = {}
    rows.forEach(r => {
      const c = r.categoria || 'Outros'
      if (!comLogistica && LOGISTICA.has(norm(c))) return
      if (cat !== 'Todas' && c !== cat) return
      const nome = (r.descricao || 'Sem descrição').trim()
      if (busca && !norm(nome).includes(norm(busca))) return
      const chave = norm(nome)
      const l = (m[chave] = m[chave] || { chave, nome, categoria: c, valor: 0, nCompras: 0, qtdPorUn: {}, compras: [] })
      const qtd = Number(r.quantidade) || 0
      const un = (r.unidade || (qtd ? 'un' : '')) as string
      l.valor += Number(r.valor) || 0; l.nCompras += 1
      if (qtd > 0) l.qtdPorUn[un] = (l.qtdPorUn[un] || 0) + qtd
      l.compras.push({ data: r.data || r._caixa?.data_ref, caixa: r._caixa?.titulo || '—', caixaId: r.caixa_id, loja: r._caixa?.loja || '', fornecedor: r.fornecedor || '—', qtd, un, valor: Number(r.valor) || 0, doc: r.documento || '' })
    })
    Object.values(m).forEach(l => l.compras.sort((a, b) => String(b.data).localeCompare(String(a.data))))
    return Object.values(m).sort((a, b) => b.valor - a.valor)
  }, [rows, cat, busca, comLogistica])

  const porCategoria = useMemo(() => {
    const g: Record<string, Linha[]> = {}
    linhas.forEach(l => (g[l.categoria] = g[l.categoria] || []).push(l))
    return Object.entries(g).map(([c, ls]) => ({ c, ls, total: ls.reduce((s, l) => s + l.valor, 0) })).sort((a, b) => b.total - a.total)
  }, [linhas])

  const total = linhas.reduce((s, l) => s + l.valor, 0)
  const qtdTxt = (l: Linha) => { const e = Object.entries(l.qtdPorUn); return e.length ? e.map(([u, q]) => `${qtdFmt(q)} ${u}`).join(' + ') : '—' }
  const medio = (l: Linha) => { const e = Object.entries(l.qtdPorUn); if (e.length !== 1) return '—'; const v = l.compras.filter(c => c.qtd > 0).reduce((s, c) => s + c.valor, 0); return e[0][1] > 0 ? `${brl(v / e[0][1])}/${e[0][0]}` : '—' }
  const caixasUsadas = new Set(linhas.flatMap(l => l.compras.map(c => c.caixaId))).size

  const exportCsv = () => {
    const h = ['Categoria', 'Item', 'Quantidade', 'Valor total', 'Preço médio', 'Nº compras', 'Caixas (data · título · fornecedor · qtd · valor)']
    const linhasCsv = linhas.map(l => [l.categoria, l.nome, qtdTxt(l), l.valor.toFixed(2).replace('.', ','), medio(l), l.nCompras,
      l.compras.map(c => `${dataBR(c.data)} · ${c.caixa} · ${c.fornecedor} · ${c.qtd ? qtdFmt(c.qtd) + ' ' + c.un : 's/ qtd'} · ${brl(c.valor)}`).join(' | ')])
    const csv = [h, ...linhasCsv].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `lista-consumo-${loja.replace(/\s/g, '-')}-${dias}d.csv`; a.click()
  }
  const copiar = () => {
    const t = [`📋 *Lista de Consumo por Item* — ${loja} · últimos ${dias} dias`, `Total: ${brl(total)} · ${linhas.length} itens · ${caixasUsadas} caixas`, '']
    porCategoria.forEach(g => { t.push(`*${g.c}* (${brl(g.total)})`); g.ls.forEach(l => t.push(`• ${l.nome}: ${qtdTxt(l)} — ${brl(l.valor)} (${l.nCompras}x)`)); t.push('') })
    navigator.clipboard?.writeText(t.join('\n'))
  }

  const sel: React.CSSProperties = { padding: '.5rem .7rem', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, background: '#fff' }
  return (
    <div>
      <div style={{ ...card, marginBottom: 12 }}>
        <b style={{ fontSize: 15 }}>🧾 Lista de Consumo por Item</b>
        <p style={{ fontSize: 12.5, color: '#6b7280', margin: '4px 0 10px' }}>Tudo o que saiu pelos caixas das prestações de contas, somado por item — com os caixas de origem de cada compra.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={sel} value={loja} onChange={e => setLoja(e.target.value)}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          <select style={sel} value={dias} onChange={e => setDias(Number(e.target.value))}>{[7, 15, 30, 60, 90, 180].map(d => <option key={d} value={d}>Últimos {d} dias</option>)}</select>
          <select style={sel} value={cat} onChange={e => setCat(e.target.value)}>{categorias.map(c => <option key={c}>{c}</option>)}</select>
          <div style={{ position: 'relative' }}><Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: '#9ca3af' }} />
            <input style={{ ...sel, paddingLeft: 28 }} placeholder="Buscar item…" value={busca} onChange={e => setBusca(e.target.value)} /></div>
          <label style={{ fontSize: 12.5, color: '#4b5563', display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={comLogistica} onChange={e => setComLogistica(e.target.checked)} />incluir combustível/pedágio</label>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn bo" onClick={copiar} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Copy size={14} />Copiar</button>
            <button className="btn bo" onClick={exportCsv} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Download size={14} />CSV</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['Total consumido', brl(total)], ['Itens distintos', String(linhas.length)], ['Caixas de origem', String(caixasUsadas)]].map(([l, v]) =>
          <div key={l} style={{ ...card, flex: 1, minWidth: 150, padding: '.7rem 1rem' }}><div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>{l}</div><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>)}
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Carregando…</div>
        : !linhas.length ? <div style={{ ...card, textAlign: 'center', color: '#9ca3af' }}>Nenhum item de caixa no período/filtros.</div>
        : porCategoria.map(g => (
          <div key={g.c} style={{ ...card, marginBottom: 12, padding: 0, overflow: 'hidden' }}>
            <div style={{ background: '#f9fafb', padding: '.6rem 1.2rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13.5 }}><span>{g.c} · {g.ls.length} itens</span><span>{brl(g.total)} · {total ? ((g.total / total) * 100).toFixed(0) : 0}%</span></div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ color: '#6b7280', fontSize: 11.5, textAlign: 'left' }}>
                  <th style={{ padding: '.4rem 1.2rem' }}>Item</th><th>Quantidade</th><th>Preço médio</th><th>Compras</th><th style={{ textAlign: 'right', paddingRight: '1.2rem' }}>Valor</th></tr></thead>
                <tbody>{g.ls.map(l => {
                  const k = g.c + '|' + l.chave, open = aberto === k
                  return <Fragment key={k}>
                    <tr onClick={() => setAberto(open ? null : k)} style={{ cursor: 'pointer', borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '.5rem 1.2rem', fontWeight: 600 }}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {l.nome}</td>
                      <td>{qtdTxt(l)}</td><td>{medio(l)}</td><td>{l.nCompras}x</td>
                      <td style={{ textAlign: 'right', paddingRight: '1.2rem', fontWeight: 700 }}>{brl(l.valor)}</td></tr>
                    {open && <tr><td colSpan={5} style={{ background: '#fafafa', padding: '.5rem 1.2rem .8rem 2.2rem' }}>
                      <div style={{ fontSize: 11.5, color: '#6b7280', marginBottom: 4 }}>Caixas de origem</div>
                      {l.compras.map((c, i) => <div key={i} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12.5, padding: '3px 0', borderTop: i ? '1px dashed #e5e7eb' : 'none' }}>
                        <span style={{ minWidth: 70 }}>{dataBR(c.data)}</span>
                        <a href={`/caixa.html?id=${c.caixaId}`} target="_blank" rel="noreferrer" style={{ color: '#6B1212', fontWeight: 600 }}>{c.caixa}</a>
                        <span style={{ color: '#6b7280' }}>{c.loja}</span><span>{c.fornecedor}</span>
                        <span style={{ marginLeft: 'auto' }}>{c.qtd ? `${qtdFmt(c.qtd)} ${c.un}` : 's/ qtd'} · <b>{brl(c.valor)}</b></span></div>)}
                    </td></tr>}
                  </Fragment>
                })}</tbody>
              </table>
            </div>
          </div>))}
    </div>
  )
}
