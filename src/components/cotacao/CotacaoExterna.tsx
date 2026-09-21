import { useState, useEffect, useCallback } from 'react'
import { Link2, Send, Copy, RefreshCw, Ban, CheckCircle2, Loader2, Users, Package } from 'lucide-react'
import { fetchFornecedores, fetchRequisicaoItens, fetchCotacaoTokens, saveCotacaoToken, gerarTokenCotacao, insertRequisicaoCotacao, fetchRequisicaoCotacoes, updateRequisicaoItem, type CotacaoToken } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'
import type { Requisicao, Fornecedor, RequisicaoItem } from '../../types/database'

const soDig = (s?: string | null) => (s || '').replace(/\D/g, '')
const fmtDT = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// Categorias (para editar a categoria de um item — usada só como rótulo/organização)
const CATS = ['Pescados', 'Carne', 'Frango', 'Laticinios', 'Mercearia', 'Bebidas', 'Congelados', 'Limpeza', 'Descartaveis', 'Polpas', 'Hortifruti', 'Padaria']

const STA: Record<string, { l: string; c: string; bg: string }> = {
  enviado: { l: 'Enviado', c: '#0369A1', bg: '#E0F2FE' },
  aberto: { l: 'Abriu o link', c: '#B45309', bg: '#FEF3C7' },
  respondido: { l: 'Respondeu ✓', c: '#15803D', bg: '#DCFCE7' },
  bloqueado: { l: 'Bloqueado', c: '#B91C1C', bg: '#FEE2E2' },
  cancelado: { l: 'Cancelado', c: '#6B7280', bg: '#F3F4F6' },
}

