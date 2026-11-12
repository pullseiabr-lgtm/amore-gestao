import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { type Compra, type Cfg, brl, dBR, pctF, titulo } from './engine'
import { addDias } from './semanal'

const sb = supabase as any
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }
const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }
const th: React.CSSProperties = { textAlign: 'left', padding: '7px 9px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 9px', fontSize: 12.5, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const LOJAS = ['Amore Paiva', 'Amore CD', 'Flow CD']

interface Real { origem: string; loja: string; data: string; produto_key: string; un_base: string; qtd_base: number }
interface Est { loja: string; produto_key: string; nivel_atual: number; nome: string }
interface Linha {
  loja: string; chave: string; nome: string; un: string
  c30: number; c60: number; c90: number; r30: number; r90: number; temReal: boolean
  consumoDia: number; fonte: 'real' | 'estimado'; nCompras: number; intervalo: number | null; qtdMedia: number
  mudancaFreq: number | null; tendencia: 'alta' | 'queda' | 'estável' | '—'; evol: number | null
  saldo: number | null; cobertura: number | null; reposicao: string | null; difCompradoConsumido: number | null; preco: number | null; porDiaAtivo: number
}

const dias = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)

export default function ConsumoTab({ todas, cfg, lojaInicial }: { todas: Compra[]; cfg: Cfg; lojaInicial: string }) {
  const [real, setReal] = useState<Real[]>([])
  const [est, setEst] = useState<Est[]>([])
  const refPadrao = useMemo(() => todas.filter(c => c.data_ok && c.data).map(c => c.data!).sort().pop() || new Date().toISOString().slice(0, 10), [todas])
  const [ref, setRef] = useState('')
  const [loja, setLoja] = useState(lojaInicial)
  const [busca, setBusca] = useState('')
  const refD = ref || refPadrao

  useEffect(() => {
    sb.from('v_ic_consumo_real').select('*').then(({ data }: any) => setReal((data || []).map((r: any) => ({ ...r, qtd_base: Number(r.qtd_base) }))))
    sb.from('v_ic_estoque_atual').select('*').then(({ data }: any) => setEst((data || []).map((r: any) => ({ ...r, nivel_atual: Number(r.nivel_atual) }))))
  }, [])

  const { linhas, diasAtivos } = useMemo(() => {
    const key = (k: string, un: string) => (cfg.aliases[k] || k) + '|' + un
    const base = todas.filter(c => c.data_ok && c.eh_produto && c.data && c.preco_ok && c.data <= refD)
    const ini90 = addDias(refD, -89), ini60 = addDias(refD, -59), ini30 = addDias(refD, -29), ini30p = addDias(refD, -59), fim30p = addDias(refD, -30)
    const diasAtivos: Record<string, number> = {}
    LOJAS.forEach(l => { diasAtivos[l] = new Set(todas.filter(c => c.loja === l && c.data && c.data >= ini30 && c.data <= refD).map(c => c.data)).size })
    const grupos = new Map<string, Compra[]>(); base.forEach(c => { const k = c.loja + '#' + key(c.produto_key, c.un_base); grupos.set(k, [...(grupos.get(k) || []), c]) })
    const out: Linha[] = []
    grupos.forEach((ls, k) => {
      const [lj, chave] = [k.split('#')[0], k.split('#')[1]]
      const s = (a: Compra[], de: string, ate: string) => a.filter(c => c.data! >= de && c.data! <= ate).reduce((t, c) => t + (c.qtd_base || 0), 0)
      const c30 = s(ls, ini30, refD), c60 = s(ls, ini60, refD), c90 = s(ls, ini90, refD), c30p = s(ls, ini30p, fim30p)
      if (c90 === 0) return
      const datas = [...new Set(ls.filter(c => c.data! >= ini90).map(c => c.data!))].sort()
      const ints = datas.slice(1).map((d, i) => dias(datas[i], d))
      const intervalo = ints.length ? ints.reduce((t, x) => t + x, 0) / ints.length : null
      let mudancaFreq: number | null = null
      if (ints.length >= 3) { const rec = ints.slice(-2).reduce((t, x) => t + x, 0) / 2; const ant = ints.slice(0, -2).reduce((t, x) => t + x, 0) / (ints.length - 2); mudancaFreq = ant > 0 ? (rec - ant) / ant * 100 : null }
      const pk = chave.split('|')[0]; const un = chave.split('|')[1]
      const rr = real.filter(r => r.loja === lj && (cfg.aliases[r.produto_key] || r.produto_key) === pk && r.un_base === un)
      const r30 = rr.filter(r => r.data >= ini30 && r.data <= refD).reduce((t, r) => t + r.qtd_base, 0); const r90 = rr.filter(r => r.data >= ini90 && r.data <= refD).reduce((t, r) => t + r.qtd_base, 0)
      const temReal = r90 > 0
      const consumoDia = temReal ? r90 / 90 : c90 / 90
      const e = est.filter(x => x.loja === lj && (cfg.aliases[x.produto_key] || x.produto_key) === pk)
      const saldo = e.length ? e.reduce((t, x) => t + x.nivel_atual, 0) : null
      const cobertura = saldo != null && consumoDia > 0 ? saldo / consumoDia : null
      const valor = ls.filter(c => c.data! >= ini90).reduce((t, c) => t + c.valor, 0), q = ls.filter(c => c.data! >= ini90).reduce((t, c) => t + (c.qtd_base || 0), 0)
      out.push({ loja: lj, chave, nome: ls.sort((a, b) => b.valor - a.valor)[0].descricao, un, c30, c60, c90, r30, r90, temReal, consumoDia, fonte: temReal ? 'real' : 'estimado', nCompras: datas.length, intervalo,
        qtdMedia: c90 / Math.max(datas.length, 1), mudancaFreq, evol: c30p > 0 ? (c30 - c30p) / c30p * 100 : null, tendencia: c30p > 0 ? (c30 > c30p * 1.15 ? 'alta' : c30 < c30p * 0.85 ? 'queda' : 'estável') : '—',
        saldo, cobertura, reposicao: cobertura != null ? addDias(refD, Math.floor(cobertura)) : null, difCompradoConsumido: temReal ? c90 - r90 : null, preco: q > 0 ? valor / q : null,
        porDiaAtivo: c30 / Math.max(diasAtivos[lj] || 1, 1) })
    })
    return { linhas: out.sort((a, b) => b.c90 - a.c90), diasAtivos }
  }, [todas, real, est, cfg, refD])

  const vis = linhas.filter(l => (!loja || l.loja === loja) && (!busca || l.nome.toLowerCase().includes(busca.toLowerCase())))
  // comparativo entre lojas (mesmo produto em 2+ lojas), normalizado por dia ativo de cada loja
  const comp = useMemo(() => {
    const m = new Map<string, Linha[]>(); linhas.forEach(l => m.set(l.chave, [...(m.get(l.chave) || []), l]))
    return [...m.values()].filter(a => a.length > 1).map(a => {
      const ord = [...a].sort((x, y) => y.porDiaAtivo - x.porDiaAtivo); const maiorP = [...a].filter(x => x.preco).sort((x, y) => (y.preco || 0) - (x.preco || 0))[0]; const menorP = [...a].filter(x => x.preco).sort((x, y) => (x.preco || 0) - (y.preco || 0))[0]
      const excesso = ord[0].porDiaAtivo > (ord[1].porDiaAtivo || 0) * 1.5 && ord[1].porDiaAtivo > 0
      return { nome: a[0].nome, un: a[0].un, ord, maiorP, menorP, excesso, spread: maiorP && menorP && menorP.preco ? ((maiorP.preco! - menorP.preco) / menorP.preco) * 100 : 0 }
    }).filter(x => x.spread <= cfg.suspeito * 100).sort((a, b) => b.spread - a.spread).slice(0, 25)
  }, [linhas, cfg])

  const n2 = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return <div>
    <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block' }}>Loja</label><select style={inp} value={loja} onChange={e => setLoja(e.target.value)}><option value="">Todas</option>{LOJAS.map(l => <option key={l}>{l}</option>)}</select></div>
      <div><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block' }}>Data de referência</label><input type="date" style={inp} value={refD} onChange={e => setRef(e.target.value)} /></div>
      <div><label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block' }}>Produto</label><input style={inp} placeholder="buscar…" value={busca} onChange={e => setBusca(e.target.value)} /></div>
      <div style={{ flex: 1, minWidth: 240, fontSize: 12, color: 'var(--muted)' }}>
        <b>Fonte do consumo:</b> “real” = baixas de estoque + perdas + transferências enviadas; sem esses registros, mostra <b>estimativa</b> pelas compras (90 dias). Hoje há {real.length} registro(s) de consumo real no sistema — a maioria dos produtos aparece como <b>estimado</b>. Dias ativos (30d, base da normalização): {LOJAS.map(l => `${l}: ${diasAtivos[l] || 0}`).join(' · ')}. Vendas/produção não estão registradas em volume suficiente para normalizar por faturamento.
      </div>
    </div>
    <div style={card}><b style={{ fontSize: 13 }}>Consumo por produto e loja</b>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
        <thead><tr>{['Loja', 'Produto', 'Un.', 'Consumo/dia', 'Semana', 'Mês', 'Fonte', 'Comprado 30/60/90d', 'Tendência 30d', 'Compras', 'Intervalo', 'Mudança freq.', 'Qtd média/compra', 'Saldo estoque', 'Cobertura / reposição', 'Comprado − consumido (90d)'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{vis.slice(0, 200).map(l => <tr key={l.loja + l.chave}>
          <td style={td}>{l.loja}</td><td style={td}><b>{titulo(l.nome)}</b></td><td style={td}>{l.un}</td><td style={td}>{n2(l.consumoDia)}</td><td style={td}>{n2(l.consumoDia * 7)}</td><td style={td}>{n2(l.consumoDia * 30)}</td>
          <td style={td}><span style={{ fontWeight: 700, color: l.fonte === 'real' ? '#1D9E75' : '#D97706' }}>{l.fonte === 'real' ? 'Real' : 'Estimado'}</span></td>
          <td style={td}>{n2(l.c30)} / {n2(l.c60)} / {n2(l.c90)}</td>
          <td style={td}>{l.tendencia === 'alta' ? '📈 alta' : l.tendencia === 'queda' ? '📉 queda' : l.tendencia} {l.evol != null && <span style={{ color: 'var(--muted)' }}>({pctF(l.evol)})</span>}</td>
          <td style={td}>{l.nCompras}</td><td style={td}>{l.intervalo == null ? '—' : n2(l.intervalo) + ' d'}</td>
          <td style={td}>{l.mudancaFreq == null ? '—' : (l.mudancaFreq < -25 ? '⏱️ mais frequente ' : l.mudancaFreq > 25 ? '🐢 menos frequente ' : 'estável ') + `(${pctF(l.mudancaFreq)})`}</td>
          <td style={td}>{n2(l.qtdMedia)}</td><td style={td}>{l.saldo == null ? '—' : n2(l.saldo)}</td>
          <td style={td}>{l.cobertura == null ? '—' : `${n2(l.cobertura)} d → ${dBR(l.reposicao)}`}{l.fonte === 'estimado' && l.cobertura != null && <div style={{ fontSize: 10, color: 'var(--muted)' }}>baseado em consumo estimado</div>}</td>
          <td style={td}>{l.difCompradoConsumido == null ? <span style={{ color: 'var(--muted)' }}>sem consumo real</span> : n2(l.difCompradoConsumido)}</td></tr>)}
          {!vis.length && <tr><td style={{ ...td, color: 'var(--muted)' }} colSpan={16}>Sem compras com quantidade/unidade na janela de 90 dias até a data de referência.</td></tr>}</tbody></table></div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Saldo do estoque usa a unidade do cadastro do estoque (pode diferir da unidade-base da compra): confira antes de agir. Cobertura = saldo ÷ consumo/dia.</div>
    </div>
    <div style={card}><b style={{ fontSize: 13 }}>Comparativo entre lojas (compras por dia ativo, 30d)</b>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{['Produto', 'Un.', 'Quem compra/consome mais (por dia ativo)', 'Menor custo de aquisição', 'Maior custo de aquisição', 'Diferença', 'Observação'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>{comp.map(x => <tr key={x.nome}><td style={td}><b>{titulo(x.nome)}</b></td><td style={td}>{x.un}</td>
          <td style={td}>{x.ord.map(o => `${o.loja} ${n2(o.porDiaAtivo)}/dia`).join(' · ')}</td><td style={td}>{x.menorP ? `${x.menorP.loja} ${brl(x.menorP.preco)}` : '—'}</td><td style={td}>{x.maiorP ? `${x.maiorP.loja} ${brl(x.maiorP.preco)}` : '—'}</td><td style={td}>{pctF(x.spread)}</td>
          <td style={td}>{[x.excesso ? '⚠️ possível excesso em ' + x.ord[0].loja : '', x.spread > 5 ? '🏷️ padronizar fornecedor/preço' : ''].filter(Boolean).join(' · ') || '—'}</td></tr>)}
          {!comp.length && <tr><td style={{ ...td, color: 'var(--muted)' }} colSpan={7}>Nenhum produto comprado em 2+ lojas na janela.</td></tr>}</tbody></table></div>
    </div>
  </div>
}
