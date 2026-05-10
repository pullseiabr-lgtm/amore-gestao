import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import LoginPage from './pages/auth/LoginPage'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import DashboardPage from './pages/dashboard/DashboardPage'
import VendasPage from './pages/vendas/VendasPage'
import ComprasPage from './pages/compras/ComprasPage'
import FinanceiroPage from './pages/financeiro/FinanceiroPage'
import MarketingPage from './pages/marketing/MarketingPage'
import GamificacaoPage from './pages/gamificacao/GamificacaoPage'
import PendenciasPage from './pages/pendencias/PendenciasPage'
import CozinhaPage from './pages/cozinha/CozinhaPage'
import SalaoPage from './pages/salao/SalaoPage'
import UsersPage from './pages/users/UsersPage'
import SettingsPage from './pages/settings/SettingsPage'
import EstoquePage from './pages/estoque/EstoquePage'
import FornecedoresPage from './pages/fornecedores/FornecedoresPage'
import RequisoesPage from './pages/requisicoes/RequisoesPage'

export type PageId =
  | 'dashboard'
  | 'vendas'
  | 'compras'
  | 'requisicoes'
  | 'estoque'
  | 'fornecedores'
  | 'financeiro'
  | 'marketing'
  | 'gamificacao'
  | 'pendencias'
  | 'cozinha'
  | 'salao'
  | 'usuarios'
  | 'configuracoes'

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  vendas: 'Vendas',
  compras: 'Compras',
  requisicoes: 'Requisições de Compra',
  estoque: 'Estoque',
  fornecedores: 'Fornecedores',
  financeiro: 'Financeiro',
  marketing: 'Marketing',
  gamificacao: 'Gamificação',
  pendencias: 'Pendências & OS',
  cozinha: 'Cozinha',
  salao: 'Salão',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
}

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'vendas': return <VendasPage />
    case 'compras': return <ComprasPage />
    case 'requisicoes': return <RequisoesPage />
    case 'estoque': return <EstoquePage />
    case 'fornecedores': return <FornecedoresPage />
    case 'financeiro': return <FinanceiroPage />
    case 'marketing': return <MarketingPage />
    case 'gamificacao': return <GamificacaoPage />
    case 'pendencias': return <PendenciasPage />
    case 'cozinha': return <CozinhaPage />
    case 'salao': return <SalaoPage />
    case 'usuarios': return <UsersPage />
    case 'configuracoes': return <SettingsPage />
    default: return <DashboardPage />
  }
}

export default function App() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const [page, setPage] = useState<PageId>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    document.title = theme.company_name || 'Amore Gestão'
  }, [theme.company_name])

  const navigate = (p: PageId) => {
    setPage(p)
    setSidebarOpen(false)
  }

  if (!user) return <LoginPage />

  return (
    <div className="app-wrap">
      <Sidebar
        activePage={page}
        onNav={(id) => navigate(id as PageId)}
        mobileOpen={sidebarOpen}
        onOverlayClick={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <Topbar
          title={PAGE_TITLES[page]}
          activePage={page}
          onHamburger={() => setSidebarOpen(o => !o)}
        />
        <main className="page-content">
          <PageContent page={page} />
        </main>
      </div>
    </div>
  )
}
