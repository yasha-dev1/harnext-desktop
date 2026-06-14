import { useEffect, useState } from 'react'

/**
 * Re-render the calling component on a fixed interval so that relative-time
 * helpers (timeAgo / timeUntil in lib/ui.ts, which read Date.now() internally)
 * re-evaluate on their own instead of freezing until an unrelated re-render.
 *
 * 30s granularity is plenty for the Xm/Xh resolution those helpers use.
 * Returns the current timestamp for callers that want to read it directly.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
