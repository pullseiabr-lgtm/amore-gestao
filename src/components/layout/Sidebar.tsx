import { LayoutDashboard, FileText, Trophy, Megaphone, TrendingUp, ShoppingCart, DollarSign, ChefHat, Coffee, Users, Settings, LogOut, Home, Package } from 'lucide-react'
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

const MENU: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={13} /> },
  { id: 'pendencias', label: 'Pendências & OS', icon: <FileText size={13} />, badge: '7' },
  { id: 'gamificacao', label: 'Gamificação', icon: <Trophy size={13} /> },
  { id: 'marketing', label: 'Marketing 360°', icon: <Megaphone size={13} /> },
  { id: 'vendas', label: 'Vendas', icon: <TrendingUp size={13} /> },
  { id: 'compras', label: 'Compras & Estoque', icon: <ShoppingCart size={13} /> },
  { id: 'estoque', label: 'Estoque', icon: <Package size={13} /> },
  { id: 'financeiro', label: 'Financeiro', icon: <DollarSign size={13} /> },
  { id: 'cozinha', label: 'Cozinha', icon: <ChefHat size={13} /> },
  { id: 'salao', label: 'Salão', icon: <Coffee size={13} /> },
]

const ADMIN_MENU: NavItem[] = [
  { id: 'usuarios', label: 'Usuários & Permissões', icon: <Users size={13} />, adminOnly: true },
  { id: 'configuracoes', label: 'White Label', icon: <Settings size={13} />, superAdminOnly: true },
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

  const roleLabel = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    manager: 'Gerente',
    user: 'Colaborador',
    viewer: 'Visualizador',
  }[user?.role || 'user']

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
          {MENU.filter(m => can(m.id, 'view')).map(m => (
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
