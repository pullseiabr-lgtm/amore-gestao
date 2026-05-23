import { useState, useEffect } from 'react'
import { LayoutDashboard, FileText, Trophy, Megaphone, TrendingUp, ShoppingCart, DollarSign, ChefHat, Coffee, Users, Settings, LogOut, Home, Package, ChevronDown, ChevronRight, Building2, ClipboardList, UtensilsCrossed, Tag, BarChart2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'

export interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: string
  adminOnly?: boolean
  superAdminOnly?: boolean
}

// Itens simples do menu
const MENU_TOP: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',       icon: <LayoutDashboard size={13} /> },
  { id: 'pendencias',  label: 'Pendências & OS',  icon: <FileText size={13} />, badge: '7' },
  { id: 'gamificacao', label: 'Gamificação',       icon: <Trophy size={13} /> },
  { id: 'marketing',   label: 'Marketing 360°',   icon: <Megaphone size={13} /> },
  { id: 'vendas',      label: 'Vendas',            icon: <TrendingUp size={13} /> },
]

// Sub-itens do grupo Produtos
const PRODUTOS_SUBMENU: NavItem[] = [
  { id: 'produtos',            label: 'Lista de Produtos', icon: <Package size={12} /> },
  { id: 'produtos-categorias', label: 'Categorias',        icon: <Tag size={12} /> },
]

// Sub-itens do grupo Compras & Estoque
const COMPRAS_SUBMENU: NavItem[] = [
  { id: 'compras',      label: 'Lista de Compras', icon: <ShoppingCart size={12} /> },
  { id: 'requisicoes',  label: 'Requisições',      icon: <ClipboardList size={12} /> },
  { id: 'estoque',      label: 'Estoque',           icon: <Package size={12} /> },
  { id: 'fornecedores', label: 'Fornecedores',      icon: <Building2 size={12} /> },
]

// Sub-itens do grupo Relatórios
const RELATORIOS_SUBMENU: NavItem[] = [
  { id: 'relatorio-cvl', label: 'Compra vs Lista', icon: <BarChart2 size={12} /> },
  { id: 'ruptura',       label: 'Ruptura de Pedidos', icon: <AlertTriangle size={12} /> },
]

const MENU_BOTTOM: NavItem[] = [
  { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={13} /> },
  { id: 'cozinha',    label: 'Cozinha',    icon: <ChefHat size={13} /> },
  { id: 'salao',      label: 'Salão',      icon: <Coffee size={13} /> },
]

const ADMIN_MENU: NavItem[] = [
  { id: 'usuarios',       label: 'Usuários & Permissões', icon: <Users size={13} />, adminOnly: true },
  { id: 'configuracoes',  label: 'White Label',            icon: <Settings size={13} />, superAdminOnly: true },
]

interface SidebarProps {
  activePage: string
  onNav: (id: string, label: string) => void
  mobileOpen: boolean
  onOverlayClick: () => void
}

