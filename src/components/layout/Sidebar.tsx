import { useState, useEffect } from 'react'
import { LayoutDashboard, FileText, Trophy, Megaphone, TrendingUp, ShoppingCart, DollarSign, ChefHat, Coffee, Users, Settings, LogOut, Home, Package, ChevronDown, ChevronRight, Building2, ClipboardList, ClipboardCheck, ListChecks, UtensilsCrossed, Tag, BarChart2, AlertTriangle, Monitor, Zap, Activity, Bot, Calendar, Bell, CheckCircle2, ArrowLeftRight, Wallet, Truck, Brain, Target, Inbox, QrCode, Star, Ticket, Heart, Globe, Sparkles, Layers, Scale, Siren, CreditCard, Receipt, RefreshCw, CalendarDays, BookOpen, FileSpreadsheet, Gauge, LineChart } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { canApproveReq } from '../../lib/permissions'
import { useTheme } from '../../contexts/ThemeContext'
import { useLoja } from '../../contexts/LojaContext'

// Remove emoji do rótulo (ícones agora são lucide, traço arredondado)
const stripEmoji = (t: string) => t.replace(/^[^\p{L}\p{N}]+/u, '').trim()

// Família única de ícones (traço arredondado) por módulo
const ICON_BY_ID: Record<string, React.ComponentType<{ size?: number }>> = {
  'agente-liz': Bot, 'liz-central': Target, 'agente-cmv': Wallet,
  recebimento: Inbox, etiquetas: QrCode, 'relatorios-precos': BarChart2, caixas: Wallet,
  avaliacoes: Star, raspadinha: Ticket, clientes: Heart, 'site-leads': Globe, campanhas: Megaphone,
  'pesquisa-aura': Sparkles, 'agente-controle': Bot, 'amore-ia': Bot,
  'painel-gestao': Gauge, custos: Wallet, 'compras-consumo': Scale, 'gestao-perdas': AlertTriangle, 'central-alertas': Siren,
  'pipeline-suprimentos': Layers, 'dashboard-suprimentos': BarChart2, 'lista-padrao': ListChecks,
  compras: ShoppingCart, 'notas-fiscais': Receipt, 'compras-inteligencia': LineChart, 'cmv-abc': Trophy,
  'comprador-ia': Bot, requisicoes: ClipboardList, 'requisicoes-status': Activity, cotacao: DollarSign,
  pedidos: Receipt, 'ciclo-compras': RefreshCw, 'relatorio-diario': CalendarDays,
  'requisicao-inteligente': Brain, 'analise-semanal': LineChart, 'inteligencia-compras': Brain,
  entregas: Truck, 'req-automaticas': Zap, estoque: Package, transferencias: ArrowLeftRight,
  fornecedores: Truck, 'compras-agente': Bot, creditos: CreditCard, boletos: FileSpreadsheet,
  financeiro: Wallet, pdv: Monitor, usuarios: Users, configuracoes: Settings,
}
function navIcon(m: { id: string; icon: React.ReactNode }, size = 16): React.ReactNode {
  const C = ICON_BY_ID[m.id]
  return C ? <C size={size} /> : m.icon
}

export interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  badge?: string
  adminOnly?: boolean
  superAdminOnly?: boolean
  perm?: string   // chave de permissão alternativa (quando difere do id de rota)
}

