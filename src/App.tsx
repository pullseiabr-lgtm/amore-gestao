import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { carregarZapiCfgRemoto } from './lib/notify'
import { useTheme } from './contexts/ThemeContext'
import { LojaProvider, useLoja } from './contexts/LojaContext'
import LoginPage from './pages/auth/LoginPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import Sidebar from './components/layout/Sidebar'
import Topbar from './components/layout/Topbar'
import DashboardPage from './pages/dashboard/DashboardPage'
import VendasPage from './pages/vendas/VendasPage'
import ComprasPage from './pages/compras/ComprasPage'
import NotasFiscaisPage from './pages/notas/NotasFiscaisPage'
import InteligenciaComprasPage from './pages/notas/InteligenciaComprasPage'
import CmvAbcPage from './pages/notas/CmvAbcPage'
import CompradorIaPage from './pages/notas/CompradorIaPage'
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
import CotacaoPage from './pages/cotacao/CotacaoPage'
import PedidosPage from './pages/pedidos/PedidosPage'
import RelatorioDiarioPage from './pages/relatorio-diario/RelatorioDiarioPage'
import CicloComprasPage from './pages/ciclo-compras/CicloComprasPage'
import RequisicaoInteligentePage from './pages/requisicao-inteligente/RequisicaoInteligentePage'
import AnaliseSemanalPage from './pages/analise-semanal/AnaliseSemanalPage'
import EntregasPage from './pages/entregas/EntregasPage'
import PainelGestaoPage from './pages/gestao/PainelGestaoPage'
import CustosPage from './pages/custos/CustosPage'
import ComprasConsumoPage from './pages/compras-consumo/ComprasConsumoPage'
import GestaoPerdasPage from './pages/perdas/GestaoPerdasPage'
import CentralAlertasPage from './pages/alertas-gestao/CentralAlertasPage'
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
import CaixasPage from './pages/caixas/CaixasPage'
import CreditosPage from './pages/creditos/CreditosPage'
import AvaliacoesPage from './pages/avaliacoes/AvaliacoesPage'
import RaspadinhaPage from './pages/raspadinha/RaspadinhaPage'
import LizCentralPage from './pages/liz/LizCentralPage'
import ClientesPage from './pages/clientes/ClientesPage'
import GestaoListaPage from './pages/gestao-lista/GestaoListaPage'
import RequisicaoNovaPage from './pages/requisicao-nova/RequisicaoNovaPage'
import CampanhasPage from './pages/campanhas/CampanhasPage'
import PesquisaAuraPage from './pages/pesquisa/PesquisaAuraPage'
import ControleAgentePage from './pages/agente-controle/ControleAgentePage'
import RelatoriosPrecosPage from './pages/relatorios-precos/RelatoriosPrecosPage'
import RecebimentoPage from './pages/recebimento/RecebimentoPage'
import EtiquetasPage from './pages/etiquetas/EtiquetasPage'
import TarefasPage from './pages/tarefas/TarefasPage'
import ChecklistsPage from './pages/checklists/ChecklistsPage'
import PautaReuniaoPage from './pages/pautas/PautaReuniaoPage'
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
  | 'compras-inteligencia'
  | 'cmv-abc'
  | 'comprador-ia'
  | 'requisicoes'
  | 'cotacao'
  | 'pedidos'
  | 'relatorio-diario'
  | 'ciclo-compras'
  | 'requisicao-inteligente'
  | 'analise-semanal'
  | 'entregas'
  | 'painel-gestao'
  | 'custos'
  | 'compras-consumo'
  | 'gestao-perdas'
  | 'central-alertas'
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
  | 'checklists'
  | 'pauta-reuniao'
  | 'enxoval'
  | 'planejamento'
  | 'atas'
  | 'lista-padrao'
  | 'alertas'
  | 'notificacoes'
  | 'caixas'
  | 'avaliacoes'
  | 'raspadinha'
  | 'liz-central'
  | 'clientes'
  | 'campanhas'
  | 'agente-controle'
  | 'relatorios-precos'
  | 'recebimento'
  | 'etiquetas'
  | 'pesquisa-aura'
  | 'gestao-lista'
  | 'requisicao-nova'
  | 'creditos'

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  vendas: 'Vendas',
  compras: 'Compras',
  'notas-fiscais': 'Notas Fiscais',
  'compras-inteligencia': 'Inteligência de Compras',
  'cmv-abc': 'CMV & Curva ABC',
  'comprador-ia': 'Comprador IA',
  requisicoes: 'Requisições de Compra',
  cotacao: 'Cotação Inteligente de Compras',
  pedidos: 'Pedidos de Compra',
  'relatorio-diario': 'Relatório Diário',
  'ciclo-compras': 'Ciclo de Compras & Recebimento',
  'requisicao-inteligente': 'Requisição Inteligente',
  'analise-semanal': 'Análise Semanal de Compra',
  'entregas': 'Agendamento de Entregas',
  'painel-gestao': 'Painel de Gestão',
  'custos': 'Custo por Produto',
  'compras-consumo': 'Compras × Consumo',
  'gestao-perdas': 'Gestão de Perdas',
  'central-alertas': 'Central de Alertas',
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
  checklists: 'Operação Padrão',
  'pauta-reuniao': 'Sugestão de Pauta de Reunião',
  enxoval: 'Controle de Enxoval',
  planejamento: 'Planejamento Operacional',
  atas: 'Atas de Reunião',
  'lista-padrao': 'Lista de Compras Padronizada',
  alertas: 'Alertas & Rastreabilidade',
  notificacoes: 'Central de Notificações',
  caixas: 'Caixas & Despesas',
  avaliacoes: 'Avaliações & NPS',
  raspadinha: 'Raspadinha Digital',
  'liz-central': 'Liz — Central Operacional',
  clientes: 'Clientes Amore (CRM)',
  campanhas: 'Campanhas',
  'agente-controle': 'Controle do Agente',
  'relatorios-precos': 'Relatório de Compras',
  recebimento: 'Recebimento Inteligente',
  etiquetas: 'Etiquetas & Leitura',
  'pesquisa-aura': 'Pesquisa — Vamos Farmar Aura',
  'gestao-lista': 'Gestão da Lista de Compras',
  'requisicao-nova': 'Nova Requisição de Compra',
  creditos: 'Créditos & Prestação de Contas',
}

