import { useState, useEffect, useCallback, useMemo } from 'react'
import { FolderOpen, Download, ExternalLink, X, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { siteOrigin } from '../../lib/site'

// Arquivo digital dos recebimentos: histórico pesquisável + ficha de cada recebimento
// (itens, valores, divergências, várias NFs/documentos e RNCs vinculadas).
// Só LÊ as tabelas já existentes e grava em recebimento_documentos (documentos nunca são apagados/sobrescritos).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any
const SB_URL = 'https://xdwnsqkzgopymufsuccr.supabase.co'
const fmt = (n: unknown) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtD = (s?: string | null) => { if (!s) return '—'; const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—' }
const fmtDH = (s?: string | null) => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '1.1rem 1.3rem', marginBottom: 14 }
const inp: React.CSSProperties = { padding: '.5rem .7rem', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%', boxSizing: 'border-box' }
const lbl: React.CSSProperties = { fontSize: 11, color: '#9ca3af', display: 'block', marginBottom: 2 }

export const TIPOS_DOC: { id: string; label: string }[] = [
  { id: 'principal', label: 'Nota fiscal principal' },
  { id: 'segunda_nf', label: 'Segunda nota fiscal da mesma entrega' },
  { id: 'complementar', label: 'Nota fiscal complementar' },
  { id: 'correcao', label: 'Correção / nota corrigida' },
  { id: 'adicional', label: 'Documento adicional' },
]
const tipoLabel = (id: string) => TIPOS_DOC.find(t => t.id === id)?.label || id
const GRAV_RNC: Record<string, string> = { aberta: 'Aberta', em_analise: 'Em análise', aguardando_execucao: 'Aguardando execução', aguardando_fornecedor: 'Aguardando fornecedor', em_tratativa: 'Em tratativa', resolvida: 'Resolvida', reincidente: 'Reincidente', encerrada: 'Encerrada' }
const STATUS_REC: Record<string, string> = { confirmado: 'Confirmado', pendente_aprovacao: 'Pendente de aprovação', aprovado: 'Aprovado' }

/** Faz upload no bucket "anexos" e devolve a URL pública. */
export async function subirDocumentoRecebimento(file: File, recId?: string): Promise<{ url: string; nome: string }> {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `recebimentos/${recId ? recId + '/' : ''}${crypto.randomUUID()}.${ext}`
  const { error } = await sb.storage.from('anexos').upload(path, file, { upsert: false, contentType: file.type })
  if (error) throw new Error(error.message)
  return { url: `${SB_URL}/storage/v1/object/public/anexos/${path}`, nome: file.name }
}

async function baixar(url: string, nome: string) {
  try {
    const r = await fetch(url); const b = await r.blob()
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome || 'documento'; document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  } catch { window.open(url, '_blank') }
}

// RNCs de um recebimento: vínculo explícito (recebimento_id) ou mesma loja + mesma NF
const rncsDoRec = (rec: any, rncs: any[]) => rncs.filter(r => r.recebimento_id === rec.id || (!r.recebimento_id && rec.numero_nota && rec.numero_nota !== 's/n' && String(r.nf_numero || '').trim() === String(rec.numero_nota).trim() && r.loja === rec.loja))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function RecebimentoHistorico({ lojas, userName, reloadKey }: { lojas: string[]; userName: string; reloadKey: number }) {
  const [rows, setRows] = useState<any[]>([])
  const [rncs, setRncs] = useState<any[]>([])
  const [docsCount, setDocsCount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [f, setF] = useState({ loja: '', fornecedor: '', nf: '', de: '', ate: '', rnc: '' })
  const [aberto, setAberto] = useState<any | null>(null)
  const [tick, setTick] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    let q = sb.from('recebimentos').select('*').order('created_at', { ascending: false }).limit(1000)
    if (f.loja) q = q.eq('loja', f.loja)
    if (f.de) q = q.gte('created_at', f.de + 'T00:00:00-03:00')
    if (f.ate) q = q.lte('created_at', f.ate + 'T23:59:59-03:00')
    const [rec, rn, dc] = await Promise.all([
      q,
      sb.from('rnc').select('id,numero,status,loja,nf_numero,recebimento_id,produto,titulo,desvio_txt,categoria,aberto_por').or('recebimento_id.not.is.null,nf_numero.not.is.null').limit(3000),
      sb.from('recebimento_documentos').select('recebimento_id').limit(10000),
    ])
    setRows(rec.data || []); setRncs(rn.data || [])
    const c: Record<string, number> = {}
    for (const d of (dc.data || [])) c[d.recebimento_id] = (c[d.recebimento_id] || 0) + 1
    setDocsCount(c)
    setLoading(false)
  }, [f.loja, f.de, f.ate])
  useEffect(() => { load() }, [load, reloadKey, tick])

  const lista = useMemo(() => rows.filter(r => {
    if (f.fornecedor && !String(r.fornecedor || '').toLowerCase().includes(f.fornecedor.trim().toLowerCase())) return false
    if (f.nf && !String(r.numero_nota || '').toLowerCase().includes(f.nf.trim().toLowerCase())) return false
    const n = rncsDoRec(r, rncs).length
    if (f.rnc === 'com' && !n) return false
    if (f.rnc === 'sem' && n) return false
    return true
  }), [rows, rncs, f])

  const lojasOpts = Array.from(new Set(['', ...lojas]))
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 14 }}>📁 Histórico de recebimentos — arquivo digital ({lista.length})</b>
        <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Clique em um recebimento para abrir a ficha completa</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 10 }}>
        <div><label style={lbl}>Loja</label><select style={inp} value={f.loja} onChange={e => setF({ ...f, loja: e.target.value })}>{lojasOpts.map(l => <option key={l} value={l}>{l || 'Todas'}</option>)}</select></div>
        <div><label style={lbl}>Fornecedor</label><input style={inp} value={f.fornecedor} onChange={e => setF({ ...f, fornecedor: e.target.value })} placeholder="Nome" /></div>
        <div><label style={lbl}>Nº da nota fiscal</label><input style={inp} value={f.nf} onChange={e => setF({ ...f, nf: e.target.value })} placeholder="Número" /></div>
        <div><label style={lbl}>De</label><input type="date" style={inp} value={f.de} onChange={e => setF({ ...f, de: e.target.value })} /></div>
        <div><label style={lbl}>Até</label><input type="date" style={inp} value={f.ate} onChange={e => setF({ ...f, ate: e.target.value })} /></div>
        <div><label style={lbl}>RNC</label><select style={inp} value={f.rnc} onChange={e => setF({ ...f, rnc: e.target.value })}><option value="">Todos</option><option value="com">Com RNC</option><option value="sem">Sem RNC</option></select></div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && !rows.length ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Carregando…</div>
          : lista.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum recebimento encontrado com esses filtros.</div>
          : lista.slice(0, 200).map(r => {
            const nr = rncsDoRec(r, rncs).length
            return (
              <button key={r.id} onClick={() => setAberto(r)} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, background: '#f9fafb', padding: '.5rem .7rem', borderRadius: 8, flexWrap: 'wrap', border: '1px solid #eef0f2', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                <FolderOpen size={15} style={{ color: '#6B1212' }} />
                <div style={{ flex: 1, minWidth: 190 }}><b>{r.fornecedor || 'Fornecedor'}</b> <span style={{ color: '#9ca3af' }}>· NF {r.numero_nota || 's/n'} · {r.loja} · {r.qtd_itens} itens · {fmtDH(r.created_at)}</span></div>
                <span style={{ fontSize: 11, color: '#6b7280' }}>📎 {docsCount[r.id] || (r.anexo_url ? 1 : 0)} doc(s)</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '.2rem .6rem', borderRadius: 20, background: nr ? '#FEE2E2' : '#DCFCE7', color: nr ? '#B91C1C' : '#166534' }}>{nr ? `⚠️ Com RNC (${nr})` : '✓ Sem RNC'}</span>
                <span style={{ fontWeight: 600 }}>{fmt(r.valor_total)}</span>
              </button>
            )
          })}
        {lista.length > 200 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Mostrando os 200 mais recentes — refine os filtros para ver os demais.</div>}
      </div>
      {aberto && <FichaRecebimento rec={aberto} rncsAll={rncs} userName={userName} onClose={() => setAberto(null)} onChanged={() => setTick(t => t + 1)} />}
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FichaRecebimento({ rec, rncsAll, userName, onClose, onChanged }: { rec: any; rncsAll: any[]; userName: string; onClose: () => void; onChanged: () => void }) {
  const [itens, setItens] = useState<any[]>([])
  const [docs, setDocs] = useState<any[]>([])
  const [ocorr, setOcorr] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [tipo, setTipo] = useState('segunda_nf')
  const [numero, setNumero] = useState('')
  const [descricao, setDescricao] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    const [it, dc, oc] = await Promise.all([
      rec.caixa_id ? sb.from('caixa_itens').select('*').eq('caixa_id', rec.caixa_id).order('created_at') : Promise.resolve({ data: [] }),
      sb.from('recebimento_documentos').select('*').eq('recebimento_id', rec.id).order('created_at'),
      sb.from('recebimento_ocorrencias').select('*').eq('recebimento_id', rec.id).order('created_at'),
    ])
    let d = dc.data || []
    // Recebimento antigo sem registro de documento: mostra o anexo original como principal (sem gravar nada)
    if (!d.length && rec.anexo_url) d = [{ id: 'orig', tipo: 'principal', numero_nota: rec.numero_nota, url: rec.anexo_url, arquivo_nome: rec.arquivo_nome, created_by: rec.created_by, created_at: rec.created_at }]
    setItens(it.data || []); setDocs(d); setOcorr(oc.data || []); setCarregando(false)
  }, [rec])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { const a = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = a } }, [])

  const rncs = rncsDoRec(rec, rncsAll)
  const nDiv = Math.max(Number(rec.qtd_ocorrencias || 0), ocorr.length)
  const resultado = rec.status === 'pendente_aprovacao' ? '⏳ Pendente de aprovação (itens retidos por divergência)' : nDiv > 0 ? `⚠️ Conferido com ${nDiv} divergência(s)` : '✅ Conferido sem divergências'

  const adicionar = async () => {
    if (!file) { alert('Escolha o arquivo (foto ou PDF) da nota/documento.'); return }
    setEnviando(true)
    try {
      const up = await subirDocumentoRecebimento(file, rec.id)
      const { error } = await sb.from('recebimento_documentos').insert({ recebimento_id: rec.id, tipo, numero_nota: numero.trim() || null, descricao: descricao.trim() || null, url: up.url, arquivo_nome: up.nome, created_by: userName })
      if (error) throw new Error(error.message)
      // Se o recebimento ainda não tinha o documento original registrado, guarda-o também (preserva o original)
      if (!docs.some(d => d.id !== 'orig') && rec.anexo_url) await sb.from('recebimento_documentos').insert({ recebimento_id: rec.id, tipo: 'principal', numero_nota: rec.numero_nota, url: rec.anexo_url, arquivo_nome: rec.arquivo_nome, created_by: rec.created_by })
      setFile(null); setNumero(''); setDescricao(''); await carregar(); onChanged()
    } catch (e) { alert('Não foi possível anexar: ' + (e as Error).message) } finally { setEnviando(false) }
  }

  const sec = (t: string) => <div style={{ fontSize: 12, fontWeight: 800, color: '#6B1212', margin: '16px 0 8px', borderBottom: '1px solid #e5e7eb', paddingBottom: 4 }}>{t}</div>
  const kv = (k: string, v: React.ReactNode) => <div><span style={{ color: '#9ca3af', fontSize: 11 }}>{k}</span><div style={{ fontWeight: 600, fontSize: 13 }}>{v || '—'}</div></div>
  const totalItens = itens.reduce((s, i) => s + (Number(i.valor) || 0), 0)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 2100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 20, width: '100%', maxWidth: 860, maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#6B1212', letterSpacing: '.08em' }}>FICHA DO RECEBIMENTO</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{rec.fornecedor || 'Fornecedor'} · NF {rec.numero_nota || 's/n'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '.25rem .7rem', borderRadius: 20, background: '#DCFCE7', color: '#166534' }}>Recebimento realizado · {STATUS_REC[rec.status] || rec.status}</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '.25rem .7rem', borderRadius: 20, background: '#E0F2FE', color: '#075985' }}>Notas fiscais vinculadas: {docs.length ? 'disponíveis (' + docs.length + ')' : 'nenhuma'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '.25rem .7rem', borderRadius: 20, background: rncs.length ? '#FEE2E2' : '#DCFCE7', color: rncs.length ? '#B91C1C' : '#166534' }}>{rncs.length ? `Não conformidade: Com RNC (${rncs.length})` : 'Recebimento sem RNC'}</span>
        </div>

        {sec('1 · Dados do recebimento')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {kv('Loja', rec.loja)}{kv('Fornecedor', rec.fornecedor)}{kv('Data e horário do recebimento', fmtDH(rec.created_at))}
          {kv('Nº da nota fiscal', rec.numero_nota)}{kv('Data de emissão', fmtD(rec.data_emissao))}{kv('Valor total da nota', fmt(rec.valor_total))}
          {kv('Responsável pelo recebimento', rec.conferente_nome || rec.created_by)}{kv('Assinatura', rec.conferente_assinatura)}{kv('Resultado da conferência', resultado)}
        </div>
        {rec.observacao && <div style={{ marginTop: 8, fontSize: 12.5, background: '#faf8f5', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}><b>Observação:</b> {rec.observacao}</div>}

        {sec('2 · Produtos recebidos')}
        {carregando ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Carregando…</div> : itens.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Sem itens detalhados neste registro.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ textAlign: 'left', color: '#9ca3af' }}>{['Produto', 'Qtd', 'Un.', 'Valor unit.', 'Valor total'].map(h => <th key={h} style={{ padding: '4px 6px' }}>{h}</th>)}</tr></thead>
              <tbody>{itens.map(i => {
                const q = Number(i.quantidade) || 0
                const unit = i.preco_unit != null ? Number(i.preco_unit) : (q ? Number(i.valor) / q : null)
                return <tr key={i.id} style={{ borderTop: '1px solid #f1f1f1' }}><td style={{ padding: '4px 6px', fontWeight: 600 }}>{i.descricao}</td><td>{i.quantidade ?? '—'}</td><td>{i.unidade || '—'}</td><td>{unit != null ? fmt(unit) : '—'}</td><td>{fmt(i.valor)}</td></tr>
              })}</tbody>
              <tfoot><tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 800 }}><td colSpan={4} style={{ padding: '5px 6px', textAlign: 'right' }}>Total dos itens</td><td>{fmt(totalItens)}</td></tr></tfoot>
            </table>
          </div>
        )}

        {sec('3 · Divergências identificadas')}
        {ocorr.length === 0 ? <div style={{ fontSize: 13, color: '#166534' }}>Nenhuma divergência registrada na conferência.</div> : ocorr.map(o => (
          <div key={o.id} style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: '7px 10px', marginBottom: 6, fontSize: 12.5 }}>
            <b>{o.item_descricao || 'Item'}</b> — {String(o.tipo || '').replace(/_/g, ' ')} <span style={{ color: '#9ca3af' }}>({o.gravidade})</span>
            {o.descricao && <div>{o.descricao}</div>}
            {(o.quantidade_esperada != null || o.quantidade_recebida != null) && <div style={{ color: '#6b7280' }}>Esperado: {o.quantidade_esperada ?? '—'} · Recebido: {o.quantidade_recebida ?? '—'}</div>}
            {o.foto_url && <a href={o.foto_url} target="_blank" rel="noreferrer" style={{ color: '#6B1212', fontSize: 12 }}>ver foto</a>}
          </div>
        ))}

        {sec('4 · Notas fiscais e documentos (cada um guardado individualmente)')}
        {docs.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Nenhum documento anexado.</div> : docs.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', border: '1px solid #e5e7eb', borderRadius: 8, padding: '7px 10px', marginBottom: 6, fontSize: 12.5 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <b>{tipoLabel(d.tipo)}</b>{d.numero_nota ? ` · NF ${d.numero_nota}` : ''}
              <div style={{ color: '#9ca3af', fontSize: 11.5 }}>{d.arquivo_nome || 'arquivo'} · anexado por {d.created_by || '—'} em {fmtDH(d.created_at)}{d.descricao ? ' · ' + d.descricao : ''}</div>
            </div>
            <a href={d.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6B1212', fontWeight: 600 }}><ExternalLink size={14} /> Visualizar</a>
            <button onClick={() => baixar(d.url, d.arquivo_nome || `NF-${d.numero_nota || rec.numero_nota || 'documento'}`)} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#6B1212', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5 }}><Download size={14} /> Baixar</button>
          </div>
        ))}
        <div style={{ background: '#faf8f5', border: '1px dashed #c4b5a8', borderRadius: 10, padding: 10, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>➕ Vincular outra nota fiscal ou documento a este recebimento</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
            <div><label style={lbl}>Tipo</label><select style={inp} value={tipo} onChange={e => setTipo(e.target.value)}>{TIPOS_DOC.filter(t => t.id !== 'principal').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
            <div><label style={lbl}>Nº da nota (opcional)</label><input style={inp} value={numero} onChange={e => setNumero(e.target.value)} /></div>
            <div><label style={lbl}>Observação (opcional)</label><input style={inp} value={descricao} onChange={e => setDescricao(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '.45rem .8rem', borderRadius: 8, border: '1px dashed #6B1212', color: '#6B1212', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}><Upload size={14} />{file ? file.name.slice(0, 30) : 'Escolher foto ou PDF'}
              <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => setFile(e.target.files?.[0] || null)} /></label>
            <button onClick={adicionar} disabled={enviando || !file} style={{ padding: '.45rem 1rem', borderRadius: 8, border: 'none', background: !file ? '#9ca3af' : '#6B1212', color: '#fff', fontWeight: 700, cursor: enviando ? 'wait' : 'pointer', fontSize: 12.5 }}>{enviando ? 'Enviando…' : 'Anexar ao recebimento'}</button>
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Os documentos originais são preservados: novas notas e correções são acrescentadas, nunca substituem as anteriores.</div>
        </div>

        {sec('5 · Registro de Não Conformidade (RNC)')}
        {rncs.length === 0 ? <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>✓ Recebimento sem RNC</div> : rncs.map(r => (
          <div key={r.id} style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: '8px 10px', marginBottom: 6, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <b>{r.numero}</b><span style={{ fontWeight: 700 }}>{GRAV_RNC[r.status] || r.status}</span>
            </div>
            <div><b>Motivo:</b> {r.categoria || r.titulo || '—'}</div>
            <div><b>Produto/item:</b> {r.produto || '—'}</div>
            <div><b>Divergência:</b> {r.desvio_txt || '—'}</div>
            <div><b>Registrada por:</b> {r.aberto_por || '—'}</div>
            <a href={`${siteOrigin()}/?page=tarefas&rnc=${r.id}`} target="_blank" rel="noreferrer" style={{ color: '#6B1212', fontWeight: 700 }}>Abrir a RNC na Central de Tarefas →</a>
          </div>
        ))}
        <div style={{ textAlign: 'right', marginTop: 14 }}><button onClick={onClose} style={{ padding: '.5rem 1.2rem', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>Fechar</button></div>
      </div>
    </div>
  )
}

