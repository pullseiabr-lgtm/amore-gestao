import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send, Search, Plus, Sparkles, Key,
  Phone, Mail, MapPin, CheckCircle,
  Loader2,
  MessageSquare, Settings2, ExternalLink,
  Globe, Brain, Target,
} from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchFornecedores,
  insertFornecedor,
  fetchProdutos,
  fetchComprasListas,
  fetchRequisicoes,
} from '../../lib/db'

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

type Tab = 'chat' | 'prospeccao' | 'inteligencia'

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

async function buscarFornecedores(query: string, braveKey: string): Promise<BraveResult[]> {
  const q = `fornecedor distribuidora atacado ${query} contato telefone CNPJ`
  const params = new URLSearchParams({ q })
  if (braveKey) params.set('t', braveKey)
  const r = await fetch(`/api/brave-search?${params}`)
  const data = await r.json()
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
  return data?.web?.results || []
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

  // Inteligência
  const [insights, setInsights] = useState<InsightBlock[]>([])
  const [gerandoInsights, setGerandoInsights] = useState(false)

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  // Save keys — mesma key do ComprasAgentePage para compartilhar
  useEffect(() => {
    if (geminiKey) localStorage.setItem('gemini_api_key', geminiKey)
    if (braveKey)  localStorage.setItem('brave_api_key',  braveKey)
  }, [geminiKey, braveKey])

  // Load system context on mount
  const loadContext = useCallback(async () => {
    try {
      const [fornecedores, produtos, comprasListas, requisicoes] = await Promise.all([
        fetchFornecedores(loja).catch(() => []),
        fetchProdutos(loja).catch(() => []),
        fetchComprasListas(loja).catch(() => []),
        fetchRequisicoes(loja).catch(() => []),
      ])

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
        text: `Olá, ${user?.name?.split(' ')[0] || 'Gestor'}! Sou a **Liz**, sua assistente comercial inteligente. 🤖\n\nJá carreguei o contexto da loja **${loja}** — ${estoqueCritico.length} itens críticos, ${fornecedores.length} fornecedores, ${reqPendentes.length} requisições pendentes.\n\nPosso analisar o sistema, prosperar fornecedores, identificar oportunidades e gerar relatórios. Como posso ajudar?`,
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
- Prosperar novos fornecedores via pesquisa de mercado

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
    try {
      const results = await buscarFornecedores(buscaQuery, braveKey)
      const prospects = results
        .filter(r => r.url && !r.url.includes('mercadolivre') && !r.url.includes('amazon'))
        .slice(0, 8)
        .map(r => prospectFromResult(r, buscaQuery))
      setProspectos(prospects)
    } catch (e: any) {
      setProspectos([])
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--card)', borderRadius: 10, padding: 4 }}>
        {([
          { id: 'chat',        icon: <MessageSquare size={14} />, label: '💬 Chat com Liz' },
          { id: 'prospeccao',  icon: <Search size={14} />,        label: '🔍 Prospecção' },
          { id: 'inteligencia',icon: <Brain size={14} />,         label: '📊 Inteligência' },
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

          {!buscando && prospectos.length === 0 && buscaQuery && (
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: .5; } 50% { opacity: 1; } }
      `}</style>
    </div>
  )
}
