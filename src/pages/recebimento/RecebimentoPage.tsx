import { useState, useEffect, useCallback, useMemo } from 'react'
import { PackageCheck, Upload, ScanLine, Check, AlertTriangle, RefreshCw, Trash2, Boxes, ShieldCheck, Camera, ClipboardCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import { fetchAppConfig, saveAppConfig, fetchProfiles, insertNotificacao } from '../../lib/db'
import { enviarWhatsApp, normalizarFoneBR } from '../../lib/notify'

const sb = supabase as any
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const fmt = (n: any) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const LOJAS = ['Amore Paiva', 'Amore CD']
const UNIDADES = ['', 'kg', 'g', 'L', 'ml', 'un', 'cx', 'pct', 'dz']
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%' }

// tipos de ocorrência/desvio e sua gravidade (alta = segura a entrada até aprovação)
const OCORRENCIAS = [
  { v: 'produto_diferente', l: 'Produto diferente do pedido', g: 'alta' },
  { v: 'quantidade_divergente', l: 'Quantidade divergente', g: 'alta' },
  { v: 'valor_divergente', l: 'Valor diferente do pedido/cotação', g: 'media' },
  { v: 'produto_faltando', l: 'Produto faltando', g: 'alta' },
  { v: 'produto_excedente', l: 'Produto excedente', g: 'media' },
  { v: 'embalagem_danificada', l: 'Embalagem danificada', g: 'media' },
  { v: 'produto_avariado', l: 'Produto avariado', g: 'alta' },
  { v: 'validade_curta', l: 'Validade curta', g: 'media' },
  { v: 'produto_vencido', l: 'Produto vencido', g: 'alta' },
  { v: 'temperatura_inadequada', l: 'Temperatura inadequada', g: 'alta' },
  { v: 'peso_divergente', l: 'Peso divergente', g: 'media' },
  { v: 'qualidade_fora_padrao', l: 'Qualidade fora do padrão', g: 'alta' },
  { v: 'recusa_parcial', l: 'Recusa parcial da mercadoria', g: 'alta' },
  { v: 'recusa_total', l: 'Recusa total da mercadoria', g: 'alta' },
]
const gravOf = (tipo: string) => OCORRENCIAS.find(o => o.v === tipo)?.g || 'media'
const STATUS_BADGE: Record<string, { l: string; c: string; b: string }> = {
  confirmado: { l: '✓ Confirmado', c: '#166534', b: '#DCFCE7' },
  pendente_aprovacao: { l: '⏳ Pendente de aprovação', c: '#9A3412', b: '#FFEDD5' },
  aprovado: { l: '✅ Aprovado', c: '#166534', b: '#DCFCE7' },
}

function precoUnit(it: any) {
  const q = Number(it.quantidade), u = (it.unidade || '').toLowerCase(), cont = Number(it.conteudo) || 1
  if (!q || !u) return null
  const f: any = { g: 0.001, ml: 0.001, kg: 1, l: 1, un: 1, dz: 12, cx: cont, pct: cont }
  const qb = q * (f[u] ?? 1); if (!qb) return null
  const base = ['kg', 'g'].includes(u) ? 'kg' : ['l', 'ml'].includes(u) ? 'L' : 'un'
  return { v: Number(it.valor_total || 0) / qb, base }
}
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const STOP = new Set(['caixa', 'cx', 'pacote', 'pct', 'pote', 'saco', 'fardo', 'unidade', 'unidades', 'und', 'kg', 'quilograma', 'grama', 'litro', 'litros', 'lata', 'garrafa', 'balde', 'com', 'sem', 'para', 'tipo', 'premium', 'gourmet', 'sache', 'sacher'])
const tok = (s: string) => norm(s).split(' ').filter(t => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t))
function matchProduto(nome: string, list: any[]) {
  const tokens = tok(nome); if (!tokens.length) return null
  let best: any = null, bestScore = 0
  for (const p of list) {
    const pn = ' ' + norm(p.nome) + ' '; let score = 0
    for (const t of tokens) if (pn.includes(' ' + t) || pn.includes(t + ' ')) score++
    if (score > bestScore) { bestScore = score; best = p }
  }
  return bestScore >= 2 ? best : null
}
const qtdEstoque = (it: any) => (Number(it.quantidade) || 0) * (Number(it.conteudo) || 1)
// casa o nome de um item recebido (NF) com o nome de um item do pedido (>=2 tokens, ou 1 token único)
function casaNome(a: string, b: string) {
  const ta = tok(a); if (!ta.length) return false
  const tb = ' ' + norm(b) + ' '
  let score = 0; for (const t of ta) if (tb.includes(' ' + t) || tb.includes(t + ' ')) score++
  return score >= 2 || (ta.length === 1 && score === 1)
}

