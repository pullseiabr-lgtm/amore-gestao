import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Search, Trash2, ChevronLeft, Loader, Check, X,
  DollarSign, FileText, Clock, AlertTriangle, CheckCircle2, XCircle,
  Edit3, Download, Upload, Eye, RefreshCw, User, Calendar,
  Paperclip, Receipt,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchFinCreditos, insertFinCredito, updateFinCredito, deleteFinCredito,
  fetchFinPrestacoes, insertFinPrestacao, updateFinPrestacao, deleteFinPrestacao,
  fetchFinLancamentos, insertFinLancamento, updateFinLancamento, deleteFinLancamento,
  fetchFinAnexos, uploadFinComprovante, deleteFinAnexo,
  insertFinAuditoriaLog, fetchFinAuditoriaLog,
} from '../../lib/db'
import type {
  FinCredito, FinPrestacao, FinLancamento, FinAnexo, FinAuditoriaLog,
  FinCreditoStatus, FinPrestacaoStatus, FinFormaPagamento, FinAuditoriaStatus,
} from '../../types/database'

// ── Constantes ───────────────────────────────────────────────

const CATEGORIAS_DESPESA = [
  'Alimentos e Bebidas', 'Hortifrúti', 'Carnes e Proteínas', 'Laticínios',
  'Higiene e Limpeza', 'Embalagens e Descartáveis', 'Manutenção e Reparos',
  'Material de Escritório', 'Serviços Terceirizados', 'Transporte e Logística',
  'Utilities (Água/Luz/Gás)', 'Impostos e Taxas', 'Equipamentos', 'Uniformes e EPIs',
  'Marketing e Publicidade', 'Outros',
]

const FORMAS_PGTO: { value: FinFormaPagamento; label: string }[] = [
  { value: 'pix',          label: 'PIX' },
  { value: 'dinheiro',     label: 'Dinheiro' },
  { value: 'cartao',       label: 'Cartão' },
  { value: 'transferencia',label: 'Transferência' },
]

const CFG_STATUS_CREDITO: Record<FinCreditoStatus, { label: string; color: string; bg: string }> = {
  aberto:              { label: 'Aberto',              color: '#1D4ED8', bg: '#DBEAFE' },
  em_utilizacao:       { label: 'Em utilização',       color: '#92400E', bg: '#FEF3C7' },
  prestacao_pendente:  { label: 'Prest. pendente',     color: '#B45309', bg: '#FEF3C7' },
  prestacao_enviada:   { label: 'Prest. enviada',      color: '#1D4ED8', bg: '#EDE9FE' },
  em_auditoria:        { label: 'Em auditoria',        color: '#6D28D9', bg: '#EDE9FE' },
  aprovado:            { label: 'Aprovado',             color: 'var(--success)', bg: '#D1FAE5' },
  reprovado:           { label: 'Reprovado',            color: 'var(--danger)',  bg: '#FEE2E2' },
  finalizado:          { label: 'Finalizado',           color: '#374151', bg: '#F3F4F6' },
}

const CFG_STATUS_PRESTACAO: Record<FinPrestacaoStatus, { label: string; color: string; bg: string }> = {
  rascunho:    { label: 'Rascunho',   color: '#92400E', bg: '#FEF3C7' },
  enviada:     { label: 'Enviada',    color: '#1D4ED8', bg: '#DBEAFE' },
  em_auditoria:{ label: 'Em auditoria',color:'#6D28D9', bg: '#EDE9FE' },
  aprovada:    { label: 'Aprovada',   color: 'var(--success)', bg: '#D1FAE5' },
  reprovada:   { label: 'Reprovada',  color: 'var(--danger)',  bg: '#FEE2E2' },
}

const CFG_AUDITORIA: Record<FinAuditoriaStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pendente:  { label: 'Pendente', color: '#92400E', bg: '#FEF3C7', icon: <Clock size={11}/> },
  aprovado:  { label: 'Aprovado', color: 'var(--success)', bg: '#D1FAE5', icon: <CheckCircle2 size={11}/> },
  reprovado: { label: 'Reprovado',color: 'var(--danger)',  bg: '#FEE2E2', icon: <XCircle size={11}/> },
  correcao:  { label: 'Correção', color: '#1D4ED8', bg: '#DBEAFE', icon: <Edit3 size={11}/> },
}

// ── Helpers ──────────────────────────────────────────────────

const fmtR$ = (v: number | null | undefined) =>
  v == null ? '—' : `R$ ${v.toFixed(2).replace('.', ',')}`

const fmtDt = (d: string | null) => {
  if (!d) return '—'
  const [y, m, dd] = (d.length > 10 ? d.slice(0, 10) : d).split('-')
  return `${dd}/${m}/${y}`
}

const numFmt = (n: number) => String(n).padStart(4, '0')

// ── Toast ─────────────────────────────────────────────────────

function useToast() {
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const toast = (text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3500)
  }
  const ToastEl = msg ? (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: msg.type === 'ok' ? 'var(--success)' : 'var(--danger)',
      color: '#fff', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
      boxShadow: '0 4px 20px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {msg.type === 'ok' ? <Check size={14} /> : <X size={14} />} {msg.text}
    </div>
  ) : null
  return { toast, ToastEl }
}

// ── Badge ─────────────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bg, color,
    }}>{label}</span>
  )
}

// ── Gerador de PDF ────────────────────────────────────────────

