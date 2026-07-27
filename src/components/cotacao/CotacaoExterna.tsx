import { useState, useEffect, useCallback } from 'react'
import { Link2, Send, Copy, RefreshCw, Ban, CheckCircle2, Loader2, Users, Package } from 'lucide-react'
import { fetchFornecedores, fetchRequisicaoItens, fetchCotacaoTokens, saveCotacaoToken, gerarTokenCotacao, insertRequisicaoCotacao, fetchRequisicaoCotacoes, updateRequisicaoItem, type CotacaoToken } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import type { Requisicao, Fornecedor, RequisicaoItem } from '../../types/database'

const soDig = (s?: string | null) => (s || '').replace(/\D/g, '')
const fmtDT = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
const norm = (s?: string | null) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Palavras-chave por categoria de item → casa com as "categorias atendidas" do fornecedor
// (robusto a acento/plural: procura qualquer palavra-chave dentro da string do fornecedor).
const CAT_KEYWORDS: Record<string, string[]> = {
  Pescados: ['pescado', 'peixe', 'fruto do mar', 'frutos do mar', 'salmao', 'tilapia', 'camarao', 'lagosta', 'linguado', 'mar'],
  Carne: ['carne', 'bovino', 'suino', 'charque', 'bacon', 'embutido', 'defumado', 'proteina animal', 'calabresa', 'presunto', 'linguica'],
  Frango: ['frango', 'ave', 'proteina de frango'],
  Laticinios: ['latic', 'lactic', 'queijo', 'leite', 'frios', 'requeijao', 'manteiga', 'mussarela', 'coalho', 'parmesao'],
  Mercearia: ['mercearia', 'cereais', 'graos', 'grao', 'secos', 'insumo'],
  Bebidas: ['bebida', 'refrigerante', 'suco', 'agua', 'cerveja'],
  Congelados: ['congelado', 'sorvete', 'acai', 'petit'],
  Limpeza: ['limpeza', 'higiene', 'saneante'],
  Descartaveis: ['descartav', 'embala', 'copo', 'papel', 'guardanapo', 'saco', 'kraft', 'isopor', 'pote'],
  Polpas: ['polpa'],
  Hortifruti: ['hortifrut', 'verdura', 'fruta', 'legume'],
  Padaria: ['pao', 'confeitaria', 'panificacao', 'biscoito', 'doce'],
}
function fornAtendeItem(fornCategorias: string, itemCat?: string | null): boolean {
  if (!itemCat) return false
  const fc = norm(fornCategorias)
  if (!fc.trim()) return false
  const kws = CAT_KEYWORDS[itemCat] || [norm(itemCat)]
  return kws.some(k => fc.includes(k))
}

const STA: Record<string, { l: string; c: string; bg: string }> = {
  enviado: { l: 'Enviado', c: '#0369A1', bg: '#E0F2FE' },
  aberto: { l: 'Abriu o link', c: '#B45309', bg: '#FEF3C7' },
  respondido: { l: 'Respondeu ✓', c: '#15803D', bg: '#DCFCE7' },
  bloqueado: { l: 'Bloqueado', c: '#B91C1C', bg: '#FEE2E2' },
  cancelado: { l: 'Cancelado', c: '#6B7280', bg: '#F3F4F6' },
}

