import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Trash2, Edit3, Check, X, Upload, ShieldCheck, ShieldOff, Ban } from 'lucide-react'
import { useLoja } from '../../contexts/LojaContext'
import {
  fetchMktContatos, insertMktContato, updateMktContato, deleteMktContato, upsertMktContatos,
  type MktContato, type MktContatoStatus, type MktContatoOrigem,
} from '../../lib/db'

const ORIGENS: { id: MktContatoOrigem; label: string }[] = [
  { id: 'qr_code', label: 'QR Code' }, { id: 'wifi', label: 'Wi-Fi' },
  { id: 'delivery', label: 'Delivery' }, { id: 'site', label: 'Site' },
  { id: 'instagram', label: 'Instagram' }, { id: 'presencial', label: 'Presencial' },
  { id: 'manual', label: 'Manual' }, { id: 'importacao', label: 'Importação' },
]
const STATUS_INFO: Record<MktContatoStatus, { label: string; bg: string; color: string }> = {
  ativo:     { label: 'Ativo',     bg: '#D1FAE5', color: '#065F46' },
  cancelado: { label: 'Cancelado', bg: '#FEF3C7', color: '#92400E' },
  bloqueado: { label: 'Bloqueado', bg: '#FEE2E2', color: '#991B1B' },
}
const soDigitos = (s: string) => (s || '').replace(/\D/g, '')
const EMPTY = { nome: '', telefone: '', email: '', origem: 'manual' as MktContatoOrigem, status: 'ativo' as MktContatoStatus, aniversario: '', observacoes: '' }

