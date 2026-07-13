import type { PermissionsMap, ModulePermission } from '../types/database'

// Tabela de permissões por papel — mantida aqui (fora de AuthContext)
// para que o Vite React Fast Refresh não invalide o módulo de context.
export const ROLE_PERMISSIONS: Record<string, PermissionsMap> = {
  super_admin: {
    dashboard:            { view: true, create: true, edit: true, delete: true, export: true },
    pendencias:           { view: true, create: true, edit: true, delete: true, export: true },
    gamificacao:          { view: true, create: true, edit: true, delete: true, export: true },
    marketing:            { view: true, create: true, edit: true, delete: true, export: true },
    vendas:               { view: true, create: true, edit: true, delete: true, export: true },
    produtos:             { view: true, create: true, edit: true, delete: true, export: true },
    'produtos-categorias':{ view: true, create: true, edit: true, delete: true, export: true },
    pdv:                  { view: true, create: true, edit: true, delete: true, export: true },
    compras:              { view: true, create: true, edit: true, delete: true, export: true },
    requisicoes:          { view: true, create: true, edit: true, delete: true, export: true },
    'req-automaticas':    { view: true, create: true, edit: true, delete: true, export: true },
    estoque:              { view: true, create: true, edit: true, delete: true, export: true },
    fornecedores:         { view: true, create: true, edit: true, delete: true, export: true },
    financeiro:           { view: true, create: true, edit: true, delete: true, export: true },
    cozinha:              { view: true, create: true, edit: true, delete: true, export: true },
    salao:                { view: true, create: true, edit: true, delete: true, export: true },
    usuarios:             { view: true, create: true, edit: true, delete: true, export: true },
    configuracoes:        { view: true, create: true, edit: true, delete: true, export: true },
    'relatorio-cvl':      { view: true, create: true, edit: true, delete: true, export: true },
    ruptura:              { view: true, create: true, edit: true, delete: true, export: true },
    market:               { view: true, create: true, edit: true, delete: true, export: true },
    'compras-agente':     { view: true, create: true, edit: true, delete: true, export: true },
    'agente-liz':         { view: true, create: true, edit: true, delete: true, export: true },
    tarefas:              { view: true, create: true, edit: true, delete: true, export: true },
    enxoval:              { view: true, create: true, edit: true, delete: true, export: true },
    planejamento:         { view: true, create: true, edit: true, delete: true, export: true },
    atas:                 { view: true, create: true, edit: true, delete: true, export: true },
    'lista-padrao':       { view: true, create: true, edit: true, delete: true, export: true },
    alertas:              { view: true, create: true, edit: true, delete: true, export: true },
  },
  admin: {
    dashboard:            { view: true, create: true, edit: true, delete: true, export: true },
    pendencias:           { view: true, create: true, edit: true, delete: true, export: true },
    gamificacao:          { view: true, create: true, edit: true, delete: true, export: true },
    marketing:            { view: true, create: true, edit: true, delete: true, export: true },
    vendas:               { view: true, create: true, edit: true, delete: true, export: true },
    produtos:             { view: true, create: true, edit: true, delete: true, export: true },
    'produtos-categorias':{ view: true, create: true, edit: true, delete: true, export: true },
    pdv:                  { view: true, create: true, edit: true, delete: true, export: true },
    compras:              { view: true, create: true, edit: true, delete: true, export: true },
    requisicoes:          { view: true, create: true, edit: true, delete: true, export: true },
    'req-automaticas':    { view: true, create: true, edit: true, delete: true, export: true },
    estoque:              { view: true, create: true, edit: true, delete: true, export: true },
    fornecedores:         { view: true, create: true, edit: true, delete: true, export: true },
    financeiro:           { view: true, create: true, edit: true, delete: true, export: true },
    cozinha:              { view: true, create: true, edit: true, delete: true, export: true },
    salao:                { view: true, create: true, edit: true, delete: true, export: true },
    usuarios:             { view: true, create: true, edit: true, delete: false, export: true },
    configuracoes:        { view: false, create: false, edit: false, delete: false, export: false },
    'relatorio-cvl':      { view: true, create: true, edit: true, delete: true, export: true },
    ruptura:              { view: true, create: true, edit: true, delete: true, export: true },
    market:               { view: true, create: true, edit: true, delete: true, export: true },
    'compras-agente':     { view: true, create: true, edit: true, delete: true, export: true },
    'agente-liz':         { view: true, create: true, edit: true, delete: true, export: true },
    tarefas:              { view: true, create: true, edit: true, delete: true, export: true },
    enxoval:              { view: true, create: true, edit: true, delete: true, export: true },
    planejamento:         { view: true, create: true, edit: true, delete: true, export: true },
    atas:                 { view: true, create: true, edit: true, delete: true, export: true },
    'lista-padrao':       { view: true, create: true, edit: true, delete: true, export: true },
    alertas:              { view: true, create: true, edit: true, delete: true, export: true },
  },
  manager: {
    dashboard:            { view: true, create: false, edit: false, delete: false, export: true },
    pendencias:           { view: true, create: true,  edit: true,  delete: false, export: false },
    gamificacao:          { view: true, create: true,  edit: true,  delete: false, export: false },
    marketing:            { view: true, create: true,  edit: true,  delete: false, export: false },
    vendas:               { view: true, create: true,  edit: true,  delete: false, export: true },
    produtos:             { view: true, create: true,  edit: true,  delete: false, export: true },
    'produtos-categorias':{ view: true, create: true,  edit: true,  delete: false, export: false },
    pdv:                  { view: true, create: true,  edit: true,  delete: false, export: true },
    compras:              { view: true, create: true,  edit: true,  delete: false, export: false },
    requisicoes:          { view: true, create: true,  edit: true,  delete: false, export: false },
    'req-automaticas':    { view: true, create: true,  edit: true,  delete: false, export: false },
    estoque:              { view: true, create: true,  edit: true,  delete: false, export: true },
    fornecedores:         { view: true, create: true,  edit: true,  delete: false, export: false },
    financeiro:           { view: true, create: false, edit: false, delete: false, export: true },
    cozinha:              { view: true, create: true,  edit: true,  delete: false, export: false },
    salao:                { view: true, create: true,  edit: true,  delete: false, export: false },
    usuarios:             { view: false, create: false, edit: false, delete: false, export: false },
    configuracoes:        { view: false, create: false, edit: false, delete: false, export: false },
    'relatorio-cvl':      { view: true, create: true,  edit: false, delete: false, export: true },
    ruptura:              { view: true, create: true,  edit: true,  delete: false, export: true },
    market:               { view: true, create: true,  edit: true,  delete: false, export: true },
    'compras-agente':     { view: true, create: true,  edit: true,  delete: false, export: true },
    'agente-liz':         { view: true, create: true,  edit: true,  delete: false, export: true },
    tarefas:              { view: true, create: true,  edit: true,  delete: false, export: true },
    enxoval:              { view: true, create: true,  edit: true,  delete: false, export: true },
    planejamento:         { view: true, create: true,  edit: true,  delete: false, export: true },
    atas:                 { view: true, create: true,  edit: true,  delete: false, export: true },
    'lista-padrao':       { view: true, create: true,  edit: true,  delete: false, export: true },
    alertas:              { view: true, create: false, edit: true,  delete: false, export: true },
  },
  user: {
    dashboard:            { view: true,  create: false, edit: false, delete: false, export: false },
    pendencias:           { view: true,  create: false, edit: false, delete: false, export: false },
    gamificacao:          { view: true,  create: false, edit: false, delete: false, export: false },
    marketing:            { view: true,  create: false, edit: false, delete: false, export: false },
    vendas:               { view: true,  create: true,  edit: false, delete: false, export: false },
    produtos:             { view: true,  create: false, edit: false, delete: false, export: false },
    'produtos-categorias':{ view: true,  create: false, edit: false, delete: false, export: false },
    pdv:                  { view: true,  create: true,  edit: false, delete: false, export: false },
    compras:              { view: true,  create: false, edit: false, delete: false, export: false },
    requisicoes:          { view: true,  create: true,  edit: false, delete: false, export: false },
    'req-automaticas':    { view: true,  create: false, edit: false, delete: false, export: false },
    estoque:              { view: true,  create: true,  edit: false, delete: false, export: false },
    fornecedores:         { view: true,  create: false, edit: false, delete: false, export: false },
    financeiro:           { view: true,  create: false, edit: false, delete: false, export: false },
    cozinha:              { view: true,  create: true,  edit: false, delete: false, export: false },
    salao:                { view: true,  create: true,  edit: false, delete: false, export: false },
    usuarios:             { view: false, create: false, edit: false, delete: false, export: false },
    configuracoes:        { view: false, create: false, edit: false, delete: false, export: false },
    'relatorio-cvl':      { view: false, create: false, edit: false, delete: false, export: false },
    ruptura:              { view: true,  create: true,  edit: false, delete: false, export: false },
    market:               { view: true,  create: false, edit: false, delete: false, export: false },
    'compras-agente':     { view: true,  create: false, edit: false, delete: false, export: false },
    'agente-liz':         { view: true,  create: false, edit: false, delete: false, export: false },
    tarefas:              { view: true,  create: true,  edit: true,  delete: false, export: false },
    enxoval:              { view: true,  create: true,  edit: false, delete: false, export: false },
    planejamento:         { view: true,  create: true,  edit: false, delete: false, export: false },
    atas:                 { view: true,  create: true,  edit: true,  delete: false, export: false },
    'lista-padrao':       { view: true,  create: true,  edit: true,  delete: false, export: false },
    alertas:              { view: true,  create: false, edit: false, delete: false, export: false },
  },
  viewer: {
    dashboard:            { view: true,  create: false, edit: false, delete: false, export: false },
    pendencias:           { view: true,  create: false, edit: false, delete: false, export: false },
    gamificacao:          { view: true,  create: false, edit: false, delete: false, export: false },
    marketing:            { view: true,  create: false, edit: false, delete: false, export: false },
    vendas:               { view: true,  create: false, edit: false, delete: false, export: false },
    produtos:             { view: true,  create: false, edit: false, delete: false, export: false },
    'produtos-categorias':{ view: true,  create: false, edit: false, delete: false, export: false },
    pdv:                  { view: true,  create: false, edit: false, delete: false, export: false },
    compras:              { view: true,  create: false, edit: false, delete: false, export: false },
    requisicoes:          { view: true,  create: false, edit: false, delete: false, export: false },
    'req-automaticas':    { view: false, create: false, edit: false, delete: false, export: false },
    estoque:              { view: true,  create: false, edit: false, delete: false, export: false },
    fornecedores:         { view: true,  create: false, edit: false, delete: false, export: false },
    financeiro:           { view: true,  create: false, edit: false, delete: false, export: false },
    cozinha:              { view: true,  create: false, edit: false, delete: false, export: false },
    salao:                { view: true,  create: false, edit: false, delete: false, export: false },
    usuarios:             { view: false, create: false, edit: false, delete: false, export: false },
    configuracoes:        { view: false, create: false, edit: false, delete: false, export: false },
    'relatorio-cvl':      { view: true,  create: false, edit: false, delete: false, export: false },
    ruptura:              { view: true,  create: false, edit: false, delete: false, export: false },
    market:               { view: true,  create: false, edit: false, delete: false, export: false },
    'compras-agente':     { view: true,  create: false, edit: false, delete: false, export: false },
    'agente-liz':         { view: true,  create: false, edit: false, delete: false, export: false },
    tarefas:              { view: true,  create: false, edit: false, delete: false, export: false },
    enxoval:              { view: true,  create: false, edit: false, delete: false, export: false },
    planejamento:         { view: true,  create: false, edit: false, delete: false, export: false },
    atas:                 { view: true,  create: false, edit: false, delete: false, export: false },
    'lista-padrao':       { view: true,  create: false, edit: false, delete: false, export: false },
    alertas:              { view: true,  create: false, edit: false, delete: false, export: false },
  },
}

