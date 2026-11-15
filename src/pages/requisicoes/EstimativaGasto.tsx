// Estimativa de gasto da requisição — painel do COMPRADOR dentro do módulo Status das Requisições.
// Só aparece para o comprador (donos / Setor de Compras). Edita preço unitário por item, soma o gasto estimado,
// salva sem mudar o status e, se a requisição estiver em "Estimativa (Compras)", envia para aprovação.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { enviarWhatsApp } from '../../lib/notify'
import { siteOrigin } from '../../lib/site'
import { rpcErro } from '../alimentacao/aliLib'
import { Btn, Modal, Pill, inp, lbl } from '../plantao/plantaoUi'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any
type Req = { id: string; numero: number; loja: string; titulo: string; status: string; responsavel_nome: string; total_estimado: number; created_at: string }
type Item = { id: string; produto_nome: string; categoria: string | null; quantidade: number; unidade: string; preco_referencia: number | null }

const ST: Record<string, [string, string]> = {
  em_estimativa: ['Estimativa (Compras)', '#7C3AED'], enviada: ['Aguard. aprovação', '#B45309'], em_analise: ['Em análise', '#0369A1'],
  aprovada: ['Aprovada', '#15803D'], em_cotacao: ['Em cotação', '#7C3AED'], aguardando_cotacao: ['Aguard. cotação', '#7C3AED'], cotacao_recebida: ['Cotação recebida', '#7C3AED'],
  parcialmente_aprovada: ['Aprov. parcial', '#CA8A04'], reprovada: ['Reprovada', '#B91C1C'], rascunho: ['Rascunho', '#6b7280'], compra_realizada: ['Compra realizada', '#0891B2'],
}
const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: string) => { if (!v || !v.trim()) return null; const n = parseFloat(v.replace(',', '.')); return isNaN(n) ? null : n }
const n2 = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',')
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')
const APROVADORES = [{ nome: 'Wagner', fone: '5581994135602' }, { nome: 'Aline', fone: '5581994573420' }]

