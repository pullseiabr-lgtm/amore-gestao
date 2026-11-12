// Relatório semanal por loja (Fase C) — calculado a partir de v_ic_compras (origem: caixa_id/prestação em cada linha).
import type { Compra, Cfg } from './engine'
import { brl, pctF, dBR, titulo } from './engine'

export const addDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
/** Segunda-feira da semana de uma data. */
export const segunda = (iso: string) => { const d = new Date(iso + 'T12:00:00'); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return d.toISOString().slice(0, 10) }
/** Segunda-feira da última semana COMPLETA (consolidado que a segunda-feira 8h entregaria). */
export const semanaAnteriorCompleta = (hoje = new Date().toISOString().slice(0, 10)) => addDias(segunda(hoje), -7)

export interface ItemSem { chave: string; nome: string; un: string; qtd: number; valor: number; preco: number | null; precoAnt: number | null; varPct: number | null; suspeito: boolean; fornecedores: string[]; mediaHist: number | null; acimaMedia: boolean; qtdAnt: number; varConsumo: number | null; compras: number }
export interface FornSem { nome: string; valor: number; itens: number; idx: number | null; reajustes: { produto: string; de: number; para: number; pct: number }[] }
export interface Oport { produto: string; un: string; pagoA: string; preco: number; melhor: string; melhorPreco: number; economia: number }
export interface RelSemanal {
  loja: string; ini: string; fim: string; linhas: number; total: number; totalAnt: number; nProdutos: number; nProdutosAnt: number; nForn: number; nFornAnt: number
  varCusto: number | null; varTotal: number | null; semPreco: number
  itens: ItemSem[]; forns: FornSem[]; oport: Oport[]; altas: ItemSem[]; maisComprados: ItemSem[]; maiorCusto: ItemSem[]; varConsumo: ItemSem[]; acimaMedia: ItemSem[]; foraPadrao: string[]; plano: string[]; resumo: string
  origens: string[]
}