// Itens simples do menu
const MENU_TOP: NavItem[] = [
  { id: 'dashboard',   label: 'Início',         icon: <LayoutDashboard size={16} /> },
  { id: 'agente-liz',  label: 'Liz — Agente IA',   icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🤖</span> },
  { id: 'liz-central', label: '🎯 Liz — Central Operacional', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🎯</span> },
  { id: 'agente-cmv',  label: 'Precificação & CMV', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>💰</span> },
  { id: 'tarefas',     label: 'Central de Tarefas', icon: <ClipboardList size={16} /> },
  { id: 'checklists',  label: 'Operação Padrão',    icon: <ClipboardCheck size={16} /> },
  { id: 'enxoval',        label: 'Controle Enxoval',   icon: <Package size={16} /> },
  { id: 'planejamento',  label: 'Planejamento',       icon: <Calendar size={16} /> },
  { id: 'atas',          label: 'Atas de Reunião',    icon: <FileText size={16} /> },
  { id: 'pauta-reuniao', label: 'Pauta de Reunião',   icon: <ListChecks size={16} /> },
  { id: 'alertas',     label: '🔔 Alertas & Rastreab.', icon: <Bell size={16} /> },
  { id: 'notificacoes', label: 'Central de Notificações', icon: <Bell size={16} /> },
  { id: 'caixas',      label: '🗄️ Caixas & Despesas',   icon: <FileText size={16} /> },
  { id: 'recebimento',  label: '📥 Recebimento Inteligente', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>📥</span> },
  { id: 'etiquetas',    label: '📱 Etiquetas & Leitura', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>📱</span> },
  { id: 'relatorios-precos', label: '📊 Relatório de Compras', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>📊</span> },
  { id: 'pendencias',  label: 'Pendências & OS',    icon: <FileText size={16} />, badge: '7' },
  { id: 'gamificacao', label: 'Gamificação',         icon: <Trophy size={16} /> },
  { id: 'avaliacoes',  label: '⭐ Avaliações & NPS',  icon: <span style={{ fontSize: 14, lineHeight: 1 }}>⭐</span> },
  { id: 'raspadinha',  label: '🎟️ Raspadinha Digital', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🎟️</span> },
  { id: 'clientes',    label: '💚 Clientes Amore (CRM)', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>💚</span> },
  { id: 'site-leads',  label: '🌐 Site — Leads & Reclame Aqui', perm: 'clientes', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🌐</span> },
  { id: 'campanhas',   label: '📣 Campanhas', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>📣</span> },
  { id: 'pesquisa-aura', label: '✨ Pesquisa Vamos Farmar Aura', perm: 'campanhas', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>✨</span> },
  { id: 'agente-controle', label: '🤖 Controle do Agente', icon: <span style={{ fontSize: 14, lineHeight: 1 }}>🤖</span> },
  { id: 'amore-ia', label: '💬 Central de Comando — Amore IA', icon: <Bot size={16} /> },
  { id: 'marketing',   label: 'Marketing 360°',     icon: <Megaphone size={16} /> },
  { id: 'mkt-contatos', label: 'Contatos & Consent.', icon: <Megaphone size={16} /> },
  { id: 'vendas',      label: 'Vendas',              icon: <TrendingUp size={16} /> },
]

// Sub-itens do grupo Gestão (Painel de Gestão + telas de análise)
const GESTAO_SUBMENU: NavItem[] = [
  { id: 'painel-gestao',   label: '📊 Painel de Gestão',   icon: <span style={{ fontSize: 13, lineHeight: 1 }}>📊</span> },
  { id: 'custos',          label: '💰 Custo por Produto',  icon: <span style={{ fontSize: 13, lineHeight: 1 }}>💰</span> },
  { id: 'compras-consumo', label: '⚖️ Compras × Consumo',  icon: <span style={{ fontSize: 13, lineHeight: 1 }}>⚖️</span> },
  { id: 'gestao-perdas',   label: '⚠️ Gestão de Perdas',   icon: <span style={{ fontSize: 13, lineHeight: 1 }}>⚠️</span> },
  { id: 'central-alertas', label: '🚨 Central de Alertas', icon: <span style={{ fontSize: 13, lineHeight: 1 }}>🚨</span> },
]

// Sub-itens do grupo Produtos
const PRODUTOS_SUBMENU: NavItem[] = [
  { id: 'produtos',            label: 'Lista de Produtos', icon: <Package size={16} /> },
  { id: 'produtos-categorias', label: 'Categorias',        icon: <Tag size={16} /> },
]