function gerarPDF(prestacao: FinPrestacao, lancamentos: FinLancamento[], credito: FinCredito | null, company: string) {
  const M = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`
  const D = (d: string | null) => d ? (() => { const [y,m,dd]=d.slice(0,10).split('-'); return `${dd}/${m}/${y}` })() : '—'

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Prestação #${numFmt(prestacao.numero)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:32px}
h2{font-size:13px;color:#7B1835;margin:18px 0 8px;border-bottom:2px solid #7B1835;padding-bottom:3px}
.hd{display:flex;justify-content:space-between;margin-bottom:20px;border-bottom:3px solid #7B1835;padding-bottom:14px}
.logo{font-size:20px;font-weight:800;color:#7B1835}.sub{font-size:11px;color:#6b7280;margin-top:2px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.kpi{border:1px solid #e5e7eb;border-radius:7px;padding:10px;text-align:center}
.kl{font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
.kv{font-size:15px;font-weight:700;margin-top:3px}
table{width:100%;border-collapse:collapse;margin-top:6px}
th{background:#7B1835;color:#fff;padding:7px 9px;font-size:10px;text-align:left}
td{padding:6px 9px;border-bottom:1px solid #f3f4f6;font-size:11px}
tr:nth-child(even) td{background:#fafafa}
.ok{background:#D1FAE5;color:#065F46}.err{background:#FEE2E2;color:#991B1B}.pend{background:#FEF3C7;color:#92400E}
.badge{display:inline-block;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:700}
.pos{color:#065F46}.neg{color:#991B1B}
.foot{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px}
.sign{border-top:1px solid #9ca3af;padding-top:7px;text-align:center;color:#6b7280;font-size:10px;margin-top:36px}
@media print{body{padding:14px}@page{margin:.8cm}}
</style></head><body>
<div class="hd">
  <div>
    <div class="logo">${company}</div>
    <div style="font-weight:700;font-size:13px;color:#7B1835;margin-top:3px">PRESTAÇÃO DE CONTAS</div>
    <div class="sub">Nº ${numFmt(prestacao.numero)} · Emitido em ${new Date().toLocaleDateString('pt-BR')}</div>
  </div>
  <div style="text-align:right;font-size:11px;line-height:1.9;color:#374151">
    <div><strong>Responsável:</strong> ${prestacao.responsavel_nome}</div>
    <div><strong>Data:</strong> ${D(prestacao.data_prestacao)}</div>
    <div><strong>Status:</strong> ${prestacao.status.toUpperCase()}</div>
    ${credito ? `<div><strong>Crédito:</strong> #${numFmt(credito.numero)} — ${credito.objetivo}</div>` : ''}
    ${prestacao.auditado_por ? `<div><strong>Auditado por:</strong> ${prestacao.auditado_por}</div>` : ''}
  </div>
</div>
<h2>Resumo Financeiro</h2>
<div class="kpis">
  <div class="kpi"><div class="kl">Valor Recebido</div><div class="kv">${M(prestacao.valor_recebido)}</div></div>
  <div class="kpi"><div class="kl">Valor Utilizado</div><div class="kv">${M(prestacao.valor_utilizado)}</div></div>
  <div class="kpi"><div class="kl">Valor Devolvido</div><div class="kv">${M(prestacao.valor_devolvido)}</div></div>
  <div class="kpi"><div class="kl">Diferença</div><div class="kv ${prestacao.diferenca >= 0 ? 'pos' : 'neg'}">${M(Math.abs(prestacao.diferenca))} ${prestacao.diferenca >= 0 ? '✓' : '⚠'}</div></div>
</div>
<h2>Detalhamento das Despesas</h2>
<table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Fornecedor</th><th>Forma Pgto</th><th>Valor</th><th>Auditoria</th></tr></thead>
<tbody>
${lancamentos.map(l => `<tr>
  <td>${D(l.data_compra)}</td><td>${l.categoria}</td><td>${l.descricao}</td>
  <td>${l.fornecedor || '—'}</td><td>${l.forma_pagamento.toUpperCase()}</td>
  <td><strong>${M(l.valor)}</strong></td>
  <td><span class="badge ${l.status_auditoria === 'aprovado' ? 'ok' : l.status_auditoria === 'reprovado' ? 'err' : 'pend'}">${l.status_auditoria.toUpperCase()}</span></td>
</tr>`).join('')}
<tr><td colspan="5" style="text-align:right;font-weight:700;background:#f9fafb">TOTAL</td>
<td style="font-weight:700;background:#f9fafb">${M(lancamentos.reduce((s, l) => s + l.valor, 0))}</td><td style="background:#f9fafb"></td></tr>
</tbody></table>
${prestacao.obs_auditoria ? `<h2>Observações da Auditoria</h2><p style="padding:10px;background:#FEF3C7;border-radius:5px">${prestacao.obs_auditoria}</p>` : ''}
<div class="foot">
  <div><div class="sign">Assinatura do Responsável<br>${prestacao.responsavel_nome}</div></div>
  <div><div class="sign">Assinatura da Auditoria<br>${prestacao.auditado_por || '___________________________'}</div></div>
</div>
<p style="margin-top:24px;font-size:9px;color:#9ca3af;text-align:center">
  Gerado automaticamente — ${company} — Sistema Amore Gestão
</p>
<script>window.onload=function(){window.print()}</script>
</body></html>`
  const w = window.open('', '_blank', 'width=960,height=720')
  if (w) { w.document.write(html); w.document.close() }
}

// ── Modal: Novo/Editar Crédito ────────────────────────────────

function ModalCredito({ loja, credito, onSalvo, onFechar, user }: {
  loja: string; credito: FinCredito | null
  onSalvo: (c: FinCredito) => void; onFechar: () => void
  user: { name?: string } | null
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    responsavel_nome:  credito?.responsavel_nome  ?? (user?.name ?? ''),
    responsavel_cargo: credito?.responsavel_cargo ?? '',
    supervisor_nome:   credito?.supervisor_nome   ?? '',
    setor:             credito?.setor             ?? '',
    valor_liberado:    credito?.valor_liberado     ?? 0,
    data_liberacao:    credito?.data_liberacao     ?? hoje,
    objetivo:          credito?.objetivo           ?? '',
    forma_pagamento:   credito?.forma_pagamento    ?? 'pix' as FinFormaPagamento,
    prazo_prestacao:   credito?.prazo_prestacao    ?? '',
    observacoes:       credito?.observacoes        ?? '',
    status:            credito?.status             ?? 'aberto' as FinCreditoStatus,
  })
  const [saving, setSaving] = useState(false)
  const [errs, setErrs] = useState<Record<string, string>>({})

  const set = (k: string, v: unknown) => { setForm(f => ({ ...f, [k]: v })); setErrs(e => ({ ...e, [k]: '' })) }

  const salvar = async () => {
    const e: Record<string, string> = {}
    if (!form.responsavel_nome.trim()) e.responsavel_nome = 'Obrigatório'
    if (!form.objetivo.trim())         e.objetivo = 'Obrigatório'
    if (form.valor_liberado <= 0)      e.valor_liberado = 'Informe um valor'
    if (!form.data_liberacao)          e.data_liberacao = 'Obrigatório'
    if (Object.keys(e).length) { setErrs(e); return }
    setSaving(true)
    try {
      const payload = {
        loja, responsavel_nome: form.responsavel_nome.trim(),
        responsavel_cargo: form.responsavel_cargo || null,
        supervisor_nome: form.supervisor_nome || null,
        setor: form.setor || null,
        valor_liberado: Number(form.valor_liberado),
        data_liberacao: form.data_liberacao,
        objetivo: form.objetivo.trim(),
        forma_pagamento: form.forma_pagamento,
        prazo_prestacao: form.prazo_prestacao || null,
        observacoes: form.observacoes || null,
        status: form.status,
        created_by: user?.name ?? null,
      }
      const saved = credito ? await updateFinCredito(credito.id, payload) : await insertFinCredito(payload)
      onSalvo(saved)
    } catch (err: unknown) { console.error(err) }
    setSaving(false)
  }

  const F = ({ k, label, req, children }: { k: string; label: string; req?: boolean; children: React.ReactNode }) => (
    <div className="fg">
      <label className="fl">{label}{req && <span className="rq"> *</span>}</label>
      {children}
      {errs[k] && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errs[k]}</span>}
    </div>
  )

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="mhd">
          <span className="mtt">{credito ? `Editar Crédito #${numFmt(credito.numero)}` : 'Novo Crédito Operacional'}</span>
          <button className="mx" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <F k="responsavel_nome" label="Responsável pelo crédito" req>
              <input className={`inp${errs.responsavel_nome ? ' err' : ''}`} value={form.responsavel_nome} onChange={e => set('responsavel_nome', e.target.value)} />
            </F>
            <F k="responsavel_cargo" label="Cargo">
              <input className="inp" value={form.responsavel_cargo} onChange={e => set('responsavel_cargo', e.target.value)} placeholder="Ex: Gerente de Compras" />
            </F>
            <F k="supervisor_nome" label="Supervisor responsável">
              <input className="inp" value={form.supervisor_nome} onChange={e => set('supervisor_nome', e.target.value)} />
            </F>
            <F k="setor" label="Setor">
              <input className="inp" value={form.setor} onChange={e => set('setor', e.target.value)} placeholder="Ex: Cozinha, Salão, Compras" />
            </F>
            <F k="valor_liberado" label="Valor liberado" req>
              <input className={`inp${errs.valor_liberado ? ' err' : ''}`} type="number" min={0} step={0.01}
                value={form.valor_liberado} onChange={e => set('valor_liberado', e.target.value)} />
            </F>
            <F k="forma_pagamento" label="Forma de pagamento">
              <select className="sel" value={form.forma_pagamento} onChange={e => set('forma_pagamento', e.target.value as FinFormaPagamento)}>
                {FORMAS_PGTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </F>
            <F k="data_liberacao" label="Data da liberação" req>
              <input className={`inp${errs.data_liberacao ? ' err' : ''}`} type="date"
                value={form.data_liberacao} onChange={e => set('data_liberacao', e.target.value)} />
            </F>
            <F k="prazo_prestacao" label="Prazo da prestação de contas">
              <input className="inp" type="date" value={form.prazo_prestacao} onChange={e => set('prazo_prestacao', e.target.value)} />
            </F>
            <F k="status" label="Status">
              <select className="sel" value={form.status} onChange={e => set('status', e.target.value as FinCreditoStatus)}>
                {(Object.keys(CFG_STATUS_CREDITO) as FinCreditoStatus[]).map(s => (
                  <option key={s} value={s}>{CFG_STATUS_CREDITO[s].label}</option>
                ))}
              </select>
            </F>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Objetivo do crédito <span className="rq">*</span></label>
              <textarea className={`inp${errs.objetivo ? ' err' : ''}`} rows={2}
                value={form.objetivo} onChange={e => set('objetivo', e.target.value)}
                placeholder="Descreva para que o crédito será utilizado..." style={{ resize: 'vertical' }} />
              {errs.objetivo && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errs.objetivo}</span>}
            </div>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Observações</label>
              <textarea className="inp" rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onFechar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={12} className="spin" /> : <Check size={12} />} Salvar Crédito
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Nova Prestação ─────────────────────────────────────

