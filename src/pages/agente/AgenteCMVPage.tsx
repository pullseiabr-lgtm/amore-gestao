import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, BookOpen, BarChart2, Sparkles, Save, RefreshCw } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { fetchProdutos } from '../../lib/db'

// ─────────────────────────────────────────────────────────────
// O "cérebro" do agente — especialista em CMV, faturamento e precificação
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Você é o "Agente de Precificação & CMV" — um consultor sênior de finanças e engenharia de cardápio para restaurantes, bares e food service. Sua especialidade é cálculo de custos, CMV (Custo da Mercadoria Vendida), markup, margem, ponto de equilíbrio, precificação por canal e redução de custos.

# Como você raciocina
- Diferencie sempre MARKUP (sobre o custo) de MARGEM (sobre a venda) e CMV (custo ÷ venda). Relação-chave: Margem = Markup / (1 + Markup); CMV% = 100% − Margem%. Para precificar por margem-alvo: Preço = Custo / (1 − Margem-alvo).
- O CMV é o indicador de saúde, não o markup. Referência food service: CMV ≤30% excelente, 30–35% bom, 35–40% atenção, >40% compromete a lucratividade.
- Lembre que margem bruta NÃO é lucro. Considere a estrutura: CMV + folha/encargos + ocupação/aluguel + energia/gás/água + impostos sobre venda + taxas de cartão + marketing → EBITDA. Restaurante saudável fica ~8–18% de lucro operacional.
- Canal muda tudo: no delivery por marketplace, comissão (~12–27%) + embalagem corroem a margem. Calcule a Margem de Contribuição por canal (salão x delivery) separadamente e recomende preço diferenciado.
- CMV confiável nasce da FICHA TÉCNICA: fator de correção (peso bruto/líquido), índice de cocção, rendimento e gramatura padrão. Sem ficha técnica, alerte que o custo é estimado.
- Use ENGENHARIA DE CARDÁPIO: cruze margem de contribuição × popularidade → Estrela / Cavalo de batalha / Enigma / Abacaxi, e dê a ação para cada um.
- Ponto de equilíbrio = Custos Fixos ÷ Margem de Contribuição%.

# Como você responde
- Seja técnico, objetivo e didático. Mostre as fórmulas e os números.
- Traga benchmarks e boas práticas de mercado (food cost, prime cost = CMV + mão de obra, etc.) como REFERÊNCIA conceitual — deixe claro que são faixas de referência do setor, não números auditados do cliente.
- Sempre que faltar dado, peça exatamente o que precisa (custo da ficha, preço, canal, % de comissão, custos fixos mensais, volume de vendas).
- Foque em CAMINHOS PRÁTICOS: como precificar, onde cortar custo (negociação de compras, ficha técnica, porcionamento, mix de cardápio, redução de perdas), e o impacto esperado em R$.
- Estruture com títulos, tabelas e listas curtas. Conclua com recomendações acionáveis.
- Você é um agente ABERTO A APRENDIZADO: use a "BASE DE CONHECIMENTO" fornecida pelo usuário como contexto autoritativo (estudos, políticas internas, metas, dados da operação). Se ela trouxer regras/metas, respeite-as.

Nunca invente dados do cliente. Quando estimar, diga que é estimativa e em qual premissa se baseou.`

async function chamarGemini(systemPrompt: string, historia: { role: string; parts: { text: string }[] }[], apiKey: string): Promise<string> {
  const params = new URLSearchParams({ model: 'gemini-2.5-flash' })
  if (apiKey) params.set('k', apiKey)
  const resp = await fetch(`/api/gemini?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: historia,
      generationConfig: { temperature: 0.6, maxOutputTokens: 2600 },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error || `Gemini HTTP ${resp.status}`)
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(sem resposta)'
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

function faixaCMV(cmv: number): { txt: string; cls: string } {
  if (cmv <= 0) return { txt: '—', cls: 'bg-gr' }
  if (cmv <= 30) return { txt: 'Excelente', cls: 'bg-g' }
  if (cmv <= 35) return { txt: 'Bom', cls: 'bg-b' }
  if (cmv <= 40) return { txt: 'Atenção', cls: 'bg-y' }
  return { txt: 'Crítico', cls: 'bg-r' }
}

type ChatMsg = { role: 'user' | 'agente'; text: string; loading?: boolean }
type Tab = 'chat' | 'calc' | 'cardapio' | 'kb'