export default function CotacaoExterna({ req, userName, toast }: { req: Requisicao; userName: string; toast: (m: string, t?: any) => void }) {
  const [forns, setForns] = useState<Fornecedor[]>([])
  const [tokens, setTokens] = useState<CotacaoToken[]>([])
  const [itens, setItens] = useState<RequisicaoItem[]>([])
  const [selForn, setSelForn] = useState<string>('')
  const [selItens, setSelItens] = useState<Set<string>>(new Set())
  const [buscaForn, setBuscaForn] = useState('')
  const [buscaItem, setBuscaItem] = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [prazo, setPrazo] = useState('')
  const [validadeDias, setValidadeDias] = useState('7')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [aberto, setAberto] = useState(true)
  const [manualFone, setManualFone] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [f, t, it] = await Promise.all([
      fetchFornecedores(req.loja).catch(() => []),
      fetchCotacaoTokens(req.id).catch(() => []),
      fetchRequisicaoItens(req.id).catch(() => []),
    ])
    setForns(f.filter(x => x.ativo !== false)); setTokens(t); setItens(it)
    setLoading(false)
  }, [req.id, req.loja])
  useEffect(() => { load() }, [load])

  const jaConvidado = (nome: string) => tokens.some(t => t.fornecedor_nome === nome && t.status !== 'cancelado')
  const fornSel = forns.find(f => f.id === selForn)

  // ao escolher o fornecedor, pré-seleciona itens cuja categoria bate com as categorias atendidas
  // (é só uma sugestão — o comprador pode marcar/desmarcar tudo manualmente no Passo 2)
  useEffect(() => {
    if (!selForn) { setSelItens(new Set()); return }
    const f = forns.find(x => x.id === selForn)
    setSelItens(new Set(itens.filter(i => fornAtendeItem(f?.categorias || '', i.categoria)).map(i => i.id)))
  }, [selForn]) // eslint-disable-line react-hooks/exhaustive-deps

  const linkDe = (tok: string) => `${window.location.origin}/cotacao.html?t=${tok}`
  const msgWhats = (forn: { nome: string }, link: string, nItens: number) => {
    const prazoTxt = prazo ? `⏰ Prazo para resposta: ${new Date(prazo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''
    return `Olá, ${forn.nome}! 👋\n\nA Amore ${req.loja} está com uma *cotação* e gostaria do seu melhor preço em ${nItens} item(ns).\n\n📋 Cotação Nº ${req.numero} — ${req.titulo}\n${prazoTxt}\n\nÉ rápido e seguro, direto pelo link exclusivo do seu cadastro (você vê só os produtos direcionados a você):\n${link}\n\n${userName} — Compras Amore`
  }

  const cats = Array.from(new Set(itens.map(i => i.categoria).filter(Boolean))) as string[]
  const itensFiltrados = itens.filter(i =>
    (!buscaItem || i.produto_nome.toLowerCase().includes(buscaItem.toLowerCase())) &&
    (!catFiltro || i.categoria === catFiltro))

  const gerarParaFornecedor = async (foneManual?: string) => {
    if (!fornSel) { toast('Escolha um fornecedor.'); return }
    if (selItens.size === 0) { toast('Marque ao menos 1 produto para este fornecedor.', 'error'); return }
    setBusy(true)
    try {
      const cots = await fetchRequisicaoCotacoes(req.id).catch(() => [])
      let cot = cots.find(c => c.fornecedor_nome === fornSel.nome)
      if (!cot) cot = await insertRequisicaoCotacao({ requisicao_id: req.id, fornecedor_nome: fornSel.nome, status: 'enviada', total: null, prazo_entrega: null, observacoes: null } as never)
      const token = gerarTokenCotacao()
      const agora = new Date().toISOString()
      const tk: CotacaoToken = {
        token, requisicao_id: req.id, cotacao_id: cot.id, fornecedor_id: fornSel.id, fornecedor_nome: fornSel.nome,
        loja: req.loja, numero: req.numero, titulo: req.titulo, item_ids: [...selItens],
        prazo_resposta: prazo ? new Date(prazo).toISOString() : null,
        validade: validadeDias ? new Date(Date.now() + Number(validadeDias) * 86400000).toISOString() : null,
        status: 'enviado', criado_por: userName, criado_em: agora, enviado_em: agora, acessos: 0, resposta: null,
      }
      await saveCotacaoToken(tk)
      const fone = soDig(foneManual) || soDig(fornSel.whatsapp) || soDig(fornSel.telefone)
      if (fone) { const ok = await enviarWhatsApp(fone, msgWhats(fornSel, linkDe(token), selItens.size)); toast(ok ? `Enviado para ${fornSel.nome} (${selItens.size} itens). ✅` : 'Link gerado, mas o WhatsApp falhou — copie o link no rastreio.', ok ? undefined : 'error') }
      else toast(`Link gerado para ${fornSel.nome} (${selItens.size} itens). Sem WhatsApp — copie/digite o número no rastreio.`)
      setSelForn(''); setSelItens(new Set()); setBuscaForn(''); setBuscaItem(''); setCatFiltro(''); await load()
    } catch (e) { toast('Erro: ' + (e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  const reenviar = async (t: CotacaoToken, foneManual?: string) => {
    const f = forns.find(x => x.id === t.fornecedor_id) || forns.find(x => x.nome === t.fornecedor_nome)
    const fone = soDig(foneManual) || soDig(f?.whatsapp) || soDig(f?.telefone)
    if (!fone) { toast('Fornecedor sem WhatsApp — digite o número ou copie o link.'); return }
    const ok = await enviarWhatsApp(fone, msgWhats({ nome: t.fornecedor_nome }, linkDe(t.token), (t.item_ids || itens.map(i => i.id)).length))
    if (ok) { await saveCotacaoToken({ ...t, enviado_em: new Date().toISOString() }); toast('Enviado ✅'); setManualFone(m => ({ ...m, [t.token]: '' })); load() }
    else toast('Falha ao enviar.', 'error')
  }
  const cancelar = async (t: CotacaoToken) => {
    if (!window.confirm(`Cancelar o link de ${t.fornecedor_nome}? O link para de funcionar imediatamente.`)) return
    await saveCotacaoToken({ ...t, status: 'cancelado' }); toast('Link cancelado.'); load()
  }
  const copiar = (t: CotacaoToken) => { navigator.clipboard?.writeText(linkDe(t.token)); toast('Link copiado.') }
  const mudarCategoria = async (itemId: string, cat: string) => {
    setItens(list => list.map(i => i.id === itemId ? { ...i, categoria: cat || null } : i))
    try { await updateRequisicaoItem(itemId, { categoria: cat || null }) } catch { toast('Não foi possível salvar a categoria.', 'error') }
  }
  const CATS = Object.keys(CAT_KEYWORDS)

  // cobertura: quais itens já foram para algum fornecedor
  const cobertos = new Set<string>()
  tokens.filter(t => t.status !== 'cancelado').forEach(t => (t.item_ids && t.item_ids.length ? t.item_ids : itens.map(i => i.id)).forEach(id => cobertos.add(id)))
  const semForn = itens.filter(i => !cobertos.has(i.id))
  const respondidos = tokens.filter(t => t.status === 'respondido').length

  const box: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }

  return (
    <div style={box}>
      <div onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Link2 size={19} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>🔗 Distribuição inteligente de cotação</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tokens.filter(t => t.status !== 'cancelado').length} fornecedor(es) · {respondidos} respondeu(ram) · cada um recebe só os itens dele{semForn.length ? ` · ${semForn.length} item(ns) sem fornecedor` : ''}</div>
        </div>
        <span style={{ fontSize: 20, color: 'var(--muted)' }}>{aberto ? '▾' : '▸'}</span>
      </div>

      {aberto && (loading ? <div style={{ padding: 20, textAlign: 'center' }}><Loader2 className="spin" size={20} /></div> : <div style={{ marginTop: 14 }}>
        {/* prazos */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Prazo para resposta<br /><input type="datetime-local" value={prazo} onChange={e => setPrazo(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Link expira em (dias)<br /><input type="number" min={1} value={validadeDias} onChange={e => setValidadeDias(e.target.value)} style={{ ...inp, width: 90, marginTop: 4 }} /></label>
        </div>

        {/* PASSO 1 — fornecedor */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Users size={15} /> Passo 1 — escolha o fornecedor <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({forns.length} na loja {req.loja})</span></div>
          {!selForn ? <>
            <input value={buscaForn} onChange={e => setBuscaForn(e.target.value)} placeholder="🔍 Buscar fornecedor…" style={{ ...inp, width: '100%', marginBottom: 8 }} />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              {forns.filter(f => !buscaForn || f.nome.toLowerCase().includes(buscaForn.toLowerCase())).map(f => { const conv = jaConvidado(f.nome); const temZap = !!(soDig(f.whatsapp) || soDig(f.telefone))
                return <div key={f.id} onClick={() => !conv && setSelForn(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderTop: '1px solid var(--border)', cursor: conv ? 'default' : 'pointer', opacity: conv ? .5 : 1 }}>
                  <span style={{ flex: 1, fontSize: 13 }}>{f.nome}{f.categorias ? <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {f.categorias}</span> : ''}</span>
                  {conv ? <span style={{ fontSize: 11, color: '#15803D', fontWeight: 700 }}>já convidado ✓</span> : temZap ? <span style={{ fontSize: 13 }}>📲</span> : <span style={{ fontSize: 11, color: '#B45309' }}>📵</span>}
                </div> })}
            </div>
          </> : <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{fornSel?.nome}</div>
            {fornSel?.categorias ? <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>categorias: {fornSel.categorias}</span> : <span style={{ fontSize: 11.5, color: '#B45309' }}>⚠ sem categorias cadastradas</span>}
            <button onClick={() => setSelForn('')} style={{ fontSize: 12, background: 'none', border: 'none', color: '#4338CA', cursor: 'pointer', textDecoration: 'underline' }}>trocar</button>
          </div>}
        </div>

        {/* PASSO 2 — itens do fornecedor */}
        {selForn && <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><Package size={15} /> Passo 2 — produtos para {fornSel?.nome} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({selItens.size} de {itens.length} marcados)</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input value={buscaItem} onChange={e => setBuscaItem(e.target.value)} placeholder="🔍 Buscar produto…" style={{ ...inp, flex: 1, minWidth: 160 }} />
            {cats.length > 0 && <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} style={{ ...inp }}><option value="">Todas as categorias</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>}
            <button onClick={() => setSelItens(s => { const n = new Set(s); itensFiltrados.forEach(i => n.add(i.id)); return n })} style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>Marcar todos {catFiltro || buscaItem ? 'filtrados' : ''}</button>
            <button onClick={() => setSelItens(s => { const n = new Set(s); itensFiltrados.forEach(i => n.delete(i.id)); return n })} style={{ ...inp, cursor: 'pointer' }}>Limpar</button>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {itensFiltrados.map(i => { const on = selItens.has(i.id); const outros = tokens.filter(t => t.status !== 'cancelado' && (t.item_ids || []).includes(i.id) && t.fornecedor_nome !== fornSel?.nome).length
              return <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderTop: '1px solid var(--border)', cursor: 'pointer', background: on ? '#EEF2FF' : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={e => setSelItens(s => { const n = new Set(s); e.target.checked ? n.add(i.id) : n.delete(i.id); return n })} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>{i.produto_nome} <span style={{ color: 'var(--muted)' }}>· {i.quantidade} {i.unidade}</span></span>
                {outros > 0 && <span title={`já em ${outros} outro(s) fornecedor(es)`} style={{ fontSize: 10.5, color: '#0369A1', background: '#E0F2FE', padding: '1px 7px', borderRadius: 20 }}>+{outros}</span>}
                <select value={i.categoria || ''} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); mudarCategoria(i.id, e.target.value) }}
                  title="Categoria (edite se quiser) — usada para a sugestão automática"
                  style={{ fontSize: 11.5, padding: '3px 5px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: i.categoria ? 'var(--text)' : 'var(--muted)', flexShrink: 0 }}>
                  <option value="">— categoria —</option>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label> })}
          </div>
          <button className="btn" onClick={() => gerarParaFornecedor()} disabled={busy || selItens.size === 0} style={{ padding: '10px 16px', marginTop: 10 }}>
            {busy ? <Loader2 className="spin" size={15} /> : <Send size={15} />} Gerar link de {selItens.size} item(ns) e enviar para {fornSel?.nome}
          </button>
        </div>}

        {/* itens ainda sem fornecedor */}
        {semForn.length > 0 && <div style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 11px', marginBottom: 12 }}>
          ⚠ {semForn.length} item(ns) ainda não foram para nenhum fornecedor: {semForn.slice(0, 12).map(i => i.produto_nome).join(', ')}{semForn.length > 12 ? '…' : ''}
        </div>}

        {/* RASTREIO */}
        {tokens.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Fornecedor</th><th>Itens</th><th>Status</th><th>Abriu</th><th>Respondeu</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {tokens.map(t => { const s = STA[t.status] || STA.enviado
                const f = forns.find(x => x.id === t.fornecedor_id) || forns.find(x => x.nome === t.fornecedor_nome)
                const temZap = !!(soDig(f?.whatsapp) || soDig(f?.telefone))
                const ativo = t.status !== 'cancelado' && t.status !== 'respondido'
                return <tr key={t.token} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{t.fornecedor_nome}</td>
                  <td style={{ color: 'var(--muted)' }}>{(t.item_ids && t.item_ids.length) ? t.item_ids.length : itens.length}</td>
                  <td><span style={{ background: s.bg, color: s.c, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.l}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{t.aberto_em ? fmtDT(t.aberto_em) + (t.acessos ? ` (${t.acessos}x)` : '') : '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.respondido_em ? fmtDT(t.respondido_em) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => copiar(t)} title="Copiar link" style={ico}><Copy size={15} /></button>
                      {ativo && temZap && <button onClick={() => reenviar(t)} title="Reenviar WhatsApp" style={ico}><RefreshCw size={15} /></button>}
                      {ativo && !temZap && <>
                        <input value={manualFone[t.token] || ''} onChange={e => setManualFone(m => ({ ...m, [t.token]: e.target.value }))} placeholder="WhatsApp c/ DDD" style={{ width: 128, padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12 }} />
                        <button onClick={() => reenviar(t, manualFone[t.token])} title="Enviar para este número" style={{ ...ico, color: '#15803D' }}><Send size={14} /></button>
                      </>}
                      {t.status === 'respondido' ? <CheckCircle2 size={16} style={{ color: '#15803D', alignSelf: 'center' }} /> : t.status !== 'cancelado' && <button onClick={() => cancelar(t)} title="Cancelar link" style={{ ...ico, color: '#B91C1C' }}><Ban size={15} /></button>}
                    </div>
                  </td>
                </tr> })}
            </tbody>
          </table>
        </div>}
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>🔒 Cada fornecedor recebe um link único só com os itens que você marcou — nunca vê os outros fornecedores, seus preços, o comparativo ou o estoque. O mesmo produto pode ir para vários fornecedores (a etiqueta “+N” mostra quando um item já está com outros). Ao responder, o link bloqueia e a proposta entra no comparativo abaixo.</div>
      </div>)}
    </div>
  )
}
const ico: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '5px 6px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }
