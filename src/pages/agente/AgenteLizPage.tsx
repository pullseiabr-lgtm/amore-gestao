import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Send, Search, Plus, Sparkles, Key,
  Phone, Mail, MapPin, CheckCircle,
  Loader2,
  MessageSquare, Settings2, ExternalLink,
  Globe, Brain, Target, ShoppingCart,
  TrendingUp, TrendingDown, AlertTriangle, PackageX,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchFornecedores,
  insertFornecedor,
  fetchProdutos,
  fetchComprasListas,
  fetchRequisicoes,
  fetchListaHistoricoPrecos,
} from '../../lib/db'
import type { ListaHistoricoPreco } from '../../types/database'

// ── Types ────────────────────────────────────────────────────────
interface ChatMsg {
  role: 'user' | 'liz'
  text: string
  ts: number
  loading?: boolean
}

interface SupplierProspect {
  nome: string
  site: string
  telefone: string | null
  email: string | null
  cidade: string | null
  produto: string
  snippet: string
  selecionado: boolean
}

interface InsightBlock {
  titulo: string
  emoji: string
  corpo: string
  cor: string
}

type Tab = 'chat' | 'prospeccao' | 'inteligencia' | 'compras-ia' | 'whatsapp'
type WaTipo = 'estoque' | 'compras' | 'auditoria' | 'reuniao'

// ── Gemini helper ────────────────────────────────────────────────
async function chamarGemini(
  systemPrompt: string,
  historia: { role: string; parts: { text: string }[] }[],
  apiKey: string,
): Promise<string> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: historia,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    },
  )
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Gemini HTTP ${resp.status}`)
  }
  const data = await resp.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(sem resposta)'
}

// ── Brave Search helper ──────────────────────────────────────────
interface BraveResult { title: string; url: string; description: string }

// Sites de marketplace que não são fornecedores reais
const NOISE_DOMAINS = ['mercadolivre', 'amazon', 'shopee', 'americanas', 'magalu', 'ifood', 'rappi', 'ubereat']

function isNoiseDomain(url: string) {
  try { return NOISE_DOMAINS.some(d => new URL(url).hostname.includes(d)) }
  catch { return false }
}

// Gera variações de busca do mais específico para o mais genérico
function gerarTermosBusca(query: string): string[] {
  const base = query.trim()
  const palavras = base.toLowerCase().split(/\s+/)

  const queries: string[] = [
    // 1ª tentativa: busca direta, sem qualificadores excessivos
    `distribuidora atacado ${base}`,
    // 2ª tentativa: adiciona "food service" para atrair fornecedores B2B
    `fornecedor ${base} food service restaurante`,
  ]

  // Se o termo tem 3+ palavras (ex: "filé de peito de frango"),
  // tenta com as últimas 2 palavras mais significativas como fallback
  if (palavras.length >= 3) {
    const genericTerm = palavras.slice(-2).join(' ')
    queries.push(`distribuidora atacado ${genericTerm}`)
    queries.push(`fornecedor ${genericTerm} atacado CNPJ`)
  } else if (palavras.length === 2) {
    queries.push(`fornecedor atacado ${base} CNPJ`)
  }

  return queries
}

async function buscarFornecedores(query: string, braveKey: string): Promise<BraveResult[]> {
  const termos = gerarTermosBusca(query)

  for (const q of termos) {
    const params = new URLSearchParams({ q })
    if (braveKey) params.set('t', braveKey)
    const r = await fetch(`/api/brave-search?${params}`)
    const data = await r.json()
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
    const results: BraveResult[] = data?.web?.results || []
    const filtered = results.filter(res => res.url && !isNoiseDomain(res.url))
    if (filtered.length > 0) return filtered
    // Resultado vazio → tenta próxima variação de query
  }

  return []
}

function extrairTelefone(texto: string): string | null {
  const m = texto.match(/\(?\d{2}\)?\s*\d{4,5}[-\s]?\d{4}/)
  return m ? m[0].replace(/\s/g, '') : null
}

function extrairEmail(texto: string): string | null {
  const m = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  return m ? m[0] : null
}

function extrairCidade(texto: string): string | null {
  const cities = ['Recife', 'Caruaru', 'Olinda', 'Jaboatão', 'São Paulo', 'Rio de Janeiro',
    'Salvador', 'Fortaleza', 'Belo Horizonte', 'Curitiba', 'Manaus', 'Porto Alegre']
  for (const c of cities) {
    if (texto.includes(c)) return c
  }
  return null
}

function prospectFromResult(r: BraveResult, produto: string): SupplierProspect {
  const fullText = r.title + ' ' + r.description
  try {
    const host = new URL(r.url).hostname.replace('www.', '')
    const nomeParts = host.split('.')[0]
    const nome = nomeParts.charAt(0).toUpperCase() + nomeParts.slice(1)
    return {
      nome,
      site: r.url,
      telefone: extrairTelefone(fullText),
      email: extrairEmail(fullText),
      cidade: extrairCidade(fullText),
      produto,
      snippet: r.description?.slice(0, 160) || '',
      selecionado: false,
    }
  } catch {
    return {
      nome: r.title.split(' ').slice(0, 3).join(' '),
      site: r.url,
      telefone: extrairTelefone(fullText),
      email: extrairEmail(fullText),
      cidade: extrairCidade(fullText),
      produto,
      snippet: r.description?.slice(0, 160) || '',
      selecionado: false,
    }
  }
}

// ── Main Component ───────────────────────────────────────────────
export default function AgenteLizPage() {
  const { loja } = useLoja()
  const { user } = useAuth()

  // Config — mesmas chaves do ComprasAgentePage para não pedir config de novo
  const [geminiKey, setGeminiKey] = useState(
    () => localStorage.getItem('gemini_api_key') || (import.meta.env.VITE_GEMINI_API_KEY as string) || ''
  )
  const [braveKey, setBraveKey] = useState(
    () => localStorage.getItem('brave_api_key') || (import.meta.env.VITE_BRAVE_API_KEY as string) || ''
  )
  const [showConfig, setShowConfig] = useState(false)

  // Tabs
  const [tab, setTab] = useState<Tab>('chat')

  // Chat
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Context data
  const [contextReady, setContextReady] = useState(false)
  const [systemCtx, setSystemCtx] = useState('')

  // Prospecção
  const [buscaQuery, setBuscaQuery] = useState('')
  const [prospectos, setProspectos] = useState<SupplierProspect[]>([])
  const [buscando, setBuscando] = useState(false)
  const [registrando, setRegistrando] = useState(false)
  const [registradoMsg, setRegistradoMsg] = useState('')
  const [buscaErro, setBuscaErro] = useState('')

  // Inteligência
  const [insights, setInsights] = useState<InsightBlock[]>([])
  const [gerandoInsights, setGerandoInsights] = useState(false)

  // Compras IA
  const [rawProdutos, setRawProdutos] = useState<{ nome: string; estoque_atual: number; estoque_minimo: number; unidade: string }[]>([])
  const [historicoPrecos, setHistoricoPrecos] = useState<ListaHistoricoPreco[]>([])
  const [comprasIaLoading, setComprasIaLoading] = useState(false)
  const [comprasIaAnalise, setComprasIaAnalise] = useState('')

  // WhatsApp
  const [waPhone, setWaPhone] = useState(() => localStorage.getItem('liz_wa_phone') || '')
  const [waTipo, setWaTipo] = useState<WaTipo>('estoque')
  const [waMsgCustom, setWaMsgCustom] = useState('')

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  // Save keys — mesma key do ComprasAgentePage para compartilhar
  useEffect(() => {
    if (geminiKey) localStorage.setItem('gemini_api_key', geminiKey)
    if (braveKey)  localStorage.setItem('brave_api_key',  braveKey)
    if (waPhone)   localStorage.setItem('liz_wa_phone',   waPhone)
  }, [geminiKey, braveKey, waPhone])

  // Load system context on mount
  const loadContext = useCallback(async () => {
    try {
      const [fornecedores, produtos, comprasListas, requisicoes, historico] = await Promise.all([
        fetchFornecedores(loja).catch(() => []),
        fetchProdutos(loja).catch(() => []),
        fetchComprasListas(loja).catch(() => []),
        fetchRequisicoes(loja).catch(() => []),
        fetchListaHistoricoPrecos(loja).catch(() => []),
      ])
      setRawProdutos(produtos as { nome: string; estoque_atual: number; estoque_minimo: number; unidade: string }[])
      setHistoricoPrecos(historico)

      const estoqueCritico = produtos
        .filter(p => p.estoque_atual <= p.estoque_minimo)
        .slice(0, 15)
        .map(p => `${p.nome} (atual: ${p.estoque_atual} ${p.unidade}, mín: ${p.estoque_minimo})`)

      const fornSemContato = fornecedores
        .filter(f => !f.contato_telefone && !f.contato_email)
        .slice(0, 10)
        .map(f => f.nome)

      const prodSemFornecedor = produtos
        .filter(p => !p.fornecedor_padrao_id)
        .slice(0, 10)
        .map(p => p.nome)

      const comprasRecentes = comprasListas
        .slice(0, 5)
        .map(c => `${c.titulo || 'Lista'} — R$ ${c.total_real?.toFixed(2) || '0.00'}`)

      const reqPendentes = requisicoes
        .filter(r => r.status !== 'concluida' && r.status !== 'cancelada' && r.status !== 'reprovada')
        .slice(0, 5)
        .map(r => `REQ-${r.numero}: ${r.titulo}`)

      const ctx = `
