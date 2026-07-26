import { useCallback, useEffect, useState } from 'react'

export function useAppData() {
  const [, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  useEffect(() => {
    window.addEventListener('recall-plus:data-change', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('recall-plus:data-change', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])
  return refresh
}
