import { useState, useEffect } from 'react'
import { Shield, Edit2, Trash2, Plus, Search, CheckCircle, XCircle, Clock, Users, Lock, Loader2 } from 'lucide-react'
import Modal from '../../components/ui/Modal'
import Confirm from '../../components/ui/Confirm'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../contexts/AuthContext'
import { ROLE_PERMISSIONS, PERMISSION_TEMPLATES, TEMPLATE_BY_ID } from '../../lib/permissions'
import { fetchProfiles, updateProfile, upsertProfile, fetchAuditLogs } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import type { Profile, UserRole, UserStatus, PermissionsMap, ModulePermission } from '../../types/database'

const MODULES = [
  // ── Geral / Operação ──
  { id: 'dashboard',            label: 'Dashboard',                 grupo: 'Geral' },
  { id: 'vendas',               label: 'Vendas',                    grupo: 'Geral' },
  { id: 'pdv',                  label: 'PDV — Ponto de Venda',      grupo: 'Geral' },
  { id: 'cozinha',              label: 'Cozinha',                   grupo: 'Geral' },
  { id: 'salao',                label: 'Salão',                     grupo: 'Geral' },
  { id: 'gamificacao',          label: 'Gamificação',               grupo: 'Geral' },
  // ── Tarefas & Planejamento ──
  { id: 'tarefas',              label: 'Central de Tarefas',        grupo: 'Tarefas & Planejamento' },
  { id: 'pendencias',           label: 'Pendências & OS',           grupo: 'Tarefas & Planejamento' },
  { id: 'planejamento',         label: 'Planejamento Operacional',  grupo: 'Tarefas & Planejamento' },
  { id: 'atas',                 label: 'Atas de Reunião',           grupo: 'Tarefas & Planejamento' },
  { id: 'notificacoes',         label: 'Central de Notificações',   grupo: 'Tarefas & Planejamento' },
  // ── Marketing & IA ──
  { id: 'marketing',            label: 'Marketing',                 grupo: 'Marketing & IA' },
  { id: 'avaliacoes',           label: 'Avaliações & NPS',          grupo: 'Marketing & IA' },
  { id: 'agente-liz',           label: 'Liz — Agente IA',           grupo: 'Marketing & IA' },
  { id: 'agente-cmv',           label: 'Precificação & CMV (IA)',   grupo: 'Marketing & IA' },
  { id: 'market',               label: 'Market Analytics',          grupo: 'Marketing & IA' },
  // ── Compras & Suprimentos ──
  { id: 'compras',              label: 'Compras / Lista',           grupo: 'Compras & Suprimentos' },
  { id: 'requisicoes',          label: 'Requisições de Compra',     grupo: 'Compras & Suprimentos' },
  { id: 'req-automaticas',      label: 'Requisições Automáticas',   grupo: 'Compras & Suprimentos' },
  { id: 'pipeline-suprimentos', label: 'Pipeline de Suprimentos',   grupo: 'Compras & Suprimentos' },
  { id: 'dashboard-suprimentos',label: 'Dashboard de Suprimentos',  grupo: 'Compras & Suprimentos' },
  { id: 'lista-padrao',         label: 'Lista de Compras Padrão',   grupo: 'Compras & Suprimentos' },
  { id: 'compras-agente',       label: 'Agente de Compras',         grupo: 'Compras & Suprimentos' },
  { id: 'fornecedores',         label: 'Fornecedores',              grupo: 'Compras & Suprimentos' },
  // ── Estoque & Produtos ──
  { id: 'estoque',              label: 'Estoque',                   grupo: 'Estoque & Produtos' },
  { id: 'produtos',             label: 'Produtos',                  grupo: 'Estoque & Produtos' },
  { id: 'produtos-categorias',  label: 'Categorias de Produtos',    grupo: 'Estoque & Produtos' },
  { id: 'ruptura',              label: 'Ruptura de Pedidos',        grupo: 'Estoque & Produtos' },
  { id: 'enxoval',              label: 'Controle de Enxoval',       grupo: 'Estoque & Produtos' },
  { id: 'alertas',              label: 'Alertas & Rastreabilidade', grupo: 'Estoque & Produtos' },
  { id: 'relatorio-cvl',        label: 'Compra vs Lista',           grupo: 'Estoque & Produtos' },
  // ── Financeiro ──
  { id: 'financeiro',           label: 'Financeiro',                grupo: 'Financeiro' },
  { id: 'boletos',              label: 'Central de Boletos',        grupo: 'Financeiro' },
  { id: 'caixas',               label: 'Caixas & Despesas',         grupo: 'Financeiro' },
  // ── Administração ──
  { id: 'usuarios',             label: 'Usuários',                  grupo: 'Administração' },
  { id: 'configuracoes',        label: 'Configurações',             grupo: 'Administração' },
]