CONTEXTO DO SISTEMA — ${new Date().toLocaleDateString('pt-BR')}
Loja ativa: ${loja}
Usuário: ${user?.name} (${user?.role})

ESTOQUE CRÍTICO (${estoqueCritico.length} itens):
${estoqueCritico.length ? estoqueCritico.join('\n') : 'Nenhum item crítico'}

FORNECEDORES (${fornecedores.length} cadastrados, ${fornSemContato.length} sem contato):
${fornSemContato.length ? 'Sem contato: ' + fornSemContato.join(', ') : 'Todos têm contato'}

PRODUTOS SEM FORNECEDOR PADRÃO (${prodSemFornecedor.length}):
${prodSemFornecedor.length ? prodSemFornecedor.join(', ') : 'Todos têm fornecedor'}

ÚLTIMAS COMPRAS:
${comprasRecentes.length ? comprasRecentes.join('\n') : 'Nenhuma'}

REQUISIÇÕES PENDENTES:
${reqPendentes.length ? reqPendentes.join('\n') : 'Nenhuma'}
      `.trim()

      setSystemCtx(ctx)
      setContextReady(true)

      // Welcome message
      setMsgs([{
        role: 'liz',
        text: `Olá, ${user?.name?.split(' ')[0] || 'Gestor'}! Sou a **Liz**, sua assistente comercial inteligente. 🤖\n\nJá carreguei o contexto da loja **${loja}** — ${estoqueCritico.length} itens críticos, ${fornecedores.length} fornecedores, ${reqPendentes.length} requisições pendentes.\n\nPosso analisar o sistema, prospectar fornecedores, identificar oportunidades e gerar relatórios. Como posso ajudar?`,
        ts: Date.now(),
      }])
    } catch (e) {
      console.error('Liz context error:', e)
      setContextReady(true)
    }
  }, [loja, user])

  useEffect(() => { loadContext() }, [loadContext])

  // ── System prompt ────────────────────────────────────────────
  const buildSystemPrompt = () => `
Você é Liz, uma IA de gestão comercial especializada em restaurantes e food service.
Você faz parte do sistema Amore Gestão, usado pela rede Amore Food.

