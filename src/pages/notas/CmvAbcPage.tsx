import { useState, useEffect, useMemo, useCallback } from 'react'
import { PieChart, Loader, DollarSign, Package, ShoppingCart, TrendingUp, Layers } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchNotasFiscais, fetchTodosNfItens, fetchContasPagar, fetchEstoqueProdutos, fetchVendas,
  type NotaFiscal, type NotaItem, type ContaPagar,
} from '../../lib/db'
import type { EstoqueProduto } from '../../types/database'

const brl = (n: number) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
const pct = (n: number) => (n || 0).toFixed(1) + '%'

const CLASSE: Record<string, { bg: string; color: string; desc: string }> = {
  A: { bg: '#FEE2E2', color: '#991B1B', desc: '80% do valor' },
  B: { bg: '#FEF3C7', color: '#92400E', desc: 'intermediários' },
  C: { bg: '#D1FAE5', color: '#065F46', desc: 'menor impacto' },
}

export default function CmvAbcPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const lojaAtiva = loja && loja !== 'Todas as Lojas' ? loja : (user?.loja && user.loja !== 'Todas' ? user.loja : 'Amore Paiva')

  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [itens, setItens] = useState<NotaItem[]>([])
  const [contas, setContas] = useState<ContaPagar[]>([])
  const [estoque, setEstoque] = useState<EstoqueProduto[]>([])
  const [vendas, setVendas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [n, it, c, e, v] = await Promise.all([
      fetchNotasFiscais(lojaAtiva), fetchTodosNfItens(lojaAtiva), fetchContasPagar(lojaAtiva),
      fetchEstoqueProdutos(lojaAtiva), fetchVendas(lojaAtiva).catch(() => []),
    ])
    setNotas(n); setItens(it); setContas(c); setEstoque(e); setVendas(v as any[]); setLoading(false)
  }, [lojaAtiva])
  useEffect(() => { load() }, [load])

  const mes = new Date().toISOString().slice(0, 7)
  const vendaVal = (v: any) => Number(v.valor_total ?? v.total ?? v.valor ?? 0) || 0
  const vendaData = (v: any) => String(v.data ?? v.created_at ?? '')

  const kpi = useMemo(() => {
    const comprasMes = notas.filter(n => (n.data_emissao || '').startsWith(mes)).reduce((s, n) => s + (n.valor_total || 0), 0)
    const contasAbertas = contas.filter(c => c.status === 'aberto').reduce((s, c) => s + (c.valor || 0), 0)
    const valorEstoque = estoque.reduce((s, p) => s + (p.nivel_atual || 0) * (p.preco_unitario || 0), 0)
    const vendasMes = vendas.filter(v => vendaData(v).startsWith(mes)).reduce((s, v) => s + vendaVal(v), 0)
    const cmv = vendasMes > 0 ? (comprasMes / vendasMes) * 100 : null
    return { comprasMes, contasAbertas, valorEstoque, vendasMes, cmv }
  }, [notas, contas, estoque, vendas, mes])

  // Curva ABC (por item, valor comprado)
  const abc = useMemo(() => {
    const g = new Map<string, { descricao: string; unidade: string; total: number; qtd: number }>()
    for (const it of itens) {
      const key = it.descricao.trim().toLowerCase()
      const cur = g.get(key) || { descricao: it.descricao, unidade: it.unidade, total: 0, qtd: 0 }
      cur.total += it.valor_total || 0; cur.qtd += it.quantidade || 0
      g.set(key, cur)
    }
    const arr = Array.from(g.values()).sort((a, b) => b.total - a.total)
    const totalGeral = arr.reduce((s, i) => s + i.total, 0)
    let acum = 0
    return {
      totalGeral,
      itens: arr.map(i => {
        acum += i.total
        const acumPct = totalGeral > 0 ? (acum / totalGeral) * 100 : 0
        const classe = acumPct <= 80 ? 'A' : acumPct <= 95 ? 'B' : 'C'
        return { ...i, acumPct, classe, partPct: totalGeral > 0 ? (i.total / totalGeral) * 100 : 0 }
      }),
    }
  }, [itens])

  // Compras por categoria (match item -> estoque por nome)
  const porCategoria = useMemo(() => {
    const catByNome = new Map<string, string>()
    estoque.forEach(p => catByNome.set(p.nome.trim().toLowerCase(), p.categoria || 'Outros'))
    const g = new Map<string, number>()
    for (const it of itens) {
      const cat = catByNome.get(it.descricao.trim().toLowerCase()) || 'Não classificado'
      g.set(cat, (g.get(cat) || 0) + (it.valor_total || 0))
    }
    return Array.from(g.entries()).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total)
  }, [itens, estoque])

  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <PieChart size={22} color="#6B1212" />
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>CMV & Curva ABC</h1>
        <span style={{ fontSize: 11, background: '#6B121215', color: '#6B1212', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>ASI · Fase 3</span>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Dashboard financeiro de compras, CMV e classificação ABC dos itens. · Loja: <b>{lojaAtiva}</b></p>

      {loading ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 30 }}><Loader size={16} className="spin" /> Calculando…</p> : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
            {[
              { i: <ShoppingCart size={18} />, v: brl(kpi.comprasMes), l: 'Compras do mês' },
              { i: <DollarSign size={18} />, v: brl(kpi.contasAbertas), l: 'Contas a pagar (aberto)' },
              { i: <Package size={18} />, v: brl(kpi.valorEstoque), l: 'Valor em estoque' },
              { i: <TrendingUp size={18} />, v: kpi.vendasMes > 0 ? brl(kpi.vendasMes) : '—', l: 'Vendas do mês' },
              { i: <PieChart size={18} />, v: kpi.cmv != null ? pct(kpi.cmv) : '—', l: 'CMV estimado' },
            ].map((k, idx) => (
              <div key={idx} style={card}>
                <div style={{ color: '#6B1212' }}>{k.i}</div>
                <div style={{ fontSize: 21, fontWeight: 800, marginTop: 4 }}>{k.v}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{k.l}</div>
              </div>
            ))}
          </div>
          {kpi.cmv == null && <div style={{ ...card, marginBottom: 18, fontSize: 12, color: '#92400E', background: '#FEF9E7' }}>ℹ️ CMV estimado = Compras ÷ Vendas. Sem dados de vendas no período ainda — assim que houver vendas registradas, o CMV aparece automaticamente.</div>}

          {/* Compras por categoria */}
          <div style={{ ...card, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><Layers size={16} /> Compras por categoria</h3>
            {porCategoria.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Sem compras registradas.</p> :
              porCategoria.map(c => {
                const max = porCategoria[0].total || 1
                return (
                  <div key={c.cat} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{c.cat}</span><b>{brl(c.total)}</b></div>
                    <div style={{ background: '#f1f1f1', borderRadius: 6, height: 8 }}><div style={{ width: `${(c.total / max) * 100}%`, background: '#6B1212', height: 8, borderRadius: 6 }} /></div>
                  </div>
                )
              })}
          </div>

          {/* Curva ABC */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontWeight: 700 }}>Curva ABC — itens por valor comprado</h3>
            <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Total comprado: <b>{brl(abc.totalGeral)}</b> · {abc.itens.length} itens · Classe A = 80% do valor (foco de negociação)</p>
            {abc.itens.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Importe NF-e / lançamentos para gerar a curva ABC.</p> : (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ color: '#9ca3af', textAlign: 'left' }}>
                  <th style={{ padding: '4px 0' }}>Item</th><th>Comprado</th><th>% do total</th><th>Acum.</th><th>Classe</th>
                </tr></thead>
                <tbody>
                  {abc.itens.slice(0, 100).map(i => {
                    const cl = CLASSE[i.classe]
                    return (
                      <tr key={i.descricao} style={{ borderTop: '1px solid #f6f6f6' }}>
                        <td style={{ padding: '5px 0' }}>{i.descricao}</td>
                        <td><b>{brl(i.total)}</b></td>
                        <td>{pct(i.partPct)}</td>
                        <td style={{ color: '#9ca3af' }}>{pct(i.acumPct)}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 700, background: cl.bg, color: cl.color, padding: '2px 8px', borderRadius: 20 }}>Classe {i.classe}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
