// Motor de análise do módulo Inteligência de Compras.
// Fonte única: view SQL v_ic_compras (itens da Prestação de Contas / NFs, já normalizados, sem duplicidade,
// com unidade-base convertida e origem — caixa_id / prestacao_id — para auditoria).
import { supabase } from '../../lib/supabase'
import { fetchAppConfig, saveAppConfig } from '../../lib/db'

const sb = supabase as any

export interface Compra {
  id: string; caixa_id: string; loja: string; data: string | null; fornecedor: string | null; fornecedor_key: string
  descricao: string; produto_key: string; categoria: string; quantidade: number | null; unidade: string | null
  conteudo: number | null; un_base: string; qtd_base: number | null; embalagem: string | null; valor: number
  documento: string | null; preco_base: number | null; preco_ok: boolean; data_ok: boolean; eh_produto: boolean
  prestacao_id: string | null; responsavel: string | null; caixa_titulo: string | null; caixa_status: string | null
}

export interface Cfg {
  estavel: number      // até ±X% = estável
  alerta: number       // acima disto (até critico) = alerta
  critico: number      // acima disto = crítico
  suspeito: number     // razão entre preços acima da qual o salto é tratado como erro de unidade/embalagem
  freqCurta: number    // % do intervalo médio abaixo do qual a compra é "fora do padrão"
  aliases: Record<string, string> // produto_key -> produto_key canônico (agrupamento manual)
}
export const CFG_PADRAO: Cfg = { estavel: 1, alerta: 5, critico: 10, suspeito: 5, freqCurta: 50, aliases: {} }
const CFG_KEY = 'ic_config'

export async function carregarCfg(): Promise<Cfg> {
  const v = await fetchAppConfig<Partial<Cfg>>(CFG_KEY)
  return { ...CFG_PADRAO, ...(v || {}), aliases: { ...(v?.aliases || {}) } }
}
export async function salvarCfg(c: Cfg) { await saveAppConfig(CFG_KEY, c) }

export async function carregarCompras(): Promise<Compra[]> {
  const out: Compra[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('v_ic_compras').select('*').order('data', { ascending: true }).range(from, from + 999)
    if (error) throw error
    for (const r of data || []) out.push({ ...r, valor: Number(r.valor), quantidade: r.quantidade == null ? null : Number(r.quantidade), qtd_base: r.qtd_base == null ? null : Number(r.qtd_base), preco_base: r.preco_base == null ? null : Number(r.preco_base), conteudo: r.conteudo == null ? null : Number(r.conteudo) })
    if (!data || data.length < 1000) break
  }
  return out
}

// ── Tipos de análise ────────────────────────────────────────────────────────
export type Nivel = 'caiu' | 'estavel' | 'atencao' | 'alerta' | 'critico' | 'sem_historico' | 'embalagem' | 'suspeito'
export const NIVEL_INFO: Record<Nivel, { l: string; c: string; e: string }> = {
  caiu: { l: 'Caiu', c: '#1D9E75', e: '🟢' }, estavel: { l: 'Estável', c: '#2563EB', e: '🔵' },
  atencao: { l: 'Atenção', c: '#D97706', e: '🟡' }, alerta: { l: 'Alerta', c: '#EA580C', e: '🟠' },
  critico: { l: 'Crítico', c: '#DC2626', e: '🔴' }, sem_historico: { l: 'Sem histórico', c: '#9ca3af', e: '⚪' },
  embalagem: { l: 'Mudou embalagem', c: '#7C3AED', e: '📦' }, suspeito: { l: 'Salto suspeito', c: '#6B7280', e: '❓' },
}

export interface Ponto { data: string; preco: number; qtd: number; valor: number; fornecedor: string; fornecedorKey: string; loja: string; embalagem: string; linhas: Compra[] }

export interface FornInfo {
  nome: string; ultimoPreco: number; ultimaData: string; menor: number; maior: number; compras: number
  reajustes: { data: string; de: number; para: number; pct: number }[]
}

export interface Produto {
  key: string; nome: string; unBase: string; categoria: string
  linhas: Compra[]; pontos: Ponto[]           // pontos = 1 por data (preço médio ponderado do dia)
  lojas: string[]; fornecedores: string[]; responsaveis: string[]
  total: number; qtdTotal: number
  ultimo?: Ponto; anterior?: Ponto
  pct: number | null; difRs: number | null; nivel: Nivel
  menor: number; maior: number; media: number
  vsMedia: number | null; vsMenor: number | null
  diasUltimoAnterior: number | null; intervaloMedio: number | null; comprasMes: number
  qtdMedia: number; valorMedio: number; consumoMensal: number
  dataAumento: string | null
  forns: FornInfo[]; maisBarato?: FornInfo; maisCaro?: FornInfo; difForRs: number; difForPct: number
  economia: number
  intervaloCurto: boolean; freqCrescente: boolean
}

