import { useState, useEffect, useCallback, useMemo } from 'react'
import { Archive, RefreshCw, Loader, ChevronLeft, Store, Calendar, FileText, Trash2 } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { fetchCaixas, fetchCaixaItens, fetchTodosCaixaItens, deleteCaixa } from '../../lib/db'
import type { Caixa, CaixaItem } from '../../types/database'

const fmtR$ = (v: number | null | undefined) => v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtData = (d: string | null) => { if (!d) return '—'; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}` }

const CAT_COR: Record<string, string> = {
  Supermercado: '#2563EB', Hortifruti: '#16A34A', 'Embalagens/Descartaveis': '#B45309', Embalagens: '#B45309',
  Combustivel: '#DC2626', Pedagio: '#9333EA', Temperos: '#EA580C', Bebidas: '#0891B2', Folhagens: '#65A30D', Outros: '#6B7280',
}
const corCat = (c: string | null) => CAT_COR[c || 'Outros'] || '#6B7280'

function Bar({ pct, cor }: { pct: number; cor: string }) {
  return <div style={{ height: 8, background: 'var(--border)', borderRadius: 99, overflow: 'hidden', flex: 1, minWidth: 80 }}>
    <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 99 }} /></div>
}

// ── Detalhe de um caixa ──────────────────────────────────────
function CaixaDetalhe({ caixa, onVoltar }: { caixa: Caixa; onVoltar: () => void }) {
  const [itens, setItens] = useState<CaixaItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetchCaixaItens(caixa.id).then(setItens).finally(() => setLoading(false)) }, [caixa.id])

  return (
    <div>
      <button className="btn bo bsm" onClick={onVoltar} style={{ marginBottom: 14 }}><ChevronLeft size={12} /> Caixas</button>
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>{caixa.titulo}</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
          <span><Store size={12} /> {caixa.loja}</span>
          <span><Calendar size={12} /> {fmtData(caixa.periodo_inicio)} — {fmtData(caixa.periodo_fim)}</span>
          <span style={{ fontWeight: 800, color: 'var(--bordo)', fontSize: 15 }}>{fmtR$(caixa.total)}</span>
        </div>
        {caixa.observacoes && <div style={{ marginTop: 8, fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: 6 }}>⚠ {caixa.observacoes}</div>}
        {caixa.arquivo_origem && <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}><FileText size={11} /> {caixa.arquivo_origem}</div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Itens ({itens.length})</div>
        {loading && <div style={{ padding: 30, textAlign: 'center' }}><Loader size={18} className="spin" /></div>}
        {!loading && itens.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sem itens detalhados neste caixa (valor total no cabeçalho).</div>}
        {!loading && itens.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead><tr style={{ background: 'var(--bordo-bg)' }}>
              <th style={{ textAlign: 'left', padding: '8px 12px' }}>Descrição</th><th style={{ textAlign: 'left', padding: '8px 12px' }}>Fornecedor</th>
              <th style={{ textAlign: 'left', padding: '8px 12px' }}>Categoria</th><th style={{ textAlign: 'right', padding: '8px 12px' }}>Valor</th>
            </tr></thead>
            <tbody>{itens.map(i => (
              <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 12px', fontWeight: 600 }}>{i.descricao || '—'}</td>
                <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>{i.fornecedor || '—'}</td>
                <td style={{ padding: '7px 12px' }}><span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, background: corCat(i.categoria) + '22', color: corCat(i.categoria), fontWeight: 700 }}>{i.categoria || 'Outros'}</span></td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700 }}>{fmtR$(i.valor)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function CaixasPage() {
  const { loja } = useLoja()
  const [caixas, setCaixas] = useState<Caixa[]>([])
  const [itens, setItens] = useState<CaixaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'arquivo' | 'abc'>('arquivo')
  const [sel, setSel] = useState<Caixa | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [cx, it] = await Promise.all([fetchCaixas(loja), fetchTodosCaixaItens(loja)])
    setCaixas(cx); setItens(it); setLoading(false)
  }, [loja])
  useEffect(() => { load() }, [load])

  const totalGeral = caixas.reduce((s, c) => s + (c.total || 0), 0)

  // ── ABC por fornecedor + por categoria (dos itens) ──
  const abcFornecedor = useMemo(() => {
    const m: Record<string, number> = {}
    itens.forEach(i => { const k = i.fornecedor || 'Não informado'; m[k] = (m[k] || 0) + (i.valor || 0) })
    const arr = Object.entries(m).sort((a, b) => b[1] - a[1])
    const tot = arr.reduce((s, [, v]) => s + v, 0) || 1
    let acum = 0
    return arr.map(([nome, val]) => { acum += val; const pAcum = (acum / tot) * 100; return { nome, val, pct: (val / tot) * 100, pAcum, classe: pAcum <= 80 ? 'A' : pAcum <= 95 ? 'B' : 'C' } })
  }, [itens])

  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {}
    itens.forEach(i => { const k = i.categoria || 'Outros'; m[k] = (m[k] || 0) + (i.valor || 0) })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [itens])
  const maxCat = Math.max(1, ...porCategoria.map(([, v]) => v))

  if (sel) return <CaixaDetalhe caixa={sel} onVoltar={() => setSel(null)} />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bordo-bg)', padding: 4, borderRadius: 10 }}>
          {(['arquivo', 'abc'] as const).map(t => (
            <button key={t} onClick={() => setAba(t)} style={{ border: 'none', cursor: 'pointer', padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: aba === t ? 700 : 500, background: aba === t ? 'var(--bordo)' : 'transparent', color: aba === t ? '#fff' : 'var(--muted)' }}>
              {t === 'arquivo' ? '🗄️ Arquivo de Caixas' : '📊 Análise ABC'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn bo bsm" onClick={load} disabled={loading}>{loading ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />} Atualizar</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bordo)' }}>{caixas.length}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Caixas arquivados</div></div>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bordo)' }}>{fmtR$(totalGeral)}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Total de despesas</div></div>
        <div className="card" style={{ padding: 16, flex: 1, minWidth: 150 }}><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--bordo)' }}>{itens.length}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Itens detalhados</div></div>
      </div>

      {aba === 'arquivo' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 40, textAlign: 'center' }}><Loader size={20} className="spin" /></div>}
          {!loading && caixas.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}><Archive size={28} style={{ opacity: .4 }} /><br />Nenhum caixa arquivado.</div>}
          {!loading && caixas.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--bordo-bg)' }}>
                <th style={{ textAlign: 'left', padding: '9px 14px' }}>Caixa</th><th style={{ textAlign: 'left', padding: '9px 14px' }}>Loja</th>
                <th style={{ textAlign: 'left', padding: '9px 14px' }}>Período</th><th style={{ textAlign: 'center', padding: '9px 14px' }}>Itens</th>
                <th style={{ textAlign: 'right', padding: '9px 14px' }}>Total</th><th></th>
              </tr></thead>
              <tbody>{caixas.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }} onClick={() => setSel(c)}>
                  <td style={{ padding: '9px 14px', fontWeight: 600 }}>{c.titulo}{c.observacoes && <span title={c.observacoes} style={{ color: '#B45309' }}> ⚠</span>}</td>
                  <td style={{ padding: '9px 14px' }}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>{c.loja}</span></td>
                  <td style={{ padding: '9px 14px', color: 'var(--muted)', fontSize: 12 }}>{fmtData(c.periodo_inicio)} — {fmtData(c.periodo_fim)}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center', color: 'var(--muted)' }}>{c.qtd_itens || '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800 }}>{c.total > 0 ? fmtR$(c.total) : <span style={{ color: '#B45309', fontSize: 11 }}>a conferir</span>}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                    <button className="ib rd" onClick={e => { e.stopPropagation(); if (confirm('Excluir este caixa do arquivo?')) deleteCaixa(c.id).then(load) }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}

      {aba === 'abc' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800 }}>Curva ABC por fornecedor</h3>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>A = 80% do gasto · B = 15% · C = 5% (base: itens detalhados)</div>
            {abcFornecedor.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem itens detalhados ainda. Os caixas com itens alimentam esta análise.</div>}
            {abcFornecedor.slice(0, 15).map(f => (
              <div key={f.nome} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span><b style={{ color: f.classe === 'A' ? '#B91C1C' : f.classe === 'B' ? '#B45309' : '#15803D' }}>{f.classe}</b> · {f.nome}</span>
                  <strong>{fmtR$(f.val)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({f.pct.toFixed(1)}%)</span></strong>
                </div>
                <Bar pct={f.pct} cor={f.classe === 'A' ? '#B91C1C' : f.classe === 'B' ? '#B45309' : '#15803D'} />
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Gasto por categoria</h3>
            {porCategoria.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem itens detalhados ainda.</div>}
            {porCategoria.map(([cat, v]) => (
              <div key={cat} style={{ marginBottom: 11 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span>{cat}</span><strong>{fmtR$(v)}</strong>
                </div>
                <Bar pct={(v / maxCat) * 100} cor={corCat(cat)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