export default function CotacaoExterna({ req, userName, toast, readOnly }: { req: Requisicao; userName: string; toast: (m: string, t?: any) => void; readOnly?: boolean }) {
  const [forns, setForns] = useState<Fornecedor[]>([])
  const [tokens, setTokens] = useState<CotacaoToken[]>([])
  const [itens, setItens] = useState<RequisicaoItem[]>([])
  const [selItens, setSelItens] = useState<Set<string>>(new Set())   // produtos a cotar (padrão: todos)
  const [selForns, setSelForns] = useState<Set<string>>(new Set())   // fornecedores escolhidos
  const [buscaForn, setBuscaForn] = useState('')
  const [buscaItem, setBuscaItem] = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [prazo, setPrazo] = useState('')
  const [validadeDias, setValidadeDias] = useState('7')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [manualFone, setManualFone] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const [f, t, it] = await Promise.all([
      fetchFornecedores(req.loja).catch(() => []),
      fetchCotacaoTokens(req.id).catch(() => []),
      fetchRequisicaoItens(req.id).catch(() => []),
    ])
    const ativos = it.filter((i: any) => i.status !== 'cancelado')
    setForns(f.filter(x => x.ativo !== false)); setTokens(t); setItens(ativos)
    setSelItens(new Set(ativos.map((i: any) => i.id)))   // já marca todos os produtos
    setSelForns(new Set())
    setLoading(false)
  }, [req.id, req.loja])
  useEffect(() => { load() }, [load])

  const jaConvidado = (nome: string) => tokens.some(t => t.fornecedor_nome === nome && t.status !== 'cancelado')
  const linkDe = (tok: string) => `${siteOrigin()}/cotacao.html?t=${tok}`
  const msgWhats = (forn: { nome: string }, link: string, nItens: number) => {
    const prazoTxt = prazo ? `⏰ Prazo para resposta: ${new Date(prazo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}\n` : ''
    return `Olá, ${forn.nome}! 👋\n\nA Amore ${req.loja} está com uma *cotação* e gostaria do seu melhor preço em ${nItens} item(ns).\n\n📋 Cotação Nº ${req.numero} — ${req.titulo}\n${prazoTxt}\nÉ rápido e seguro, direto pelo link exclusivo do seu cadastro (você vê só os produtos direcionados a você):\n${link}\n\n${userName} — Compras Amore`
  }

  const cats = Array.from(new Set(itens.map(i => i.categoria).filter(Boolean))) as string[]
  const itensFiltrados = itens.filter(i =>
    (!buscaItem || i.produto_nome.toLowerCase().includes(buscaItem.toLowerCase())) &&
    (!catFiltro || i.categoria === catFiltro))
  const fornsFiltrados = forns.filter(f => !buscaForn || f.nome.toLowerCase().includes(buscaForn.toLowerCase()) || (f.categorias || '').toLowerCase().includes(buscaForn.toLowerCase()))

  const toggleItem = (id: string, on: boolean) => setSelItens(s => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n })
  const toggleForn = (id: string) => setSelForns(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  // Envia a cotação (produtos marcados) para TODOS os fornecedores escolhidos de uma vez.
  const enviarCotacao = async () => {
    if (selItens.size === 0) { toast('Marque ao menos 1 produto para cotar.', 'error'); return }
    if (selForns.size === 0) { toast('Escolha ao menos 1 fornecedor.', 'error'); return }
    setBusy(true)
    let ger = 0, ok = 0; const semZap: string[] = []
    try {
      const cots = await fetchRequisicaoCotacoes(req.id).catch(() => [])
      for (const fid of selForns) {
        const f = forns.find(x => x.id === fid); if (!f) continue
        let cot = cots.find(c => c.fornecedor_nome === f.nome)
        if (!cot) cot = await insertRequisicaoCotacao({ requisicao_id: req.id, fornecedor_nome: f.nome, status: 'enviada', total: null, prazo_entrega: null, observacoes: null } as never)
        const token = gerarTokenCotacao(); const agora = new Date().toISOString()
        const tk: CotacaoToken = {
          token, requisicao_id: req.id, cotacao_id: cot.id, fornecedor_id: f.id, fornecedor_nome: f.nome,
          loja: req.loja, numero: req.numero, titulo: req.titulo, item_ids: [...selItens],
          prazo_resposta: prazo ? new Date(prazo).toISOString() : null,
          validade: validadeDias ? new Date(Date.now() + Number(validadeDias) * 86400000).toISOString() : null,
          status: 'enviado', criado_por: userName, criado_em: agora, enviado_em: agora, acessos: 0, resposta: null,
        }
        await saveCotacaoToken(tk); ger++
        const fone = soDig(f.whatsapp) || soDig(f.telefone)
        if (fone) { const r = await enviarWhatsApp(fone, msgWhats(f, linkDe(token), selItens.size)); if (r) ok++; await new Promise(x => setTimeout(x, 2500 + Math.random() * 3500)) }
        else semZap.push(f.nome)
      }
      let msg = `Cotação gerada para ${ger} fornecedor(es) · ${ok} enviada(s) por WhatsApp.`
      if (semZap.length) msg += ` ${semZap.length} sem número (${semZap.join(', ')}) — envie manual no rastreio abaixo (campo “WhatsApp c/ DDD”).`
      toast(msg)
      setSelForns(new Set()); await load()
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

  const cobertos = new Set<string>()
  tokens.filter(t => t.status !== 'cancelado').forEach(t => (t.item_ids && t.item_ids.length ? t.item_ids : itens.map(i => i.id)).forEach(id => cobertos.add(id)))
  const respondidos = tokens.filter(t => t.status === 'respondido').length

  const box: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13, boxSizing: 'border-box' }
  const passoTit: React.CSSProperties = { fontSize: 13, fontWeight: 800, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Link2 size={19} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>📤 Enviar cotação aos fornecedores</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Marque os produtos → escolha os fornecedores → enviar. {tokens.filter(t => t.status !== 'cancelado').length} enviada(s) · {respondidos} respondeu(ram). <b>Não precisa de aprovação para cotar.</b></div>
        </div>
      </div>

      {loading ? <div style={{ padding: 20, textAlign: 'center' }}><Loader2 className="spin" size={20} /></div> : <div>
        {/* PASSO 1 — produtos a cotar */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={passoTit}><Package size={15} /> 1) Marque os produtos que vão ser cotados <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({selItens.size} de {itens.length} marcados)</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <input value={buscaItem} onChange={e => setBuscaItem(e.target.value)} placeholder="🔍 Buscar produto…" style={{ ...inp, flex: 1, minWidth: 160 }} />
            {cats.length > 0 && <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} style={{ ...inp }}><option value="">Todas as categorias</option>{cats.map(c => <option key={c} value={c}>{c}</option>)}</select>}
            <button onClick={() => setSelItens(s => { const n = new Set(s); itensFiltrados.forEach(i => n.add(i.id)); return n })} style={{ ...inp, cursor: 'pointer', fontWeight: 600 }}>Marcar todos</button>
            <button onClick={() => setSelItens(s => { const n = new Set(s); itensFiltrados.forEach(i => n.delete(i.id)); return n })} style={{ ...inp, cursor: 'pointer' }}>Limpar</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {itensFiltrados.length === 0 ? <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>Nenhum item nesta requisição.</div> : itensFiltrados.map(i => { const on = selItens.has(i.id)
              return <label key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderTop: '1px solid var(--border)', cursor: 'pointer', background: on ? '#EEF2FF' : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={e => toggleItem(i.id, e.target.checked)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>{i.produto_nome} <span style={{ color: 'var(--muted)' }}>· {i.quantidade} {i.unidade}</span></span>
                <select value={i.categoria || ''} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); mudarCategoria(i.id, e.target.value) }}
                  title="Categoria (opcional)" style={{ fontSize: 11.5, padding: '3px 5px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--card)', color: i.categoria ? 'var(--text)' : 'var(--muted)', flexShrink: 0 }}>
                  <option value="">— categoria —</option>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label> })}
          </div>
        </div>

        {/* PASSO 2 — fornecedores */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={passoTit}><Users size={15} /> 2) Escolha os fornecedores <span style={{ fontWeight: 500, color: 'var(--muted)' }}>({selForns.size} marcado(s) · {forns.length} na loja {req.loja})</span></div>
          <input value={buscaForn} onChange={e => setBuscaForn(e.target.value)} placeholder="🔍 Buscar fornecedor…" style={{ ...inp, width: '100%', marginBottom: 8 }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            {fornsFiltrados.length === 0 ? <div style={{ padding: 12, color: 'var(--muted)', fontSize: 12.5 }}>Nenhum fornecedor cadastrado nesta loja.</div> : fornsFiltrados.map(f => {
              const on = selForns.has(f.id); const temZap = !!(soDig(f.whatsapp) || soDig(f.telefone)); const conv = jaConvidado(f.nome)
              return <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderTop: '1px solid var(--border)', cursor: 'pointer', background: on ? '#EEF2FF' : 'transparent' }}>
                <input type="checkbox" checked={on} onChange={() => toggleForn(f.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13 }}>{f.nome}{f.categorias ? <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {f.categorias}</span> : ''}</span>
                {conv && <span style={{ fontSize: 10.5, color: '#15803D', fontWeight: 700 }}>já enviado ✓</span>}
                {temZap ? <span title="tem WhatsApp" style={{ fontSize: 13 }}>📲</span> : <span title="sem WhatsApp — envio manual no rastreio" style={{ fontSize: 12, color: '#B45309' }}>📵 manual</span>}
              </label> })}
          </div>
        </div>

        {/* PASSO 3 — prazos + enviar */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={passoTit}><Send size={15} /> 3) Enviar</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Prazo para resposta<br /><input type="datetime-local" value={prazo} onChange={e => setPrazo(e.target.value)} style={{ ...inp, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Link expira em (dias)<br /><input type="number" min={1} value={validadeDias} onChange={e => setValidadeDias(e.target.value)} style={{ ...inp, width: 90, marginTop: 4 }} /></label>
          </div>
          {!readOnly && <button className="btn" onClick={enviarCotacao} disabled={busy || selItens.size === 0 || selForns.size === 0} style={{ padding: '12px 18px', fontSize: 14, fontWeight: 700, opacity: (busy || selItens.size === 0 || selForns.size === 0) ? .55 : 1 }}>
            {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />} Enviar cotação de {selItens.size} produto(s) para {selForns.size} fornecedor(es)
          </button>}
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Cada fornecedor recebe um link único só com os produtos marcados (não vê os outros fornecedores nem os preços). Quem não tem WhatsApp cadastrado aparece no rastreio abaixo com um campo para você digitar o número e enviar manual, ou copiar o link.</div>
        </div>

        {/* RASTREIO */}
        {tokens.length > 0 && <>
          <div style={{ fontSize: 12.5, fontWeight: 700, margin: '4px 0 6px' }}>📶 Rastreio dos envios</div>
          <div style={{ overflowX: 'auto' }}>
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
                      {!readOnly && ativo && temZap && <button onClick={() => reenviar(t)} title="Reenviar WhatsApp" style={ico}><RefreshCw size={15} /></button>}
                      {!readOnly && ativo && !temZap && <>
                        <input value={manualFone[t.token] || ''} onChange={e => setManualFone(m => ({ ...m, [t.token]: e.target.value }))} placeholder="WhatsApp c/ DDD" style={{ width: 128, padding: '5px 7px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12 }} />
                        <button onClick={() => reenviar(t, manualFone[t.token])} title="Enviar para este número" style={{ ...ico, color: '#15803D' }}><Send size={14} /></button>
                      </>}
                      {t.status === 'respondido' ? <CheckCircle2 size={16} style={{ color: '#15803D', alignSelf: 'center' }} /> : (!readOnly && t.status !== 'cancelado' && <button onClick={() => cancelar(t)} title="Cancelar link" style={{ ...ico, color: '#B91C1C' }}><Ban size={15} /></button>)}
                    </div>
                  </td>
                </tr> })}
            </tbody>
          </table>
          </div>
        </>}
      </div>}
    </div>
  )
}
const ico: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '5px 6px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }
