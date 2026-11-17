// Inteligência de Compras — visão gerencial sobre as 3 fontes (nota fiscal, pedido, estimativa da requisição).
// Fonte: view v_ic_fontes. REGRAS: NF = preço efetivamente pago (prioritária); pedido e estimativa ficam SEPARADOS e nunca
// entram em melhor/pior/médio confirmados; frequência conta EVENTOS (data+loja+documento), nunca linhas duplicadas;
// preços de embalagens diferentes só se comparam depois da conversão para kg/L/un (saltos > fator "suspeito" são descartados).
import { supabase } from '../../lib/supabase'

const sb = supabase as any

export type Fonte = 'nota' | 'pedido' | 'estimativa'
export interface Linha {
  fonte: Fonte; id: string; loja: string; data: string; produto_key: string; descricao: string; fornecedor_key: string
  un_base: string; qtd_base: number; valor: number; preco_base: number; documento: string; ref_id: string; embalagem: string; status_origem: string
  sem_qtd: boolean   // nota da prestação de contas sem quantidade/unidade informadas (só valor total)
}
export const FONTE_INFO: Record<Fonte, { l: string; c: string }> = {
  nota: { l: 'Nota fiscal (pago)', c: '#1D9E75' }, pedido: { l: 'Pedido', c: '#2563EB' }, estimativa: { l: 'Estimativa (não confirmado)', c: '#D97706' },
}
export const FATOR_SUSPEITO = 5          // razão entre preços acima da qual o valor é tratado como erro de unidade/embalagem
export const LIM = { frequente: 10, eventual: 30, fracionadoValor: 150, consolidarValor: 300, difLojaMin: 3 }

export async function carregarFontes(): Promise<Linha[]> {
  const out: Linha[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('v_ic_fontes').select('*').order('data', { ascending: true }).range(from, from + 999)
    if (error) throw error
    for (const r of data || []) out.push(num(r))
    if (!data || data.length < 1000) break
  }
  return out
}
export const num = (r: any): Linha => ({ ...r, qtd_base: Number(r.qtd_base), valor: Number(r.valor), preco_base: Number(r.preco_base), documento: r.documento || '', embalagem: r.embalagem || '', sem_qtd: !!r.sem_qtd })

export interface Filtro { ini: string; fim: string; loja: string; fonte: '' | Fonte; fornecedor?: string; busca?: string }
export function periodoDe(p: string, ini: string, fim: string): [string, string] {
  const hoje = new Date(); const iso = (d: Date) => d.toISOString().slice(0, 10)
  const ago = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return iso(d) }
  const map: Record<string, number> = { '7': 7, '30': 30, '90': 90, '180': 180, '365': 365 }
  if (p === 'custom') return [ini || '0000-00-00', fim || '9999-99-99']
  if (map[p]) return [ago(map[p]), iso(hoje)]
  return ['0000-00-00', '9999-99-99']
}
const semAcento = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export function filtrar(l: Linha[], f: Filtro): Linha[] {
  const b = f.busca ? semAcento(f.busca) : ''
  return l.filter(x => x.data >= f.ini && x.data <= f.fim && (!f.loja || x.loja === f.loja) && (!f.fonte || x.fonte === f.fonte) &&
    (!f.fornecedor || x.fornecedor_key === f.fornecedor) && (!b || x.produto_key.includes(b) || semAcento(x.descricao).includes(b)))
}

const dd = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
const mediana = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const razao = (a: number, b: number) => Math.max(a, b) / Math.min(a, b)