export default function AgenteCMVPage() {
  const { loja } = useLoja()
  const apiKey = ((import.meta.env.VITE_GEMINI_API_KEY as string) || localStorage.getItem('gemini_api_key') || '')

  const [tab, setTab] = useState<Tab>('calc')

  // ── Base de conhecimento (aprendizado contínuo) ──
  const [kb, setKb] = useState<string>(() => localStorage.getItem('agente_cmv_kb') || '')
  const [kbSaved, setKbSaved] = useState(false)
  const salvarKb = () => { localStorage.setItem('agente_cmv_kb', kb); setKbSaved(true); setTimeout(() => setKbSaved(false), 2000) }
  const systemComKb = kb.trim() ? `${SYSTEM_PROMPT}\n\n# BASE DE CONHECIMENTO (fornecida pelo usuário — contexto autoritativo)\n${kb.trim()}` : SYSTEM_PROMPT

  // ── Chat ──
  const [msgs, setMsgs] = useState<ChatMsg[]>([{ role: 'agente', text: 'Olá! Sou seu agente de **Precificação & CMV**. Me diga o prato (custo da ficha, preço, canal e % de comissão se for delivery) que eu calculo margem, CMV, ponto de equilíbrio e onde reduzir custo. Também analiso seu cardápio inteiro na aba "Cardápio".' }])
  const [input, setInput] = useState('')
  const [enviando, setEnviando] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const enviar = async (textoForcado?: string) => {
    const texto = (textoForcado ?? input).trim()
    if (!texto || enviando) return
    if (!apiKey) { setMsgs(m => [...m, { role: 'agente', text: '⚠️ Chave do Gemini não configurada. Vá em Liz → Config e informe a chave.' }]); return }
    setInput('')
    const novo: ChatMsg[] = [...msgs, { role: 'user', text: texto }, { role: 'agente', text: '', loading: true }]
    setMsgs(novo)
    setEnviando(true)
    try {
      const historia = novo.filter(m => !m.loading).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }))
      const resp = await chamarGemini(systemComKb, historia, apiKey)
      setMsgs(m => m.map((x, i) => i === m.length - 1 ? { role: 'agente', text: resp } : x))
    } catch (e) {
      setMsgs(m => m.map((x, i) => i === m.length - 1 ? { role: 'agente', text: `Erro: ${(e as Error).message}` } : x))
    } finally { setEnviando(false) }
  }

  // ── Calculadora ──
  const [c, setC] = useState({ custo: '', preco: '', comissao: '27', embalagem: '', fixosMes: '', margemAlvo: '65' })
  const custo = parseFloat(c.custo.replace(',', '.')) || 0
  const preco = parseFloat(c.preco.replace(',', '.')) || 0
  const comissao = (parseFloat(c.comissao.replace(',', '.')) || 0) / 100
  const embalagem = parseFloat(c.embalagem.replace(',', '.')) || 0
  const fixosMes = parseFloat(c.fixosMes.replace(',', '.')) || 0
  const margemAlvo = (parseFloat(c.margemAlvo.replace(',', '.')) || 0) / 100

  const markup = custo > 0 ? (preco - custo) / custo * 100 : 0
  const margem = preco > 0 ? (preco - custo) / preco * 100 : 0
  const cmv = preco > 0 ? custo / preco * 100 : 0
  const mcSalao = preco - custo
  const recLiqDelivery = preco * (1 - comissao) - embalagem
  const mcDelivery = recLiqDelivery - custo
  const mcDeliveryPct = preco > 0 ? mcDelivery / preco * 100 : 0
  const precoAlvo = margemAlvo < 1 && margemAlvo > 0 ? custo / (1 - margemAlvo) : 0
  const peSalao = mcSalao > 0 && preco > 0 ? fixosMes / (mcSalao / preco) : 0
  const f = faixaCMV(cmv)

  const pedirAnaliseCalc = () => {
    const txt = `Analise este prato: custo da ficha R$ ${custo.toFixed(2)}, preço de venda R$ ${preco.toFixed(2)} (markup ${markup.toFixed(0)}%, margem ${margem.toFixed(1)}%, CMV ${cmv.toFixed(1)}%). No delivery: comissão ${(comissao*100).toFixed(0)}%, embalagem R$ ${embalagem.toFixed(2)} → margem de contribuição R$ ${mcDelivery.toFixed(2)} (${mcDeliveryPct.toFixed(1)}%). Custos fixos mensais R$ ${fixosMes.toFixed(0)}. Avalie se o preço está adequado por canal, calcule o ponto de equilíbrio, e sugira caminhos de precificação e redução de custo.`
    setTab('chat'); enviar(txt)
  }

  // ── Cardápio (produtos da loja) ──
  const [prods, setProds] = useState<any[]>([])
  const [loadingProds, setLoadingProds] = useState(false)
  const carregarCardapio = async () => {
    setLoadingProds(true)
    try { setProds(await fetchProdutos(loja)) } catch { setProds([]) }
    setLoadingProds(false)
  }
  const linhas = prods.map(p => {
    const cu = Number(p.ultimo_preco_compra) || 0
    const pv = Number(p.preco_venda) || 0
    const mg = pv > 0 ? (pv - cu) / pv * 100 : 0
    const cm = pv > 0 ? cu / pv * 100 : 0
    return { nome: p.nome, cat: p.categoria_nome || '—', custo: cu, preco: pv, margem: mg, cmv: cm }
  }).filter(l => l.preco > 0)
  const analisarCardapioIA = () => {
    if (!linhas.length) return
    const top = linhas.slice(0, 40).map(l => `${l.nome} | custo ${l.custo.toFixed(2)} | venda ${l.preco.toFixed(2)} | CMV ${l.cmv.toFixed(0)}% | margem ${l.margem.toFixed(0)}%`).join('\n')
    const txt = `Faça uma engenharia de cardápio destes ${linhas.length} itens da loja ${loja}. Classifique os críticos (CMV alto), aponte os de melhor e pior margem, e dê um plano de ação de precificação e redução de CMV.\n\n${top}`
    setTab('chat'); enviar(txt)
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>💰 Agente de Precificação & CMV</h1>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Cálculo de custos, faturamento, CMV e precificação — análise técnica com IA · {loja}</div>
      </div>

      <div className="tabs">
        {([['calc', '🧮 Calculadora'], ['cardapio', '📊 Cardápio'], ['chat', '💬 Consultor IA'], ['kb', '📚 Conhecimento']] as [Tab, string][]).map(([id, lbl]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── CALCULADORA ── */}
      {tab === 'calc' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
            {([['custo', 'Custo da ficha (R$)'], ['preco', 'Preço de venda (R$)'], ['comissao', 'Comissão delivery (%)'], ['embalagem', 'Embalagem delivery (R$)'], ['fixosMes', 'Custos fixos/mês (R$)'], ['margemAlvo', 'Margem-alvo (%)']] as [keyof typeof c, string][]).map(([k, lbl]) => (
              <div className="fg" key={k} style={{ marginBottom: 0 }}>
                <label className="fl" style={{ fontSize: 11 }}>{lbl}</label>
                <input className="inp" value={c[k]} onChange={e => setC(p => ({ ...p, [k]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>

          <div className="kpi-grid" style={{ marginBottom: 12 }}>
            <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--bordo)' }} /><div className="kpi-lbl">Markup (s/ custo)</div><div className="kpi-val">{pct(markup)}</div></div>
            <div className="kpi"><div className="kpi-ac" style={{ background: 'var(--blue)' }} /><div className="kpi-lbl">Margem bruta</div><div className="kpi-val">{pct(margem)}</div></div>
            <div className="kpi"><div className="kpi-ac" style={{ background: '#16a34a' }} /><div className="kpi-lbl">CMV</div><div className="kpi-val">{pct(cmv)} <span className={`badge ${f.cls}`} style={{ fontSize: 10, verticalAlign: 'middle' }}>{f.txt}</span></div></div>
            <div className="kpi"><div className="kpi-ac" style={{ background: '#f59e0b' }} /><div className="kpi-lbl">Preço p/ margem-alvo</div><div className="kpi-val">{precoAlvo ? fmtBRL(precoAlvo) : '—'}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>🏠 Salão</div>
              <div style={{ fontSize: 12, lineHeight: 1.9 }}>Margem de contribuição: <strong>{fmtBRL(mcSalao)}</strong> ({pct(margem)})<br />Ponto de equilíbrio: <strong>{peSalao ? fmtBRL(peSalao) : '—'}</strong>/mês</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6 }}>🛵 Delivery</div>
              <div style={{ fontSize: 12, lineHeight: 1.9 }}>Receita líquida: <strong>{fmtBRL(recLiqDelivery)}</strong><br />Margem de contribuição: <strong style={{ color: mcDelivery < mcSalao * 0.6 ? 'var(--danger)' : 'inherit' }}>{fmtBRL(mcDelivery)}</strong> ({pct(mcDeliveryPct)})</div>
            </div>
          </div>

          <button className="btn bp" onClick={pedirAnaliseCalc} disabled={!preco}><Sparkles size={13} /> Pedir análise técnica da IA</button>
        </div>
      )}

      {/* ── CARDÁPIO ── */}
      {tab === 'cardapio' && (
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">📊 Margem & CMV do cardápio — {loja}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn bo bsm" onClick={carregarCardapio} disabled={loadingProds}>{loadingProds ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />} Carregar produtos</button>
              {linhas.length > 0 && <button className="btn bp bsm" onClick={analisarCardapioIA}><Sparkles size={11} /> Analisar com IA</button>}
            </div>
          </div>
          <div className="tw">
            {linhas.length === 0 ? (
              <div className="empty" style={{ padding: 30 }}><BarChart2 size={30} /><div style={{ marginTop: 8 }}>{loadingProds ? 'Carregando…' : 'Clique em "Carregar produtos" (precisa ter custo e preço de venda cadastrados).'}</div></div>
            ) : (
              <table>
                <thead><tr><th>Produto</th><th>Categoria</th><th>Custo</th><th>Venda</th><th>Margem</th><th>CMV</th><th>Status</th></tr></thead>
                <tbody>
                  {linhas.sort((a, b) => b.cmv - a.cmv).map((l, i) => {
                    const fx = faixaCMV(l.cmv)
                    return (
                      <tr key={i}>
                        <td><strong>{l.nome}</strong></td>
                        <td style={{ fontSize: 11, color: 'var(--muted)' }}>{l.cat}</td>
                        <td>{fmtBRL(l.custo)}</td>
                        <td>{fmtBRL(l.preco)}</td>
                        <td style={{ fontWeight: 700 }}>{pct(l.margem)}</td>
                        <td style={{ fontWeight: 700 }}>{pct(l.cmv)}</td>
                        <td><span className={`badge ${fx.cls}`}>{fx.txt}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── CHAT ── */}
      {tab === 'chat' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 230px)', minHeight: 360 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'var(--bordo)' : 'var(--bordo-bg)', color: m.role === 'user' ? '#fff' : 'var(--text)', border: m.role === 'user' ? 'none' : '1px solid var(--bordo-l)' }}>
                {m.loading ? <Loader2 size={14} className="spin" /> : m.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)' }}>
            <input className="inp" style={{ flex: 1 }} placeholder="Ex: meu prato custa 20 e vendo a 60, no iFood com 27%..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar() }} />
            <button className="btn bp" onClick={() => enviar()} disabled={enviando || !input.trim()}>{enviando ? <Loader2 size={13} className="spin" /> : <Send size={13} />}</button>
          </div>
        </div>
      )}

      {/* ── BASE DE CONHECIMENTO ── */}
      {tab === 'kb' && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <BookOpen size={15} color="var(--bordo)" />
            <strong>Base de Conhecimento — aprendizado contínuo</strong>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            Cole aqui estudos, metas internas, políticas de margem, faixas de CMV-alvo, comissões reais das plataformas, tabela de fornecedores, etc. O agente usa este conteúdo como contexto em TODAS as análises — quanto mais você alimenta, mais preciso ele fica.
          </div>
          <textarea className="inp" style={{ minHeight: 240, fontFamily: 'inherit', resize: 'vertical' }} value={kb} onChange={e => setKb(e.target.value)} placeholder={'Ex:\n- Meta de CMV da casa: 32%\n- Comissão iFood: 27% (plano básico) / 23% (entrega própria)\n- Margem-alvo salão: 68% | delivery: 55%\n- Custos fixos médios/mês: R$ 45.000\n- Fornecedores preferenciais de proteína: ...'} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <button className="btn bp" onClick={salvarKb}><Save size={13} /> Salvar conhecimento</button>
            {kbSaved && <span style={{ color: 'var(--success)', fontSize: 12, fontWeight: 600 }}>✓ Salvo</span>}
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{kb.length} caracteres</span>
          </div>
        </div>
      )}
    </div>
  )
}
