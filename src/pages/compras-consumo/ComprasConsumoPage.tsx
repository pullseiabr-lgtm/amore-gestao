import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, ShoppingCart, Utensils, Boxes } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { fetchTodosCaixaItens, fetchEstoqueProdutos, fetchEstoqueMovimentacoesRange } from '../../lib/db'

const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const STOP = new Set(['de','da','do','com','sem','para','e','a','o','kg','g','gr','ml','l','un','und','unid','unidade','unidades','litro','grama'])
const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const isSize = (t: string) => /^\d+([.,]\d+)?(kg|kgs|g|gr|mg|ml|l|lt|un|und|cx|pc|pct)$/.test(t)
const keyOf = (s?: string | null) => [...new Set(norm(s).split(' ').filter(t => t.length >= 2 && !STOP.has(t) && !/^\d+$/.test(t) && !isSize(t)))].sort().join(' ')
const dentro = (d: any, a: string, b: string) => { if (!d) return false; const x = String(d).slice(0, 10); return x >= a && x <= b }
const CATCOR: Record<string, string> = { Hortifruti: '#16A34A', Supermercado: '#2563EB', Mercearia: '#2563EB', Bebidas: '#0891B2', Descartaveis: '#B45309', Congelados: '#0EA5E9', Frios: '#CA8A04', Limpeza: '#0D9488', Temperos: '#EA580C', Acougue: '#B91C1C', Outros: '#6B7280' }