const LOJAS_DISPONIVEIS = ['Todas', 'Amore CD', 'Amore Paiva', 'Flow CD']

const ACTIONS: { key: keyof ModulePermission; label: string }[] = [
  { key: 'view', label: 'Ver' },
  { key: 'create', label: 'Criar' },
  { key: 'edit', label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
  { key: 'export', label: 'Export' },
]

const ROLES: { value: UserRole; label: string; badge: string }[] = [
  { value: 'super_admin', label: 'Super Admin', badge: 'bg-r' },
  { value: 'admin', label: 'Administrador', badge: 'bg-p' },
  { value: 'manager', label: 'Gerente', badge: 'bg-b' },
  { value: 'user', label: 'Colaborador', badge: 'bg-gr' },
  { value: 'viewer', label: 'Visualizador', badge: 'bg-t' },
]

const AVATAR_COLORS = ['#6B1212', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#06B6D4', '#EF4444', '#EC4899']

const INITIAL_USERS: Profile[] = [
  { id: 'u-admin', email: 'admin@amore.com.br', name: 'Rodrigo Admin', role: 'super_admin', loja: 'Todas', status: 'active', avatar_color: '#6B1212', initials: 'RA', permissions_override: null, created_at: '2025-01-01T00:00:00Z', last_login: new Date().toISOString(), created_by: null },
  { id: 'u-gerente', email: 'gerente@amore.com.br', name: 'Ana Gerente', role: 'manager', loja: 'Amore Paiva', status: 'active', avatar_color: '#10B981', initials: 'AG', permissions_override: null, created_at: '2025-01-15T00:00:00Z', last_login: '2025-07-22T10:30:00Z', created_by: 'u-admin' },
  { id: 'u-joao', email: 'joao@amore.com.br', name: 'João Ricardo', role: 'user', loja: 'Amore Paiva', status: 'active', avatar_color: '#6366F1', initials: 'JR', permissions_override: null, created_at: '2025-02-01T00:00:00Z', last_login: '2025-07-22T14:32:00Z', created_by: 'u-admin' },
  { id: 'u-maria', email: 'maria@amore.com.br', name: 'Maria Clara', role: 'user', loja: 'Amore Paiva', status: 'active', avatar_color: '#10B981', initials: 'MC', permissions_override: null, created_at: '2025-02-01T00:00:00Z', last_login: '2025-07-21T09:00:00Z', created_by: 'u-admin' },
  { id: 'u-felipe', email: 'felipe@amore.com.br', name: 'Felipe Santos', role: 'user', loja: 'Amore CD', status: 'inactive', avatar_color: '#CD7C2F', initials: 'FS', permissions_override: null, created_at: '2025-03-01T00:00:00Z', last_login: '2025-06-30T16:00:00Z', created_by: 'u-admin' },
]


const PROV_MOCK = [
  { nome: 'Consultor Externo', login: 'consul_1722@amore.temp', expira: '25/07/25', modulos: 'Dashboard · Financeiro', status: 'Ativo' },
]

function getInitials(name: string) {
  return name.split(' ').map(w => w[0] || '').join('').toUpperCase().slice(0, 2)
}

function formatDate(iso: string | null) {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

type Tab = 'users' | 'roles' | 'templates' | 'prov' | 'audit'

export default function UsersPage() {
  const { user: me, can } = useAuth()
  const { toast } = useToast()
  const isSuperAdmin = me?.role === 'super_admin'

  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState<Profile[]>(INITIAL_USERS)
  const [saving, setSaving] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [form, setForm] = useState({ name: '', email: '', cargo: '', setor: '', whatsapp: '', whatsapp2: '', role: 'user' as UserRole, loja: '', status: 'active' as UserStatus, password: '', password2: '', template: '' })
  const [formErr, setFormErr] = useState('')

  const [permMap, setPermMap] = useState<PermissionsMap>({})
  const [permRestricoes, setPermRestricoes] = useState<{ lojas: string[] }>({ lojas: [] })

  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null)

  const [showProvForm, setShowProvForm] = useState(false)
  const [provForm, setProvForm] = useState({ nome: '', expira: '', modulos: '' })
  const [provGerado, setProvGerado] = useState('')

  useEffect(() => {
    fetchProfiles()
      .then(data => { if (data.length > 0) setUsers(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'audit') {
      fetchAuditLogs().then(setAuditLogs).catch(() => {})
    }
  }, [tab])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchQ = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    const matchR = !filterRole || u.role === filterRole
    const matchS = !filterStatus || u.status === filterStatus
    return matchQ && matchR && matchS
  })

  const openNew = () => {
    setEditingUser(null)
    setForm({ name: '', email: '', cargo: '', setor: '', whatsapp: '', whatsapp2: '', role: 'user', loja: '', status: 'active', password: '', password2: '', template: '' })
    setPermMap({ ...(ROLE_PERMISSIONS['user'] || {}) })
    setPermRestricoes({ lojas: [] })
    setFormErr('')
    setShowForm(true)
  }

  const openEdit = (u: Profile) => {
    setEditingUser(u)
    const override = (u.permissions_override || {}) as any
    const perfil = override.__perfil__ || {}
    setForm({ name: u.name, email: u.email, cargo: perfil.cargo || '', setor: perfil.setor || '', whatsapp: perfil.whatsapp || '', whatsapp2: perfil.whatsapp2 || '', role: u.role, loja: u.loja || '', status: u.status, password: '', password2: '', template: '' })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { __restricoes__: restr, __perfil__: _pf, ...cleanOverride } = override
    setPermMap({ ...(ROLE_PERMISSIONS[u.role] || {}), ...cleanOverride })
    setPermRestricoes({ lojas: (restr && restr.lojas) || [] })
    setFormErr('')
    setShowForm(true)
  }

  // Rebaseia as permissões do formulário para o padrão do papel selecionado
  const resetPermParaPapel = (role: UserRole) => {
    setPermMap({ ...(ROLE_PERMISSIONS[role] || {}) })
    setPermRestricoes({ lojas: [] })
  }

  const aplicarModelo = (templateId: string) => {
    const t = TEMPLATE_BY_ID[templateId]
    if (!t) return
    setPermMap({ ...t.perms })
    setForm(p => ({ ...p, template: templateId }))
    toast(`Modelo "${t.label}" aplicado — revise as marcações e salve.`)
  }

  const toggleRestricaoLoja = (loja: string) => {
    setPermRestricoes(prev => ({
      ...prev,
      lojas: prev.lojas.includes(loja) ? prev.lojas.filter(l => l !== loja) : [...prev.lojas, loja],
    }))
  }

  const togglePerm = (mod: string, action: keyof ModulePermission) => {
    setPermMap(prev => {
      const cur = prev[mod] || { view: false, create: false, edit: false, delete: false, export: false }
      const novo = !cur[action]
      let updated = { ...cur, [action]: novo }
      // Desmarcar "Ver" remove todas as ações (módulo some do menu)
      if (action === 'view' && !novo) updated = { view: false, create: false, edit: false, delete: false, export: false }
      // Marcar qualquer ação garante "Ver" (para o módulo aparecer)
      else if (action !== 'view' && novo) updated = { ...updated, view: true }
      return { ...prev, [mod]: updated }
    })
  }

  const toggleModuloTodos = (mod: string, ligar: boolean) => {
    setPermMap(prev => ({
      ...prev,
      [mod]: ligar
        ? { view: true, create: true, edit: true, delete: true, export: true }
        : { view: false, create: false, edit: false, delete: false, export: false },
    }))
  }

  const saveUser = async () => {
    if (!form.name.trim() || !form.email.trim()) { setFormErr('Nome e email são obrigatórios.'); return }
    if (!editingUser && form.password.length < 6) { setFormErr('Senha mínimo 6 caracteres.'); return }
    if (!editingUser && form.password !== form.password2) { setFormErr('Senhas não conferem.'); return }
    setSaving(true)
    setFormErr('')
    try {
      const overridePerms: any = { ...permMap, __restricoes__: permRestricoes, __perfil__: { cargo: form.cargo || null, setor: form.setor || null, whatsapp: (form.whatsapp || '').replace(/\D/g, '') || null, whatsapp2: (form.whatsapp2 || '').replace(/\D/g, '') || null } }
      if (editingUser) {
        const updated = await updateProfile(editingUser.id, {
          name: form.name, role: form.role,
          loja: form.loja || null, status: form.status,
          permissions_override: overridePerms,
        })
        setUsers(prev => prev.map(u => u.id === editingUser.id ? updated : u))
        toast(`Usuário ${form.name} atualizado!`)
      } else {
        // Create auth user via Supabase signUp
        const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password })
        if (error) { setFormErr(error.message); setSaving(false); return }
        const uid = data.user?.id
        if (!uid) { setFormErr('Erro ao criar usuário.'); setSaving(false); return }
        const ini = getInitials(form.name)
        const col = AVATAR_COLORS[users.length % AVATAR_COLORS.length]
        const profile = await upsertProfile({
          id: uid, email: form.email, name: form.name,
          role: form.role, loja: form.loja || null, status: form.status,
          avatar_color: col, initials: ini,
          permissions_override: overridePerms,
          created_at: new Date().toISOString(), last_login: null,
          created_by: me?.id || null,
        })
        setUsers(prev => [profile, ...prev])
        toast(`Usuário ${form.name} cadastrado!`)
      }
      setShowForm(false)
    } catch (err: any) {
      setFormErr(err?.message || 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const deleteUser = async (u: Profile) => {
    try {
      // Soft delete: mark as inactive (auth user deletion requires admin API)
      const updated = await updateProfile(u.id, { status: 'inactive' })
      setUsers(prev => prev.map(x => x.id === u.id ? updated : x))
      toast(`Usuário ${u.name} desativado.`, 'error')
    } catch {
      toast('Erro ao desativar usuário.', 'error')
    }
  }

  const gerarProv = () => {
    if (!provForm.nome || !provForm.expira) { toast('Preencha nome e data.', 'error'); return }
    const login = provForm.nome.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4) + '@amore.temp'
    setProvGerado(login)
    toast(`Acesso provisório gerado para ${provForm.nome}!`)
  }

  const roleInfo = (role: UserRole) => ROLES.find(r => r.value === role) || ROLES[3]

  const statusBadge = (s: UserStatus) => ({
    active: <span className="badge bg-g"><CheckCircle size={9} style={{ marginRight: 2 }} />Ativo</span>,
    inactive: <span className="badge bg-r"><XCircle size={9} style={{ marginRight: 2 }} />Inativo</span>,
    pending: <span className="badge bg-y"><Clock size={9} style={{ marginRight: 2 }} />Pendente</span>,
  }[s])

  return (
    <div>
      <div className="tabs" id="tUser">
        {([['users', '👥 Usuários'], ['roles', '🔑 Papéis'], ['prov', '⏳ Provisórios'], ['audit', '📋 Audit Log']] as [Tab, string][]).map(([id, lbl]) => (
          <button key={id} className={`tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── USUÁRIOS ── */}
      {tab === 'users' && (
        <div>
          <div className="fb">
            <div className="sw-wrap">
              <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input className="srch" placeholder="Buscar usuário..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="flt" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              <option value="">Todos os Papéis</option>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <select className="flt" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="pending">Pendente</option>
            </select>
            {can('usuarios', 'create') && (
              <button className="btn bp bsm" onClick={openNew}><Plus size={11} />Novo Usuário</button>
            )}
          </div>

          <div className="card">
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Usuário</th><th>Papel</th><th>Loja</th><th>Status</th><th>Criado em</th><th>Último acesso</th><th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => {
                    const ri = roleInfo(u.role)
                    const canEdit = can('usuarios', 'edit') && (isSuperAdmin || u.role !== 'super_admin')
                    const canDel = can('usuarios', 'delete') && u.id !== me?.id && (isSuperAdmin || u.role !== 'super_admin')
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="row">
                            <div className="avc" style={{ width: 28, height: 28, background: u.avatar_color, fontSize: 10 }}>{u.initials}</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 12 }}>{u.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><span className={`badge ${ri.badge}`}>{ri.label}</span></td>
                        <td>{u.loja || '—'}</td>
                        <td>{statusBadge(u.status)}</td>
                        <td style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(u.created_at)}</td>
                        <td style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(u.last_login)}</td>
                        <td>
                          <div className="ab">
                            {canEdit && (
                              <button className="ib" title="Editar (dados + permissões)" onClick={() => openEdit(u)}><Edit2 size={11} /></button>
                            )}
                            {canDel && (
                              <button className="ib rd" title="Excluir" onClick={() => setConfirmDelete(u)}><Trash2 size={11} /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {!filtered.length && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)' }}>Nenhum usuário encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PAPÉIS ── */}
      {tab === 'roles' && (
        <div>
          <div className="al al-b" style={{ marginBottom: 14 }}>
            <Lock size={13} />
            <span>Os papéis definem as permissões padrão. Você pode sobrescrever permissões individualmente por usuário na aba Usuários → ícone de escudo.</span>
          </div>
          <div className="cc-grid">
            {ROLES.map(role => {
              const perms = ROLE_PERMISSIONS[role.value] || {}
              const allowed = MODULES.filter(m => perms[m.id]?.view)
              return (
                <div className="cc" key={role.value}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--bordo-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Users size={18} color="var(--bordo)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{role.label}</div>
                      <span className={`badge ${role.badge}`} style={{ marginTop: 2 }}>{role.value}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
                    Módulos com acesso: <strong style={{ color: 'var(--text)' }}>{allowed.length}/{MODULES.length}</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {MODULES.map(m => {
                      const p = perms[m.id]
                      if (!p) return null
                      return (
                        <span key={m.id} className={`badge ${p.view ? 'bg-g' : 'bg-r'}`} style={{ fontSize: 9.5 }}>
                          {p.view ? '✓' : '✗'} {m.label}
                        </span>
                      )
                    })}
                  </div>
                  <div className="dv" />
                  <div style={{ fontSize: 10.5 }}>
                    {Object.entries(perms).slice(0, 1).map(([mod, p]) => (
                      <div key={mod} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {ACTIONS.map(a => (
                          <span key={a.key} className={`badge ${p[a.key] ? 'bg-b' : 'bg-gr'}`} style={{ fontSize: 9 }}>
                            {a.label}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {isSuperAdmin && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-hd">
                <span className="card-tt">Matriz de Permissões — Super Admin</span>
                <span className="badge bg-p">Referência</span>
              </div>
              <div className="tw">
                <table className="pt">
                  <thead>
                    <tr>
                      <th>Módulo</th>
                      {ROLES.map(r => <th key={r.value}>{r.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(m => (
                      <tr key={m.id}>
                        <td>{m.label}</td>
                        {ROLES.map(r => {
                          const p = ROLE_PERMISSIONS[r.value]?.[m.id]
                          return (
                            <td key={r.value}>
                              {p?.view
                                ? <span style={{ color: 'var(--success)', fontSize: 13 }}>✓</span>
                                : <span style={{ color: 'var(--border)', fontSize: 13 }}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── PROVISÓRIOS ── */}
      {tab === 'prov' && (
        <div>
          <div className="al al-b" style={{ marginBottom: 12 }}>
            <Clock size={13} />
            <span>Acessos provisórios expiram automaticamente. O usuário troca a senha no 1º acesso.</span>
          </div>
          <div className="card">
            <div className="card-hd">
              <span className="card-tt">Acessos Provisórios</span>
              <button className="btn bp bsm" onClick={() => { setProvForm({ nome: '', expira: '', modulos: '' }); setProvGerado(''); setShowProvForm(true) }}>
                <Plus size={11} />Gerar
              </button>
            </div>
            <div className="tw">
              <table>
                <thead><tr><th>Nome</th><th>Login</th><th>Expira</th><th>Módulos</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                  {PROV_MOCK.map((p, i) => (
                    <tr key={i}>
                      <td>{p.nome}</td>
                      <td><code style={{ fontSize: 10, background: '#F3F4F6', padding: '1px 4px', borderRadius: 3 }}>{p.login}</code></td>
                      <td style={{ color: 'var(--warning)', fontWeight: 600 }}>{p.expira}</td>
                      <td>{p.modulos}</td>
                      <td><span className="badge bg-g">Ativo</span></td>
                      <td><button className="btn bsm" style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: '#fff' }}>Revogar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT ── */}
      {tab === 'audit' && (
        <div className="card">
          <div className="card-hd">
            <span className="card-tt">Log de Segurança</span>
            <span className="badge bg-gr">Últimas 24h</span>
          </div>
          <div className="card-bd">
            {auditLogs.length === 0 && (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                Nenhum registro encontrado — logs aparecem após ações reais no sistema.
              </div>
            )}
            {auditLogs.map((a: any) => (
              <div className="sl-i" key={a.id}>
                <div className="sl-ico" style={{ background: '#DBEAFE' }}>
                  <Edit2 size={11} color="#1E40AF" />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{a.action} — {a.user_name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(a.created_at).toLocaleString('pt-BR')} · {a.module} {a.detail ? '· ' + a.detail : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL CRIAR/EDITAR USUÁRIO ── */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editingUser ? `Editar — ${editingUser.name}` : 'Novo Usuário'}
        footer={
          <>
            <button className="btn bo" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn bp" onClick={saveUser} disabled={saving}>{saving && <Loader2 size={12} className="spin" />}Salvar</button>
          </>
        }
      >
        {formErr && <div className="al al-r" style={{ marginBottom: 10 }}><XCircle size={13} /><span>{formErr}</span></div>}
        <div className="g2">
          <div className="fg" style={{ gridColumn: '1/-1' }}>
            <label className="fl">Nome completo <span className="rq">*</span></label>
            <input className="inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl">E-mail <span className="rq">*</span></label>
            <input className="inp" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} disabled={!!editingUser} />
          </div>
          <div className="fg">
            <label className="fl">Cargo</label>
            <input className="inp" value={form.cargo} onChange={e => setForm(p => ({ ...p, cargo: e.target.value }))} placeholder="Ex: Comprador" />
          </div>
          <div className="fg">
            <label className="fl">Setor</label>
            <input className="inp" value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))} placeholder="Ex: Compras" />
          </div>
          <div className="fg">
            <label className="fl">📱 WhatsApp principal</label>
            <input className="inp" value={form.whatsapp} onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))} placeholder="5581999999999" />
          </div>
          <div className="fg">
            <label className="fl">WhatsApp secundário</label>
            <input className="inp" value={form.whatsapp2} onChange={e => setForm(p => ({ ...p, whatsapp2: e.target.value }))} placeholder="(opcional)" />
          </div>
          <div className="fg">
            <label className="fl">Papel</label>
            <select className="sel" value={form.role} onChange={e => { const nr = e.target.value as UserRole; setForm(p => ({ ...p, role: nr, template: '' })); resetPermParaPapel(nr) }}>
              {ROLES.filter(r => isSuperAdmin ? true : r.value !== 'super_admin').map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl">Status</label>
            <select className="sel" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as UserStatus }))}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="pending">Pendente</option>
            </select>
          </div>
          <div className="fg" style={{ gridColumn: '1/-1' }}>
            <label className="fl">Loja</label>
            <select className="sel" value={form.loja} onChange={e => setForm(p => ({ ...p, loja: e.target.value }))}>
              <option value="">Todas</option>
              {['Amore CD', 'Amore Paiva', 'Flow CD'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {/* ── Permissões (dentro do cadastro) ── */}
          <div className="fg" style={{ gridColumn: '1/-1', marginTop: 4 }}>
            <label className="fl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={13} /> Permissões — marque o que este usuário acessa</label>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
              A coluna <strong>Ver</strong> define o que aparece no menu; as demais liberam Criar / Editar / Excluir / Exportar.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap', padding: '8px 10px', background: 'var(--bordo-bg)', borderRadius: 8, border: '1px solid var(--bordo-l)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bordo)' }}>🧩 Modelo:</span>
              <select className="sel" style={{ flex: 1, minWidth: 180 }} value={form.template} onChange={e => { if (e.target.value) aplicarModelo(e.target.value); else setForm(p => ({ ...p, template: '' })) }}>
                <option value="">Personalizado</option>
                {PERMISSION_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>)}
              </select>
              <button type="button" className="btn bo bsm" onClick={() => { resetPermParaPapel(form.role); setForm(p => ({ ...p, template: '' })) }}>Padrão do papel</button>
            </div>
            <div className="tw" style={{ marginBottom: 12, maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="pt">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Módulo</th>
                    {ACTIONS.map(a => <th key={a.key}>{a.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const grupos = [...new Set(MODULES.map(m => m.grupo))]
                    return grupos.flatMap(grupo => [
                      <tr key={`g-${grupo}`} style={{ background: '#F9FAFB' }}>
                        <td colSpan={6} style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '5px 8px' }}>{grupo}</td>
                      </tr>,
                      ...MODULES.filter(m => m.grupo === grupo).map(m => {
                        const p = permMap[m.id] || { view: false, create: false, edit: false, delete: false, export: false }
                        const todos = p.view && p.create && p.edit && p.delete && p.export
                        return (
                          <tr key={m.id}>
                            <td style={{ paddingLeft: 14 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }} title="Marcar/desmarcar tudo neste módulo">
                                <input type="checkbox" className="pck" checked={todos} onChange={e => toggleModuloTodos(m.id, e.target.checked)} />
                                <span style={{ fontWeight: p.view ? 700 : 400 }}>{m.label}</span>
                              </label>
                            </td>
                            {ACTIONS.map(a => (
                              <td key={a.key} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => togglePerm(m.id, a.key)}>
                                <input type="checkbox" className="pck" checked={Boolean(p[a.key])} onChange={() => togglePerm(m.id, a.key)} onClick={e => e.stopPropagation()} />
                              </td>
                            ))}
                          </tr>
                        )
                      }),
                    ])
                  })()}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>🏪 Restringir a loja(s) <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(vazio = todas)</span></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {LOJAS_DISPONIVEIS.filter(l => l !== 'Todas').map(loja => (
                <label key={loja} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <input type="checkbox" className="pck" checked={permRestricoes.lojas.includes(loja)} onChange={() => toggleRestricaoLoja(loja)} />
                  {loja}
                </label>
              ))}
            </div>
          </div>
          {!editingUser && (
            <>
              <div className="fg">
                <label className="fl">Senha <span className="rq">*</span></label>
                <input className="inp" type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
                <span className="fhint">Mínimo 6 caracteres</span>
              </div>
              <div className="fg">
                <label className="fl">Confirmar senha <span className="rq">*</span></label>
                <input className="inp" type="password" value={form.password2} onChange={e => setForm(p => ({ ...p, password2: e.target.value }))} />
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ── MODAL PROV ── */}
      <Modal
        open={showProvForm}
        onClose={() => setShowProvForm(false)}
        title="Gerar Acesso Provisório"
        footer={
          <>
            <button className="btn bo" onClick={() => setShowProvForm(false)}>Fechar</button>
            <button className="btn bp" onClick={gerarProv}>Gerar</button>
          </>
        }
      >
        <div className="fg">
          <label className="fl">Nome do usuário <span className="rq">*</span></label>
          <input className="inp" value={provForm.nome} onChange={e => setProvForm(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Consultor Externo" />
        </div>
        <div className="fg">
          <label className="fl">Data de expiração <span className="rq">*</span></label>
          <input className="inp" type="date" value={provForm.expira} onChange={e => setProvForm(p => ({ ...p, expira: e.target.value }))} />
        </div>
        <div className="fg">
          <label className="fl">Módulos liberados</label>
          <input className="inp" value={provForm.modulos} onChange={e => setProvForm(p => ({ ...p, modulos: e.target.value }))} placeholder="Dashboard, Financeiro" />
        </div>
        {provGerado && (
          <div className="al al-g">
            <CheckCircle size={13} />
            <div><strong>Acesso gerado:</strong><br /><code style={{ fontSize: 11 }}>{provGerado}</code><br /><span style={{ fontSize: 10.5 }}>Senha inicial: 123456 (será trocada no 1º acesso)</span></div>
          </div>
        )}
      </Modal>

      <Confirm
        open={!!confirmDelete}
        message={`Excluir o usuário "${confirmDelete?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={() => confirmDelete && deleteUser(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