// Sub-itens do grupo Compras & Estoque
const COMPRAS_SUBMENU: NavItem[] = [
  { id: 'pipeline-suprimentos',   label: '🔀 Pipeline de Suprimentos', icon: <Activity size={16} />, perm: 'requisicoes' },
  { id: 'dashboard-suprimentos',  label: '📊 Dashboard Suprimentos', icon: <BarChart2 size={16} />, perm: 'requisicoes' },
  { id: 'lista-padrao',           label: '📋 Lista Padronizada', icon: <ShoppingCart size={16} /> },
  { id: 'compras',                label: 'Compras (histórico)', icon: <ShoppingCart size={16} /> },
  { id: 'notas-fiscais',          label: 'Notas Fiscais (ASI)', icon: <FileText size={16} /> },
  { id: 'compras-inteligencia',   label: 'Histórico de Preços (NF)', icon: <TrendingUp size={16} /> },
  { id: 'cmv-abc',                label: 'CMV & Curva ABC',     icon: <Trophy size={16} /> },
  { id: 'comprador-ia',           label: '🤖 Comprador IA',     icon: <span style={{ fontSize: 13, lineHeight: 1 }}>🤖</span> },
  { id: 'requisicoes',            label: 'Requisições',         icon: <ClipboardList size={16} /> },
  { id: 'requisicoes-status',     label: '📊 Status das Requisições', icon: <Activity size={16} />, perm: 'requisicoes' },
  { id: 'cotacao',                label: '💰 Cotação Inteligente', icon: <DollarSign size={16} />, perm: 'requisicoes' },
  { id: 'pedidos',                label: '🧾 Pedidos de Compra', icon: <ClipboardList size={16} />, perm: 'requisicoes' },
  { id: 'ciclo-compras',          label: '🔄 Ciclo de Compras', icon: <span style={{ fontSize: 13, lineHeight: 1 }}>🔄</span>, perm: 'requisicoes' },
  { id: 'relatorio-diario',       label: '📅 Relatório Diário', icon: <ClipboardList size={16} />, perm: 'requisicoes' },
  { id: 'requisicao-inteligente', label: '🧠 Requisição Inteligente', icon: <ClipboardList size={16} />, perm: 'requisicoes' },
  { id: 'analise-semanal', label: '📈 Análise Semanal de Compra', icon: <ClipboardList size={16} />, perm: 'requisicoes' },
  { id: 'inteligencia-compras', label: '🧠 Inteligência de Compras', icon: <TrendingUp size={16} />, perm: 'requisicoes' },
  { id: 'entregas', label: '🚚 Agendamento de Entregas', icon: <ClipboardList size={16} />, perm: 'requisicoes' },
  { id: 'req-automaticas',        label: 'Req. Automáticas',    icon: <Zap size={16} /> },
  { id: 'estoque',                label: 'Estoque',             icon: <Package size={16} /> },
  { id: 'transferencias',         label: '🔄 Transferências',   icon: <ArrowLeftRight size={16} />, perm: 'estoque' },
  { id: 'fornecedores',           label: 'Fornecedores',        icon: <Building2 size={16} /> },
  { id: 'compras-agente',         label: '🤖 Agente de Compras', icon: <Bot size={16} /> },
]

// Sub-itens do grupo Relatórios
const RELATORIOS_SUBMENU: NavItem[] = [
  { id: 'relatorio-cvl', label: 'Compra vs Lista',      icon: <BarChart2 size={16} /> },
  { id: 'ruptura',       label: 'Ruptura de Pedidos',   icon: <AlertTriangle size={16} /> },
  { id: 'market',        label: 'Market Analytics',     icon: <Activity size={16} /> },
]

const MENU_BOTTOM: NavItem[] = [
  { id: 'pdv',        label: 'PDV — Caixa',   icon: <Monitor size={16} /> },
  { id: 'financeiro', label: 'Financeiro',    icon: <DollarSign size={16} /> },
  { id: 'creditos',   label: '💳 Créditos & Prestação', icon: <DollarSign size={16} />, perm: 'financeiro' },
  { id: 'boletos',    label: '🧾 Central de Boletos', icon: <DollarSign size={16} />, perm: 'financeiro' },
  { id: 'cozinha',    label: 'Cozinha',       icon: <ChefHat size={16} /> },
  { id: 'salao',      label: 'Salão',         icon: <Coffee size={16} /> },
]

// Menu ENXUTO do Colaborador — os 9 módulos operacionais liberados para os
// demais logins (todos, menos Esdras e Esdras Santana). Ícones em destaque
// para ficar intuitivo. Os ids batem com as rotas em App.tsx.
const COLAB_MENU: NavItem[] = [
  { id: 'requisicao-nova',   label: 'Requisição de Compra',      icon: <ClipboardList size={16} />, perm: 'requisicoes' },
  { id: 'tarefas',           label: 'Central de Tarefas',        icon: <ClipboardList size={16} /> },
  { id: 'requisicoes-status',label: 'Status das Requisições',    icon: <Activity size={16} />, perm: 'requisicoes' },
  { id: 'creditos',          label: '💳 Créditos & Prestação de Contas', icon: <DollarSign size={16} /> },
]

const ADMIN_MENU: NavItem[] = [
  { id: 'usuarios',       label: 'Usuários & Permissões', icon: <Users size={16} />, adminOnly: true },
  { id: 'configuracoes',  label: 'White Label',            icon: <Settings size={16} />, superAdminOnly: true },
]

interface SidebarProps {
  activePage: string
  onNav: (id: string, label: string) => void
  mobileOpen: boolean
  onOverlayClick: () => void
}

