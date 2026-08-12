import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Search, TrendingUp, TrendingDown, X, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'
import { fetchTodosCaixaItens, fetchEstoqueProdutos, fetchEstoqueMovimentacoesRange } from '../../lib/db'

const sb = supabase as any
const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const ddmm = (d?: string | null) => d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '—'
const STOP = new Set(['de','da','do','com','sem','para','e','a','o','kg','g','gr','ml','l','un','und','unid','unidade','unidades','litro','grama'])
const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const isSize = (t: string) => /^\d+([.,]\d+)?(kg|kgs|g|gr|mg|ml|l|lt|un|und|cx|pc|pct)$/.test(t)
const tok = (s?: string | null) => norm(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t) && !isSize(t))
const keyOf = (s?: string | null) => [...new Set(tok(s))].sort().join(' ')
const parseDoc = (d?: string | null) => { const m = (d || '').match(/unit\s+([\d.]+)/); return m ? parseFloat(m[1]) : null }

type Fonte = { data: string | null; unit: number; tipo: 'compra' | 'cotacao'; forn: string | null }
type Prod = { key: string; nome: string; atual: number; menor: number; maior: number; medio: number; ultimo: number; nComp: number; nCot: number; fontes: Fonte[]; consumo: number; custo: number; gasto: number }

