import { useState, useEffect, useMemo, useCallback } from 'react'
import { Bot, Loader, AlertTriangle, TrendingUp, ShoppingCart, Award, Send } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchHistoricoPrecos, fetchEstoqueProdutos, fetchFornecedores,
  type HistoricoPreco,
} from '../../lib/db'
import type { EstoqueProduto, Fornecedor } from '../../types/database'

const brl = (n: number) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

interface BestForn { fornecedor: string; preco: number }

export default function CompradorIaPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const lojaAtiva = loja && loja !== 'Todas as Lojas' ? loja : (user?.loja && user.loja !== 'Todas' ? user.loja : 'Amore Paiva')

  const [hist, setHist] = useState<HistoricoPreco[]>([])
  const [estoque, setEstoque] = useState<EstoqueProduto[]>([])
  const [forns, setForns] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [h, e, f] = await Promise.all([
      fetchHistoricoPrecos(lojaAtiva), fetchEstoqueProdutos(lojaAtiva), fetchFornecedores(lojaAtiva),
    ])
    setHist(h); setEstoque(e); setForns(f); setLoading(false)
  }, [lojaAtiva])
  useEffect(() => { load() }, [load])

  // melhor fornecedor + média por item (do histórico)
  const porItem = useMemo(() => {
    const g = new Map<string, HistoricoPreco[]>()
    for (const h of hist) { const k = h.descricao.trim().toLowerCase(); if (!g.has(k)) g.set(k, []); g.get(k)!.push(h) }
    const map = new Map<string, { best: BestForn; media: number; atual: number; unidade: string }>()
    for (const [k, rows] of g) {
      const precos = rows.map(r => r.preco_unitario).filter(p => p > 0)
      if (!precos.length) continue
      const melhor = rows.reduce((a, b) => (b.preco_unitario > 0 && b.preco_unitario < a.preco_unitario ? b : a))
      const ord = [...rows].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
      map.set(k, {
        best: { fornecedor: melhor.fornecedor_nome || '—', preco: melhor.preco_unitario },
        media: precos.reduce((s, p) => s + p, 0) / precos.length, atual: ord[0].preco_unitario, unidade: ord[0].unidade,
      })
    }
    return map
  }, [hist])

  const whatsByNome = useMemo(() => {
    const m = new Map<string, string>()
    forns.forEach(f => { if (f.whatsapp || f.telefone) m.set(f.nome.trim().toLowerCase(), (f.whatsapp || f.telefone || '').replace(/\D/g, '')) })
    return m
  }, [forns])

  // 1. Reposição (abaixo do mínimo) → ordem de compra sugerida
  const reposicao = useMemo(() => {
    return estoque
      .filter(p => (p.nivel_minimo || 0) > 0 && (p.nivel_atual || 0) <= (p.nivel_minimo || 0))
      .map(p => {
        const info = porItem.get(p.nome.trim().toLowerCase())
        const qtd = Math.max((p.nivel_ideal || 0) - (p.nivel_atual || 0), p.nivel_minimo || 0)
        const preco = info?.best.preco ?? p.preco_unitario ?? 0
        return { nome: p.nome, unidade: p.gramatura || info?.unidade || 'un', atual: p.nivel_atual, minimo: p.nivel_minimo, qtd, fornecedor: info?.best.fornecedor || '—', preco, custo: qtd * preco }
      })
      .sort((a, b) => b.custo - a.custo)
  }, [estoque, porItem])

  // 2. Alta de preço (atual > média + 8%)
  const altas = useMemo(() => {
    const out: { nome: string; atual: number; media: number; pct: number; melhor: BestForn }[] = []
    porItem.forEach((info, k) => {
      if (info.media > 0 && info.atual > info.media * 1.08) {
        const nome = hist.find(h => h.descricao.trim().toLowerCase() === k)?.descricao || k
        out.push({ nome, atual: info.atual, media: info.media, pct: ((info.atual - info.media) / info.media) * 100, melhor: info.best })
      }
    })
    return out.sort((a, b) => b.pct - a.pct)
  }, [porItem, hist])

  // 3. Ranking de fornecedores (nº compras + vitórias de preço + avaliação)
  const ranking = useMemo(() => {
    // conta NFs por fornecedor a partir do histórico (nota distinta)
    const notasPorForn = new Map<string, Set<string>>()
    hist.forEach(h => { const f = h.fornecedor_nome || '—'; if (!notasPorForn.has(f)) notasPorForn.set(f, new Set()); if (h.nota_id) notasPorForn.get(f)!.add(h.nota_id) })
    const vitorias = new Map<string, number>()
    porItem.forEach(info => vitorias.set(info.best.fornecedor, (vitorias.get(info.best.fornecedor) || 0) + 1))
    const nomes = new Set<string>([...notasPorForn.keys(), ...vitorias.keys()])
    return Array.from(nomes).filter(n => n && n !== '—').map(nome => {
      const fObj = forns.find(f => f.nome.trim().toLowerCase() === nome.trim().toLowerCase())
      const nNotas = notasPorForn.get(nome)?.size || 0
      const vit = vitorias.get(nome) || 0
      const aval = fObj?.nota_avaliacao || 0
      return { nome, nNotas, vit, aval, score: vit * 3 + nNotas + aval }
    }).sort((a, b) => b.score - a.score)
  }, [hist, porItem, forns])

  function enviarOC(fornecedor: string) {
    const itensF = reposicao.filter(r => r.fornecedor === fornecedor)
    if (!itensF.length) return
    const total = itensF.reduce((s, i) => s + i.custo, 0)
    const linhas = itensF.map(i => `• ${i.nome}: ${i.qtd} ${i.unidade} (~${brl(i.preco)}/un)`).join('\n')
    const txt = `*Ordem de Compra — ${lojaAtiva}*\n\n${linhas}\n\n*Total estimado:* ${brl(total)}\n\nPodem confirmar disponibilidade e prazo?`
    const zap = whatsByNome.get(fornecedor.trim().toLowerCase())
    const url = zap ? `https://wa.me/55${zap}?text=${encodeURIComponent(txt)}` : `https://wa.me/?text=${encodeURIComponent(txt)}`
    window.open(url, '_blank')
  }

  const totalOC = reposicao.reduce((s, i) => s + i.custo, 0)
  const fornsOC = Array.from(new Set(reposicao.map(r => r.fornecedor).filter(f => f !== '—')))
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Bot size={22} color="#6B1212" />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Comprador IA</h1>
        <span style={{ fontSize: 11, background: '#6B121215', color: '#6B1212', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>ASI · Fase 4</span>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Sugestões de compra, ordem de compra automática e ranking de fornecedores. · Loja: <b>{lojaAtiva}</b></p>

      {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 30 }}><Loader size={16} className="spin" /> Analisando…</p> : (
        <>
          {/* Ordem de compra sugerida */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ShoppingCart size={16} /> Ordem de compra sugerida (itens no/abaixo do mínimo)</h3>
            {reposicao.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Nenhum item abaixo do estoque mínimo. 👍 (defina o nível mínimo dos produtos no Estoque pra ativar)</p> : (
              <>
                <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>{reposicao.length} item(ns) · Total estimado: <b>{brl(totalOC)}</b></p>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ color: '#9ca3af', textAlign: 'left' }}><th style={{ padding: '4px 0' }}>Item</th><th>Atual</th><th>Comprar</th><th>Melhor fornecedor</th><th>Custo est.</th></tr></thead>
                  <tbody>
                    {reposicao.map(r => (
                      <tr key={r.nome} style={{ borderTop: '1px solid #f6f6f6' }}>
                        <td style={{ padding: '5px 0' }}>{r.nome}</td>
                        <td style={{ color: '#991B1B' }}>{r.atual} {r.unidade}</td>
                        <td><b>{r.qtd} {r.unidade}</b></td>
                        <td>{r.fornecedor} <span style={{ color: '#9ca3af' }}>({brl(r.preco)})</span></td>
                        <td><b>{brl(r.custo)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fornsOC.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {fornsOC.map(f => (
                      <button key={f} onClick={() => enviarOC(f)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        <Send size={13} /> Enviar OC para {f}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Alertas de alta de preço */}
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><TrendingUp size={16} /> Alertas de preço (acima da média)</h3>
            {altas.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Nenhum item com preço muito acima da média. 👍</p> :
              altas.map(a => (
                <div key={a.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #f6f6f6', fontSize: 13 }}>
                  <AlertTriangle size={14} color="#991B1B" />
                  <span style={{ flex: 1 }}><b>{a.nome}</b> — atual {brl(a.atual)} vs média {brl(a.media)}</span>
                  <span style={{ color: '#991B1B', fontWeight: 700 }}>+{a.pct.toFixed(0)}%</span>
                  <span style={{ color: '#065F46', fontSize: 12 }}>melhor: {a.melhor.fornecedor} ({brl(a.melhor.preco)})</span>
                </div>
              ))}
          </div>

          {/* Ranking de fornecedores */}
          <div style={card}>
            <h3 style={{ margin: '0 0 8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Award size={16} /> Ranking de fornecedores</h3>
            {ranking.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Sem dados suficientes ainda.</p> : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#9ca3af', textAlign: 'left' }}><th style={{ padding: '4px 0' }}>#</th><th>Fornecedor</th><th>Notas</th><th>Melhores preços</th><th>Avaliação</th></tr></thead>
                <tbody>
                  {ranking.slice(0, 15).map((r, i) => (
                    <tr key={r.nome} style={{ borderTop: '1px solid #f6f6f6' }}>
                      <td style={{ padding: '5px 0' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                      <td style={{ fontWeight: i < 3 ? 700 : 400 }}>{r.nome}</td>
                      <td>{r.nNotas}</td>
                      <td>{r.vit} item(ns)</td>
                      <td>{r.aval ? '⭐ ' + r.aval.toFixed(1) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