export default function Sidebar({ activePage, onNav, mobileOpen, onOverlayClick }: SidebarProps) {
  const { user, logout, can } = useAuth()
  const { theme } = useTheme()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const isSuperAdmin = user?.role === 'super_admin'

  // Abre o dropdown automaticamente se a página ativa for do grupo Produtos
  const isProdutosGroup = (p: string) => p === 'produtos' || p === 'produtos-categorias'

  // Abre o dropdown automaticamente se a página ativa for do grupo Compras
  const isComprasGroup = (p: string) => p === 'compras' || p === 'requisicoes' || p === 'estoque' || p === 'fornecedores'
  const isRelatoriosGroup = (p: string) => p === 'relatorio-cvl' || p === 'ruptura'

  const [produtosOpen, setProdutosOpen] = useState(isProdutosGroup(activePage))
  const [comprasOpen, setComprasOpen] = useState(isComprasGroup(activePage))
  const [relatoriosOpen, setRelatoriosOpen] = useState(isRelatoriosGroup(activePage))

  useEffect(() => {
    if (isProdutosGroup(activePage))    setProdutosOpen(true)
    if (isComprasGroup(activePage))     setComprasOpen(true)
    if (isRelatoriosGroup(activePage))  setRelatoriosOpen(true)
  }, [activePage])

  const roleLabel = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    manager: 'Gerente',
    user: 'Colaborador',
    viewer: 'Visualizador',
  }[user?.role || 'user']

  const isComprasActive = isComprasGroup(activePage)

  return (
    <>
      <div className={`sidebar-overlay ${mobileOpen ? 'visible' : ''}`} onClick={onOverlayClick} />
      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="sb-logo">
          <div className="sb-icon">
            {theme.logo_url
              ? <img src={theme.logo_url} alt="logo" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              : <Home size={15} color="#fff" />
            }
          </div>
          <div className="sb-company">{theme.company_name}</div>
          <div className="sb-sub">Sistema Integrado v5.0</div>
        </div>

        <nav className="sb-nav">
          <div className="sb-sec">Módulos</div>

          {/* Itens superiores */}
          {MENU_TOP.filter(m => can(m.id, 'view')).map(m => (
            <div
              key={m.id}
              className={`nav-item${activePage === m.id ? ' active' : ''}`}
              onClick={() => onNav(m.id, m.label)}
            >
              {m.icon}
              {m.label}
              {m.badge && <span className="nav-badge">{m.badge}</span>}
            </div>
          ))}

          {/* ── Grupo Produtos (dropdown) ── */}
          {can('produtos', 'view') && (
            <div>
              <div
                className={`nav-item${isProdutosGroup(activePage) ? ' active' : ''}`}
                onClick={() => setProdutosOpen(o => !o)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <UtensilsCrossed size={13} />
                Produtos
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {produtosOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              </div>
              {produtosOpen && (
                <div style={{ overflow: 'hidden' }}>
                  {PRODUTOS_SUBMENU.map(m => (
                    <div
                      key={m.id}
                      className={`nav-item${activePage === m.id ? ' active' : ''}`}
                      onClick={() => onNav(m.id, m.label)}
                      style={{
                        paddingLeft: 28, fontSize: 12,
                        borderLeft: '2px solid var(--bordo-l)',
                        marginLeft: 16,
                        borderRadius: '0 6px 6px 0',
                      }}
                    >
                      {m.icon}
                      {m.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Grupo Compras & Estoque (dropdown) ── */}
          {(can('compras', 'view') || can('estoque', 'view')) && (
            <div>
              {/* Cabeçalho do grupo */}
              <div
                className={`nav-item${isComprasActive ? ' active' : ''}`}
                onClick={() => setComprasOpen(o => !o)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <ShoppingCart size={13} />
                Compras & Estoque
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {comprasOpen
                    ? <ChevronDown size={12} />
                    : <ChevronRight size={12} />
                  }
                </span>
              </div>

              {/* Sub-itens */}
              {comprasOpen && (
                <div style={{ overflow: 'hidden' }}>
                  {COMPRAS_SUBMENU.filter(m => can(m.id, 'view')).map(m => (
                    <div
                      key={m.id}
                      className={`nav-item${activePage === m.id ? ' active' : ''}`}
                      onClick={() => onNav(m.id, m.label)}
                      style={{
                        paddingLeft: 28,
                        fontSize: 12,
                        borderLeft: '2px solid var(--bordo-l)',
                        marginLeft: 16,
                        borderRadius: '0 6px 6px 0',
                      }}
                    >
                      {m.icon}
                      {m.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Grupo Relatórios (dropdown) ── */}
          {(can('relatorio-cvl', 'view') || can('ruptura', 'view')) && (
            <div>
              <div
                className={`nav-item${isRelatoriosGroup(activePage) ? ' active' : ''}`}
                onClick={() => setRelatoriosOpen(o => !o)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <BarChart2 size={13} />
                Relatórios
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {relatoriosOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </span>
              </div>
              {relatoriosOpen && (
                <div style={{ overflow: 'hidden' }}>
                  {RELATORIOS_SUBMENU.filter(m => can(m.id, 'view')).map(m => (
                    <div
                      key={m.id}
                      className={`nav-item${activePage === m.id ? ' active' : ''}`}
                      onClick={() => onNav(m.id, m.label)}
                      style={{ paddingLeft: 28, fontSize: 12, borderLeft: '2px solid var(--bordo-l)', marginLeft: 16, borderRadius: '0 6px 6px 0' }}
                    >
                      {m.icon}
                      {m.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Itens inferiores */}
          {MENU_BOTTOM.filter(m => can(m.id, 'view')).map(m => (
            <div
              key={m.id}
              className={`nav-item${activePage === m.id ? ' active' : ''}`}
              onClick={() => onNav(m.id, m.label)}
            >
              {m.icon}
              {m.label}
            </div>
          ))}

          {isAdmin && (
            <>
              <div className="sb-sec">Administração</div>
              {ADMIN_MENU.filter(m => {
                if (m.superAdminOnly) return isSuperAdmin
                if (m.adminOnly) return isAdmin
                return true
              }).map(m => (
                <div
                  key={m.id}
                  className={`nav-item${activePage === m.id ? ' active' : ''}`}
                  onClick={() => onNav(m.id, m.label)}
                >
                  {m.icon}
                  {m.label}
                </div>
              ))}
            </>
          )}
        </nav>

        <div className="sb-foot">
          <div className="sb-user">
            <div className="sb-av" style={{ background: user?.avatar_color || 'var(--bordo)' }}>
              {user?.initials}
            </div>
            <div>
              <div className="sb-nm">{user?.name}</div>
              <div className="sb-rl">{roleLabel} · {user?.loja}</div>
            </div>
            <button className="lo-btn" onClick={logout} title="Sair"><LogOut size={13} /></button>
          </div>
        </div>
      </aside>
    </>
  )
}