export default function EstimativaGasto({ quem, loja, onClose }: { quem: string; loja: string; onClose: () => void }) {
  const [reqs, setReqs] = useState<Req[]>([])
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Req | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [fontes, setFontes] = useState<Record<string, string>>({})
  const [obs, setObs] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const aviso = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  const carregar = useCallback(async () => {
    let q = sb.from('requisicoes').select('id,numero,loja,titulo,status,responsavel_nome,total_estimado,created_at').not('status', 'in', '(cancelada,concluida)').order('created_at', { ascending: false }).limit(120)
    if (loja) q = q.eq('loja', loja)
    const { data } = await q
    setReqs((data || []) as Req[])
  }, [loja])
  useEffect(() => { carregar() }, [carregar])

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return reqs.filter(r => !t || `${r.numero} ${r.titulo} ${r.responsavel_nome} ${r.loja}`.toLowerCase().includes(t))
      .sort((a, b) => Number(b.status === 'em_estimativa') - Number(a.status === 'em_estimativa'))
  }, [reqs, busca])

  const abrir = async (r: Req) => {
    const { data } = await sb.from('requisicao_itens').select('id,produto_nome,categoria,quantidade,unidade,preco_referencia').eq('requisicao_id', r.id).neq('status', 'cancelado').order('categoria')
    const its = (data || []) as Item[]
    setSel(r); setItens(its); setObs(''); setFontes({})
    const p: Record<string, string> = {}
    its.forEach(i => { if (i.preco_referencia) p[i.id] = String(i.preco_referencia).replace('.', ',') })
    setPrecos(p)
  }
  const total = itens.reduce((a, i) => a + (num(precos[i.id] || '') || 0) * i.quantidade, 0)
  const semPreco = itens.filter(i => !(num(precos[i.id] || '') || 0)).length
  const payload = () => itens.map(i => ({ id: i.id, preco: num(precos[i.id] || '') }))

  const estimar = async () => {
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('ri_preco_ref', { p_nomes: itens.map(i => i.produto_nome) })
      if (error) throw error
      const p = { ...precos }; const f = { ...fontes }; let n = 0
      for (const r of (data || []) as { nome: string; preco: number | null; fonte: string | null; data: string | null }[]) {
        const it = itens.find(i => i.produto_nome === r.nome); if (!it || r.preco == null || p[it.id]) continue
        p[it.id] = String(Math.round(r.preco * 100) / 100).replace('.', ','); f[it.id] = `${r.fonte} (${fmtD(r.data)})`; n++
      }
      setPrecos(p); setFontes(f); aviso(`${n} preço(s) estimado(s). Confira as unidades.`)
    } catch (e) { aviso('Erro: ' + rpcErro(e)) } finally { setBusy(false) }
  }
  const salvar = async () => {
    if (!sel) return
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('ri_salvar_estimativa', { p_req: sel.id, p_itens: payload(), p_por: quem, p_obs: obs })
      if (error) throw error
      aviso(`Estimativa salva: ${brl(data.total)}`); await carregar(); setSel({ ...sel, total_estimado: data.total })
    } catch (e) { aviso('Erro: ' + rpcErro(e)) } finally { setBusy(false) }
  }
  const concluir = async () => {
    if (!sel) return
    if (semPreco > 0 && !confirm(`${semPreco} item(ns) sem preço. Enviar para aprovação mesmo assim?`)) return
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('ri_concluir_estimativa', { p_req: sel.id, p_itens: payload(), p_por: quem, p_obs: obs })
      if (error) throw error
      const lojaL = ({ 'Amore CD': 'Amore Costa Dourada', 'Flow CD': 'Flow Costa Dourada' } as Record<string, string>)[sel.loja] || sel.loja
      const texto = `🧾 *Requisição para APROVAÇÃO — #${sel.numero}*\n🏪 ${lojaL}\n👤 Solicitante: ${sel.responsavel_nome}\n📦 ${itens.length} item(ns)\n💰 Estimativa revisada pelo Setor de Compras: *${brl(data.total)}*${data.sem_preco ? ` (${data.sem_preco} sem preço)` : ''}\n\nRevise, ajuste se precisar e *aprove*:\n${siteOrigin()}/requisicao-editar.html?id=${sel.id}\n\n_Painel Amore_`
      for (const a of APROVADORES) {
        try { await enviarWhatsApp(a.fone, texto, undefined, { tipo: 'compra', modulo: 'requisicoes', titulo: `Aprovação #${sel.numero}`, loja: sel.loja, created_by: quem }) } catch { /* segue */ }
        await new Promise(res => setTimeout(res, 2500 + Math.random() * 3500))
      }
      aviso(`Estimativa de ${brl(data.total)} concluída — enviada para aprovação.`); setSel(null); carregar()
    } catch (e) { aviso('Erro: ' + rpcErro(e)) } finally { setBusy(false) }
  }

  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, color: 'var(--muted)', padding: '5px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '5px 6px', fontSize: 13, borderBottom: '1px solid var(--border)' }
  return (
    <Modal titulo={sel ? `💰 Estimativa de gasto — Requisição #${sel.numero}` : '💰 Estimativa de gasto das requisições (Compras)'} onClose={onClose}>
      {msg && <div style={{ background: '#222', color: '#fff', padding: '8px 12px', borderRadius: 10, fontSize: 13, marginBottom: 8 }}>{msg}</div>}
      {!sel && (
        <>
          <input style={{ ...inp, marginBottom: 8 }} placeholder="🔎 Buscar por nº, título, solicitante ou loja…" value={busca} onChange={e => setBusca(e.target.value)} />
          {lista.map(r => {
            const s = ST[r.status] || [r.status, '#6b7280']
            return (
              <div key={r.id} onClick={() => abrir(r)} style={{ cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 12, padding: '8px 10px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div><b>#{r.numero}</b> · {r.titulo}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.loja} · {r.responsavel_nome} · {fmtD(r.created_at)}</div></div>
                <div style={{ textAlign: 'right' }}><Pill cor={s[1]}>{s[0]}</Pill><div style={{ fontWeight: 800, fontSize: 13 }}>{r.total_estimado ? brl(r.total_estimado) : 'sem estimativa'}</div></div>
              </div>
            )
          })}
          {!lista.length && <div style={{ color: 'var(--muted)', padding: 12 }}>Nenhuma requisição ativa encontrada.</div>}
        </>
      )}
      {sel && (
        <>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{sel.loja} · {sel.responsavel_nome} · <Pill cor={(ST[sel.status] || ['', '#6b7280'])[1]}>{(ST[sel.status] || [sel.status])[0]}</Pill></div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <Btn small tone="ghost" onClick={() => setSel(null)}>← Voltar</Btn>
            <Btn small tone="ghost" onClick={estimar} disabled={busy}>⚙️ Estimar automaticamente</Btn>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Produto</th><th style={th}>Qtd</th><th style={th}>Un.</th><th style={th}>Preço unit.</th><th style={th}>Subtotal</th></tr></thead>
              <tbody>
                {itens.map(i => {
                  const p = num(precos[i.id] || '') || 0
                  return (
                    <tr key={i.id} style={{ background: !p ? 'rgba(245,158,11,.08)' : undefined }}>
                      <td style={td}>{i.produto_nome}{fontes[i.id] && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{fontes[i.id]}</div>}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{n2(i.quantidade)}</td><td style={td}>{i.unidade}</td>
                      <td style={td}><input style={{ ...inp, width: 88, padding: '5px 7px', fontSize: 13, textAlign: 'right' }} inputMode="decimal" placeholder="0,00" value={precos[i.id] || ''} onChange={e => setPrecos(prev => ({ ...prev, [i.id]: e.target.value }))} /></td>
                      <td style={{ ...td, fontWeight: 700 }}>{brl(p * i.quantidade)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, margin: '10px 0 4px' }}>Gasto estimado: {brl(total)} {semPreco > 0 && <span style={{ fontSize: 12, color: '#B45309', fontWeight: 600 }}>· {semPreco} item(ns) sem preço</span>}</div>
          <label style={lbl}>Observação (opcional)</label>
          <input style={inp} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: preço de atacado, validar frete…" />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <Btn onClick={salvar} disabled={busy}>💾 Salvar estimativa</Btn>
            {sel.status === 'em_estimativa' && <Btn tone="ok" onClick={concluir} disabled={busy}>✅ Concluir e enviar para aprovação</Btn>}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Preços automáticos podem estar em outra unidade (kg × caixa): confira antes de salvar.</div>
        </>
      )}
    </Modal>
  )
}
