import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { useToastStore } from '../../data/stores/toast.ts'
import { cx } from './cx.ts'

/**
 * Toast viewport (DESIGN §8.19). Render once in the app shell; show toasts with
 * `useToastStore.getState().show({ message, action })` or `showToast()`. Level 4 inverse surface,
 * radius 20, 12 px above the tab bar (or the safe area), max 2 lines, 4 s (8 s with an action such as
 * Undo). role="status": announced politely.
 */
export function ToastViewport({ aboveTabBar = true }: { aboveTabBar?: boolean }) {
  const current = useToastStore((s) => s.queue[0])
  const dismiss = useToastStore((s) => s.dismiss)
  const reduce = useReducedMotion()

  useEffect(() => {
    if (!current) return
    const t = window.setTimeout(() => dismiss(current.id), current.durationMs)
    return () => window.clearTimeout(t)
  }, [current, dismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'pointer-events-none fixed inset-x-0 z-(--z-toast) flex justify-center gutter',
        aboveTabBar ? 'bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+12px)]' : 'bottom-[calc(env(safe-area-inset-bottom)+12px)]',
      )}
    >
      <AnimatePresence>
        {current ? (
          <motion.div
            key={current.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.16 }}
            className="pointer-events-auto flex w-full max-w-[350px] items-center gap-3 rounded-card bg-surface-inverse p-4 text-callout text-ink-inverse"
          >
            <span className="line-clamp-2 flex-1">{current.message}</span>
            {current.action ? (
              <button
                type="button"
                onClick={() => {
                  current.action?.onPress()
                  dismiss(current.id)
                }}
                className="-my-3 -mr-2 h-11 shrink-0 rounded-control px-2 font-strong text-ink-inverse underline underline-offset-[3px]"
              >
                {current.action.label}
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