// Aplica a paleta Flow (verde) no painel quando a loja ativa é "Flow CD".
// Restaura o tema padrão (do TenantSettings) para as demais lojas.
function _lighten(hex: string, amount: number): string {
  try {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, (num >> 16) + amount)
    const g = Math.min(255, ((num >> 8) & 0xff) + amount)
    const b = Math.min(255, (num & 0xff) + amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
  } catch { return hex }
}
function LojaBrand() {
  const { loja } = useLoja()
  const { theme } = useTheme()
  useEffect(() => {
    const root = document.documentElement.style
    if (/flow/i.test(loja || '')) {
      root.setProperty('--bordo', '#3FA34D')
      root.setProperty('--bordo-l', '#58B94F')
      root.setProperty('--bordo-d', '#2E7D34')
      root.setProperty('--sidebar', '#123D18')
      root.setProperty('--sidebar-a', _lighten('#123D18', 10))
      root.setProperty('--sidebar-b', _lighten('#123D18', 8))
    } else {
      root.setProperty('--bordo', theme.primary_color)
      root.setProperty('--bordo-l', theme.primary_light)
      root.setProperty('--bordo-d', theme.primary_dark)
      root.setProperty('--sidebar', theme.sidebar_color)
      root.setProperty('--sidebar-a', _lighten(theme.sidebar_color, 10))
      root.setProperty('--sidebar-b', _lighten(theme.sidebar_color, 8))
    }
  }, [loja, theme])
  return null
}

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case 'dashboard': return <DashboardPage />
    case 'vendas': return <VendasPage />
    case 'compras': return <ComprasPage />
    case 'notas-fiscais': return <NotasFiscaisPage />
    case 'compras-inteligencia': return <InteligenciaComprasPage />
    case 'cmv-abc': return <CmvAbcPage />
    case 'comprador-ia': return <CompradorIaPage />
    case 'requisicoes':      return <RequisoesPage />
    case 'cotacao':          return <CotacaoPage />
    case 'pedidos':          return <PedidosPage />
    case 'relatorio-diario': return <RelatorioDiarioPage />
    case 'ciclo-compras': return <CicloComprasPage />
    case 'requisicao-inteligente': return <RequisicaoInteligentePage />
    case 'analise-semanal': return <AnaliseSemanalPage />
    case 'entregas': return <EntregasPage />
    case 'painel-gestao': return <PainelGestaoPage />
    case 'custos': return <CustosPage />
    case 'compras-consumo': return <ComprasConsumoPage />
    case 'gestao-perdas': return <GestaoPerdasPage />
    case 'central-alertas': return <CentralAlertasPage />
    case 'req-automaticas': return <RequisoesAutomaticasPage />
    case 'pipeline-suprimentos': return <FluxoSuprimentosPage />
    case 'dashboard-suprimentos': return <DashboardSuprimentosPage />
    case 'boletos': return <BoletosPage />
    case 'estoque': return <EstoquePage />
    case 'fornecedores': return <FornecedoresPage />
    case 'financeiro': return <FinanceiroPage />
    case 'creditos': return <CreditosPage />
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
    case 'caixas':               return <CaixasPage />
    case 'avaliacoes':           return <AvaliacoesPage />
    case 'raspadinha':           return <RaspadinhaPage />
    case 'liz-central':          return <LizCentralPage />
    case 'clientes':             return <ClientesPage />
    case 'campanhas':            return <CampanhasPage />
    case 'agente-controle':      return <ControleAgentePage />
    case 'relatorios-precos':    return <RelatoriosPrecosPage />
    case 'recebimento':          return <RecebimentoPage />
    case 'etiquetas':            return <EtiquetasPage />
    case 'pesquisa-aura':        return <PesquisaAuraPage />
    case 'gestao-lista':         return <GestaoListaPage />
    case 'requisicao-nova':      return <RequisicaoNovaPage />
    case 'tarefas':              return <TarefasPage />
    case 'checklists':           return <ChecklistsPage />
    case 'pauta-reuniao':        return <PautaReuniaoPage />
    case 'enxoval':              return <EnxovalPage />
    case 'planejamento':         return <PlanejamentoPage />
    case 'atas':                 return <AtasPage />
    case 'lista-padrao':         return <ListaPadraoPage />
    case 'alertas':              return <AlertasPage />
    default: return <DashboardPage />
  }
}

