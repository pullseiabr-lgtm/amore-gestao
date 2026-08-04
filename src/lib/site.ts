// Origem pública para LINKS compartilháveis (relatórios, requisições, pedidos, cotações).
// Nunca usar a URL *.vercel.app (preview), que é protegida pelo login da Vercel e mostra
// "Log in to Vercel" para fornecedores/usuários. Se o painel for aberto por um domínio
// de preview, os links caem no domínio oficial.
export const CANONICAL_ORIGIN = 'https://painel.amorefood.com.br'

export function siteOrigin(): string {
  try {
    return /vercel\.app$/i.test(location.hostname) ? CANONICAL_ORIGIN : location.origin
  } catch {
    return CANONICAL_ORIGIN
  }
}