// ─────────────────────────────────────────────────────────────
// GERENCIADOR DE PERMISSÕES — Modelos Prontos (templates)
// O admin aplica um modelo ao criar/editar um usuário. O modelo
// preenche o permissions_override (granular, por módulo e ação).
// ─────────────────────────────────────────────────────────────

// Novo módulo "Agente de Precificação & CMV" — espelha o acesso do agente-liz em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['agente-cmv'] = ROLE_PERMISSIONS[r]['agente-liz'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Central de Notificações" (Fase 6) — espelha o acesso a tarefas em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['notificacoes'] = ROLE_PERMISSIONS[r]['tarefas'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Caixas & Despesas" — espelha o acesso ao financeiro em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['caixas'] = ROLE_PERMISSIONS[r]['financeiro'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Avaliações & NPS" — espelha o acesso ao marketing em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['avaliacoes'] = ROLE_PERMISSIONS[r]['marketing'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Raspadinha Digital" — espelha o acesso ao marketing em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['raspadinha'] = ROLE_PERMISSIONS[r]['marketing'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Liz — Central Operacional" — espelha o acesso a tarefas em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['liz-central'] = ROLE_PERMISSIONS[r]['tarefas'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Clientes Amore (CRM)" — espelha o acesso ao marketing em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['clientes'] = ROLE_PERMISSIONS[r]['marketing'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Campanhas" — espelha o acesso ao marketing em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['campanhas'] = ROLE_PERMISSIONS[r]['marketing'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Controle do Agente" — espelha o acesso ao marketing em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['agente-controle'] = ROLE_PERMISSIONS[r]['marketing'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Operação Padrão / Checklists" — espelha o acesso a tarefas em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['checklists'] = ROLE_PERMISSIONS[r]['tarefas'] || { view: false, create: false, edit: false, delete: false, export: false }
}

