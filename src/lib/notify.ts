// ── Notificações WhatsApp via Z-API ──────────────────────────────
// Helper compartilhado pelos módulos (Tarefas, Compras, Cotações...).
// A config do Z-API fica em localStorage 'zapi_cfg' (definida na tela Liz → WhatsApp).
// O envio passa pelo proxy /api/zapi-send para evitar CORS.

import { insertNotificacao, fetchAppConfig, saveAppConfig } from './db'
import type { NotificacaoTipo } from '../types/database'

export type ZapiCfg = { instance?: string; token?: string; clientToken?: string; recipients?: string }

// Metadados opcionais para registrar a notificação na Central (tabela notificacoes).
export type NotifyMeta = {
  tipo?: NotificacaoTipo
  modulo?: string
  titulo?: string
  setor?: string | null
  loja?: string | null
  destinatario_nome?: string | null
  referencia_id?: string | null
  created_by?: string | null
}

export function getZapiCfg(): ZapiCfg {
  try { return JSON.parse(localStorage.getItem('zapi_cfg') || '{}') } catch { return {} }
}

const ZAPI_CFG_KEY = 'zapi'

// Carrega a config do Z-API do banco (compartilhada entre todos os dispositivos)
// e atualiza o cache local. Deve ser chamada ao iniciar o app.
export async function carregarZapiCfgRemoto(): Promise<ZapiCfg> {
  try {
    const remoto = await fetchAppConfig<ZapiCfg>(ZAPI_CFG_KEY)
    if (remoto && (remoto.instance || remoto.token)) {
      localStorage.setItem('zapi_cfg', JSON.stringify(remoto))
      return remoto
    }
  } catch { /* ignora — usa o cache local */ }
  return getZapiCfg()
}

// Salva a config do Z-API no banco (vale para qualquer computador) e no cache local.
export async function salvarZapiCfgRemoto(cfg: ZapiCfg): Promise<void> {
  localStorage.setItem('zapi_cfg', JSON.stringify(cfg))
  await saveAppConfig(ZAPI_CFG_KEY, cfg)
}

// Extrai apenas dígitos de um telefone (formato aceito pelo Z-API).
export function soDigitos(fone: string | null | undefined): string {
  return (fone || '').replace(/\D/g, '')
}

// Busca o WhatsApp de um usuário pelo nome.
// O número fica em profiles.permissions_override.__perfil__.whatsapp (cadastro de usuário).
export function whatsappDoPerfilPorNome(profiles: any[], nome: string): string {
  if (!nome) return ''
  const u = profiles.find(p => (p.name || '').trim().toLowerCase() === nome.trim().toLowerCase())
  const perfil = (u?.permissions_override as any)?.__perfil__
  return soDigitos(perfil?.whatsapp)
}

// Retorna os perfis cujo setor corresponde ao informado (ex: "Compras").
export function perfisDoSetor(profiles: any[], setor: string): any[] {
  const alvo = setor.trim().toLowerCase()
  return profiles.filter(p => {
    const perfil = (p?.permissions_override as any)?.__perfil__
    return (perfil?.setor || '').trim().toLowerCase() === alvo && soDigitos(perfil?.whatsapp)
  })
}

// Envia uma mensagem de texto para um número via Z-API. Retorna true se ok.
// Se `meta` for informado, registra a notificação na Central (tabela notificacoes).
export async function enviarWhatsApp(phone: string, message: string, cfg?: ZapiCfg, meta?: NotifyMeta): Promise<boolean> {
  const fone = soDigitos(phone)
  let ok = false
  let erro: string | null = null
  try {
    if (!fone || !message) { erro = 'numero/mensagem ausente'; }
    else {
      // Envia pela Evolution API (credenciais ficam no servidor — env da Vercel).
      const r = await fetch('/api/evolution-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fone, message }),
      })
      ok = r.ok
      if (!r.ok) erro = `HTTP ${r.status}`
    }
  } catch (e: any) { erro = e?.message || 'erro de rede' }

  // Registro na Central de Notificações (não bloqueia o retorno)
  if (meta) {
    insertNotificacao({
      canal: 'whatsapp',
      tipo: meta.tipo || 'manual',
      modulo: meta.modulo || null,
      titulo: meta.titulo || null,
      mensagem: message,
      destinatario_nome: meta.destinatario_nome ?? null,
      destinatario_telefone: fone || null,
      setor: meta.setor ?? null,
      loja: meta.loja ?? null,
      referencia_id: meta.referencia_id ?? null,
      status: ok ? 'enviado' : 'falha',
      erro,
      created_by: meta.created_by ?? null,
    }).catch(() => {})
  }
  return ok
}