PERSONALIDADE: Profissional, direta, perspicaz. Use linguagem clara e dados concretos.
Sempre formate bem com marcadores e destaque números importantes.
Quando identificar problemas, sugira ações práticas imediatas.

SUAS CAPACIDADES:
- Analisar dados de estoque, compras, fornecedores e finanças
- Identificar riscos operacionais e oportunidades de economia
- Recomendar fornecedores e negociações
- Gerar relatórios gerenciais como se fosse o gestor da operação
- Prospectar novos fornecedores via pesquisa de mercado

CONTEXTO ATUAL DO SISTEMA:
${systemCtx}

INSTRUÇÕES:
- Responda sempre em português do Brasil
- Use emojis estrategicamente para facilitar leitura
- Quando mencionar valores, use formato R$ X.XXX,XX
- Priorize informações críticas para a operação
- Se não souber algo específico do sistema, diga que vai precisar consultar
  `.trim()

  // ── Chat ─────────────────────────────────────────────────────
  const enviarMensagem = async (textoOverride?: string) => {
    const texto = (textoOverride || input).trim()
    if (!texto || chatLoading) return
    if (!geminiKey) { setShowConfig(true); return }

    setInput('')
    const userMsg: ChatMsg = { role: 'user', text: texto, ts: Date.now() }
    const loadingMsg: ChatMsg = { role: 'liz', text: '', ts: Date.now() + 1, loading: true }

    setMsgs(prev => [...prev, userMsg, loadingMsg])
    setChatLoading(true)

    try {
      // Build history for Gemini (exclude loading msg)
      const history = msgs
        .filter(m => !m.loading)
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        }))
      history.push({ role: 'user', parts: [{ text: texto }] })

      const resposta = await chamarGemini(buildSystemPrompt(), history, geminiKey)

      setMsgs(prev => prev.map(m =>
        m.loading ? { ...m, text: resposta, loading: false } : m,
      ))
    } catch (e: any) {
      setMsgs(prev => prev.map(m =>
        m.loading
          ? { ...m, text: `❌ Erro: ${e.message}`, loading: false }
          : m,
      ))
    } finally {
      setChatLoading(false)
    }
  }

  // ── Prospecção ───────────────────────────────────────────────
  const buscarProspectos = async () => {
    if (!buscaQuery.trim()) return
    if (!braveKey) { setShowConfig(true); return }
    setBuscando(true)
    setProspectos([])
    setRegistradoMsg('')
    setBuscaErro('')
    try {
      const results = await buscarFornecedores(buscaQuery, braveKey)
      if (results.length === 0) {
        setBuscaErro(
          `Nenhum fornecedor encontrado para "${buscaQuery}". ` +
          `Tente termos mais genéricos — ex: "frango congelado" em vez de "filé de peito de frango", ` +
          `ou "laticínios" em vez de "muçarela fatiada".`
        )
      } else {
        setProspectos(results.slice(0, 8).map(r => prospectFromResult(r, buscaQuery)))
      }
    } catch (e: any) {
      const msg: string = e.message || 'Erro desconhecido'
      if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized')) {
        setBuscaErro('❌ Brave Search: chave de API inválida ou expirada. Clique em "Config" e verifique a chave.')
      } else if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate limit')) {
        setBuscaErro('❌ Limite de requisições da Brave Search atingido. Aguarde alguns minutos e tente novamente.')
      } else if (msg.includes('Failed to fetch') || msg.toLowerCase().includes('network')) {
        setBuscaErro('❌ Erro de rede ao contatar a API. Verifique sua conexão ou tente novamente.')
      } else {
        setBuscaErro(`❌ Erro ao buscar fornecedores: ${msg}`)
      }
    } finally {
      setBuscando(false)
    }
  }

  const toggleProspecto = (i: number) => {
    setProspectos(prev => prev.map((p, idx) =>
      idx === i ? { ...p, selecionado: !p.selecionado } : p,
    ))
  }

  const registrarSelecionados = async () => {
    const selecionados = prospectos.filter(p => p.selecionado)
    if (!selecionados.length) return
    setRegistrando(true)
    const lojas = ['Amore Costa Dourada', 'Flow Paiva', 'Amore Paiva']
    let count = 0
    for (const p of selecionados) {
      for (const l of lojas) {
        try {
          await insertFornecedor({
            loja: l,
            nome: p.nome,
            razao_social: null,
            cnpj: null,
            ie: null,
            email: p.email,
            telefone: p.telefone,
            whatsapp: p.telefone,
            logo_url: null,
            cep: null,
            logradouro: null,
            numero: null,
            complemento: null,
            bairro: null,
            cidade: p.cidade,
            estado: null,
            forma_pagamento: 'À vista',
            chave_pix: null,
            banco: null,
            agencia: null,
            conta: null,
            prazo_pagamento: 0,
            categorias: p.produto,
            prazo_entrega_dias: null,
            pedido_minimo: null,
            desconto_pct: null,
            contato_nome: null,
            contato_email: p.email,
            contato_telefone: p.telefone,
            observacoes: `Prospectado por Liz via web — ${p.site}`,
            nota_avaliacao: null,
            total_pedidos: 0,
            obs_avaliacao: null,
            ativo: true,
            created_by: user?.id || null,
          })
          count++
        } catch (_) {}
      }
    }
    setRegistrando(false)
    setRegistradoMsg(`✅ ${selecionados.length} fornecedor${selecionados.length > 1 ? 'es' : ''} cadastrado${selecionados.length > 1 ? 's' : ''} nas 3 lojas (${count} registros)`)
    setProspectos(prev => prev.map(p => p.selecionado ? { ...p, selecionado: false } : p))
  }

  // ── Inteligência ─────────────────────────────────────────────
  const gerarInsights = async () => {
    if (!geminiKey) { setShowConfig(true); return }
    setGerandoInsights(true)
    setInsights([])
    const prompt = `