// Módulo "Sugestão de Pauta de Reunião" — espelha o acesso a atas (ou tarefas) em todos os papéis
for (const r of Object.keys(ROLE_PERMISSIONS)) {
  ROLE_PERMISSIONS[r]['pauta-reuniao'] = ROLE_PERMISSIONS[r]['atas'] || ROLE_PERMISSIONS[r]['tarefas'] || { view: false, create: false, edit: false, delete: false, export: false }
}

const ALL_MODULE_IDS = Object.keys(ROLE_PERMISSIONS.super_admin)
const FULL: ModulePermission = { view: true, create: true, edit: true, delete: true, export: true }
const OFF: ModulePermission = { view: false, create: false, edit: false, delete: false, export: false }
const VIEW: ModulePermission = { view: true, create: false, edit: false, delete: false, export: false }

/** Monta um PermissionsMap completo a partir de um spec enxuto.
 *  spec: { moduloId: 'full' | 'view' | Partial<ModulePermission> } — o que não for citado fica OFF. */
function mk(spec: Record<string, 'full' | 'view' | Partial<ModulePermission>>): PermissionsMap {
  const map: PermissionsMap = {}
  for (const id of ALL_MODULE_IDS) map[id] = { ...OFF }
  for (const [id, s] of Object.entries(spec)) {
    if (!(id in map)) continue
    map[id] = s === 'full' ? { ...FULL } : s === 'view' ? { ...VIEW } : { ...VIEW, ...s }
  }
  return map
}