export function relatorioSemanal(todas: Compra[], loja: string, ini: string, cfg: Cfg): RelSemanal {
  const fim = addDias(ini, 6), antIni = addDias(ini, -7), antFim = addDias(ini, -1)
  const key = (c: Compra) => (cfg.aliases[c.produto_key] || c.produto_key) + '|' + c.un_base
  const base = todas.filter(c => c.data_ok && c.eh_produto && c.data && (!loja || c.loja === loja))
  const sem = base.filter(c => c.data! >= ini && c.data! <= fim)
  const ant = base.filter(c => c.data! >= antIni && c.data! <= antFim)
  const hist = base.filter(c => c.data! < ini)
  const soma = (a: Compra[]) => a.reduce((s, c) => s + c.valor, 0)
  const pPond = (a: Compra[]) => { const v = a.filter(c => c.preco_ok); const q = v.reduce((s, c) => s + (c.qtd_base || 0), 0); return q > 0 ? v.reduce((s, c) => s + c.valor, 0) / q : null }
  const por = (a: Compra[]) => { const m = new Map<string, Compra[]>(); a.forEach(c => m.set(key(c), [...(m.get(key(c)) || []), c])); return m }
  const gSem = por(sem), gAnt = por(ant), gHist = por(hist)

  const itens: ItemSem[] = []
  gSem.forEach((ls, k) => {
    const preco = pPond(ls); const la = gAnt.get(k) || []; const lh = gHist.get(k) || []
    let precoAnt = pPond(la)
    if (precoAnt == null) { const v = lh.filter(c => c.preco_ok).sort((a, b) => b.data!.localeCompare(a.data!)); if (v.length) { const d = v[0].data!; precoAnt = pPond(v.filter(c => c.data === d)) } }
    const razao = preco && precoAnt ? Math.max(preco, precoAnt) / Math.min(preco, precoAnt) : 1
    const suspeito = razao > cfg.suspeito
    const varPct = preco && precoAnt && !suspeito ? (preco - precoAnt) / precoAnt * 100 : null
    const dias = new Map<string, Compra[]>(); lh.filter(c => c.preco_ok).forEach(c => dias.set(c.data!, [...(dias.get(c.data!) || []), c]))
    const dp = [...dias.values()].map(pPond).filter((x): x is number => x != null)
    const mediaHist = dp.length ? dp.reduce((s, x) => s + x, 0) / dp.length : null
    const qtd = ls.filter(c => c.preco_ok).reduce((s, c) => s + (c.qtd_base || 0), 0); const qtdAnt = la.filter(c => c.preco_ok).reduce((s, c) => s + (c.qtd_base || 0), 0)
    const nome = ls.sort((a, b) => b.valor - a.valor)[0].descricao
    itens.push({ chave: k, nome, un: ls[0].un_base, qtd, valor: soma(ls), preco, precoAnt, varPct, suspeito, fornecedores: [...new Set(ls.map(c => c.fornecedor_key))], mediaHist,
      acimaMedia: !!(preco && mediaHist && !suspeito && preco > mediaHist * (1 + cfg.estavel / 100 * 5)), qtdAnt, varConsumo: qtd > 0 && qtdAnt > 0 ? (qtd - qtdAnt) / qtdAnt * 100 : null, compras: new Set(ls.map(c => c.data)).size })
  })
  itens.sort((a, b) => b.valor - a.valor)

  // fornecedores
  const fornMap = new Map<string, Compra[]>(); sem.forEach(c => fornMap.set(c.fornecedor_key, [...(fornMap.get(c.fornecedor_key) || []), c]))
  const ultimoPorForn = (k: string) => { const m = new Map<string, number>(); [...hist, ...sem].filter(c => key(c) === k && c.preco_ok).sort((a, b) => a.data!.localeCompare(b.data!)).forEach(c => { m.set(c.fornecedor_key, c.preco_base!) }); return m }
  const forns: FornSem[] = [...fornMap.entries()].map(([nome, ls]) => {
    const reaj: FornSem['reajustes'] = []; const idxs: number[] = []
    por(ls.filter(c => c.preco_ok)).forEach((l2, k) => {
      const p = pPond(l2)!; const prev = hist.filter(c => c.fornecedor_key === nome && key(c) === k && c.preco_ok).sort((a, b) => b.data!.localeCompare(a.data!))[0]
      if (prev && prev.preco_base && p / prev.preco_base > 1.005 && p / prev.preco_base <= cfg.suspeito) reaj.push({ produto: l2[0].descricao, de: prev.preco_base, para: p, pct: (p - prev.preco_base) / prev.preco_base * 100 })
      const u = ultimoPorForn(k); if (u.size > 1) idxs.push(p / Math.min(...u.values()))
    })
    return { nome, valor: soma(ls), itens: new Set(ls.map(c => key(c))).size, idx: idxs.length ? idxs.reduce((s, x) => s + x, 0) / idxs.length : null, reajustes: reaj.sort((a, b) => b.pct - a.pct) }
  }).sort((a, b) => b.valor - a.valor)

  // oportunidades de negociação: pago acima do menor último preço de outro fornecedor
  const oport: Oport[] = []
  gSem.forEach((ls, k) => {
    const u = ultimoPorForn(k); if (u.size < 2) return
    const [melhor, melhorPreco] = [...u.entries()].sort((a, b) => a[1] - b[1])[0]
    const porF = new Map<string, Compra[]>(); ls.filter(c => c.preco_ok).forEach(c => porF.set(c.fornecedor_key, [...(porF.get(c.fornecedor_key) || []), c]))
    porF.forEach((l2, f) => { const p = pPond(l2)!; const q = l2.reduce((s, c) => s + (c.qtd_base || 0), 0)
      if (f !== melhor && p > melhorPreco * 1.02 && p / melhorPreco <= cfg.suspeito) oport.push({ produto: l2[0].descricao, un: l2[0].un_base, pagoA: f, preco: p, melhor, melhorPreco, economia: (p - melhorPreco) * q }) })
  })
  oport.sort((a, b) => b.economia - a.economia)

  const comVar = itens.filter(i => i.varPct != null)
  const varCusto = comVar.length ? comVar.reduce((s, i) => s + i.varPct!, 0) / comVar.length : null
  const totalAnt = soma(ant)
  const altas = comVar.filter(i => i.varPct! > 0).sort((a, b) => b.varPct! - a.varPct!).slice(0, 20)
  const acimaMedia = itens.filter(i => i.acimaMedia)
  const foraPadrao: string[] = []
  itens.filter(i => i.suspeito).forEach(i => foraPadrao.push(`${titulo(i.nome)}: salto de preço improvável (${brl(i.precoAnt)} → ${brl(i.preco)}) — verificar unidade/embalagem no lançamento.`))
  itens.filter(i => i.varConsumo != null && Math.abs(i.varConsumo) > 100).forEach(i => foraPadrao.push(`${titulo(i.nome)}: quantidade comprada ${pctF(i.varConsumo)} vs. semana anterior.`))
  const semPreco = sem.filter(c => !c.preco_ok).length
  const plano: string[] = []
  oport.slice(0, 5).forEach(o => plano.push(`Negociar ${titulo(o.produto)} com ${titulo(o.pagoA)}: pago ${brl(o.preco)}/${o.un}, ${titulo(o.melhor)} praticou ${brl(o.melhorPreco)} (economia ${brl(o.economia)}).`))
  altas.filter(i => i.varPct! > cfg.critico).slice(0, 5).forEach(i => plano.push(`Reajuste crítico em ${titulo(i.nome)} (${pctF(i.varPct)}): cotar alternativas antes da próxima compra.`))
  forns.flatMap(f => f.reajustes.map(r => ({ f: f.nome, ...r }))).slice(0, 3).forEach(r => plano.push(`Fornecedor ${titulo(r.f)} reajustou ${titulo(r.produto)} em ${pctF(r.pct)}.`))
  if (semPreco) plano.push(`${semPreco} lançamento(s) da semana sem quantidade/unidade na Prestação de Contas — completar para entrarem na análise de preço.`)
  const nomeLoja = loja || 'todas as lojas'
  const resumo = sem.length === 0
    ? `Semana ${dBR(ini)} a ${dBR(fim)} — ${nomeLoja}: nenhuma compra lançada na Prestação de Contas neste período.`
    : `Resumo executivo — ${nomeLoja}, semana ${dBR(ini)} a ${dBR(fim)}: compras de ${brl(soma(sem))} (${totalAnt ? pctF((soma(sem) - totalAnt) / totalAnt * 100) + ' vs. semana anterior' : 'sem semana anterior para comparar'}), ${new Set(sem.map(key)).size} produtos e ${fornMap.size} fornecedores. ` +
      (varCusto != null ? `Custo de aquisição dos itens comparáveis variou ${pctF(varCusto)}. ` : 'Poucos itens com referência de preço para medir variação. ') +
      (altas[0] ? `Maior alta: ${titulo(altas[0].nome)} (${pctF(altas[0].varPct)}). ` : '') + (oport[0] ? `Maior oportunidade: ${titulo(oport[0].produto)} — economia potencial ${brl(oport[0].economia)}. ` : '') +
      (forns[0] ? `Maior volume: ${titulo(forns[0].nome)} (${brl(forns[0].valor)}).` : '')
  return {
    loja, ini, fim, linhas: sem.length, total: soma(sem), totalAnt, nProdutos: new Set(sem.map(key)).size, nProdutosAnt: new Set(ant.map(key)).size, nForn: fornMap.size, nFornAnt: new Set(ant.map(c => c.fornecedor_key)).size,
    varCusto, varTotal: totalAnt ? (soma(sem) - totalAnt) / totalAnt * 100 : null, semPreco, itens, forns, oport, altas, acimaMedia, foraPadrao, plano, resumo,
    maisComprados: [...itens].sort((a, b) => b.compras - a.compras || b.valor - a.valor).slice(0, 10), maiorCusto: itens.slice(0, 10),
    varConsumo: itens.filter(i => i.varConsumo != null).sort((a, b) => Math.abs(b.varConsumo!) - Math.abs(a.varConsumo!)).slice(0, 10),
    origens: [...new Set(sem.map(c => c.caixa_id))],
  }
}
