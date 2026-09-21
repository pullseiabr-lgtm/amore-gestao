import { useState, useEffect, useCallback, Fragment } from 'react'
import { ClipboardList, RefreshCw, ExternalLink, Loader2, Package, Plus, Trash2, X, Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLoja } from '../../contexts/LojaContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../hooks/useToast'
import { fetchFornecedores, fetchProdutos, insertProduto, insertPedidoCompra, insertPedidoCompraItens, fetchRequisicaoItens, insertReqTimeline, logReqAuditoria, updateRequisicao } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'
import { UNIDADES } from '../../lib/catalogo'
import type { Fornecedor, Produto } from '../../types/database'

const sb = supabase as any
const fmtR$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (s?: string) => { if (!s) return '—'; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s }
const slugify = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36)
const LOJAS_FALLBACK = ['Amore CD', 'Amore Paiva', 'Flow CD']
const DRAFT_KEY = 'pedido_rascunho_v1'

interface PedidoItem { produto: string; qtd: number; un?: string; preco: number; subtotal?: number }
interface Pedido { chave: string; fornecedor: string; loja: string; data?: string; total?: number; pagamento?: string; cliente?: string; recebimento_responsavel?: string; itens?: PedidoItem[]; cancelados?: string[]; recebimento?: { status: string; por?: string; obs?: string; em?: string }; numero_pedido?: string; requisicao_numero?: number; requisicao_id?: string }
interface Linha { produto: string; qtd: string; un: string; preco: string; reqItemId?: string; qtdOrig?: number; produtoOrig?: string }
const linhaVazia = (): Linha => ({ produto: '', qtd: '1', un: 'Unidade(s)', preco: '' })
// vínculo com a requisição de origem (o Pedido nasce da Requisição — cotação NÃO é obrigatória)
interface ReqVinc { id: string; numero: number; loja: string; solicitante: string; centro_custo: string | null; observacoes: string | null; status: string }
const fmtReq = (n: number | string) => 'REQ-' + String(n).padStart(4, '0')

