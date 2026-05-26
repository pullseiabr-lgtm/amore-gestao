import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import { LojaProvider } from './contexts/LojaContext'
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
import RequisoesAutomaticasPage from './pages/requisicoes/RequisoesAutomaticasPage'
import ProdutosPage from './pages/produtos/ProdutosPage'
import RelatorioCVLPage from './pages/relatorios/RelatorioCVLPage'
import RupturaPage from './pages/relatorios/RupturaPage'
import PdvPage from './pages/pdv/PdvPage'
import MarketPage from './pages/market/MarketPage'
import ComprasAgentePage from './pages/compras/ComprasAgentePage'
import AgenteLizPage from './pages/agente/AgenteLizPage'

export type PageId =
  | 'dashboard'
  | 'vendas'
  | 'compras'
  | 'requisicoes'
  | 'req-automaticas'
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
  | 'produtos'
  | 'produtos-categorias'
  | 'relatorio-cvl'
  | 'ruptura'
  | 'pdv'
  | 'market'
  | 'compras-agente'
  | 'agente-liz'

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  vendas: 'Vendas',
  compras: 'Compras',
  requisicoes: 'Requisições de Compra',
  'req-automaticas': 'Requisições Automáticas',
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
  produtos: 'Produtos',
  'produtos-categorias': 'Categorias de Produtos',
  'relatorio-cvl': 'Compra vs Lista',
  ruptura: 'Ruptura de Pedidos',
  pdv: 'PDV — Ponto de Venda',
  market: 'Market Analytics & Supplier Intelligence',
  'compras-agente': 'Agente Analítico de Compras',
  'agente-liz': 'Liz — Agente Gestora',
}

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'vendas': return <VendasPage />
    case 'compras': return <ComprasPage />
    case 'requisicoes':      return <RequisoesPage />
    case 'req-automaticas': return <RequisoesAutomaticasPage />
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
    case 'produtos':             return <ProdutosPage />
    case 'produtos-categorias':  return <ProdutosPage initialView="categorias" />
    case 'relatorio-cvl':        return <RelatorioCVLPage />
    case 'ruptura':              return <RupturaPage />
    case 'pdv':                  return <PdvPage />
    case 'market':               return <MarketPage />
    case 'compras-agente':       return <ComprasAgentePage />
    case 'agente-liz':           return <AgenteLizPage />
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

  // Custom event from dashboard agent button
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail as PageId
      if (id) { setPage(id); setSidebarOpen(false) }
    }
    document.addEventListener('amore-nav', handler)
    return () => document.removeEventListener('amore-nav', handler)
  }, [])

  const navigate = (p: PageId) => {
    setPage(p)
    setSidebarOpen(false)
  }

  if (!user) return <LoginPage />

  return (
    <LojaProvider stores={theme.stores || []}>
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

        {/* ── Botão flutuante Liz ── */}
        {page !== 'agente-liz' && (
          <div
            onClick={() => navigate('agente-liz')}
            title="Falar com Liz"
            style={{
              position: 'fixed',
              bottom: 24,
              right: 24,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              cursor: 'pointer',
              zIndex: 9999,
            }}
          >
            {/* Círculo roxo */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                boxShadow: '0 4px 20px rgba(124,58,237,0.5)',
                transition: 'transform .15s, box-shadow .15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.12)'
                ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 28px rgba(124,58,237,0.7)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'
                ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 20px rgba(124,58,237,0.5)'
              }}
            >
              🤖
              {/* Ponto verde online */}
              <span style={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid #fff',
                animation: 'liz-pulse 2s ease-in-out infinite',
              }} />
            </div>

            {/* Nome abaixo */}
            <span style={{
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.5,
              background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
              padding: '2px 10px',
              borderRadius: 999,
              boxShadow: '0 2px 8px rgba(124,58,237,0.4)',
            }}>
              Liz
            </span>
          </div>
        )}

        <style>{`
          @keyframes liz-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: .7; }
          }
        `}</style>
      </div>
    </LojaProvider>
  )
}
