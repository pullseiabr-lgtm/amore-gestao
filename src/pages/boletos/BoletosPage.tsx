import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, X, RefreshCw, Search, Trash2, CheckCircle2, AlertTriangle, Copy } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import { useAuth } from '../../contexts/AuthContext'
import { fetchBoletos, insertBoleto, updateBoleto, deleteBoleto } from '../../lib/db'
import type { Boleto, BoletoStatus } from '../../types/database'

const fmtR$ = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDt = (d: string | null) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '—'
const hojeISO = () => new Date().toISOString().slice(0, 10)
const diasAte = (d: string | null) => d ? Math.round((new Date(d + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null

const ST: Record<BoletoStatus, { label: string; cor: string; bg: string }> = {
  pendente: { label: 'Pendente', cor: '#b45309', bg: '#fef3c7' },
  pago:     { label: 'Pago',     cor: '#15803d', bg: '#dcfce7' },
  vencido:  { label: 'Vencido',  cor: '#dc2626', bg: '#fee2e2' },
  cancelado:{ label: 'Cancelado',cor: '#6b7280', bg: '#f3f4f6' },
}

// Vencido se passou da data e não está pago/cancelado
function statusEfetivo(b: Boleto): BoletoStatus {
  if (b.status === 'pago' || b.status === 'cancelado') return b.status
  const d = diasAte(b.data_vencimento)
  if (d != null && d < 0) return 'vencido'
  return 'pendente'
}

interface BoletoIA {
  linha_digitavel?: string; codigo_barras?: string; valor?: number; vencimento?: string
  banco?: string; beneficiario?: string; cnpj?: string; nota_fiscal?: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

async function lerBoletoIA(base64: string, mime: string): Promise<BoletoIA> {
  const apiKey = localStorage.getItem('gemini_api_key') || ''
  const params = new URLSearchParams({ model: 'gemini-2.5-flash' })
  if (apiKey) params.set('k', apiKey)
  const prompt = `Você é um leitor de boletos bancários brasileiros. Analise a imagem e extraia em JSON ESTRITO, sem texto fora do JSON:
{"linha_digitavel":"","codigo_barras":"","valor":0,"vencimento":"","banco":"","beneficiario":"","cnpj":"","nota_fiscal":""}
Datas em DD/MM/AAAA, ponto como separador decimal. Se não encontrar, use string vazia ou 0. Responda APENAS o JSON.`
  const resp = await fetch(`/api/gemini?${params}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }),
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data?.error || `Gemini HTTP ${resp.status}`)
  let txt: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  txt = txt.replace(/```json/gi, '').replace(/```/g, '').trim()
  const s = txt.indexOf('{'); const e = txt.lastIndexOf('}')
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1)
  return JSON.parse(txt)
}

// dd/mm/aaaa → aaaa-mm-dd
function brToISO(d?: string): string {
  if (!d) return ''
  const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d.slice(0, 10)
}

const emptyForm = () => ({
  fornecedor: '', nota_fiscal_numero: '', valor: '', data_emissao: hojeISO(), data_vencimento: '',
  banco: '', beneficiario: '', cnpj: '', linha_digitavel: '', codigo_barras: '', observacao: '',
})

export default function BoletosPage() {
  const { loja } = useLoja()
  const { user } = useAuth()
  const [boletos, setBoletos] = useState<Boleto[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'todos' | BoletoStatus>('todos')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [lendo, setLendo] = useState(false)
  const [erroIA, setErroIA] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setBoletos(await fetchBoletos(loja)) } finally { setLoading(false) }
  }, [loja])
  useEffect(() => { load() }, [load])

  const onFoto = async (file: File | undefined) => {
    if (!file) return
    setErroIA(''); setLendo(true)
    try {
      const b64 = await fileToBase64(file)
      const d = await lerBoletoIA(b64, file.type || 'image/jpeg')
      setForm(f => ({
        ...f,
        valor: d.valor ? String(d.valor) : f.valor,
        data_vencimento: brToISO(d.vencimento) || f.data_vencimento,
        banco: d.banco || f.banco,
        beneficiario: d.beneficiario || f.beneficiario,
        fornecedor: f.fornecedor || d.beneficiario || '',
        cnpj: d.cnpj || f.cnpj,
        linha_digitavel: d.linha_digitavel || f.linha_digitavel,
        codigo_barras: d.codigo_barras || f.codigo_barras,
        nota_fiscal_numero: d.nota_fiscal || f.nota_fiscal_numero,
      }))
    } catch (e) { setErroIA((e as Error).message || 'Não foi possível ler o boleto.') }
    finally { setLendo(false) }
  }

  const salvar = async () => {
    if (!form.valor || !form.data_vencimento) return
    setSaving(true)
    try {
      await insertBoleto({
        loja,
        nota_fiscal_numero: form.nota_fiscal_numero || null,
        fornecedor: form.fornecedor || null,
        cnpj: form.cnpj || null,
        banco: form.banco || null,
        beneficiario: form.beneficiario || null,
        valor: Number(form.valor) || 0,
        data_emissao: form.data_emissao || null,
        data_vencimento: form.data_vencimento || null,
        codigo_barras: form.codigo_barras || null,
        linha_digitavel: form.linha_digitavel || null,
        status: 'pendente',
        data_pagamento: null,
        comprovante_obs: null,
        observacao: form.observacao || null,
        created_by: user?.name || null,
      })
      setShowForm(false); setForm(emptyForm()); setErroIA('')
      await load()
    } finally { setSaving(false) }
  }

  const marcarPago = async (b: Boleto) => {
    await updateBoleto(b.id, { status: 'pago', data_pagamento: hojeISO() })
    await load()
  }
  const cancelar = async (b: Boleto) => {
    await updateBoleto(b.id, { status: 'cancelado' })
    await load()
  }
  const excluir = async (b: Boleto) => {
    if (!confirm('Excluir este boleto?')) return
    await deleteBoleto(b.id); await load()
  }
  const copiar = (txt: string) => { navigator.clipboard?.writeText(txt) }

  // Filtro
  const filtrados = boletos.filter(b => {
    const ef = statusEfetivo(b)
    if (filtro !== 'todos' && ef !== filtro) return false
    if (busca) {
      const t = busca.toLowerCase()
      if (!(b.fornecedor || '').toLowerCase().includes(t) && !(b.nota_fiscal_numero || '').toLowerCase().includes(t) && !(b.beneficiario || '').toLowerCase().includes(t)) return false
    }
    return true
  })

  // Métricas
  const aPagar = boletos.filter(b => statusEfetivo(b) === 'pendente')
  const vencidos = boletos.filter(b => statusEfetivo(b) === 'vencido')
  const vencendo = boletos.filter(b => { const d = diasAte(b.data_vencimento); return statusEfetivo(b) === 'pendente' && d != null && d >= 0 && d <= 3 })
  const totalAPagar = [...aPagar, ...vencidos].reduce((a, b) => a + b.valor, 0)
  const pagoMes = boletos.filter(b => b.status === 'pago' && b.data_pagamento && b.data_pagamento.slice(0, 7) === hojeISO().slice(0, 7)).reduce((a, b) => a + b.valor, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Central de Boletos</h2>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Boletos e pagamentos — loja <strong>{loja}</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> Atualizar</button>
          <button onClick={() => { setForm(emptyForm()); setErroIA(''); setShowForm(true) }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--bordo)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={15} /> Novo Boleto</button>
        </div>
      </div>

      {/* Métricas */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { lbl: 'Total a pagar', val: fmtR$(totalAPagar), cor: '#2563eb' },
            { lbl: 'Vencendo (3d)', val: vencendo.length, cor: '#d97706' },
            { lbl: 'Vencidos', val: vencidos.length, cor: '#dc2626' },
            { lbl: 'Pago no mês', val: fmtR$(pagoMes), cor: '#16a34a' },
          ].map(m => (
            <div key={m.lbl} style={{ flex: '1 1 140px', minWidth: 140, background: 'var(--card)', border: '1px solid var(--border)', borderTop: `3px solid ${m.cor}`, borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: m.cor, lineHeight: 1.1 }}>{m.val}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{m.lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* Alertas */}
      {!loading && (vencidos.length > 0 || vencendo.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {vencidos.length > 0 && <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px' }}>⚠ {vencidos.length} boleto(s) vencido(s) — {fmtR$(vencidos.reduce((a, b) => a + b.valor, 0))}.</div>}
          {vencendo.length > 0 && <div style={{ fontSize: 12.5, color: '#d97706', background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px' }}>⏳ {vencendo.length} boleto(s) vencem em até 3 dias.</div>}
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar fornecedor ou NF..." style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }} />
        </div>
        <select value={filtro} onChange={e => setFiltro(e.target.value as 'todos' | BoletoStatus)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', fontSize: 13 }}>
          <option value="todos">Todos</option>
          <option value="pendente">Pendentes</option>
          <option value="vencido">Vencidos</option>
          <option value="pago">Pagos</option>
          <option value="cancelado">Cancelados</option>
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 50, color: 'var(--muted)' }}><Loader2 size={30} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} /></div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Nenhum boleto.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map(b => {
            const ef = statusEfetivo(b)
            const d = diasAte(b.data_vencimento)
            return (
              <div key={b.id} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 14 }}>{b.fornecedor || b.beneficiario || 'Boleto'}</strong>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: ST[ef].bg, color: ST[ef].cor }}>{ST[ef].label}</span>
                    {b.nota_fiscal_numero && <span style={{ fontSize: 10, color: 'var(--muted)' }}>NF {b.nota_fiscal_numero}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                    {b.banco ? `${b.banco} · ` : ''}Venc: {fmtDt(b.data_vencimento)}{ef === 'pendente' && d != null ? ` (${d === 0 ? 'hoje' : d > 0 ? `em ${d}d` : `${-d}d atrás`})` : ''}{b.status === 'pago' && b.data_pagamento ? ` · pago ${fmtDt(b.data_pagamento)}` : ''}
                  </div>
                  {b.linha_digitavel && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{b.linha_digitavel}</span>
                      <button onClick={() => copiar(b.linha_digitavel!)} title="Copiar linha digitável" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bordo)', padding: 0 }}><Copy size={12} /></button>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtR$(b.valor)}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {b.status !== 'pago' && b.status !== 'cancelado' && <button onClick={() => marcarPago(b)} title="Marcar como pago" style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: '#15803d', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={13} /> Pago</button>}
                  {b.status !== 'cancelado' && b.status !== 'pago' && <button onClick={() => cancelar(b)} title="Cancelar" style={{ padding: '6px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>Cancelar</button>}
                  <button onClick={() => excluir(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}><Trash2 size={14} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Novo Boleto */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Novo Boleto</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            {/* Captura por foto */}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px', borderRadius: 8, border: '1px dashed var(--bordo)', background: 'var(--bg)', cursor: lendo ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--bordo)', marginBottom: 8 }}>
              {lendo ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Lendo o boleto…</> : <>📷 Ler boleto por foto (IA)</>}
              <input type="file" accept="image/*" capture="environment" disabled={lendo} onChange={e => onFoto(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
            {erroIA && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠ {erroIA}</div>}

            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Fornecedor"><input value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} style={inp} /></Field>
                <Field label="Nº Nota Fiscal"><input value={form.nota_fiscal_numero} onChange={e => setForm(f => ({ ...f, nota_fiscal_numero: e.target.value }))} style={inp} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Valor (R$) *"><input type="number" step="0.01" min="0" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} style={inp} /></Field>
                <Field label="Vencimento *"><input type="date" value={form.data_vencimento} onChange={e => setForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} /></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Banco"><input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} style={inp} /></Field>
                <Field label="CNPJ"><input value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} style={inp} /></Field>
              </div>
              <Field label="Beneficiário"><input value={form.beneficiario} onChange={e => setForm(f => ({ ...f, beneficiario: e.target.value }))} style={inp} /></Field>
              <Field label="Linha digitável"><input value={form.linha_digitavel} onChange={e => setForm(f => ({ ...f, linha_digitavel: e.target.value }))} style={{ ...inp, fontFamily: 'monospace' }} /></Field>
              <Field label="Observação"><input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} style={inp} /></Field>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={salvar} disabled={saving || !form.valor || !form.data_vencimento} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? 'var(--border)' : 'var(--bordo)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}><AlertTriangle size={12} /> Boletos vencidos são sinalizados automaticamente pela data.</div>}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{label}</label>{children}</div>
}