export default function PedidosPage() {
  const { loja } = useLoja()
  const { theme } = useTheme()
  const LOJAS = (theme?.stores && theme.stores.length ? theme.stores : LOJAS_FALLBACK)
  const { user, can } = useAuth()
  const podeCriar = can('requisicoes', 'create')  // só comprador (Esdras) gera/dispara pedido; demais só visualizam
  const { toast } = useToast()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [forns, setForns] = useState<Fornecedor[]>([])
  // form novo pedido
  const [mNovo, setMNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const lojaDef = LOJAS.includes(loja) ? loja : 'Amore Paiva'
  const [fForn, setFForn] = useState('')
  const [fLoja, setFLoja] = useState(lojaDef)
  const [fData, setFData] = useState(() => new Date().toISOString().slice(0, 10))
  const [fPagto, setFPagto] = useState('à vista')
  const [fCliente, setFCliente] = useState('')
  const [fReceb, setFReceb] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia()])
  const [produtosLoja, setProdutosLoja] = useState<Produto[]>([])
  // origem: requisição
  const [fReqNum, setFReqNum] = useState('')
  const [reqVinc, setReqVinc] = useState<ReqVinc | null>(null)
  const [buscandoReq, setBuscandoReq] = useState(false)
  const [fCentroCusto, setFCentroCusto] = useState('')
  const [fObs, setFObs] = useState('')
  // envio do link
  const [fornMap, setFornMap] = useState<Record<string, string>>({})
  const [profMap, setProfMap] = useState<Record<string, string>>({})
  const [recebLoja, setRecebLoja] = useState<Record<string, { nome: string; whatsapp: string }>>({})
  const [mEnviar, setMEnviar] = useState(false)
  const [pedSel, setPedSel] = useState<Pedido | null>(null)
  const [foneForn, setFoneForn] = useState('')
  const [foneReceb, setFoneReceb] = useState('')
  const [enviandoP, setEnviandoP] = useState(false)
  // custo médio de referência (estoque_produtos.preco_unitario) para análise do pedido
  const [custoMap, setCustoMap] = useState<Record<string, number>>({})
  const [analiseAberta, setAnaliseAberta] = useState<string | null>(null)
  const normP = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  useEffect(() => { (async () => {
    const { data } = await sb.from('estoque_produtos').select('loja,nome,preco_unitario')
    const m: Record<string, number> = {}
    ;(data || []).forEach((p: any) => { const v = Number(p.preco_unitario) || 0; if (v <= 0) return; m[p.loja + '|' + normP(p.nome)] = v; m['*|' + normP(p.nome)] = v })
    setCustoMap(m)
  })() }, [])
  const custoMedioDe = (loja: string, nome: string) => { const n = normP(nome); const v = custoMap[loja + '|' + n] ?? custoMap['*|' + n]; return v != null ? Number(v) : null }
  const analisePedido = (p: Pedido) => {
    let refTotal = 0, pedComRef = 0, comRef = 0
    const linhas = (p.itens || []).map(it => {
      const cm = custoMedioDe(p.loja, it.produto)
      const sub = it.subtotal != null ? it.subtotal : (Number(it.qtd) || 0) * (Number(it.preco) || 0)
      if (cm != null) { refTotal += cm * (Number(it.qtd) || 0); pedComRef += sub; comRef++ }
      const diff = (cm != null && cm > 0) ? ((Number(it.preco) - cm) / cm * 100) : null
      return { it, cm, sub, diff }
    })
    const diffTotal = refTotal > 0 ? ((pedComRef - refTotal) / refTotal * 100) : null
    return { linhas, refTotal, pedComRef, comRef, extra: pedComRef - refTotal, diffTotal, custoMedioItem: comRef > 0 ? refTotal / (p.itens || []).filter(it => custoMedioDe(p.loja, it.produto) != null).reduce((s, it) => s + (Number(it.qtd) || 0), 0) : null }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('app_config').select('chave,valor').like('chave', 'pedido_%')
    const list: Pedido[] = (data || []).map((r: any) => ({ chave: r.chave, ...(r.valor || {}) }))
    list.sort((a, b) => (String(b.data || '') + b.chave).localeCompare(String(a.data || '') + a.chave))
    setPedidos(list); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Cancelar/Excluir pedido: remove o pedido da lista (app_config), cancela o pedido relacional
  // e LIBERA a requisição de origem para gerar um novo pedido. Só o comprador (podeCriar).
  const cancelarPedido = async (p: Pedido) => {
    const nome = p.numero_pedido ? `${p.numero_pedido} ` : ''
    if (!confirm(`Cancelar/excluir o pedido ${nome}de ${p.fornecedor || 'fornecedor'} (${fmtR$(p.total || 0)})?\n\nO pedido sai da lista. Se veio de uma requisição, ela é liberada para gerar um novo pedido.`)) return
    const uname = user?.name || 'Painel'
    try {
      await sb.from('app_config').delete().eq('chave', p.chave)
      if (p.requisicao_id) {
        try {
          if (p.numero_pedido) await sb.from('pedidos_compra').update({ status: 'cancelada' }).eq('numero', p.numero_pedido)
          await updateRequisicao(p.requisicao_id, { pedido_numero: null, pedido_status: null, status: 'aprovada' } as any).catch(() => {})
          await insertReqTimeline({ requisicao_id: p.requisicao_id, tipo: 'ajuste', descricao: `Pedido ${p.numero_pedido || ''} cancelado por ${uname} — requisição liberada para novo pedido`, usuario: uname, dados: null }).catch(() => {})
        } catch { /* segue */ }
      }
      toast('Pedido cancelado/excluído.'); load()
    } catch { toast('Falha ao cancelar o pedido.', 'error') }
  }
  useEffect(() => { fetchFornecedores(fLoja).then(f => setForns(f.filter(x => x.ativo !== false))).catch(() => setForns([])) }, [fLoja])
  useEffect(() => { if (!mNovo) return; fetchProdutos(fLoja, { ativo: true }).then(setProdutosLoja).catch(() => setProdutosLoja([])) }, [mNovo, fLoja])
  useEffect(() => { (async () => {
    const [{ data: fs }, { data: ps }] = await Promise.all([
      sb.from('fornecedores').select('nome,loja,whatsapp,telefone'),
      sb.from('profiles').select('name,permissions_override'),
    ])
    const fm: Record<string, string> = {}; (fs || []).forEach((f: any) => { const k = f.loja + '|' + (f.nome || '').toLowerCase(); const fone = (f.whatsapp || f.telefone || f.contato_telefone || '').replace(/\D/g, ''); if (fone && (!fm[k] || fm[k].length < 10)) fm[k] = fone })
    setFornMap(fm)
    const pm: Record<string, string> = {}; (ps || []).forEach((p: any) => { const perf = p.permissions_override?.__perfil__ || {}; if (p.name) pm[p.name.toLowerCase()] = String(perf.whatsapp || perf.telefone || '').replace(/\D/g, '') })
    setProfMap(pm)
    const { data: rl } = await sb.from('app_config').select('valor').eq('chave', 'recebimento_por_loja').maybeSingle()
    if (rl?.valor) setRecebLoja(rl.valor)
  })() }, [])

  // preenche o responsável de recebimento da loja automaticamente ao abrir/trocar a loja no formulário
  useEffect(() => { if (mNovo && !fReceb.trim() && recebLoja[fLoja]?.nome) setFReceb(recebLoja[fLoja].nome) }, [mNovo, fLoja, recebLoja]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = pedidos
    .filter(p => loja === 'Todas as Lojas' || !loja || p.loja === loja)
    .sort((a, b) => String((b as any).em || b.data || '').localeCompare(String((a as any).em || a.data || '')))  // mais novo primeiro
  const link = (p: Pedido) => `${siteOrigin()}/pedido.html?p=${encodeURIComponent(p.chave.replace(/^pedido_/, ''))}`

  const abrirEnviar = (p: Pedido) => {
    setPedSel(p)
    setFoneForn(fornMap[p.loja + '|' + (p.fornecedor || '').toLowerCase()] || '')
    setFoneReceb(profMap[(p.recebimento_responsavel || '').toLowerCase()] || recebLoja[p.loja]?.whatsapp || '')
    setMEnviar(true)
  }
  const enviarPedido = async () => {
    if (!pedSel) return
    const ff = foneForn.replace(/\D/g, ''), fr = foneReceb.replace(/\D/g, '')
    if (ff.length < 10 && fr.length < 10) { toast('Informe ao menos um WhatsApp com DDD.', 'error'); return }
    setEnviandoP(true)
    try {
      const l = link(pedSel)
      // Mensagem PADRÃO do pedido ao fornecedor (mesma para todas as lojas — só muda o nome da loja).
      const nomeLoja = ({ 'Amore CD': 'Amore Costa Dourada', 'Amore Paiva': 'Amore Paiva', 'Flow CD': 'Flow Costa Dourada' } as Record<string, string>)[pedSel.loja] || pedSel.loja
      const itensTxt = (pedSel.itens || []).map(it => `• ${it.qtd} ${it.un || ''} — *${it.produto}*`.replace(/\s{2,}/g, ' ').replace(' — ', ' — ')).join('\n')
      const entrega = fmtD((pedSel as any).janela_entrega || pedSel.data)
      const receb = (pedSel as any).horario_recebimento
      const obs = (pedSel as any).obs
      const msgF = `Olá, ${pedSel.fornecedor}! 👋 Aqui é da *${nomeLoja}*.\n\nSegue nosso *pedido de compra*:\n${itensTxt}${entrega ? `\n📅 Entrega: *${entrega}*` : ''}${receb ? `\n🕗 Recebimento: *${receb}*` : ''}${pedSel.pagamento ? `\n💳 Pagamento: ${pedSel.pagamento}` : ''}${obs ? `\n📝 Obs: ${obs}` : ''}\n\nDetalhes e confirmação no link:\n${l}\n\nObrigado! 💚`
      const msgR = `📦 *Pedido a receber — ${nomeLoja}*\nFornecedor: ${pedSel.fornecedor} · ${fmtR$(pedSel.total || 0)}\n\nConfira na chegada (link com a lista organizada):\n${l}\n— Compras`
      let ok = 0, alvos = 0
      // Fornecedor primeiro; depois um intervalo antes do recebedor — dois envios no mesmo
      // instante fazem a instância do WhatsApp derrubar o 1º (por isso só chegava ao recebedor).
      if (ff.length >= 10) { alvos++; if (await enviarWhatsApp(ff, msgF)) ok++ }
      if (ff.length >= 10 && fr.length >= 10) { await new Promise(r => setTimeout(r, 3500)) }
      if (fr.length >= 10) { alvos++; if (await enviarWhatsApp(fr, msgR)) ok++ }
      toast(`Link enviado para ${ok} de ${alvos} destino(s). ✅`)
      setMEnviar(false)
    } catch { toast('Não foi possível enviar.', 'error') }
    finally { setEnviandoP(false) }
  }

  const setLinha = (i: number, patch: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => j === i ? { ...l, ...patch } : l))
  const totalForm = linhas.reduce((s, l) => s + (Number(l.qtd) || 0) * (Number(l.preco) || 0), 0)
  const resetForm = () => { setFForn(''); setFCliente(''); setFReceb(''); setFPagto('à vista'); setFData(new Date().toISOString().slice(0, 10)); setLinhas([linhaVazia()]); setFReqNum(''); setReqVinc(null); setFCentroCusto(''); setFObs(''); try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }

  // Origem = Requisição: digita/seleciona REQ-#### → carrega loja, solicitante, centro de custo, obs e TODOS os itens.
  // O usuário não redigita produtos. Os dados ficam editáveis, mas a requisição original NÃO é alterada (auditoria no salvar).
  const buscarRequisicao = async () => {
    const n = Number(String(fReqNum).replace(/\D/g, ''))
    if (!n) { toast('Informe o número da requisição (ex.: REQ-0125 ou 125).', 'error'); return }
    setBuscandoReq(true)
    try {
      const { data: reqs } = await sb.from('requisicoes').select('*').eq('numero', n).order('created_at', { ascending: false }).limit(1)
      const req = (reqs || [])[0]
      if (!req) { toast(`Requisição ${fmtReq(n)} não encontrada.`, 'error'); setBuscandoReq(false); return }
      const itens = await fetchRequisicaoItens(req.id)
      const validos = (itens || []).filter((it: any) => it.status !== 'cancelado')
      if (!validos.length) { toast(`${fmtReq(n)} não tem itens ativos.`, 'error'); setBuscandoReq(false); return }
      setReqVinc({ id: req.id, numero: req.numero, loja: req.loja, solicitante: req.responsavel_nome || '—', centro_custo: req.centro_custo, observacoes: req.observacoes, status: req.status })
      setFReqNum(fmtReq(req.numero))
      if (LOJAS.includes(req.loja)) setFLoja(req.loja)
      setFCentroCusto(req.centro_custo || '')
      setFObs(req.observacoes || '')
      if (recebLoja[req.loja]?.nome) setFReceb(recebLoja[req.loja].nome)
      setLinhas(validos.map((it: any) => ({
        produto: it.produto_nome, qtd: String(it.quantidade ?? ''), un: it.unidade || 'Unidade(s)',
        preco: String(it.preco_final ?? it.preco_cotado ?? it.preco_referencia ?? ''),
        reqItemId: it.id, qtdOrig: Number(it.quantidade) || 0, produtoOrig: it.produto_nome,
      })))
      toast(`${fmtReq(req.numero)} carregada — ${validos.length} item(ns). Confira e ajuste se precisar. ✅`)
    } catch { toast('Falha ao buscar a requisição.', 'error') }
    finally { setBuscandoReq(false) }
  }
  const desvincularReq = () => { setReqVinc(null); setFReqNum(''); setLinhas(ls => ls.map(l => ({ ...l, reqItemId: undefined, qtdOrig: undefined, produtoOrig: undefined }))) }

  // salva rascunho automaticamente enquanto o modal está aberto (não perde o pedido se fechar)
  useEffect(() => {
    if (!mNovo) return
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ fForn, fLoja, fData, fPagto, fCliente, fReceb, linhas, reqVinc, fReqNum, fCentroCusto, fObs })) } catch { /* ignore */ }
  }, [mNovo, fForn, fLoja, fData, fPagto, fCliente, fReceb, linhas, reqVinc, fReqNum, fCentroCusto, fObs])

  const abrirNovo = () => {
    let restaurou = false
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const d = JSON.parse(raw)
        const temItens = Array.isArray(d.linhas) && d.linhas.some((l: any) => (l?.produto || '').trim())
        if (temItens || (d.fForn || '').trim()) {
          setFForn(d.fForn || ''); setFLoja(d.fLoja || lojaDef); setFData(d.fData || new Date().toISOString().slice(0, 10))
          setFPagto(d.fPagto || 'à vista'); setFCliente(d.fCliente || ''); setFReceb(d.fReceb || '')
          setLinhas(Array.isArray(d.linhas) && d.linhas.length ? d.linhas : [linhaVazia()])
          setReqVinc(d.reqVinc || null); setFReqNum(d.fReqNum || ''); setFCentroCusto(d.fCentroCusto || ''); setFObs(d.fObs || '')
          restaurou = true
        }
      }
    } catch { /* ignore */ }
    if (!restaurou) { resetForm(); setFLoja(lojaDef) }
    setMNovo(true)
    if (restaurou) setTimeout(() => toast('📝 Rascunho recuperado — continue de onde parou.'), 300)
  }

  const salvar = async () => {
    if (!fForn.trim()) { toast('Informe o fornecedor.', 'error'); return }
    const linhasValidas = linhas.filter(l => l.produto.trim() && Number(l.qtd) > 0)
    const itens = linhasValidas.map(l => {
      const qtd = Number(l.qtd), preco = Number(l.preco) || 0
      return { produto: l.produto.trim(), qtd, un: l.un || 'Unidade(s)', preco, subtotal: Math.round(qtd * preco * 100) / 100 }
    })
    if (!itens.length) { toast('Adicione ao menos 1 item com quantidade.', 'error'); return }
    setSalvando(true)
    try {
      // cadastra produtos novos (nome não existente na loja) com nome + embalagem
      const existentes = new Set(produtosLoja.map(p => (p.nome || '').trim().toLowerCase()))
      const novos = itens.filter(it => !existentes.has(it.produto.toLowerCase()))
      let cadastrados = 0
      for (const it of novos) {
        try {
          await insertProduto({
            loja: fLoja, codigo_interno: 'PED-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.floor(Math.random() * 900 + 100),
            nome: it.produto.toUpperCase(), descricao: null, categoria_id: null, categoria_nome: 'Cadastrado via Pedido',
            gramatura: null, unidade: it.un, marca_id: null, marca_nome: null, imagem_url: null, ativo: true,
            estoque_atual: 0, estoque_minimo: 0, status_homologacao: 'homologado', feedback_teste: null,
            data_inicio_teste: null, aprovado_por: null, aprovacao_at: null, created_by: user?.name ?? 'Pedido',
            ultimo_preco_compra: it.preco || null, preco_anterior_compra: null, data_ultima_compra: fData,
            fornecedor_padrao_id: null, fornecedor_padrao_nome: fForn.trim() || null, preco_venda: null, disponivel_pdv: false,
          } as any)
          cadastrados++
        } catch { /* nome duplicado / código repetido — ignora e segue o pedido */ }
      }
      const total = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100
      const chave = `pedido_${slugify(fForn)}_${slugify(fLoja)}_${Date.now().toString(36).slice(-6)}`
      // ID próprio do pedido: PED-#### sequencial (maior número existente + 1). Escala pequena (1 comprador) → sem corrida relevante.
      let numPed = ''
      try {
        const { data: nums } = await sb.from('pedidos_compra').select('numero').not('numero', 'is', null)
        let max = 0; for (const r of (nums || [])) { const n = parseInt(String(r.numero).replace(/\D/g, ''), 10); if (!isNaN(n) && n > max) max = n }
        numPed = 'PED-' + String(max + 1).padStart(4, '0')
      } catch { numPed = 'PED-' + Date.now().toString().slice(-4) }
      const valor = {
        fornecedor: fForn.trim(), loja: fLoja, data: fData, pagamento: fPagto || null, cliente: fCliente || null,
        recebimento_responsavel: fReceb || null, itens, total, cancelados: [], em: new Date().toISOString(), created_by: user?.name || 'Painel',
        obs: fObs || null, numero_pedido: numPed,
        // rastreabilidade: pedido nasce da requisição (quando informada)
        ...(reqVinc ? { requisicao_id: reqVinc.id, requisicao_numero: reqVinc.numero, solicitante: reqVinc.solicitante, centro_custo: fCentroCusto || null, origem: 'requisicao' } : { origem: 'avulso' }),
      }
      await sb.from('app_config').upsert({ chave, valor }, { onConflict: 'chave' })
      // Registro central relacional (ponte via app_config_chave). Com requisição informada,
      // o pedido nasce vinculado (origem 'requisicao'); sem ela, segue 'avulso'.
      try {
        const pc = await insertPedidoCompra({
          numero: numPed, requisicao_id: reqVinc?.id ?? null, loja: fLoja, fornecedor: fForn.trim(),
          status: 'aberto', origem: reqVinc ? 'requisicao' : 'avulso', total, recebido_total: 0, baixa_feita: false,
          app_config_chave: chave, observacoes: fObs || null, criado_por: user?.name || 'Painel',
        })
        await insertPedidoCompraItens(itens.map((it, idx) => ({
          pedido_id: pc.id, requisicao_item_id: linhasValidas[idx]?.reqItemId ?? null, produto_nome: it.produto,
          unidade: it.un || 'Unidade(s)', qtd_pedida: it.qtd, qtd_recebida: 0, preco: it.preco || null,
        })))
        // Auditoria: registra o que foi ajustado NO PEDIDO em relação à requisição — sem alterar a requisição.
        if (reqVinc) {
          const audits = [] as any[]
          const uname = user?.name || 'Painel'
          for (const l of linhasValidas) {
            if (!l.reqItemId) continue
            const qNovo = Number(l.qtd) || 0
            if (l.qtdOrig != null && qNovo !== l.qtdOrig)
              audits.push({ requisicao_id: reqVinc.id, entidade: 'pedido', entidade_id: pc.id, campo: 'quantidade', valor_anterior: String(l.qtdOrig), valor_novo: String(qNovo), acao: 'alteracao', usuario: uname })
            if (l.produtoOrig && l.produto.trim() !== l.produtoOrig)
              audits.push({ requisicao_id: reqVinc.id, entidade: 'pedido', entidade_id: pc.id, campo: 'produto', valor_anterior: l.produtoOrig, valor_novo: l.produto.trim(), acao: 'alteracao', usuario: uname })
          }
          const nItensReq = linhasValidas.filter(l => l.reqItemId).length
          const nAvulsos = linhasValidas.filter(l => !l.reqItemId).length
          if (audits.length) await logReqAuditoria(audits)
          await insertReqTimeline({ requisicao_id: reqVinc.id, tipo: 'pedido', descricao: `Pedido ${numPed} gerado para ${fForn.trim()} (${itens.length} item(ns))${audits.length ? ` · ${audits.length} ajuste(s) no pedido` : ''}${nAvulsos ? ` · ${nAvulsos} item(ns) fora da requisição` : ''}`, usuario: uname, dados: { pedido_numero: numPed, pedido_chave: chave, pedido_id: pc.id, fornecedor: fForn.trim(), total, itens_da_requisicao: nItensReq } as any })
          // marca na requisição que o pedido foi gerado (traço do ciclo) — NÃO mexe nos itens/quantidades.
          // Avança o STATUS principal para "compra_realizada" (a menos que já esteja em recebimento/fechada).
          const jaAvancada = ['recebimento_parcial', 'recebimento_concluido', 'baixa_realizada', 'concluida', 'cancelada'].includes(reqVinc.status)
          await updateRequisicao(reqVinc.id, { pedido_numero: numPed, pedido_gerado_em: new Date().toISOString(), pedido_status: 'emitido', ...(jaAvancada ? {} : { status: 'compra_realizada' }) } as any).catch(() => {})
        }
      } catch { /* registro relacional é complementar; o blob já garante o pedido */ }
      toast(cadastrados ? `Pedido ${numPed} gerado. ✅ ${cadastrados} produto(s) novo(s) cadastrado(s).` : (reqVinc ? `Pedido ${numPed} gerado e vinculado à ${fmtReq(reqVinc.numero)}. ✅` : `Pedido ${numPed} gerado. ✅`))
      setMNovo(false); resetForm(); await load()
    } catch (e) { toast('Não foi possível gerar o pedido.', 'error') }
    finally { setSalvando(false) }
  }

  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }
  const inp: React.CSSProperties = { padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #6B1212 0%, #8a2a2a 100%)', borderRadius: 12, padding: '18px 22px', marginBottom: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClipboardList size={24} /></div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Pedidos de Compra</h2>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Gere o pedido, abra o link (imprimir/compartilhar) e acompanhe o recebimento — Loja <strong>{loja}</strong></div>
        </div>
        {podeCriar && <button className="btn" onClick={abrirNovo} style={{ padding: '9px 15px', background: '#fff', color: '#8B1212' }}><Plus size={16} /> Novo pedido</button>}
        <button onClick={load} title="Atualizar" style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}><RefreshCw size={16} /></button>
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Loader2 className="spin" size={26} /></div>
        : filtrados.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 10 }}>
            Nenhum pedido nesta loja ainda.{podeCriar && <button className="btn" onClick={abrirNovo} style={{ padding: '7px 14px', marginLeft: 8 }}><Plus size={14} /> Novo pedido</button>}
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtrados.map(p => { const an = analisePedido(p); const aberto = analiseAberta === p.chave; return (
              <Fragment key={p.chave}>
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6', color: '#8B1212', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={19} /></div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {p.numero_pedido && <span style={{ fontSize: 11, fontWeight: 800, color: '#8B1212', background: '#F3F4F6', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 7px' }}>{p.numero_pedido}</span>}
                    {p.fornecedor || 'Fornecedor'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {p.loja} · {fmtD(p.data)} · {(p.itens || []).length} itens{p.requisicao_numero ? ` · da REQ-${String(p.requisicao_numero).padStart(4, '0')}` : ''}{p.recebimento_responsavel ? ` · recebe ${p.recebimento_responsavel}` : ''}{p.cancelados && p.cancelados.length ? ` · ⚠ ${p.cancelados.length} cancelado(s)` : ''}
                  </div>
                </div>
                {p.recebimento
                  ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: p.recebimento.status === 'Recebido integral' ? '#DCFCE7' : '#FEF3C7', color: p.recebimento.status === 'Recebido integral' ? '#15803D' : '#B45309', whiteSpace: 'nowrap' }} title={`${p.recebimento.por || ''} · ${p.recebimento.em ? new Date(p.recebimento.em).toLocaleString('pt-BR') : ''}${p.recebimento.obs ? ' · ' + p.recebimento.obs : ''}`}>✓ {p.recebimento.status}</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#E0F2FE', color: '#0369A1', whiteSpace: 'nowrap' }}>Aguardando recebimento</span>}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#8B1212' }}>{fmtR$(p.total || 0)}</div>
                  {an.diffTotal != null && <div style={{ fontSize: 10.5, fontWeight: 700, color: an.diffTotal > 2 ? '#DC2626' : an.diffTotal < -2 ? '#15803D' : '#6b7280' }} title="Total dos itens com custo médio vs custo médio de referência">{an.diffTotal > 0 ? '▲ +' : an.diffTotal < 0 ? '▼ ' : ''}{an.diffTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs médio</div>}
                </div>
                <button onClick={() => setAnaliseAberta(aberto ? null : p.chave)} className="btn" style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Análise de custo médio do pedido">📊 Custo</button>
                <a href={link(p)} target="_blank" rel="noreferrer" className="btn" style={{ padding: '8px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                  <ExternalLink size={15} /> Abrir
                </a>
                {p.requisicao_id && <a href={`${siteOrigin()}/ciclo-requisicao.html?id=${p.requisicao_id}`} target="_blank" rel="noreferrer" className="btn" style={{ padding: '8px 14px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} title="Ver o ciclo completo da requisição de origem">🔗 Ciclo</a>}
                {podeCriar && <button onClick={() => abrirEnviar(p)} className="btn" style={{ padding: '8px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Send size={15} /> Enviar
                </button>}
                {podeCriar && <button onClick={() => cancelarPedido(p)} className="btn" title="Cancelar / excluir este pedido" style={{ padding: '8px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg)', color: '#DC2626', border: '1px solid var(--border)' }}>
                  <Trash2 size={15} /> Cancelar
                </button>}
              </div>
              {aberto && <div style={{ ...card, marginTop: -6, background: 'var(--bg)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📊 Análise de custo do pedido <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11.5 }}>· preço do pedido × custo médio de referência</span></div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 12 }}>
                  <span><b>Custo médio ref.:</b> {fmtR$(an.refTotal)}</span>
                  <span><b>Pedido (itens c/ ref.):</b> {fmtR$(an.pedComRef)}</span>
                  <span style={{ color: an.extra > 0.01 ? '#DC2626' : an.extra < -0.01 ? '#15803D' : '#6b7280', fontWeight: 700 }}>{an.extra > 0.01 ? `Custo extra +${fmtR$(an.extra)}` : an.extra < -0.01 ? `Economia ${fmtR$(-an.extra)}` : 'No custo médio'}{an.diffTotal != null ? ` (${an.diffTotal > 0 ? '+' : ''}${an.diffTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : ''}</span>
                  <span style={{ color: 'var(--muted)' }}>{an.comRef} de {(p.itens || []).length} itens com custo médio</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
                    <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 10.5, textTransform: 'uppercase' }}><th style={{ padding: 6 }}>Produto</th><th>Qtd</th><th>Preço pedido</th><th>Custo médio</th><th>Δ</th><th>Subtotal</th></tr></thead>
                    <tbody>{an.linhas.map((r, k) => <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{r.it.produto}</td>
                      <td>{r.it.qtd} {r.it.un || ''}</td>
                      <td>{fmtR$(r.it.preco)}</td>
                      <td style={{ color: 'var(--muted)' }}>{r.cm != null ? fmtR$(r.cm) : '—'}</td>
                      <td style={{ fontWeight: 700, color: r.diff == null ? 'var(--muted)' : r.diff > 2 ? '#DC2626' : r.diff < -2 ? '#15803D' : '#6b7280' }}>{r.diff == null ? '—' : (r.diff > 0 ? '+' : '') + r.diff.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtR$(r.sub)}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>Custo médio = média ponderada das compras (estoque). Δ compara o preço do pedido com o custo médio (🔴 acima / 🟢 abaixo). Itens sem custo médio ainda não têm histórico de compra itemizado.</div>
              </div>}
              </Fragment>
            )})}
          </div>}

      {/* Modal: novo pedido manual */}
      {mNovo && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 720, margin: '24px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <strong style={{ fontSize: 16 }}>🧾 Novo pedido de compra</strong>
              <button onClick={() => setMNovo(false)} title="Fechar (mantém o rascunho)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            {/* Origem: Requisição — informe o Nº e o sistema carrega loja, solicitante, centro de custo, obs e todos os itens */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, background: reqVinc ? 'rgba(21,128,61,.08)' : 'var(--bg)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>🔗 Requisição de origem <span style={{ fontWeight: 400 }}>— opcional; carrega os itens automaticamente (cotação não é obrigatória)</span></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={fReqNum} onChange={e => setFReqNum(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarRequisicao() } }} placeholder="REQ-0125 ou 125" style={{ ...inp, width: 160 }} disabled={!!reqVinc} />
                {!reqVinc
                  ? <button className="btn" onClick={buscarRequisicao} disabled={buscandoReq} style={{ padding: '9px 14px' }}>{buscandoReq ? 'Buscando…' : '🔎 Buscar requisição'}</button>
                  : <>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#15803D' }}>✓ {fmtReq(reqVinc.numero)}</span>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{reqVinc.loja} · Solic.: {reqVinc.solicitante}{fCentroCusto ? ` · C. Custo: ${fCentroCusto}` : ''}</span>
                      <button onClick={desvincularReq} title="Desvincular a requisição (mantém os itens já carregados)" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 12, fontWeight: 700 }}>✕ desvincular</button>
                    </>}
              </div>
              {reqVinc && fObs && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>📝 Obs. da requisição: {fObs}</div>}
              {reqVinc && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Os dados abaixo vieram da requisição e podem ser editados — alterações ficam registradas no pedido, sem mudar a requisição original.</div>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Fornecedor *
                <input list="forn-list" value={fForn} onChange={e => setFForn(e.target.value)} placeholder="Nome do fornecedor" style={inp} />
                <datalist id="forn-list">{forns.map(f => <option key={f.id} value={f.nome} />)}</datalist>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Loja
                <select value={fLoja} onChange={e => setFLoja(e.target.value)} style={inp}>{LOJAS.map(l => <option key={l} value={l}>{l}</option>)}</select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Data
                <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Pagamento
                <input value={fPagto} onChange={e => setFPagto(e.target.value)} placeholder="à vista / 28 dias…" style={inp} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Recebimento (responsável)
                <input value={fReceb} onChange={e => setFReceb(e.target.value)} placeholder="Ex.: Carlos Wellington" style={inp} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>Cliente (opcional)
                <input value={fCliente} onChange={e => setFCliente(e.target.value)} placeholder="Ex.: Amore / LDI" style={inp} />
              </label>
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Itens</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
                  <th style={{ padding: 6 }}>Produto</th><th style={{ width: 80 }}>Qtd</th><th style={{ width: 120 }}>Unidade</th><th style={{ width: 100 }}>Preço unit.</th><th style={{ width: 100 }}>Subtotal</th><th style={{ width: 34 }}></th>
                </tr></thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const sub = (Number(l.qtd) || 0) * (Number(l.preco) || 0)
                    const nomeTrim = (l.produto || '').trim().toLowerCase()
                    const existe = !!nomeTrim && produtosLoja.some(p => (p.nome || '').trim().toLowerCase() === nomeTrim)
                    const novo = !!nomeTrim && !existe
                    return <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 6 }}>
                        <input list="prod-list" value={l.produto} onChange={e => {
                          const v = e.target.value
                          const prod = produtosLoja.find(p => (p.nome || '').trim().toLowerCase() === v.trim().toLowerCase())
                          setLinha(i, { produto: v, ...(prod ? { un: prod.unidade || l.un, ...(!l.preco && prod.ultimo_preco_compra ? { preco: String(prod.ultimo_preco_compra) } : {}) } : {}) })
                        }} placeholder="Produto (busque ou digite um novo)" style={{ ...inp, width: '100%' }} />
                        {novo && <div style={{ fontSize: 10.5, color: '#15803D', marginTop: 3, fontWeight: 600 }}>✨ Produto novo — será cadastrado na loja</div>}
                        {l.reqItemId && <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 3 }}>🔗 da {reqVinc ? fmtReq(reqVinc.numero) : 'requisição'}{l.qtdOrig != null && Number(l.qtd) !== l.qtdOrig ? ` · era ${l.qtdOrig} ${l.un}` : ''}</div>}
                      </td>
                      <td style={{ padding: 6 }}><input type="number" min={0} step="0.001" value={l.qtd} onChange={e => setLinha(i, { qtd: e.target.value })} style={{ ...inp, width: 74 }} /></td>
                      <td style={{ padding: 6 }}><select value={l.un} onChange={e => setLinha(i, { un: e.target.value })} style={{ ...inp, width: 114 }}>{UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td style={{ padding: 6 }}><input type="number" min={0} step="0.01" value={l.preco} onChange={e => setLinha(i, { preco: e.target.value })} placeholder="0,00" style={{ ...inp, width: 94 }} /></td>
                      <td style={{ padding: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtR$(sub)}</td>
                      <td style={{ padding: 6 }}>{linhas.length > 1 && <button onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))} title="Remover" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626' }}><Trash2 size={16} /></button>}</td>
                    </tr>
                  })}
                </tbody>
              </table>
              <datalist id="prod-list">{produtosLoja.filter(p => p.nome).map(p => <option key={p.id} value={p.nome}>{p.unidade ? `${p.unidade}${p.ultimo_preco_compra ? ' · últ. ' + fmtR$(p.ultimo_preco_compra) : ''}` : ''}</option>)}</datalist>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>💡 {produtosLoja.length} produtos cadastrados em <strong>{fLoja}</strong>. Escolha da lista (a embalagem e o último preço entram sozinhos) ou digite um nome novo — na hora de gerar, o produto novo é cadastrado com a embalagem escolhida.</div>
            <button onClick={() => setLinhas(ls => [...ls, linhaVazia()])} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> Adicionar item</button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>Total: <span style={{ color: '#8B1212' }}>{fmtR$(totalForm)}</span> <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>· {linhas.filter(l => (l.produto || '').trim()).length} itens · rascunho salvo automaticamente</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => { if (linhas.some(l => (l.produto || '').trim()) && !confirm('Limpar todos os itens deste pedido? Não dá para desfazer.')) return; resetForm() }} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }} title="Apaga tudo e começa do zero">🗑️ Limpar</button>
                <button className="btn" onClick={() => setMNovo(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }} title="Fecha sem perder — o rascunho fica salvo">Fechar</button>
                <button className="btn" onClick={salvar} disabled={salvando} style={{ padding: '9px 18px', opacity: salvando ? .6 : 1 }}>{salvando ? 'Gerando…' : '✅ Gerar pedido'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: enviar link do pedido */}
      {mEnviar && pedSel && (
        <div style={{ position: 'fixed', inset: 0, background: '#0008', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setMEnviar(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ fontSize: 16 }}>📤 Enviar pedido</strong>
              <button onClick={() => setMEnviar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              {pedSel.fornecedor} · {pedSel.loja} · {fmtR$(pedSel.total || 0)} — dispara o <strong>link do pedido</strong> por WhatsApp.
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fornecedor ({pedSel.fornecedor})</label>
            <input value={foneForn} onChange={e => setFoneForn(e.target.value)} placeholder="WhatsApp do fornecedor c/ DDD" style={{ ...inp, width: '100%', marginBottom: 4 }} />
            {!foneForn && <div style={{ fontSize: 11, color: '#B45309', marginBottom: 8 }}>Sem WhatsApp cadastrado — digite para enviar.</div>}
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', margin: '10px 0 4px' }}>Recebimento{pedSel.recebimento_responsavel ? ` (${pedSel.recebimento_responsavel})` : ''}</label>
            <input value={foneReceb} onChange={e => setFoneReceb(e.target.value)} placeholder="WhatsApp do responsável c/ DDD" style={{ ...inp, width: '100%' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setMEnviar(false)} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', padding: '9px 16px' }}>Cancelar</button>
              <button className="btn" onClick={enviarPedido} disabled={enviandoP} style={{ padding: '9px 16px', opacity: enviandoP ? .6 : 1 }}>{enviandoP ? 'Enviando…' : '📲 Enviar link'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