/** Evento de compra = (data, loja, documento) agregado por preço médio ponderado. */
export interface Evento { data: string; loja: string; documento: string; fornecedor: string; preco: number; qtd: number; valor: number; fonte: Fonte; refId: string }
function eventos(ls: Linha[]): Evento[] {
  const m = new Map<string, Linha[]>()
  ls.forEach(l => { const k = `${l.data}|${l.loja}|${l.documento}|${l.fonte}`; m.set(k, [...(m.get(k) || []), l]) })
  return [...m.values()].map(g => {
    const qtd = g.reduce((s, l) => s + l.qtd_base, 0); const valor = g.reduce((s, l) => s + l.valor, 0)
    const maior = [...g].sort((a, b) => b.valor - a.valor)[0]
    return { data: g[0].data, loja: g[0].loja, documento: g[0].documento, fornecedor: maior.fornecedor_key, preco: valor / qtd, qtd, valor, fonte: g[0].fonte, refId: maior.ref_id }
  }).sort((a, b) => a.data.localeCompare(b.data))
}
/** Remove eventos com preço absurdo frente à mediana (embalagem/unidade trocada). */
function semOutlier(ev: Evento[], ref?: number): { ok: Evento[]; descartados: number } {
  if (ev.length === 0) return { ok: [], descartados: 0 }
  const med = ref ?? mediana(ev.map(e => e.preco))
  const ok = ev.filter(e => razao(e.preco, med) <= FATOR_SUSPEITO)
  return { ok, descartados: ev.length - ok.length }
}
const pond = (ev: Evento[]) => { const q = ev.reduce((s, e) => s + e.qtd, 0); return q > 0 ? ev.reduce((s, e) => s + e.valor, 0) / q : 0 }

export interface LojaStat { loja: string; compras: number; qtd: number; valor: number; media: number; ultimo: number; ultimaData: string; melhor: number; pior: number }
export type Freq = 'frequente' | 'regular' | 'eventual'
export interface Item {
  key: string; nome: string; un: string; categoriaEmb: string
  eventos: Evento[]                       // compras CONFIRMADAS (nota fiscal)
  compras: number; qtdTotal: number; desembolso: number   // compras = só as COM quantidade (formam preço); desembolso = tudo que a NF registrou
  comprasTotal: number; comprasSemQtd: number; desembolsoSemQtd: number
  ultimaCompra?: { data: string; loja: string; fornecedor: string; valor: number; preco: number | null }
  melhor?: Evento; pior?: Evento; ultimo?: Evento; media: number; variacaoPct: number | null
  intervaloMedio: number | null; ultimoIntervalo: number | null
  lojas: LojaStat[]; lojaBarata?: LojaStat; lojaCara?: LojaStat; difLojaPct: number
  freq: Freq; tendencia: 'aumentando' | 'reduzindo' | 'estavel'; fracionado: boolean; consolidar: boolean
  economia: number                        // potencial: cada loja comprando ao preço médio da mais barata
  descartados: number
  estimado: number | null; estimadoN: number; pedido: number | null; pedidoN: number
  difEst: number | null; difEstPct: number | null; difPed: number | null; difPedPct: number | null
  altaPct: number | null; altaRef?: Evento
  intervaloCurto: boolean
  fornecedores: { nome: string; compras: number; valor: number; media: number; qtd: number }[]
  semNota: boolean
}

