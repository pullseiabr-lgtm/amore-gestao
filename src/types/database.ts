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
  created_at: string
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