Com base no contexto do sistema, gere 5 blocos de inteligência gerencial.
Para cada bloco retorne um JSON no formato:
{"titulo": "...", "emoji": "...", "corpo": "...", "cor": "#hex"}

Tópicos a cobrir:
1. Alertas críticos de estoque (cor vermelha)
2. Oportunidades de negociação com fornecedores (cor verde)
3. Análise de eficiência de compras (cor azul)
4. Recomendações estratégicas para a semana (cor roxo)
5. Resumo executivo para o gestor (cor laranja)

Retorne um array JSON com 5 objetos. Apenas JSON, sem markdown.
    `.trim()

    try {
      const resposta = await chamarGemini(buildSystemPrompt(), [
        { role: 'user', parts: [{ text: prompt }] },
      ], geminiKey)

      // Parse JSON from response
      const jsonMatch = resposta.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        setInsights(parsed)
      } else {
        // Fallback: create a single insight with the full text
        setInsights([{
          titulo: 'Análise Gerencial',
          emoji: '📊',
          corpo: resposta,
          cor: '#6366f1',
        }])
      }
    } catch (e: any) {
      setInsights([{
        titulo: 'Erro ao gerar insights',
        emoji: '❌',
        corpo: e.message,
        cor: '#ef4444',
      }])
    } finally {
      setGerandoInsights(false)
    }
  }

  // ── Compras IA ────────────────────────────────────────────────
  const comprasIaData = useMemo(() => {
    // Agrupar histórico por produto
    const porProduto: Record<string, ListaHistoricoPreco[]> = {}
    historicoPrecos.forEach(h => {
      if (!porProduto[h.produto_nome]) porProduto[h.produto_nome] = []
      porProduto[h.produto_nome].push(h)
    })

    // Desvios de preço: último preço vs média histórica
    const desvios: { nome: string; ultimo: number; media: number; desvio: number; fornecedor: string | null }[] = []
    Object.entries(porProduto).forEach(([nome, registros]) => {
      if (registros.length < 2) return
      const sorted = [...registros].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const ultimo = sorted[0].preco
      const anteriores = sorted.slice(1)
      const media = anteriores.reduce((s, r) => s + r.preco, 0) / anteriores.length
      const desvio = media > 0 ? ((ultimo - media) / media) * 100 : 0
      if (desvio >= 10) {
        desvios.push({ nome, ultimo, media, desvio, fornecedor: sorted[0].fornecedor })
      }
    })
    desvios.sort((a, b) => b.desvio - a.desvio)

    // Estoque em risco
    const emRisco = rawProdutos
      .filter(p => p.estoque_minimo > 0 && p.estoque_atual <= p.estoque_minimo)
      .sort((a, b) => (a.estoque_atual / Math.max(a.estoque_minimo, 1)) - (b.estoque_atual / Math.max(b.estoque_minimo, 1)))

    const zerados = rawProdutos.filter(p => p.estoque_atual === 0)

    // Sugestões de compra: estoque crítico sem compra nos últimos 7 dias
    const sete = new Date(); sete.setDate(sete.getDate() - 7)
    const compradosRecentes = new Set(
      historicoPrecos
        .filter(h => new Date(h.created_at) >= sete)
        .map(h => h.produto_nome.toLowerCase())
    )
    const sugestoes = emRisco
      .filter(p => !compradosRecentes.has(p.nome.toLowerCase()))
      .slice(0, 10)

    return { desvios: desvios.slice(0, 15), emRisco: emRisco.slice(0, 10), zerados, sugestoes }
  }, [historicoPrecos, rawProdutos])

  const gerarAnaliseComprasIA = async () => {
    if (!geminiKey) { setShowConfig(true); return }
    setComprasIaLoading(true)
    setComprasIaAnalise('')
    const { desvios, emRisco, zerados } = comprasIaData
    const prompt = `
Analise os dados de compras abaixo e gere um relatório executivo de Inteligência de Compras.

DESVIOS DE PREÇO DETECTADOS (${desvios.length}):
${desvios.slice(0, 8).map(d => `- ${d.nome}: último R$${d.ultimo.toFixed(2)} vs média R$${d.media.toFixed(2)} (+${d.desvio.toFixed(0)}%)`).join('\n') || 'Nenhum desvio significativo'}

ESTOQUE EM RISCO (${emRisco.length} itens abaixo do mínimo):
${emRisco.slice(0, 8).map(p => `- ${p.nome}: atual ${p.estoque_atual} / mín ${p.estoque_minimo} ${p.unidade}`).join('\n') || 'Nenhum'}

ESTOQUE ZERADO (${zerados.length} itens):
${zerados.slice(0, 8).map(p => p.nome).join(', ') || 'Nenhum'}

Gere:
1. Diagnóstico dos 3 principais riscos
2. Ações imediatas recomendadas (lista com prioridade)
3. Oportunidades de negociação
4. Alerta de possível desperdício ou compra excessiva

