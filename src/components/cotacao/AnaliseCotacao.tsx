import { useState, useEffect, useCallback } from 'react'
import { Plus, Check, Trash2, Loader2, Pencil, X } from 'lucide-react'
import { UNIDADES, CATEGORIAS } from '../../lib/catalogo'
import {
  fetchRequisicaoItens, fetchFornecedores, insertRequisicaoItem, deleteRequisicaoItem,
  updateRequisicaoItem, updateRequisicao, fetchEstoqueProdutos,
  fetchRequisicaoCotacoes, insertRequisicaoCotacao, updateRequisicaoCotacao, deleteRequisicaoCotacao,
  fetchCotacaoItens, upsertCotacaoItens, fetchAppConfig, saveAppConfig,
  fetchProfiles, insertReqTimeline,
} from '../../lib/db'
import { enviarWhatsApp, perfisDoSetor, soDigitos } from '../../lib/notify'
import type { Requisicao, RequisicaoItem, RequisicaoCotacao, RequisicaoCotacaoItem, Fornecedor, EstoqueProduto } from '../../types/database'

// ── Helpers ───────────────────────────────────────────────────
const fmtR$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const thCot: React.CSSProperties = { border: '1px solid var(--border)', padding: '6px 8px', textAlign: 'center', background: 'var(--bg)', fontWeight: 700, whiteSpace: 'nowrap' }
const tdCot: React.CSSProperties = { border: '1px solid var(--border)', padding: '4px 6px', textAlign: 'center' }
const lblSug: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', marginBottom: 2 }
const valSug: React.CSSProperties = { fontSize: 18, fontWeight: 800 }

const parseExtraCot = (obs: string | null): { val?: string } => {
  if (!obs) return {}
  try { const o = JSON.parse(obs); return (o && typeof o === 'object') ? o : {} } catch { return {} }
}
const diasAteValidade = (d?: string) => {
  if (!d) return null
  return Math.floor((new Date(d + 'T12:00:00').getTime() - Date.now()) / 86400000)
}
const corValidade = (dias: number | null) => dias == null ? undefined : dias < 15 ? '#B91C1C' : dias < 60 ? '#B45309' : '#15803D'

/** Metadados por cotação (fornecedor) — guardados em app_config: cot_frete:<cotacao_id> */
type FreteCfg = {
  frete: number
  rateio: 'valor' | 'quantidade' | 'manual'
  manual: Record<string, number>
  coleta?: string        // data em que os preços foram coletados
  entrega?: string       // data prevista de entrega
  agendamento?: string   // data/hora agendada da entrega
  validade?: string      // até quando o preço vale (prazo da cotação)
}

const COT_BADGE: Record<string, { l: string; c: string; bg: string }> = {
  aguardando: { l: 'Aguardando', c: '#B45309', bg: '#FEF3C7' },
  respondida: { l: 'Respondida', c: '#0369A1', bg: '#E0F2FE' },
  aprovada: { l: '✓ Aprovada', c: '#15803D', bg: '#DCFCE7' },
  rejeitada: { l: 'Rejeitada', c: '#6B7280', bg: '#F3F4F6' },
}