export interface PermissionTemplate {
  id: string
  label: string
  emoji: string
  descricao: string
  perms: PermissionsMap
}

export const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'caixa', label: 'Caixa', emoji: '💳',
    descricao: 'Operação de PDV e registro de vendas.',
    perms: mk({ dashboard: 'view', pdv: { view: true, create: true, edit: true }, vendas: { view: true, create: true } }),
  },
  {
    id: 'atendente', label: 'Atendente / Garçom', emoji: '🧑‍🍳',
    descricao: 'Atendimento de salão e abertura de comandas.',
    perms: mk({ dashboard: 'view', salao: { view: true, create: true, edit: true }, pdv: { view: true, create: true }, cozinha: 'view' }),
  },
  {
    id: 'cozinha', label: 'Cozinha', emoji: '🍳',
    descricao: 'Acompanha e atualiza os pedidos da cozinha.',
    perms: mk({ dashboard: 'view', cozinha: { view: true, create: true, edit: true }, estoque: 'view' }),
  },
  {
    id: 'estoquista', label: 'Estoquista', emoji: '📦',
    descricao: 'Entradas, saídas, contagem e requisições.',
    perms: mk({ dashboard: 'view', estoque: { view: true, create: true, edit: true }, produtos: { view: true, create: true, edit: true }, requisicoes: { view: true, create: true }, ruptura: 'view', enxoval: { view: true, create: true, edit: true }, alertas: 'view' }),
  },
  {
    id: 'financeiro', label: 'Financeiro', emoji: '💰',
    descricao: 'Contas, boletos, fluxo de caixa e relatórios.',
    perms: mk({ dashboard: { view: true, export: true }, financeiro: 'full', vendas: { view: true, export: true }, compras: 'view', 'relatorio-cvl': { view: true, export: true } }),
  },
  {
    id: 'marketing', label: 'Marketing', emoji: '✨',
    descricao: 'Campanhas, agente Liz e inteligência de mercado.',
    perms: mk({ dashboard: 'view', marketing: 'full', 'agente-liz': 'full', market: 'view' }),
  },
  {
    id: 'compras', label: 'Comprador', emoji: '🛒',
    descricao: 'Requisições, cotações, pedidos e fornecedores.',
    perms: mk({ dashboard: 'view', compras: 'full', requisicoes: 'full', 'req-automaticas': { view: true, create: true, edit: true }, fornecedores: { view: true, create: true, edit: true }, 'lista-padrao': { view: true, create: true, edit: true }, 'relatorio-cvl': { view: true, export: true }, 'compras-agente': 'view', estoque: 'view' }),
  },
  {
    id: 'gerente', label: 'Gerente da Unidade', emoji: '🧑‍💼',
    descricao: 'Gerencia a operação da loja (sem Usuários/Config).',
    perms: mk({
      dashboard: { view: true, export: true }, vendas: 'full', pdv: 'full', estoque: 'full', produtos: 'full',
      'produtos-categorias': { view: true, create: true, edit: true }, compras: 'full', requisicoes: 'full',
      fornecedores: { view: true, create: true, edit: true }, financeiro: { view: true, export: true },
      cozinha: 'full', salao: 'full', marketing: { view: true, create: true, edit: true }, gamificacao: { view: true, create: true, edit: true },
      tarefas: 'full', pendencias: 'full', planejamento: { view: true, create: true, edit: true }, atas: { view: true, create: true, edit: true },
      ruptura: 'view', 'relatorio-cvl': { view: true, export: true }, alertas: 'view', enxoval: { view: true, create: true, edit: true }, 'agente-liz': 'view',
    }),
  },
  {
    id: 'franqueado', label: 'Franqueado', emoji: '👑',
    descricao: 'Visão gerencial da unidade (leitura + relatórios).',
    perms: mk({
      dashboard: { view: true, export: true }, vendas: { view: true, export: true }, financeiro: { view: true, export: true },
      estoque: 'view', compras: 'view', gamificacao: 'view', 'relatorio-cvl': { view: true, export: true }, marketing: 'view',
    }),
  },
  {
    id: 'operacional', label: 'Operacional', emoji: '🔧',
    descricao: 'Somente execução: tarefas e consultas básicas.',
    perms: mk({ dashboard: 'view', tarefas: { view: true, create: true, edit: true }, pendencias: { view: true, create: true }, estoque: 'view', cozinha: 'view', salao: 'view' }),
  },
]

export const TEMPLATE_BY_ID = Object.fromEntries(PERMISSION_TEMPLATES.map(t => [t.id, t]))
