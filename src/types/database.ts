export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'user' | 'viewer'
export type UserStatus = 'active' | 'inactive' | 'pending'
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export'

export interface ModulePermission {
  view: boolean
  create: boolean
  edit: boolean
  delete: boolean
  export: boolean
}

export type PermissionsMap = Record<string, ModulePermission>

export interface Profile {
  id: string
  email: string
  name: string
  role: UserRole
  loja: string | null
  status: UserStatus
  avatar_color: string
  initials: string
  permissions_override: PermissionsMap | null
  created_at: string
  last_login: string | null
  created_by: string | null
}

export interface RoleDefinition {
  id: string
  name: UserRole
  label: string
  description: string
  permissions: PermissionsMap
  is_system: boolean
  created_at: string
}

export interface TenantSettings {
  id: string
  slug: string
  company_name: string
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  primary_dark: string
  primary_light: string
  sidebar_color: string
  accent_color: string
  font_heading: string
  font_body: string
  stores: string[]
  plan: 'starter' | 'pro' | 'enterprise'
  support_email: string | null
  support_whatsapp: string | null
  footer_text: string | null
  custom_domain: string | null
  features: Record<string, boolean>
  created_at: string
  updated_at: string
}

// ── Salão ────────────────────────────────────────────────────

export type MesaStatus = 'livre' | 'ocupada' | 'reservada' | 'espera'
export type AtendStatus = 'em_atendimento' | 'finalizado'
export type CheckStatus = 'pendente' | 'ok' | 'nao_conforme'

export interface SalaoMesa {
  id: string
  loja: string
  numero: number
  status: MesaStatus
  garcom: string | null
  pax: number
  entrada: string | null
  reserva_hora: string | null
  consumo: number
  created_at: string
  updated_at: string
}

export interface SalaoAtendimento {
  id: string
  loja: string
  mesa: number
  garcom: string
  entrada: string
  saida: string | null
  tempo_min: number | null
  pax: number
  consumo: number
  avaliacao: number
  status: AtendStatus
  abordagem_min: number | null
  pedido_min: number | null
  entrega_min: number | null
  apresent_prato: number
  cordialidade: number
  postura: number
  erros: number
  devolucoes: number
  obs: string | null
  created_by: string | null
  created_at: string
}

export interface SalaoAvaliacao {
  id: string
  loja: string
  mesa: number | null
  garcom: string | null
  nota: number
  canal: string
  comentario: string | null
  data_aval: string
  created_at: string
}

export interface SalaoAvaliacaoEquipe {
  id: string
  loja: string
  colaborador: string
  data_aval: string
  uniforme: number
  higiene: number
  postura: number
  comunicacao: number
  equipe: number
  avaliado_por: string
  created_at: string
}

export interface SalaoChecklistItem {
  id: string
  loja: string
  data_reg: string
  tipo: 'abertura' | 'fechamento'
  categoria: string
  item: string
  status: CheckStatus
  colaborador: string | null
  responsavel: string | null
  observacoes: string | null
  criado_por: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  user_name: string
  action: string
  module: string
  entity_id: string | null
  detail: string
  ip: string | null
  created_at: string
}

