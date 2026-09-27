import { useEffect, useState } from 'react'

/** Becomes true after `ms` milliseconds (DESIGN §8.17: skeletons appear only after 150 ms). */
export function useDelayedFlag(ms: number): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setOn(true), ms)
    return () => window.clearTimeout(t)
  }, [ms])
  return on
}
