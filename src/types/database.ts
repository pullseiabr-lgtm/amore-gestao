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

// ── Alertas & Rastreabilidade ────────────────────────────────

export interface ActivityLog {
  id: string
  loja: string
  usuario: string | null
  modulo: string
  acao: string
  entidade: string
  entidade_id: string | null
  descricao: string
  created_at: string
}

export interface AlertasConfig {
  id: string
  loja: string
  tipo: string
  ativo: boolean
  threshold: number
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
  anexos?: string | null
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
  // ── Aprovação multinível (opcionais — preenchidos no fluxo) ──
  aprov_gestor_por?: string | null
  aprov_gestor_em?: string | null
  aprov_financeiro_por?: string | null
  aprov_financeiro_em?: string | null
  aprov_diretoria_por?: string | null
  aprov_diretoria_em?: string | null
  aprov_reprovado_por?: string | null
  aprov_reprovado_motivo?: string | null
  // ── Validação fiscal tripla ──
  fiscal_status?: FiscalStatus | null
  fiscal_nf_numero?: string | null
  fiscal_nf_valor?: number | null
  fiscal_mercadoria_ok?: boolean | null
  fiscal_conferido_por?: string | null
  fiscal_conferido_em?: string | null
  fiscal_obs?: string | null
  fiscal_anexo?: string | null
  // ── Pedido de compra (gerado na aprovação) ──
  pedido_numero?: string | null
  pedido_status?: PedidoStatus | null
  pedido_gerado_em?: string | null
  credito_id: string | null
  centro_custo: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AprovacaoConfig {
  loja: string
  limite_gestor: number
  limite_financeiro: number
  limite_diretoria: number
  updated_at: string
}

export type NivelAprovacao = 'gestor' | 'financeiro' | 'diretoria'
export type FiscalStatus = 'pendente' | 'liberado' | 'divergencia' | 'aguardando_correcao'
export type PedidoStatus = 'emitido' | 'enviado' | 'aguardando_entrega' | 'entregue_parcial' | 'entregue' | 'finalizado'

export type BoletoStatus = 'pendente' | 'pago' | 'vencido' | 'cancelado'

export interface Boleto {
  id: string
  loja: string
  nota_fiscal_numero: string | null
  fornecedor: string | null
  cnpj: string | null
  banco: string | null
  beneficiario: string | null
  valor: number
  data_emissao: string | null
  data_vencimento: string | null
  codigo_barras: string | null
  linha_digitavel: string | null
  status: BoletoStatus
  data_pagamento: string | null
  comprovante_obs: string | null
  observacao: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Central de Notificações (Fase 6) ────────────────────────────────────────
export type NotificacaoTipo   = 'tarefa' | 'compra' | 'cotacao' | 'relatorio' | 'estoque' | 'manual'
export type NotificacaoStatus = 'enviado' | 'falha' | 'pendente'
export type NotificacaoCanal  = 'whatsapp' | 'email' | 'sistema'

export interface Notificacao {
  id: string
  loja: string | null
  canal: NotificacaoCanal
  tipo: NotificacaoTipo
  modulo: string | null
  titulo: string | null
  mensagem: string | null
  destinatario_nome: string | null
  destinatario_telefone: string | null
  setor: string | null
  referencia_id: string | null
  status: NotificacaoStatus
  erro: string | null
  lida: boolean
  created_by: string | null
  created_at: string
}

// ── Módulo de Caixas (arquivo de caixas de despesas) ────────────────────────
export interface Caixa {
  id: string
  loja: string
  titulo: string
  periodo_inicio: string | null
  periodo_fim: string | null
  data_ref: string | null
  total: number
  qtd_itens: number
  arquivo_origem: string | null
  origem: string
  status: string
  observacoes: string | null
  anexo_url: string | null
  created_by: string | null
  created_at: string
}

export interface CaixaItem {
  id: string
  caixa_id: string
  data: string | null
  fornecedor: string | null
  categoria: string | null
  descricao: string | null
  valor: number
  forma_pagamento: string | null
  documento: string | null
  anexo_url: string | null
  created_at: string
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

// ── Agente Analítico de Compras ──────────────────────────────

export interface ComprasHistoricoPreco {
  id: string
  produto_nome: string
  categoria: string | null
  fornecedor_nome: string | null
  preco_unitario: number
  quantidade: number
  unidade: string
  comprador_nome: string | null
  loja: string
  data_compra: string
  lista_id: string | null
  item_id: string | null
  obs: string | null
  created_at: string
}

export type NivelAlertaCompra = 'normal' | 'baixo' | 'medio' | 'alto'
export type StatusAuditoria = 'ok' | 'pendente_justificativa' | 'justificado' | 'aprovado' | 'escalado'

export interface ComprasAuditoria {
  id: string
  lista_id: string | null
  item_id: string | null
  produto_nome: string
  categoria: string | null
  fornecedor_nome: string | null
  comprador_nome: string | null
  quantidade: number | null
  unidade: string | null
  preco_atual: number
  preco_anterior: number | null
  preco_medio: number | null
  preco_menor: number | null
  preco_maior: number | null
  variacao_pct: number | null
  nivel_alerta: NivelAlertaCompra
  status: StatusAuditoria
  loja: string
  data_compra: string
  created_at: string
}

export type MotivoJustificativa =
  | 'reajuste_mercado' | 'falta_fornecedor' | 'sem_opcao_barata'
  | 'cotacao_realizada' | 'urgencia_operacional' | 'qualidade_superior' | 'outro'

export interface ComprasJustificativa {
  id: string
  auditoria_id: string
  motivo: MotivoJustificativa
  descricao: string | null
  houve_cotacao: boolean
  comprador_nome: string | null
  aprovador_nome: string | null
  status_aprovacao: 'pendente' | 'aprovado' | 'reprovado'
  obs_aprovacao: string | null
  created_at: string
}

export interface ComprasPesquisaMercado {
  id: string
  produto_nome: string
  query_usada: string | null
  titulo_resultado: string | null
  url_resultado: string | null
  snippet: string | null
  preco_extraido: number | null
  fornecedor_encontrado: string | null
  data_pesquisa: string
  loja: string
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
  prioridade: 'urgente' | 'normal' | 'programado'
  hora_inicio: string | null
  hora_fim: string | null
  praca: string | null
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

// ── Operação Padrão / Checklists Inteligentes ────────────────

export type ChecklistItemTipo    = 'confirm' | 'numero' | 'foto' | 'avaliacao'
                                 | 'texto' | 'temperatura' | 'quantidade' | 'peso' | 'valor'
                                 | 'qrcode' | 'assinatura'
export type ChecklistRecorrencia = 'diario' | 'semanal' | 'mensal' | 'avulso'
export type ChecklistTurno       = 'abertura' | 'almoco' | 'jantar' | 'fechamento' | 'qualquer'
export type ChecklistExecStatus  = 'pendente' | 'em_andamento' | 'concluido' | 'atrasado'

export interface ChecklistItem {
  id: string
  txt: string
  tipo: ChecklistItemTipo
  obrigatorio: boolean
  critico: boolean
  peso: number
  // Campos opcionais (JSONB — retrocompatível com itens antigos)
  instrucao?: string | null      // orientação passo a passo exibida na execução
  foto_ref?: string | null       // foto de referência (padrão esperado)
  unidade?: string | null        // ex.: °C, kg, un, R$ — exibida ao lado do valor
  min?: number | null            // limite inferior (temperatura/número) — fora da faixa = não conforme
  max?: number | null            // limite superior
  cond?: ChecklistCondicao | null // ações condicionais quando a resposta for não conforme
}

// Checklist condicionado — quando a resposta do item for NÃO conforme, dispara estas ações
export interface ChecklistCondicao {
  mensagem?: string | null   // instrução mostrada ao operador quando dispara
  exigir_foto?: boolean      // passa a exigir foto neste item
  exigir_obs?: boolean       // passa a exigir observação/comentário
  abrir_nc?: boolean         // abre Não Conformidade ao concluir
  bloquear?: boolean         // bloqueia a conclusão do checklist até resolver
  alertar?: boolean          // sinaliza para alertar o gestor
}

export interface ChecklistModelo {
  id: string
  loja: string | null            // null = vale p/ todas as lojas
  titulo: string
  setor: string
  descricao: string | null
  recorrencia: ChecklistRecorrencia
  dias_semana: number[] | null   // 0=dom .. 6=sab
  dia_mes: number | null
  turno: ChecklistTurno
  hora_limite: string | null     // HH:MM
  exige_gps: boolean
  itens: ChecklistItem[]
  ativo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ChecklistResposta {
  item_id: string
  ok: boolean
  valor: number | null
  foto_url: string | null
  nota: number | null
  ia_ok: boolean | null
  ia_motivo: string | null
  obs: string | null
  // Campos opcionais (JSONB — retrocompatível)
  texto?: string | null                                   // resposta do tipo comentário / código escaneado
  assinatura?: string | null                              // URL da assinatura digital (tipo assinatura)
  ia_status?: 'aprovado' | 'reprovado' | 'revisao' | null // veredito da IA em 3 estados
  nao_executou?: boolean                                  // marcou "não consigo executar"
  motivo_nao?: string | null                              // justificativa da não execução
  // Não Conformidade (plano de ação) — aberta quando o item é reprovado
  nc?: ChecklistNC | null
}

export type ChecklistNCStatus = 'aberta' | 'em_correcao' | 'corrigida' | 'encerrada'

export interface ChecklistNC {
  status: ChecklistNCStatus
  gravidade: 'baixa' | 'media' | 'alta'
  item_txt: string | null            // descrição do item que reprovou (denormalizado)
  foto_evidencia: string | null      // foto que evidenciou a não conformidade (quando houver)
  motivo_reprovacao: string | null   // por que abriu (foto reprovada / fora do limite / não executado)
  causa: string | null               // causa-raiz apontada
  acao: string | null                // ação corretiva
  responsavel: string | null         // quem corrige
  prazo: string | null               // YYYY-MM-DD
  impacto: number | null             // impacto financeiro estimado (R$)
  foto_correcao: string | null       // 2ª foto (depois da correção)
  aprovado_por: string | null        // gestor que validou
  aberta_em: string | null
  encerrada_em: string | null
  tarefa_id?: string | null          // tarefa corretiva gerada na Central de Tarefas
}

export interface ChecklistExecucao {
  id: string
  modelo_id: string | null
  loja: string
  titulo: string
  setor: string | null
  data: string                   // YYYY-MM-DD
  turno: ChecklistTurno
  status: ChecklistExecStatus
  responsavel_id: string | null
  responsavel_nome: string | null
  respostas: ChecklistResposta[]
  gps_lat: number | null
  gps_lng: number | null
  score: number | null           // compliance 0..100
  hora_limite: string | null
  iniciado_em: string | null
  concluido_em: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // join opcional
  modelo?: ChecklistModelo
}

// ── Sugestão de Pauta de Reunião ─────────────────────────────

export interface PautaTema {
  id: string
  tema: string
  descricao: string
  motivo: string          // por quê?
  objetivo: string        // resultado esperado
  setor: string
  responsavel: string
  prioridade: string      // Alta|Média|Baixa|... (personalizável)
  tempo: string           // estimado, ex.: "15 min"
  status: string          // Pendente|Em andamento|Concluído|... (personalizável)
  decisao?: string        // decisão tomada (preenchida após a reunião → gera a ata)
}

export interface PautaReuniao {
  id: string
  loja: string | null
  titulo: string
  data: string | null     // YYYY-MM-DD
  horario: string | null  // HH:MM
  tipo: string | null     // Operacional|Comercial|... (personalizável)
  status: string          // rascunho|finalizada|realizada
  temas: PautaTema[]
  observacoes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Tarefas Operacionais ─────────────────────────────────────

// ── Configuração de cobranças automáticas (módulo 13 — consumida pelo worker no VPS) ──
export interface CobrancaNivel {
  rotulo: string           // ex.: Responsável, Líder do setor, Gerente, Diretoria
  apos_min: number         // minutos após o prazo para acionar este nível
  whatsapp: string | null  // número fixo; se vazio, o worker resolve pelo responsável/setor
}
export interface CobrancaConfig {
  ativo: boolean
  lembretes_antes_min: number[]   // ex.: [30, 10] — minutos ANTES do prazo
  lembretes_apos_min: number[]    // ex.: [10, 30, 60] — minutos DEPOIS do atraso
  max_lembretes: number
  tolerancia_min: number          // atraso tolerado antes de começar a escalar
  escalonamento: CobrancaNivel[]
  quiet_inicio: string            // HH:MM — não enviar a partir de
  quiet_fim: string               // HH:MM — voltar a enviar a partir de
  dias_semana: number[]           // 0=dom..6=sáb — dias em que pode enviar
  critico_acelera: boolean        // tarefas urgentes escalam na metade do tempo
}

export type TarefaStatus     = 'pendente' | 'em_andamento' | 'aguardando_retorno' | 'aguardando_fornecedor' | 'concluido' | 'cancelado'
export type TarefaPrioridade = 'baixa' | 'media' | 'alta' | 'urgente'
export type TarefaResultado  = 'resolvido' | 'resolvido_parcial' | 'pendente_ajuste' | 'nao_concluido'
export type TarefaSetor      = 'Cozinha' | 'Bar' | 'Salão' | 'Estoque' | 'Compras' | 'Financeiro' | 'RH' | 'Limpeza' | 'Produção' | 'Diretoria' | 'Geral'

export interface Tarefa {
  id: string
  numero?: number
  loja: string
  titulo: string
  descricao: string | null
  setor: string
  status: TarefaStatus
  prioridade: TarefaPrioridade
  responsavel_nome: string | null
  solicitante_nome: string
  prazo: string | null
  observacoes: string | null
  // ── Padrão ClickUp / Gestão Amore ──
  objetivo: string | null
  envolvidos: string | null
  competencia: string | null
  data_inicio: string | null
  entregaveis: string | null
  anexos: string | null
  tags: string | null
  custo_previsto: number | null
  custo_executado: number | null
  resultado_esperado: string | null
  resultado_final: string | null
  // ── Governança de execução ──
  dificuldades: string | null
  iniciado_em: string | null
  concluido_em: string | null
  prazo_extensao_data: string | null
  prazo_extensao_motivo: string | null
  prazo_extensao_status: 'pendente' | 'aprovado' | 'negado' | null
  // ── Template operacional ──
  data_solicitacao: string | null
  resultado_status: TarefaResultado | null
  validado_por: string | null
  validado_em: string | null
  observacao_final: string | null
  precisa_aprovacao: boolean
  aprovado_por: string | null
  aprovado_at: string | null
  obs_aprovacao: string | null
  reaberta: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  checklist?: TarefaChecklist[]
  comentarios?: TarefaComentario[]
  historico?: TarefaHistorico[]
}

export interface TarefaChecklist {
  id: string
  tarefa_id: string
  descricao: string
  concluido: boolean
  concluido_por: string | null
  concluido_at: string | null
  created_at: string
}

export interface TarefaComentario {
  id: string
  tarefa_id: string
  texto: string
  autor_nome: string
  created_at: string
}

export interface TarefaHistorico {
  id: string
  tarefa_id: string
  acao: string
  campo: string | null
  valor_anterior: string | null
  valor_novo: string | null
  usuario_nome: string
  created_at: string
}

// ── Lista de Compras Padronizada ─────────────────────────────

export type ListaPadraoStatus  = 'rascunho' | 'revisao' | 'aprovada' | 'em_compra' | 'concluida' | 'cancelada'
export type ListaPadraoPeriodo = 'semanal' | 'quinzenal' | 'mensal' | 'avulso'

export interface ListaPadrao {
  id: string
  loja: string
  titulo: string
  periodo: ListaPadraoPeriodo
  referencia: string
  status: ListaPadraoStatus
  total_estimado: number
  total_real: number
  criado_por: string | null
  aprovado_por: string | null
  aprovado_at: string | null
  obs_aprovacao: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
  // joined
  itens?: ListaPadraoItem[]
}

export interface ListaPadraoItem {
  id: string
  loja: string
  lista_id: string
  produto_nome: string
  categoria: string
  unidade: string
  quantidade: number
  preco_referencia: number | null
  preco_digitado: number | null
  preco_minimo: number | null
  preco_maximo: number | null
  variacao_pct: number | null
  alerta_preco: boolean
  fornecedor: string | null
  marca: string | null
  urgente: boolean
  comprado: boolean
  obs: string | null
  created_at: string
}

export interface ListaHistoricoPreco {
  id: string
  loja: string
  produto_nome: string
  unidade: string
  preco: number
  fornecedor: string | null
  marca: string | null
  lista_id: string | null
  referencia: string | null
  created_at: string
}

// ── Ata de Reunião ────────────────────────────────────────────

export type AtaTipo   = 'operacional' | 'estrategica' | 'feedback' | 'treinamento' | 'outro'
export type AtaStatus = 'rascunho' | 'finalizada' | 'aprovada'
export type AtaAcaoStatus = 'pendente' | 'em_andamento' | 'concluido' | 'cancelado'

export interface AtaReuniao {
  id: string
  loja: string
  titulo: string
  data_reuniao: string
  hora_inicio: string | null
  hora_fim: string | null
  local_reuniao: string | null
  tipo: AtaTipo
  participantes: string[] | null
  pauta: string | null
  decisoes: string | null
  proximos_passos: string | null
  observacoes: string | null
  status: AtaStatus
  aprovada_por: string | null
  aprovada_at: string | null
  arquivo_url: string | null
  arquivo_nome: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  acoes?: AtaAcao[]
}

export interface AtaAcao {
  id: string
  loja: string
  ata_id: string
  descricao: string
  responsavel: string
  prazo: string | null
  status: AtaAcaoStatus
  tarefa_id: string | null
  observacoes: string | null
  created_at: string
}

// ── Planejamento Operacional ─────────────────────────────────

export type PlanejamentoTipo      = 'reuniao' | 'evento_especial' | 'turno' | 'rotina' | 'meta' | 'treinamento' | 'outro'
export type PlanejamentoStatus    = 'planejado' | 'em_andamento' | 'concluido' | 'cancelado'
export type PlanejamentoPrioridade = 'baixa' | 'media' | 'alta' | 'urgente'
export type PlanejamentoRecorrencia = 'diario' | 'semanal' | 'quinzenal' | 'mensal'

export interface PlanejamentoEvento {
  id: string
  loja: string
  titulo: string
  descricao: string | null
  tipo: PlanejamentoTipo
  data_inicio: string
  data_fim: string | null
  hora_inicio: string | null
  hora_fim: string | null
  dia_todo: boolean
  setor: string | null
  responsavel: string | null
  status: PlanejamentoStatus
  prioridade: PlanejamentoPrioridade
  cor: string
  recorrente: boolean
  recorrencia: PlanejamentoRecorrencia | null
  observacoes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PlanejamentoMeta {
  id: string
  loja: string
  titulo: string
  setor: string
  indicador: string
  meta_valor: number
  valor_atual: number
  unidade: string
  periodo_ref: string
  status: 'em_andamento' | 'atingida' | 'nao_atingida'
  observacoes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── Enxoval Operacional ──────────────────────────────────────

export type EnxovalMovTipo   = 'solicitacao' | 'saida' | 'devolucao' | 'perda' | 'entrada'
export type EnxovalMovStatus = 'pendente' | 'aprovado' | 'recusado' | 'concluido'

export interface EnxovalItem {
  id: string
  loja: string
  nome: string
  categoria: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface EnxovalMovimentacao {
  id: string
  loja: string
  item_id: string
  tipo: EnxovalMovTipo
  quantidade: number
  setor_destino: string | null
  responsavel: string
  aprovado_por: string | null
  status: EnxovalMovStatus
  avarias: number
  perdas: number
  divergencias: string | null
  observacoes: string | null
  created_by: string | null
  created_at: string
  // joined
  item?: EnxovalItem
}

// ── Market Analytics & Supplier Intelligence ─────────────────

export interface MarketPriceHistory {
  id: string
  produto: string
  categoria: string
  fornecedor_nome: string
  preco: number
  unidade: string
  loja: string
  fonte: 'manual' | 'cotacao' | 'compra'
  data: string
  obs: string
  created_at: string
}

export interface FornecedorScore {
  id: string
  fornecedor_nome: string
  score_operacional: number
  score_financeiro: number
  score_confiabilidade: number
  score_entrega: number
  score_competitividade: number
  score_total: number
  classificacao: 'ouro' | 'prata' | 'bronze' | 'observacao' | 'critico'
  total_pedidos: number
  pedidos_no_prazo: number
  pedidos_em_atraso: number
  rupturas: number
  avaliacao_media: number
  obs: string
  ultima_atualizacao: string
  created_at: string
}

export interface MarketAlert {
  id: string
  tipo: 'aumento' | 'reducao' | 'oportunidade' | 'risco_ruptura' | 'antecipacao' | 'variacao'
  produto: string
  categoria: string
  mensagem: string
  variacao_pct: number
  preco_anterior: number | null
  preco_atual: number | null
  fornecedor_nome: string
  loja: string
  lido: boolean
  created_at: string
}

export interface MarketTendencia {
  id: string
  produto: string
  categoria: string
  tendencia: 'alta' | 'baixa' | 'estavel' | 'volatil'
  variacao_7d: number
  variacao_30d: number
  preco_medio_30d: number
  preco_atual: number
  melhor_fornecedor: string
  melhor_preco: number
  previsao_7d_pct: number
  data_analise: string
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