export default function ContatosPage() {
  const { loja } = useLoja()
  const [contatos, setContatos] = useState<MktContato[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState<'todos' | MktContatoStatus>('todos')
  const [fOrigem, setFOrigem] = useState<'todas' | MktContatoOrigem>('todas')
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importTxt, setImportTxt] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setContatos(await fetchMktContatos(loja))
    setLoading(false)
  }, [loja])
  useEffect(() => { load() }, [load])

  const filtrados = contatos.filter(c => {
    const q = busca.toLowerCase()
    const mB = !q || c.nome.toLowerCase().includes(q) || (c.telefone || '').includes(q)
    const mS = fStatus === 'todos' || c.status === fStatus
    const mO = fOrigem === 'todas' || c.origem === fOrigem
    return mB && mS && mO
  })
  const stats = {
    total: contatos.length,
    ativo: contatos.filter(c => c.status === 'ativo').length,
    cancelado: contatos.filter(c => c.status === 'cancelado').length,
    bloqueado: contatos.filter(c => c.status === 'bloqueado').length,
  }

  function abrirNovo() { setEditId(null); setForm(EMPTY); setErro(''); setModal(true) }
  function abrirEdit(c: MktContato) {
    setEditId(c.id)
    setForm({ nome: c.nome, telefone: c.telefone, email: c.email || '', origem: (c.origem || 'manual'), status: c.status, aniversario: c.aniversario || '', observacoes: c.observacoes || '' })
    setErro(''); setModal(true)
  }

  async function salvar() {
    if (!form.nome.trim()) { setErro('Informe o nome.'); return }
    const tel = soDigitos(form.telefone)
    if (tel.length < 10) { setErro('Telefone inválido (com DDD).'); return }
    setSaving(true); setErro('')
    try {
      const base = {
        loja: loja && loja !== 'Todas as Lojas' ? loja : null,
        nome: form.nome.trim(), telefone: tel, email: form.email.trim() || null,
        origem: form.origem, status: form.status,
        consentimento: form.status === 'ativo',
        aniversario: form.aniversario || null, observacoes: form.observacoes.trim() || null,
      }
      if (editId) {
        await updateMktContato(editId, base)
      } else {
        await insertMktContato({ ...base, data_optin: new Date().toISOString(), data_optout: null, ultima_compra: null, ticket_medio: 0, total_pedidos: 0, categoria_favorita: null, tags: [] })
      }
      setModal(false); load()
    } catch (e: any) {
      setErro(e?.message?.includes('duplicate') ? 'Esse telefone já está cadastrado.' : (e?.message || 'Erro ao salvar.'))
    }
    setSaving(false)
  }

  // Opt-out / Opt-in / Bloquear
  async function mudarStatus(c: MktContato, novo: MktContatoStatus) {
    const patch: Partial<MktContato> = { status: novo, consentimento: novo === 'ativo' }
    if (novo === 'cancelado' || novo === 'bloqueado') patch.data_optout = new Date().toISOString()
    if (novo === 'ativo') { patch.data_optin = new Date().toISOString(); patch.data_optout = null }
    await updateMktContato(c.id, patch)
    load()
  }

  async function excluir(c: MktContato) {
    if (!confirm(`Excluir o contato "${c.nome}"? (Permanente)`)) return
    await deleteMktContato(c.id); load()
  }

  // Importação: uma linha por contato → "Nome, telefone" ou "Nome;telefone"
  async function importar() {
    setImportBusy(true)
    const linhas = importTxt.split('\n').map(l => l.trim()).filter(Boolean)
    const novos = linhas.map(l => {
      const partes = l.split(/[;,\t]/).map(p => p.trim())
      const nome = partes[0] || 'Sem nome'
      const tel = soDigitos(partes[1] || partes[0])
      return { nome, tel }
    }).filter(x => x.tel.length >= 10)
    const payload = novos.map(n => ({
      loja: loja && loja !== 'Todas as Lojas' ? loja : null,
      nome: n.nome, telefone: n.tel, email: null, origem: 'importacao' as MktContatoOrigem,
      consentimento: true, data_optin: new Date().toISOString(), data_optout: null,
      status: 'ativo' as MktContatoStatus, aniversario: null, ultima_compra: null,
      ticket_medio: 0, total_pedidos: 0, categoria_favorita: null, tags: [], observacoes: null,
    }))
    try {
      const n = await upsertMktContatos(payload)
      alert(`${n} contato(s) importado(s). ${linhas.length - novos.length} linha(s) ignorada(s) (telefone inválido).`)
      setImportOpen(false); setImportTxt(''); load()
    } catch (e: any) { alert('Erro ao importar: ' + (e?.message || '')) }
    setImportBusy(false)
  }

  return (
    <div className="content">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--wh)' }}>📋 Central de Consentimento</h1>
          <div style={{ fontSize: 12, color: 'var(--gr3)' }}>Contatos de marketing · opt-in/opt-out (LGPD). Só envia para quem autorizou.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}><Upload size={15} /> Importar</button>
          <button className="btn btn-al" onClick={abrirNovo}><Plus size={15} /> Novo contato</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { l: 'Total', v: stats.total, c: 'var(--al)' },
          { l: 'Ativos (autorizados)', v: stats.ativo, c: '#22C55E' },
          { l: 'Cancelados', v: stats.cancelado, c: '#F59E0B' },
          { l: 'Bloqueados', v: stats.bloqueado, c: '#EF4444' },
        ].map(k => (
          <div key={k.l} className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--gr3)' }}>{k.l}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.c }}>{loading ? '—' : k.v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--gr3)' }} />
          <input className="inp" style={{ paddingLeft: 32 }} placeholder="Buscar por nome ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="inp" style={{ width: 160 }} value={fStatus} onChange={e => setFStatus(e.target.value as any)}>
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativos</option><option value="cancelado">Cancelados</option><option value="bloqueado">Bloqueados</option>
        </select>
        <select className="inp" style={{ width: 160 }} value={fOrigem} onChange={e => setFOrigem(e.target.value as any)}>
          <option value="todas">Todas as origens</option>
          {ORIGENS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gr3)' }}>Carregando…</div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--gr3)' }}>Nenhum contato. Adicione ou importe.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--gr3)', fontSize: 11, borderBottom: '1px solid var(--bk4)' }}>
                <th style={{ padding: '10px 12px' }}>Nome</th><th>Telefone</th><th>Origem</th><th>Opt-in</th><th>Status</th><th style={{ textAlign: 'right', paddingRight: 12 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => {
                const si = STATUS_INFO[c.status]
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--bk4)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--wh)' }}>{c.nome}</td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--gr2)' }}>{c.telefone}</td>
                    <td style={{ color: 'var(--gr3)' }}>{ORIGENS.find(o => o.id === c.origem)?.label || '—'}</td>
                    <td style={{ color: 'var(--gr3)', fontSize: 11 }}>{c.data_optin ? new Date(c.data_optin).toLocaleDateString('pt-BR') : '—'}</td>
                    <td><span style={{ background: si.bg, color: si.color, borderRadius: 12, padding: '2px 8px', fontSize: 10.5, fontWeight: 700 }}>{si.label}</span></td>
                    <td style={{ textAlign: 'right', paddingRight: 12 }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        {c.status !== 'ativo' && <button className="btn btn-ghost btn-sm" title="Reativar (opt-in)" onClick={() => mudarStatus(c, 'ativo')}><ShieldCheck size={14} color="#22C55E" /></button>}
                        {c.status === 'ativo' && <button className="btn btn-ghost btn-sm" title="Cancelar (opt-out)" onClick={() => mudarStatus(c, 'cancelado')}><ShieldOff size={14} color="#F59E0B" /></button>}
                        {c.status !== 'bloqueado' && <button className="btn btn-ghost btn-sm" title="Bloquear" onClick={() => mudarStatus(c, 'bloqueado')}><Ban size={14} color="#EF4444" /></button>}
                        <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => abrirEdit(c)}><Edit3 size={14} /></button>
                        <button className="btn btn-ghost btn-sm" title="Excluir" onClick={() => excluir(c)}><Trash2 size={14} color="#EF4444" /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--gr3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={13} /> Regra LGPD: campanhas só serão enviadas para contatos com status <b style={{ color: '#22C55E' }}>Ativo</b> (autorizados).
      </div>

      {/* Modal contato */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-hd"><span>{editId ? 'Editar contato' : 'Novo contato'}</span><button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}><X size={16} /></button></div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label className="lbl">Nome *</label><input className="inp" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="lbl">Telefone (com DDD) *</label><input className="inp" placeholder="81999998888" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} /></div>
                <div><label className="lbl">E-mail</label><input className="inp" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="lbl">Origem da autorização</label>
                  <select className="inp" value={form.origem} onChange={e => setForm(f => ({ ...f, origem: e.target.value as MktContatoOrigem }))}>
                    {ORIGENS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div><label className="lbl">Status</label>
                  <select className="inp" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as MktContatoStatus }))}>
                    <option value="ativo">Ativo (autorizado)</option><option value="cancelado">Cancelado</option><option value="bloqueado">Bloqueado</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                <div><label className="lbl">Aniversário</label><input className="inp" type="date" value={form.aniversario} onChange={e => setForm(f => ({ ...f, aniversario: e.target.value }))} /></div>
              </div>
              <div><label className="lbl">Observações</label><textarea className="inp" rows={2} value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} /></div>
              {erro && <div style={{ color: '#EF4444', fontSize: 12 }}>{erro}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-al" onClick={salvar} disabled={saving}>{saving ? 'Salvando…' : <><Check size={15} /> Salvar</>}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {importOpen && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setImportOpen(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-hd"><span>Importar contatos</span><button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(false)}><X size={16} /></button></div>
            <div style={{ fontSize: 12, color: 'var(--gr3)', marginBottom: 8 }}>Cole 1 contato por linha: <b>Nome, Telefone</b> (ex: <i>João Silva, 81999998888</i>). Telefones repetidos são ignorados. Todos entram como <b>Ativo</b> (autorizado).</div>
            <textarea className="inp" rows={8} placeholder={"João Silva, 81999998888\nMaria Souza, 81988887777"} value={importTxt} onChange={e => setImportTxt(e.target.value)} />
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setImportOpen(false)}>Cancelar</button>
              <button className="btn btn-al" onClick={importar} disabled={importBusy || !importTxt.trim()}>{importBusy ? 'Importando…' : <><Upload size={15} /> Importar</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
