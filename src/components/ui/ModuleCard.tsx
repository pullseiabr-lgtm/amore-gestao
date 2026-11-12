import type { ReactNode } from 'react'

/**
 * Padrão visual Amore: cartão de módulo pastel, cantos arredondados, sombra discreta.
 * Reutilizável em qualquer tela (home, páginas-índice, novos módulos).
 *
 * Pastéis oficiais (tokens em index.css): rosa, coral, areia, verde, dourado, cinza.
 */
export type Pastel = 'rosa' | 'coral' | 'areia' | 'verde' | 'dourado' | 'cinza'

export const PASTEL_BG: Record<Pastel, string> = {
  rosa: 'var(--pastel-rosa)',
  coral: 'var(--pastel-coral)',
  areia: 'var(--pastel-areia)',
  verde: 'var(--pastel-verde)',
  dourado: 'var(--pastel-dourado)',
  cinza: 'var(--pastel-cinza)',
}

// Cor do ícone: tom mais escuro do mesmo pastel (contraste ok sobre o fundo claro)
export const PASTEL_FG: Record<Pastel, string> = {
  rosa: '#B4533F',
  coral: '#B4533F',
  areia: '#8F6A3E',
  verde: '#3C7A4F',
  dourado: '#A67B14',
  cinza: '#4B5563',
}

interface ModuleCardProps {
  titulo: string
  descricao: string
  icone: ReactNode
  cor: Pastel
  onClick: () => void
}

export function ModuleCard({ titulo, descricao, icone, cor, onClick }: ModuleCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="module-card"
      style={{ background: PASTEL_BG[cor] }}
    >
      <span className="module-card-ico" style={{ color: PASTEL_FG[cor] }}>{icone}</span>
      <span className="module-card-tt">{titulo}</span>
      <span className="module-card-ds">{descricao}</span>
    </button>
  )
}

/** Título de seção padrão das telas (uniformiza espaçamento e tipografia). */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '26px 0 12px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{children}</h2>
      {aside}
    </div>
  )
}
