import { useEffect, useMemo, useState } from 'react'
import { Brain, RefreshCw, X, FileText, FileSpreadsheet, AlertTriangle, Search } from 'lucide-react'
import CompradorTab from './CompradorTab'
import SemanalTab from './SemanalTab'
import { useAuth } from '../../contexts/AuthContext'
import { isOwner } from '../../lib/permissions'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import {
  type Compra, type Cfg, type Produto, type Nivel, CFG_PADRAO, NIVEL_INFO, carregarCompras, carregarCfg, salvarCfg,
  analisar, gerarAlertas, brl, pctF, dBR, titulo, baixarExcel, abrirPdf,
} from './engine'

const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box', width: '100%' }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 3 }
const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 10 })
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }

type Aba = 'semanal' | 'comprador' | 'dashboard' | 'produtos' | 'fornecedores' | 'variacoes' | 'frequencia' | 'relatorio' | 'config'
const ABAS: [Aba, string][] = [['comprador', '🛒 Comprador'], ['semanal', '🗓️ Semanal por loja'], ['dashboard', '📊 Dashboard'], ['produtos', '🧾 Produtos'], ['fornecedores', '🏪 Fornecedores'], ['variacoes', '📈 Variações'], ['frequencia', '🔁 Frequência'], ['relatorio', '📑 Relatório'], ['config', '⚙️ Configurações']]

const Badge = ({ n }: { n: Nivel }) => <span style={{ background: NIVEL_INFO[n].c + '22', color: NIVEL_INFO[n].c, border: `1px solid ${NIVEL_INFO[n].c}55`, borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{NIVEL_INFO[n].e} {NIVEL_INFO[n].l}</span>
const Kpi = ({ t, v, s, c }: { t: string; v: string; s?: string; c?: string }) => (
  <div style={{ ...card, borderLeft: `4px solid ${c || 'var(--bordo)'}` }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{t}</div><div style={{ fontSize: 22, fontWeight: 800, color: c || 'var(--bordo)' }}>{v}</div>{s && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s}</div>}</div>
)
const corPct = (p: number | null) => p == null ? 'inherit' : p > 0 ? '#DC2626' : p < 0 ? '#1D9E75' : 'inherit'

function Tabela({ cab, linhas, vazio }: { cab: string[]; linhas: React.ReactNode[][]; vazio?: string }) {
  if (!linhas.length) return <div style={{ padding: 18, color: 'var(--muted)', fontSize: 13 }}>{vazio || 'Nenhum dado para os filtros atuais.'}</div>
  return <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{cab.map(c => <th key={c} style={th}>{c}</th>)}</tr></thead>
    <tbody>{linhas.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={td}>{v}</td>)}</tr>)}</tbody></table></div>
}

function Grafico({ pts }: { pts: { data: string; preco: number }[] }) {
  if (pts.length < 2) return <div style={{ fontSize: 12, color: 'var(--muted)', padding: 12 }}>Gráfico disponível a partir de 2 datas de compra.</div>
  const W = 560, H = 200, P = 36
  const ps = pts.map(p => p.preco); const mn = Math.min(...ps), mx = Math.max(...ps); const rg = mx - mn || mx || 1
  const x = (i: number) => P + (i * (W - P - 12)) / (pts.length - 1); const y = (v: number) => H - P / 1.4 - ((v - mn) / rg) * (H - P * 1.6)
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 640, height: 'auto' }}>
    {[0, 0.5, 1].map(f => <g key={f}><line x1={P} x2={W - 8} y1={y(mn + rg * f)} y2={y(mn + rg * f)} stroke="var(--border)" /><text x={2} y={y(mn + rg * f) + 4} fontSize="9" fill="var(--muted)">{(mn + rg * f).toFixed(2)}</text></g>)}
    <polyline points={pts.map((p, i) => `${x(i)},${y(p.preco)}`).join(' ')} fill="none" stroke="#6B1212" strokeWidth="2.5" />
    {pts.map((p, i) => <g key={i}><circle cx={x(i)} cy={y(p.preco)} r="4" fill="#6B1212" /><text x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--muted)">{dBR(p.data).slice(0, 5)}</text></g>)}
  </svg>
}

function BarrasH({ itens, fmt, cor }: { itens: { l: string; v: number }[]; fmt: (n: number) => string; cor?: string }) {
  const mx = Math.max(...itens.map(i => Math.abs(i.v)), 1)
  if (!itens.length) return <div style={{ color: 'var(--muted)', fontSize: 12, padding: 8 }}>Sem dados.</div>
  return <div style={{ display: 'grid', gap: 5 }}>{itens.map((i, k) => <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px,38%) 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.l}>{i.l}</span>
    <div style={{ background: 'var(--bg)', borderRadius: 4, height: 10 }}><div style={{ width: `${Math.max(3, (Math.abs(i.v) / mx) * 100)}%`, background: cor || '#6B1212', height: 10, borderRadius: 4 }} /></div>
    <b>{fmt(i.v)}</b></div>)}</div>
}

