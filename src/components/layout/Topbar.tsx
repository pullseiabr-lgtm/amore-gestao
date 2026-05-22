import { Menu, FileText, Plus, FlaskConical } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { useLoja } from '../../contexts/LojaContext'

interface TopbarProps {
  title: string
  activePage: string
  onHamburger: () => void
  onPrimary?: () => void
  primaryLabel?: string
}

const ACT_MAP: Record<string, string> = {
  pendencias: 'Nova Pendência',
  gamificacao: 'Novo Colaborador',
  marketing: 'Nova Ação',
  vendas: 'Nova Venda',
  compras: 'Nova Compra',
  usuarios: 'Novo Usuário',
  cozinha: 'Lançar',
  salao: 'Registrar',
}

export default function Topbar({ title, activePage, onHamburger, onPrimary, primaryLabel }: TopbarProps) {
  const { theme } = useTheme()
  const { user, can, isDemoMode } = useAuth()
  const { loja, setLoja, lojas, multiLoja } = useLoja()
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin'
  const actLabel = primaryLabel || ACT_MAP[activePage]
  const showAct = actLabel && isAdmin && can(activePage, 'create')

  return (
    <header className="topbar">
      <button className="hamburger-btn tb-btn" onClick={onHamburger} style={{ display: 'flex' }}>
        <Menu size={16} />
      </button>
      <div className="tb-title">{title}</div>
      {isDemoMode && (
        <span className="badge bg-y" style={{ fontSize: 10, gap: 4, display: 'flex', alignItems: 'center' }}>
          <FlaskConical size={10} /> Demo
        </span>
      )}

      {multiLoja ? (
        <select
          className="tb-sel"
          value={loja}
          onChange={e => setLoja(e.target.value)}
        >
          <option value="Todas as Lojas">🏪 Todas as Lojas</option>
          {(lojas.length ? lojas : theme.stores).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      ) : user?.loja ? (
        <span style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 10px', background: 'var(--bg2)', borderRadius: 8 }}>
          🏪 {user.loja}
        </span>
      ) : null}

      <button className="tb-btn" onClick={() => window.print()}>
        <FileText size={11} />PDF
      </button>

      {showAct && (
        <button className="tb-btn primary" onClick={onPrimary}>
          <Plus size={11} />{actLabel}
        </button>
      )}
    </header>
  )
}
