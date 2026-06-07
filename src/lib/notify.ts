// ── Notificações WhatsApp via Z-API ──────────────────────────────
// Helper compartilhado pelos módulos (Tarefas, Compras, Cotações...).
// A config do Z-API fica em localStorage 'zapi_cfg' (definida na tela Liz → WhatsApp).
// O envio passa pelo proxy /api/zapi-send para evitar CORS.

export type ZapiCfg = { instance?: string; token?: string; clientToken?: string; recipients?: string }

export function getZapiCfg(): ZapiCfg {
  try { return JSON.parse(localStorage.getItem('zapi_cfg') || '{}') } catch { return {} }
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
export async function enviarWhatsApp(phone: string, message: string, cfg?: ZapiCfg): Promise<boolean> {
  try {
    const c = cfg || getZapiCfg()
    const fone = soDigitos(phone)
    if (!c.instance || !c.token || !fone || !message) return false
    const r = await fetch('/api/zapi-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance: c.instance, token: c.token, clientToken: c.clientToken, phone: fone, message }),
    })
    return r.ok
  } catch { return false }
}
