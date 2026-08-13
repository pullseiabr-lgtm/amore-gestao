import { useState, useEffect, useCallback, useMemo } from 'react'
import { RefreshCw, Printer, ShoppingCart, Boxes, Utensils, AlertTriangle, TrendingDown, PackageX, ClipboardList, Wallet } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchTodosCaixaItens, fetchEstoqueProdutos, fetchEstoqueMovimentacoesRange,
  fetchEstoquePerdas, fetchRequisicoes, fetchFornecedores,
} from '../../lib/db'
import type { EstoqueProduto, CaixaItem, EstoqueMovimentacao, EstoquePerda, Requisicao } from '../../types/database'
import GestaoNav from './GestaoNav'

const brl = (v: number) => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const norm = (s?: string | null) => (s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

type PeriodoId = 'hoje' | 'ontem' | 'semana' | 'semana-ant' | 'mes' | 'mes-ant' | 'custom'
function rangeDe(p: PeriodoId, c1: string, c2: string): [string, string] {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const d = (x: Date) => iso(x)
  const clone = (x: Date) => new Date(x)
  const segAtual = () => { const x = clone(hoje); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x }
  if (p === 'hoje') return [d(hoje), d(hoje)]
  if (p === 'ontem') { const y = clone(hoje); y.setDate(y.getDate() - 1); return [d(y), d(y)] }
  if (p === 'semana') return [d(segAtual()), d(hoje)]
  if (p === 'semana-ant') { const s = segAtual(); const ini = clone(s); ini.setDate(ini.getDate() - 7); const fim = clone(s); fim.setDate(fim.getDate() - 1); return [d(ini), d(fim)] }
  if (p === 'mes') return [d(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), d(hoje)]
  if (p === 'mes-ant') return [d(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), d(new Date(hoje.getFullYear(), hoje.getMonth(), 0))]
  return [c1 || d(hoje), c2 || d(hoje)]
}
const dentro = (data: string | null | undefined, ini: string, fim: string) => { if (!data) return false; const dd = String(data).slice(0, 10); return dd >= ini && dd <= fim }

const CATCOR: Record<string, string> = { Hortifruti: '#16A34A', Supermercado: '#2563EB', Mercearia: '#2563EB', Bebidas: '#0891B2', 'Embalagens/Descartaveis': '#B45309', Descartaveis: '#B45309', Combustivel: '#DC2626', Pedagio: '#9333EA', Temperos: '#EA580C', Folhagens: '#65A30D', Congelados: '#0EA5E9', Frios: '#CA8A04', Limpeza: '#0D9488', Acougue: '#B91C1C', Outros: '#6B7280' }
const corCat = (c?: string | null) => CATCOR[c || 'Outros'] || '#6B7280'

function Kpi({ icon, label, value, sub, cor }: { icon: React.ReactNode; label: string; value: string; sub?: string; cor: string }) {
  return <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', borderLeft: `4px solid ${cor}` }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: cor, marginBottom: 4 }}>{icon}<span style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600 }}>{label}</span></div>
    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{sub}</div>}
  </div>
}
function Bar({ label, val, max, cor, fmt }: { label: string; val: number; max: number; cor: string; fmt: (v: number) => string }) {
  return <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>{label}</span><strong>{fmt(val)}</strong></div>
    <div style={{ height: 8, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${max > 0 ? (val / max) * 100 : 0}%`, background: cor, borderRadius: 99 }} /></div>
  </div>
}
const Card: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) =>
  <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><b style={{ fontSize: 14 }}>{title}</b>{extra}</div>
    {children}
  </div>

export default function PainelGestaoPage() {
  const { loja } = useLoja()
  const [periodo, setPeriodo] = useState<PeriodoId>('semana')
  const [c1, setC1] = useState(''); const [c2, setC2] = useState('')
  const [loading, setLoading] = useState(true)
  const [caixaItens, setCaixaItens] = useState<CaixaItem[]>([])
  const [produtos, setProdutos] = useState<EstoqueProduto[]>([])
  const [movs, setMovs] = useState<EstoqueMovimentacao[]>([])
  const [perdas, setPerdas] = useState<EstoquePerda[]>([])
  const [reqs, setReqs] = useState<Requisicao[]>([])
  const [nForn, setNForn] = useState(0)

  const [ini, fim] = useMemo(() => rangeDe(periodo, c1, c2), [periodo, c1, c2])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const seisSemanas = iso(new Date(Date.now() - 45 * 864e5))
      const [ci, pr, mv, pe, rq, fo] = await Promise.all([
        fetchTodosCaixaItens(loja).catch(() => []),
        fetchEstoqueProdutos(loja).catch(() => []),
        fetchEstoqueMovimentacoesRange(loja, seisSemanas, fim).catch(() => []),
        fetchEstoquePerdas(loja).catch(() => []),
        fetchRequisicoes(loja).catch(() => []),
        fetchFornecedores(loja).catch(() => []),
      ])
      setCaixaItens(ci); setProdutos(pr); setMovs(mv); setPerdas(pe); setReqs(rq); setNForn(fo.length)
    } catch { /* noop */ }
    setLoading(false)
  }, [loja, fim])
  useEffect(() => { load() }, [load])

  // ── Compras (do período) ──
  const comprasItens = useMemo(() => caixaItens.filter(i => dentro(i.data, ini, fim)), [caixaItens, ini, fim])
  const comprasTotal = comprasItens.reduce((s, i) => s + (Number(i.valor) || 0), 0)
  const qtdComprada = comprasItens.reduce((s, i) => s + (Number((i as any).quantidade) || 0), 0)
  const porCategoria = useMemo(() => { const m: Record<string, number> = {}; comprasItens.forEach(i => { const c = i.categoria || 'Outros'; m[c] = (m[c] || 0) + (Number(i.valor) || 0) }); return Object.entries(m).sort((a, b) => b[1] - a[1]) }, [comprasItens])
  const porFornecedor = useMemo(() => { const m: Record<string, { v: number; n: number }> = {}; comprasItens.forEach(i => { const f = i.fornecedor || 'Não informado'; (m[f] = m[f] || { v: 0, n: 0 }); m[f].v += Number(i.valor) || 0; m[f].n++ }); return Object.entries(m).map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.v - a.v) }, [comprasItens])
  // evolução semanal (6 semanas)
  const evolucao = useMemo(() => {
    const sems: { label: string; ini: string; fim: string; v: number }[] = []
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const dow = (hoje.getDay() + 6) % 7; const seg = new Date(hoje); seg.setDate(seg.getDate() - dow)
    for (let k = 5; k >= 0; k--) { const s = new Date(seg); s.setDate(s.getDate() - k * 7); const e = new Date(s); e.setDate(e.getDate() + 6); sems.push({ label: `${s.getDate()}/${s.getMonth() + 1}`, ini: iso(s), fim: iso(e), v: 0 }) }
    caixaItens.forEach(i => { const s = sems.find(x => dentro(i.data, x.ini, x.fim)); if (s) s.v += Number(i.valor) || 0 })
    return sems
  }, [caixaItens])

  // ── Estoque ──
  const precoDe = useMemo(() => { const m: Record<string, number> = {}; produtos.forEach(p => { m[norm(p.nome)] = Number(p.preco_unitario) || 0 }); return m }, [produtos])
  const estoqueValor = produtos.reduce((s, p) => s + (Number(p.nivel_atual) || 0) * (Number(p.preco_unitario) || 0), 0)
  const statusProd = (p: EstoqueProduto) => { const n = Number(p.nivel_atual) || 0, mi = Number(p.nivel_minimo) || 0; if (mi <= 0) return n > 0 ? 'ok' : 'zero'; if (n <= 0) return 'zero'; if (n < mi) return 'comprar'; if (n < mi * 1.3) return 'atencao'; return 'ok' }
  const abaixoMin = produtos.filter(p => { const s = statusProd(p); return s === 'comprar' || s === 'zero' })
  const adequados = produtos.filter(p => statusProd(p) === 'ok' && (Number(p.nivel_atual) || 0) > 0).length
  const movProdIds = useMemo(() => new Set(movs.map(m => m.produto_id)), [movs])
  const semMov = produtos.filter(p => (Number(p.nivel_atual) || 0) > 0 && !movProdIds.has(p.id)).length

  // ── Consumo (saídas do período) ──
  const saidas = useMemo(() => movs.filter(m => m.tipo === 'saida' && dentro(m.created_at, ini, fim)), [movs, ini, fim])
  const consumoQtd = saidas.reduce((s, m) => s + (Number(m.quantidade) || 0), 0)
  const custoConsumo = saidas.reduce((s, m) => s + (Number(m.quantidade) || 0) * (precoDe[norm(m.produto_nome)] || 0), 0)
  const topConsumo = useMemo(() => { const m: Record<string, { q: number; c: number }> = {}; saidas.forEach(s => { const k = s.produto_nome || '—'; (m[k] = m[k] || { q: 0, c: 0 }); m[k].q += Number(s.quantidade) || 0; m[k].c += (Number(s.quantidade) || 0) * (precoDe[norm(s.produto_nome)] || 0) }); return Object.entries(m).map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.c - a.c).slice(0, 10) }, [saidas, precoDe])

  // ── Perdas ──
  const perdasP = useMemo(() => perdas.filter(p => dentro(p.created_at, ini, fim)), [perdas, ini, fim])
  const perdaPorTipo = useMemo(() => { const m: Record<string, number> = {}; perdasP.forEach(p => { const t = (p as any).tipo_perda || 'Outros'; m[t] = (m[t] || 0) + (Number((p as any).valor_estimado) || 0) }); return m }, [perdasP])
  const perdasTotal = Object.values(perdaPorTipo).reduce((s, v) => s + v, 0)
  const indicePerda = comprasTotal > 0 ? (perdasTotal / comprasTotal) * 100 : 0

  // ── Solicitações ──
  const reqAbertas = reqs.filter(r => !['concluida', 'cancelada', 'reprovada'].includes(String(r.status))).length

  // ── Compras × Consumo ──
  const incorporado = comprasTotal - custoConsumo
  const balanco = custoConsumo === 0 ? null : (comprasTotal > custoConsumo * 1.3 ? 'excesso' : comprasTotal < custoConsumo * 0.8 ? 'abaixo' : 'ok')

  const maxCat = Math.max(1, ...porCategoria.map(c => c[1]))
  const maxForn = Math.max(1, ...porFornecedor.map(f => f.v))
  const maxEvol = Math.max(1, ...evolucao.map(e => e.v))
  const maxCons = Math.max(1, ...topConsumo.map(t => t.c))

  const PERIODOS: [PeriodoId, string][] = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Semana'], ['semana-ant', 'Sem. ant.'], ['mes', 'Mês'], ['mes-ant', 'Mês ant.'], ['custom', 'Período']]

  return (
    <div>
      <div className="no-print"><GestaoNav active="painel-gestao" /></div>
      <div className="no-print" style={{ background: 'linear-gradient(135deg,#6B1212,#8a2a2a)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}><h2 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>📊 Painel de Gestão</h2><div style={{ fontSize: 12.5, opacity: .85 }}>Compras · Estoque · Consumo · Custos · Perdas — {loja} · {ini === fim ? ini.split('-').reverse().join('/') : `${ini.split('-').reverse().join('/')} a ${fim.split('-').reverse().join('/')}`}</div></div>
        <button className="btn" onClick={() => window.print()} style={{ background: '#fff', color: 'var(--bordo)', padding: '8px 13px' }}><Printer size={15} /> Relatório</button>
        <button className="btn bo" onClick={load} style={{ borderColor: 'rgba(255,255,255,.4)', color: '#fff', padding: '8px 11px' }}><RefreshCw size={15} /></button>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {PERIODOS.map(([id, l]) => <button key={id} className="btn" onClick={() => setPeriodo(id)} style={{ padding: '5px 11px', fontSize: 12.5, background: periodo === id ? 'var(--bordo)' : 'transparent', color: periodo === id ? '#fff' : 'var(--text)', border: 'none' }}>{l}</button>)}
        </div>
        {periodo === 'custom' && <><input type="date" value={c1} onChange={e => setC1(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5 }} /><span>a</span><input type="date" value={c2} onChange={e => setC2(e.target.value)} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5 }} /></>}
        {loading && <span style={{ fontSize: 12, color: 'var(--muted)' }}>carregando…</span>}
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        <Kpi icon={<ShoppingCart size={14} />} label="Compras" value={brl(comprasTotal)} sub={`${comprasItens.length} lançamentos`} cor="#2563EB" />
        <Kpi icon={<Boxes size={14} />} label="Produtos comprados" value={num(qtdComprada)} sub="un/kg/L" cor="#4338CA" />
        <Kpi icon={<Utensils size={14} />} label="Consumo (custo)" value={brl(custoConsumo)} sub={`${num(consumoQtd)} un · ${saidas.length} saídas`} cor="#EA580C" />
        <Kpi icon={<Wallet size={14} />} label="Estoque atual" value={brl(estoqueValor)} sub={`${produtos.filter(p => (p.nivel_atual || 0) > 0).length} itens c/ saldo`} cor="#15803D" />
        <Kpi icon={<TrendingDown size={14} />} label="Perdas totais" value={brl(perdasTotal)} sub={`${indicePerda.toFixed(1)}% das compras`} cor="#B91C1C" />
        <Kpi icon={<ClipboardList size={14} />} label="Solicitações" value={String(reqAbertas)} sub={`${reqs.length} no total`} cor="#7C3AED" />
        <Kpi icon={<AlertTriangle size={14} />} label="Abaixo do mínimo" value={String(abaixoMin.length)} sub="comprar" cor="#DC2626" />
        <Kpi icon={<PackageX size={14} />} label="Sem movimentação" value={String(semMov)} sub="parado" cor="#6B7280" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14 }}>
        {/* Compras: evolução */}
        <Card title="📈 Evolução das compras (6 semanas)">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 130 }}>
            {evolucao.map((e, i) => <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{e.v > 0 ? (e.v / 1000).toFixed(1) + 'k' : ''}</div>
              <div style={{ height: `${(e.v / maxEvol) * 100}%`, minHeight: e.v > 0 ? 4 : 0, background: 'linear-gradient(180deg,#2563EB,#60A5FA)', borderRadius: '6px 6px 0 0' }} />
              <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 4 }}>{e.label}</div>
            </div>)}
          </div>
        </Card>

        {/* Compras por categoria */}
        <Card title="📊 Compras por categoria">
          {porCategoria.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem compras no período.</div> :
            porCategoria.slice(0, 9).map(([c, v]) => <Bar key={c} label={c} val={v} max={maxCat} cor={corCat(c)} fmt={brl} />)}
        </Card>

        {/* Compras × Consumo */}
        <Card title="⚖️ Compras × Consumo">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Compras</div><b style={{ color: '#2563EB' }}>{brl(comprasTotal)}</b></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Consumo</div><b style={{ color: '#EA580C' }}>{brl(custoConsumo)}</b></div>
            <div><div style={{ fontSize: 11, color: 'var(--muted)' }}>Incorporado</div><b style={{ color: incorporado >= 0 ? '#15803D' : '#B91C1C' }}>{brl(incorporado)}</b></div>
          </div>
          {balanco === null ? <div style={{ fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '8px 10px', borderRadius: 8 }}>⚠ Consumo ainda sem dados suficientes. Registre as <b>saídas</b> do estoque (baixa em massa / PDV) para ativar este indicador.</div>
            : <div style={{ fontSize: 12.5, fontWeight: 600, padding: '8px 10px', borderRadius: 8, background: balanco === 'ok' ? '#DCFCE7' : '#FEF3C7', color: balanco === 'ok' ? '#15803D' : '#B45309' }}>{balanco === 'ok' ? '🟢 Comprando de acordo com o consumo' : balanco === 'excesso' ? '🟡 Comprando acima do consumo (formando estoque)' : '🔴 Consumo acima das compras (estoque caindo)'}</div>}
        </Card>

        {/* Estoque status */}
        <Card title="📦 Estoque — situação" extra={<span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>{brl(estoqueValor)}</span>}>
          {[['🟢 Adequado', adequados, '#15803D'], ['🔴 Comprar / zerado', abaixoMin.length, '#DC2626'], ['⚫ Sem movimentação', semMov, '#6B7280']].map(([l, n, c]: any) =>
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}><span>{l}</span><b style={{ color: c }}>{n}</b></div>)}
          {estoqueValor === 0 && <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 8 }}>⚠ Alguns produtos estão sem preço unitário — o valor em R$ fica subestimado. Cadastre o preço para o estoque valorizar certo.</div>}
        </Card>

        {/* Previsão de compra */}
        <Card title="🔮 Previsão de compra (abaixo do mínimo)">
          {abaixoMin.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nenhum item abaixo do mínimo. 🟢</div> :
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}><th style={{ padding: 4 }}>Produto</th><th>Atual</th><th>Mín.</th><th>Sugerir</th></tr></thead>
              <tbody>{abaixoMin.slice(0, 12).map(p => { const alvo = Number(p.nivel_ideal) || Number(p.nivel_minimo) * 2 || 0; const sug = Math.max(0, Math.ceil(alvo - (Number(p.nivel_atual) || 0)))
                return <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}><td style={{ padding: '4px', fontWeight: 600 }}>{p.nome}</td><td style={{ color: '#DC2626', fontWeight: 700 }}>{p.nivel_atual}</td><td>{p.nivel_minimo}</td><td><b style={{ color: '#15803D' }}>{sug}</b></td></tr> })}</tbody>
            </table>{abaixoMin.length > 12 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>+{abaixoMin.length - 12} itens</div>}</div>}
        </Card>

        {/* Ranking fornecedores */}
        <Card title="🚚 Ranking de fornecedores (no período)">
          {porFornecedor.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Sem compras no período. ({nForn} fornecedores cadastrados)</div> :
            porFornecedor.slice(0, 8).map(f => <Bar key={f.nome} label={`${f.nome} · ${f.n}x`} val={f.v} max={maxForn} cor="#6B1212" fmt={brl} />)}
        </Card>

        {/* Consumo top */}
        <Card title="🍽️ Top consumo (por custo)">
          {topConsumo.length === 0 ? <div style={{ fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '8px 10px', borderRadius: 8 }}>⚠ Sem saídas registradas no período. O consumo aparece aqui quando a equipe registrar as baixas de estoque.</div> :
            topConsumo.map(t => <Bar key={t.nome} label={`${t.nome} · ${num(t.q)}`} val={t.c} max={maxCons} cor="#EA580C" fmt={brl} />)}
        </Card>

        {/* Perdas */}
        <Card title="⚠️ Perdas — desperdício / avaria / vencimento" extra={<span style={{ fontSize: 12, fontWeight: 700, color: '#B91C1C' }}>{indicePerda.toFixed(1)}%</span>}>
          {perdasTotal === 0 ? <div style={{ fontSize: 12, color: '#B45309', background: '#FEF3C7', padding: '8px 10px', borderRadius: 8 }}>⚠ Sem perdas registradas no período. Registre desperdícios/avarias em <b>Estoque → Perdas</b> para acompanhar aqui (meta ≤ 2%).</div> :
            <>{Object.entries(perdaPorTipo).sort((a, b) => b[1] - a[1]).map(([t, v]) => <Bar key={t} label={t} val={v} max={Math.max(1, ...Object.values(perdaPorTipo))} cor="#B91C1C" fmt={brl} />)}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, fontWeight: 700 }}><span>Perda total</span><span style={{ color: '#B91C1C' }}>{brl(perdasTotal)}</span></div>
              <div style={{ fontSize: 11, color: indicePerda <= 2 ? '#15803D' : '#B45309', marginTop: 2 }}>🎯 Meta ≤ 2% · atual {indicePerda.toFixed(1)}%</div></>}
        </Card>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 14, textAlign: 'center' }}>
        Painel de Gestão Amore · dados de Compras (caixas/notas), Estoque, Consumo (saídas) e Perdas · {new Date().toLocaleString('pt-BR')}
      </div>
    </div>
  )
}