export default function CustosPage() {
  const { loja } = useLoja()
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'tudo'>('mes')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<'custo' | 'gasto' | 'nome'>('custo')
  const [loading, setLoading] = useState(true)
  const [caixaItens, setCaixaItens] = useState<any[]>([])
  const [produtos, setProdutos] = useState<any[]>([])
  const [saidas, setSaidas] = useState<any[]>([])
  const [cot, setCot] = useState<{ nome: string; preco: number; data: string | null; forn: string | null }[]>([])
  const [sel, setSel] = useState<Prod | null>(null)

  const [ini, fim] = useMemo(() => {
    const h = new Date(); h.setHours(0, 0, 0, 0)
    if (periodo === 'semana') { const d = new Date(h); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return [iso(d), iso(h)] }
    if (periodo === 'mes') return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)]
    return ['2020-01-01', iso(h)]
  }, [periodo])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ci, pr, mv] = await Promise.all([
        fetchTodosCaixaItens(loja).catch(() => []),
        fetchEstoqueProdutos(loja).catch(() => []),
        fetchEstoqueMovimentacoesRange(loja, ini, fim).catch(() => []),
      ])
      // cotações respondidas (preço)
      const { data: ci2 } = await sb.from('requisicao_cotacao_itens').select('preco_unitario,item_id,created_at,cotacao_id').gt('preco_unitario', 0).limit(5000)
      const itemIds = [...new Set((ci2 || []).map((x: any) => x.item_id))]
      let reqNome: Record<string, string> = {}, cotForn: Record<string, string> = {}
      if (itemIds.length) { const { data: ri } = await sb.from('requisicao_itens').select('id,produto_nome').in('id', itemIds); (ri || []).forEach((r: any) => reqNome[r.id] = r.produto_nome) }
      const cotIds = [...new Set((ci2 || []).map((x: any) => x.cotacao_id).filter(Boolean))]
      if (cotIds.length) { const { data: rc } = await sb.from('requisicao_cotacoes').select('id,fornecedor_nome').in('id', cotIds); (rc || []).forEach((r: any) => cotForn[r.id] = r.fornecedor_nome) }
      const cots = (ci2 || []).map((x: any) => ({ nome: reqNome[x.item_id], preco: Number(x.preco_unitario), data: x.created_at, forn: cotForn[x.cotacao_id] || null })).filter((x: any) => x.nome)
      setCaixaItens(ci); setProdutos(pr); setSaidas((mv || []).filter((m: any) => m.tipo === 'saida')); setCot(cots)
    } catch { /* noop */ }
    setLoading(false)
  }, [loja, ini, fim])
  useEffect(() => { load() }, [load])

  const produtosCusto = useMemo<Prod[]>(() => {
    const m: Record<string, Prod> = {}
    const get = (nome: string) => { const k = keyOf(nome); if (!k) return null; if (!m[k]) m[k] = { key: k, nome, atual: 0, menor: 0, maior: 0, medio: 0, ultimo: 0, nComp: 0, nCot: 0, fontes: [], consumo: 0, custo: 0, gasto: 0 }; return m[k] }
    caixaItens.forEach((i: any) => { const p = get(i.descricao); if (!p) return; const u = Number(i.preco_unit) > 0 ? Number(i.preco_unit) : (parseDoc(i.documento) || (Number(i.quantidade) > 0 ? Number(i.valor) / Number(i.quantidade) : 0)); if (u > 0) { p.fontes.push({ data: i.data, unit: Math.round(u * 100) / 100, tipo: 'compra', forn: i.fornecedor }); p.nComp++ } p.gasto += Number(i.valor) || 0 })
    cot.forEach(c => { const p = get(c.nome); if (!p) return; p.fontes.push({ data: c.data, unit: Math.round(c.preco * 100) / 100, tipo: 'cotacao', forn: c.forn }); p.nCot++ })
    // preço atual (referência do estoque) + consumo
    const precoAtual: Record<string, number> = {}, nomeCat: Record<string, string> = {}
    produtos.forEach((p: any) => { const k = keyOf(p.nome); if (k) { if (!precoAtual[k] || (Number(p.preco_unitario) > 0 && Number(p.preco_unitario) < precoAtual[k])) precoAtual[k] = Number(p.preco_unitario) || precoAtual[k] || 0; nomeCat[k] = p.nome } })
    saidas.forEach((s: any) => { const p = get(s.produto_nome); if (p) p.consumo += Number(s.quantidade) || 0 })
    return Object.values(m).map(p => {
      const us = p.fontes.map(f => f.unit).filter(u => u > 0)
      p.menor = us.length ? Math.min(...us) : 0
      p.maior = us.length ? Math.max(...us) : 0
      p.medio = us.length ? us.reduce((a, b) => a + b, 0) / us.length : 0
      const ord = [...p.fontes].filter(f => f.data).sort((a, b) => (a.data! < b.data! ? 1 : -1))
      p.ultimo = ord[0]?.unit || 0
      p.atual = precoAtual[p.key] || p.menor || p.ultimo || 0
      if (nomeCat[p.key]) p.nome = nomeCat[p.key]
      p.custo = p.consumo * (p.atual || p.medio)
      return p
    }).filter(p => p.fontes.length > 0 || p.consumo > 0)
  }, [caixaItens, cot, produtos, saidas])

  const filtrados = useMemo(() => {
    let arr = produtosCusto.filter(p => !busca || norm(p.nome).includes(norm(busca)))
    arr = arr.sort((a, b) => ordem === 'nome' ? a.nome.localeCompare(b.nome) : ordem === 'gasto' ? b.gasto - a.gasto : (b.custo - a.custo) || (b.gasto - a.gasto))
    return arr
  }, [produtosCusto, busca, ordem])

  const totCusto = produtosCusto.reduce((s, p) => s + p.custo, 0)
  const totGasto = produtosCusto.reduce((s, p) => s + p.gasto, 0)

  const th: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '6px 8px' }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#6B1212,#8a2a2a)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Wallet size={22} />
        <div style={{ flex: 1, minWidth: 180 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>💰 Custo por Produto</h2><div style={{ fontSize: 12.5, opacity: .85 }}>Preço médio · menor · maior · último — de compras e cotações · {loja}</div></div>
        <button className="btn bo" onClick={load} style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff', padding: '8px 11px' }}><RefreshCw size={15} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
        <div className="card" style={{ padding: '10px 14px', borderLeft: '4px solid #EA580C' }}><div style={{ fontSize: 20, fontWeight: 800, color: '#EA580C' }}>{brl(totCusto)}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Custo de consumo ({periodo})</div></div>
        <div className="card" style={{ padding: '10px 14px', borderLeft: '4px solid #2563EB' }}><div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB' }}>{brl(totGasto)}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Gasto em compras (total)</div></div>
        <div className="card" style={{ padding: '10px 14px', borderLeft: '4px solid #15803D' }}><div style={{ fontSize: 20, fontWeight: 800, color: '#15803D' }}>{produtosCusto.length}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Produtos com histórico de preço</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto…" style={{ width: '100%', padding: '8px 8px 8px 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
          {([['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']] as const).map(([v, l]) => <button key={v} className="btn" onClick={() => setPeriodo(v)} style={{ padding: '5px 10px', fontSize: 12, border: 'none', background: periodo === v ? 'var(--bordo)' : 'transparent', color: periodo === v ? '#fff' : 'var(--text)' }}>{l}</button>)}
        </div>
        <select value={ordem} onChange={e => setOrdem(e.target.value as any)} style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5 }}>
          <option value="custo">Ordenar: maior custo</option><option value="gasto">Ordenar: maior gasto</option><option value="nome">Ordenar: nome</option>
        </select>
        {loading && <span style={{ fontSize: 12, color: 'var(--muted)' }}>carregando…</span>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
            <thead><tr style={{ background: 'var(--bordo-bg)' }}>
              <th style={{ ...th, textAlign: 'left' }}>Produto</th><th style={th}>Preço atual</th><th style={th}>Menor</th><th style={th}>Médio</th><th style={th}>Maior</th><th style={th}>Últ. compra</th><th style={th}>Consumo</th><th style={th}>Custo</th>
            </tr></thead>
            <tbody>{filtrados.slice(0, 200).map(p => {
              const subiu = p.ultimo > 0 && p.medio > 0 && p.ultimo > p.medio * 1.03
              const caiu = p.ultimo > 0 && p.medio > 0 && p.ultimo < p.medio * 0.97
              return <tr key={p.key} onClick={() => setSel(p)} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{p.nome}<span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}> · {p.nComp} compras{p.nCot ? ` · ${p.nCot} cotações` : ''}</span></td>
                <td style={{ ...td, fontWeight: 700, color: 'var(--bordo)' }}>{p.atual ? brl(p.atual) : '—'}</td>
                <td style={{ ...td, color: '#15803D' }}>{p.menor ? brl(p.menor) : '—'}</td>
                <td style={td}>{p.medio ? brl(p.medio) : '—'}</td>
                <td style={{ ...td, color: '#B91C1C' }}>{p.maior ? brl(p.maior) : '—'}</td>
                <td style={{ ...td }}>{p.ultimo ? <span style={{ color: subiu ? '#B91C1C' : caiu ? '#15803D' : 'inherit', fontWeight: subiu || caiu ? 700 : 400 }}>{brl(p.ultimo)} {subiu ? <TrendingUp size={11} /> : caiu ? <TrendingDown size={11} /> : ''}</span> : '—'}</td>
                <td style={{ ...td, color: 'var(--muted)' }}>{p.consumo ? num(p.consumo) : '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: '#EA580C' }}>{p.custo ? brl(p.custo) : '—'}</td>
              </tr>
            })}</tbody>
          </table>
        </div>
        {filtrados.length === 0 && !loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Nenhum produto com histórico de preço ainda.</div>}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Preço atual = menor referência (cotação/compra). Clique num produto para ver a evolução e o histórico. Consumo vem das saídas do período.</div>

      {sel && <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSel(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><strong style={{ fontSize: 16 }}>💰 {sel.nome}</strong><button onClick={() => setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {[['Atual', sel.atual, 'var(--bordo)'], ['Menor', sel.menor, '#15803D'], ['Médio', sel.medio, '#6B7280'], ['Maior', sel.maior, '#B91C1C']].map(([l, v, c]: any) => <div key={l} className="card" style={{ padding: 10, textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 800, color: c }}>{v ? brl(v) : '—'}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>{l}</div></div>)}
          </div>
          {(() => { const hist = [...sel.fontes].filter(f => f.data).sort((a, b) => (a.data! < b.data! ? -1 : 1)); const mx = Math.max(1, ...hist.map(h => h.unit))
            return <>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Evolução do preço ({hist.length} registros)</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, marginBottom: 12, overflowX: 'auto' }}>
                {hist.slice(-40).map((h, i) => <div key={i} title={`${ddmm(h.data)} · ${brl(h.unit)} · ${h.tipo}`} style={{ minWidth: 8, flex: 1, height: `${(h.unit / mx) * 100}%`, background: h.tipo === 'cotacao' ? '#7C3AED' : '#2563EB', borderRadius: '3px 3px 0 0' }} />)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>🟦 compra · 🟪 cotação</div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr style={{ background: 'var(--bordo-bg)' }}><th style={{ textAlign: 'left', padding: '5px 8px' }}>Data</th><th style={{ textAlign: 'left' }}>Fonte</th><th style={{ textAlign: 'left' }}>Fornecedor</th><th style={{ textAlign: 'right', padding: '5px 8px' }}>Preço</th></tr></thead>
                <tbody>{[...hist].reverse().map((h, i) => <tr key={i} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: '5px 8px' }}>{ddmm(h.data)}</td><td style={{ color: h.tipo === 'cotacao' ? '#7C3AED' : '#2563EB' }}>{h.tipo}</td><td style={{ color: 'var(--muted)' }}>{h.forn || '—'}</td><td style={{ textAlign: 'right', padding: '5px 8px', fontWeight: 700 }}>{brl(h.unit)}</td></tr>)}</tbody>
              </table></div>
            </> })()}
        </div>
      </div>}
    </div>
  )
}