export interface Pendencia {
  id: string
  title: string
  description: string | null
  loja: string
  priority: 'alta' | 'media' | 'baixa'
  status: 'pendente' | 'em_andamento' | 'concluido'
  responsible: string | null
  cost: number | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

// ── Requisições de Compra ────────────────────────────────────

export type ReqStatus =
  | 'rascunho' | 'enviada' | 'em_analise' | 'em_cotacao'
  | 'parcialmente_aprovada' | 'aprovada' | 'reprovada'
  | 'em_separacao' | 'compra_realizada' | 'prestacao_pendente' | 'em_auditoria'
  | 'concluida' | 'cancelada'

export type ReqItemStatus = 'pendente' | 'cotado' | 'aprovado' | 'cancelado'
export type CotacaoStatus = 'aguardando' | 'respondida' | 'aprovada' | 'rejeitada'
export type ReqPrioridade = 'baixa' | 'media' | 'alta' | 'urgente'

export interface Requisicao {
  id: string
  loja: string
  numero: number
  titulo: string
  data_necessidade: string | null
  prazo_entrega: string | null
  status: ReqStatus
  prioridade: ReqPrioridade
  setor: string | null
  responsavel_nome: string
  total_estimado: number
  total_final: number
  observacoes: string | null
  aprovador_nome: string | null
  aprovador_at: string | null
  obs_aprovacao: string | null
  credito_id: string | null
  centro_custo: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface RequisicaoItem {
  id: string
  requisicao_id: string
  produto_nome: string
  categoria: string | null
  quantidade: number
  unidade: string
  preco_referencia: number | null
  preco_cotado: number | null
  preco_final: number | null
  fornecedor_nome: string | null
  status: ReqItemStatus
  observacoes: string | null
  bloqueado: boolean
  motivo_bloqueio: string | null
  quantidade_aprovada: number | null
  created_at: string
}

export interface ReqTimeline {
  id: string
  requisicao_id: string
  tipo: string
  descricao: string
  usuario: string | null
  dados: Record<string, unknown> | null
  created_at: string
}

export interface RequisicaoCotacao {
  id: string
  requisicao_id: string
  fornecedor_nome: string
  status: CotacaoStatus
  total: number | null
  prazo_entrega: number | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface RequisicaoCotacaoItem {
  id: string
  cotacao_id: string
  item_id: string
  preco_unitario: number | null
  disponivel: boolean
  observacoes: string | null
  created_at: string
}

// ── Requisições Automáticas ──────────────────────────────────

export interface RequisicaoAutomatica {
  id: string
  loja: string
  lista_id: string | null
  lista_titulo: string
  dia_semana: number           // 0=Dom 1=Seg 2=Ter 3=Qua 4=Qui 5=Sex 6=Sáb
  hora_maxima: string          // 'HH:MM'
  prazo_dias: number
  ativo: boolean
  criado_por: string | null
  created_at: string
  updated_at: string
}

// ── Compras / Lista de Compras ───────────────────────────────

export type ListaStatus = 'rascunho' | 'em_andamento' | 'concluido' | 'cancelado'
export type ListaItemStatus = 'pendente' | 'comprado' | 'cancelado'

export interface ComprasLista {
  id: string
  loja: string
  titulo: string
  data_compra: string | null
  status: ListaStatus
  total_estimado: number
  total_real: number
  observacoes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ComprasListaItem {
  id: string
  lista_id: string
  produto_nome: string
  categoria: string | null
  quantidade: number
  unidade: string
  preco_estimado: number | null
  preco_real: number | null
  fornecedor_nome: string | null
  status: ListaItemStatus
  observacoes: string | null
  created_at: string
}

// ── Fornecedores ─────────────────────────────────────────────

export interface FornecedorAvaliacao {
  id: string
  fornecedor_id: string
  loja: string
  nota: number
  criterio_preco: number | null
  criterio_prazo: number | null
  criterio_qualidade: number | null
  criterio_atendimento: number | null
  comentario: string | null
  avaliado_por: string | null
  created_at: string
}

export interface Fornecedor {
  id: string
  loja: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  ie: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  logo_url: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  forma_pagamento: string
  chave_pix: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  prazo_pagamento: number
  categorias: string | null
  prazo_entrega_dias: number | null
  pedido_minimo: number | null
  desconto_pct: number | null
  contato_nome: string | null
  contato_email: string | null
  contato_telefone: string | null
  observacoes: string | null
  nota_avaliacao: number | null
  total_pedidos: number
  obs_avaliacao: string | null
  ativo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Estoque ──────────────────────────────────────────────────

export type NivelStatus = 'Crítico' | 'Repor' | 'Ok' | 'Ideal'
export type MovTipo = 'entrada' | 'saida' | 'perda' | 'desperdicio'
export type ContagemTipo = 'regular' | 'fechamento' | 'abertura'
export type PerdaTipo = 'perda' | 'desperdicio' | 'vencimento' | 'dano'

export interface EstoqueProduto {
  id: string
  loja: string
  nome: string
  gramatura: string
  categoria: string
  nivel_atual: number
  nivel_minimo: number
  nivel_ideal: number
  preco_unitario: number
  ativo: boolean
  data_validade: string | null
  numero_lote: string | null
  dias_alerta: number
  registrar_perdas: boolean
  created_at: string
  updated_at: string
}

export interface EstoquePerda {
  id: string
  loja: string
  produto_id: string | null
  produto_nome: string
  tipo_perda: PerdaTipo
  quantidade: number
  unidade: string
  numero_lote: string | null
  data_validade: string | null
  motivo: string | null
  valor_estimado: number | null
  created_by: string | null
  created_at: string
}

export interface EstoqueMovimentacao {
  id: string
  loja: string
  produto_id: string | null
  produto_nome: string
  tipo: MovTipo
  quantidade: number
  unidade: string
  motivo: string | null
  created_by: string | null
  created_at: string
}

export interface EstoqueContagem {
  id: string
  loja: string
  tipo: ContagemTipo
  data_contagem: string
  created_by: string | null
  created_at: string
}

export interface EstoqueContagemItem {
  id: string
  contagem_id: string
  produto_id: string | null
  produto_nome: string
  quantidade_contada: number
  unidade: string
  created_at: string
}

export interface Colaborador {
  id: string
  nome: string
  func: string
  setor: 'salao' | 'cozinha' | 'balcao'
  loja: string
  cor: string
  meta_fat: number
  meta_tick: number
  meta_aval: number
  meta_tempo: number
  fat: number
  tick: number
  aval: number
  tempo: number
  erros: number
  pres: number
  obs: string
  periodo_ref: string | null
  recompensas: string[] | null
  created_at: string
}

// ── Módulo Financeiro ─────────────────────────────────────────

export type FinCreditoStatus =
  | 'aberto' | 'em_utilizacao' | 'prestacao_pendente' | 'prestacao_enviada'
  | 'em_auditoria' | 'aprovado' | 'reprovado' | 'finalizado'

export type FinPrestacaoStatus = 'rascunho' | 'enviada' | 'em_auditoria' | 'aprovada' | 'reprovada'
export type FinFormaPagamento   = 'pix' | 'dinheiro' | 'cartao' | 'transferencia'
export type FinAuditoriaStatus  = 'pendente' | 'aprovado' | 'reprovado' | 'correcao'

export interface FinCredito {
  id: string; loja: string; numero: number
  responsavel_nome: string; responsavel_cargo: string | null
  supervisor_nome: string | null; setor: string | null
  valor_liberado: number; data_liberacao: string; objetivo: string
  forma_pagamento: FinFormaPagamento; prazo_prestacao: string | null
  observacoes: string | null; status: FinCreditoStatus
  created_by: string | null; created_at: string; updated_at: string
}

export interface FinPrestacao {
  id: string; loja: string; numero: number; credito_id: string | null
  responsavel_nome: string; data_prestacao: string
  valor_recebido: number; valor_utilizado: number; valor_devolvido: number; diferenca: number
  status: FinPrestacaoStatus; observacoes: string | null
  auditado_por: string | null; data_auditoria: string | null; obs_auditoria: string | null
  created_by: string | null; created_at: string; updated_at: string
}

export interface FinLancamento {
  id: string; prestacao_id: string; categoria: string; descricao: string
  fornecedor: string | null; valor: number; data_compra: string
  forma_pagamento: FinFormaPagamento; observacao: string | null
  status_auditoria: FinAuditoriaStatus; obs_auditoria: string | null
  created_at: string
}

export interface FinAnexo {
  id: string; lancamento_id: string; nome_arquivo: string; tipo: string
  url: string; tamanho_kb: number | null; created_by: string | null; created_at: string
}

export interface FinAuditoriaLog {
  id: string; loja: string | null; entidade: string; entidade_id: string | null
  acao: string; detalhe: string | null; usuario: string | null; created_at: string
}

// ── Produtos ─────────────────────────────────────────────────

export interface CategoriaProduto {
  id: string
  loja: string
  nome: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface MarcaProduto {
  id: string
  loja: string
  nome: string
  ativo: boolean
  created_at: string
}

export type ProdutoUnidade =
  | 'Miligrama' | 'Grama' | 'Quilograma' | 'Tonelada'
  | 'Mililitro'  | 'Litro'
  | 'Unidade'    | 'Caixa'  | 'Peça'      | 'Dúzia'
  | 'Garrafa'    | 'Frasco' | 'Galão'     | 'Pote'
  | 'Rolo'       | 'Pacote' | 'Lata'      | 'Saco'
  | 'Metro'      | 'Centímetro' | 'Par'
  | 'Barrica'    | 'Tambor' | 'Fardo'     | 'Bisnaga'
  | 'Maço'       | 'Bandeja'| 'Embalagem' | 'Display'
  | 'Pente'      | 'Balde'  | 'Quilograma'

export type HomologacaoStatus = 'homologado' | 'em_teste' | 'reprovado' | 'pendente'

export interface Produto {
  id: string
  loja: string
  codigo_interno: string
  nome: string
  descricao: string | null
  categoria_id: string | null
  categoria_nome: string | null
  gramatura: number | null
  unidade: string
  marca_id: string | null
  marca_nome: string | null
  imagem_url: string | null
  ativo: boolean
  estoque_atual: number
  estoque_minimo: number
  ultimo_preco_compra: number | null
  preco_anterior_compra: number | null
  data_ultima_compra: string | null
  preco_venda: number | null
  disponivel_pdv: boolean
  fornecedor_padrao_id: string | null
  fornecedor_padrao_nome: string | null
  status_homologacao: HomologacaoStatus
  feedback_teste: string | null
  data_inicio_teste: string | null
  aprovado_por: string | null
  aprovacao_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // join helpers
  fornecedores?: ProdutoFornecedor[]
}

export interface ProdutoTeste {
  id: string
  produto_id: string
  loja: string
  resultado: 'em_teste' | 'aprovado' | 'reprovado'
  avaliador: string | null
  nota_sabor: number | null
  nota_custo: number | null
  nota_fornecimento: number | null
  comentario: string | null
  substituiu_produto: string | null
  created_at: string
}

export interface ProdutoFornecedor {
  id: string
  produto_id: string
  fornecedor_id: string
  ultimo_preco: number | null
  created_at: string
  // join
  fornecedor?: import('./database').Fornecedor
}

// ── Cozinha ──────────────────────────────────────────────────

export interface CozinhaChecklist {
  id: string
  titulo: string
  loja: string
  setor: string
  itens: Array<{ id: string; txt: string; ok: boolean; obrigatorio: boolean; foto?: string }>
  created_at: string
  updated_at: string
}

export interface CozinhaProducao {
  id: string
  prato: string
  qtd: string
  loja: string
  solicitante: string
  executor: string
  hora: string
  status: 'pendente' | 'em_preparo' | 'concluido'
  obs: string
  created_at: string
  updated_at: string
}

export interface CozinhaDesperdicio {
  id: string
  data: string
  item: string
  qtd: string
  unidade: string
  motivo: string
  categoria: string
  responsavel: string
  loja: string
  custo: string
  created_at: string
}

export interface CozinhaFicha {
  id: string
  nome: string
  foto: string
  ingredientes: Array<{ desc: string; qtd: string; unidade: string; custo: string }>
  rendimento: string
  tempo_preparo: string
  modo_preparo: string
  custo_total: string
  margem: string
  preco_venda: string
  created_at: string
  updated_at: string
}

export interface CozinhaSolicitacao {
  id: string
  tipo: 'produto' | 'equipamento' | 'utensilio' | 'manutencao' | 'compra_emergencial'
  item: string
  quantidade: string
  urgencia: 'baixa' | 'media' | 'alta' | 'critica'
  responsavel: string
  setor: string
  status: 'solicitado' | 'em_cotacao' | 'aprovado' | 'em_compra' | 'recebido' | 'cancelado'
  obs: string
  data: string
  loja: string
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Omit<Profile, 'created_at'>
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
      }
      role_definitions: {
        Row: RoleDefinition
        Insert: Omit<RoleDefinition, 'id' | 'created_at'>
        Update: Partial<Omit<RoleDefinition, 'id' | 'created_at'>>
      }
      tenant_settings: {
        Row: TenantSettings
        Insert: Omit<TenantSettings, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<TenantSettings, 'id' | 'created_at'>>
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'>
        Update: never
      }
      pendencias: {
        Row: Pendencia
        Insert: Omit<Pendencia, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Pendencia, 'id' | 'created_at'>>
      }
      colaboradores: {
        Row: Colaborador
        Insert: Omit<Colaborador, 'id' | 'created_at'>
        Update: Partial<Omit<Colaborador, 'id' | 'created_at'>>
      }
    }
  }
}