function ModalPrestacao({ loja, creditos, prestacao, defaultCreditoId, onSalvo, onFechar, user }: {
  loja: string; creditos: FinCredito[]
  prestacao: FinPrestacao | null
  defaultCreditoId?: string
  onSalvo: (p: FinPrestacao) => void; onFechar: () => void
  user: { name?: string } | null
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const initCredId  = prestacao?.credito_id ?? defaultCreditoId ?? ''
  const initCredito = initCredId ? creditos.find(c => c.id === initCredId) : null
  const [form, setForm] = useState({
    credito_id:       initCredId,
    responsavel_nome: prestacao?.responsavel_nome ?? initCredito?.responsavel_nome ?? (user?.name ?? ''),
    data_prestacao:   prestacao?.data_prestacao   ?? hoje,
    valor_recebido:   prestacao?.valor_recebido   ?? initCredito?.valor_liberado   ?? 0,
    valor_devolvido:  prestacao?.valor_devolvido  ?? 0,
    observacoes:      prestacao?.observacoes      ?? '',
    status:           prestacao?.status           ?? 'rascunho' as FinPrestacaoStatus,
  })
  const [saving, setSaving] = useState(false)

  const selCredito = (id: string) => {
    const c = creditos.find(x => x.id === id)
    setForm(f => ({
      ...f, credito_id: id,
      responsavel_nome: c?.responsavel_nome ?? f.responsavel_nome,
      valor_recebido: c?.valor_liberado ?? f.valor_recebido,
    }))
  }

  const salvar = async () => {
    if (!form.responsavel_nome.trim()) return
    setSaving(true)
    try {
      const payload = {
        loja, credito_id: form.credito_id || null,
        responsavel_nome: form.responsavel_nome.trim(),
        data_prestacao: form.data_prestacao,
        valor_recebido: Number(form.valor_recebido),
        valor_utilizado: prestacao?.valor_utilizado ?? 0,
        valor_devolvido: Number(form.valor_devolvido),
        observacoes: form.observacoes || null,
        status: form.status,
        auditado_por: prestacao?.auditado_por ?? null,
        data_auditoria: prestacao?.data_auditoria ?? null,
        obs_auditoria: prestacao?.obs_auditoria ?? null,
        created_by: user?.name ?? null,
      }
      const saved = prestacao ? await updateFinPrestacao(prestacao.id, payload) : await insertFinPrestacao(payload)
      onSalvo(saved)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="mhd">
          <span className="mtt">{prestacao ? `Editar Prestação #${numFmt(prestacao.numero)}` : 'Nova Prestação de Contas'}</span>
          <button className="mx" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Crédito vinculado</label>
              <select className="sel" value={form.credito_id} onChange={e => selCredito(e.target.value)}>
                <option value="">Sem crédito vinculado</option>
                {creditos.filter(c => c.status !== 'finalizado' && c.status !== 'reprovado').map(c => (
                  <option key={c.id} value={c.id}>#{numFmt(c.numero)} — {c.objetivo} — {fmtR$(c.valor_liberado)}</option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Responsável <span className="rq">*</span></label>
              <input className="inp" value={form.responsavel_nome} onChange={e => setForm(f => ({ ...f, responsavel_nome: e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Data da prestação</label>
              <input className="inp" type="date" value={form.data_prestacao} onChange={e => setForm(f => ({ ...f, data_prestacao: e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">Valor recebido</label>
              <input className="inp" type="number" min={0} step={0.01} value={form.valor_recebido} onChange={e => setForm(f => ({ ...f, valor_recebido: Number(e.target.value) }))} />
            </div>
            <div className="fg">
              <label className="fl">Valor devolvido</label>
              <input className="inp" type="number" min={0} step={0.01} value={form.valor_devolvido} onChange={e => setForm(f => ({ ...f, valor_devolvido: Number(e.target.value) }))} />
            </div>
            <div className="fg">
              <label className="fl">Status</label>
              <select className="sel" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as FinPrestacaoStatus }))}>
                {(Object.keys(CFG_STATUS_PRESTACAO) as FinPrestacaoStatus[]).map(s => (
                  <option key={s} value={s}>{CFG_STATUS_PRESTACAO[s].label}</option>
                ))}
              </select>
            </div>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Observações</label>
              <textarea className="inp" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onFechar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={12} className="spin" /> : <Check size={12} />} Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Novo Lançamento ────────────────────────────────────

function ModalLancamento({ prestacaoId, lancamento, onSalvo, onFechar }: {
  prestacaoId: string; lancamento: FinLancamento | null
  onSalvo: (l: FinLancamento) => void; onFechar: () => void
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    categoria:       lancamento?.categoria       ?? '',
    descricao:       lancamento?.descricao       ?? '',
    fornecedor:      lancamento?.fornecedor      ?? '',
    valor:           lancamento?.valor           ?? 0,
    data_compra:     lancamento?.data_compra     ?? hoje,
    forma_pagamento: lancamento?.forma_pagamento ?? 'pix' as FinFormaPagamento,
    observacao:      lancamento?.observacao      ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [errs, setErrs] = useState<Record<string, string>>({})

  const salvar = async () => {
    const e: Record<string, string> = {}
    if (!form.categoria)    e.categoria = 'Obrigatório'
    if (!form.descricao.trim()) e.descricao = 'Obrigatório'
    if (form.valor <= 0)    e.valor = 'Informe o valor'
    if (!form.data_compra)  e.data_compra = 'Obrigatório'
    if (Object.keys(e).length) { setErrs(e); return }
    setSaving(true)
    try {
      const payload = {
        prestacao_id: prestacaoId,
        categoria: form.categoria, descricao: form.descricao.trim(),
        fornecedor: form.fornecedor || null, valor: Number(form.valor),
        data_compra: form.data_compra, forma_pagamento: form.forma_pagamento,
        observacao: form.observacao || null,
        status_auditoria: lancamento?.status_auditoria ?? 'pendente' as FinAuditoriaStatus,
        obs_auditoria: lancamento?.obs_auditoria ?? null,
      }
      const saved = lancamento ? await updateFinLancamento(lancamento.id, payload) : await insertFinLancamento(payload)
      onSalvo(saved)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="mhd">
          <span className="mtt">{lancamento ? 'Editar Lançamento' : 'Adicionar Lançamento'}</span>
          <button className="mx" onClick={onFechar}>✕</button>
        </div>
        <div className="mbd">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Categoria <span className="rq">*</span></label>
              <select className={`sel${errs.categoria ? ' err' : ''}`} value={form.categoria} onChange={e => { setForm(f => ({ ...f, categoria: e.target.value })); setErrs(x => ({ ...x, categoria: '' })) }}>
                <option value="">Selecione a categoria</option>
                {CATEGORIAS_DESPESA.map(c => <option key={c}>{c}</option>)}
              </select>
              {errs.categoria && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errs.categoria}</span>}
            </div>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Produto / Serviço <span className="rq">*</span></label>
              <input className={`inp${errs.descricao ? ' err' : ''}`} value={form.descricao}
                onChange={e => { setForm(f => ({ ...f, descricao: e.target.value })); setErrs(x => ({ ...x, descricao: '' })) }}
                placeholder="Ex: Frango inteiro 3kg, Reparo da geladeira..." />
              {errs.descricao && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errs.descricao}</span>}
            </div>
            <div className="fg">
              <label className="fl">Fornecedor</label>
              <input className="inp" value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
            </div>
            <div className="fg">
              <label className="fl">Valor <span className="rq">*</span></label>
              <input className={`inp${errs.valor ? ' err' : ''}`} type="number" min={0} step={0.01}
                value={form.valor} onChange={e => { setForm(f => ({ ...f, valor: Number(e.target.value) })); setErrs(x => ({ ...x, valor: '' })) }} />
              {errs.valor && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errs.valor}</span>}
            </div>
            <div className="fg">
              <label className="fl">Data da compra <span className="rq">*</span></label>
              <input className={`inp${errs.data_compra ? ' err' : ''}`} type="date" value={form.data_compra}
                onChange={e => { setForm(f => ({ ...f, data_compra: e.target.value })); setErrs(x => ({ ...x, data_compra: '' })) }} />
              {errs.data_compra && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errs.data_compra}</span>}
            </div>
            <div className="fg">
              <label className="fl">Forma de pagamento</label>
              <select className="sel" value={form.forma_pagamento} onChange={e => setForm(f => ({ ...f, forma_pagamento: e.target.value as FinFormaPagamento }))}>
                {FORMAS_PGTO.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="fg" style={{ gridColumn: '1 / -1' }}>
              <label className="fl">Observação</label>
              <input className="inp" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Informações adicionais..." />
            </div>
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onFechar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={12} className="spin" /> : <Check size={12} />} Salvar Lançamento
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: Auditoria ──────────────────────────────────────────

function ModalAuditoria({ lancamento, onSalvo, onFechar, userName }: {
  lancamento: FinLancamento; onSalvo: (l: FinLancamento) => void; onFechar: () => void; userName: string
}) {
  const [acao, setAcao] = useState<FinAuditoriaStatus>(lancamento.status_auditoria)
  const [obs, setObs] = useState(lancamento.obs_auditoria ?? '')
  const [saving, setSaving] = useState(false)

  const salvar = async () => {
    setSaving(true)
    try {
      const updated = await updateFinLancamento(lancamento.id, { status_auditoria: acao, obs_auditoria: obs || null })
      await insertFinAuditoriaLog({
        loja: null, entidade: 'lancamento', entidade_id: lancamento.id,
        acao: `Auditoria: ${acao}`, detalhe: obs || null, usuario: userName,
      })
      onSalvo(updated)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="mhd"><span className="mtt">Auditar Lançamento</span><button className="mx" onClick={onFechar}>✕</button></div>
        <div className="mbd">
          <div style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 12 }}>
            <strong>{lancamento.descricao}</strong> — {fmtR$(lancamento.valor)}<br />
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{lancamento.categoria} · {fmtDt(lancamento.data_compra)}</span>
          </div>
          <div className="fg" style={{ marginBottom: 12 }}>
            <label className="fl">Resultado da auditoria</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(CFG_AUDITORIA) as FinAuditoriaStatus[]).map(s => {
                const c = CFG_AUDITORIA[s]
                return (
                  <button key={s} onClick={() => setAcao(s)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: `2px solid ${acao === s ? c.color : 'var(--border)'}`,
                      background: acao === s ? c.bg : 'transparent', color: acao === s ? c.color : 'var(--muted)',
                      cursor: 'pointer', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                    {c.icon} {c.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="fg">
            <label className="fl">Observação da auditoria</label>
            <textarea className="inp" rows={3} value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Descreva o resultado, solicitações de correção..." style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="mft">
          <button className="btn bo" onClick={onFechar}>Cancelar</button>
          <button className="btn bp" onClick={salvar} disabled={saving}>
            {saving ? <Loader size={12} className="spin" /> : <Check size={12} />} Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Linha de Lançamento (no Detalhe) ─────────────────────────

function LancamentoRow({ l, isAuditor, onEdit, onDelete, onAudit, onViewAnexos }: {
  l: FinLancamento; isAuditor: boolean
  onEdit: (l: FinLancamento) => void
  onDelete: (id: string) => void
  onAudit: (l: FinLancamento) => void
  onViewAnexos: (id: string) => void
}) {
  const cfg = CFG_AUDITORIA[l.status_auditoria]
  return (
    <tr style={{ background: l.status_auditoria === 'reprovado' ? '#FFF5F5' : l.status_auditoria === 'aprovado' ? '#F0FDF4' : undefined }}>
      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDt(l.data_compra)}</td>
      <td>
        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 12, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>
          {l.categoria}
        </span>
      </td>
      <td>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{l.descricao}</div>
        {l.observacao && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.observacao}</div>}
      </td>
      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{l.fornecedor || '—'}</td>
      <td style={{ fontSize: 11 }}>{FORMAS_PGTO.find(f => f.value === l.forma_pagamento)?.label ?? l.forma_pagamento}</td>
      <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--bordo)' }}>{fmtR$(l.valor)}</td>
      <td>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>
          {cfg.icon} {cfg.label}
        </span>
        {l.obs_auditoria && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.obs_auditoria}>{l.obs_auditoria}</div>}
      </td>
      <td>
        <div className="ab" style={{ gap: 3 }}>
          <button className="ib" onClick={() => onViewAnexos(l.id)} title="Comprovantes"><Paperclip size={12} /></button>
          <button className="ib" onClick={() => onEdit(l)} title="Editar"><Edit3 size={12} /></button>
          {isAuditor && <button className="ib" onClick={() => onAudit(l)} title="Auditar" style={{ color: 'var(--bordo)' }}><CheckCircle2 size={12} /></button>}
          <button className="ib rd" onClick={() => onDelete(l.id)} title="Excluir"><Trash2 size={12} /></button>
        </div>
      </td>
    </tr>
  )
}

// ── Painel de Anexos ──────────────────────────────────────────

function PainelAnexos({ lancamentoId, prestacaoId, userName, onFechar }: {
  lancamentoId: string; prestacaoId: string; userName: string; onFechar: () => void
}) {
  const [anexos, setAnexos] = useState<FinAnexo[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchFinAnexos(lancamentoId).then(setAnexos).catch(() => {}).finally(() => setLoading(false))
  }, [lancamentoId])

  const upload = async (file: File) => {
    setUploading(true); setErrMsg('')
    try {
      const novo = await uploadFinComprovante(file, lancamentoId, prestacaoId, userName)
      setAnexos(prev => [...prev, novo])
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      const isRLS = msg.toLowerCase().includes('row-level security') ||
                    msg.toLowerCase().includes('rls') ||
                    msg.toLowerCase().includes('new row violates') ||
                    msg.toLowerCase().includes('policy')
      if (isRLS) {
        setErrMsg('__RLS__')
      } else if (msg.toLowerCase().includes('bucket') || msg.toLowerCase().includes('not found')) {
        setErrMsg('__BUCKET__')
      } else {
        setErrMsg(`Erro no upload: ${msg}`)
      }
    }
    setUploading(false)
  }

  const remover = async (id: string) => {
    try { await deleteFinAnexo(id); setAnexos(prev => prev.filter(a => a.id !== id)) }
    catch (e) { console.error(e) }
  }

  const tipoIcon = (tipo: string) => tipo === 'pdf' ? '📄' : tipo === 'foto' ? '🖼️' : '📎'

  return (
    <div className="ov open" onClick={onFechar}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div className="mhd"><span className="mtt"><Paperclip size={13} /> Comprovantes</span><button className="mx" onClick={onFechar}>✕</button></div>
        <div className="mbd">
          {loading ? <div className="empty"><Loader size={20} className="spin" /></div> : (
            <>
              {anexos.length === 0 && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--muted)', fontSize: 13 }}>Nenhum comprovante anexado</div>}
              {anexos.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 20 }}>{tipoIcon(a.tipo)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome_arquivo}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.tamanho_kb ? `${a.tamanho_kb} KB · ` : ''}{fmtDt(a.created_at)}</div>
                  </div>
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="ib" title="Visualizar"><Eye size={12} /></a>
                  <a href={a.url} download className="ib" title="Download"><Download size={12} /></a>
                  <button className="ib rd" onClick={() => remover(a.id)} title="Remover"><Trash2 size={12} /></button>
                </div>
              ))}
              {errMsg === '__RLS__' && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 11.5, color: '#991B1B' }}>
                  <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={13} /> Política de segurança bloqueou o upload (RLS)
                  </div>
                  <p style={{ marginBottom: 8, lineHeight: 1.6 }}>
                    O Supabase recusou o arquivo com erro <code style={{ background: '#FEE2E2', padding: '1px 4px', borderRadius: 3 }}>new row violates row-level security policy</code>.
                  </p>
                  <p style={{ fontWeight: 700, marginBottom: 4 }}>Como corrigir no Supabase:</p>
                  <ol style={{ paddingLeft: 16, lineHeight: 2 }}>
                    <li>Acesse <strong>Storage → Buckets → fin-comprovantes → Policies</strong></li>
                    <li>Crie uma política de INSERT com: <code style={{ background: '#FEE2E2', padding: '1px 4px', borderRadius: 3 }}>auth.role() = 'authenticated'</code></li>
                    <li>Repita para SELECT, UPDATE e DELETE</li>
                    <li>Alternativamente, marque o bucket como <strong>Public</strong> (apenas para ambientes de desenvolvimento)</li>
                  </ol>
                </div>
              )}
              {errMsg === '__BUCKET__' && (
                <div style={{ marginTop: 12, padding: '12px 14px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 11.5, color: '#92400E' }}>
                  <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={13} /> Bucket de armazenamento não encontrado
                  </div>
                  <p style={{ lineHeight: 1.6 }}>
                    Crie o bucket <strong>fin-comprovantes</strong> em <strong>Supabase → Storage → New bucket</strong> e configure as políticas de acesso.
                  </p>
                </div>
              )}
              {errMsg && errMsg !== '__RLS__' && errMsg !== '__BUCKET__' && (
                <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEE2E2', borderRadius: 6, fontSize: 11, color: 'var(--danger)' }}>{errMsg}</div>
              )}
            </>
          )}
        </div>
        <div className="mft">
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) upload(e.target.files[0]); e.target.value = '' }} />
          <button className="btn bo bsm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader size={11} className="spin" /> : <Upload size={11} />} Anexar comprovante
          </button>
          <button className="btn bp" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

// ── Vista: Detalhe da Prestação ───────────────────────────────

function DetalheView({ prestacao: inicial, credito, user, companyName, onVoltar, onAtualizar, toast, ToastEl }: {
  prestacao: FinPrestacao; credito: FinCredito | null
  user: { name?: string; role?: string } | null
  companyName: string
  onVoltar: () => void; onAtualizar: (p: FinPrestacao) => void
  toast: (msg: string, t?: 'ok' | 'err') => void
  ToastEl: React.ReactNode
}) {
  const [prestacao, setPrestacao] = useState(inicial)
  const [lancamentos, setLancamentos] = useState<FinLancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [modalLanc, setModalLanc] = useState<FinLancamento | null | 'novo'>(null)
  const [modalAudit, setModalAudit] = useState<FinLancamento | null>(null)
  const [modalAnexos, setModalAnexos] = useState<string | null>(null)
  const [logs, setLogs] = useState<FinAuditoriaLog[]>([])
  const [showLog, setShowLog] = useState(false)

  // ── Reembolso (campos locais — saldo negativo) ────────────────
  const [reembolso, setReembolso] = useState({
    quem_pagou: '',
    autorizado_por: '',
    forma: 'pix' as 'pix' | 'dinheiro' | 'transferencia',
    status: 'pendente' as 'pendente' | 'em_andamento' | 'concluido',
    data: '',
    obs: '',
  })
  const [reembolsoSalvo, setReembolsoSalvo] = useState(false)
  const setR = (k: string, v: string) => { setReembolso(r => ({ ...r, [k]: v })); setReembolsoSalvo(false) }

  const isAuditor = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager'
  const userName = user?.name ?? 'Sistema'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [l, g] = await Promise.all([
        fetchFinLancamentos(prestacao.id),
        fetchFinAuditoriaLog(prestacao.id),
      ])
      setLancamentos(l)
      setLogs(g)
      // Recalcular totais
      const utilizado = l.reduce((s, x) => s + x.valor, 0)
      const p = await updateFinPrestacao(prestacao.id, {
        valor_utilizado: utilizado,
        diferenca: prestacao.valor_recebido - utilizado - prestacao.valor_devolvido,
      })
      setPrestacao(p); onAtualizar(p)
    } catch {}
    setLoading(false)
  }, [prestacao.id])

  useEffect(() => { load() }, [load])

  const handleSalvoLanc = async (l: FinLancamento) => {
    setLancamentos(prev => {
      const exists = prev.find(x => x.id === l.id)
      return exists ? prev.map(x => x.id === l.id ? l : x) : [...prev, l]
    })
    setModalLanc(null)
    toast(modalLanc === 'novo' ? 'Lançamento adicionado!' : 'Lançamento atualizado!')
    await load()
  }

  const handleDeleteLanc = async (id: string) => {
    try {
      await deleteFinLancamento(id)
      setLancamentos(prev => prev.filter(x => x.id !== id))
      toast('Lançamento removido')
      await load()
    } catch { toast('Erro ao remover', 'err') }
  }

  const handleAuditSalvo = async (l: FinLancamento) => {
    setLancamentos(prev => prev.map(x => x.id === l.id ? l : x))
    setModalAudit(null)
    toast('Auditoria registrada!')
  }

  const mudarStatus = async (status: FinPrestacaoStatus) => {
    try {
      const p = await updateFinPrestacao(prestacao.id, {
        status,
        auditado_por: isAuditor ? userName : prestacao.auditado_por,
        data_auditoria: isAuditor ? new Date().toISOString() : prestacao.data_auditoria,
      })
      setPrestacao(p); onAtualizar(p)
      await insertFinAuditoriaLog({ loja: null, entidade: 'prestacao', entidade_id: prestacao.id, acao: `Status → ${status}`, detalhe: null, usuario: userName })
      toast(`Status alterado: ${CFG_STATUS_PRESTACAO[status].label}`)
    } catch { toast('Erro ao alterar status', 'err') }
  }

  const auditados  = lancamentos.filter(l => l.status_auditoria === 'aprovado').length
  const reprovados = lancamentos.filter(l => l.status_auditoria === 'reprovado').length
  const totalLanc  = lancamentos.reduce((s, l) => s + l.valor, 0)
  const cfgStatus  = CFG_STATUS_PRESTACAO[prestacao.status]

  return (
    <div>
      {ToastEl}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
        <button className="btn bo bsm" onClick={onVoltar}><ChevronLeft size={12} /> Prestações</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Prestação #{numFmt(prestacao.numero)}</h2>
            <Badge label={cfgStatus.label} color={cfgStatus.color} bg={cfgStatus.bg} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span><User size={11} style={{ display: 'inline', marginRight: 3 }} />{prestacao.responsavel_nome}</span>
            <span><Calendar size={11} style={{ display: 'inline', marginRight: 3 }} />{fmtDt(prestacao.data_prestacao)}</span>
            {credito && <span><FileText size={11} style={{ display: 'inline', marginRight: 3 }} />Crédito #{numFmt(credito.numero)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn bo bsm" onClick={() => setShowLog(o => !o)}><Eye size={11} /> Log</button>
          <button className="btn bo bsm" onClick={() => gerarPDF(prestacao, lancamentos, credito, companyName)}><Download size={11} /> PDF</button>
          <select className="sel" value={prestacao.status} onChange={e => mudarStatus(e.target.value as FinPrestacaoStatus)}
            style={{ fontSize: 12, fontWeight: 700 }}>
            {(Object.keys(CFG_STATUS_PRESTACAO) as FinPrestacaoStatus[]).map(s => (
              <option key={s} value={s}>{CFG_STATUS_PRESTACAO[s].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Valor Recebido</div>
          <div className="kpi-val">{fmtR$(prestacao.valor_recebido)}</div>
          <div className="kpi-sub">crédito liberado</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--warning)' }} />
          <div className="kpi-lbl">Valor Utilizado</div>
          <div className="kpi-val">{fmtR$(totalLanc)}</div>
          <div className="kpi-sub">{lancamentos.length} lançamentos</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Valor Devolvido</div>
          <div className="kpi-val">{fmtR$(prestacao.valor_devolvido)}</div>
          <div className="kpi-sub">retorno ao caixa</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: prestacao.diferenca === 0 ? 'var(--success)' : prestacao.diferenca > 0 ? 'var(--success)' : 'var(--danger)' }} />
          <div className="kpi-lbl">Diferença</div>
          <div className="kpi-val" style={{ color: prestacao.diferenca === 0 ? 'var(--success)' : prestacao.diferenca > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {fmtR$(Math.abs(prestacao.diferenca))}
          </div>
          <div className="kpi-sub" style={{ color: prestacao.diferenca >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {prestacao.diferenca === 0 ? 'Zerado ✓' : prestacao.diferenca > 0 ? 'Saldo positivo' : 'Divergência ⚠'}
          </div>
        </div>
      </div>

      {/* ── Painel de Reembolso (saldo negativo) ─────────────── */}
      {prestacao.diferenca < 0 && (
        <div className="card" style={{ marginBottom: 14, border: '1.5px solid #FECACA' }}>
          <div className="card-hd" style={{ background: '#FEF2F2' }}>
            <span className="card-tt" style={{ color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} style={{ color: '#EF4444' }} />
              Reembolso Pendente — Saldo Negativo ({fmtR$(Math.abs(prestacao.diferenca))})
            </span>
            {reembolsoSalvo && (
              <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={11} /> Salvo localmente
              </span>
            )}
          </div>
          <div className="mbd" style={{ paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 14, padding: '8px 12px', background: '#FEF2F2', borderRadius: 7, lineHeight: 1.6 }}>
              A prestação apresenta saldo negativo de <strong>{fmtR$(Math.abs(prestacao.diferenca))}</strong>, indicando que o responsável gastou além do valor recebido.
              Preencha os dados de reembolso abaixo para registro e controle.
            </div>
            <div className="g2">
              <div className="fg">
                <label className="fl">Quem pagou o valor a mais <span className="rq">*</span></label>
                <input className="inp" value={reembolso.quem_pagou}
                  onChange={e => setR('quem_pagou', e.target.value)}
                  placeholder="Nome do colaborador ou responsável" />
              </div>
              <div className="fg">
                <label className="fl">Autorizado por <span className="rq">*</span></label>
                <input className="inp" value={reembolso.autorizado_por}
                  onChange={e => setR('autorizado_por', e.target.value)}
                  placeholder="Gerente / Supervisor que autorizou" />
              </div>
              <div className="fg">
                <label className="fl">Forma de reembolso</label>
                <select className="sel" value={reembolso.forma} onChange={e => setR('forma', e.target.value)}>
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="transferencia">Transferência Bancária</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Data do reembolso</label>
                <input className="inp" type="date" value={reembolso.data} onChange={e => setR('data', e.target.value)} />
              </div>
            </div>
            <div className="fg">
              <label className="fl">Status do reembolso</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(['pendente', 'em_andamento', 'concluido'] as const).map(s => (
                  <button key={s} className={`btn bsm ${reembolso.status === s ? 'bp' : 'bo'}`}
                    onClick={() => setR('status', s)}>
                    {s === 'pendente' ? '⏳ Pendente' : s === 'em_andamento' ? '🔄 Em andamento' : '✅ Concluído'}
                  </button>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Observações</label>
              <textarea className="txa" rows={2} value={reembolso.obs}
                onChange={e => setR('obs', e.target.value)}
                placeholder="Detalhes do reembolso, número de comprovante PIX, etc." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button className="btn bp bsm" onClick={() => {
                if (!reembolso.quem_pagou.trim() || !reembolso.autorizado_por.trim()) {
                  toast('Preencha "Quem pagou" e "Autorizado por"', 'err'); return
                }
                setReembolsoSalvo(true)
                toast('Dados de reembolso registrados!')
                insertFinAuditoriaLog({
                  loja: null, entidade: 'prestacao', entidade_id: prestacao.id,
                  acao: `Reembolso ${reembolso.status}`,
                  detalhe: `${fmtR$(Math.abs(prestacao.diferenca))} · ${reembolso.forma.toUpperCase()} · Pago por: ${reembolso.quem_pagou} · Autorizado: ${reembolso.autorizado_por}`,
                  usuario: userName,
                }).catch(() => {})
              }}>
                <Check size={11} /> Registrar reembolso
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progresso auditoria */}
      {lancamentos.length > 0 && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>Auditoria:</span>
          <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round((auditados / lancamentos.length) * 100)}%`, background: 'var(--success)', borderRadius: 99, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
            {auditados} aprovados · {reprovados} reprovados · {lancamentos.length - auditados - reprovados} pendentes
          </span>
        </div>
      )}

      {/* Lançamentos */}
      <div className="card">
        <div className="card-hd">
          <span className="card-tt"><Receipt size={13} style={{ display: 'inline', marginRight: 4 }} />Lançamentos da Prestação</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn bo bsm" onClick={load}><RefreshCw size={11} /></button>
            <button className="btn bp bsm" onClick={() => setModalLanc('novo')}><Plus size={11} /> Novo Lançamento</button>
          </div>
        </div>
        {loading ? (
          <div className="empty"><Loader size={22} className="spin" /></div>
        ) : lancamentos.length === 0 ? (
          <div className="empty" style={{ padding: '36px 0' }}>
            <Receipt size={36} style={{ opacity: .3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>Nenhum lançamento adicionado</div>
            <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={() => setModalLanc('novo')}><Plus size={11} /> Adicionar primeiro</button>
          </div>
        ) : (
          <>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Data</th><th>Categoria</th><th>Descrição</th>
                    <th>Fornecedor</th><th>Pagamento</th><th>Valor</th><th>Auditoria</th><th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lancamentos.map(l => (
                    <LancamentoRow key={l.id} l={l} isAuditor={isAuditor}
                      onEdit={x => setModalLanc(x)} onDelete={handleDeleteLanc}
                      onAudit={x => setModalAudit(x)} onViewAnexos={id => setModalAnexos(id)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
              <span>{lancamentos.length} lançamento(s)</span>
              <span>Total: <strong style={{ color: 'var(--text)' }}>{fmtR$(totalLanc)}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* Log de auditoria */}
      {showLog && logs.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-hd"><span className="card-tt"><Eye size={13} style={{ display: 'inline', marginRight: 4 }} />Histórico de Auditoria</span></div>
          <div style={{ padding: '6px 0' }}>
            {logs.map(log => (
              <div key={log.id} style={{ display: 'flex', gap: 12, padding: '7px 14px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDt(log.created_at)}</span>
                <span style={{ fontWeight: 700, color: 'var(--bordo)' }}>{log.acao}</span>
                {log.detalhe && <span style={{ color: 'var(--muted)' }}>{log.detalhe}</span>}
                <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>{log.usuario}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modais */}
      {modalLanc !== null && (
        <ModalLancamento
          prestacaoId={prestacao.id}
          lancamento={modalLanc === 'novo' ? null : modalLanc}
          onSalvo={handleSalvoLanc}
          onFechar={() => setModalLanc(null)} />
      )}
      {modalAudit && (
        <ModalAuditoria lancamento={modalAudit} onSalvo={handleAuditSalvo} onFechar={() => setModalAudit(null)} userName={userName} />
      )}
      {modalAnexos && (
        <PainelAnexos lancamentoId={modalAnexos} prestacaoId={prestacao.id} userName={userName} onFechar={() => setModalAnexos(null)} />
      )}
    </div>
  )
}

// ── Vista: Dashboard ──────────────────────────────────────────

function DashboardView({ creditos, prestacoes, onAbrirDetalhe, onNovoCredito, onNovaPrestacao }: {
  creditos: FinCredito[]; prestacoes: FinPrestacao[]
  onAbrirDetalhe: (id: string) => void
  onNovoCredito: () => void; onNovaPrestacao: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)

  const totalLiberado    = creditos.reduce((s, c) => s + c.valor_liberado, 0)
  const prestPendentes   = prestacoes.filter(p => p.status === 'rascunho' || p.status === 'enviada').length
  const emAuditoria      = prestacoes.filter(p => p.status === 'em_auditoria').length
  const totalAprovado    = prestacoes.filter(p => p.status === 'aprovada').reduce((s, p) => s + p.valor_utilizado, 0)
  const divergencias     = prestacoes.filter(p => p.diferenca !== 0 && p.status === 'aprovada').length

  const vencidos = creditos.filter(c =>
    c.prazo_prestacao && c.prazo_prestacao < today &&
    !['aprovado', 'reprovado', 'finalizado'].includes(c.status)
  )

  // Gastos por categoria (das prestações aprovadas — lançamentos não disponíveis aqui, mostramos por credito/objetivo)
  const creditosPorStatus = Object.entries(
    creditos.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + c.valor_liberado
      return acc
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1]).slice(0, 6)

  const maxVal = creditosPorStatus[0]?.[1] ?? 1

  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total Créditos Liberados</div>
          <div className="kpi-val" style={{ fontSize: totalLiberado > 99999 ? 18 : 24 }}>{fmtR$(totalLiberado)}</div>
          <div className="kpi-sub">{creditos.length} crédito(s)</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: prestPendentes > 0 ? 'var(--warning)' : 'var(--muted)' }} />
          <div className="kpi-lbl">Prestações Pendentes</div>
          <div className="kpi-val" style={{ color: prestPendentes > 0 ? 'var(--warning)' : 'var(--muted)' }}>{prestPendentes}</div>
          <div className="kpi-sub">aguardando envio/auditoria</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: emAuditoria > 0 ? '#6D28D9' : 'var(--muted)' }} />
          <div className="kpi-lbl">Em Auditoria</div>
          <div className="kpi-val" style={{ color: emAuditoria > 0 ? '#6D28D9' : 'var(--muted)' }}>{emAuditoria}</div>
          <div className="kpi-sub">prestações em análise</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: divergencias > 0 ? 'var(--danger)' : 'var(--success)' }} />
          <div className="kpi-lbl">Divergências Financeiras</div>
          <div className="kpi-val" style={{ color: divergencias > 0 ? 'var(--danger)' : 'var(--success)' }}>{divergencias}</div>
          <div className="kpi-sub">{divergencias === 0 ? 'Nenhuma divergência ✓' : 'Prestações com saldo'}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Créditos por status */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt"><DollarSign size={13} style={{ display: 'inline', marginRight: 4 }} />Créditos por Status</span>
            <button className="btn bp bsm" onClick={onNovoCredito}><Plus size={11} /> Novo Crédito</button>
          </div>
          {creditosPorStatus.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0', fontSize: 12 }}>Nenhum crédito registrado</div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {creditosPorStatus.map(([status, val]) => {
                const cfg = CFG_STATUS_CREDITO[status as FinCreditoStatus]
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cfg?.color ?? 'var(--muted)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1 }}>{cfg?.label ?? status}</span>
                    <div style={{ flex: 2, height: 5, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.round((val / maxVal) * 100)}%`, background: cfg?.color ?? 'var(--bordo)', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{fmtR$(val)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Prestações recentes */}
        <div className="card">
          <div className="card-hd">
            <span className="card-tt"><FileText size={13} style={{ display: 'inline', marginRight: 4 }} />Prestações Recentes</span>
            <button className="btn bp bsm" onClick={onNovaPrestacao}><Plus size={11} /> Nova</button>
          </div>
          {prestacoes.length === 0 ? (
            <div className="empty" style={{ padding: '20px 0', fontSize: 12 }}>Nenhuma prestação</div>
          ) : (
            <div>
              {prestacoes.slice(0, 6).map(p => {
                const cfg = CFG_STATUS_PRESTACAO[p.status]
                return (
                  <div key={p.id} onClick={() => onAbrirDetalhe(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>#{numFmt(p.numero)} — {p.responsavel_nome}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtDt(p.data_prestacao)}</div>
                    </div>
                    <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{fmtR$(p.valor_utilizado)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Alertas */}
      {vencidos.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div className="card-hd">
            <span className="card-tt" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} /> {vencidos.length} Crédito(s) com Prazo Vencido
            </span>
          </div>
          <div className="tw">
            <table>
              <thead><tr><th>Nº</th><th>Responsável</th><th>Objetivo</th><th>Prazo</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>
                {vencidos.map(c => (
                  <tr key={c.id} style={{ background: '#FFF5F5' }}>
                    <td style={{ fontWeight: 700 }}>#{numFmt(c.numero)}</td>
                    <td>{c.responsavel_nome}</td>
                    <td>{c.objetivo}</td>
                    <td style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmtDt(c.prazo_prestacao)}</td>
                    <td>{fmtR$(c.valor_liberado)}</td>
                    <td><Badge label={CFG_STATUS_CREDITO[c.status].label} color={CFG_STATUS_CREDITO[c.status].color} bg={CFG_STATUS_CREDITO[c.status].bg} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KPI aprovado */}
      {totalAprovado > 0 && (
        <div className="card" style={{ marginTop: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Total aprovado e auditado</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>{fmtR$(totalAprovado)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vista: Créditos ───────────────────────────────────────────

function CreditosView({ creditos, onEdit, onAdd, onDelete, onNovaPrestacao, toast }: {
  creditos: FinCredito[]
  onEdit: (c: FinCredito) => void; onAdd: () => void
  onDelete: (id: string) => void; onNovaPrestacao: (c: FinCredito) => void
  toast: (msg: string, t?: 'ok' | 'err') => void
}) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [confirmDel, setConfirmDel] = useState<FinCredito | null>(null)

  const filtrados = creditos
    .filter(c => !busca || c.responsavel_nome.toLowerCase().includes(busca.toLowerCase()) || c.objetivo.toLowerCase().includes(busca.toLowerCase()))
    .filter(c => !filtroStatus || c.status === filtroStatus)

  const excluir = async () => {
    if (!confirmDel) return
    try { await deleteFinCredito(confirmDel.id); onDelete(confirmDel.id); toast('Crédito excluído') }
    catch { toast('Erro ao excluir', 'err') }
    setConfirmDel(null)
  }

  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-tt"><DollarSign size={14} style={{ display: 'inline', marginRight: 4 }} />Créditos Operacionais</span>
        <button className="btn bp bsm" onClick={onAdd}><Plus size={11} /> Novo Crédito</button>
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="sw-wrap" style={{ flex: 1, minWidth: 180 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="srch" placeholder="Buscar responsável ou objetivo..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {(Object.keys(CFG_STATUS_CREDITO) as FinCreditoStatus[]).map(s => (
            <option key={s} value={s}>{CFG_STATUS_CREDITO[s].label}</option>
          ))}
        </select>
        {(busca || filtroStatus) && <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroStatus('') }}><X size={10} /> Limpar</button>}
      </div>
      {filtrados.length === 0 ? (
        <div className="empty" style={{ padding: '40px 0' }}>
          <DollarSign size={36} style={{ opacity: .3 }} />
          <div style={{ marginTop: 10, fontWeight: 600 }}>{creditos.length === 0 ? 'Nenhum crédito registrado' : 'Nenhum resultado'}</div>
          {creditos.length === 0 && <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={onAdd}><Plus size={11} /> Criar primeiro</button>}
        </div>
      ) : (
        <>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Nº</th><th>Responsável</th><th>Objetivo</th><th>Setor</th><th>Forma Pgto</th><th>Valor</th><th>Liberação</th><th>Prazo</th><th>Status</th><th style={{ width: 100 }}></th></tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const cfg = CFG_STATUS_CREDITO[c.status]
                  const vencido = c.prazo_prestacao && c.prazo_prestacao < new Date().toISOString().slice(0, 10) && !['aprovado', 'reprovado', 'finalizado'].includes(c.status)
                  return (
                    <tr key={c.id} style={{ background: vencido ? '#FFF5F5' : undefined }}>
                      <td><code style={{ fontSize: 10, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>#{numFmt(c.numero)}</code></td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 12 }}>{c.responsavel_nome}</div>
                        {c.responsavel_cargo && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{c.responsavel_cargo}</div>}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.objetivo}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{c.setor || '—'}</td>
                      <td style={{ fontSize: 11 }}>{FORMAS_PGTO.find(f => f.value === c.forma_pagamento)?.label}</td>
                      <td style={{ fontWeight: 800, color: 'var(--bordo)', fontSize: 13 }}>{fmtR$(c.valor_liberado)}</td>
                      <td style={{ fontSize: 11 }}>{fmtDt(c.data_liberacao)}</td>
                      <td style={{ fontSize: 11, color: vencido ? 'var(--danger)' : 'var(--muted)', fontWeight: vencido ? 700 : 400 }}>
                        {fmtDt(c.prazo_prestacao)} {vencido && '⚠'}
                      </td>
                      <td><Badge label={cfg.label} color={cfg.color} bg={cfg.bg} /></td>
                      <td>
                        <div className="ab" style={{ gap: 3 }}>
                          <button className="ib" onClick={() => onEdit(c)} title="Editar"><Edit3 size={12} /></button>
                          <button className="ib" onClick={() => onNovaPrestacao(c)} title="Nova prestação" style={{ color: 'var(--bordo)' }}><FileText size={12} /></button>
                          <button className="ib rd" onClick={() => setConfirmDel(c)} title="Excluir"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '7px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
            {filtrados.length} de {creditos.length} crédito(s) · Total: <strong>{fmtR$(filtrados.reduce((s, c) => s + c.valor_liberado, 0))}</strong>
          </div>
        </>
      )}
      {confirmDel && (
        <div className="ov open" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Excluir Crédito</span><button className="mx" onClick={() => setConfirmDel(null)}>✕</button></div>
            <div className="mbd"><p style={{ fontSize: 13 }}>Excluir crédito <strong>#{numFmt(confirmDel.numero)}</strong>? As prestações vinculadas perderão o vínculo.</p></div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={excluir}><Trash2 size={11} /> Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vista: Prestações ─────────────────────────────────────────

function PrestacoesView({ prestacoes, creditos, onAbrir, onNova, onDelete, toast }: {
  prestacoes: FinPrestacao[]; creditos: FinCredito[]
  onAbrir: (id: string) => void; onNova: () => void
  onDelete: (id: string) => void
  toast: (msg: string, t?: 'ok' | 'err') => void
}) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [confirmDel, setConfirmDel] = useState<FinPrestacao | null>(null)

  const filtrados = prestacoes
    .filter(p => !busca || p.responsavel_nome.toLowerCase().includes(busca.toLowerCase()))
    .filter(p => !filtroStatus || p.status === filtroStatus)

  const excluir = async () => {
    if (!confirmDel) return
    try { await deleteFinPrestacao(confirmDel.id); onDelete(confirmDel.id); toast('Prestação excluída') }
    catch { toast('Erro ao excluir', 'err') }
    setConfirmDel(null)
  }

  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-tt"><FileText size={14} style={{ display: 'inline', marginRight: 4 }} />Prestações de Contas</span>
        <button className="btn bp bsm" onClick={onNova}><Plus size={11} /> Nova Prestação</button>
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div className="sw-wrap" style={{ flex: 1, minWidth: 180 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="srch" placeholder="Buscar responsável..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {(Object.keys(CFG_STATUS_PRESTACAO) as FinPrestacaoStatus[]).map(s => (
            <option key={s} value={s}>{CFG_STATUS_PRESTACAO[s].label}</option>
          ))}
        </select>
        {(busca || filtroStatus) && <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroStatus('') }}><X size={10} /> Limpar</button>}
      </div>
      {filtrados.length === 0 ? (
        <div className="empty" style={{ padding: '40px 0' }}>
          <FileText size={36} style={{ opacity: .3 }} />
          <div style={{ marginTop: 10, fontWeight: 600 }}>{prestacoes.length === 0 ? 'Nenhuma prestação criada' : 'Nenhum resultado'}</div>
          {prestacoes.length === 0 && <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={onNova}><Plus size={11} /> Criar primeira</button>}
        </div>
      ) : (
        <>
          <div className="tw">
            <table>
              <thead>
                <tr><th>Nº</th><th>Responsável</th><th>Crédito</th><th>Data</th><th>Recebido</th><th>Utilizado</th><th>Devolvido</th><th>Diferença</th><th>Status</th><th style={{ width: 80 }}></th></tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const cfg = CFG_STATUS_PRESTACAO[p.status]
                  const cred = p.credito_id ? creditos.find(c => c.id === p.credito_id) : null
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onAbrir(p.id)}>
                      <td><code style={{ fontSize: 10, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>#{numFmt(p.numero)}</code></td>
                      <td style={{ fontWeight: 700, fontSize: 12 }}>{p.responsavel_nome}</td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{cred ? `#${numFmt(cred.numero)}` : '—'}</td>
                      <td style={{ fontSize: 11 }}>{fmtDt(p.data_prestacao)}</td>
                      <td style={{ fontSize: 12 }}>{fmtR$(p.valor_recebido)}</td>
                      <td style={{ fontSize: 12, fontWeight: 700 }}>{fmtR$(p.valor_utilizado)}</td>
                      <td style={{ fontSize: 12 }}>{fmtR$(p.valor_devolvido)}</td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 700, color: p.diferenca === 0 ? 'var(--success)' : p.diferenca > 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {p.diferenca === 0 ? '✓ 0,00' : (p.diferenca > 0 ? '+' : '') + fmtR$(p.diferenca).replace('R$ ', '')}
                        </span>
                      </td>
                      <td><Badge label={cfg.label} color={cfg.color} bg={cfg.bg} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="ab" style={{ gap: 3 }}>
                          <button className="ib" onClick={() => onAbrir(p.id)} title="Abrir"><Eye size={12} /></button>
                          <button className="ib rd" onClick={() => setConfirmDel(p)} title="Excluir"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '7px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
            {filtrados.length} prestação(ões) · Aprovadas: <strong>{fmtR$(filtrados.filter(p => p.status === 'aprovada').reduce((s, p) => s + p.valor_utilizado, 0))}</strong>
          </div>
        </>
      )}
      {confirmDel && (
        <div className="ov open" onClick={() => setConfirmDel(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="mhd"><span className="mtt">Excluir Prestação</span><button className="mx" onClick={() => setConfirmDel(null)}>✕</button></div>
            <div className="mbd"><p style={{ fontSize: 13 }}>Excluir prestação <strong>#{numFmt(confirmDel.numero)}</strong>? Todos os lançamentos e anexos serão removidos.</p></div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDel(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={excluir}><Trash2 size={11} /> Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────

export default function FinanceiroPage() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const { loja } = useLoja()
  const { toast, ToastEl } = useToast()

  const [creditos, setCreditos]     = useState<FinCredito[]>([])
  const [prestacoes, setPrestacoes] = useState<FinPrestacao[]>([])
  const [loading, setLoading]       = useState(true)
  const [mainTab, setMainTab]       = useState<'dashboard' | 'creditos' | 'prestacoes'>('dashboard')
  const [detalheId, setDetalheId]   = useState<string | null>(null)
  const [modalCred, setModalCred]   = useState<FinCredito | null | 'novo'>(null)
  const [modalPrest, setModalPrest] = useState<{ credito_id?: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([fetchFinCreditos(loja), fetchFinPrestacoes(loja)])
      setCreditos(c); setPrestacoes(p)
    } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const handleSalvoCredito = (c: FinCredito) => {
    setCreditos(prev => { const e = prev.find(x => x.id === c.id); return e ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev] })
    setModalCred(null)
    toast(modalCred === 'novo' ? 'Crédito criado!' : 'Crédito atualizado!')
  }

  const handleSalvoPrestacao = (p: FinPrestacao) => {
    setPrestacoes(prev => { const e = prev.find(x => x.id === p.id); return e ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev] })
    setModalPrest(null)
    toast('Prestação criada!'); setDetalheId(p.id)
  }

  // Vista detalhe da prestação
  if (detalheId) {
    const prestacao = prestacoes.find(p => p.id === detalheId)
    if (!prestacao) { setDetalheId(null); return null }
    const credito = prestacao.credito_id ? creditos.find(c => c.id === prestacao.credito_id) ?? null : null
    return (
      <DetalheView
        prestacao={prestacao} credito={credito}
        user={user} companyName={theme.company_name || 'Amore Gestão'}
        onVoltar={() => { setDetalheId(null); load() }}
        onAtualizar={p => setPrestacoes(prev => prev.map(x => x.id === p.id ? p : x))}
        toast={toast} ToastEl={ToastEl}
      />
    )
  }

  // KPIs globais
  const totalLib  = creditos.reduce((s, c) => s + c.valor_liberado, 0)
  const pPend     = prestacoes.filter(p => p.status === 'rascunho' || p.status === 'enviada').length
  const pAprov    = prestacoes.filter(p => p.status === 'aprovada').length
  const totalAprov = prestacoes.filter(p => p.status === 'aprovada').reduce((s, p) => s + p.valor_utilizado, 0)

  return (
    <div>
      {ToastEl}

      {/* KPIs topo */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total Liberado</div>
          <div className="kpi-val" style={{ fontSize: totalLib > 99999 ? 18 : 24 }}>{fmtR$(totalLib)}</div>
          <div className="kpi-sub">{creditos.length} crédito(s)</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: pPend > 0 ? 'var(--warning)' : 'var(--muted)' }} />
          <div className="kpi-lbl">Prest. Pendentes</div>
          <div className="kpi-val" style={{ color: pPend > 0 ? 'var(--warning)' : 'var(--muted)' }}>{pPend}</div>
          <div className="kpi-sub">aguardando</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Aprovadas</div>
          <div className="kpi-val" style={{ color: 'var(--success)' }}>{pAprov}</div>
          <div className="kpi-sub">prestações auditadas</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Total Aprovado</div>
          <div className="kpi-val" style={{ fontSize: totalAprov > 99999 ? 18 : 24 }}>{fmtR$(totalAprov)}</div>
          <div className="kpi-sub">gastos confirmados</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {([
          ['dashboard', '📊 Dashboard'],
          ['creditos',  '💳 Créditos'],
          ['prestacoes','📋 Prestações de Contas'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setMainTab(id)}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: mainTab === id ? 800 : 500,
              color: mainTab === id ? 'var(--bordo)' : 'var(--muted)',
              borderBottom: mainTab === id ? '2px solid var(--bordo)' : '2px solid transparent',
              marginBottom: -2, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <div className="empty"><Loader size={28} className="spin" /></div> : (
        <>
          {mainTab === 'dashboard' && (
            <DashboardView creditos={creditos} prestacoes={prestacoes}
              onAbrirDetalhe={setDetalheId}
              onNovoCredito={() => setModalCred('novo')}
              onNovaPrestacao={() => setModalPrest({})} />
          )}
          {mainTab === 'creditos' && (
            <CreditosView creditos={creditos}
              onEdit={c => setModalCred(c)}
              onAdd={() => setModalCred('novo')}
              onDelete={id => setCreditos(prev => prev.filter(c => c.id !== id))}
              onNovaPrestacao={c => setModalPrest({ credito_id: c.id })}
              toast={toast} />
          )}
          {mainTab === 'prestacoes' && (
            <PrestacoesView prestacoes={prestacoes} creditos={creditos}
              onAbrir={setDetalheId}
              onNova={() => setModalPrest({})}
              onDelete={id => setPrestacoes(prev => prev.filter(p => p.id !== id))}
              toast={toast} />
          )}
        </>
      )}

      {/* Modal Crédito */}
      {modalCred && (
        <ModalCredito
          loja={loja}
          credito={modalCred === 'novo' ? null : modalCred}
          onSalvo={handleSalvoCredito}
          onFechar={() => setModalCred(null)}
          user={user} />
      )}

      {/* Modal Prestação */}
      {modalPrest !== null && (
        <ModalPrestacao
          loja={loja} creditos={creditos}
          prestacao={null}
          defaultCreditoId={modalPrest.credito_id}
          onSalvo={handleSalvoPrestacao}
          onFechar={() => setModalPrest(null)}
          user={user} />
      )}
    </div>
  )
}
