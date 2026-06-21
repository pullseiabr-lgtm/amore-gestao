import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { carregarZapiCfgRemoto } from './lib/notify'
import { useTheme } from './contexts/ThemeContext'
import { LojaProvider } from './contexts/LojaContext'
import LoginPage from './pages/auth/LoginPage'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import DashboardPage from './pages/dashboard/DashboardPage'
import VendasPage from './pages/vendas/VendasPage'
import ComprasPage from './pages/compras/ComprasPage'
import NotasFiscaisPage from './pages/notas/NotasFiscaisPage'
import FinanceiroPage from './pages/financeiro/FinanceiroPage'
import MarketingPage from './pages/marketing/MarketingPage'
import ContatosPage from './pages/marketing/ContatosPage'
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
import FluxoSuprimentosPage from './pages/suprimentos/FluxoSuprimentosPage'
import DashboardSuprimentosPage from './pages/suprimentos/DashboardSuprimentosPage'
import BoletosPage from './pages/boletos/BoletosPage'
import ProdutosPage from './pages/produtos/ProdutosPage'
import RelatorioCVLPage from './pages/relatorios/RelatorioCVLPage'
import RupturaPage from './pages/relatorios/RupturaPage'
import PdvPage from './pages/pdv/PdvPage'
import MarketPage from './pages/market/MarketPage'
import ComprasAgentePage from './pages/compras/ComprasAgentePage'
import AgenteLizPage from './pages/agente/AgenteLizPage'
import AgenteCMVPage from './pages/agente/AgenteCMVPage'
import NotificacoesPage from './pages/notificacoes/NotificacoesPage'
import TarefasPage from './pages/tarefas/TarefasPage'
import EnxovalPage from './pages/enxoval/EnxovalPage'
import PlanejamentoPage from './pages/planejamento/PlanejamentoPage'
import AtasPage from './pages/atas/AtasPage'
import ListaPadraoPage from './pages/lista-padrao/ListaPadraoPage'
import AlertasPage from './pages/alertas/AlertasPage'

export type PageId =
  | 'dashboard'
  | 'vendas'
  | 'compras'
  | 'notas-fiscais'
  | 'requisicoes'
  | 'req-automaticas'
  | 'pipeline-suprimentos'
  | 'dashboard-suprimentos'
  | 'boletos'
  | 'estoque'
  | 'fornecedores'
  | 'financeiro'
  | 'marketing'
  | 'mkt-contatos'
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
  | 'agente-cmv'
  | 'tarefas'
  | 'enxoval'
  | 'planejamento'
  | 'atas'
  | 'lista-padrao'
  | 'alertas'
  | 'notificacoes'

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  vendas: 'Vendas',
  compras: 'Compras',
  'notas-fiscais': 'Notas Fiscais',
  requisicoes: 'Requisições de Compra',
  'req-automaticas': 'Requisições Automáticas',
  'pipeline-suprimentos': 'Pipeline de Suprimentos',
  'dashboard-suprimentos': 'Dashboard de Suprimentos',
  boletos: 'Central de Boletos',
  estoque: 'Estoque',
  fornecedores: 'Fornecedores',
  financeiro: 'Financeiro',
  marketing: 'Marketing',
  'mkt-contatos': 'Central de Consentimento',
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
  'agente-cmv': 'Agente de Precificação & CMV',
  tarefas: 'Central de Tarefas',
  enxoval: 'Controle de Enxoval',
  planejamento: 'Planejamento Operacional',
  atas: 'Atas de Reunião',
  'lista-padrao': 'Lista de Compras Padronizada',
  alertas: 'Alertas & Rastreabilidade',
  notificacoes: 'Central de Notificações',
}

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'vendas': return <VendasPage />
    case 'compras': return <ComprasPage />
    case 'notas-fiscais': return <NotasFiscaisPage />
    case 'requisicoes':      return <RequisoesPage />
    case 'req-automaticas': return <RequisoesAutomaticasPage />
    case 'pipeline-suprimentos': return <FluxoSuprimentosPage />
    case 'dashboard-suprimentos': return <DashboardSuprimentosPage />
    case 'boletos': return <BoletosPage />
    case 'estoque': return <EstoquePage />
    case 'fornecedores': return <FornecedoresPage />
    case 'financeiro': return <FinanceiroPage />
    case 'marketing': return <MarketingPage />
    case 'mkt-contatos': return <ContatosPage />
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
    case 'agente-cmv':           return <AgenteCMVPage />
    case 'notificacoes':         return <NotificacoesPage />
    case 'tarefas':              return <TarefasPage />
    case 'enxoval':              return <EnxovalPage />
    case 'planejamento':         return <PlanejamentoPage />
    case 'atas':                 return <AtasPage />
    case 'lista-padrao':         return <ListaPadraoPage />
    case 'alertas':              return <AlertasPage />
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

  // Sincroniza a config do Z-API (WhatsApp) a partir do banco — assim qualquer
  // computador já tem as credenciais salvas, sem reconfigurar por navegador.
  useEffect(() => {
    if (user) carregarZapiCfgRemoto().catch(() => {})
  }, [user])

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