export default function ComprasConsumoPage() {
  const { loja } = useLoja()
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'mes-ant'>('mes')
  const [loading, setLoading] = useState(true)
  const [caixaItens, setCaixaItens] = useState<any[]>([])
  const [saidas, setSaidas] = useState<any[]>([])
  const [precos, setPrecos] = useState<Record<string, number>>({})

  const [ini, fim] = useMemo(() => {
    const h = new Date(); h.setHours(0, 0, 0, 0)
    if (periodo === 'semana') { const d = new Date(h); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return [iso(d), iso(h)] }
    if (periodo === 'mes-ant') return [iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), iso(new Date(h.getFullYear(), h.getMonth(), 0))]
    return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), iso(h)]
  }, [periodo])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const seis = iso(new Date(Date.now() - 45 * 864e5))
      const [ci, pr, mv] = await Promise.all([
        fetchTodosCaixaItens(loja).catch(() => []),
        fetchEstoqueProdutos(loja).catch(() => []),
        fetchEstoqueMovimentacoesRange(loja, seis, fim).catch(() => []),
      ])
      const pmap: Record<string, number> = {}
      pr.forEach((p: any) => { const k = keyOf(p.nome); if (k && Number(p.preco_unitario) > 0) pmap[k] = Number(p.preco_unitario) })
      setCaixaItens(ci); setPrecos(pmap); setSaidas((mv || []).filter((m: any) => m.tipo === 'saida'))
    } catch { /* noop */ }
    setLoading(false)
  }, [loja, fim])
  useEffect(() => { load() }, [load])

  const comprasP = useMemo(() => caixaItens.filter((i: any) => dentro(i.data, ini, fim)), [caixaItens, ini, fim])
  const saidasP = useMemo(() => saidas.filter((s: any) => dentro(s.created_at, ini, fim)), [saidas, ini, fim])
  const compras = comprasP.reduce((s: number, i: any) => s + (Number(i.valor) || 0), 0)
  const consumo = saidasP.reduce((s: number, m: any) => s + (Number(m.quantidade) || 0) * (precos[keyOf(m.produto_nome)] || 0), 0)
  const incorporado = compras - consumo
  const pct = compras > 0 ? (consumo / compras) * 100 : 0
  const balanco = consumo === 0 ? null : compras > consumo * 1.3 ? 'excesso' : compras < consumo * 0.8 ? 'abaixo' : 'ok'

  // por categoria
  const porCat = useMemo(() => {
    const m: Record<string, { compra: number; consumo: number }> = {}
    comprasP.forEach((i: any) => { const c = i.categoria || 'Outros'; (m[c] = m[c] || { compra: 0, consumo: 0 }).compra += Number(i.valor) || 0 })
    // consumo por categoria não existe direto no mov → aproxima pela categoria do produto (não disponível); soma no total
    return Object.entries(m).map(([cat, v]) => ({ cat, ...v })).sort((a, b) => b.compra - a.compra)
  }, [comprasP])
  const maxCat = Math.max(1, ...porCat.map(c => c.compra))

  // evolução semanal compras × consumo
  const evol = useMemo(() => {
    const sems: { label: string; a: string; b: string; compra: number; consumo: number }[] = []
    const h = new Date(); h.setHours(0, 0, 0, 0); const seg = new Date(h); seg.setDate(seg.getDate() - (h.getDay() + 6) % 7)
    for (let k = 5; k >= 0; k--) { const s = new Date(seg); s.setDate(s.getDate() - k * 7); const e = new Date(s); e.setDate(e.getDate() + 6); sems.push({ label: `${s.getDate()}/${s.getMonth() + 1}`, a: iso(s), b: iso(e), compra: 0, consumo: 0 }) }
    caixaItens.forEach((i: any) => { const s = sems.find(x => dentro(i.data, x.a, x.b)); if (s) s.compra += Number(i.valor) || 0 })
    saidas.forEach((m: any) => { const s = sems.find(x => dentro(m.created_at, x.a, x.b)); if (s) s.consumo += (Number(m.quantidade) || 0) * (precos[keyOf(m.produto_nome)] || 0) })
    return sems
  }, [caixaItens, saidas, precos])
  const maxEvol = Math.max(1, ...evol.flatMap(e => [e.compra, e.consumo]))

  const Kpi = ({ icon, label, value, cor }: any) => <div className="card" style={{ padding: '12px 14px', borderLeft: `4px solid ${cor}`, flex: 1, minWidth: 150 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cor, marginBottom: 3 }}>{icon}<span style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span></div>
    <div style={{ fontSize: 21, fontWeight: 800 }}>{value}</div></div>

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#6B1212,#8a2a2a)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>⚖️ Compras × Consumo</h2><div style={{ fontSize: 12.5, opacity: .85 }}>Estamos comprando de acordo com o que consumimos? · {loja}</div></div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: 3 }}>
          {([['semana', 'Semana'], ['mes', 'Mês'], ['mes-ant', 'Mês ant.']] as const).map(([v, l]) => <button key={v} className="btn" onClick={() => setPeriodo(v)} style={{ padding: '5px 11px', fontSize: 12.5, border: 'none', background: periodo === v ? '#fff' : 'transparent', color: periodo === v ? 'var(--bordo)' : '#fff' }}>{l}</button>)}
        </div>
        <button className="btn bo" onClick={load} style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff', padding: '8px 11px' }}><RefreshCw size={15} /></button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Kpi icon={<ShoppingCart size={14} />} label="Compras" value={brl(compras)} cor="#2563EB" />
        <Kpi icon={<Utensils size={14} />} label="Consumo" value={brl(consumo)} cor="#EA580C" />
        <Kpi icon={<Boxes size={14} />} label="Incorporado ao estoque" value={brl(incorporado)} cor={incorporado >= 0 ? '#15803D' : '#B91C1C'} />
        <Kpi icon={<span style={{ fontSize: 14 }}>%</span>} label="Consumo / Compras" value={`${pct.toFixed(0)}%`} cor="#7C3AED" />
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        {balanco === null ? <div style={{ fontSize: 13, color: '#B45309', background: '#FEF3C7', padding: '10px 12px', borderRadius: 8 }}>⚠ Consumo ainda sem dados suficientes no período. Conforme a equipe registrar as <b>saídas diárias</b> (Estoque → Baixa em Massa), este comparativo ganha vida.</div>
          : <div style={{ fontSize: 15, fontWeight: 700, padding: '12px 14px', borderRadius: 10, textAlign: 'center', background: balanco === 'ok' ? '#DCFCE7' : '#FEF3C7', color: balanco === 'ok' ? '#15803D' : '#B45309' }}>
            {balanco === 'ok' ? '🟢 Comprando de acordo com o consumo' : balanco === 'excesso' ? '🟡 Comprando ACIMA do consumo — formando estoque excessivo' : '🔴 Consumo ACIMA das compras — estoque caindo, risco de ruptura'}
          </div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        <div className="card" style={{ padding: 16 }}>
          <b style={{ fontSize: 14 }}>📈 Evolução — compras × consumo (6 semanas)</b>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140, marginTop: 14 }}>
            {evol.map((e, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, height: 110 }}>
                <div title={`Compras ${brl(e.compra)}`} style={{ width: 12, height: `${(e.compra / maxEvol) * 100}%`, minHeight: e.compra > 0 ? 3 : 0, background: '#2563EB', borderRadius: '3px 3px 0 0' }} />
                <div title={`Consumo ${brl(e.consumo)}`} style={{ width: 12, height: `${(e.consumo / maxEvol) * 100}%`, minHeight: e.consumo > 0 ? 3 : 0, background: '#EA580C', borderRadius: '3px 3px 0 0' }} />
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{e.label}</div>
            </div>)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>🟦 compras · 🟧 consumo</div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <b style={{ fontSize: 14 }}>📊 Compras por categoria (período)</b>
          <div style={{ marginTop: 12 }}>
            {porCat.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem compras no período.</div> :
              porCat.slice(0, 10).map(c => <div key={c.cat} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span>{c.cat}</span><strong>{brl(c.compra)}</strong></div>
                <div style={{ height: 8, background: 'var(--bg)', borderRadius: 99 }}><div style={{ height: '100%', width: `${(c.compra / maxCat) * 100}%`, background: CATCOR[c.cat] || '#6B7280', borderRadius: 99 }} /></div>
              </div>)}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 12 }}>Consumo = saídas de estoque × preço de referência (menor). Incorporado = compras − consumo (o que virou estoque). {loading && '· carregando…'}</div>
    </div>
  )
}
