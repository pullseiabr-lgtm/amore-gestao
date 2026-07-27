import { useState, useEffect, useCallback } from 'react'
import { Link2, Send, Copy, RefreshCw, Ban, CheckCircle2, Loader2, Users } from 'lucide-react'
import { fetchFornecedores, fetchRequisicaoItens, fetchCotacaoTokens, saveCotacaoToken, gerarTokenCotacao, insertRequisicaoCotacao, fetchRequisicaoCotacoes, type CotacaoToken } from '../../lib/db'
import { enviarWhatsApp } from '../../lib/notify'
import type { Requisicao, Fornecedor } from '../../types/database'

const soDig = (s?: string | null) => (s || '').replace(/\D/g, '')
const fmtDT = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

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
  const [nItens, setNItens] = useState(0)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [prazo, setPrazo] = useState('')
  const [validadeDias, setValidadeDias] = useState('7')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [aberto, setAberto] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [f, t, it] = await Promise.all([
      fetchFornecedores(req.loja).catch(() => []),
      fetchCotacaoTokens(req.id).catch(() => []),
      fetchRequisicaoItens(req.id).catch(() => []),
    ])
    setForns(f.filter(x => x.ativo !== false)); setTokens(t); setNItens(it.length)
    setLoading(false)
  }, [req.id, req.loja])
  useEffect(() => { load() }, [load])

  const linkDe = (tok: string) => `${window.location.origin}/cotacao.html?t=${tok}`
  const jaConvidado = (nome: string) => tokens.some(t => t.fornecedor_nome === nome && t.status !== 'cancelado')
  const msgWhats = (forn: Fornecedor, link: string) => {
    const prazoTxt = prazo ? `⏰ Prazo para resposta: ${new Date(prazo).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''
    return `Olá, ${forn.nome}! 👋\n\nA Amore ${req.loja} está com uma nova *cotação* e gostaria do seu melhor preço.\n\n📋 Cotação Nº ${req.numero} — ${req.titulo}\n${prazoTxt}\n\nÉ rápido e seguro, direto pelo link exclusivo do seu cadastro (não precisa criar conta):\n${link}\n\n${userName} — Compras Amore`
  }

  const gerarEnviar = async () => {
    if (nItens === 0) { toast('Adicione produtos à cotação antes de convidar fornecedores.', 'error'); return }
    const alvos = forns.filter(f => sel.has(f.id) && !jaConvidado(f.nome))
    if (alvos.length === 0) { toast('Selecione ao menos um fornecedor ainda não convidado.'); return }
    setBusy(true)
    let enviados = 0, semZap = 0
    try {
      const cots = await fetchRequisicaoCotacoes(req.id).catch(() => [])
      for (const f of alvos) {
        // cria (ou reaproveita) a cotação do fornecedor
        let cot = cots.find(c => c.fornecedor_nome === f.nome)
        if (!cot) cot = await insertRequisicaoCotacao({ requisicao_id: req.id, fornecedor_nome: f.nome, status: 'enviada', total: null, prazo_entrega: null, observacoes: null } as never)
        const token = gerarTokenCotacao()
        const agora = new Date().toISOString()
        const validade = validadeDias ? new Date(Date.now() + Number(validadeDias) * 86400000).toISOString() : null
        const tk: CotacaoToken = {
          token, requisicao_id: req.id, cotacao_id: cot.id, fornecedor_id: f.id, fornecedor_nome: f.nome,
          loja: req.loja, numero: req.numero, titulo: req.titulo, prazo_resposta: prazo ? new Date(prazo).toISOString() : null,
          validade, status: 'enviado', criado_por: userName, criado_em: agora, enviado_em: agora, acessos: 0, resposta: null,
        }
        await saveCotacaoToken(tk)
        const fone = soDig(f.whatsapp) || soDig(f.telefone)
        if (fone) { const ok = await enviarWhatsApp(fone, msgWhats(f, linkDe(token))); if (ok) enviados++; }
        else semZap++
      }
      toast(`${enviados} convite(s) enviado(s) por WhatsApp${semZap ? ` · ${semZap} sem WhatsApp (copie o link)` : ''}.`)
      setSel(new Set()); await load()
    } catch (e) { toast('Erro ao gerar/enviar: ' + (e as Error).message, 'error') }
    finally { setBusy(false) }
  }

  const reenviar = async (t: CotacaoToken) => {
    const f = forns.find(x => x.id === t.fornecedor_id) || forns.find(x => x.nome === t.fornecedor_nome)
    const fone = soDig(f?.whatsapp) || soDig(f?.telefone)
    if (!fone) { toast('Fornecedor sem WhatsApp — copie o link e envie manualmente.'); return }
    const ok = await enviarWhatsApp(fone, msgWhats(f as Fornecedor, linkDe(t.token)))
    if (ok) { await saveCotacaoToken({ ...t, enviado_em: new Date().toISOString() }); toast('Lembrete reenviado. ✅'); load() }
    else toast('Falha ao reenviar.', 'error')
  }
  const cancelar = async (t: CotacaoToken) => {
    if (!window.confirm(`Cancelar o link de ${t.fornecedor_nome}? O link para de funcionar imediatamente.`)) return
    await saveCotacaoToken({ ...t, status: 'cancelado' }); toast('Link cancelado.'); load()
  }
  const copiar = (t: CotacaoToken) => { navigator.clipboard?.writeText(linkDe(t.token)); toast('Link copiado.') }

  const respondidos = tokens.filter(t => t.status === 'respondido').length
  const box: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14 }

  return (
    <div style={box}>
      <div onClick={() => setAberto(a => !a)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: '#EEF2FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Link2 size={19} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>🔗 Cotação com fornecedores (link externo)</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tokens.length} convidado(s) · {respondidos} respondeu(ram) · o fornecedor preenche pelo link, sem acessar o painel</div>
        </div>
        <span style={{ fontSize: 20, color: 'var(--muted)' }}>{aberto ? '▾' : '▸'}</span>
      </div>

      {aberto && (loading ? <div style={{ padding: 20, textAlign: 'center' }}><Loader2 className="spin" size={20} /></div> : <div style={{ marginTop: 14 }}>
        {/* Seleção de fornecedores */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Prazo para resposta<br />
            <input type="datetime-local" value={prazo} onChange={e => setPrazo(e.target.value)} style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', marginTop: 4 }} /></label>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Link expira em (dias)<br />
            <input type="number" min={1} value={validadeDias} onChange={e => setValidadeDias(e.target.value)} style={{ width: 90, padding: '8px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', marginTop: 4 }} /></label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}><Users size={14} /> Fornecedores da loja {req.loja}</div>
        {forns.length === 0 ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: 8 }}>Nenhum fornecedor cadastrado nesta loja. Cadastre em Fornecedores.</div> :
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {forns.map(f => { const conv = jaConvidado(f.nome); const on = sel.has(f.id)
              return <label key={f.id} title={conv ? 'Já convidado' : (soDig(f.whatsapp) || soDig(f.telefone) ? '' : 'Sem WhatsApp')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 20, border: '1px solid ' + (on ? '#4338CA' : 'var(--border)'), background: conv ? '#F3F4F6' : on ? '#EEF2FF' : 'var(--card)', cursor: conv ? 'default' : 'pointer', fontSize: 13, opacity: conv ? .6 : 1 }}>
                <input type="checkbox" disabled={conv} checked={on} onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(f.id) : n.delete(f.id); return n })} />
                {f.nome}{conv ? ' ✓' : (soDig(f.whatsapp) || soDig(f.telefone) ? '' : ' 📵')}
              </label> })}
          </div>}

        <button className="btn" onClick={gerarEnviar} disabled={busy || sel.size === 0} style={{ padding: '10px 16px', marginBottom: 14 }}>
          {busy ? <Loader2 className="spin" size={15} /> : <Send size={15} />} Gerar links e enviar por WhatsApp
        </button>

        {/* Rastreio */}
        {tokens.length > 0 && <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase' }}>
              <th style={{ padding: 8 }}>Fornecedor</th><th>Status</th><th>Enviado</th><th>Abriu</th><th>Respondeu</th><th>Ações</th>
            </tr></thead>
            <tbody>
              {tokens.map(t => { const s = STA[t.status] || STA.enviado
                return <tr key={t.token} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{t.fornecedor_nome}</td>
                  <td><span style={{ background: s.bg, color: s.c, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{s.l}</span></td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDT(t.enviado_em)}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.aberto_em ? fmtDT(t.aberto_em) + (t.acessos ? ` (${t.acessos}x)` : '') : '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.respondido_em ? fmtDT(t.respondido_em) : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => copiar(t)} title="Copiar link" style={ico}><Copy size={15} /></button>
                      {t.status !== 'cancelado' && t.status !== 'respondido' && <button onClick={() => reenviar(t)} title="Reenviar WhatsApp" style={ico}><RefreshCw size={15} /></button>}
                      {t.status === 'respondido' ? <CheckCircle2 size={16} style={{ color: '#15803D', alignSelf: 'center' }} /> : t.status !== 'cancelado' && <button onClick={() => cancelar(t)} title="Cancelar link" style={{ ...ico, color: '#B91C1C' }}><Ban size={15} /></button>}
                    </div>
                  </td>
                </tr> })}
            </tbody>
          </table>
        </div>}
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>🔒 Cada fornecedor recebe um link único. Ele vê só os produtos desta cotação e os preços dele — nunca os outros fornecedores, seus preços, histórico ou estoque da Amore. Quando responde, o link é bloqueado e a proposta entra no comparativo abaixo.</div>
      </div>)}
    </div>
  )
}
const ico: React.CSSProperties = { border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 7, padding: '5px 6px', cursor: 'pointer', color: 'var(--text)', display: 'flex' }