/** Análise completa de cotação de uma requisição: cadastro, comparativo, frete rateado, sugestão e relatório. */
export default function AnaliseCotacao({ req, loja, userName, toast, onAtualizar }: {
  req: Requisicao
  loja: string
  userName: string
  toast: (m: string) => void
  onAtualizar?: () => void
}) {
  const [itens, setItens] = useState<RequisicaoItem[]>([])
  const [cotacoes, setCotacoes] = useState<RequisicaoCotacao[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [cotItens, setCotItens] = useState<Record<string, RequisicaoCotacaoItem[]>>({})
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [fretes, setFretes] = useState<Record<string, FreteCfg>>({})
  const [validades, setValidades] = useState<Record<string, string>>({})
  const [showVal, setShowVal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [cotForm, setCotForm] = useState({ fornecedor_nome: '', total: '', prazo_entrega: '', observacoes: '' })
  const [savingCot, setSavingCot] = useState(false)
  const [novoItem, setNovoItem] = useState({ produto_nome: '', categoria: '', quantidade: '1', unidade: 'Unidade' })
  const [savingItem, setSavingItem] = useState(false)
  const [produtosCad, setProdutosCad] = useState<EstoqueProduto[]>([])
  const [editItem, setEditItem] = useState<{ id: string; produto_nome: string; quantidade: string; unidade: string; categoria: string } | null>(null)
  const [salvoEm, setSalvoEm] = useState<Date | null>(null)
  const [autoSalvando, setAutoSalvando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [savingPrecos, setSavingPrecos] = useState(false)
  const [mRelat, setMRelat] = useState(false)
  const [relatFones, setRelatFones] = useState('')
  const [enviandoRelat, setEnviandoRelat] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [is, cot] = await Promise.all([
        fetchRequisicaoItens(req.id),
        fetchRequisicaoCotacoes(req.id).catch(() => [] as RequisicaoCotacao[]),
      ])
      setItens(is); setCotacoes(cot)
      const pares = await Promise.all(cot.map(async c => [c.id, await fetchCotacaoItens(c.id).catch(() => [] as RequisicaoCotacaoItem[])] as const))
      const map: Record<string, RequisicaoCotacaoItem[]> = {}
      const pr: Record<string, string> = {}
      const vl: Record<string, string> = {}
      pares.forEach(([cid, arr]) => {
        map[cid] = arr
        arr.forEach(r => {
          if (r.preco_unitario != null) pr[cid + '|' + r.item_id] = String(r.preco_unitario)
          const ex = parseExtraCot(r.observacoes)
          if (ex.val) vl[cid + '|' + r.item_id] = ex.val
        })
      })
      const fr: Record<string, FreteCfg> = {}
      await Promise.all(cot.map(async c => {
        const cfg = await fetchAppConfig<FreteCfg>('cot_frete:' + c.id).catch(() => null)
        if (cfg) fr[c.id] = { frete: Number(cfg.frete) || 0, rateio: cfg.rateio || 'valor', manual: cfg.manual || {} }
      }))
      setCotItens(map); setPrecos(pr); setValidades(vl); setFretes(fr)
    } finally { setLoading(false) }
  }, [req.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { fetchFornecedores(loja).then(setFornecedores).catch(() => {}) }, [loja])
  useEffect(() => { fetchEstoqueProdutos(loja).then(setProdutosCad).catch(() => {}) }, [loja])

  const tEntry = async (tipo: string, desc: string) => {
    try { await insertReqTimeline({ requisicao_id: req.id, tipo, descricao: desc, usuario: userName, dados: null }) } catch { /* opcional */ }
  }

  // ── Produtos a cotar ──────────────────────────────────────
  const addItem = async () => {
    const nome = novoItem.produto_nome.trim()
    if (!nome) return
    setSavingItem(true)
    try {
      await insertRequisicaoItem({
        requisicao_id: req.id, produto_nome: nome, categoria: novoItem.categoria || null,
        quantidade: Number(String(novoItem.quantidade).replace(',', '.')) || 1,
        unidade: novoItem.unidade || 'Unidade',
        preco_referencia: null, preco_cotado: null, preco_final: null, fornecedor_nome: null,
        status: 'pendente', observacoes: null, bloqueado: false, motivo_bloqueio: null, quantidade_aprovada: null,
      })
      // mantém categoria e unidade para o próximo item (agiliza lançar vários da mesma linha)
      setNovoItem({ produto_nome: '', categoria: novoItem.categoria, quantidade: '1', unidade: novoItem.unidade || 'Unidade' })
      await load(); onAtualizar?.()
    } catch (e) { toast('Erro ao adicionar produto: ' + (e as Error).message) }
    finally { setSavingItem(false) }
  }
  const delItem = async (id: string) => {
    try { await deleteRequisicaoItem(id); await load(); onAtualizar?.() }
    catch (e) { toast('Erro ao remover: ' + (e as Error).message) }
  }
  const salvarEdicaoItem = async () => {
    if (!editItem || !editItem.produto_nome.trim()) return
    setSavingItem(true)
    try {
      await updateRequisicaoItem(editItem.id, {
        produto_nome: editItem.produto_nome.trim(),
        quantidade: Number(String(editItem.quantidade).replace(',', '.')) || 1,
        unidade: editItem.unidade || 'Unidade',
        categoria: editItem.categoria || null,
      })
      setEditItem(null)
      await load(); onAtualizar?.()
    } catch (e) { toast('Erro ao salvar: ' + (e as Error).message) }
    finally { setSavingItem(false) }
  }

  // ── CRUD de cotação ───────────────────────────────────────
  const addCotacao = async () => {
    if (!cotForm.fornecedor_nome.trim()) return
    setSavingCot(true)
    try {
      await insertRequisicaoCotacao({
        requisicao_id: req.id,
        fornecedor_nome: cotForm.fornecedor_nome.trim(),
        status: 'respondida',
        total: Number(cotForm.total) || 0,
        prazo_entrega: cotForm.prazo_entrega ? Number(cotForm.prazo_entrega) : null,
        observacoes: cotForm.observacoes || null,
      })
      await tEntry('cotacao', `Cotação de ${cotForm.fornecedor_nome.trim()} adicionada`)
      setCotForm({ fornecedor_nome: '', total: '', prazo_entrega: '', observacoes: '' })
      await load(); onAtualizar?.()
    } finally { setSavingCot(false) }
  }
  const aprovarCotacao = async (c: RequisicaoCotacao) => {
    setSavingCot(true)
    try {
      await Promise.all(cotacoes.map(x => updateRequisicaoCotacao(x.id, { status: x.id === c.id ? 'aprovada' : 'rejeitada' })))
      await tEntry('cotacao', `Cotação aprovada: ${c.fornecedor_nome}`)
      await load(); onAtualizar?.()
    } finally { setSavingCot(false) }
  }
  const delCotacao = async (id: string) => {
    await deleteRequisicaoCotacao(id)
    await load(); onAtualizar?.()
  }

  // ── Cálculos ──────────────────────────────────────────────
  const keyPreco = (cotId: string, itemId: string) => cotId + '|' + itemId
  const precoDe = (cotId: string, itemId: string): number | null => {
    const v = precos[keyPreco(cotId, itemId)]
    if (v === undefined || v === '') return null
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const totalCot = (cotId: string) => itens.reduce((s, i) => { const p = precoDe(cotId, i.id); return s + (p != null ? p * i.quantidade : 0) }, 0)
  const atendCot = (cotId: string) => itens.length ? Math.round(itens.filter(i => precoDe(cotId, i.id) != null).length / itens.length * 100) : 0

  const freteCfgDe = (cotId: string): FreteCfg => fretes[cotId] || { frete: 0, rateio: 'valor', manual: {} }
  const setFreteCfg = (cotId: string, patch: Partial<FreteCfg>) =>
    setFretes(prev => ({ ...prev, [cotId]: { ...freteCfgDe(cotId), ...patch } }))
  const rateioDoItem = (cotId: string, item: RequisicaoItem): number => {
    const cfg = freteCfgDe(cotId)
    if (!cfg.frete) return 0
    if (cfg.rateio === 'manual') return Number(cfg.manual?.[item.id]) || 0
    const cotados = itens.filter(i => precoDe(cotId, i.id) != null)
    if (!cotados.length || precoDe(cotId, item.id) == null) return 0
    if (cfg.rateio === 'quantidade') {
      const tot = cotados.reduce((s, i) => s + i.quantidade, 0)
      return tot ? cfg.frete * (item.quantidade / tot) : 0
    }
    const tot = cotados.reduce((s, i) => s + (precoDe(cotId, i.id) || 0) * i.quantidade, 0)
    return tot ? cfg.frete * (((precoDe(cotId, item.id) || 0) * item.quantidade) / tot) : 0
  }
  const custoRealUnit = (cotId: string, item: RequisicaoItem): number | null => {
    const p = precoDe(cotId, item.id)
    if (p == null) return null
    return p + (item.quantidade ? rateioDoItem(cotId, item) / item.quantidade : 0)
  }
  const custoRealTotal = (cotId: string) => totalCot(cotId) + (freteCfgDe(cotId).frete || 0)

  const calcSugestao = () => {
    const porForn: Record<string, { itens: { item: RequisicaoItem; preco: number; sub: number }[]; frete: number }> = {}
    const semCotacao: RequisicaoItem[] = []
    for (const i of itens) {
      let melhor: { cotId: string; preco: number } | null = null
      for (const c of cotacoes) {
        const p = precoDe(c.id, i.id)
        if (p == null) continue
        if (!melhor || p < melhor.preco) melhor = { cotId: c.id, preco: p }
      }
      if (!melhor) { semCotacao.push(i); continue }
      if (!porForn[melhor.cotId]) porForn[melhor.cotId] = { itens: [], frete: 0 }
      porForn[melhor.cotId].itens.push({ item: i, preco: melhor.preco, sub: melhor.preco * i.quantidade })
    }
    Object.keys(porForn).forEach(cid => { porForn[cid].frete = freteCfgDe(cid).frete || 0 })
    const totalProdutos = Object.values(porForn).reduce((s, g) => s + g.itens.reduce((a, x) => a + x.sub, 0), 0)
    const totalFrete = Object.values(porForn).reduce((s, g) => s + g.frete, 0)
    const totalFracionado = totalProdutos + totalFrete
    const completos = cotacoes.filter(c => atendCot(c.id) === 100)
    const base = completos.length ? completos : cotacoes.filter(c => totalCot(c.id) > 0)
    const melhorUnico = base.length ? base.reduce((m, c) => (custoRealTotal(c.id) < custoRealTotal(m.id) ? c : m)) : null
    const custoUnico = melhorUnico ? custoRealTotal(melhorUnico.id) : 0
    const economia = custoUnico > 0 ? custoUnico - totalFracionado : 0
    return { porForn, semCotacao, totalProdutos, totalFrete, totalFracionado, melhorUnico, custoUnico, economia, completos: completos.length }
  }

  /** Salva UMA célula assim que o campo perde o foco — evita perder coleta feita em dias/lugares diferentes. */
  const salvarCelula = async (cotId: string, item: RequisicaoItem) => {
    const p = precoDe(cotId, item.id)
    const existentes = cotItens[cotId] || []
    const ex = existentes.find(x => x.item_id === item.id)
    if (p == null && !ex) return
    const val = validades[keyPreco(cotId, item.id)]
    const row: Record<string, unknown> = {
      cotacao_id: cotId, item_id: item.id,
      preco_unitario: p, disponivel: p != null,
      observacoes: val ? JSON.stringify({ val }) : null,
    }
    if (ex) row.id = ex.id
    setAutoSalvando(true)
    try {
      await upsertCotacaoItens([row] as never)
      const t = custoRealTotal(cotId)
      if (t > 0) await updateRequisicaoCotacao(cotId, { total: t })
      if (!ex) {
        const arr = await fetchCotacaoItens(cotId).catch(() => [] as RequisicaoCotacaoItem[])
        setCotItens(prev => ({ ...prev, [cotId]: arr }))
      }
      setSalvoEm(new Date())
    } catch { /* silencioso: o botão Salvar continua disponível */ }
    finally { setAutoSalvando(false) }
  }

  /** Salva frete/rateio/datas do fornecedor (app_config) ao sair do campo. */
  const salvarMetaCot = async (cotId: string) => {
    const cfg = fretes[cotId]
    if (!cfg) return
    setAutoSalvando(true)
    try {
      await saveAppConfig('cot_frete:' + cotId, cfg)
      const t = custoRealTotal(cotId)
      if (t > 0) await updateRequisicaoCotacao(cotId, { total: t })
      setSalvoEm(new Date())
    } catch { /* silencioso */ }
    finally { setAutoSalvando(false) }
  }

  const salvarPrecos = async () => {
    setSavingPrecos(true)
    try {
      const payload: Record<string, unknown>[] = []
      for (const c of cotacoes) {
        const existentes = cotItens[c.id] || []
        for (const i of itens) {
          const p = precoDe(c.id, i.id)
          const ex = existentes.find(x => x.item_id === i.id)
          if (p == null && !ex) continue
          const val = validades[keyPreco(c.id, i.id)]
          const row: Record<string, unknown> = {
            cotacao_id: c.id, item_id: i.id,
            preco_unitario: p, disponivel: p != null,
            observacoes: val ? JSON.stringify({ val }) : null,
          }
          if (ex) row.id = ex.id
          payload.push(row)
        }
      }
      if (payload.length) await upsertCotacaoItens(payload as never)
      await Promise.all(cotacoes.map(async c => { const cfg = fretes[c.id]; if (cfg) await saveAppConfig('cot_frete:' + c.id, cfg) }))
      await Promise.all(cotacoes.map(async c => { const t = custoRealTotal(c.id); if (t > 0) await updateRequisicaoCotacao(c.id, { total: t }) }))
      await tEntry('cotacao', `Preços por item atualizados (${payload.length} lançamento(s))`)
      toast('Preços salvos!')
      await load(); onAtualizar?.()
    } catch (e) { toast('Erro ao salvar: ' + (e as Error).message) }
    finally { setSavingPrecos(false) }
  }

  // ── Aprovação fracionada e fechamento do pedido ───────────
  /** Aprova todos os fornecedores que a sugestão indicou (compra fracionada). */
  const aprovarFracionado = async () => {
    const usados = Object.keys(calcSugestao().porForn)
    if (!usados.length) return
    if (!confirm(`Aprovar a compra fracionada em ${usados.length} fornecedor(es), conforme a sugestão?`)) return
    setSavingCot(true)
    try {
      await Promise.all(cotacoes.map(c => updateRequisicaoCotacao(c.id, { status: usados.includes(c.id) ? 'aprovada' : 'rejeitada' })))
      await tEntry('cotacao', `Compra fracionada aprovada em ${usados.length} fornecedor(es)`)
      await load(); onAtualizar?.()
    } finally { setSavingCot(false) }
  }

  /** Grava os preços aprovados nos itens e fecha o pedido de compra. */
  const fecharPedido = async () => {
    const aprovadas = cotacoes.filter(c => c.status === 'aprovada')
    if (!aprovadas.length) return
    if (!confirm('Fechar o pedido de compra?\n\nOs preços dos fornecedores aprovados serão gravados nos itens e a requisição será marcada como COMPRA REALIZADA.')) return
    setFechando(true)
    try {
      let total = 0, gravados = 0
      for (const i of itens) {
        let melhor: { c: RequisicaoCotacao; p: number } | null = null
        for (const c of aprovadas) {
          const p = precoDe(c.id, i.id)
          if (p == null) continue
          if (!melhor || p < melhor.p) melhor = { c, p }
        }
        if (!melhor) continue
        const custoUnit = custoRealUnit(melhor.c.id, i) ?? melhor.p
        total += custoUnit * i.quantidade
        gravados++
        await updateRequisicaoItem(i.id, { preco_final: custoUnit, fornecedor_nome: melhor.c.fornecedor_nome, status: 'aprovado' })
      }
      await updateRequisicao(req.id, { total_final: total, status: 'compra_realizada' })
      await tEntry('compra', `Pedido de compra fechado — ${aprovadas.length} fornecedor(es), ${gravados} item(ns), total ${fmtR$(total)}`)
      toast(`Pedido fechado! ${gravados} item(ns) · ${fmtR$(total)}`)
      await load(); onAtualizar?.()
    } catch (e) { toast('Erro ao fechar pedido: ' + (e as Error).message) }
    finally { setFechando(false) }
  }

  // ── Relatório de aprovação ────────────────────────────────
  const cotAprovadas = cotacoes.filter(c => c.status === 'aprovada')
  const numReq = () => `REQ-${String(req.numero).padStart(4, '0')}`
  const totalAprovado = () => cotAprovadas.reduce((s, c) => s + (c.total || 0), 0)
  const economiaVsMaior = () => {
    const validas = cotacoes.filter(c => c.status !== 'rejeitada')
    const maior = validas.length ? Math.max(...validas.map(c => c.total || 0)) : 0
    return Math.max(0, maior - totalAprovado())
  }
  const montarMsgAprovacao = () => {
    const linhasForn = cotAprovadas.map(c =>
      `• *${c.fornecedor_nome}* — ${fmtR$(c.total || 0)}` +
      (c.prazo_entrega != null ? ` · entrega ${c.prazo_entrega} dias` : '') +
      (c.observacoes ? `\n   _${c.observacoes}_` : '')
    ).join('\n')
    const linhasItens = itens.slice(0, 30).map(i =>
      `• ${i.produto_nome} — ${i.quantidade} ${i.unidade}` +
      (i.preco_final ? ` · ${fmtR$(i.preco_final)}` : i.preco_cotado ? ` · ${fmtR$(i.preco_cotado)}` : '')
    ).join('\n')
    const eco = economiaVsMaior()
    return `✅ *COMPRA APROVADA*\n\n` +
      `Requisição: ${numReq()}\nLoja: ${loja}\n` +
      (req.setor ? `Setor: ${req.setor}\n` : '') +
      `Solicitante: ${req.responsavel_nome}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\n` +
      `*Fornecedor(es) aprovado(s):*\n${linhasForn || '—'}\n\n` +
      `*Total aprovado:* ${fmtR$(totalAprovado())}\n` +
      (eco > 0 ? `*Economia vs maior cotação:* ${fmtR$(eco)}\n` : '') +
      (linhasItens ? `\n*Itens (${itens.length}):*\n${linhasItens}${itens.length > 30 ? '\n…' : ''}\n` : '') +
      (req.aprovador_nome ? `\n👤 Aprovado por: ${req.aprovador_nome}\n` : '') +
      `\n_Painel AmoreFood_`
  }
  const abrirRelatorioPDF = () => {
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
    const linhasForn = cotAprovadas.map(c => `<tr><td>${esc(c.fornecedor_nome)}</td><td>${c.prazo_entrega != null ? c.prazo_entrega + ' dias' : '—'}</td><td>${esc(c.observacoes || '—')}</td><td style="text-align:right"><b>${fmtR$(c.total || 0)}</b></td></tr>`).join('')
    const linhasIt = itens.map(i => `<tr><td>${esc(i.produto_nome)}</td><td>${esc(i.categoria || '—')}</td><td>${i.quantidade} ${esc(i.unidade)}</td><td style="text-align:right">${i.preco_final ? fmtR$(i.preco_final) : (i.preco_cotado ? fmtR$(i.preco_cotado) : '—')}</td></tr>`).join('')
    const eco = economiaVsMaior()
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${numReq()} — Aprovação de Compra</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;padding:28px;max-width:880px;margin:auto}
      h1{color:#6B1212;margin:0 0 4px} h3{color:#6B1212;margin:20px 0 8px;font-size:15px}
      .sub{color:#666;font-size:13px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px} th,td{border:1px solid #e2e2e2;padding:6px 8px;text-align:left} th{background:#f6f0f0;color:#6B1212}
      .tot{margin-top:10px;font-size:16px;font-weight:700;text-align:right} .eco{text-align:right;color:#15803D;font-size:13px}
      @media print{.noprint{display:none}}
    </style></head><body>
      <h1>Aprovação de Compra — ${numReq()}</h1>
      <div class="sub">Loja <b>${esc(loja)}</b>${req.setor ? ` &nbsp;|&nbsp; Setor ${esc(req.setor)}` : ''} &nbsp;|&nbsp; Solicitante ${esc(req.responsavel_nome)} &nbsp;|&nbsp; ${new Date().toLocaleDateString('pt-BR')}</div>
      <h3>Fornecedores aprovados</h3>
      <table><thead><tr><th>Fornecedor</th><th>Prazo</th><th>Observações</th><th style="text-align:right">Total</th></tr></thead><tbody>${linhasForn || '<tr><td colspan="4">Nenhuma cotação aprovada</td></tr>'}</tbody></table>
      <div class="tot">Total aprovado: ${fmtR$(totalAprovado())}</div>
      ${eco > 0 ? `<div class="eco">Economia vs maior cotação: ${fmtR$(eco)}</div>` : ''}
      <h3>Itens da requisição (${itens.length})</h3>
      <table><thead><tr><th>Produto</th><th>Categoria</th><th>Qtd</th><th style="text-align:right">Preço</th></tr></thead><tbody>${linhasIt || '<tr><td colspan="4">—</td></tr>'}</tbody></table>
      ${req.aprovador_nome ? `<p style="margin-top:18px;font-size:13px">Aprovado por: <b>${esc(req.aprovador_nome)}</b></p>` : ''}
      <button class="noprint" onclick="window.print()" style="margin-top:20px;padding:8px 16px;background:#6B1212;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / Salvar PDF</button>
    </body></html>`
    const w = window.open('', '_blank')
    if (!w) { alert('Permita pop-ups para gerar o PDF.'); return }
    w.document.write(html); w.document.close()
  }
  const abrirModalRelat = async () => {
    let f = localStorage.getItem('compras_relat_fones') || ''
    if (!f) {
      try {
        const profiles = await fetchProfiles()
        const alvos = [...perfisDoSetor(profiles, 'Compras'), ...perfisDoSetor(profiles, 'Gerência'), ...perfisDoSetor(profiles, 'Gerente')]
        f = Array.from(new Set(alvos.map(pf => soDigitos((pf?.permissions_override as Record<string, { whatsapp?: string }>)?.__perfil__?.whatsapp)).filter(Boolean))).join(', ')
      } catch { /* vazio */ }
    }
    setRelatFones(f); setMRelat(true)
  }
  const enviarRelatorioWhats = async () => {
    const fones = Array.from(new Set(relatFones.split(/[,;\n]/).map(s => soDigitos(s)).filter(Boolean)))
    if (!fones.length) { alert('Informe ao menos um número de WhatsApp.'); return }
    setEnviandoRelat(true)
    try {
      localStorage.setItem('compras_relat_fones', relatFones)
      const msg = montarMsgAprovacao()
      let ok = 0
      for (const f of fones) {
        if (await enviarWhatsApp(f, msg, undefined, { tipo: 'compra', modulo: 'requisicoes', titulo: `Aprovação ${numReq()}`, loja, created_by: userName })) ok++
      }
      await tEntry('relatorio', `Relatório de aprovação enviado por WhatsApp para ${ok}/${fones.length} número(s)`)
      alert(`Relatório enviado para ${ok} de ${fones.length} número(s).`)
      setMRelat(false); await load()
    } finally { setEnviandoRelat(false) }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>

  const validas = cotacoes.filter(c => c.status !== 'rejeitada')
  const menorTotal = validas.length ? Math.min(...validas.map(c => c.total ?? Infinity)) : null
  const menorPrazo = validas.filter(c => c.prazo_entrega != null).length ? Math.min(...validas.filter(c => c.prazo_entrega != null).map(c => c.prazo_entrega as number)) : null
  const s = calcSugestao()

  return (
    <div>
      {/* 1. Produtos a cotar */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><span className="card-tt">🛒 1. Produtos a cotar ({itens.length})</span></div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,2fr) minmax(120px,1fr) 80px minmax(120px,1fr) auto', gap: 8, alignItems: 'end', marginBottom: itens.length ? 12 : 0 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Produto *</label>
              <input list="prod-cad-an" value={novoItem.produto_nome}
                onChange={e => {
                  const v = e.target.value
                  const p = produtosCad.find(x => (x.nome || '').toLowerCase() === v.trim().toLowerCase())
                  setNovoItem(f => ({ ...f, produto_nome: v, categoria: p?.categoria || f.categoria }))
                }}
                onKeyDown={e => { if (e.key === 'Enter') addItem() }} placeholder="Digite ou escolha do cadastro"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
              <datalist id="prod-cad-an">
                {produtosCad.map(p => <option key={p.id} value={p.nome}>{p.categoria}{p.gramatura ? ` · ${p.gramatura}` : ''}</option>)}
              </datalist>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Categoria</label>
              <select value={novoItem.categoria} onChange={e => setNovoItem(f => ({ ...f, categoria: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">—</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Qtd</label>
              <input value={novoItem.quantidade} inputMode="decimal" onChange={e => setNovoItem(f => ({ ...f, quantidade: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Unidade</label>
              <select value={novoItem.unidade} onChange={e => setNovoItem(f => ({ ...f, unidade: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <button className="btn" onClick={addItem} disabled={savingItem || !novoItem.produto_nome.trim()} style={{ padding: '9px 14px' }}>
              <Plus size={14} /> Adicionar
            </button>
          </div>
          {itens.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Comece adicionando os produtos que você vai cotar. Depois cadastre os fornecedores/mercados abaixo.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {itens.map(i => (
                <span key={i.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 8px 4px 11px', fontSize: 12 }}>
                  {i.produto_nome} <span style={{ color: 'var(--muted)' }}>({i.quantidade} {i.unidade}{i.categoria ? ` · ${i.categoria}` : ''})</span>
                  <button onClick={() => setEditItem({ id: i.id, produto_nome: i.produto_nome, quantidade: String(i.quantidade), unidade: i.unidade || 'Unidade', categoria: i.categoria || '' })} title="Editar"
                    style={{ background: 'none', border: 'none', color: 'var(--bordo)', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'inline-flex' }}><Pencil size={12} /></button>
                  <button onClick={() => delItem(i.id)} title="Remover"
                    style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Edição inline de um item */}
          {editItem && (
              <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--bordo)', borderRadius: 9, background: 'var(--bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ fontSize: 12.5 }}>✏️ Editar produto</strong>
                  <button onClick={() => setEditItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,2fr) minmax(120px,1fr) 80px minmax(120px,1fr) auto', gap: 8, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Produto</label>
                    <input value={editItem.produto_nome} onChange={e => setEditItem(v => v && ({ ...v, produto_nome: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') salvarEdicaoItem() }}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Categoria</label>
                    <select value={editItem.categoria} onChange={e => setEditItem(v => v && ({ ...v, categoria: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, boxSizing: 'border-box' }}>
                      <option value="">—</option>
                      {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Qtd</label>
                    <input value={editItem.quantidade} inputMode="decimal" onChange={e => setEditItem(v => v && ({ ...v, quantidade: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Unidade</label>
                    <select value={editItem.unidade} onChange={e => setEditItem(v => v && ({ ...v, unidade: e.target.value }))}
                      style={{ width: '100%', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13, boxSizing: 'border-box' }}>
                      {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <button className="btn" onClick={salvarEdicaoItem} disabled={savingItem || !editItem.produto_nome.trim()} style={{ padding: '8px 13px' }}>
                    {savingItem ? '…' : 'Salvar'}
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>

      {/* 2. Nova cotação */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header"><span className="card-tt">➕ 2. Fornecedor / mercado — digite qualquer nome, não precisa estar cadastrado</span></div>
        <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fornecedor / local *</label>
            <input list="forn-list-an" value={cotForm.fornecedor_nome} onChange={e => setCotForm(f => ({ ...f, fornecedor_nome: e.target.value }))} placeholder="Ex.: Atacadão, Assaí, Fornecedor X"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
            <datalist id="forn-list-an">{fornecedores.map(f => <option key={f.id} value={f.nome} />)}</datalist>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Total (opcional)</label>
            <input type="number" step="0.01" min="0" value={cotForm.total} onChange={e => setCotForm(f => ({ ...f, total: e.target.value }))} placeholder="calculado pelos itens"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Prazo (dias)</label>
            <input type="number" min="0" value={cotForm.prazo_entrega} onChange={e => setCotForm(f => ({ ...f, prazo_entrega: e.target.value }))} placeholder="dias"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Condição / observações</label>
            <input value={cotForm.observacoes} onChange={e => setCotForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="pagamento, condição…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }} />
          </div>
          <button className="btn" onClick={addCotacao} disabled={savingCot || !cotForm.fornecedor_nome.trim()} style={{ padding: '9px 14px' }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
      </div>

      {cotacoes.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
          Nenhuma cotação ainda. Adicione ao menos <strong>2 fornecedores</strong> para liberar o comparativo, o custo real e a sugestão de compra.
        </div>
      )}

      {/* 2. Fornecedores cotados */}
      {cotacoes.map(c => {
        const badge = COT_BADGE[c.status] || COT_BADGE.respondida
        const isMenorPreco = menorTotal != null && (c.total ?? Infinity) === menorTotal && c.status !== 'rejeitada'
        const isMenorPrazo = menorPrazo != null && c.prazo_entrega === menorPrazo && c.status !== 'rejeitada'
        return <div key={c.id} className="card" style={{ marginBottom: 8, border: c.status === 'aprovada' ? '1px solid #86EFAC' : '1px solid var(--border)' }}>
          <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14 }}>{c.fornecedor_nome}</strong>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: badge.bg, color: badge.c }}>{badge.l}</span>
                {isMenorPreco && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#DCFCE7', color: '#15803D' }}>🏆 Menor total</span>}
                {isMenorPrazo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: '#E0F2FE', color: '#0369A1' }}>⚡ Melhor prazo</span>}
              </div>
              {c.observacoes && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{c.observacoes}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: isMenorPreco ? '#15803D' : 'var(--text)' }}>{fmtR$(c.total || 0)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.prazo_entrega != null ? `${c.prazo_entrega} dias` : 'prazo —'} · atende {atendCot(c.id)}%</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {c.status !== 'aprovada' && <button className="btn" onClick={() => aprovarCotacao(c)} disabled={savingCot} style={{ background: '#15803D', padding: '6px 12px', fontSize: 12 }}><Check size={12} /> Aprovar</button>}
              <button className="ib rd" onClick={() => delCotacao(c.id)} style={{ padding: '5px 9px' }}><Trash2 size={13} /></button>
            </div>
          </div>
          {/* Datas desta cotação — cada fornecedor tem a sua */}
          <div style={{ padding: '0 14px 11px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(122px,1fr))', gap: 8 }}>
            {([['coleta', '📥 Coletado em', 'date'], ['validade', '⏳ Preço vale até', 'date'], ['entrega', '🚚 Entrega prevista', 'date'], ['agendamento', '📅 Agendamento', 'datetime-local']] as const).map(([k, lb, tp]) => (
              <div key={k}>
                <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 2 }}>{lb}</label>
                <input type={tp} value={(freteCfgDe(c.id)[k] as string) || ''}
                  onChange={e => setFreteCfg(c.id, { [k]: e.target.value } as Partial<FreteCfg>)}
                  onBlur={() => salvarMetaCot(c.id)}
                  style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 11, boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
        </div>
      })}

      {/* 3. Dashboard */}
      {cotacoes.length > 0 && itens.length > 0 && (() => {
        const totalCotado = cotacoes.reduce((a, c) => a + custoRealTotal(c.id), 0)
        const competitivos = cotacoes.filter(c => custoRealTotal(c.id) > 0).sort((a, b) => custoRealTotal(a.id) - custoRealTotal(b.id))
        const maisComp = competitivos[0]
        const soUmForn = itens.filter(i => cotacoes.filter(c => precoDe(c.id, i.id) != null).length === 1).length
        let comVal = 0, curtos = 0
        for (const c of cotacoes) for (const i of itens) {
          if (precoDe(c.id, i.id) == null) continue
          const v = validades[keyPreco(c.id, i.id)]
          if (!v) continue
          comVal++
          const d = diasAteValidade(v)
          if (d != null && d < 30) curtos++
        }
        const pctCurto = comVal ? Math.round(curtos / comVal * 100) : 0
        const atendMedio = cotacoes.length ? Math.round(cotacoes.reduce((a, c) => a + atendCot(c.id), 0) / cotacoes.length) : 0
        const kpi = (l: string, v: string, cor?: string, sub?: string) => (
          <div key={l} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 11px' }}>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{l}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: cor || 'var(--text)', wordBreak: 'break-word' }}>{v}</div>
            {sub && <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>{sub}</div>}
          </div>
        )
        return <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header"><span className="card-tt">📈 Dashboard da cotação</span></div>
          <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(142px,1fr))', gap: 9 }}>
            {kpi('Total cotado', fmtR$(totalCotado), undefined, `${cotacoes.length} fornecedor(es)`)}
            {kpi('Melhor compra', fmtR$(s.totalFracionado), '#15803D', `${Object.keys(s.porForn).length} fornecedor(es)`)}
            {kpi('Economia potencial', s.economia > 0 ? fmtR$(s.economia) : '—', s.economia > 0 ? '#15803D' : undefined, 'vs fornecedor único')}
            {kpi('Frete total', fmtR$(s.totalFrete), undefined, 'dos fornecedores usados')}
            {kpi('Mais competitivo', maisComp?.fornecedor_nome || '—', undefined, maisComp ? fmtR$(custoRealTotal(maisComp.id)) : '')}
            {kpi('Atendimento médio', `${atendMedio}%`, atendMedio === 100 ? '#15803D' : atendMedio >= 70 ? '#B45309' : '#B91C1C')}
            {kpi('Validade curta', comVal ? `${pctCurto}%` : '—', pctCurto > 0 ? '#B45309' : undefined, comVal ? `${curtos} de ${comVal} cotados` : 'validade não informada')}
            {kpi('Sem cotação', String(s.semCotacao.length), s.semCotacao.length ? '#B91C1C' : '#15803D', 'itens')}
            {kpi('Só 1 fornecedor', String(soUmForn), soUmForn ? '#B45309' : undefined, 'itens sem concorrência')}
          </div>
        </div>
      })()}

      {/* 4. Comparativo por item */}
      {cotacoes.length > 0 && itens.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="card-tt">📊 Comparativo por item — preencha os preços coletados</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10.5, color: autoSalvando ? '#B45309' : '#15803D', marginRight: 4 }}>
                {autoSalvando ? '💾 salvando…' : salvoEm ? `✓ salvo ${salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '✓ salva sozinho'}
              </span>
              <button className="btn" onClick={() => setShowVal(v => !v)}
                style={{ padding: '7px 12px', fontSize: 12, background: showVal ? 'var(--bordo)' : 'var(--bg)', color: showVal ? '#fff' : 'var(--text)', border: '1px solid var(--border)' }}>🗓️ Validade</button>
              <button className="btn" onClick={salvarPrecos} disabled={savingPrecos} style={{ padding: '7px 12px', fontSize: 12 }}>
                {savingPrecos ? 'Salvando…' : '💾 Salvar preços'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thCot, textAlign: 'left', minWidth: 170, position: 'sticky', left: 0, zIndex: 1 }}>Produto</th>
                  <th style={{ ...thCot, minWidth: 76 }}>Qtd</th>
                  {cotacoes.map(c => <th key={c.id} style={{ ...thCot, minWidth: 118 }}>{c.fornecedor_nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {itens.map(i => {
                  const ps = cotacoes.map(c => precoDe(c.id, i.id)).filter((v): v is number => v != null)
                  const min = ps.length ? Math.min(...ps) : null
                  const max = ps.length ? Math.max(...ps) : null
                  return <tr key={i.id}>
                    <td style={{ ...tdCot, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>{i.produto_nome}</td>
                    <td style={{ ...tdCot, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{i.quantidade} {i.unidade}</td>
                    {cotacoes.map(c => {
                      const p = precoDe(c.id, i.id)
                      const bg = p == null ? undefined
                        : (min != null && p === min) ? '#DCFCE7'
                        : (max != null && p === max && max !== min) ? '#FEE2E2' : '#FEF3C7'
                      return <td key={c.id} style={{ ...tdCot, background: bg }}>
                        <input value={precos[keyPreco(c.id, i.id)] ?? ''} inputMode="decimal" placeholder="—"
                          onChange={e => setPrecos(prev => ({ ...prev, [keyPreco(c.id, i.id)]: e.target.value }))}
                          onBlur={() => salvarCelula(c.id, i)}
                          style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12, textAlign: 'right', boxSizing: 'border-box' }} />
                        {freteCfgDe(c.id).frete > 0 && p != null && (
                          <div style={{ fontSize: 9.5, color: 'var(--muted)', marginTop: 2 }}>c/ frete {fmtR$(custoRealUnit(c.id, i) || 0)}</div>
                        )}
                        {showVal && p != null && (() => {
                          const v = validades[keyPreco(c.id, i.id)] || ''
                          const d = diasAteValidade(v)
                          return <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 3 }}>
                            <input type="date" value={v} onChange={e => setValidades(prev => ({ ...prev, [keyPreco(c.id, i.id)]: e.target.value }))}
                              onBlur={() => salvarCelula(c.id, i)}
                              style={{ width: '100%', padding: '2px 4px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 9.5, boxSizing: 'border-box' }} />
                            {d != null && <span title={`${d} dias`} style={{ width: 8, height: 8, borderRadius: '50%', background: corValidade(d), flexShrink: 0 }} />}
                          </div>
                        })()}
                        {freteCfgDe(c.id).rateio === 'manual' && p != null && (
                          <input value={String(freteCfgDe(c.id).manual?.[i.id] ?? '')} inputMode="decimal" placeholder="frete R$"
                            onChange={e => setFreteCfg(c.id, { manual: { ...freteCfgDe(c.id).manual, [i.id]: Number(String(e.target.value).replace(',', '.')) || 0 } })}
                            style={{ width: '100%', marginTop: 3, padding: '3px 5px', borderRadius: 5, border: '1px dashed var(--border)', background: 'var(--bg)', fontSize: 10, textAlign: 'right', boxSizing: 'border-box' }} />
                        )}
                      </td>
                    })}
                  </tr>
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...tdCot, textAlign: 'left', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>Total</td>
                  <td style={tdCot}></td>
                  {cotacoes.map(c => {
                    const tots = cotacoes.map(x => totalCot(x.id)).filter(v => v > 0)
                    const menor = tots.length ? Math.min(...tots) : null
                    const t = totalCot(c.id)
                    return <td key={c.id} style={{ ...tdCot, fontWeight: 800, color: (menor != null && t === menor && t > 0) ? '#15803D' : 'var(--text)' }}>{fmtR$(t)}</td>
                  })}
                </tr>
                <tr>
                  <td style={{ ...tdCot, textAlign: 'left', color: 'var(--muted)', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>Frete (R$)</td>
                  <td style={tdCot}></td>
                  {cotacoes.map(c => (
                    <td key={c.id} style={tdCot}>
                      <input value={freteCfgDe(c.id).frete || ''} inputMode="decimal" placeholder="0,00"
                        onChange={e => setFreteCfg(c.id, { frete: Number(String(e.target.value).replace(',', '.')) || 0 })}
                        onBlur={() => salvarMetaCot(c.id)}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 11, textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ ...tdCot, textAlign: 'left', color: 'var(--muted)', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>Ratear por</td>
                  <td style={tdCot}></td>
                  {cotacoes.map(c => (
                    <td key={c.id} style={tdCot}>
                      <select value={freteCfgDe(c.id).rateio} onChange={e => { setFreteCfg(c.id, { rateio: e.target.value as FreteCfg['rateio'] }); setTimeout(() => salvarMetaCot(c.id), 0) }}
                        style={{ width: '100%', padding: '3px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 10.5 }}>
                        <option value="valor">valor</option>
                        <option value="quantidade">quantidade</option>
                        <option value="manual">manual</option>
                      </select>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ ...tdCot, textAlign: 'left', fontWeight: 800, position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>Custo real</td>
                  <td style={tdCot}></td>
                  {cotacoes.map(c => {
                    const reais = cotacoes.map(x => custoRealTotal(x.id)).filter(v => v > 0)
                    const menorReal = reais.length ? Math.min(...reais) : null
                    const t = custoRealTotal(c.id)
                    return <td key={c.id} style={{ ...tdCot, fontWeight: 800, background: (menorReal != null && t === menorReal && t > 0) ? '#DCFCE7' : undefined, color: (menorReal != null && t === menorReal && t > 0) ? '#15803D' : 'var(--text)' }}>{fmtR$(t)}</td>
                  })}
                </tr>
                <tr>
                  <td style={{ ...tdCot, textAlign: 'left', color: 'var(--muted)', position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 }}>Atendimento</td>
                  <td style={tdCot}></td>
                  {cotacoes.map(c => { const a = atendCot(c.id); return <td key={c.id} style={{ ...tdCot, fontWeight: 700, color: a === 100 ? '#15803D' : a >= 70 ? '#B45309' : '#B91C1C' }}>{a}%</td> })}
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--muted)' }}>
            🟢 menor preço · 🟡 intermediário · 🔴 maior preço. <strong>Custo real</strong> = total + frete rateado (é este valor que vale pra decisão). <strong>Atendimento</strong> = % dos itens que o fornecedor cotou.
          </div>
        </div>
      )}

      {/* 5. Sugestão de compra */}
      {cotacoes.length > 1 && itens.length > 0 && Object.keys(s.porForn).length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header"><span className="card-tt">🧠 Sugestão de compra — menor custo item a item</span></div>
          <div style={{ padding: '12px 14px' }}>
            {Object.keys(s.porForn).map(cid => {
              const g = s.porForn[cid]
              const forn = cotacoes.find(c => c.id === cid)
              const sub = g.itens.reduce((a, x) => a + x.sub, 0)
              return <div key={cid} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <strong style={{ fontSize: 13 }}>{forn?.fornecedor_nome} — {g.itens.length} item(ns)</strong>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{fmtR$(sub + g.frete)}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{g.itens.map(x => x.item.produto_nome).join(' · ')}</div>
                {g.frete > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>produtos {fmtR$(sub)} + frete {fmtR$(g.frete)}</div>}
              </div>
            })}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginTop: 6 }}>
              <div>
                <div style={lblSug}>Compra fracionada</div>
                <div style={{ ...valSug, color: '#15803D' }}>{fmtR$(s.totalFracionado)}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{Object.keys(s.porForn).length} fornecedor(es) · frete {fmtR$(s.totalFrete)}</div>
              </div>
              <div>
                <div style={lblSug}>Melhor fornecedor único</div>
                <div style={valSug}>{s.melhorUnico ? fmtR$(s.custoUnico) : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.melhorUnico?.fornecedor_nome || ''}</div>
              </div>
              <div>
                <div style={lblSug}>Economia</div>
                <div style={{ ...valSug, color: s.economia > 0 ? '#15803D' : 'var(--muted)' }}>{s.economia > 0 ? fmtR$(s.economia) : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>vs comprar tudo num só</div>
              </div>
            </div>
            {s.completos === 0 && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: '#B45309', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '7px 10px' }}>
                ⚠️ Nenhum fornecedor cota 100% da lista — fracionar é necessário. A comparação com "fornecedor único" é apenas referencial.
              </div>
            )}
            {s.semCotacao.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: '#B91C1C' }}>
                🔴 {s.semCotacao.length} item(ns) sem nenhuma cotação: {s.semCotacao.map(i => i.produto_nome).join(', ')}
              </div>
            )}
            <button className="btn" onClick={aprovarFracionado} disabled={savingCot}
              style={{ marginTop: 12, padding: '9px 14px', background: '#15803D' }}>
              <Check size={14} /> Aprovar esta compra fracionada
            </button>
          </div>
        </div>
      )}

      {/* Curva ABC da cotação */}
      {itens.length > 0 && cotacoes.length > 0 && (() => {
        const base = itens.map(i => {
          const ps = cotacoes.map(c => precoDe(c.id, i.id)).filter((v): v is number => v != null)
          const menor = ps.length ? Math.min(...ps) : null
          return { item: i, valor: menor != null ? menor * i.quantidade : 0 }
        }).filter(l => l.valor > 0).sort((a, b) => b.valor - a.valor)
        if (!base.length) return null
        const total = base.reduce((s, l) => s + l.valor, 0)
        let acc = 0
        const linhas = base.map(l => {
          acc += l.valor
          const pctAcc = total ? (acc / total) * 100 : 0
          return { ...l, pct: total ? (l.valor / total) * 100 : 0, pctAcc, classe: pctAcc <= 80 ? 'A' : pctAcc <= 95 ? 'B' : 'C' }
        })
        const corC = (k: string) => k === 'A' ? '#B91C1C' : k === 'B' ? '#B45309' : '#6B7280'
        const bgC = (k: string) => k === 'A' ? '#FEE2E2' : k === 'B' ? '#FEF3C7' : '#F3F4F6'
        const resumo = (['A', 'B', 'C'] as const).map(k => {
          const g = linhas.filter(l => l.classe === k)
          return { k, n: g.length, v: g.reduce((s, l) => s + l.valor, 0) }
        })
        return <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header"><span className="card-tt">📉 Curva ABC da cotação</span></div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {resumo.map(r => (
                <div key={r.k} style={{ flex: '1 1 120px', background: bgC(r.k), border: `1px solid ${corC(r.k)}33`, borderRadius: 9, padding: '8px 11px' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: corC(r.k) }}>Classe {r.k}</div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{fmtR$(r.v)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.n} item(ns) · {total ? Math.round(r.v / total * 100) : 0}% do valor</div>
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead><tr>
                  <th style={{ ...thCot, textAlign: 'left' }}>Produto</th>
                  <th style={thCot}>Valor</th>
                  <th style={thCot}>% do total</th>
                  <th style={thCot}>% acum.</th>
                  <th style={thCot}>Classe</th>
                </tr></thead>
                <tbody>
                  {linhas.map(l => (
                    <tr key={l.item.id}>
                      <td style={{ ...tdCot, textAlign: 'left' }}>{l.item.produto_nome}</td>
                      <td style={tdCot}>{fmtR$(l.valor)}</td>
                      <td style={tdCot}>{l.pct.toFixed(1)}%</td>
                      <td style={{ ...tdCot, color: 'var(--muted)' }}>{l.pctAcc.toFixed(1)}%</td>
                      <td style={{ ...tdCot }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '1px 8px', borderRadius: 10, background: bgC(l.classe), color: corC(l.classe) }}>{l.classe}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--muted)' }}>
              Calculada pelo <strong>menor preço</strong> de cada item × quantidade. <strong>Classe A</strong> concentra ~80% do valor — é onde negociar rende mais.
            </div>
          </div>
        </div>
      })()}

      {/* 6. Aprovação e relatório */}
      {cotacoes.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="card-header"><span className="card-tt">✅ Aprovação e relatório</span></div>
          <div style={{ padding: '12px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1, minWidth: 170 }}>
              {cotAprovadas.length ? `${cotAprovadas.length} fornecedor(es) aprovado(s) · total ${fmtR$(totalAprovado())}` : 'Aprove uma cotação acima para liberar o relatório.'}
            </span>
            <button className="btn" onClick={abrirRelatorioPDF} disabled={!cotAprovadas.length}
              style={{ padding: '8px 12px', fontSize: 12, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', opacity: cotAprovadas.length ? 1 : .5 }}>📄 Relatório (PDF)</button>
            <button className="btn" onClick={abrirModalRelat} disabled={!cotAprovadas.length}
              style={{ padding: '8px 12px', fontSize: 12, background: '#25D366', opacity: cotAprovadas.length ? 1 : .5 }}>📲 Enviar por WhatsApp</button>
            <button className="btn" onClick={fecharPedido} disabled={!cotAprovadas.length || fechando || req.status === 'compra_realizada'}
              title={req.status === 'compra_realizada' ? 'Pedido já foi fechado' : 'Grava os preços aprovados nos itens e fecha a compra'}
              style={{ padding: '8px 12px', fontSize: 12, background: '#6B1212', opacity: (!cotAprovadas.length || req.status === 'compra_realizada') ? .5 : 1 }}>
              {fechando ? 'Fechando…' : req.status === 'compra_realizada' ? '✓ Pedido fechado' : '🛒 Fechar pedido de compra'}
            </button>
          </div>
        </div>
      )}

      {/* Modal de envio */}
      {mRelat && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setMRelat(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 15 }}>📲 Enviar relatório de aprovação</strong>
              <button className="ib" onClick={() => setMRelat(false)} style={{ padding: '4px 9px' }}>✕</button>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Números de WhatsApp (separados por vírgula)</label>
            <textarea value={relatFones} onChange={e => setRelatFones(e.target.value)} rows={2} placeholder="5581999998888, 5581988887777"
              style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: 'var(--muted)', margin: '6px 0 10px' }}>Ficam salvos para os próximos envios.</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>Prévia da mensagem</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, maxHeight: 230, overflowY: 'auto', margin: 0, fontFamily: 'inherit' }}>{montarMsgAprovacao()}</pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button className="btn" onClick={() => setMRelat(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
              <button className="btn" onClick={enviarRelatorioWhats} disabled={enviandoRelat} style={{ background: '#25D366', padding: '9px 16px' }}>
                {enviandoRelat ? 'Enviando…' : 'Enviar agora'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