Seja direto e objetivo. Use emojis para facilitar leitura.
    `.trim()
    try {
      const resp = await chamarGemini(buildSystemPrompt(), [{ role: 'user', parts: [{ text: prompt }] }], geminiKey)
      setComprasIaAnalise(resp)
    } catch (e: any) {
      setComprasIaAnalise(`❌ Erro: ${e.message}`)
    } finally {
      setComprasIaLoading(false)
    }
  }

  // ── WhatsApp helpers ──────────────────────────────────────────
  const gerarMensagemWA = (): string => {
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
    const { emRisco, zerados, sugestoes, desvios } = comprasIaData

    if (waTipo === 'estoque') {
      const linhas = [
        `🤖 *LIZ — ALERTA DE ESTOQUE*`,
        `📅 ${hoje}`,
        `🏪 ${loja}`,
        `━━━━━━━━━━━━━━━`,
        ``,
        zerados.length > 0
          ? `🔴 *ZERADOS (${zerados.length}):*\n${zerados.slice(0, 6).map(p => `  • ${p.nome}`).join('\n')}`
          : `✅ Nenhum item zerado`,
        ``,
        emRisco.length > 0
          ? `🟡 *EM RISCO (${emRisco.length}):*\n${emRisco.slice(0, 6).map(p => `  • ${p.nome}: ${p.estoque_atual}/${p.estoque_minimo} ${p.unidade}`).join('\n')}`
          : `✅ Estoque dentro do mínimo`,
        ``,
        sugestoes.length > 0
          ? `🛒 *COMPRAR URGENTE:*\n${sugestoes.slice(0, 5).map(p => `  • ${p.nome}`).join('\n')}`
          : ``,
        ``,
        `_Gerado via Liz · Amore Gestão_`,
      ].filter(l => l !== undefined).join('\n')
      return linhas
    }

    if (waTipo === 'compras') {
      const linhas = [
        `🤖 *LIZ — RELATÓRIO DE COMPRAS*`,
        `📅 ${hoje}`,
        `🏪 ${loja}`,
        `━━━━━━━━━━━━━━━`,
        ``,
        desvios.length > 0
          ? `📈 *DESVIOS DE PREÇO (${desvios.length}):*\n${desvios.slice(0, 5).map(d => `  • ${d.nome}: R$${d.ultimo.toFixed(2)} (+${d.desvio.toFixed(0)}% vs média)`).join('\n')}`
          : `✅ Sem desvios de preço significativos`,
        ``,
        sugestoes.length > 0
          ? `🛒 *SUGESTÕES URGENTES (${sugestoes.length}):*\n${sugestoes.slice(0, 5).map(p => `  • ${p.nome} (${p.estoque_atual}/${p.estoque_minimo} ${p.unidade})`).join('\n')}`
          : `✅ Compras em dia`,
        ``,
        `📦 Produtos monitorados: *${rawProdutos.length}*`,
        ``,
        `_Gerado via Liz · Amore Gestão_`,
      ].filter(l => l !== undefined).join('\n')
      return linhas
    }

    if (waTipo === 'auditoria') {
      const prodsCriticos = rawProdutos.filter(p => p.estoque_minimo > 0 && p.estoque_atual <= p.estoque_minimo)
      const linhas = [
        `🤖 *LIZ — AUDITORIA DO DIA*`,
        `📅 ${hoje}`,
        `🏪 ${loja}`,
        `━━━━━━━━━━━━━━━`,
        ``,
        `📊 *RESUMO:*`,
        `  • Produtos cadastrados: *${rawProdutos.length}*`,
        `  • Produtos críticos: *${prodsCriticos.length}*`,
        `  • Itens zerados: *${zerados.length}*`,
        `  • Desvios de preço: *${desvios.length}*`,
        ``,
        emRisco.length > 0
          ? `⚠️ *AÇÃO NECESSÁRIA — Top 5:*\n${emRisco.slice(0, 5).map(p => `  • ${p.nome}`).join('\n')}`
          : `✅ Nenhuma ação imediata necessária`,
        ``,
        `_Gerado via Liz · Amore Gestão_`,
      ].join('\n')
      return linhas
    }

    // reuniao
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return [
      `🤖 *LIZ — CONVITE DE REUNIÃO*`,
      `📅 ${hoje}`,
      `🏪 ${loja}`,
      `━━━━━━━━━━━━━━━`,
      ``,
      `Olá! Precisamos alinhar pontos importantes da operação:`,
      ``,
      zerados.length > 0 ? `  🔴 ${zerados.length} item(ns) zerado(s) no estoque` : null,
      emRisco.length > 0 ? `  🟡 ${emRisco.length} produto(s) abaixo do mínimo` : null,
      desvios.length > 0 ? `  📈 ${desvios.length} desvio(s) de preço detectado(s)` : null,
      ``,
      `Por favor, confirme sua presença.`,
      `Horário atual: ${horaAtual}`,
      ``,
      `_Amore Gestão · ${loja}_`,
    ].filter(Boolean).join('\n')
  }

  const abrirWhatsApp = () => {
    const msg = waMsgCustom.trim() || gerarMensagemWA()
    const phone = waPhone.replace(/\D/g, '')
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  // ── Quick actions ─────────────────────────────────────────────
  const QUICK = [
    { label: '📦 Estoque crítico', q: 'Quais produtos estão em estoque crítico e o que devo fazer urgente?' },
    { label: '💰 Economia compras', q: 'Onde posso economizar nas próximas compras? Analise tendências de preço.' },
    { label: '🏭 Fornecedores', q: 'Avalie os fornecedores cadastrados. Quais têm melhor perfil e quais precisam de atenção?' },
    { label: '📋 Relatório gestão', q: 'Gere um relatório executivo completo da operação para apresentar à gestão.' },
    { label: '⚠️ Riscos semana', q: 'Quais são os principais riscos operacionais para essa semana?' },
  ]

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0 }}>

      {/* ── Header Liz ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -30, top: -30,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(167,139,250,0.15)',
        }} />
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, flexShrink: 0,
          boxShadow: '0 0 0 3px rgba(167,139,250,0.4)',
        }}>🤖</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 22, margin: 0 }}>Liz</h2>
            <span style={{
              background: contextReady ? '#22c55e' : '#f59e0b',
              color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 20,
            }}>
              {contextReady ? '● ONLINE' : '● CARREGANDO'}
            </span>
          </div>
          <div style={{ color: '#c4b5fd', fontSize: 13, marginTop: 2 }}>
            Agente Comercial Inteligente · Loja <strong style={{ color: '#e9d5ff' }}>{loja}</strong>
          </div>
          <div style={{ color: '#a78bfa', fontSize: 12, marginTop: 4 }}>
            Chat · Prospecção de fornecedores · Análise de mercado · Relatórios gerenciais
          </div>
        </div>
        <button
          onClick={() => setShowConfig(o => !o)}
          style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, padding: '8px 12px', color: '#e9d5ff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
          }}
        >
          <Settings2 size={14} /> Config
        </button>
      </div>

      {/* ── Config panel ── */}
      {showConfig && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key size={15} /> Chaves de API
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Gemini API Key (Chat / Insights)
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={e => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                Brave Search API Key (Prospecção)
              </label>
              <input
                type="password"
                value={braveKey}
                onChange={e => setBraveKey(e.target.value)}
                placeholder="BSAA..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--card)', borderRadius: 10, padding: 4, flexWrap: 'wrap' }}>
        {([
          { id: 'chat',        icon: <MessageSquare size={14} />, label: '💬 Chat' },
          { id: 'prospeccao',  icon: <Search size={14} />,        label: '🔍 Prospecção' },
          { id: 'inteligencia',icon: <Brain size={14} />,         label: '📊 Inteligência' },
          { id: 'compras-ia',  icon: <ShoppingCart size={14} />,  label: '🧠 Compras IA' },
          { id: 'whatsapp',    icon: <Phone size={14} />,         label: '📱 WhatsApp' },
        ] as { id: Tab; icon: React.ReactNode; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontWeight: tab === t.id ? 700 : 400, fontSize: 13,
              background: tab === t.id ? 'var(--bordo)' : 'transparent',
              color: tab === t.id ? '#fff' : 'var(--muted)',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════
          TAB: CHAT
      ══════════════════════════════════════════════════ */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 12 }}>

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {QUICK.map(q => (
              <button
                key={q.q}
                onClick={() => enviarMensagem(q.q)}
                disabled={chatLoading || !contextReady}
                style={{
                  padding: '6px 12px', borderRadius: 20, border: '1px solid var(--border)',
                  background: 'var(--card)', fontSize: 12, cursor: 'pointer',
                  color: 'var(--text)', transition: 'all .15s', whiteSpace: 'nowrap',
                  opacity: chatLoading ? 0.5 : 1,
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Chat messages */}
          <div style={{
            flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
            padding: '4px 0', minHeight: 300, maxHeight: 480,
          }}>
            {msgs.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 8, alignItems: 'flex-start',
                }}
              >
                {m.role === 'liz' && (
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0,
                  }}>🤖</div>
                )}
                <div style={{
                  maxWidth: '78%',
                  background: m.role === 'user'
                    ? 'var(--bordo)'
                    : 'var(--card)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.6,
                  border: m.role === 'liz' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.loading
                    ? <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        Pensando...
                      </span>
                    : m.text
                  }
                </div>
                {m.role === 'user' && (
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: 'var(--bordo)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {user?.initials || 'U'}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && enviarMensagem()}
              placeholder={contextReady ? 'Pergunte para a Liz...' : 'Carregando contexto...'}
              disabled={chatLoading || !contextReady}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 24,
                border: '1px solid var(--border)', background: 'var(--card)',
                fontSize: 13, outline: 'none',
              }}
            />
            <button
              onClick={() => enviarMensagem()}
              disabled={chatLoading || !input.trim() || !contextReady}
              style={{
                padding: '10px 18px', borderRadius: 24, border: 'none',
                background: chatLoading ? 'var(--border)' : 'var(--bordo)',
                color: '#fff', cursor: chatLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              }}
            >
              {chatLoading
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Send size={14} />
              }
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: PROSPECÇÃO
      ══════════════════════════════════════════════════ */}
      {tab === 'prospeccao' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={16} style={{ color: 'var(--bordo)' }} />
              Prospectar Novos Fornecedores
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Liz pesquisa na web e encontra distribuidoras e atacadistas para o produto/categoria informado.
              Os selecionados são cadastrados automaticamente nas <strong>3 lojas</strong>.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={buscaQuery}
                onChange={e => setBuscaQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarProspectos()}
                placeholder="Ex: carne bovina, frutos do mar, bebidas, embalagens..."
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg)',
                  fontSize: 13,
                }}
              />
              <button
                onClick={buscarProspectos}
                disabled={buscando || !buscaQuery.trim()}
                style={{
                  padding: '10px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--bordo)', color: '#fff',
                  cursor: buscando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                  opacity: buscando ? 0.7 : 1,
                }}
              >
                {buscando
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Search size={14} />
                }
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>

          {/* Results */}
          {prospectos.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {prospectos.length} fornecedores encontrados
                  {prospectos.filter(p => p.selecionado).length > 0 && (
                    <span style={{
                      marginLeft: 8, background: 'var(--bordo)', color: '#fff',
                      borderRadius: 20, padding: '2px 8px', fontSize: 12,
                    }}>
                      {prospectos.filter(p => p.selecionado).length} selecionados
                    </span>
                  )}
                </div>
                {prospectos.filter(p => p.selecionado).length > 0 && (
                  <button
                    onClick={registrarSelecionados}
                    disabled={registrando}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: '#16a34a', color: '#fff',
                      cursor: registrando ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {registrando
                      ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Plus size={14} />
                    }
                    Cadastrar nas 3 lojas
                  </button>
                )}
              </div>

              {registradoMsg && (
                <div style={{
                  background: '#dcfce7', border: '1px solid #86efac',
                  borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#166534',
                }}>
                  {registradoMsg}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {prospectos.map((p, i) => (
                  <div
                    key={i}
                    onClick={() => toggleProspecto(i)}
                    style={{
                      background: 'var(--card)', border: `2px solid ${p.selecionado ? 'var(--bordo)' : 'var(--border)'}`,
                      borderRadius: 10, padding: 14, cursor: 'pointer',
                      transition: 'all .15s',
                      boxShadow: p.selecionado ? '0 0 0 3px rgba(var(--bordo-rgb),0.15)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{p.nome}</div>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: p.selecionado ? 'var(--bordo)' : 'var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {p.selecionado && <CheckCircle size={12} color="#fff" />}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
                      {p.snippet}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {p.telefone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                          <Phone size={11} style={{ color: 'var(--bordo)' }} />
                          {p.telefone}
                        </div>
                      )}
                      {p.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                          <Mail size={11} style={{ color: 'var(--bordo)' }} />
                          {p.email}
                        </div>
                      )}
                      {p.cidade && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                          <MapPin size={11} style={{ color: 'var(--bordo)' }} />
                          {p.cidade}
                        </div>
                      )}
                      <a
                        href={p.site}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          fontSize: 11, color: 'var(--bordo)', marginTop: 4,
                          textDecoration: 'none',
                        }}
                      >
                        <Globe size={10} /> {new URL(p.site).hostname.replace('www.', '')}
                        <ExternalLink size={9} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!buscando && buscaErro && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: 10, padding: '14px 16px',
              fontSize: 13, color: '#991b1b', lineHeight: 1.6,
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Atenção:</strong> {buscaErro}
                <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>
                  💡 Dica: tente "frango atacado", "laticínios distribuidora", "carnes food service" para melhores resultados.
                </div>
              </div>
            </div>
          )}

          {!buscando && prospectos.length === 0 && buscaQuery && !buscaErro && (
            <div style={{
              textAlign: 'center', padding: 40, color: 'var(--muted)',
              fontSize: 14, border: '1px dashed var(--border)', borderRadius: 10,
            }}>
              Nenhum fornecedor encontrado para "{buscaQuery}". Tente termos mais genéricos.
            </div>
          )}

          {!buscaQuery && prospectos.length === 0 && (
            <div style={{
              textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14,
            }}>
              <Search size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>Informe um produto ou categoria para prospectar fornecedores</div>
              <div style={{ marginTop: 8, fontSize: 12 }}>Ex: "frango congelado", "embalagens descartáveis", "bebidas atacado"</div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: INTELIGÊNCIA
      ══════════════════════════════════════════════════ */}
      {tab === 'inteligencia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Brain size={16} style={{ color: 'var(--bordo)' }} />
                Inteligência de Gestão
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                Liz analisa todo o sistema e gera insights estratégicos como uma gestora experiente.
              </div>
            </div>
            <button
              onClick={gerarInsights}
              disabled={gerandoInsights}
              style={{
                padding: '10px 18px', borderRadius: 8, border: 'none',
                background: 'var(--bordo)', color: '#fff',
                cursor: gerandoInsights ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                opacity: gerandoInsights ? 0.7 : 1,
              }}
            >
              {gerandoInsights
                ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                : <Sparkles size={14} />
              }
              {gerandoInsights ? 'Analisando...' : 'Gerar Análise'}
            </button>
          </div>

          {gerandoInsights && (
            <div style={{
              textAlign: 'center', padding: 48, color: 'var(--muted)',
              fontSize: 14,
            }}>
              <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', opacity: 0.4, marginBottom: 12 }} />
              <div>Liz está analisando o sistema...</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Pode levar alguns segundos</div>
            </div>
          )}

          {insights.length > 0 && !gerandoInsights && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
              {insights.map((ins, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--card)',
                    border: `1px solid ${ins.cor}40`,
                    borderLeft: `4px solid ${ins.cor}`,
                    borderRadius: 10,
                    padding: 16,
                  }}
                >
                  <div style={{
                    fontWeight: 700, fontSize: 14, marginBottom: 10,
                    display: 'flex', alignItems: 'center', gap: 8,
                    color: ins.cor,
                  }}>
                    <span>{ins.emoji}</span>
                    {ins.titulo}
                  </div>
                  <div style={{
                    fontSize: 13, lineHeight: 1.65, color: 'var(--text)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {ins.corpo}
                  </div>
                </div>
              ))}
            </div>
          )}

          {insights.length === 0 && !gerandoInsights && (
            <div style={{
              textAlign: 'center', padding: 60, color: 'var(--muted)',
              fontSize: 14, border: '1px dashed var(--border)', borderRadius: 10,
            }}>
              <Brain size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Análise não gerada ainda</div>
              <div style={{ fontSize: 13 }}>
                Clique em <strong>"Gerar Análise"</strong> para que Liz produza insights gerenciais
                baseados nos dados reais do sistema.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: COMPRAS IA
      ══════════════════════════════════════════════════ */}
      {tab === 'compras-ia' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              { label: 'Desvios de Preço', val: comprasIaData.desvios.length, color: '#ef4444', icon: <TrendingUp size={18} /> },
              { label: 'Estoque em Risco', val: comprasIaData.emRisco.length,  color: '#f59e0b', icon: <AlertTriangle size={18} /> },
              { label: 'Estoque Zerado',   val: comprasIaData.zerados.length,  color: '#dc2626', icon: <PackageX size={18} /> },
              { label: 'Comprar Urgente',  val: comprasIaData.sugestoes.length,color: '#8b5cf6', icon: <ShoppingCart size={18} /> },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--card)', border: `1px solid ${k.color}30`, borderLeft: `3px solid ${k.color}`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.val}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{k.label}</div>
                </div>
                <div style={{ color: k.color, opacity: 0.5 }}>{k.icon}</div>
              </div>
            ))}
          </div>

          {/* Botão análise IA */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={gerarAnaliseComprasIA}
              disabled={comprasIaLoading}
              style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: comprasIaLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, opacity: comprasIaLoading ? 0.7 : 1 }}
            >
              {comprasIaLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Brain size={14} />}
              {comprasIaLoading ? 'Analisando...' : 'Gerar Análise IA'}
            </button>
          </div>

          {/* Análise IA */}
          {comprasIaAnalise && (
            <div style={{ background: 'var(--card)', border: '1px solid #7c3aed40', borderLeft: '4px solid #7c3aed', borderRadius: 10, padding: 16, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
              <div style={{ fontWeight: 700, color: '#7c3aed', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={14} /> Análise de Compras — Liz
              </div>
              {comprasIaAnalise}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Desvios de Preço */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
                <TrendingUp size={14} /> Desvios de Preço (&gt;10%)
              </div>
              {comprasIaData.desvios.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Nenhum desvio significativo</div>
                : comprasIaData.desvios.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < comprasIaData.desvios.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.nome}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>Média: R${d.media.toFixed(2)} · Último: R${d.ultimo.toFixed(2)}</div>
                    </div>
                    <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>+{d.desvio.toFixed(0)}%</span>
                  </div>
                ))
              }
            </div>

            {/* Estoque em Risco */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: '#f59e0b' }}>
                <AlertTriangle size={14} /> Estoque em Risco
              </div>
              {comprasIaData.emRisco.length === 0
                ? <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Estoque normalizado ✅</div>
                : comprasIaData.emRisco.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < comprasIaData.emRisco.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 11 }}>Mín: {p.estoque_minimo} {p.unidade}</div>
                    </div>
                    <span style={{ background: p.estoque_atual === 0 ? '#fee2e2' : '#fef3c7', color: p.estoque_atual === 0 ? '#dc2626' : '#d97706', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                      {p.estoque_atual === 0 ? 'ZERADO' : `${p.estoque_atual}`}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>

          {/* Sugestões de Compra */}
          {comprasIaData.sugestoes.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid #8b5cf640', borderLeft: '4px solid #8b5cf6', borderRadius: 10, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShoppingCart size={14} /> Comprar com Urgência — sem compra nos últimos 7 dias
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {comprasIaData.sugestoes.map((p, i) => (
                  <span key={i} style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 600 }}>
                    {p.nome} ({p.estoque_atual}/{p.estoque_minimo} {p.unidade})
                  </span>
                ))}
              </div>
            </div>
          )}

          {historicoPrecos.length === 0 && rawProdutos.length === 0 && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontSize: 14, border: '1px dashed var(--border)', borderRadius: 10 }}>
              <TrendingDown size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
              <div>Nenhum dado de compras encontrado para {loja}</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Registre compras na Lista Padronizada para ativar a análise</div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          TAB: WHATSAPP
      ══════════════════════════════════════════════════ */}
      {tab === 'whatsapp' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #065f46 0%, #064e3b 100%)',
            borderRadius: 10, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 14, color: '#fff',
          }}>
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>📱</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Liz — Envio via WhatsApp</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
                Gere alertas, relatórios e convites diretamente no WhatsApp — sem API externa
              </div>
            </div>
          </div>

          {/* Phone config + tipo */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={14} style={{ color: '#25D366' }} /> Configuração
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Número do destinatário (opcional)
                </label>
                <input
                  value={waPhone}
                  onChange={e => setWaPhone(e.target.value)}
                  placeholder="55819XXXXXXXX (com DDI)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Se vazio, abre o WhatsApp Web para escolher o contato
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                  Tipo de mensagem
                </label>
                <select
                  value={waTipo}
                  onChange={e => { setWaTipo(e.target.value as WaTipo); setWaMsgCustom('') }}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}
                >
                  <option value="estoque">🔴 Alerta de Estoque</option>
                  <option value="compras">🛒 Relatório de Compras</option>
                  <option value="auditoria">📊 Auditoria do Dia</option>
                  <option value="reuniao">📅 Convocar Reunião</option>
                </select>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 16,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Pré-visualização da mensagem</span>
              <button
                onClick={() => setWaMsgCustom(gerarMensagemWA())}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg)', fontSize: 12, cursor: 'pointer', color: 'var(--muted)',
                }}
              >
                ↺ Regenerar
              </button>
            </div>
            <textarea
              value={waMsgCustom || gerarMensagemWA()}
              onChange={e => setWaMsgCustom(e.target.value)}
              rows={14}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: '#f0fdf4',
                fontSize: 12, fontFamily: 'monospace', lineHeight: 1.6,
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              Você pode editar a mensagem antes de enviar. As alterações não afetam os dados do sistema.
            </div>
          </div>

          {/* Templates rápidos */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 10, padding: 14,
          }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Envios rápidos por tipo</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {([
                { tipo: 'estoque' as WaTipo,   emoji: '🔴', label: 'Alerta Estoque',   color: '#ef4444', badge: comprasIaData.zerados.length + comprasIaData.emRisco.length },
                { tipo: 'compras' as WaTipo,   emoji: '🛒', label: 'Rel. Compras',     color: '#f59e0b', badge: comprasIaData.desvios.length },
                { tipo: 'auditoria' as WaTipo, emoji: '📊', label: 'Auditoria Dia',    color: '#3b82f6', badge: 0 },
                { tipo: 'reuniao' as WaTipo,   emoji: '📅', label: 'Reunião',           color: '#8b5cf6', badge: 0 },
              ]).map(t => (
                <button
                  key={t.tipo}
                  onClick={() => { setWaTipo(t.tipo); setWaMsgCustom('') }}
                  style={{
                    padding: '10px 8px', borderRadius: 8,
                    border: `2px solid ${waTipo === t.tipo ? t.color : 'var(--border)'}`,
                    background: waTipo === t.tipo ? `${t.color}15` : 'var(--bg)',
                    cursor: 'pointer', fontSize: 12, fontWeight: waTipo === t.tipo ? 700 : 400,
                    color: waTipo === t.tipo ? t.color : 'var(--muted)',
                    textAlign: 'center', position: 'relative',
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{t.emoji}</div>
                  {t.label}
                  {t.badge > 0 && (
                    <span style={{
                      position: 'absolute', top: 4, right: 4,
                      background: t.color, color: '#fff',
                      borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                    }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Botão enviar */}
          <button
            onClick={abrirWhatsApp}
            style={{
              padding: '14px', borderRadius: 10, border: 'none',
              background: '#25D366', color: '#fff',
              cursor: 'pointer', fontSize: 15, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <Phone size={18} />
            {waPhone ? `Enviar via WhatsApp para +${waPhone.replace(/\D/g, '')}` : 'Abrir WhatsApp Web'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}
