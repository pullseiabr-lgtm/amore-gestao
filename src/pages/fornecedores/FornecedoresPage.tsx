import { useState, useEffect, useCallback } from 'react'
import {
  Search, Plus, Trash2, Building2, Phone, Mail, MapPin,
  CreditCard, Briefcase, ChevronLeft, CheckCircle, XCircle,
  Loader, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'
import { useToast } from '../../hooks/useToast'
import { fetchFornecedores, insertFornecedor, updateFornecedor, deleteFornecedor } from '../../lib/db'
import type { Fornecedor } from '../../types/database'

// ── Helpers ──────────────────────────────────────────────────

const ESTADOS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const FORMAS_PAG = ['Boleto', 'Pix', 'Transferência', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro', 'Cheque']

const CATEGORIAS_PROD = [
  'Açaí', 'Bebidas', 'Carnes', 'Condimentos', 'Descartáveis', 'Embalagens',
  'Frutas', 'Grãos', 'Higiene', 'Laticínios', 'Legumes', 'Limpeza',
  'Proteínas', 'Sorvetes', 'Temperos', 'Outros',
]

function fmtCNPJ(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

function fmtPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

function fmtCEP(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0,5)}-${d.slice(5)}`
}

const EMPTY_FORM: Omit<Fornecedor, 'id' | 'created_at' | 'updated_at'> = {
  loja: '',
  nome: '',
  razao_social: null,
  cnpj: null,
  ie: null,
  email: null,
  telefone: null,
  whatsapp: null,
  logo_url: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  forma_pagamento: 'Boleto',
  chave_pix: null,
  banco: null,
  agencia: null,
  conta: null,
  prazo_pagamento: 30,
  categorias: null,
  prazo_entrega_dias: null,
  pedido_minimo: null,
  desconto_pct: null,
  contato_nome: null,
  contato_email: null,
  contato_telefone: null,
  observacoes: null,
  ativo: true,
  created_by: null,
}

// ── Badge de Status ──────────────────────────────────────────

function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
      background: ativo ? '#D1FAE5' : '#FEE2E2',
      color: ativo ? 'var(--success)' : 'var(--danger)',
    }}>
      {ativo ? <CheckCircle size={10} /> : <XCircle size={10} />}
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

// ── Seção do formulário ──────────────────────────────────────

function SecLabel({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bordo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bordo)' }}>
          {icon}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
        </div>
      </div>
      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0 0' }} />
    </div>
  )
}

// ── Formulário de Cadastro / Edição ──────────────────────────

function FornecedorForm({
  inicial, loja, onSalvo, onCancelar,
}: {
  inicial: Omit<Fornecedor, 'id' | 'created_at' | 'updated_at'> | null
  loja: string
  onSalvo: () => void
  onCancelar: () => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [secao, setSecao] = useState<'dados' | 'pagamento' | 'comercial'>('dados')
  const [form, setForm] = useState<Omit<Fornecedor, 'id' | 'created_at' | 'updated_at'>>(
    inicial ?? { ...EMPTY_FORM, loja, created_by: user?.name || null }
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (k: keyof typeof form, v: unknown) =>
    setForm(f => ({ ...f, [k]: v === '' ? null : v }))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.nome.trim()) e.nome = 'Nome é obrigatório'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const salvar = async () => {
    if (!validate()) { setSecao('dados'); return }
    setSaving(true)
    try {
      await insertFornecedor({ ...form, nome: form.nome.trim().toUpperCase(), loja })
      toast('Fornecedor salvo com sucesso!')
      onSalvo()
    } catch (e) {
      console.error(e)
      toast('Erro ao salvar fornecedor. Tente novamente.', 'error')
    }
    setSaving(false)
  }

  const SECOES = [
    { id: 'dados',     label: 'Dados do fornecedor', icon: <Building2 size={14} /> },
    { id: 'pagamento', label: 'Pagamento',            icon: <CreditCard size={14} /> },
    { id: 'comercial', label: 'Comercial',            icon: <Briefcase size={14} /> },
  ] as const

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
      {/* Nav lateral */}
      <div className="card" style={{ padding: 12, position: 'sticky', top: 16 }}>
        {SECOES.map(s => (
          <button
            key={s.id}
            onClick={() => setSecao(s.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: secao === s.id ? 'var(--bordo-bg)' : 'transparent',
              color: secao === s.id ? 'var(--bordo)' : 'var(--text)',
              fontWeight: secao === s.id ? 700 : 400, fontSize: 13,
              marginBottom: 2, textAlign: 'left',
            }}
          >
            {s.icon} {s.label}
          </button>
        ))}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
        <button className="btn bo bsm" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={onCancelar}>
          <ChevronLeft size={11} /> Voltar
        </button>
        <button className="btn bp bsm" style={{ width: '100%', justifyContent: 'center' }} onClick={salvar} disabled={saving}>
          {saving ? <><Loader size={10} className="spin" /> Salvando...</> : '✓ Salvar Fornecedor'}
        </button>
      </div>

      {/* Conteúdo da seção */}
      <div className="card" style={{ padding: 24 }}>

        {/* ── DADOS DO FORNECEDOR ── */}
        {secao === 'dados' && (
          <div>
            <SecLabel icon={<Building2 size={16} />} title="Dados do Fornecedor" sub="Informações básicas de identificação" />

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 12, background: 'var(--bordo-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px dashed var(--bordo-l)', color: 'var(--bordo)', fontSize: 24, fontWeight: 800,
              }}>
                {form.nome ? form.nome[0].toUpperCase() : '?'}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Logo do Fornecedor (opcional)</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>JPG, PNG ou WEBP</div>
              </div>
            </div>

            <div className="g2">
              <div className="fg" style={{ gridColumn: '1/-1' }}>
                <label className="fl">Nome do Fornecedor <span className="rq">*</span></label>
                <input className={`inp${errors.nome ? ' err' : ''}`} value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Ex: DISTRIBUIDORA SILVA" />
                {errors.nome && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errors.nome}</span>}
              </div>
              <div className="fg">
                <label className="fl">Razão Social</label>
                <input className="inp" value={form.razao_social ?? ''} onChange={e => set('razao_social', e.target.value)} placeholder="Razão social completa" />
              </div>
              <div className="fg">
                <label className="fl">CNPJ / CPF</label>
                <input className="inp" value={form.cnpj ?? ''} onChange={e => set('cnpj', fmtCNPJ(e.target.value))} placeholder="00.000.000/0001-00" />
              </div>
              <div className="fg">
                <label className="fl">Inscrição Estadual</label>
                <input className="inp" value={form.ie ?? ''} onChange={e => set('ie', e.target.value)} placeholder="IE" />
              </div>
              <div className="fg">
                <label className="fl">E-mail</label>
                <input className="inp" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="contato@fornecedor.com.br" />
              </div>
              <div className="fg">
                <label className="fl">Telefone</label>
                <input className="inp" value={form.telefone ?? ''} onChange={e => set('telefone', fmtPhone(e.target.value))} placeholder="(00) 0000-0000" />
              </div>
              <div className="fg">
                <label className="fl">WhatsApp</label>
                <input className="inp" value={form.whatsapp ?? ''} onChange={e => set('whatsapp', fmtPhone(e.target.value))} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div style={{ marginTop: 20 }}>
              <SecLabel icon={<MapPin size={16} />} title="Endereço" sub="Localização do fornecedor" />
              <div className="g2">
                <div className="fg">
                  <label className="fl">CEP</label>
                  <input className="inp" value={form.cep ?? ''} onChange={e => set('cep', fmtCEP(e.target.value))} placeholder="00000-000" />
                </div>
                <div className="fg" style={{ gridColumn: '1/-1' }}>
                  <label className="fl">Logradouro</label>
                  <input className="inp" value={form.logradouro ?? ''} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Av., Alameda..." />
                </div>
                <div className="fg">
                  <label className="fl">Número</label>
                  <input className="inp" value={form.numero ?? ''} onChange={e => set('numero', e.target.value)} placeholder="Nº" />
                </div>
                <div className="fg">
                  <label className="fl">Complemento</label>
                  <input className="inp" value={form.complemento ?? ''} onChange={e => set('complemento', e.target.value)} placeholder="Sala, Bloco..." />
                </div>
                <div className="fg">
                  <label className="fl">Bairro</label>
                  <input className="inp" value={form.bairro ?? ''} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
                </div>
                <div className="fg">
                  <label className="fl">Cidade</label>
                  <input className="inp" value={form.cidade ?? ''} onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                </div>
                <div className="fg">
                  <label className="fl">Estado</label>
                  <select className="sel" value={form.estado ?? ''} onChange={e => set('estado', e.target.value)}>
                    <option value="">Selecione...</option>
                    {ESTADOS_BR.map(uf => <option key={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn bp bsm" onClick={() => setSecao('pagamento')}>Próximo: Pagamento →</button>
            </div>
          </div>
        )}

        {/* ── PAGAMENTO ── */}
        {secao === 'pagamento' && (
          <div>
            <SecLabel icon={<CreditCard size={16} />} title="Dados de Pagamento" sub="Formas e condições de pagamento" />

            <div className="g2">
              <div className="fg">
                <label className="fl">Forma de Pagamento Preferencial</label>
                <select className="sel" value={form.forma_pagamento} onChange={e => set('forma_pagamento', e.target.value)}>
                  {FORMAS_PAG.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Prazo de Pagamento (dias)</label>
                <input className="inp" type="number" min={0} value={form.prazo_pagamento} onChange={e => set('prazo_pagamento', parseInt(e.target.value) || 0)} placeholder="30" />
              </div>
            </div>

            {(form.forma_pagamento === 'Pix') && (
              <div className="fg">
                <label className="fl">Chave Pix</label>
                <input className="inp" value={form.chave_pix ?? ''} onChange={e => set('chave_pix', e.target.value)} placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória" />
              </div>
            )}

            {(form.forma_pagamento === 'Transferência' || form.forma_pagamento === 'Boleto') && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10, marginTop: 4 }}>Dados Bancários</div>
                <div className="g3">
                  <div className="fg">
                    <label className="fl">Banco</label>
                    <input className="inp" value={form.banco ?? ''} onChange={e => set('banco', e.target.value)} placeholder="Ex: Bradesco, Itaú, BB..." />
                  </div>
                  <div className="fg">
                    <label className="fl">Agência</label>
                    <input className="inp" value={form.agencia ?? ''} onChange={e => set('agencia', e.target.value)} placeholder="0000" />
                  </div>
                  <div className="fg">
                    <label className="fl">Conta</label>
                    <input className="inp" value={form.conta ?? ''} onChange={e => set('conta', e.target.value)} placeholder="00000-0" />
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button className="btn bo bsm" onClick={() => setSecao('dados')}><ChevronLeft size={11} /> Dados</button>
              <button className="btn bp bsm" onClick={() => setSecao('comercial')}>Próximo: Comercial →</button>
            </div>
          </div>
        )}

        {/* ── COMERCIAL ── */}
        {secao === 'comercial' && (
          <div>
            <SecLabel icon={<Briefcase size={16} />} title="Informações Comerciais" sub="Condições e contato comercial" />

            <div className="g2">
              <div className="fg" style={{ gridColumn: '1/-1' }}>
                <label className="fl">Categorias de Produtos Fornecidos</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {CATEGORIAS_PROD.map(c => {
                    const sel = form.categorias?.split(',').map(x => x.trim()).includes(c) ?? false
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          const atual = form.categorias ? form.categorias.split(',').map(x => x.trim()).filter(Boolean) : []
                          const novo = sel ? atual.filter(x => x !== c) : [...atual, c]
                          set('categorias', novo.join(', ') || null)
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                          border: `1.5px solid ${sel ? 'var(--bordo)' : 'var(--border)'}`,
                          background: sel ? 'var(--bordo-bg)' : '#fff',
                          color: sel ? 'var(--bordo)' : 'var(--text)', fontWeight: sel ? 700 : 400,
                        }}
                      >{c}</button>
                    )
                  })}
                </div>
              </div>

              <div className="fg">
                <label className="fl">Prazo de Entrega (dias)</label>
                <input className="inp" type="number" min={0} value={form.prazo_entrega_dias ?? ''} onChange={e => set('prazo_entrega_dias', parseInt(e.target.value) || null)} placeholder="Ex: 3" />
              </div>
              <div className="fg">
                <label className="fl">Pedido Mínimo (R$)</label>
                <input className="inp" type="number" min={0} step={0.01} value={form.pedido_minimo ?? ''} onChange={e => set('pedido_minimo', parseFloat(e.target.value) || null)} placeholder="Ex: 150,00" />
              </div>
              <div className="fg">
                <label className="fl">Desconto Comercial (%)</label>
                <input className="inp" type="number" min={0} max={100} step={0.1} value={form.desconto_pct ?? ''} onChange={e => set('desconto_pct', parseFloat(e.target.value) || null)} placeholder="Ex: 5" />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 10 }}>Contato Comercial</div>
              <div className="g3">
                <div className="fg">
                  <label className="fl">Nome do Contato</label>
                  <input className="inp" value={form.contato_nome ?? ''} onChange={e => set('contato_nome', e.target.value)} placeholder="Nome completo" />
                </div>
                <div className="fg">
                  <label className="fl">E-mail do Contato</label>
                  <input className="inp" type="email" value={form.contato_email ?? ''} onChange={e => set('contato_email', e.target.value)} placeholder="email@contato.com" />
                </div>
                <div className="fg">
                  <label className="fl">Telefone do Contato</label>
                  <input className="inp" value={form.contato_telefone ?? ''} onChange={e => set('contato_telefone', fmtPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </div>
            </div>

            <div className="fg" style={{ marginTop: 8 }}>
              <label className="fl">Observações</label>
              <textarea className="inp" rows={3} value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} placeholder="Informações adicionais sobre o fornecedor..." style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
              <button className="btn bo bsm" onClick={() => setSecao('pagamento')}><ChevronLeft size={11} /> Pagamento</button>
              <button className="btn bp" onClick={salvar} disabled={saving}>
                {saving ? <><Loader size={12} className="spin" /> Salvando...</> : '✓ Salvar Fornecedor'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Lista de Fornecedores ─────────────────────────────────────

// ── Página Principal ─────────────────────────────────────────

export default function FornecedoresPage() {
  const { loja } = useLoja()
  const { toast } = useToast()

  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'ativo' | 'inativo'>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [view, setView] = useState<'lista' | 'novo' | 'editar'>('lista')
  const [editando, setEditando] = useState<Fornecedor | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Fornecedor | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setFornecedores(await fetchFornecedores(loja)) } catch {}
    setLoading(false)
  }, [loja])

  useEffect(() => { load() }, [load])

  const filtrados = fornecedores
    .filter(f => f.nome.toLowerCase().includes(busca.toLowerCase()) ||
                 (f.cnpj ?? '').includes(busca) ||
                 (f.cidade ?? '').toLowerCase().includes(busca.toLowerCase()))
    .filter(f => filtroStatus === 'todos' ? true : filtroStatus === 'ativo' ? f.ativo : !f.ativo)
    .filter(f => !filtroCategoria || (f.categorias ?? '').includes(filtroCategoria))

  const ativos = fornecedores.filter(f => f.ativo).length
  const inativos = fornecedores.filter(f => !f.ativo).length

  const toggleAtivo = async (f: Fornecedor) => {
    try {
      await updateFornecedor(f.id, { ativo: !f.ativo })
      await load()
    } catch {}
  }

  const confirmarDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteFornecedor(confirmDelete.id)
      setConfirmDelete(null)
      toast('Fornecedor removido.')
      await load()
    } catch {
      setConfirmDelete(null)
      toast('Erro ao excluir fornecedor. Tente novamente.', 'error')
    }
  }

  const abrirEditar = (f: Fornecedor) => {
    setEditando(f)
    setView('editar')
  }

  // ── Vista: Formulário novo ──
  if (view === 'novo') {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Cadastrar Fornecedor</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Preencha os campos abaixo para cadastrar um novo fornecedor.</p>
        </div>
        <FornecedorForm
          inicial={null}
          loja={loja}
          onSalvo={() => { setView('lista'); load() }}
          onCancelar={() => setView('lista')}
        />
      </div>
    )
  }

  // ── Vista: Formulário editar ──
  if (view === 'editar' && editando) {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Editar Fornecedor</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Atualize os dados do fornecedor <strong>{editando.nome}</strong>.</p>
        </div>
        <FornecedorEditForm
          fornecedor={editando}
          onSalvo={() => { setView('lista'); load() }}
          onCancelar={() => setView('lista')}
        />
      </div>
    )
  }

  // ── Vista: Lista ──
  return (
    <div>
      {/* KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--bordo)' }} />
          <div className="kpi-lbl">Total de Fornecedores</div>
          <div className="kpi-val">{fornecedores.length}</div>
          <div className="kpi-sub">{loja}</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--success)' }} />
          <div className="kpi-lbl">Ativos</div>
          <div className="kpi-val" style={{ color: 'var(--success)' }}>{ativos}</div>
          <div className="kpi-sub">fornecedores ativos</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--danger)' }} />
          <div className="kpi-lbl">Inativos</div>
          <div className="kpi-val" style={{ color: 'var(--danger)' }}>{inativos}</div>
          <div className="kpi-sub">fornecedores inativos</div>
        </div>
        <div className="kpi">
          <div className="kpi-ac" style={{ background: 'var(--blue)' }} />
          <div className="kpi-lbl">Categorias</div>
          <div className="kpi-val">{new Set(fornecedores.flatMap(f => (f.categorias ?? '').split(',').map(c => c.trim()).filter(Boolean))).size}</div>
          <div className="kpi-sub">tipos de produto</div>
        </div>
      </div>

      {/* Tabela / lista */}
      <div className="card">
        <div className="card-hd">
          <span className="card-tt">🏭 Fornecedores</span>
          <button className="btn bp bsm" onClick={() => setView('novo')}><Plus size={11} /> Novo Fornecedor</button>
        </div>

        {/* Filtros */}
        <div style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="sw-wrap" style={{ flex: 1, minWidth: 220 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input className="srch" placeholder="Buscar por nome, CNPJ ou cidade..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <select className="flt" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)}>
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativos</option>
            <option value="inativo">Inativos</option>
          </select>
          <select className="flt" value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIAS_PROD.map(c => <option key={c}>{c}</option>)}
          </select>
          {(busca || filtroCategoria || filtroStatus !== 'todos') && (
            <button className="btn bo bsm" onClick={() => { setBusca(''); setFiltroCategoria(''); setFiltroStatus('todos') }}>Limpar</button>
          )}
        </div>

        {/* Conteúdo */}
        {loading ? (
          <div className="empty"><Loader size={24} className="spin" /><div style={{ marginTop: 8 }}>Carregando fornecedores...</div></div>
        ) : filtrados.length === 0 ? (
          <div className="empty" style={{ padding: '48px 0' }}>
            <Building2 size={40} style={{ opacity: .3 }} />
            <div style={{ marginTop: 10, fontWeight: 600 }}>
              {fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado' : 'Nenhum resultado encontrado'}
            </div>
            {fornecedores.length === 0 && (
              <button className="btn bp bsm" style={{ marginTop: 12 }} onClick={() => setView('novo')}>
                <Plus size={11} /> Cadastrar primeiro fornecedor
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Tabela para telas maiores */}
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>CNPJ</th>
                    <th>Contato</th>
                    <th>Localização</th>
                    <th>Categorias</th>
                    <th>Pgto</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(f => (
                    <tr key={f.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bordo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--bordo)', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                            {f.nome[0]}
                          </div>
                          <div>
                            <strong style={{ fontSize: 12 }}>{f.nome}</strong>
                            {f.razao_social && <div style={{ fontSize: 10, color: 'var(--muted)' }}>{f.razao_social}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>{f.cnpj || '—'}</td>
                      <td>
                        <div style={{ fontSize: 11 }}>
                          {f.telefone && <div><Phone size={10} style={{ display: 'inline', marginRight: 4 }} />{f.telefone}</div>}
                          {f.email && <div style={{ color: 'var(--muted)' }}><Mail size={10} style={{ display: 'inline', marginRight: 4 }} />{f.email}</div>}
                        </div>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {[f.cidade, f.estado].filter(Boolean).join(' — ') || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(f.categorias ?? '').split(',').map(c => c.trim()).filter(Boolean).slice(0, 2).map(c => (
                            <span key={c} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'var(--bordo-bg)', color: 'var(--bordo)', fontWeight: 600 }}>{c}</span>
                          ))}
                          {(f.categorias ?? '').split(',').filter(Boolean).length > 2 && (
                            <span style={{ fontSize: 10, color: 'var(--muted)' }}>+{(f.categorias ?? '').split(',').length - 2}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <div>{f.forma_pagamento}</div>
                        {f.prazo_pagamento > 0 && <div style={{ color: 'var(--muted)' }}>{f.prazo_pagamento} dias</div>}
                      </td>
                      <td><StatusBadge ativo={f.ativo} /></td>
                      <td>
                        <div className="ab" style={{ gap: 4 }}>
                          <button className="ib" onClick={() => abrirEditar(f)} title="Editar">✏️</button>
                          <button
                            className="ib"
                            onClick={() => toggleAtivo(f)}
                            title={f.ativo ? 'Desativar' : 'Ativar'}
                            style={{ color: f.ativo ? 'var(--warning)' : 'var(--success)' }}
                          >
                            {f.ativo ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                          </button>
                          <button className="ib rd" onClick={() => setConfirmDelete(f)} title="Excluir">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 15px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
              {filtrados.length} de {fornecedores.length} fornecedores exibidos
            </div>
          </>
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div className="ov open" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <span className="mtt">Excluir Fornecedor</span>
              <button className="mx" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="mbd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={18} style={{ color: 'var(--danger)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{confirmDelete.nome}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Esta ação não pode ser desfeita.</div>
                </div>
              </div>
            </div>
            <div className="mft">
              <button className="btn bo" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn" style={{ background: 'var(--danger)', color: '#fff' }} onClick={confirmarDelete}>
                <Trash2 size={11} /> Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Formulário de Edição (tem ID) ────────────────────────────

function FornecedorEditForm({
  fornecedor, onSalvo, onCancelar,
}: { fornecedor: Fornecedor; onSalvo: () => void; onCancelar: () => void }) {
  const { toast } = useToast()
  const [secao, setSecao] = useState<'dados' | 'pagamento' | 'comercial'>('dados')
  const [form, setForm] = useState<Partial<Fornecedor>>({ ...fornecedor })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof Fornecedor, v: unknown) =>
    setForm(f => ({ ...f, [k]: v === '' ? null : v }))

  const salvar = async () => {
    if (!form.nome?.trim()) return
    setSaving(true)
    try {
      await updateFornecedor(fornecedor.id, { ...form, nome: form.nome.trim().toUpperCase() })
      toast('Fornecedor atualizado!')
      onSalvo()
    } catch (e) {
      console.error(e)
      toast('Erro ao atualizar fornecedor. Tente novamente.', 'error')
    }
    setSaving(false)
  }

  const SECOES = [
    { id: 'dados',     label: 'Dados do fornecedor', icon: <Building2 size={14} /> },
    { id: 'pagamento', label: 'Pagamento',            icon: <CreditCard size={14} /> },
    { id: 'comercial', label: 'Comercial',            icon: <Briefcase size={14} /> },
  ] as const

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20, alignItems: 'start' }}>
      <div className="card" style={{ padding: 12, position: 'sticky', top: 16 }}>
        {SECOES.map(s => (
          <button key={s.id} onClick={() => setSecao(s.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '10px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: secao === s.id ? 'var(--bordo-bg)' : 'transparent',
            color: secao === s.id ? 'var(--bordo)' : 'var(--text)',
            fontWeight: secao === s.id ? 700 : 400, fontSize: 13, marginBottom: 2, textAlign: 'left',
          }}>{s.icon} {s.label}</button>
        ))}
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Status:</span>
          <button
            onClick={() => set('ativo', !form.ativo)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 11, color: form.ativo ? 'var(--success)' : 'var(--danger)' }}
          >
            {form.ativo ? <><ToggleRight size={16} /> Ativo</> : <><ToggleLeft size={16} /> Inativo</>}
          </button>
        </div>
        <button className="btn bo bsm" style={{ width: '100%', justifyContent: 'center', marginBottom: 6 }} onClick={onCancelar}>
          <ChevronLeft size={11} /> Voltar
        </button>
        <button className="btn bp bsm" style={{ width: '100%', justifyContent: 'center' }} onClick={salvar} disabled={saving}>
          {saving ? <><Loader size={10} className="spin" /> Salvando...</> : '✓ Salvar Alterações'}
        </button>
      </div>

      <div className="card" style={{ padding: 24 }}>
        {secao === 'dados' && (
          <div>
            <SecLabel icon={<Building2 size={16} />} title="Dados do Fornecedor" sub="Informações básicas de identificação" />
            <div className="g2">
              <div className="fg" style={{ gridColumn: '1/-1' }}>
                <label className="fl">Nome do Fornecedor <span className="rq">*</span></label>
                <input className="inp" value={form.nome ?? ''} onChange={e => set('nome', e.target.value)} />
              </div>
              <div className="fg"><label className="fl">Razão Social</label><input className="inp" value={form.razao_social ?? ''} onChange={e => set('razao_social', e.target.value)} /></div>
              <div className="fg"><label className="fl">CNPJ / CPF</label><input className="inp" value={form.cnpj ?? ''} onChange={e => set('cnpj', fmtCNPJ(e.target.value))} /></div>
              <div className="fg"><label className="fl">IE</label><input className="inp" value={form.ie ?? ''} onChange={e => set('ie', e.target.value)} /></div>
              <div className="fg"><label className="fl">E-mail</label><input className="inp" type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} /></div>
              <div className="fg"><label className="fl">Telefone</label><input className="inp" value={form.telefone ?? ''} onChange={e => set('telefone', fmtPhone(e.target.value))} /></div>
              <div className="fg"><label className="fl">WhatsApp</label><input className="inp" value={form.whatsapp ?? ''} onChange={e => set('whatsapp', fmtPhone(e.target.value))} /></div>
            </div>
            <div style={{ marginTop: 16 }}>
              <SecLabel icon={<MapPin size={16} />} title="Endereço" sub="" />
              <div className="g2">
                <div className="fg"><label className="fl">CEP</label><input className="inp" value={form.cep ?? ''} onChange={e => set('cep', fmtCEP(e.target.value))} /></div>
                <div className="fg" style={{ gridColumn: '1/-1' }}><label className="fl">Logradouro</label><input className="inp" value={form.logradouro ?? ''} onChange={e => set('logradouro', e.target.value)} /></div>
                <div className="fg"><label className="fl">Número</label><input className="inp" value={form.numero ?? ''} onChange={e => set('numero', e.target.value)} /></div>
                <div className="fg"><label className="fl">Complemento</label><input className="inp" value={form.complemento ?? ''} onChange={e => set('complemento', e.target.value)} /></div>
                <div className="fg"><label className="fl">Bairro</label><input className="inp" value={form.bairro ?? ''} onChange={e => set('bairro', e.target.value)} /></div>
                <div className="fg"><label className="fl">Cidade</label><input className="inp" value={form.cidade ?? ''} onChange={e => set('cidade', e.target.value)} /></div>
                <div className="fg"><label className="fl">Estado</label>
                  <select className="sel" value={form.estado ?? ''} onChange={e => set('estado', e.target.value)}>
                    <option value="">Selecione...</option>
                    {ESTADOS_BR.map(uf => <option key={uf}>{uf}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {secao === 'pagamento' && (
          <div>
            <SecLabel icon={<CreditCard size={16} />} title="Dados de Pagamento" sub="Formas e condições de pagamento" />
            <div className="g2">
              <div className="fg">
                <label className="fl">Forma de Pagamento</label>
                <select className="sel" value={form.forma_pagamento ?? 'Boleto'} onChange={e => set('forma_pagamento', e.target.value)}>
                  {FORMAS_PAG.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Prazo (dias)</label><input className="inp" type="number" value={form.prazo_pagamento ?? 30} onChange={e => set('prazo_pagamento', parseInt(e.target.value) || 0)} /></div>
            </div>
            <div className="fg"><label className="fl">Chave Pix</label><input className="inp" value={form.chave_pix ?? ''} onChange={e => set('chave_pix', e.target.value)} /></div>
            <div className="g3">
              <div className="fg"><label className="fl">Banco</label><input className="inp" value={form.banco ?? ''} onChange={e => set('banco', e.target.value)} /></div>
              <div className="fg"><label className="fl">Agência</label><input className="inp" value={form.agencia ?? ''} onChange={e => set('agencia', e.target.value)} /></div>
              <div className="fg"><label className="fl">Conta</label><input className="inp" value={form.conta ?? ''} onChange={e => set('conta', e.target.value)} /></div>
            </div>
          </div>
        )}

        {secao === 'comercial' && (
          <div>
            <SecLabel icon={<Briefcase size={16} />} title="Informações Comerciais" sub="Condições e contato comercial" />
            <div className="fg" style={{ marginBottom: 16 }}>
              <label className="fl">Categorias de Produtos</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {CATEGORIAS_PROD.map(c => {
                  const sel = (form.categorias ?? '').split(',').map(x => x.trim()).includes(c)
                  return (
                    <button key={c} type="button" onClick={() => {
                      const atual = (form.categorias ?? '').split(',').map(x => x.trim()).filter(Boolean)
                      const novo = sel ? atual.filter(x => x !== c) : [...atual, c]
                      set('categorias', novo.join(', ') || null)
                    }} style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                      border: `1.5px solid ${sel ? 'var(--bordo)' : 'var(--border)'}`,
                      background: sel ? 'var(--bordo-bg)' : '#fff',
                      color: sel ? 'var(--bordo)' : 'var(--text)', fontWeight: sel ? 700 : 400,
                    }}>{c}</button>
                  )
                })}
              </div>
            </div>
            <div className="g2">
              <div className="fg"><label className="fl">Prazo Entrega (dias)</label><input className="inp" type="number" value={form.prazo_entrega_dias ?? ''} onChange={e => set('prazo_entrega_dias', parseInt(e.target.value) || null)} /></div>
              <div className="fg"><label className="fl">Pedido Mínimo (R$)</label><input className="inp" type="number" step={0.01} value={form.pedido_minimo ?? ''} onChange={e => set('pedido_minimo', parseFloat(e.target.value) || null)} /></div>
              <div className="fg"><label className="fl">Desconto (%)</label><input className="inp" type="number" step={0.1} value={form.desconto_pct ?? ''} onChange={e => set('desconto_pct', parseFloat(e.target.value) || null)} /></div>
            </div>
            <div className="g3">
              <div className="fg"><label className="fl">Contato</label><input className="inp" value={form.contato_nome ?? ''} onChange={e => set('contato_nome', e.target.value)} /></div>
              <div className="fg"><label className="fl">E-mail Contato</label><input className="inp" value={form.contato_email ?? ''} onChange={e => set('contato_email', e.target.value)} /></div>
              <div className="fg"><label className="fl">Tel. Contato</label><input className="inp" value={form.contato_telefone ?? ''} onChange={e => set('contato_telefone', fmtPhone(e.target.value))} /></div>
            </div>
            <div className="fg">
              <label className="fl">Observações</label>
              <textarea className="inp" rows={3} value={form.observacoes ?? ''} onChange={e => set('observacoes', e.target.value)} style={{ resize: 'vertical' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