// Lê a página inicial da URL (?page=<id> ou #<id>) para permitir LINK DIRETO a um módulo.
// Ex.: painel.amorefood.com.br/?page=ciclo-compras abre direto no Ciclo de Compras.
function pageFromUrl(): PageId {
  try {
    const p = (new URLSearchParams(window.location.search).get('page') || window.location.hash.replace(/^#\/?/, '')).trim()
    return p && Object.prototype.hasOwnProperty.call(PAGE_TITLES, p) ? (p as PageId) : 'dashboard'
  } catch { return 'dashboard' }
}
function setUrlPage(p: PageId) {
  try { const u = new URL(window.location.href); u.searchParams.set('page', p); u.hash = ''; window.history.replaceState({}, '', u.toString()) } catch { /* ignore */ }
}

// Algumas páginas usam a permissão de OUTRO módulo (ex.: telas de compras usam 'requisicoes').
// Usado pela TRAVA DE ACESSO: sem a permissão, a rota não abre — nem por ?page= direto.
const PAGE_PERM: Partial<Record<PageId, string>> = {
  'requisicao-nova': 'requisicoes', 'gestao-lista': 'requisicoes', 'cotacao': 'requisicoes',
  'pedidos': 'requisicoes', 'ciclo-compras': 'requisicoes', 'relatorio-diario': 'requisicoes',
  'requisicao-inteligente': 'requisicoes', 'analise-semanal': 'requisicoes',
  'pipeline-suprimentos': 'requisicoes', 'dashboard-suprimentos': 'requisicoes',
  'boletos': 'financeiro', 'pesquisa-aura': 'campanhas', 'produtos-categorias': 'produtos',
}
function permForPage(p: PageId): string { return PAGE_PERM[p] ?? p }
// Ordem de fallback: primeira página que o usuário PODE ver (colaborador cai em Central de Tarefas).
const PAGE_FALLBACK_ORDER: PageId[] = [
  'dashboard', 'tarefas', 'checklists', 'recebimento', 'etiquetas',
  'relatorios-precos', 'avaliacoes', 'entregas', 'requisicoes', 'creditos',
]

export default function App() {
  const { user, passwordRecovery, can, isOwner } = useAuth()
  const { theme } = useTheme()
  const [page, setPage] = useState<PageId>(pageFromUrl)
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
      if (id) { setPage(id); setUrlPage(id); setSidebarOpen(false) }
    }
    document.addEventListener('amore-nav', handler)
    return () => document.removeEventListener('amore-nav', handler)
  }, [])

  // Mantém a URL em sincronia com a página atual (link direto/compartilhável e refresh preserva a tela)
  useEffect(() => { if (user) setUrlPage(page) }, [user, page])

  const navigate = (p: PageId) => {
    setPage(p)
    setUrlPage(p)
    setSidebarOpen(false)
  }

  // ── TRAVA DE ACESSO ── Se o usuário abrir (ou tentar por ?page=) uma tela sem
  // permissão, ele é redirecionado para a primeira página que pode acessar.
  const pageAllowed = user ? can(permForPage(page), 'view') : true
  useEffect(() => {
    if (user && !pageAllowed) {
      const first = PAGE_FALLBACK_ORDER.find(p => can(permForPage(p), 'view'))
      if (first && first !== page) navigate(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pageAllowed, page])

  if (passwordRecovery) return <ResetPasswordPage />
  if (!user) return <LoginPage />

  return (
    <LojaProvider stores={theme.stores || []}>
      <LojaBrand />
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
            {pageAllowed ? (
              <PageContent page={page} />
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted, #888)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
                <h2 style={{ margin: '0 0 6px' }}>Sem acesso a este módulo</h2>
                <p style={{ margin: 0 }}>Redirecionando para uma tela disponível…</p>
              </div>
            )}
          </main>
        </div>

        {/* ── Botão flutuante Liz (só para donos; colaborador não usa) ── */}
        {isOwner && page !== 'agente-liz' && (
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
