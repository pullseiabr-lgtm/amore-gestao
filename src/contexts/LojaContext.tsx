import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

interface LojaContextValue {
  /** Loja ativa selecionada — usa profile.loja para usuários sem permissão multi-loja */
  loja: string
  /** Só disponível para admin/super_admin */
  setLoja: (l: string) => void
  /** Lista de lojas disponíveis (do perfil ou 'Todas as Lojas') */
  lojas: string[]
  /** true se o usuário pode trocar de loja */
  multiLoja: boolean
}

const LojaContext = createContext<LojaContextValue>({
  loja: 'Todas as Lojas',
  setLoja: () => {},
  lojas: [],
  multiLoja: false,
})

export function LojaProvider({ stores, children }: { stores: string[]; children: React.ReactNode }) {
  const { user } = useAuth()

  const multiLoja = user?.role === 'super_admin' || user?.role === 'admin'

  // Admin começa com 'Todas as Lojas'; demais usuários ficam na loja do perfil
  const profileLoja = user?.loja && !['Todas', 'Todas as Lojas', ''].includes(user.loja)
    ? user.loja
    : 'Todas as Lojas'

  const [selected, setSelected] = useState<string>(
    multiLoja ? 'Todas as Lojas' : profileLoja
  )

  // Re-sincroniza quando o user muda (troca de conta)
  useEffect(() => {
    if (multiLoja) {
      setSelected('Todas as Lojas')
    } else {
      setSelected(profileLoja)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const loja = multiLoja ? selected : profileLoja

  return (
    <LojaContext.Provider value={{
      loja,
      setLoja: (l: string) => { if (multiLoja) setSelected(l) },
      lojas: stores,
      multiLoja,
    }}>
      {children}
    </LojaContext.Provider>
  )
}

export const useLoja = () => useContext(LojaContext)