export default function InteligenciaComprasPage() {
  const { loja: lojaCtx } = useLoja()
  const { toast } = useToast()
  const { user } = useAuth()
  const [todas, setTodas] = useState<Compra[]>([])
  const [cfg, setCfg] = useState<Cfg>(CFG_PADRAO)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('dashboard')
  const [ficha, setFicha] = useState<Produto | null>(null)
  // filtros
  const [fLoja, setFLoja] = useState(LOJAS.includes(lojaCtx) ? lojaCtx : '')
  const [fPer, setFPer] = useState('tudo'); const [fIni, setFIni] = useState(''); const [fFim, setFFim] = useState('')
  const [fForn, setFForn] = useState(''); const [fProd, setFProd] = useState(''); const [fCat, setFCat] = useState('')
  const [fPMin, setFPMin] = useState(''); const [fPMax, setFPMax] = useState('')
  const [fVMin, setFVMin] = useState(''); const [fVMax, setFVMax] = useState('')
  const [fFreq, setFFreq] = useState(''); const [fResp, setFResp] = useState('')

  const carregar = async () => {
    setLoading(true)
    try { const [c, g] = await Promise.all([carregarCompras(), carregarCfg()]); setTodas(c); setCfg(g) }
    catch (e: any) { toast('Erro ao carregar compras: ' + (e?.message || e), 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { carregar() /* eslint-disable-next-line */ }, [])

  const opcoes = useMemo(() => {
    const u = (f: (c: Compra) => string | null) => [...new Set(todas.map(f).filter(Boolean) as string[])].sort()
    return { forns: u(c => c.fornecedor_key), cats: u(c => c.categoria), resps: u(c => c.responsavel) }
  }, [todas])

  const periodo = useMemo(() => {
    const hoje = new Date(); const iso = (d: Date) => d.toISOString().slice(0, 10)
    const ago = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return iso(d) }
    if (fPer === 'dia') return [ago(0), iso(hoje)]; if (fPer === 'semana') return [ago(7), iso(hoje)]; if (fPer === 'mes') return [ago(30), iso(hoje)]
    if (fPer === 'tri') return [ago(90), iso(hoje)]; if (fPer === 'ano') return [ago(365), iso(hoje)]
    if (fPer === 'custom') return [fIni || '0000-00-00', fFim || '9999-99-99']
    return ['0000-00-00', '9999-99-99']
  }, [fPer, fIni, fFim])

  const filtradas = useMemo(() => todas.filter(c =>
    (!fLoja || c.loja === fLoja) && (!fForn || c.fornecedor_key === fForn) && (!fCat || c.categoria === fCat) && (!fResp || c.responsavel === fResp) &&
    (!fProd || c.produto_key.includes(fProd.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')) || c.descricao.toLowerCase().includes(fProd.toLowerCase())) &&
    (!c.data || (c.data >= periodo[0] && c.data <= periodo[1])) && (c.data !== null || fPer === 'tudo')), [todas, fLoja, fForn, fCat, fResp, fProd, periodo, fPer])

  const prods = useMemo(() => {
    let p = analisar(filtradas, cfg)
    if (fPMin) p = p.filter(x => x.ultimo && x.ultimo.preco >= Number(fPMin.replace(',', '.')))
    if (fPMax) p = p.filter(x => x.ultimo && x.ultimo.preco <= Number(fPMax.replace(',', '.')))
    if (fVMin) p = p.filter(x => x.pct != null && x.pct >= Number(fVMin.replace(',', '.')))
    if (fVMax) p = p.filter(x => x.pct != null && x.pct <= Number(fVMax.replace(',', '.')))
    if (fFreq === '3') p = p.filter(x => x.pontos.length >= 3); else if (fFreq === '2') p = p.filter(x => x.pontos.length >= 2)
    else if (fFreq === 'i7') p = p.filter(x => x.intervaloMedio != null && x.intervaloMedio <= 7); else if (fFreq === 'i15') p = p.filter(x => x.intervaloMedio != null && x.intervaloMedio <= 15)
    else if (fFreq === 'i30') p = p.filter(x => x.intervaloMedio != null && x.intervaloMedio > 30)
    return p
  }, [filtradas, cfg, fPMin, fPMax, fVMin, fVMax, fFreq])

  const alertas = useMemo(() => gerarAlertas(prods), [prods])
  const comVar = prods.filter(p => p.pct != null && p.nivel !== 'suspeito' && p.nivel !== 'embalagem')
  const totalComprado = prods.reduce((s, p) => s + p.total, 0)
  const varMedia = comVar.length ? comVar.reduce((s, p) => s + (p.pct || 0), 0) / comVar.length : null
  const economia = prods.reduce((s, p) => s + p.economia, 0)

  const qual = useMemo(() => ({
    total: todas.length, semPreco: todas.filter(c => c.eh_produto && !c.preco_ok).length, dataRuim: todas.filter(c => !c.data_ok).length,
    naoProd: todas.filter(c => !c.eh_produto).length, ok: todas.filter(c => c.preco_ok && c.data_ok && c.eh_produto).length,
  }), [todas])

  const limpar = () => { setFLoja(''); setFPer('tudo'); setFIni(''); setFFim(''); setFForn(''); setFProd(''); setFCat(''); setFPMin(''); setFPMax(''); setFVMin(''); setFVMax(''); setFFreq(''); setFResp('') }
  const abrirFicha = (p: Produto) => setFicha(p)
  const NomeP = ({ p }: { p: Produto }) => <a onClick={() => abrirFicha(p)} style={{ cursor: 'pointer', color: 'var(--bordo)', fontWeight: 600, textDecoration: 'underline' }}>{titulo(p.nome)}</a>

  // ── dados do relatório (usados em tela, PDF e Excel) ──
  const rel = useMemo(() => {
    const top = <T,>(a: T[], n = 10) => a.slice(0, n)
    const val = prods.filter(p => p.pct != null && p.nivel !== 'suspeito' && p.nivel !== 'embalagem')
    const maisComprados = top([...prods].sort((a, b) => b.pontos.length - a.pontos.length || b.qtdTotal - a.qtdTotal))
    const maiorGasto = top([...prods].sort((a, b) => b.total - a.total))
    const altas = top([...val].filter(p => (p.pct || 0) > 0).sort((a, b) => (b.pct || 0) - (a.pct || 0)))
    const quedas = top([...val].filter(p => (p.pct || 0) < 0).sort((a, b) => (a.pct || 0) - (b.pct || 0)))
    const difForn = top([...prods].filter(p => p.forns.length > 1 && p.difForPct <= cfg.suspeito * 100).sort((a, b) => b.difForPct - a.difForPct))
    const fornAgg = new Map<string, { n: number; soma: number }>()
    prods.forEach(p => { if (p.forns.length < 2) return; const mn = p.maisBarato!.ultimoPreco; p.forns.forEach(f => { const a = fornAgg.get(f.nome) || { n: 0, soma: 0 }; a.n++; a.soma += f.ultimoPreco / mn; fornAgg.set(f.nome, a) }) })
    const melhoresForn = top([...fornAgg.entries()].map(([nome, a]) => ({ nome, n: a.n, idx: a.soma / a.n })).sort((a, b) => a.idx - b.idx))
    const reajustes = top(prods.flatMap(p => p.forns.flatMap(f => f.reajustes.filter(r => r.pct > 0).map(r => ({ p, f: f.nome, ...r })))).sort((a, b) => b.pct - a.pct))
    const lojaCmp = prods.filter(p => p.lojas.length > 1).map(p => {
      const porLoja = new Map<string, number>(); p.pontos.forEach(pt => pt.linhas.forEach(l => porLoja.set(l.loja, 0)))
      p.lojas.forEach(lj => { const ls = p.linhas.filter(l => l.loja === lj); const d = ls.map(l => l.data as string).sort().pop()!; const u = ls.filter(l => l.data === d); porLoja.set(lj, u.reduce((s, l) => s + l.valor, 0) / u.reduce((s, l) => s + (l.qtd_base || 0), 0)) })
      const ent = [...porLoja.entries()].sort((a, b) => a[1] - b[1]); return { p, ent, dif: ent[ent.length - 1][1] / ent[0][1] * 100 - 100 }
    }).filter(x => x.dif <= cfg.suspeito * 100).sort((a, b) => b.dif - a.dif).slice(0, 10)
    const economiaL = top([...prods].filter(p => p.economia > 0).sort((a, b) => b.economia - a.economia))
    const foraPadrao = alertas.filter(a => a.tipo === 'intervalo' || a.tipo === 'critico').slice(0, 15)
    return { maisComprados, maiorGasto, altas, quedas, difForn, melhoresForn, reajustes, lojaCmp, economiaL, foraPadrao }
  }, [prods, alertas, cfg])

  const secoesRel = () => [
    { titulo: 'Ranking — produtos mais comprados', cab: ['Produto', 'Un.', 'Datas de compra', 'Qtd total', 'Total gasto'], linhas: rel.maisComprados.map(p => [titulo(p.nome), p.unBase, p.pontos.length, +p.qtdTotal.toFixed(2), brl(p.total)]) },
    { titulo: 'Maior gasto', cab: ['Produto', 'Categoria', 'Total gasto', 'Último preço'], linhas: rel.maiorGasto.map(p => [titulo(p.nome), p.categoria, brl(p.total), brl(p.ultimo?.preco)]) },
    { titulo: 'Maiores altas de preço', cab: ['Produto', 'Anterior', 'Atual', 'Variação', 'Fornecedor', 'Data'], linhas: rel.altas.map(p => [titulo(p.nome), brl(p.anterior?.preco), brl(p.ultimo?.preco), pctF(p.pct), titulo(p.ultimo?.fornecedor || ''), dBR(p.ultimo?.data)]) },
    { titulo: 'Maiores quedas de preço', cab: ['Produto', 'Anterior', 'Atual', 'Variação', 'Fornecedor', 'Data'], linhas: rel.quedas.map(p => [titulo(p.nome), brl(p.anterior?.preco), brl(p.ultimo?.preco), pctF(p.pct), titulo(p.ultimo?.fornecedor || ''), dBR(p.ultimo?.data)]) },
    { titulo: 'Maior variação entre fornecedores', cab: ['Produto', 'Mais barato', 'Mais caro', 'Diferença R$', 'Diferença %'], linhas: rel.difForn.map(p => [titulo(p.nome), `${titulo(p.maisBarato!.nome)} ${brl(p.maisBarato!.ultimoPreco)}`, `${titulo(p.maisCaro!.nome)} ${brl(p.maisCaro!.ultimoPreco)}`, brl(p.difForRs), pctF(p.difForPct)]) },
    { titulo: 'Melhores fornecedores (índice de preço vs. mais barato; 1,00 = sempre o mais barato)', cab: ['Fornecedor', 'Produtos comparados', 'Índice'], linhas: rel.melhoresForn.map(f => [titulo(f.nome), f.n, +f.idx.toFixed(3)]) },
    { titulo: 'Maiores reajustes por fornecedor', cab: ['Produto', 'Fornecedor', 'De', 'Para', 'Reajuste', 'Data'], linhas: rel.reajustes.map(r => [titulo(r.p.nome), titulo(r.f), brl(r.de), brl(r.para), pctF(r.pct), dBR(r.data)]) },
    { titulo: 'Comparativo entre lojas (último preço por unidade-base)', cab: ['Produto', 'Menor preço (loja)', 'Maior preço (loja)', 'Diferença'], linhas: rel.lojaCmp.map(x => [titulo(x.p.nome), `${x.ent[0][0]} ${brl(x.ent[0][1])}`, `${x.ent[x.ent.length - 1][0]} ${brl(x.ent[x.ent.length - 1][1])}`, pctF(x.dif)]) },
    { titulo: 'Oportunidades de economia', cab: ['Produto', 'Pago por', 'Último preço', 'Melhor alternativa', 'Economia potencial'], linhas: rel.economiaL.map(p => [titulo(p.nome), titulo(p.ultimo?.fornecedor || ''), brl(p.ultimo?.preco), `${titulo(p.maisBarato!.nome)} ${brl(p.maisBarato!.ultimoPreco)}`, brl(p.economia)]) },
    { titulo: 'Compras fora do padrão', cab: ['Alerta', 'Detalhe'], linhas: rel.foraPadrao.map(a => [a.titulo, a.detalhe]) },
  ]
  const subRel = () => `${fLoja || 'Todas as lojas'} · ${fPer === 'tudo' ? 'todo o período' : `${dBR(periodo[0])} a ${dBR(periodo[1])}`} · ${prods.length} produtos · total ${brl(totalComprado)}`
  const exportarPdf = () => { if (!abrirPdf('Análise de Mercado — Inteligência de Compras', subRel(), secoesRel())) toast('Permita pop-ups para gerar o PDF.', 'error') }
  const exportarExcel = () => {
    const abas = secoesRel().map(s => ({ nome: s.titulo.replace(/\(.*\)/, '').slice(0, 28), cab: s.cab, linhas: s.linhas }))
    abas.unshift({ nome: 'Produtos', cab: ['Produto', 'Un. base', 'Categoria', 'Lojas', 'Fornecedores', 'Última compra', 'Fornecedor', 'Último preço', 'Compra anterior', 'Preço anterior', 'Variação %', 'Dias entre compras', 'Menor', 'Maior', 'Média', 'Total comprado', 'Status', 'Origem (caixas)'],
      linhas: prods.map(p => [titulo(p.nome), p.unBase, p.categoria, p.lojas.join(', '), p.fornecedores.length, dBR(p.ultimo?.data), titulo(p.ultimo?.fornecedor || ''), p.ultimo?.preco ?? '', dBR(p.anterior?.data), p.anterior?.preco ?? '', p.pct == null ? '' : +p.pct.toFixed(2), p.diasUltimoAnterior ?? '', p.menor, p.maior, +p.media.toFixed(4), +p.total.toFixed(2), NIVEL_INFO[p.nivel].l, [...new Set(p.linhas.map(l => l.caixa_id.slice(0, 8)))].join(', ')]) })
    baixarExcel('analise-mercado-compras', abas)
  }

  const filtroBox = (
    <div style={{ ...card, marginBottom: 12 }}>
      <div style={grid(150)}>
        <div><label style={lbl}>Loja</label><select style={inp} value={fLoja} onChange={e => setFLoja(e.target.value)}><option value="">Todas</option>{LOJAS.map(l => <option key={l}>{l}</option>)}</select></div>
        <div><label style={lbl}>Período</label><select style={inp} value={fPer} onChange={e => setFPer(e.target.value)}>{[['tudo', 'Todo o histórico'], ['dia', 'Hoje'], ['semana', 'Últimos 7 dias'], ['mes', 'Últimos 30 dias'], ['tri', 'Trimestre (90d)'], ['ano', 'Ano (365d)'], ['custom', 'Personalizado']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {fPer === 'custom' && <><div><label style={lbl}>De</label><input type="date" style={inp} value={fIni} onChange={e => setFIni(e.target.value)} /></div><div><label style={lbl}>Até</label><input type="date" style={inp} value={fFim} onChange={e => setFFim(e.target.value)} /></div></>}
        <div><label style={lbl}>Fornecedor</label><select style={inp} value={fForn} onChange={e => setFForn(e.target.value)}><option value="">Todos</option>{opcoes.forns.map(f => <option key={f} value={f}>{titulo(f)}</option>)}</select></div>
        <div><label style={lbl}>Categoria</label><select style={inp} value={fCat} onChange={e => setFCat(e.target.value)}><option value="">Todas</option>{opcoes.cats.map(f => <option key={f}>{f}</option>)}</select></div>
        <div><label style={lbl}>Responsável (prestação)</label><select style={inp} value={fResp} onChange={e => setFResp(e.target.value)}><option value="">Todos</option>{opcoes.resps.map(f => <option key={f}>{f}</option>)}</select></div>
        <div><label style={lbl}>Produto</label><div style={{ position: 'relative' }}><Search size={13} style={{ position: 'absolute', left: 8, top: 10, color: 'var(--muted)' }} /><input style={{ ...inp, paddingLeft: 26 }} placeholder="Buscar produto…" value={fProd} onChange={e => setFProd(e.target.value)} /></div></div>
        <div><label style={lbl}>Preço unit. (R$) mín – máx</label><div style={{ display: 'flex', gap: 4 }}><input style={inp} inputMode="decimal" placeholder="mín" value={fPMin} onChange={e => setFPMin(e.target.value)} /><input style={inp} inputMode="decimal" placeholder="máx" value={fPMax} onChange={e => setFPMax(e.target.value)} /></div></div>
        <div><label style={lbl}>Variação % mín – máx</label><div style={{ display: 'flex', gap: 4 }}><input style={inp} inputMode="decimal" placeholder="ex.: 10" value={fVMin} onChange={e => setFVMin(e.target.value)} /><input style={inp} inputMode="decimal" placeholder="ex.: -5" value={fVMax} onChange={e => setFVMax(e.target.value)} /></div></div>
        <div><label style={lbl}>Frequência de compra</label><select style={inp} value={fFreq} onChange={e => setFFreq(e.target.value)}><option value="">Qualquer</option><option value="2">2+ datas de compra</option><option value="3">3+ datas de compra</option><option value="i7">Intervalo médio ≤ 7 dias</option><option value="i15">Intervalo médio ≤ 15 dias</option><option value="i30">Intervalo médio &gt; 30 dias</option></select></div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={limpar} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>Limpar filtros</button>
        <button className="btn" onClick={carregar} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}><RefreshCw size={12} /> Atualizar</button>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{filtradas.length} lançamentos · {prods.length} produtos analisados</span>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '16px 20px', marginBottom: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Brain size={24} /></div>
        <div style={{ flex: 1, minWidth: 200 }}><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Inteligência de Compras</h2>
          <div style={{ fontSize: 12.5, opacity: 0.9 }}>Histórico de preços, fornecedores e alertas — gerado automaticamente da Prestação de Contas e notas lançadas (sem novo lançamento)</div></div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {ABAS.map(([k, l]) => <button key={k} className="btn" onClick={() => setAba(k)} style={{ background: aba === k ? 'var(--bordo)' : 'var(--card)', color: aba === k ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}>{l}</button>)}
      </div>

      {aba !== 'config' && aba !== 'comprador' && aba !== 'semanal' && filtroBox}
      {loading ? <div style={{ ...card, color: 'var(--muted)' }}>Carregando histórico de compras…</div> : <>

      {aba === 'comprador' && <CompradorTab comprador={cfg.comprador || 'Esdras Santana'} loja={fLoja} />}

      {aba === 'semanal' && <SemanalTab todas={todas} cfg={cfg} lojaInicial={fLoja} podeEnviar={isOwner(user)} />}

      {aba === 'dashboard' && <>
        <div style={{ ...grid(190), marginBottom: 12 }}>
          <Kpi t="Total comprado (itens analisados)" v={brl(totalComprado)} s={`${prods.reduce((s, p) => s + p.linhas.length, 0)} itens com preço unitário`} />
          <Kpi t="Produtos distintos analisados" v={String(prods.length)} s={`${comVar.length} com histórico de variação`} />
          <Kpi t="Variação média de preço" v={varMedia == null ? '—' : pctF(varMedia)} s="último vs. anterior (sem embalagem/saltos suspeitos)" c={corPct(varMedia) === 'inherit' ? undefined : corPct(varMedia)} />
          <Kpi t="Economia potencial" v={brl(economia)} s="trocando p/ fornecedor mais barato na última compra" c="#1D9E75" />
          <Kpi t="Alertas ativos" v={String(alertas.length)} s={`${alertas.filter(a => a.tipo === 'critico').length} críticos`} c="#DC2626" />
        </div>
        <div style={{ ...grid(340), marginBottom: 12 }}>
          <div style={card}><b style={{ fontSize: 13 }}>Maior gasto por produto</b><div style={{ marginTop: 8 }}><BarrasH itens={rel.maiorGasto.slice(0, 8).map(p => ({ l: titulo(p.nome), v: p.total }))} fmt={brl} /></div></div>
          <div style={card}><b style={{ fontSize: 13 }}>Maiores altas (%)</b><div style={{ marginTop: 8 }}><BarrasH itens={rel.altas.slice(0, 8).map(p => ({ l: titulo(p.nome), v: p.pct || 0 }))} fmt={pctF} cor="#DC2626" /></div></div>
          <div style={card}><b style={{ fontSize: 13 }}>Maiores quedas (%)</b><div style={{ marginTop: 8 }}><BarrasH itens={rel.quedas.slice(0, 8).map(p => ({ l: titulo(p.nome), v: p.pct || 0 }))} fmt={pctF} cor="#1D9E75" /></div></div>
        </div>
        <div style={card}><b style={{ fontSize: 13 }}>🔔 Alertas automáticos (somente na tela)</b>
          <Tabela cab={['Tipo', 'Produto', 'Alerta', 'Detalhe']} vazio="Nenhum alerta com os filtros atuais." linhas={alertas.slice(0, 30).map(a => [a.tipo === 'critico' ? '🔴 Aumento crítico' : a.tipo === 'economia' ? '💰 Economia' : '⏱️ Intervalo', <NomeP p={a.produto} />, a.titulo, a.detalhe])} /></div>
      </>}

      {aba === 'produtos' && <div style={card}><Tabela cab={['Produto', 'Un.', 'Última compra', 'Fornecedor', 'Preço atual', 'Compra anterior', 'Preço anterior', 'Variação', 'Dias entre', 'Menor', 'Maior', 'Status']}
        linhas={prods.map(p => [<NomeP p={p} />, p.unBase, dBR(p.ultimo?.data), titulo(p.ultimo?.fornecedor || ''), brl(p.ultimo?.preco), dBR(p.anterior?.data), p.anterior ? brl(p.anterior.preco) : '—',
          <b style={{ color: corPct(p.pct) }}>{pctF(p.pct)}</b>, p.diasUltimoAnterior ?? '—', brl(p.menor), brl(p.maior), <Badge n={p.nivel} />])} /></div>}

      {aba === 'fornecedores' && <div style={card}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Comparação apenas entre preços na mesma unidade-base (kg, L ou un) — caixa/fardo/pacote já convertidos. Clique no produto para ver o histórico de reajustes por fornecedor.</div>
        <Tabela vazio="Nenhum produto com 2+ fornecedores nos filtros atuais." cab={['Produto', 'Un.', 'Mais barato', 'Mais caro', 'Diferença R$', 'Diferença %', 'Fornecedores (último preço)']}
          linhas={prods.filter(p => p.forns.length > 1).sort((a, b) => b.difForPct - a.difForPct).map(p => [<NomeP p={p} />, p.unBase, `${titulo(p.maisBarato!.nome)} · ${brl(p.maisBarato!.ultimoPreco)}`, `${titulo(p.maisCaro!.nome)} · ${brl(p.maisCaro!.ultimoPreco)}`, brl(p.difForRs),
            <b style={{ color: p.difForPct > cfg.suspeito * 100 ? '#6B7280' : '#DC2626' }}>{pctF(p.difForPct)}{p.difForPct > cfg.suspeito * 100 ? ' ❓' : ''}</b>, p.forns.sort((a, b) => a.ultimoPreco - b.ultimoPreco).map(f => `${titulo(f.nome)} ${brl(f.ultimoPreco)}`).join(' · ')])} /></div>}

      {aba === 'variacoes' && <>
        <div style={{ ...grid(130), marginBottom: 12 }}>
          {(['critico', 'alerta', 'atencao', 'estavel', 'caiu', 'embalagem', 'suspeito', 'sem_historico'] as Nivel[]).map(n => <div key={n} style={{ ...card, borderLeft: `4px solid ${NIVEL_INFO[n].c}` }}><div style={{ fontSize: 11, color: 'var(--muted)' }}>{NIVEL_INFO[n].e} {NIVEL_INFO[n].l}</div><div style={{ fontSize: 22, fontWeight: 800, color: NIVEL_INFO[n].c }}>{prods.filter(p => p.nivel === n).length}</div></div>)}
        </div>
        <div style={card}><div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Variação = (preço atual − anterior) ÷ anterior × 100. Estável até ±{cfg.estavel}% · atenção até {cfg.alerta}% · alerta até {cfg.critico}% · crítico acima. Mudança de embalagem e saltos acima de {cfg.suspeito}× não contam como aumento real.</div>
          <Tabela cab={['Produto', 'Status', 'Variação %', 'Variação R$', 'Data do aumento', 'Fornecedor', 'vs. média histórica', 'vs. menor preço']}
            linhas={prods.filter(p => p.pct != null).sort((a, b) => (b.pct || 0) - (a.pct || 0)).map(p => [<NomeP p={p} />, <Badge n={p.nivel} />, <b style={{ color: corPct(p.pct) }}>{pctF(p.pct)}</b>, `${(p.difRs || 0) > 0 ? '+' : ''}${brl(p.difRs)}`, dBR(p.dataAumento), titulo(p.ultimo?.fornecedor || ''), pctF(p.vsMedia), pctF(p.vsMenor)])} /></div>
      </>}

      {aba === 'frequencia' && <div style={card}>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>Consumo mensal é uma estimativa (quantidade comprada ÷ meses do período observado, mínimo 1 mês). O histórico atual é curto — a precisão melhora com o tempo.</div>
        <Tabela cab={['Produto', 'Un.', 'Datas', 'Intervalo médio', 'Compras/mês', 'Qtd média/compra', 'Valor médio', 'Consumo mensal est.', 'Observação']}
          linhas={[...prods].sort((a, b) => b.comprasMes - a.comprasMes).map(p => [<NomeP p={p} />, p.unBase, p.pontos.length, p.intervaloMedio == null ? '—' : p.intervaloMedio.toFixed(1).replace('.', ',') + ' d', p.comprasMes.toFixed(1).replace('.', ','), p.qtdMedia.toFixed(2).replace('.', ','), brl(p.valorMedio), p.consumoMensal.toFixed(2).replace('.', ',') + ' ' + p.unBase,
            [p.intervaloCurto ? '⏱️ compra excessiva' : '', p.freqCrescente ? '📈 frequência crescente' : ''].filter(Boolean).join(' · ') || '—'])} /></div>}

      {aba === 'relatorio' && <>
        <div style={{ ...card, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <b style={{ fontSize: 14, flex: 1, minWidth: 200 }}>Análise de Mercado — {subRel()}</b>
          <button className="btn" onClick={exportarPdf} style={{ background: 'var(--bordo)', color: '#fff' }}><FileText size={12} /> Exportar PDF</button>
          <button className="btn" onClick={exportarExcel} style={{ background: '#1D6F42', color: '#fff' }}><FileSpreadsheet size={12} /> Exportar Excel</button>
        </div>
        {secoesRel().map(s => <div key={s.titulo} style={{ ...card, marginBottom: 10 }}><b style={{ fontSize: 13 }}>{s.titulo}</b><Tabela cab={s.cab} linhas={s.linhas} /></div>)}
      </>}

      {aba === 'config' && <>
        <div style={{ ...card, marginBottom: 12 }}>
          <b>Limites de variação (guardados em app_config › ic_config)</b>
          <div style={{ ...grid(170), marginTop: 10 }}>
            {([['estavel', 'Estável até ±(%)'], ['alerta', 'Atenção até (%)'], ['critico', 'Alerta até (%) — acima é crítico'], ['suspeito', 'Salto suspeito (razão ×)'], ['freqCurta', 'Compra fora do padrão se intervalo < (% da média)']] as [keyof Cfg, string][]).map(([k, l]) =>
              <div key={k}><label style={lbl}>{l}</label><input style={inp} inputMode="decimal" value={String(cfg[k] as number)} onChange={e => setCfg({ ...cfg, [k]: Number(e.target.value.replace(',', '.')) || 0 })} /></div>)}
          </div>
          <div style={{ marginTop: 10, maxWidth: 320 }}><label style={lbl}>Comprador padrão (responsável por finalizar compras)</label><input style={inp} value={cfg.comprador || ''} onChange={e => setCfg({ ...cfg, comprador: e.target.value })} /></div>
          <div style={{ marginTop: 10, maxWidth: 420 }}><label style={lbl}>Resumo semanal no WhatsApp — envio MANUAL (desligado por padrão; só o Esdras libera)</label>
            <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" disabled={!isOwner(user)} checked={!!cfg.semanalWhatsApp} onChange={e => setCfg({ ...cfg, semanalWhatsApp: e.target.checked })} style={{ width: 'auto' }} /> Liberar botão “Enviar resumo no WhatsApp”</label>
            <textarea style={{ ...inp, marginTop: 6 }} rows={3} placeholder={'WhatsApps dos gestores (um por linha, com DDD)'} value={cfg.semanalFones || ''} onChange={e => setCfg({ ...cfg, semanalFones: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn" style={{ background: 'var(--bordo)', color: '#fff' }} onClick={async () => { await salvarCfg(cfg); toast('Configuração salva ✅') }}>Salvar</button>
            <button className="btn" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setCfg({ ...CFG_PADRAO, aliases: cfg.aliases })}>Restaurar padrão</button>
          </div>
        </div>
        <div style={{ ...card, marginBottom: 12 }}>
          <b>Qualidade dos dados</b>
          <div style={{ ...grid(160), marginTop: 10 }}>
            <Kpi t="Itens lançados" v={String(qual.total)} /><Kpi t="Usados nas análises" v={String(qual.ok)} c="#1D9E75" s="preço unitário + data válidos" />
            <Kpi t="Sem preço unitário" v={String(qual.semPreco)} c="#D97706" s="sem quantidade/unidade na nota" /><Kpi t="Data inválida/futura" v={String(qual.dataRuim)} c="#DC2626" s="fora de 2025 → hoje" /><Kpi t="Não são produtos" v={String(qual.naoProd)} s="pedágio, combustível, serviços" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Duplicidades (mesma loja/data/produto/valor/fornecedor) são removidas pela view <code>v_ic_compras</code>. Para entrarem nas variações, os itens precisam de quantidade e unidade na Prestação de Contas.</div>
        </div>
        <div style={card}><b>Agrupamento de nomes de produto</b>
          <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 8px' }}>Os nomes já são normalizados (sem acento/maiúsculas/ruídos). Para unir variações restantes, abra a ficha do produto e use “Unir a outro produto”. Uniões atuais: {Object.keys(cfg.aliases).length}.</div>
          {Object.entries(cfg.aliases).map(([a, b]) => <div key={a} style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}><span>{a} → <b>{b}</b></span><button className="btn" style={{ padding: '2px 8px' }} onClick={async () => { const n = { ...cfg, aliases: { ...cfg.aliases } }; delete n.aliases[a]; setCfg(n); await salvarCfg(n) }}>desfazer</button></div>)}
        </div>
      </>}
      </>}

      {ficha && <Ficha p={ficha} cfg={cfg} todos={prods} onClose={() => setFicha(null)} onUnir={async (alvo) => { const n = { ...cfg, aliases: { ...cfg.aliases } }; ficha.linhas.forEach(l => { n.aliases[l.produto_key] = alvo }); setCfg(n); await salvarCfg(n); setFicha(null); toast('Produtos unidos ✅') }} />}
    </div>
  )
}

function Ficha({ p, cfg, todos, onClose, onUnir }: { p: Produto; cfg: Cfg; todos: Produto[]; onClose: () => void; onUnir: (alvoKey: string) => void }) {
  const [alvo, setAlvo] = useState('')
  const linhas = [...p.linhas].sort((a, b) => (b.data || '').localeCompare(a.data || ''))
  const dias = (i: number) => { const a = linhas[i], b = linhas[i + 1]; if (!b || !a.data || !b.data || a.data === b.data) return '—'; return Math.round((new Date(a.data).getTime() - new Date(b.data).getTime()) / 86400000) }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 12, overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, width: '100%', maxWidth: 980, padding: 18, marginTop: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><h3 style={{ margin: 0, flex: 1, color: 'var(--bordo)' }}>{titulo(p.nome)} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>· preços por {p.unBase} · {p.categoria}</span></h3><button className="btn" onClick={onClose}><X size={14} /></button></div>
        <div style={{ ...grid(140), margin: '12px 0' }}>
          <Kpi t="Último preço" v={brl(p.ultimo?.preco)} s={`${dBR(p.ultimo?.data)} · ${titulo(p.ultimo?.fornecedor || '')}`} />
          <Kpi t="Variação" v={pctF(p.pct)} s={p.difRs != null ? `${brl(p.difRs)} vs. ${dBR(p.anterior?.data)}` : 'sem compra anterior'} c={corPct(p.pct) === 'inherit' ? undefined : corPct(p.pct)} />
          <Kpi t="Menor / maior" v={`${brl(p.menor)} / ${brl(p.maior)}`} s={`média ${brl(p.media)}`} />
          <Kpi t="Total comprado" v={brl(p.total)} s={`${p.qtdTotal.toFixed(2)} ${p.unBase} em ${p.pontos.length} data(s)`} />
        </div>
        <div style={{ marginBottom: 8 }}><Badge n={p.nivel} /> {p.nivel === 'embalagem' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>A embalagem mudou entre as duas últimas compras — não é tratado como aumento real.</span>}{p.nivel === 'suspeito' && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Salto de preço improvável: provável erro de unidade/quantidade no lançamento.</span>}</div>
        <b style={{ fontSize: 13 }}>Evolução do preço ({p.unBase})</b>
        <Grafico pts={p.pontos} />
        <b style={{ fontSize: 13 }}>Histórico completo de compras</b>
        <Tabela cab={['Data', 'Loja', 'Fornecedor', 'Qtd', 'Embalagem', `Preço/${p.unBase}`, 'Total', 'Dias', 'Responsável', 'Origem']}
          linhas={linhas.map((l, i) => [dBR(l.data), l.loja, titulo(l.fornecedor_key), `${l.quantidade ?? ''} ${l.unidade ?? ''}`, l.embalagem || '—', brl(l.preco_base), brl(l.valor), dias(i), l.responsavel || '—', <span title={`caixa ${l.caixa_id}${l.prestacao_id ? ' · prestação ' + l.prestacao_id : ''}`} style={{ fontSize: 10.5, color: 'var(--muted)' }}>{l.caixa_titulo ? l.caixa_titulo.slice(0, 24) : l.caixa_id.slice(0, 8)}</span>])} />
        {p.forns.length > 0 && <><b style={{ fontSize: 13, display: 'block', marginTop: 12 }}>Fornecedores e reajustes</b>
          <Tabela cab={['Fornecedor', 'Último preço', 'Data', 'Menor', 'Maior', 'Compras', 'Reajustes']} linhas={[...p.forns].sort((a, b) => a.ultimoPreco - b.ultimoPreco).map(f => [titulo(f.nome) + (f === p.maisBarato && p.forns.length > 1 ? ' 🏆' : ''), brl(f.ultimoPreco), dBR(f.ultimaData), brl(f.menor), brl(f.maior), f.compras, f.reajustes.length ? f.reajustes.map(r => `${dBR(r.data)}: ${brl(r.de)}→${brl(r.para)} (${pctF(r.pct)})`).join(' · ') : '—'])} /></>}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12 }}>
          <AlertTriangle size={13} color="#D97706" /> Unir a outro produto (mesmo item com nome diferente):
          <select style={{ ...inp, width: 260 }} value={alvo} onChange={e => setAlvo(e.target.value)}><option value="">Selecione…</option>{todos.filter(x => x.key !== p.key && x.unBase === p.unBase).map(x => <option key={x.key} value={x.key.split('|')[0]}>{titulo(x.nome)}</option>)}</select>
          <button className="btn" disabled={!alvo} onClick={() => onUnir(alvo)} style={{ background: 'var(--bordo)', color: '#fff' }}>Unir</button>
          <span style={{ color: 'var(--muted)' }}>(limite suspeito atual: {cfg.suspeito}×)</span>
        </div>
      </div>
    </div>
  )
}
