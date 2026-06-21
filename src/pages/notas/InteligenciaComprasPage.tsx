import { useState, useEffect, useMemo, useCallback } from 'react'
import { TrendingUp, Search, Loader, ChevronDown, ChevronRight, Award, AlertTriangle } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchHistoricoPrecos, type HistoricoPreco } from '../../lib/db'

const brl = (n: number) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

interface ItemAgg {
  descricao: string; unidade: string
  menor: number; maior: number; medio: number; atual: number
  ultimoFornecedor: string; dataUltimo: string; compras: number
  alertaPct: number // variação do preço atual vs média
  nivel: 'verde' | 'amarelo' | 'vermelho'
  rows: HistoricoPreco[]
}

function classificar(atual: number, menor: number, medio: number): ItemAgg['nivel'] {
  if (medio <= 0) return 'amarelo'
  if (atual <= menor * 1.02) return 'verde'
  if (atual <= medio * 1.05) return 'amarelo'
  return 'vermelho'
}

const NIVEL: Record<string, { dot: string; label: string; bg: string; color: string }> = {
  verde:    { dot: '🟢', label: 'Excelente compra', bg: '#D1FAE5', color: '#065F46' },
  amarelo:  { dot: '🟡', label: 'Dentro da média',  bg: '#FEF3C7', color: '#92400E' },
  vermelho: { dot: '🔴', label: 'Acima do mercado', bg: '#FEE2E2', color: '#991B1B' },
}

export default function InteligenciaComprasPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const lojaAtiva = loja && loja !== 'Todas as Lojas' ? loja : (user?.loja && user.loja !== 'Todas' ? user.loja : 'Amore Paiva')
  const [hist, setHist] = useState<HistoricoPreco[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setHist(await fetchHistoricoPrecos(lojaAtiva))
    setLoading(false)
  }, [lojaAtiva])
  useEffect(() => { load() }, [load])

  const itens = useMemo<ItemAgg[]>(() => {
    const grupos = new Map<string, HistoricoPreco[]>()
    for (const h of hist) {
      const key = h.descricao.trim().toLowerCase()
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(h)
    }
    const out: ItemAgg[] = []
    for (const rows of grupos.values()) {
      const ord = [...rows].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      const precos = rows.map(r => r.preco_unitario).filter(p => p > 0)
      if (!precos.length) continue
      const menor = Math.min(...precos), maior = Math.max(...precos)
      const medio = precos.reduce((s, p) => s + p, 0) / precos.length
      const atual = ord[0].preco_unitario
      const alertaPct = medio > 0 ? ((atual - medio) / medio) * 100 : 0
      out.push({
        descricao: ord[0].descricao, unidade: ord[0].unidade, menor, maior, medio, atual,
        ultimoFornecedor: ord[0].fornecedor_nome || '—', dataUltimo: ord[0].data, compras: rows.length,
        alertaPct, nivel: classificar(atual, menor, medio), rows: ord,
      })
    }
    return out.sort((a, b) => a.descricao.localeCompare(b.descricao))
  }, [hist])

  const filtrados = itens.filter(i => !busca || i.descricao.toLowerCase().includes(busca.toLowerCase()))

  // comparativo por fornecedor de um item
  function fornecedoresDoItem(it: ItemAgg) {
    const g = new Map<string, HistoricoPreco[]>()
    for (const r of it.rows) { const f = r.fornecedor_nome || '—'; if (!g.has(f)) g.set(f, []); g.get(f)!.push(r) }
    const arr = Array.from(g.entries()).map(([forn, rows]) => {
      const precos = rows.map(r => r.preco_unitario)
      const ult = [...rows].sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0]
      return { forn, melhor: Math.min(...precos), ultimo: ult.preco_unitario, dataUltimo: ult.data, compras: rows.length }
    }).sort((a, b) => a.melhor - b.melhor)
    return arr
  }

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TrendingUp size={22} color="#6B1212" />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Inteligência de Compras</h1>
        <span style={{ fontSize: 11, background: '#6B121215', color: '#6B1212', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>ASI · Fase 2</span>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Histórico de preços por item (menor/médio/atual) + melhor fornecedor. Alimentado automaticamente por cada NF/lançamento. · Loja: <b>{lojaAtiva}</b></p>

      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Search size={16} color="#9ca3af" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item (ex: filé de frango)…"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14 }} />
      </div>

      {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 30 }}><Loader size={16} className="spin" /> Carregando histórico…</p>
        : itens.length === 0 ? <div style={{ ...card, textAlign: 'center', color: '#6b7280' }}>Ainda não há histórico de preços. Importe NF-e ou faça lançamentos manuais na tela <b>Notas Fiscais</b> que os preços aparecem aqui. 📈</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtrados.map(it => {
                const n = NIVEL[it.nivel]; const ab = aberto === it.descricao
                return (
                  <div key={it.descricao} style={card}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setAberto(ab ? null : it.descricao)}>
                      {ab ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{it.descricao} <span style={{ fontSize: 11, color: '#9ca3af' }}>({it.unidade})</span></div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Último: {brl(it.atual)} · {it.ultimoFornecedor} · {it.dataUltimo} · {it.compras} compra(s)</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, background: n.bg, color: n.color, padding: '3px 9px', borderRadius: 20 }}>{n.dot} {n.label}</span>
                        {it.alertaPct > 5 && <div style={{ fontSize: 11, color: '#991B1B', marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><AlertTriangle size={11} /> {it.alertaPct.toFixed(0)}% acima da média</div>}
                      </div>
                    </div>

                    {/* mini-resumo sempre visível */}
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, paddingLeft: 26, fontSize: 12 }}>
                      <span>📉 Menor: <b style={{ color: '#065F46' }}>{brl(it.menor)}</b></span>
                      <span>📊 Médio: <b>{brl(it.medio)}</b></span>
                      <span>🛒 Atual: <b style={{ color: it.nivel === 'vermelho' ? '#991B1B' : '#111' }}>{brl(it.atual)}</b></span>
                      <span>📈 Maior: {brl(it.maior)}</span>
                    </div>

                    {ab && (
                      <div style={{ paddingLeft: 26, marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Comparativo por fornecedor</div>
                        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                          <thead><tr style={{ color: '#9ca3af', textAlign: 'left' }}><th>Fornecedor</th><th>Melhor preço</th><th>Último</th><th>Compras</th><th></th></tr></thead>
                          <tbody>
                            {fornecedoresDoItem(it).map((f, idx) => (
                              <tr key={f.forn} style={{ borderTop: '1px solid #f6f6f6' }}>
                                <td style={{ padding: '5px 0', fontWeight: idx === 0 ? 700 : 400 }}>{idx === 0 && <Award size={12} color="#D97706" style={{ verticalAlign: 'middle', marginRight: 4 }} />}{f.forn}</td>
                                <td style={{ color: idx === 0 ? '#065F46' : '#111', fontWeight: idx === 0 ? 700 : 400 }}>{brl(f.melhor)}</td>
                                <td>{brl(f.ultimo)} <span style={{ color: '#9ca3af' }}>({f.dataUltimo})</span></td>
                                <td>{f.compras}</td>
                                <td>{idx === 0 ? '🟢 melhor' : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {fornecedoresDoItem(it).length > 1 && (() => {
                          const fs = fornecedoresDoItem(it); const economia = it.atual - fs[0].melhor
                          return economia > 0.009 ? <div style={{ fontSize: 12, color: '#065F46', marginTop: 8, fontWeight: 700 }}>💡 Economia possível: {brl(economia)} por {it.unidade} comprando com {fs[0].forn}.</div> : null
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
    </div>
  )
}
