import { ShieldCheckIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '../../ui/components/index.ts'
import { readStorageStatus, requestPersistence, STORAGE_CHANGED_EVENT, storageEstimateLine, type PersistResult, type StorageStatus } from '../storage.ts'

/**
 * Storage and privacy additions (ARCHITECTURE §8.1): what the browser allows this app to store and how
 * much is used, and, while the data is not protected from automatic clean-up, a way to ask again. The
 * "Protected from automatic clean-up" line above it stays the screen's own.
 */
export function StorageProtection() {
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<PersistResult | null>(null)

  useEffect(() => {
    let live = true
    const load = () =>
      void readStorageStatus().then((s) => {
        if (live) setStatus(s)
      })
    load()
    window.addEventListener(STORAGE_CHANGED_EVENT, load)
    return () => {
      live = false
      window.removeEventListener(STORAGE_CHANGED_EVENT, load)
    }
  }, [])

  if (!status) return null
  const ask = async () => {
    setAsking(true)
    setAnswer(await requestPersistence('storage-screen'))
    setAsking(false)
  }

  return (
    <div className="flex flex-col gap-2" data-storage-protection>
      <p className="text-footnote tabular-nums text-ink-2">{storageEstimateLine(status)}</p>
      {status.canPersist && status.persisted === false ? (
        <>
          <p className="text-footnote text-ink-2">
            {answer === 'denied'
              ? 'This browser said no for now. It decides by its own rules; adding Serve Coach to your Home Screen usually helps.'
              : 'You can ask this browser again to keep Serve Coach from being cleared.'}
          </p>
          <Button variant="secondary" compact icon={ShieldCheckIcon} onClick={() => void ask()} loading={asking}>
            Ask to protect
          </Button>
        </>
      ) : null}
    </div>
  )
}