// Quem recebe o aviso de recebimento (gestor/administrador/comprador cadastrados) — app_config 'recebimento_destinatarios'
interface DestRec { nome: string; fone: string; papel: 'gestor' | 'administrador' | 'comprador' | 'outro' }
interface CfgAviso { ativo: boolean; pessoas: DestRec[] }
const sleepMs = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function RecebimentoPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const podeAprovar = ['super_admin', 'manager', 'admin', 'gestor', 'diretor'].includes((user?.role || '').toLowerCase())
  const podeExcluir = (user?.role || '').toLowerCase() === 'super_admin'
  const [loja, setLoja] = useState('Amore Paiva')
  const [file, setFile] = useState<File | null>(null)
  const [anexo, setAnexo] = useState<{ url: string; nome: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [cab, setCab] = useState<any | null>(null)
  // Resultado das travas/2ª IA do OCR (soma, CNPJ, chave, divergências entre leitores)
  const [ocrInfo, setOcrInfo] = useState<{ alertas: string[]; validacao?: any; erros?: any } | null>(null)
  const [itens, setItens] = useState<any[]>([])
  const [recs, setRecs] = useState<any[]>([])
  const [prodEstoque, setProdEstoque] = useState<any[]>([])
  const [estoqueRows, setEstoqueRows] = useState<any[]>([])
  const [darEntrada, setDarEntrada] = useState(true)
  const [colabs, setColabs] = useState<any[]>([])
  // conferência humana
  // Avisos (WhatsApp) a gestor/administrador/comprador + observação ao comprador quando o recebimento vem incompleto
  const [cfgAviso, setCfgAviso] = useState<CfgAviso>({ ativo: false, pessoas: [] })
  const [cfgAberto, setCfgAberto] = useState(false)
  // Campo "Quem recebe as informações e a nota" deste recebimento: cadastrados (desmarcáveis) + pessoas extras
  const [destOff, setDestOff] = useState<string[]>([])            // fones (normalizados) desmarcados nesta nota
  const [destExtras, setDestExtras] = useState<DestRec[]>([])
  const [exNome, setExNome] = useState('')
  const [exFone, setExFone] = useState('')
  const [exPapel, setExPapel] = useState<DestRec['papel']>('gestor')
  const [exSalvar, setExSalvar] = useState(false)
  const [obsCompradorTxt, setObsCompradorTxt] = useState<string | null>(null)   // null = texto automático
  useEffect(() => { fetchAppConfig<CfgAviso>('recebimento_destinatarios').then(c => { if (c) setCfgAviso({ ativo: !!c.ativo, pessoas: c.pessoas || [] }) }) }, [])
  const salvarCfgAviso = async (c: CfgAviso) => { setCfgAviso(c); await saveAppConfig('recebimento_destinatarios', c) }
  const [conferente, setConferente] = useState('')
  const [assinatura, setAssinatura] = useState('')
  const [obsGeral, setObsGeral] = useState('')
  // desvios por item: { [idx]: { tipo, descricao, foto_url, qtd_esperada, qtd_recebida, uploading } }
  const [desvios, setDesvios] = useState<Record<number, any>>({})
  const [desvioOpen, setDesvioOpen] = useState<Set<number>>(new Set())
  // vínculo opcional com um pedido de compra → baixa relacional (qtd_recebida) p/ o ciclo da requisição
  const [pedidosAbertos, setPedidosAbertos] = useState<any[]>([])
  const [pedidoSel, setPedidoSel] = useState('')
  const [pedidoItens, setPedidoItens] = useState<any[]>([])  // conferência de vínculo (pedido × nota)
  const loadPedidosAbertos = useCallback(async (lj: string) => {
    const { data } = await sb.from('pedidos_compra').select('id,numero,fornecedor,total,requisicao_id,created_at,criado_por').eq('loja', lj).eq('baixa_feita', false).order('created_at', { ascending: false }).limit(80)
    setPedidosAbertos(data || [])
  }, [])
  useEffect(() => { loadPedidosAbertos(loja); setPedidoSel(''); setPedidoItens([]) }, [loja, loadPedidosAbertos])
  // Ao escolher um pedido: carrega os itens (Pedido/Já recebido/Falta) e pré-preenche "receber agora"
  // com o recebido da nota que casa por nome (limitado ao que falta). Suporta RECEBIMENTO PARCIAL.
  useEffect(() => {
    if (!pedidoSel) { setPedidoItens([]); return }
    let vivo = true
    ;(async () => {
      const { data } = await sb.from('pedido_compra_itens').select('id,produto_nome,unidade,qtd_pedida,qtd_recebida').eq('pedido_id', pedidoSel).order('produto_nome')
      if (!vivo) return
      const usados = new Set<number>()
      const pit = (data || []).map((pi: any) => {
        const falta = Math.max(0, (Number(pi.qtd_pedida) || 0) - (Number(pi.qtd_recebida) || 0))
        const idx = itens.findIndex((it, k) => !usados.has(k) && Number(it.recebido) > 0 && casaNome(it.produto, pi.produto_nome))
        let sugerido = 0
        if (idx >= 0) { usados.add(idx); const rec = Number(itens[idx].recebido) || 0; sugerido = falta > 0 ? Math.min(rec, falta) : rec }
        return { ...pi, falta, receber: sugerido > 0 ? String(sugerido) : '' }
      })
      setPedidoItens(pit)
    })()
    return () => { vivo = false }
  }, [pedidoSel])  // eslint-disable-line react-hooks/exhaustive-deps
  const setReceber = (id: string, v: string) => setPedidoItens(a => a.map(p => p.id === id ? { ...p, receber: v } : p))

  const loadRecs = useCallback(async () => { const { data } = await sb.from('recebimentos').select('*').order('created_at', { ascending: false }).limit(20); setRecs(data || []) }, [])
  useEffect(() => { loadRecs() }, [loadRecs])
  useEffect(() => { sb.from('colaboradores').select('nome,func,loja').then(({ data }: any) => setColabs(data || [])) }, [])
  useEffect(() => { if (user?.name && !conferente) setConferente(user.name) }, [user])

  const fetchProdutos = async (lj: string) => {
    const { data } = await sb.from('estoque_produtos').select('id,nome,gramatura,categoria,preco_unitario').eq('loja', lj).eq('ativo', true).order('nome')
    return data || []
  }
  useEffect(() => { fetchProdutos(loja).then(setProdEstoque) }, [loja])

  const enviarELer = async () => {
    if (!file) { toast('Selecione a foto/PDF da nota.', 'error'); return }
    setBusy('upload'); setOcrInfo(null); setDestOff([]); setDestExtras([]); setCab(null); setItens([]); setEstoqueRows([]); setDesvios({}); setDesvioOpen(new Set()); setObsGeral('')
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const path = `recebimentos/${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await sb.storage.from('anexos').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) { toast('Erro ao enviar o arquivo: ' + upErr.message, 'error'); setBusy(''); return }
      const url = `${SB_URL}/storage/v1/object/public/anexos/${path}`
      setAnexo({ url, nome: file.name })
      setBusy('ocr')
      const resp = await fetch('/api/ocr-nota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_url: url, mime: file.type }) })
      const d = await resp.json()
      if (!resp.ok) { toast(d.error || 'Erro na leitura por IA.', 'error'); setBusy(''); return }
      const its = (d.itens || []).map((x: any) => ({ ...x, conteudo: x.conteudo || 1, recebido: x.quantidade ?? '' }))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { _conferir: _cabConf, ...cabLimpo } = (d.cabecalho || {}) as any
      setCab({ fornecedor: '', cnpj: '', numero_nota: '', serie: '', data_emissao: '', valor_total: '', forma_pagamento: '', ...cabLimpo })
      setOcrInfo({ alertas: d.alertas || [], validacao: d.validacao, erros: d.leitores_erro })
      setItens(its)
      // tenta pré-vincular a um pedido aberto pelo fornecedor lido na nota (se houver 1 candidato claro)
      try {
        const fornOCR = norm((d.cabecalho || {}).fornecedor || '')
        if (fornOCR && !pedidoSel) {
          const cand = pedidosAbertos.filter(p => { const pf = norm(p.fornecedor || ''); return pf && (pf.includes(fornOCR) || fornOCR.includes(pf)) })
          if (cand.length === 1) setPedidoSel(cand[0].id)
        }
      } catch { /* ignore */ }
      const prods = await fetchProdutos(loja); setProdEstoque(prods)
      setEstoqueRows(its.map((it: any) => {
        const m = matchProduto(it.produto, prods)
        const q = qtdEstoque(it)
        return { on: true, produto_id: m ? m.id : '', novo: !m, nome: m ? m.nome : it.produto, categoria: it.categoria || '', quantidade: q || '', unidade: m?.gramatura || it.unidade || 'un', preco: q > 0 ? Number(it.valor_total || 0) / q : 0 }
      }))
      toast(`IA leu ${d.total || 0} item(ns). Confira, registre desvios e assine. 🔍`)
    } catch { toast('Falha ao processar a nota.', 'error') }
    setBusy('')
  }

  const upItem = (i: number, k: string, v: any) => setItens(a => a.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
  // Conferência: qtd RECEBIDA (o que efetivamente entrou) → alimenta a entrada no estoque
  const upRecebido = (i: number, v: any) => {
    setItens(a => a.map((x, idx) => idx === i ? { ...x, recebido: v } : x))
    const cont = Number(itens[i]?.conteudo) || 1
    const q = (v === '' || v == null) ? '' : Number(v) * cont
    setEstoqueRows(a => a.map((r, idx) => idx === i ? { ...r, quantidade: q } : r))
  }
  const delItem = (i: number) => { setItens(a => a.filter((_, idx) => idx !== i)); setEstoqueRows(a => a.filter((_, idx) => idx !== i)) }
  // faturado × recebido
  const difItem = (it: any) => {
    const f = Number(it.quantidade), r = Number(it.recebido)
    if (it.recebido === '' || it.recebido == null || isNaN(r)) return { has: false }
    const d = Math.round((r - f) * 1000) / 1000
    return { has: true, ok: Math.abs(d) < 0.001, delta: d }
  }
  const upEst = (i: number, patch: any) => setEstoqueRows(a => a.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const toggleDesvio = (i: number) => setDesvioOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); if (!n.has(i)) return n; setDesvios(d => d[i] ? d : { ...d, [i]: { tipo: '', descricao: '' } }); return n })
  const upDesvio = (i: number, patch: any) => setDesvios(d => ({ ...d, [i]: { ...d[i], ...patch } }))
  const rmDesvio = (i: number) => { setDesvios(d => { const n = { ...d }; delete n[i]; return n }); setDesvioOpen(s => { const n = new Set(s); n.delete(i); return n }) }

  const uploadFotoDesvio = async (i: number, f: File) => {
    upDesvio(i, { uploading: true })
    try {
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `recebimentos/ocorrencias/${crypto.randomUUID()}.${ext}`
      const { error } = await sb.storage.from('anexos').upload(path, f, { upsert: true, contentType: f.type })
      if (error) { toast('Erro ao enviar foto: ' + error.message, 'error'); upDesvio(i, { uploading: false }); return }
      upDesvio(i, { foto_url: `${SB_URL}/storage/v1/object/public/anexos/${path}`, uploading: false })
    } catch { upDesvio(i, { uploading: false }) }
  }

  const somaItens = itens.reduce((s, x) => s + Number(x.valor_total || 0), 0)
  const totalNota = Number(cab?.valor_total || 0)
  const divergencia = cab && totalNota > 0 && Math.abs(somaItens - totalNota) > 0.5
  const itemRetido = (i: number) => desvios[i]?.tipo && gravOf(desvios[i].tipo) === 'alta'
  const nEntradas = darEntrada ? estoqueRows.filter((r, i) => r.on && Number(r.quantidade) > 0 && !itemRetido(i)).length : 0
  const nRetidos = darEntrada ? estoqueRows.filter((r, i) => r.on && Number(r.quantidade) > 0 && itemRetido(i)).length : 0
  const nDesvios = Object.values(desvios).filter((d: any) => d?.tipo).length
  const nDiverg = itens.filter(it => { const d = difItem(it); return d.has && !d.ok }).length

  // ── Totalidade: tudo o que era esperado veio? (pedido × nota × recebido) ──
  const analise = useMemo(() => {
    const pedido = pedidosAbertos.find(p => p.id === pedidoSel) || null
    const faltantes = pedidoSel ? pedidoItens.filter(pi => pi.falta > 0 && (Number(pi.receber) || 0) < pi.falta)
      .map(pi => ({ produto: pi.produto_nome as string, unidade: (pi.unidade || '') as string, esperado: Number(pi.falta), recebido: Number(pi.receber) || 0 })) : []
    const extras = pedidoSel ? itens.filter(it => Number(it.recebido) > 0 && !pedidoItens.some(pi => casaNome(it.produto, pi.produto_nome))).map(it => String(it.produto)) : []
    const curtos = itens.filter(it => { const d = difItem(it); return d.has && !d.ok && (d.delta || 0) < 0 })
      .map(it => ({ produto: String(it.produto), faturado: Number(it.quantidade), recebido: Number(it.recebido) }))
    const somaDifere = !!(cab && totalNota > 0 && Math.abs(somaItens - totalNota) > 0.5)
    const incompleto = !!itens.length && (faltantes.length > 0 || curtos.length > 0 || somaDifere)
    const L: string[] = []
    if (faltantes.length) L.push('Itens do pedido que NÃO vieram (ou vieram a menos):', ...faltantes.map(f => '• ' + f.produto + ' — esperado ' + f.esperado + ' ' + f.unidade + ', veio ' + f.recebido))
    if (curtos.length) L.push('Veio menos do que a nota faturou:', ...curtos.map(c => '• ' + c.produto + ' — faturado ' + c.faturado + ', recebido ' + c.recebido))
    if (somaDifere) L.push('A soma dos itens lidos (' + fmt(somaItens) + ') difere do total da nota (' + fmt(totalNota) + ') — pode haver produto não capturado na leitura. Conferir a nota física.')
    if (extras.length) L.push('Itens na nota que não estão no pedido:', ...extras.map(x => '• ' + x))
    return { pedido, faltantes, extras, curtos, somaDifere, incompleto, obsAuto: L.join('\n') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoSel, pedidoItens, itens, cab, somaItens, totalNota, pedidosAbertos])
  const obsComprador = obsCompradorTxt ?? analise.obsAuto

  // Aviso pós-recebimento: Central de Notificações (sempre que incompleto) + WhatsApp (se ativado) a comprador, gestor e administrador, com o link da nota
  const avisarRecebimento = async (ctx: { recId: string; loja: string; fornecedor: string; nf: string; total: number; conferente: string; nItens: number; nEstoque: number; status: string; pedidoNum: string | null; compradorNome: string | null; incompleto: boolean; obs: string; anexoUrl: string; desmarcados: string[]; extras: DestRec[] }) => {
    const titulo = ctx.incompleto ? 'Recebimento INCOMPLETO — ' + ctx.fornecedor : 'Recebimento confirmado — ' + ctx.fornecedor
    const linhas = [
      ctx.incompleto ? '⚠️ *RECEBIMENTO INCOMPLETO*' : '✅ *RECEBIMENTO CONFIRMADO*',
      '🏪 ' + ctx.loja + ' · 🏭 ' + ctx.fornecedor,
      '🧾 NF ' + ctx.nf + ' · ' + fmt(ctx.total) + (ctx.pedidoNum ? ' · Pedido ' + ctx.pedidoNum : ''),
      '👤 Conferente: ' + ctx.conferente + ' · ' + ctx.nItens + ' itens' + (ctx.nEstoque ? ' · ' + ctx.nEstoque + ' deram entrada no estoque' : ''),
    ]
    if (ctx.status === 'pendente_aprovacao') linhas.push('⏳ Há itens retidos aguardando aprovação do gestor.')
    if (ctx.incompleto && ctx.obs) linhas.push('', '📝 *Observação ao comprador:*', ctx.obs)
    linhas.push('', '📎 Nota fiscal: ' + ctx.anexoUrl, '🔗 Painel: ' + window.location.origin + '/?page=recebimento', '_Recebimento Inteligente · Amore Gestão_')
    const msg = linhas.join('\n')
    // 1) Central de Notificações (aparece no painel mesmo com o WhatsApp desligado)
    if (ctx.incompleto) insertNotificacao({ loja: ctx.loja, canal: 'sistema', tipo: 'compra', modulo: 'recebimento', titulo, mensagem: msg, destinatario_nome: ctx.compradorNome || 'Comprador', referencia_id: ctx.recId, status: 'enviado', created_by: ctx.conferente }).catch(() => {})
    // 2) WhatsApp — só se o Esdras ativou e há pessoas cadastradas
    if (!cfgAviso.ativo) return 0
    const alvo: DestRec[] = [...cfgAviso.pessoas.filter(p => !ctx.desmarcados.includes(normalizarFoneBR(p.fone))), ...ctx.extras]
    if (ctx.compradorNome) {
      try {
        const ps = await fetchProfiles()
        const pr = ps.find(x => (x.name || '').trim().toLowerCase() === ctx.compradorNome!.trim().toLowerCase())
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = normalizarFoneBR(((pr?.permissions_override as any)?.__perfil__?.whatsapp) || '')
        if (f) alvo.push({ nome: ctx.compradorNome, fone: f, papel: 'comprador' })
      } catch { /* sem perfil do comprador — segue com os cadastrados */ }
    }
    const unicos = alvo.filter((d, i) => normalizarFoneBR(d.fone) && alvo.findIndex(x => normalizarFoneBR(x.fone) === normalizarFoneBR(d.fone)) === i)
    let ok = 0
    for (let i = 0; i < unicos.length; i++) {
      if (i > 0) await sleepMs(2500 + Math.random() * 4500)   // intervalo aleatório (anti-bloqueio)
      if (await enviarWhatsApp(unicos[i].fone, msg, undefined, { tipo: 'compra', modulo: 'recebimento', titulo, loja: ctx.loja, destinatario_nome: unicos[i].nome, referencia_id: ctx.recId })) ok++
    }
    return ok
  }

  // Baixa relacional pela CONFERÊNCIA confirmada (pedidoItens.receber): acumula em qtd_recebida
  // (RECEBIMENTO PARCIAL suportado) e recalcula status/baixa do pedido. Retorna nº de itens baixados.
  const baixarNoPedido = async (): Promise<number> => {
    if (!pedidoSel) return 0
    try {
      let baixados = 0
      for (const pi of pedidoItens) {
        const add = Number(pi.receber) || 0
        if (add <= 0) continue
        const nova = (Number(pi.qtd_recebida) || 0) + add
        await sb.from('pedido_compra_itens').update({ qtd_recebida: nova }).eq('id', pi.id)
        baixados++
      }
      if (!baixados) return 0
      const { data: pit2 } = await sb.from('pedido_compra_itens').select('qtd_pedida,qtd_recebida').eq('pedido_id', pedidoSel)
      const totPed = (pit2 || []).reduce((s: number, x: any) => s + (Number(x.qtd_pedida) || 0), 0)
      const totRec = (pit2 || []).reduce((s: number, x: any) => s + (Number(x.qtd_recebida) || 0), 0)
      const done = totPed > 0 && totRec >= totPed
      // recebido_total é MONETÁRIO no restante do sistema (ver RequisoesPage): só gravamos quando concluído (= total do pedido); parcial mexe só no status
      const pedTotal = (pedidosAbertos.find(p => p.id === pedidoSel) || {}).total
      const patch: any = { status: done ? 'recebido' : 'recebido_parcial', baixa_feita: done }
      if (done && pedTotal != null) patch.recebido_total = pedTotal
      await sb.from('pedidos_compra').update(patch).eq('id', pedidoSel)
      // avança o STATUS da requisição de origem (se houver): recebimento parcial/concluído + histórico
      const ped = pedidosAbertos.find(p => p.id === pedidoSel) || {}
      if (ped.requisicao_id) {
        await sb.from('requisicoes').update({ status: done ? 'recebimento_concluido' : 'recebimento_parcial' }).eq('id', ped.requisicao_id)
        try { await sb.from('req_timeline').insert({ requisicao_id: ped.requisicao_id, tipo: 'recebimento', descricao: `Recebimento ${done ? 'concluído' : 'parcial'} do pedido ${ped.numero || ''} (${baixados} item(ns))`, usuario: conferente || user?.name || 'Recebimento', dados: null }) } catch { /* ignore */ }
      }
      return baixados
    } catch { return 0 }
  }

  const confirmar = async () => {
    if (!itens.length) { toast('Nenhum item para confirmar.', 'error'); return }
    if (!anexo?.url) { toast('Anexe o documento fiscal (NF/recibo) — é obrigatório para dar entrada.', 'error'); return }
    if (!conferente.trim()) { toast('Informe o nome do conferente.', 'error'); return }
    if (!assinatura.trim()) { toast('Assine digitando seu nome para confirmar.', 'error'); return }
    setBusy('confirm')
    try {
      const p_estoque = darEntrada
        ? estoqueRows.map((r, i) => ({ r, i })).filter(({ r }) => r.on && Number(r.quantidade) > 0).map(({ r, i }) => ({
            acao: r.novo ? 'novo' : 'existente', produto_id: r.novo ? null : (r.produto_id || null),
            nome: r.nome, categoria: r.categoria, quantidade: r.quantidade, unidade: r.unidade, preco_unitario: r.preco,
            codigo_fornecedor: itens[i]?.codigo_fornecedor || null, codigo_barras: itens[i]?.codigo_barras || null, ncm: itens[i]?.ncm || null,
            marca: itens[i]?.marca || null, reter: itemRetido(i),
          }))
        : []
      const p_ocorrencias = Object.entries(desvios).filter(([, d]: any) => d?.tipo).map(([i, d]: any) => ({
        item_descricao: itens[+i]?.produto || '', tipo: d.tipo, gravidade: gravOf(d.tipo), descricao: d.descricao || '',
        foto_url: d.foto_url || null, quantidade_esperada: d.qtd_esperada || null, quantidade_recebida: d.qtd_recebida || null,
      }))
      const p_conferente = { nome: conferente.trim(), user_id: user?.id || null, assinatura: assinatura.trim() }
      const { data, error } = await sb.rpc('recebimento_confirmar', {
        p_loja: loja, p_header: cab, p_itens: itens, p_anexo_url: anexo?.url || null, p_arquivo: anexo?.nome || null,
        p_estoque, p_conferente, p_ocorrencias,
        p_observacao: [obsGeral, analise.incompleto && obsComprador ? '[RECEBIMENTO INCOMPLETO — obs. ao comprador]\n' + obsComprador : ''].filter(Boolean).join('\n\n') || null,
      })
      if (error || !data?.ok) { toast('Erro ao confirmar: ' + (error?.message || 'tente novamente'), 'error'); setBusy(''); return }
      // Baixa relacional no pedido vinculado (Recebido por item → ciclo da requisição). Complementar: não bloqueia o recebimento.
      let baixaMsg = ''
      if (pedidoSel) { const n = await baixarNoPedido(); if (n > 0) baixaMsg = ` · ${n} item(ns) baixado(s) no pedido` }
      // Aviso a comprador/gestor/administrador (em segundo plano — não segura a tela)
      const ctxAviso = { recId: data.recebimento_id, loja, fornecedor: String(cab?.fornecedor || 'Fornecedor'), nf: String(cab?.numero_nota || 's/n'), total: Number(cab?.valor_total || 0), conferente: conferente.trim(), nItens: itens.length, nEstoque: Number(data.estoque || 0), status: String(data.status || ''), pedidoNum: analise.pedido?.numero || null, compradorNome: analise.pedido?.criado_por || null, incompleto: analise.incompleto, obs: obsComprador, anexoUrl: anexo?.url || '', desmarcados: destOff, extras: destExtras }
      avisarRecebimento(ctxAviso).then(n => { if (cfgAviso.ativo) toast(n ? `Aviso enviado a ${n} pessoa(s) no WhatsApp 📲` : 'Aviso: nenhum destinatário recebeu (confira o cadastro de avisos).', n ? 'success' : 'warning') }).catch(() => {})
      if (analise.incompleto) toast('⚠️ Recebimento INCOMPLETO — observação registrada e notificação gerada ao comprador.', 'warning')
      if (data.status === 'pendente_aprovacao')
        toast(`Recebimento registrado com ${data.retidos} item(ns) retido(s) por divergência — aguardando aprovação. ⏳${baixaMsg}`)
      else
        toast(`Recebimento confirmado! Despesa nº ${data.prestacao} · ABC atualizada${data.estoque ? ` · ${data.estoque} no estoque 📦` : ''}${baixaMsg} ✅`)
      setFile(null); setAnexo(null); setCab(null); setItens([]); setEstoqueRows([]); setDesvios({}); setDesvioOpen(new Set()); setObsGeral(''); setObsCompradorTxt(null); setDestOff([]); setDestExtras([]); setAssinatura(''); setPedidoSel(''); setPedidoItens([]); loadRecs(); loadPedidosAbertos(loja)
    } catch (e: any) { toast('Falha ao confirmar: ' + (e?.message || ''), 'error') }
    setBusy('')
  }

  const aprovar = async (rec: any) => {
    if (!confirm(`Aprovar a entrada dos itens retidos do recebimento ${rec.numero_nota || ''}?`)) return
    const { data, error } = await sb.rpc('recebimento_aprovar', { p_rec: rec.id, p_aprovador: user?.name || 'Gestor' })
    if (error || !data?.ok) { toast('Erro ao aprovar.', 'error'); return }
    toast(`Aprovado! ${data.entradas} item(ns) deram entrada no estoque. ✅`)
    loadRecs()
  }

  const excluir = async (rec: any) => {
    if (!podeExcluir) { toast('Apenas o Super Admin pode excluir um recebimento.', 'error'); return }
    if (!confirm(`Excluir este recebimento?\n\n${rec.fornecedor || 'Fornecedor'} · NF ${rec.numero_nota || 's/n'} · ${rec.loja} · ${fmt(rec.valor_total)}\n\nISTO VAI ESTORNAR do estoque os produtos desta nota e remover a despesa/financeiro gerados. Use quando a nota estiver errada ou não for desta loja. Ação irreversível.`)) return
    setBusy('excluir')
    const { data, error } = await sb.rpc('recebimento_excluir', { p_rec: rec.id, p_usuario: user?.name || 'Sistema' })
    setBusy('')
    if (error || !data?.ok) { toast('Erro ao excluir: ' + (error?.message || data?.error || 'tente novamente'), 'error'); return }
    toast(`Recebimento excluído · ${data.estornos} entrada(s) estornada(s) do estoque${data.produtos_removidos ? ` · ${data.produtos_removidos} produto(s) removido(s)` : ''} 🗑️`)
    loadRecs()
  }

  return (
    <div style={{ padding: '1rem 0' }}>
      {/* passo 1 */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><PackageCheck size={20} style={{ color: '#6B1212' }} /><b style={{ fontSize: 15 }}>Recebimento Inteligente de Mercadorias</b></div>
        <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 12px' }}>Leitura da nota → conferência → registro de desvios → identificação do conferente → aprovação → entrada no estoque. Produtos novos são cadastrados automaticamente como <b>pendentes de validação</b>.</p>
        {podeAprovar && (
          <div style={{ marginBottom: 10 }}>
            <button onClick={() => setCfgAberto(o => !o)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>📲 Avisos do recebimento {cfgAviso.ativo ? '(ligado)' : '(desligado)'} {cfgAberto ? '▲' : '▼'}</button>
            {cfgAberto && <AvisosCfg cfg={cfgAviso} onSave={salvarCfgAviso} toast={toast} />}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={loja} onChange={e => setLoja(e.target.value)} style={{ ...inp, width: 'auto' }}>{LOJAS.map(l => <option key={l}>{l}</option>)}</select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.5rem .9rem', borderRadius: 10, border: '1px dashed #c4b5a8', cursor: 'pointer', fontSize: 13, background: '#faf8f5' }}>
            <Upload size={15} />{file ? file.name.slice(0, 30) : 'Escolher nota (foto ou PDF)'}
            <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} />
          </label>
          <button onClick={enviarELer} disabled={!file || !!busy} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.6rem 1.1rem', borderRadius: 10, border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: (!file || busy) ? .6 : 1 }}>
            <ScanLine size={16} />{busy === 'upload' ? 'Enviando…' : busy === 'ocr' ? 'Lendo com IA…' : 'Enviar e ler com IA'}
          </button>
        </div>
      </div>

      {/* passo 2 — conferência */}
      {cab && <div style={card}>
        {ocrInfo && (ocrInfo.alertas.length > 0 || ocrInfo.validacao) && (
          <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ocrInfo.alertas.map((a, k) => { const ok = a.startsWith('✅'); return (
              <div key={k} style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 8, fontWeight: 600, background: ok ? '#ECFDF5' : '#FEF3C7', color: ok ? '#166534' : '#92400E', border: `1px solid ${ok ? '#A7F3D0' : '#FDE68A'}` }}>{ok ? a : '⚠️ ' + a}</div>
            ) })}
            {ocrInfo.validacao && <div style={{ fontSize: 11, color: '#9ca3af' }}>Leitura por {ocrInfo.validacao.leitores?.gemini ? 'Gemini' : ''}{ocrInfo.validacao.leitores?.gemini && ocrInfo.validacao.leitores?.gpt ? ' + ' : ''}{ocrInfo.validacao.leitores?.gpt ? 'GPT (2ª opinião)' : ''} · CNPJ {ocrInfo.validacao.cnpj_ok ? '✓' : '✗'} · chave {ocrInfo.validacao.chave_ok ? '✓' : '✗'} · soma dos itens {ocrInfo.validacao.soma_ok ? '✓' : '✗'}</div>}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <b style={{ fontSize: 14 }}>🔍 Conferência — cabeçalho da nota</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, background: anexo?.url ? '#ECFDF5' : '#FEF2F2', color: anexo?.url ? '#166534' : '#B91C1C', border: `1px solid ${anexo?.url ? '#A7F3D0' : '#FECACA'}`, borderRadius: 20, padding: '.3rem .8rem', fontWeight: 600 }}>
            📎 {anexo?.url ? <>Documento fiscal anexado — <a href={anexo.url} target="_blank" rel="noreferrer" style={{ color: '#166534', textDecoration: 'underline' }}>{(anexo.nome || 'ver nota').slice(0, 28)}</a></> : 'Documento fiscal obrigatório'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 8, marginTop: 10 }}>
          {[['fornecedor', 'Fornecedor'], ['cnpj', 'CNPJ'], ['numero_nota', 'Nº da nota'], ['serie', 'Série'], ['data_emissao', 'Data emissão'], ['valor_total', 'Valor total'], ['forma_pagamento', 'Forma pgto']].map(([k, l]) => (
            <div key={k}><label style={{ fontSize: 11, color: '#9ca3af' }}>{l}</label><input style={inp} value={cab[k] ?? ''} onChange={e => setCab({ ...cab, [k]: e.target.value })} /></div>
          ))}
        </div>

        <div style={{ marginTop: 12, background: pedidoSel ? '#F0FDF4' : '#faf8f5', border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#6B1212', display: 'flex', alignItems: 'center', gap: 6 }}>🔗 Vincular ao pedido</label>
            <select value={pedidoSel} onChange={e => setPedidoSel(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 280 }}>
              <option value="">— não vincular (só entrada no estoque) —</option>
              {pedidosAbertos.map(p => <option key={p.id} value={p.id}>{(p.numero || 'PED')} · {p.fornecedor || '—'} · {fmt(p.total)}</option>)}
            </select>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Confira o de-para pedido × nota e ajuste o que receber agora (permite recebimento parcial).</span>
          </div>
          {pedidoSel && (pedidoItens.length ? (
            <div style={{ overflowX: 'auto', marginTop: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 640 }}>
                <thead><tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: 6 }}>Produto (pedido)</th><th>Pedido</th><th>Já recebido</th><th>Falta</th><th>Receber agora</th><th>Ficará</th>
                </tr></thead>
                <tbody>
                  {pedidoItens.map(pi => {
                    const add = Number(pi.receber) || 0
                    const ped = Number(pi.qtd_pedida) || 0
                    const ja = Number(pi.qtd_recebida) || 0
                    const ficara = ja + add
                    const excede = ped > 0 && ficara > ped
                    return <tr key={pi.id} style={{ borderTop: '1px solid #eef0f2' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{pi.produto_nome}</td>
                      <td>{ped} {pi.unidade || ''}</td>
                      <td>{ja}</td>
                      <td style={{ fontWeight: 700, color: pi.falta > 0 ? '#B45309' : '#15803D' }}>{pi.falta > 0 ? pi.falta : '✓'}</td>
                      <td style={{ width: 100 }}><input type="number" step="0.01" min={0} value={pi.receber} onChange={e => setReceber(pi.id, e.target.value)} style={{ ...inp, width: 90 }} /></td>
                      <td style={{ fontWeight: 700, color: excede ? '#B45309' : (ficara >= ped && ficara > 0 ? '#15803D' : '#111827') }}>{ficara}{excede ? ' ⚠' : ''}</td>
                    </tr>
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Pré-preenchido pelo que a nota trouxe (casando por nome). Ajuste livremente — deixe 0 no que não chegou. Se “Ficará” &lt; “Pedido”, o item segue <b>parcial</b> e reabre para o próximo recebimento.</div>
            </div>
          ) : <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>Este pedido não tem itens relacionais para conferência.</div>)}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
          <b style={{ fontSize: 14 }}>Itens da nota ({itens.length}) <span style={{ fontWeight: 400, fontSize: 11.5, color: '#9ca3af' }}>· confira Faturado × Recebido</span></b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {nDiverg > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#B91C1C', background: '#FEE2E2', padding: '.3rem .7rem', borderRadius: 20, fontWeight: 600 }}><AlertTriangle size={14} />{nDiverg} item(ns) com quantidade divergente</span>}
            {divergencia && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: '#B45309', background: '#FEF3C7', padding: '.3rem .7rem', borderRadius: 20, fontWeight: 600 }}><AlertTriangle size={14} />Soma dos itens ({fmt(somaItens)}) ≠ total da nota ({fmt(totalNota)})</span>}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 860 }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 6 }}>Produto</th><th>Faturado</th><th>Recebido</th><th>Dif.</th><th>Unid.</th><th>Cont.</th><th>Marca</th><th>Valor</th><th>Preço unit.</th><th>Conf.</th><th>Desvio</th><th></th>
            </tr></thead>
            <tbody>
              {itens.map((it, i) => { const pu = precoUnit(it); const cf = it.confianca; const temD = desvios[i]?.tipo; const retido = itemRetido(i); return (
                <>
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6', background: retido ? '#FEF2F2' : undefined }}>
                  <td style={{ padding: 4, minWidth: 170 }}><input style={inp} value={it.produto || ''} onChange={e => upItem(i, 'produto', e.target.value)} />{(it._conferir || it._corrigido) && <div style={{ fontSize: 10.5, color: '#B45309', marginTop: 2 }}>⚠️ {it._corrigido ? `corrigido: ${it._corrigido}` : (it._conferir as any[]).map((c: any) => `${c.campo}: outra IA leu ${c.outra_ia}`).join(' · ')}</div>}</td>
                  <td style={{ width: 60 }}><input style={inp} type="number" step="0.01" value={it.quantidade ?? ''} onChange={e => upItem(i, 'quantidade', e.target.value)} /></td>
                  <td style={{ width: 62 }}><input style={{ ...inp, ...(difItem(it).has && !difItem(it).ok ? { borderColor: '#F59E0B', background: '#FFFBEB' } : {}) }} type="number" step="0.01" value={it.recebido ?? ''} onChange={e => upRecebido(i, e.target.value)} title="Quantidade efetivamente recebida" /></td>
                  <td style={{ width: 60, textAlign: 'center', fontWeight: 700 }}>{(() => { const d = difItem(it); if (!d.has) return <span style={{ color: '#9ca3af' }}>—</span>; if (d.ok) return <span style={{ color: '#1D9E75' }}>✓</span>; return <span style={{ color: d.delta! < 0 ? '#DC2626' : '#D97706', fontSize: 11 }}>⚠ {d.delta! > 0 ? '+' : ''}{d.delta}</span> })()}</td>
                  <td style={{ width: 66 }}><select style={inp} value={it.unidade || ''} onChange={e => upItem(i, 'unidade', e.target.value)}>{UNIDADES.map(u => <option key={u} value={u}>{u || '—'}</option>)}</select></td>
                  <td style={{ width: 56 }}><input style={inp} type="number" value={it.conteudo ?? 1} onChange={e => upItem(i, 'conteudo', e.target.value)} disabled={!['cx', 'pct'].includes((it.unidade || '').toLowerCase())} /></td>
                  <td style={{ width: 90 }}><input style={inp} value={it.marca || ''} onChange={e => upItem(i, 'marca', e.target.value)} /></td>
                  <td style={{ width: 80 }}><input style={inp} type="number" step="0.01" value={it.valor_total ?? ''} onChange={e => upItem(i, 'valor_total', e.target.value)} /></td>
                  <td style={{ width: 90, fontWeight: 700, color: pu ? '#1D9E75' : '#9ca3af' }}>{pu ? 'R$ ' + pu.v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '/' + pu.base : '—'}</td>
                  <td style={{ width: 46 }}>{cf != null ? <span style={{ fontSize: 11, fontWeight: 700, color: cf >= 85 ? '#1D9E75' : cf >= 60 ? '#D97706' : '#DC2626' }}>{cf}%</span> : ''}</td>
                  <td style={{ width: 70 }}><button onClick={() => toggleDesvio(i)} title="Registrar desvio/avaria" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, padding: '.3rem .5rem', borderRadius: 7, border: '1px solid ' + (temD ? '#DC2626' : '#e5e7eb'), background: temD ? '#FEE2E2' : '#fff', color: temD ? '#DC2626' : '#6b7280', cursor: 'pointer', fontWeight: 600 }}><AlertTriangle size={12} />{temD ? (retido ? 'Retido' : 'Desvio') : 'Ok'}</button></td>
                  <td><button onClick={() => delItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}><Trash2 size={13} /></button></td>
                </tr>
                {desvioOpen.has(i) && <tr key={i + '-d'} style={{ background: '#FFFBEB' }}>
                  <td colSpan={12} style={{ padding: '8px 6px' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div style={{ minWidth: 220 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Tipo de ocorrência</label>
                        <select style={inp} value={desvios[i]?.tipo || ''} onChange={e => upDesvio(i, { tipo: e.target.value })}>
                          <option value="">— sem desvio —</option>
                          {OCORRENCIAS.map(o => <option key={o.v} value={o.v}>{o.l}{o.g === 'alta' ? ' 🔴' : ''}</option>)}
                        </select></div>
                      <div style={{ flex: 1, minWidth: 220 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Descrição do problema</label>
                        <input style={inp} value={desvios[i]?.descricao || ''} onChange={e => upDesvio(i, { descricao: e.target.value })} placeholder="Detalhe o ocorrido" /></div>
                      <div style={{ width: 100 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd esperada</label>
                        <input style={inp} type="number" value={desvios[i]?.qtd_esperada ?? ''} onChange={e => upDesvio(i, { qtd_esperada: e.target.value })} /></div>
                      <div style={{ width: 100 }}><label style={{ fontSize: 11, color: '#9ca3af' }}>Qtd recebida</label>
                        <input style={inp} type="number" value={desvios[i]?.qtd_recebida ?? ''} onChange={e => upDesvio(i, { qtd_recebida: e.target.value })} /></div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '.5rem .7rem', border: '1px dashed #c4b5a8', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>
                        <Camera size={14} />{desvios[i]?.uploading ? 'Enviando…' : desvios[i]?.foto_url ? 'Foto ✓' : 'Anexar foto'}
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadFotoDesvio(i, f) }} />
                      </label>
                      <button onClick={() => rmDesvio(i)} style={{ fontSize: 12, background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>Remover</button>
                    </div>
                    {desvios[i]?.tipo && gravOf(desvios[i].tipo) === 'alta' && <div style={{ fontSize: 11.5, color: '#B91C1C', marginTop: 6, fontWeight: 600 }}>🔴 Divergência relevante — este item NÃO entra no estoque agora; ficará retido para aprovação da gestão.</div>}
                  </td>
                </tr>}
                </>
              ) })}
            </tbody>
          </table>
        </div>

        {/* entrada no estoque */}
        <div style={{ marginTop: 18, borderTop: '1px dashed #e5e7eb', paddingTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={darEntrada} onChange={e => setDarEntrada(e.target.checked)} />
            <Boxes size={16} style={{ color: '#6B1212' }} /><b style={{ fontSize: 14 }}>Dar entrada no estoque</b>
            {darEntrada && <span style={{ fontSize: 12, color: '#9ca3af' }}>— {nEntradas} entram agora{nRetidos > 0 ? `, ${nRetidos} retido(s) p/ aprovação` : ''}</span>}
          </label>
          {darEntrada && <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 720 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: 6, width: 34 }}>✓</th><th>Item da nota</th><th>Produto no estoque</th><th>Qtd entrada</th><th>Unid.</th>
              </tr></thead>
              <tbody>
                {itens.map((it, i) => { const r = estoqueRows[i]; if (!r) return null; const retido = itemRetido(i); return (
                  <tr key={i} style={{ borderTop: '1px solid #f3f4f6', opacity: r.on ? 1 : .45 }}>
                    <td style={{ padding: 4 }}><input type="checkbox" checked={r.on} onChange={e => upEst(i, { on: e.target.checked })} /></td>
                    <td style={{ fontSize: 12, color: '#6b7280', maxWidth: 200 }}>{it.produto}{retido && <span style={{ color: '#DC2626', fontWeight: 700 }}> · retido</span>}</td>
                    <td style={{ minWidth: 240 }}>
                      <select style={inp} value={r.novo ? '__novo__' : (r.produto_id || '__novo__')} onChange={e => {
                        const v = e.target.value
                        if (v === '__novo__') upEst(i, { novo: true, produto_id: '', nome: it.produto, unidade: it.unidade || 'un' })
                        else { const p = prodEstoque.find(x => x.id === v); upEst(i, { novo: false, produto_id: v, nome: p?.nome || it.produto, unidade: p?.gramatura || r.unidade }) }
                      }}>
                        <option value="__novo__">➕ Cadastrar novo (pendente validação): {(it.produto || '').slice(0, 34)}</option>
                        {prodEstoque.map(p => <option key={p.id} value={p.id}>{p.nome}{p.gramatura ? ` (${p.gramatura})` : ''}</option>)}
                      </select>
                    </td>
                    <td style={{ width: 90 }}><input style={inp} type="number" step="0.01" value={r.quantidade ?? ''} onChange={e => upEst(i, { quantidade: e.target.value })} /></td>
                    <td style={{ width: 90 }}><input style={inp} value={r.unidade || ''} onChange={e => upEst(i, { unidade: e.target.value })} /></td>
                  </tr>) })}
              </tbody>
            </table>
            <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '8px 0 0' }}>Qtd de entrada = qtd × conteúdo. Produtos novos entram como <b>pendente de validação</b> (código, código de barras, NCM, marca e fornecedor são salvos para conferência posterior).</p>
          </div>}
        </div>

        {/* totalidade: tudo veio? → observação ao comprador */}
        {itens.length > 0 && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, border: `1px solid ${analise.incompleto ? '#FDE68A' : '#A7F3D0'}`, background: analise.incompleto ? '#FFFBEB' : '#ECFDF5' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: analise.incompleto ? '#92400E' : '#166534' }}>
              {analise.incompleto ? '⚠️ Recebimento INCOMPLETO — o comprador será notificado ao confirmar' : '✅ Recebimento completo — nada faltando' + (pedidoSel ? ' em relação ao pedido' : '')}
            </div>
            {!pedidoSel && <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3 }}>Dica: vincule a nota a um pedido de compra (🔗 acima) para conferir item a item o que foi pedido × o que veio.</div>}
            {analise.incompleto && (
              <>
                <label style={{ fontSize: 11.5, color: '#92400E', display: 'block', marginTop: 8 }}>📝 Observação ao comprador (editável)</label>
                <textarea style={{ ...inp, minHeight: 90, marginTop: 4, resize: 'vertical' }} value={obsComprador} onChange={e => setObsCompradorTxt(e.target.value)} />
              </>
            )}
          </div>
        )}

        {/* quem recebe as informações e a nota após o recebimento */}
        {itens.length > 0 && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fafafa' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6B1212' }}>📨 Quem recebe as informações e a nota após o recebimento</div>
            <div style={{ fontSize: 11.5, color: '#6b7280', margin: '3px 0 8px' }}>
              Ao confirmar, estas pessoas recebem o resumo do recebimento + o link da nota fiscal{analise.pedido?.criado_por ? ` (o comprador ${analise.pedido.criado_por} do pedido recebe junto)` : ''}.
              {!cfgAviso.ativo && <b style={{ color: '#B45309' }}> O envio por WhatsApp está desligado — {podeAprovar ? 'ative em "Avisos do recebimento" no topo.' : 'peça a um gestor para ativar.'} A notificação no painel funciona.</b>}
            </div>
            {cfgAviso.pessoas.length === 0 && destExtras.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Nenhuma pessoa cadastrada ainda. Adicione abaixo.</div>}
            {cfgAviso.pessoas.map((d, i) => { const f = normalizarFoneBR(d.fone); const off = destOff.includes(f); return (
              <label key={'c' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '2px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!off} onChange={e => setDestOff(a => e.target.checked ? a.filter(x => x !== f) : [...a, f])} />
                {d.nome} · {d.fone.replace(/^55/, '')} · <i style={{ color: '#6b7280' }}>{d.papel}</i>
              </label>
            ) })}
            {destExtras.map((d, i) => (
              <div key={'e' + i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '2px 0' }}>
                <span style={{ flex: 1 }}>➕ {d.nome} · {d.fone.replace(/^55/, '')} · <i style={{ color: '#6b7280' }}>{d.papel} (só nesta nota)</i></span>
                <button onClick={() => setDestExtras(a => a.filter((_, k) => k !== i))} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>remover</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
              <input style={{ ...inp, flex: 1, minWidth: 110 }} placeholder="Nome" value={exNome} onChange={e => setExNome(e.target.value)} />
              <input style={{ ...inp, flex: 1, minWidth: 130 }} placeholder="WhatsApp (DDD+número)" value={exFone} onChange={e => setExFone(e.target.value)} />
              <select style={{ ...inp, width: 'auto' }} value={exPapel} onChange={e => setExPapel(e.target.value as DestRec['papel'])}>
                <option value="gestor">Gestor</option><option value="administrador">Administrador</option><option value="comprador">Comprador</option><option value="outro">Outro</option>
              </select>
              {podeAprovar && <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={exSalvar} onChange={e => setExSalvar(e.target.checked)} />salvar no cadastro</label>}
              <button onClick={() => {
                const f = normalizarFoneBR(exFone)
                if (!exNome.trim() || !f) { toast('Informe nome e WhatsApp.', 'error'); return }
                if (cfgAviso.pessoas.some(x => normalizarFoneBR(x.fone) === f) || destExtras.some(x => normalizarFoneBR(x.fone) === f)) { toast('Esse WhatsApp já está na lista.', 'info'); return }
                const nova: DestRec = { nome: exNome.trim(), fone: f, papel: exPapel }
                if (podeAprovar && exSalvar) salvarCfgAviso({ ...cfgAviso, pessoas: [...cfgAviso.pessoas, nova] })
                else setDestExtras(a => [...a, nova])
                setExNome(''); setExFone('')
              }} style={{ border: '1px solid #6B1212', background: '#6B1212', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Adicionar</button>
            </div>
          </div>
        )}

        {/* observação geral + conferente */}
        <div style={{ marginTop: 18, borderTop: '1px dashed #e5e7eb', paddingTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px,1fr))', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardCheck size={15} />Observação geral do recebimento</label>
            <textarea style={{ ...inp, minHeight: 68, marginTop: 6, resize: 'vertical' }} value={obsGeral} onChange={e => setObsGeral(e.target.value)} placeholder="Observações gerais, condições de entrega, etc." />
          </div>
          <div style={{ background: '#FAFAF9', border: '1px solid #e7e5e4', borderRadius: 10, padding: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: '#6B1212' }}><ShieldCheck size={15} />Identificação do conferente</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Conferente *</label>
                <input style={inp} list="colabs-list" value={conferente} onChange={e => setConferente(e.target.value)} placeholder="Quem recebeu" />
                <datalist id="colabs-list">{colabs.map((c, k) => <option key={k} value={c.nome} />)}</datalist>
              </div>
              <div><label style={{ fontSize: 11, color: '#9ca3af' }}>Assinatura (digite o nome) *</label>
                <input style={inp} value={assinatura} onChange={e => setAssinatura(e.target.value)} placeholder="Confirmação" /></div>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Usuário: <b>{user?.name || '—'}</b> · Unidade: <b>{loja}</b> · {new Date().toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>⚠️ Revise os itens. {nDiverg > 0 ? `${nDiverg} com qtd divergente. ` : ''}{nDesvios > 0 ? `${nDesvios} desvio(s) registrado(s). ` : ''}{nRetidos > 0 ? `${nRetidos} item(ns) irão para aprovação. ` : ''}Total vai 1x pra despesas; alimenta ABC{darEntrada ? ' e estoque' : ''}. Documento fiscal fica vinculado à entrada.</span>
          <button onClick={confirmar} disabled={!!busy || !conferente.trim() || !assinatura.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.7rem 1.6rem', borderRadius: 10, border: 'none', background: (!conferente.trim() || !assinatura.trim()) ? '#9ca3af' : '#1D9E75', color: '#fff', cursor: (!conferente.trim() || !assinatura.trim()) ? 'not-allowed' : 'pointer', fontWeight: 600 }}><Check size={16} />{busy === 'confirm' ? 'Confirmando…' : nRetidos > 0 ? 'Registrar e enviar p/ aprovação' : 'Aprovar recebimento'}</button>
        </div>
      </div>}

      {/* recebimentos recentes */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 14 }}>Recebimentos recentes ({recs.length})</b><button onClick={loadRecs} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><RefreshCw size={15} /></button></div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recs.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum recebimento ainda.</div> :
            recs.map(r => { const st = STATUS_BADGE[r.status] || STATUS_BADGE.confirmado; return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8, flexWrap: 'wrap' }}>
                <PackageCheck size={15} style={{ color: '#1D9E75' }} />
                <div style={{ flex: 1, minWidth: 180 }}><b>{r.fornecedor || 'Fornecedor'}</b> <span style={{ color: '#9ca3af' }}>· NF {r.numero_nota || 's/n'} · {r.loja} · {r.qtd_itens} itens{r.qtd_ocorrencias > 0 ? ` · ${r.qtd_ocorrencias} desvio(s)` : ''}{r.conferente_nome ? ` · por ${r.conferente_nome}` : ''}</span></div>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.b, padding: '.2rem .6rem', borderRadius: 20 }}>{st.l}</span>
                <span style={{ fontWeight: 600 }}>{fmt(r.valor_total)}</span>
                {r.anexo_url && <a href={r.anexo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6B1212' }}>nota</a>}
                {r.status === 'pendente_aprovacao' && podeAprovar && <button onClick={() => aprovar(r)} style={{ fontSize: 12, fontWeight: 700, padding: '.3rem .7rem', borderRadius: 7, border: 'none', background: '#1D9E75', color: '#fff', cursor: 'pointer' }}>Aprovar entrada</button>}
                {podeExcluir && <button onClick={() => excluir(r)} disabled={busy === 'excluir'} title="Excluir nota errada / de outra loja (estorna o estoque) — Super Admin" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, padding: '.3rem .6rem', borderRadius: 7, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer' }}><Trash2 size={12} /> Excluir</button>}
                <span style={{ color: '#9ca3af', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString('pt-BR')}</span>
              </div>) })}
        </div>
      </div>
    </div>
  )
}


// ── Cadastro de quem recebe o aviso de recebimento (gestor, administrador, comprador…) ──
function AvisosCfg({ cfg, onSave, toast }: { cfg: CfgAviso; onSave: (c: CfgAviso) => Promise<void>; toast: (m: string, t?: any) => void }) {
  const [nome, setNome] = useState('')
  const [fone, setFone] = useState('')
  const [papel, setPapel] = useState<DestRec['papel']>('gestor')
  const [teste, setTeste] = useState('')
  const [busy, setBusy] = useState(false)
  const add = () => {
    const f = normalizarFoneBR(fone)
    if (!nome.trim() || !f) { toast('Informe nome e WhatsApp.', 'warning'); return }
    if (cfg.pessoas.some(p => normalizarFoneBR(p.fone) === f)) { toast('Esse WhatsApp já está na lista.', 'info'); return }
    onSave({ ...cfg, pessoas: [...cfg.pessoas, { nome: nome.trim(), fone: f, papel }] }); setNome(''); setFone('')
  }
  const importar = async () => {
    setBusy(true)
    try {
      const ps = await fetchProfiles()
      const novas: DestRec[] = []
      for (const pr of ps) {
        const r = String(pr.role || '')
        if (!['super_admin', 'admin', 'manager'].includes(r)) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const f = normalizarFoneBR(((pr.permissions_override as any)?.__perfil__?.whatsapp) || '')
        if (!pr.name?.trim() || !f || cfg.pessoas.some(p => normalizarFoneBR(p.fone) === f) || novas.some(p => p.fone === f)) continue
        novas.push({ nome: pr.name.trim(), fone: f, papel: r === 'manager' ? 'gestor' : 'administrador' })
      }
      if (!novas.length) { toast('Nenhum gestor/administrador novo com WhatsApp cadastrado.', 'info'); return }
      await onSave({ ...cfg, pessoas: [...cfg.pessoas, ...novas] }); toast(novas.length + ' pessoa(s) importada(s).', 'success')
    } finally { setBusy(false) }
  }
  const enviarTeste = async () => {
    const f = normalizarFoneBR(teste)
    if (!f) { toast('Digite o seu WhatsApp para o teste.', 'warning'); return }
    const ok = await enviarWhatsApp(f, '📦 *TESTE — Aviso de Recebimento*\n\nÉ assim que gestores, administradores e o comprador vão receber a confirmação (com o link da nota fiscal).\n_Recebimento Inteligente · Amore Gestão_')
    toast(ok ? 'Teste enviado. ✅' : 'Falha ao enviar o teste.', ok ? 'success' : 'error')
  }
  const box: React.CSSProperties = { marginTop: 8, padding: 12, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafafa' }
  return (
    <div style={box}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={cfg.ativo} onChange={e => onSave({ ...cfg, ativo: e.target.checked })} />
        Enviar aviso no WhatsApp ao confirmar cada recebimento (com a nota fiscal) {cfg.ativo ? '' : '— desligado: só a Central de Notificações do painel é usada'}
      </label>
      <div style={{ fontSize: 11.5, color: '#6b7280', margin: '6px 0' }}>Recebem: as pessoas abaixo + o comprador do pedido vinculado. Se o recebimento vier incompleto, a observação ao comprador vai junto. Intervalo aleatório entre os envios.</div>
      {cfg.pessoas.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '3px 0' }}>
          <span style={{ flex: 1 }}>{p.nome} · {p.fone.replace(/^55/, '')} · <i>{p.papel}</i></span>
          <button onClick={() => onSave({ ...cfg, pessoas: cfg.pessoas.filter((_, k) => k !== i) })} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer' }}>remover</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <input style={{ ...inp, flex: 1, minWidth: 120 }} placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} />
        <input style={{ ...inp, flex: 1, minWidth: 140 }} placeholder="WhatsApp (DDD+número)" value={fone} onChange={e => setFone(e.target.value)} />
        <select style={{ ...inp, width: 'auto' }} value={papel} onChange={e => setPapel(e.target.value as DestRec['papel'])}>
          <option value="gestor">Gestor</option><option value="administrador">Administrador</option><option value="comprador">Comprador</option><option value="outro">Outro</option>
        </select>
        <button onClick={add} style={{ border: '1px solid #6B1212', background: '#6B1212', color: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>+ Adicionar</button>
        <button onClick={importar} disabled={busy} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>Importar gestores/administradores do painel</button>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <input style={{ ...inp, maxWidth: 220 }} placeholder="Seu WhatsApp p/ teste" value={teste} onChange={e => setTeste(e.target.value)} />
        <button onClick={enviarTeste} style={{ border: '1px solid #e5e7eb', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12.5 }}>Enviar teste só para mim</button>
      </div>
    </div>
  )
}
