import { useState, useEffect } from 'react'

/**
 * useDebounce — atrasa a atualização de um valor até que o usuário
 * pare de digitar por `delay` ms. Evita re-renderizações excessivas
 * e consultas desnecessárias ao Supabase durante a digitação.
 *
 * @param value  Valor a ser "debounced"
 * @param delay  Atraso em ms (padrão: 300ms)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