const dd = (a: string, b: string) => Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86400000)
const moda = <T,>(arr: T[]): T => { const m = new Map<T, number>(); arr.forEach(x => m.set(x, (m.get(x) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] }

export function classificar(pct: number, c: Cfg): Nivel {
  if (pct < -c.estavel) return 'caiu'
  if (pct <= c.estavel) return 'estavel'
  if (pct <= c.alerta) return 'atencao'
  if (pct <= c.critico) return 'alerta'
  return 'critico'
}

function pontosDe(linhas: Compra[]): Ponto[] {
  const porDia = new Map<string, Compra[]>()
  linhas.forEach(l => { const k = l.data as string; porDia.set(k, [...(porDia.get(k) || []), l]) })
  return [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([data, ls]) => {
    const qtd = ls.reduce((s, l) => s + (l.qtd_base || 0), 0); const valor = ls.reduce((s, l) => s + l.valor, 0)
    const maior = [...ls].sort((a, b) => b.valor - a.valor)[0]
    return { data, preco: valor / qtd, qtd, valor, fornecedor: maior.fornecedor_key, fornecedorKey: maior.fornecedor_key, loja: maior.loja, embalagem: moda(ls.map(l => l.embalagem || '')), linhas: ls }
  })
}

/** Constrói a análise por produto a partir das linhas JÁ FILTRADAS. Só linhas com preço unitário válido entram em variações. */
export function analisar(compras: Compra[], cfg: Cfg): Produto[] {
  const validas = compras.filter(c => c.preco_ok && c.data_ok && c.eh_produto)
  const grupos = new Map<string, Compra[]>()
  validas.forEach(c => {
    const k = (cfg.aliases[c.produto_key] || c.produto_key) + '|' + c.un_base
    grupos.set(k, [...(grupos.get(k) || []), c])
  })
  const out: Produto[] = []
  grupos.forEach((linhas, key) => {
    const pontos = pontosDe(linhas)
    const nome = moda(linhas.map(l => l.descricao.trim()))
    const precos = pontos.map(p => p.preco)
    const media = precos.reduce((s, x) => s + x, 0) / precos.length
    const ultimo = pontos[pontos.length - 1]; const anterior = pontos.length > 1 ? pontos[pontos.length - 2] : undefined
    let nivel: Nivel = 'sem_historico'; let pct: number | null = null; let difRs: number | null = null; let dataAumento: string | null = null
    if (anterior) {
      pct = (ultimo.preco - anterior.preco) / anterior.preco * 100; difRs = ultimo.preco - anterior.preco
      const razao = Math.max(ultimo.preco, anterior.preco) / Math.min(ultimo.preco, anterior.preco)
      if (razao > cfg.suspeito) nivel = 'suspeito'
      else if (ultimo.embalagem !== anterior.embalagem) nivel = 'embalagem'
      else nivel = classificar(pct, cfg)
      if (pct > 0) dataAumento = ultimo.data
    }
    // fornecedores
    const porForn = new Map<string, Ponto[]>()
    pontos.forEach(p => linhasForn(p).forEach(([f, pt]) => porForn.set(f, [...(porForn.get(f) || []), pt])))
    const forns: FornInfo[] = [...porForn.entries()].map(([nomeF, pts]) => {
      const ps = pts.map(p => p.preco); const reaj: FornInfo['reajustes'] = []
      for (let i = 1; i < pts.length; i++) { const p0 = pts[i - 1].preco, p1 = pts[i].preco; if (Math.abs(p1 - p0) / p0 > 0.0005 && Math.max(p0, p1) / Math.min(p0, p1) <= cfg.suspeito) reaj.push({ data: pts[i].data, de: p0, para: p1, pct: (p1 - p0) / p0 * 100 }) }
      return { nome: nomeF, ultimoPreco: pts[pts.length - 1].preco, ultimaData: pts[pts.length - 1].data, menor: Math.min(...ps), maior: Math.max(...ps), compras: pts.length, reajustes: reaj }
    })
    const ordF = [...forns].sort((a, b) => a.ultimoPreco - b.ultimoPreco)
    const maisBarato = ordF[0]; const maisCaro = ordF[ordF.length - 1]
    const difForRs = forns.length > 1 ? maisCaro.ultimoPreco - maisBarato.ultimoPreco : 0
    const difForPct = forns.length > 1 && maisBarato.ultimoPreco > 0 ? difForRs / maisBarato.ultimoPreco * 100 : 0
    // economia potencial: última compra se tivesse sido ao menor último preço entre os fornecedores (só preços comparáveis)
    let economia = 0
    if (forns.length > 1 && nivel !== 'suspeito' && nivel !== 'embalagem') {
      const fornUlt = forns.find(f => f.nome === ultimo.fornecedorKey)
      const melhor = maisBarato
      if (fornUlt && melhor.nome !== fornUlt.nome && fornUlt.ultimoPreco > melhor.ultimoPreco && Math.max(fornUlt.ultimoPreco, melhor.ultimoPreco) / Math.min(fornUlt.ultimoPreco, melhor.ultimoPreco) <= cfg.suspeito) economia = (fornUlt.ultimoPreco - melhor.ultimoPreco) * ultimo.qtd
    }
    // frequência
    const datas = pontos.map(p => p.data); const ints: number[] = []
    for (let i = 1; i < datas.length; i++) ints.push(dd(datas[i - 1], datas[i]))
    const intervaloMedio = ints.length ? ints.reduce((s, x) => s + x, 0) / ints.length : null
    const span = datas.length > 1 ? Math.max(dd(datas[0], datas[datas.length - 1]), 1) : 0
    const meses = Math.max(span / 30, 1)
    const qtdTotal = linhas.reduce((s, l) => s + (l.qtd_base || 0), 0); const total = linhas.reduce((s, l) => s + l.valor, 0)
    const intervaloCurto = ints.length >= 2 && intervaloMedio != null && ints[ints.length - 1] < (intervaloMedio * cfg.freqCurta) / 100 && ints[ints.length - 1] < (ints.slice(0, -1).reduce((s, x) => s + x, 0) / (ints.length - 1)) * (cfg.freqCurta / 100)
    const freqCrescente = ints.length >= 3 && ints[ints.length - 1] < ints[ints.length - 2] && ints[ints.length - 2] < ints[ints.length - 3]
    out.push({
      key, nome, unBase: linhas[0].un_base, categoria: moda(linhas.map(l => l.categoria)), linhas, pontos,
      lojas: [...new Set(linhas.map(l => l.loja))], fornecedores: [...new Set(linhas.map(l => l.fornecedor_key))], responsaveis: [...new Set(linhas.map(l => l.responsavel).filter(Boolean) as string[])],
      total, qtdTotal, ultimo, anterior, pct, difRs, nivel, menor: Math.min(...precos), maior: Math.max(...precos), media,
      vsMedia: pontos.length > 1 ? (ultimo.preco - media) / media * 100 : null, vsMenor: pontos.length > 1 ? (ultimo.preco - Math.min(...precos)) / Math.min(...precos) * 100 : null,
      diasUltimoAnterior: anterior ? dd(anterior.data, ultimo.data) : null, intervaloMedio,
      comprasMes: datas.length / meses, qtdMedia: qtdTotal / datas.length, valorMedio: total / datas.length, consumoMensal: qtdTotal / meses,
      dataAumento, forns, maisBarato, maisCaro, difForRs, difForPct, economia, intervaloCurto, freqCrescente,
    })
  })
  return out.sort((a, b) => b.total - a.total)
}

function linhasForn(p: Ponto): [string, Ponto][] {
  // um ponto por (dia, fornecedor) para o comparativo de fornecedores
  const m = new Map<string, Compra[]>()
  p.linhas.forEach(l => m.set(l.fornecedor_key, [...(m.get(l.fornecedor_key) || []), l]))
  return [...m.entries()].map(([f, ls]) => {
    const qtd = ls.reduce((s, l) => s + (l.qtd_base || 0), 0); const valor = ls.reduce((s, l) => s + l.valor, 0)
    return [f, { ...p, preco: valor / qtd, qtd, valor, fornecedor: f, fornecedorKey: f, linhas: ls }] as [string, Ponto]
  })
}

// ── Alertas ─────────────────────────────────────────────────────────────────
export interface Alerta { tipo: 'critico' | 'economia' | 'intervalo'; produto: Produto; titulo: string; detalhe: string; valor: number }
export function gerarAlertas(prods: Produto[]): Alerta[] {
  const out: Alerta[] = []
  prods.forEach(p => {
    if (p.nivel === 'critico' && p.pct != null && p.ultimo) out.push({ tipo: 'critico', produto: p, titulo: `Aumento crítico: +${p.pct.toFixed(1)}%`, detalhe: `${p.nome} subiu de ${brl(p.anterior!.preco)} para ${brl(p.ultimo.preco)}/${p.unBase} em ${dBR(p.ultimo.data)} (${p.ultimo.fornecedor}).`, valor: p.pct })
    if (p.economia > 0 && p.maisBarato && p.ultimo) out.push({ tipo: 'economia', produto: p, titulo: `Oportunidade de economia: ${brl(p.economia)}`, detalhe: `${p.nome}: último pago ${brl(p.ultimo.preco)}/${p.unBase} (${p.ultimo.fornecedor}); ${p.maisBarato.nome} cobra ${brl(p.maisBarato.ultimoPreco)}.`, valor: p.economia })
    if (p.intervaloCurto && p.ultimo) out.push({ tipo: 'intervalo', produto: p, titulo: 'Compra em intervalo menor que o histórico', detalhe: `${p.nome}: última compra após ${p.diasUltimoAnterior} dia(s), contra intervalo médio de ${(p.intervaloMedio || 0).toFixed(0)} dias.`, valor: p.diasUltimoAnterior || 0 })
  })
  return out.sort((a, b) => (a.tipo === b.tipo ? b.valor - a.valor : a.tipo.localeCompare(b.tipo)))
}

// ── Formatação ──────────────────────────────────────────────────────────────
export const brl = (n: number | null | undefined) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pctF = (n: number | null | undefined) => n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%'
export const dBR = (d: string | null | undefined) => { if (!d) return '—'; const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d }
export const titulo = (s: string) => (s || '').toLowerCase().replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())

// ── Exportação ──────────────────────────────────────────────────────────────
export interface Aba { nome: string; cab: string[]; linhas: (string | number)[][] }
const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export function baixarExcel(nomeArquivo: string, abas: Aba[]) {
  const ws = abas.map(a => `<Worksheet ss:Name="${esc(a.nome.slice(0, 31))}"><Table><Row>${a.cab.map(c => `<Cell><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('')}</Row>${a.linhas.map(r => `<Row>${r.map(v => typeof v === 'number' && isFinite(v) ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`).join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${ws}</Workbook>`
  const url = URL.createObjectURL(new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nomeArquivo.replace(/\.xml$/, '') + '.xls'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
}
/** Abre o relatório numa janela de impressão (Salvar como PDF). */
export function abrirPdf(tituloDoc: string, subt: string, secoes: { titulo: string; cab: string[]; linhas: (string | number)[][] }[]) {
  const w = window.open('', '_blank'); if (!w) return false
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(tituloDoc)}</title><style>
  body{font-family:Arial,Helvetica,sans-serif;color:#222;margin:24px}h1{color:#6B1212;margin:0 0 4px;font-size:22px}.s{color:#666;font-size:12px;margin-bottom:16px}
  h2{color:#6B1212;font-size:15px;border-bottom:2px solid #6B1212;padding-bottom:3px;margin:20px 0 6px}table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#6B1212;color:#fff;text-align:left;padding:5px 6px}td{padding:4px 6px;border-bottom:1px solid #ddd}tr:nth-child(even) td{background:#faf5f5}
  .ft{margin-top:24px;font-size:10px;color:#888}@media print{.np{display:none}h2{page-break-after:avoid}tr{page-break-inside:avoid}}</style></head><body>
  <button class="np" onclick="window.print()" style="float:right;padding:8px 14px;background:#6B1212;color:#fff;border:0;border-radius:6px;cursor:pointer">Imprimir / Salvar PDF</button>
  <h1>${esc(tituloDoc)}</h1><div class="s">${esc(subt)}</div>
  ${secoes.map(s => `<h2>${esc(s.titulo)}</h2>${s.linhas.length ? `<table><thead><tr>${s.cab.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${s.linhas.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<div class="s">Sem dados para este filtro.</div>'}`).join('')}
  <div class="ft">Painel Amore — Inteligência de Compras · gerado em ${new Date().toLocaleString('pt-BR')}</div></body></html>`
  w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400)
  return true
}