export default function Sidebar({ activePage, onNav, mobileOpen, onOverlayClick }: SidebarProps) {
  const { user, logout, can, isOwner, fullMenu } = useAuth()
  const { theme } = useTheme()
  const { loja } = useLoja()
  const isFlow = /flow/i.test(loja || '')
  // Dono sempre conta como admin/super_admin (garante o menu Administração: Usuários, White Label)
  const isAdmin = isOwner || user?.role === 'admin' || user?.role === 'super_admin'
  const isSuperAdmin = isOwner || user?.role === 'super_admin'

  const isGestaoGroup = (p: string) => ['painel-gestao', 'custos', 'compras-consumo', 'gestao-perdas', 'central-alertas'].includes(p)
  // Abre o dropdown automaticamente se a página ativa for do grupo Produtos
  const isProdutosGroup = (p: string) => p === 'produtos' || p === 'produtos-categorias'

  // Abre o dropdown automaticamente se a página ativa for do grupo Compras
  const isComprasGroup = (p: string) => p === 'pipeline-suprimentos' || p === 'dashboard-suprimentos' || p === 'lista-padrao' || p === 'compras' || p === 'requisicoes' || p === 'requisicoes-status' || p === 'cotacao' || p === 'pedidos' || p === 'ciclo-compras' || p === 'relatorio-diario' || p === 'requisicao-inteligente' || p === 'analise-semanal' || p === 'inteligencia-compras' || p === 'entregas' || p === 'req-automaticas' || p === 'estoque' || p === 'transferencias' || p === 'fornecedores' || p === 'compras-agente'
  const isRelatoriosGroup = (p: string) => p === 'relatorio-cvl' || p === 'ruptura' || p === 'market'

  const [gestaoOpen, setGestaoOpen] = useState(isGestaoGroup(activePage))
  const [produtosOpen, setProdutosOpen] = useState(isProdutosGroup(activePage))
  const [comprasOpen, setComprasOpen] = useState(isComprasGroup(activePage))
  const [relatoriosOpen, setRelatoriosOpen] = useState(isRelatoriosGroup(activePage))

  useEffect(() => {
    if (isGestaoGroup(activePage))      setGestaoOpen(true)
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
            {isFlow
              ? <svg viewBox="0 0 33 22" width="24" height="15" aria-label="Flow"><path d="M3 4 C7 4 6 18 10 18 C14 18 13 4 17 4 C21 4 20 18 24 18 C28 18 29 6 31 6" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              : theme.logo_url
                ? <img src={theme.logo_url} alt="logo" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                : <Home size={18} color="#fff" />
            }
          </div>
          <div className="sb-company">{isFlow ? 'Flow CD' : theme.company_name}</div>
          <div className="sb-sub">{isFlow ? 'Clube Flow · Costa Dourada' : 'Sistema Integrado v5.2'}</div>
        </div>

        <nav className="sb-nav">
          {!fullMenu ? (
          <>
            {/* ── Menu do Colaborador: Requisição, Tarefas, Status, Créditos ── */}
            <div className="sb-sec">Minha Operação</div>
            {COLAB_MENU.filter(m => can(m.perm ?? m.id, 'view')).map(m => (
              <div
                key={m.id}
                className={`nav-item${activePage === m.id ? ' active' : ''}`}
                onClick={() => onNav(m.id, m.label)}
              >
                {navIcon(m)}
                {stripEmoji(m.label)}
                {m.badge && <span className="nav-badge">{m.badge}</span>}
              </div>
            ))}
            {/* Aprovação da Requisição — SÓ para aprovadores (Wagner/Aline) */}
            {canApproveReq(user) && (
              <div
                className={`nav-item${activePage === 'requisicoes' ? ' active' : ''}`}
                onClick={() => onNav('requisicoes', 'Aprovação de Requisição')}
              >
                <CheckCircle2 size={16} /> Aprovação de Requisição
              </div>
            )}
            {/* Ajuda — abre o manual dos 9 módulos (não é um módulo, é consulta) */}
            <div className="sb-sec" style={{ marginTop: 8 }}>Ajuda</div>
            <a
              href="/manual-modulos.html"
              target="_blank"
              rel="noreferrer"
              className="nav-item"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <BookOpen size={16} />
              Manual / Ajuda
            </a>
          </>
          ) : (
          <>
          <div className="sb-sec">Módulos</div>

          {/* Itens superiores */}
          {MENU_TOP.filter(m => can(m.perm ?? m.id, 'view')).map(m => (
            <div
              key={m.id}
              className={`nav-item${activePage === m.id ? ' active' : ''}`}
              onClick={() => onNav(m.id, m.label)}
            >
              {navIcon(m)}
              {stripEmoji(m.label)}
              {m.badge && <span className="nav-badge">{m.badge}</span>}
            </div>
          ))}

          {/* ── Grupo Gestão (dropdown) ── */}
          <div>
            <div
              className={`nav-item${isGestaoGroup(activePage) ? ' active' : ''}`}
              onClick={() => setGestaoOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <Gauge size={16} />
              Gestão
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                {gestaoOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </div>
            {gestaoOpen && (
              <div style={{ overflow: 'hidden' }}>
                {GESTAO_SUBMENU.map(m => (
                  <div
                    key={m.id}
                    className={`nav-item${activePage === m.id ? ' active' : ''}`}
                    onClick={() => onNav(m.id, m.label)}
                    style={{ paddingLeft: 28, fontSize: 12, borderLeft: '2px solid var(--bordo-l)', marginLeft: 16, borderRadius: '0 6px 6px 0' }}
                  >
                    {navIcon(m)}
                    {stripEmoji(m.label)}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Grupo Produtos (dropdown) ── */}
          {can('produtos', 'view') && (
            <div>
              <div
                className={`nav-item${isProdutosGroup(activePage) ? ' active' : ''}`}
                onClick={() => setProdutosOpen(o => !o)}
                style={{ cursor: 'pointer', userSelect: 'none' }}
              >
                <UtensilsCrossed size={16} />
                Produtos
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {produtosOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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
                      {navIcon(m)}
                      {stripEmoji(m.label)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Gestão de Compras — item fixo e visível (abre a visão geral dos pedidos) */}
          {(can('compras', 'view') || can('estoque', 'view') || can('requisicoes', 'view')) && (
            <a href="/gestao-compras.html" target="_blank" rel="noreferrer" className="nav-item" style={{ textDecoration: 'none', color: 'inherit' }}>
              <ClipboardCheck size={16} /> Gestão de Compras
            </a>
          )}

          {/* Aprovação de Requisição — item fixo e visível (Wagner/Esdras) */}
          {can('requisicoes', 'view') && (
            <div
              className={`nav-item${activePage === 'requisicoes' ? ' active' : ''}`}
              onClick={() => onNav('requisicoes', 'Aprovação de Requisição')}
              style={{ cursor: 'pointer' }}
            >
              <CheckCircle2 size={16} /> Aprovação de Requisição
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
                <ShoppingCart size={16} />
                Compras & Estoque
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {comprasOpen
                    ? <ChevronDown size={16} />
                    : <ChevronRight size={16} />
                  }
                </span>
              </div>

              {/* Sub-itens */}
              {comprasOpen && (
                <div style={{ overflow: 'hidden' }}>
                  {COMPRAS_SUBMENU.filter(m => can(m.perm ?? m.id, 'view')).map(m => (
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
                      {navIcon(m)}
                      {stripEmoji(m.label)}
                    </div>
                  ))}
                  <div
                    className={`nav-item${activePage === 'requisicao-nova' ? ' active' : ''}`}
                    onClick={() => onNav('requisicao-nova', 'Nova Requisição de Compra')}
                    style={{ paddingLeft: 28, fontSize: 12, borderLeft: '2px solid var(--bordo-l)', marginLeft: 16, borderRadius: '0 6px 6px 0' }}
                  >
                    <ClipboardList size={16} /> Nova Requisição
                  </div>
                  <div
                    className={`nav-item${activePage === 'gestao-lista' ? ' active' : ''}`}
                    onClick={() => onNav('gestao-lista', 'Gestão da Lista de Compras')}
                    style={{ paddingLeft: 28, fontSize: 12, borderLeft: '2px solid var(--bordo-l)', marginLeft: 16, borderRadius: '0 6px 6px 0' }}
                  >
                    <ShoppingCart size={16} /> Gestão da Lista de Compras
                  </div>
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
                <BarChart2 size={16} />
                Relatórios
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                  {relatoriosOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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
                      {navIcon(m)}
                      {stripEmoji(m.label)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Itens inferiores */}
          {MENU_BOTTOM.filter(m => can(m.perm ?? m.id, 'view')).map(m => (
            <div
              key={m.id}
              className={`nav-item${activePage === m.id ? ' active' : ''}`}
              onClick={() => onNav(m.id, m.label)}
            >
              {navIcon(m)}
              {stripEmoji(m.label)}
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
                  {navIcon(m)}
                  {stripEmoji(m.label)}
                </div>
              ))}
            </>
          )}
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
            <button className="lo-btn" onClick={logout} title="Sair"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  )
}