export function analisarFontes(ls: Linha[], ini: string, fim: string): Item[] {
  const grupos = new Map<string, Linha[]>()
  ls.forEach(l => { const k = l.produto_key + '|' + l.un_base; grupos.set(k, [...(grupos.get(k) || []), l]) })
  const out: Item[] = []
  grupos.forEach((g, key) => {
    const nomeCont = new Map<string, number>(); g.forEach(l => nomeCont.set(l.descricao.trim(), (nomeCont.get(l.descricao.trim()) || 0) + 1))
    const nome = [...nomeCont.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const evNota = eventos(g.filter(l => l.fonte === 'nota'))
    const { ok: ev, descartados } = semOutlier(evNota)
    const refPreco = ev.length ? pond(ev) : undefined
    const evPed = semOutlier(eventos(g.filter(l => l.fonte === 'pedido')), refPreco).ok
    const evEst = semOutlier(eventos(g.filter(l => l.fonte === 'estimativa')), refPreco).ok

    const evSQ = eventos(g.filter(l => l.fonte === 'nota' && l.sem_qtd))
    const compras = ev.length; const qtdTotal = ev.reduce((s, e) => s + e.qtd, 0)
    const desembolsoSemQtd = evSQ.reduce((s, e) => s + e.valor, 0); const desembolso = ev.reduce((s, e) => s + e.valor, 0) + desembolsoSemQtd
    const comprasTotal = compras + evSQ.length
    const todasEv = [...ev, ...evSQ].sort((a, b) => a.data.localeCompare(b.data))
    const ult = todasEv[todasEv.length - 1]
    const ultimaCompra = ult ? { data: ult.data, loja: ult.loja, fornecedor: ult.fornecedor, valor: ult.valor, preco: Number.isFinite(ult.preco) ? ult.preco : null } : undefined
    const melhor = ev.length ? [...ev].sort((a, b) => a.preco - b.preco)[0] : undefined
    const pior = ev.length ? [...ev].sort((a, b) => b.preco - a.preco)[0] : undefined
    const ultimo = ev[ev.length - 1]
    const media = pond(ev)
    const variacaoPct = melhor && pior && compras > 1 ? (pior.preco - melhor.preco) / melhor.preco * 100 : null

    // lojas
    const porLoja = new Map<string, Evento[]>(); ev.forEach(e => porLoja.set(e.loja, [...(porLoja.get(e.loja) || []), e]))
    const lojas: LojaStat[] = [...porLoja.entries()].map(([loja, es]) => ({
      loja, compras: es.length, qtd: es.reduce((s, e) => s + e.qtd, 0), valor: es.reduce((s, e) => s + e.valor, 0), media: pond(es),
      ultimo: es[es.length - 1].preco, ultimaData: es[es.length - 1].data, melhor: Math.min(...es.map(e => e.preco)), pior: Math.max(...es.map(e => e.preco)),
    })).sort((a, b) => a.media - b.media)
    const lojaBarata = lojas[0]; const lojaCara = lojas[lojas.length - 1]
    const difLojaPct = lojas.length > 1 ? (lojaCara.media - lojaBarata.media) / lojaBarata.media * 100 : 0
    const economia = lojas.length > 1 ? lojas.reduce((s, l) => s + Math.max(0, l.media - lojaBarata.media) * l.qtd, 0) : 0

    // frequência (eventos, sem contar duas vezes)
    const datas = [...new Set(todasEv.map(e => e.data))].sort()
    const ints: number[] = []; for (let i = 1; i < datas.length; i++) ints.push(dd(datas[i - 1], datas[i]))
    const intervaloMedio = ints.length ? ints.reduce((s, x) => s + x, 0) / ints.length : null
    const ultimoIntervalo = ints.length ? ints[ints.length - 1] : null
    const freq: Freq = comprasTotal <= 2 || (intervaloMedio != null && intervaloMedio > LIM.eventual) ? 'eventual' : comprasTotal >= 4 && intervaloMedio != null && intervaloMedio <= LIM.frequente ? 'frequente' : 'regular'
    // tendência: metade inicial × metade final do período analisado
    const i0 = ini > '0001' ? ini : datas[0]; const f0 = fim < '9999' ? fim : datas[datas.length - 1]
    let tendencia: Item['tendencia'] = 'estavel'
    if (i0 && f0 && i0 < f0) {
      const meio = new Date((new Date(i0 + 'T12:00:00').getTime() + new Date(f0 + 'T12:00:00').getTime()) / 2).toISOString().slice(0, 10)
      const a = datas.filter(d => d <= meio).length; const b = datas.filter(d => d > meio).length
      if (b >= 3 && b >= a * 1.5) tendencia = 'aumentando'; else if (a >= 3 && b <= a * 0.5) tendencia = 'reduzindo'
    }
    const valorMedio = comprasTotal ? desembolso / comprasTotal : 0
    const fracionado = comprasTotal >= 4 && intervaloMedio != null && intervaloMedio <= LIM.frequente && valorMedio < LIM.fracionadoValor
    const consolidar = desembolso >= LIM.consolidarValor && ((lojas.length >= 2 && difLojaPct >= LIM.difLojaMin) || fracionado)
    const intervaloCurto = ints.length >= 2 && ultimoIntervalo != null && intervaloMedio != null && ultimoIntervalo < intervaloMedio * 0.5 &&
      ultimoIntervalo < ints.slice(0, -1).reduce((s, x) => s + x, 0) / (ints.length - 1) * 0.5

    // alerta de aumento: última compra vs. média ponderada das anteriores
    let altaPct: number | null = null; let altaRef: Evento | undefined
    if (ev.length >= 2) {
      const ant = ev.slice(0, -1); const mAnt = pond(ant); altaPct = (ultimo.preco - mAnt) / mAnt * 100; altaRef = ant[ant.length - 1]
    }

    // estimado/pedido × realizado (só quando comparável e há NF)
    const est = evEst.length ? pond(evEst) : null; const ped = evPed.length ? pond(evPed) : null
    const cmp = (x: number | null) => (x != null && media > 0 && razao(x, media) <= FATOR_SUSPEITO ? { d: x - media, p: (x - media) / media * 100 } : null)
    const ce = cmp(est); const cp = cmp(ped)

    const porForn = new Map<string, Evento[]>(); ev.forEach(e => porForn.set(e.fornecedor, [...(porForn.get(e.fornecedor) || []), e]))
    const porFornT = new Map<string, Evento[]>(); todasEv.forEach(e => porFornT.set(e.fornecedor, [...(porFornT.get(e.fornecedor) || []), e]))
    const fornecedores = [...porFornT.entries()].map(([nomeF, es]) => { const pr = porForn.get(nomeF) || []; return { nome: nomeF, compras: es.length, valor: es.reduce((s, e) => s + e.valor, 0), media: pond(pr), qtd: pr.reduce((s, e) => s + e.qtd, 0) } })

    out.push({
      key, nome, un: g[0].un_base, categoriaEmb: g[0].embalagem, eventos: ev, compras, qtdTotal, desembolso, comprasTotal, comprasSemQtd: evSQ.length, desembolsoSemQtd, ultimaCompra, melhor, pior, ultimo, media, variacaoPct,
      intervaloMedio, ultimoIntervalo, lojas, lojaBarata, lojaCara, difLojaPct, freq, tendencia, fracionado, consolidar, economia, descartados,
      estimado: est, estimadoN: evEst.length, pedido: ped, pedidoN: evPed.length,
      difEst: ce?.d ?? null, difEstPct: ce?.p ?? null, difPed: cp?.d ?? null, difPedPct: cp?.p ?? null,
      altaPct, altaRef, intervaloCurto, fornecedores, semNota: comprasTotal === 0,
    })
  })
  return out.sort((a, b) => b.desembolso - a.desembolso)
}

export interface ResumoLoja { loja: string; produtos: number; compras: number; desembolso: number; indice: number; maisBarata: number; maisCara: number; economia: number }
export function resumoLojas(its: Item[]): ResumoLoja[] {
  const m = new Map<string, { produtos: number; compras: number; desembolso: number; soma: number; n: number; bar: number; car: number; eco: number }>()
  const get = (l: string) => { let a = m.get(l); if (!a) { a = { produtos: 0, compras: 0, desembolso: 0, soma: 0, n: 0, bar: 0, car: 0, eco: 0 }; m.set(l, a) } return a }
  its.forEach(it => {
    it.lojas.forEach(l => { const a = get(l.loja); a.produtos++; a.compras += l.compras; a.desembolso += l.valor })
    if (it.lojas.length > 1 && it.difLojaPct <= (FATOR_SUSPEITO - 1) * 100) {
      const mn = it.lojaBarata!.media
      it.lojas.forEach(l => { const a = get(l.loja); a.soma += l.media / mn; a.n++; a.eco += Math.max(0, l.media - mn) * l.qtd })
      if (it.difLojaPct >= LIM.difLojaMin) { get(it.lojaBarata!.loja).bar++; get(it.lojaCara!.loja).car++ }
    }
  })
  return [...m.entries()].map(([loja, a]) => ({ loja, produtos: a.produtos, compras: a.compras, desembolso: a.desembolso, indice: a.n ? a.soma / a.n : 1, maisBarata: a.bar, maisCara: a.car, economia: a.eco })).sort((a, b) => a.indice - b.indice)
}

export interface AlertaG { tipo: 'aumento' | 'economia' | 'frequencia' | 'estimativa'; item: Item; titulo: string; detalhe: string; peso: number }
export function alertasG(its: Item[], limAlta = 5, limEst = 10): AlertaG[] {
  const out: AlertaG[] = []
  its.forEach(it => {
    if (it.altaPct != null && it.altaPct >= limAlta && it.ultimo && it.altaRef)
      out.push({ tipo: 'aumento', item: it, titulo: `Aumento de ${it.altaPct.toFixed(1).replace('.', ',')}%`, detalhe: `${tit(it.nome)}: ${brl(it.ultimo.preco)}/${it.un} em ${dBR(it.ultimo.data)} (${it.ultimo.loja}) contra média anterior; compra de referência ${dBR(it.altaRef.data)} a ${brl(it.altaRef.preco)}.`, peso: it.altaPct })
    if (it.economia > 0 && it.lojaBarata && it.lojaCara && it.difLojaPct >= LIM.difLojaMin && it.difLojaPct <= (FATOR_SUSPEITO - 1) * 100)
      out.push({ tipo: 'economia', item: it, titulo: `Economia potencial ${brl(it.economia)}`, detalhe: `${tit(it.nome)}: ${it.lojaBarata.loja} paga ${brl(it.lojaBarata.media)}/${it.un}; ${it.lojaCara.loja} paga ${brl(it.lojaCara.media)} (+${it.difLojaPct.toFixed(1).replace('.', ',')}%).`, peso: it.economia })
    if (it.intervaloCurto && it.ultimoIntervalo != null && it.intervaloMedio != null)
      out.push({ tipo: 'frequencia', item: it, titulo: 'Frequência fora do padrão', detalhe: `${tit(it.nome)}: última compra após ${it.ultimoIntervalo} dia(s); intervalo médio é ${it.intervaloMedio.toFixed(0)} dias.`, peso: it.intervaloMedio - it.ultimoIntervalo })
    if (it.difEstPct != null && Math.abs(it.difEstPct) >= limEst && it.estimado != null)
      out.push({ tipo: 'estimativa', item: it, titulo: `Estimativa ${it.difEstPct > 0 ? 'abaixo' : 'acima'} do pago: ${pctF(it.difEstPct)}`, detalhe: `${tit(it.nome)}: estimado ${brl(it.estimado)}/${it.un}; pago em nota ${brl(it.media)}/${it.un} (${brl(it.difEst)} por ${it.un}).`, peso: Math.abs(it.difEstPct) })
  })
  return out.sort((a, b) => a.tipo.localeCompare(b.tipo) || b.peso - a.peso)
}

export interface Forn { nome: string; compras: number; valor: number; produtos: number; indice: number }
export function resumoFornecedores(its: Item[]): Forn[] {
  const m = new Map<string, { c: number; v: number; p: number; s: number; n: number }>()
  its.forEach(it => {
    const fp = it.fornecedores.filter(f => f.media > 0)
    const mn = fp.length > 1 ? Math.min(...fp.map(f => f.media)) : 0
    it.fornecedores.forEach(f => { const a = m.get(f.nome) || { c: 0, v: 0, p: 0, s: 0, n: 0 }; a.c += f.compras; a.v += f.valor; a.p++; if (mn > 0 && f.media / mn <= FATOR_SUSPEITO) { a.s += f.media / mn; a.n++ } m.set(f.nome, a) })
  })
  return [...m.entries()].map(([nome, a]) => ({ nome, compras: a.c, valor: a.v, produtos: a.p, indice: a.n ? a.s / a.n : 1 })).sort((a, b) => b.valor - a.valor)
}

// ── formatação ──
export const brl = (n: number | null | undefined) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pctF = (n: number | null | undefined) => n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%'
export const dBR = (d: string | null | undefined) => { if (!d) return '—'; const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }
export const tit = (s: string) => (s || '').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())
