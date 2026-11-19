import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearSessions, safely } from '../lib/storage/db'
import { deviceNoun } from '../lib/device'

interface Props {
  children: ReactNode
}

interface State {
  error?: Error
  clearing: boolean
  cleared: boolean
  /** "Clear" was pressed once and is waiting to be meant (L6.8). */
  confirming: boolean
  backup: BackupState
}

type BackupState = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Last line of defence against a white screen.
 *
 * The likeliest cause is a saved report written by an older version of the app,
 * which is exactly the case where an unrecoverable blank page is worst: the data
 * lives on the device, so it fails again on every reload, and a dead render
 * cannot offer to delete it. `normalise` in the storage layer should catch that
 * first — this catches whatever it did not, and always leaves a way out.
 *
 * And a way to keep the history before taking it (L6.8): the way out deleted
 * every report on one tap. Now a backup comes first, read straight from the
 * database (`rawBackup.ts`), and deleting asks once more.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { clearing: false, cleared: false, confirming: false, backup: 'idle' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry to send it to — the app has no server — so leave it in the
    // console where it is at least findable.
    console.error('Serve Coach hit an unrecoverable render error:', error, info.componentStack)
  }

  private reset = () => window.location.reload()

  private saveBackup = async () => {
    this.setState({ backup: 'saving' })
    try {
      const { saveRawBackup } = await import('../lib/storage/rawBackup')
      await saveRawBackup()
      this.setState({ backup: 'saved' })
    } catch {
      this.setState({ backup: 'failed' })
    }
  }

  private clearAndReload = async () => {
    this.setState({ clearing: true })
    await safely(clearSessions, undefined)
    this.setState({ cleared: true })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <CrashScreen
        message={this.state.error.message}
        backup={this.state.backup}
        confirming={this.state.confirming}
        clearing={this.state.clearing}
        onReload={this.reset}
        onBackup={() => void this.saveBackup()}
        onClear={() => this.setState({ confirming: true })}
        onConfirmClear={() => void this.clearAndReload()}
        onKeep={() => this.setState({ confirming: false })}
      />
    )
  }
}

/** The screen itself, apart from the boundary, so it can be rendered in a test. */
export function CrashScreen(p: {
  message: string
  backup: BackupState
  confirming: boolean
  clearing: boolean
  onReload: () => void
  onBackup: () => void
  onClear: () => void
  onConfirmClear: () => void
  onKeep: () => void
}) {
  return (
    <div className="shell">
      <div className="screen problem">
        <div className="problem-text">
          <span className="next-label problem-kicker">Sorry about this</span>
          <h1 className="t-display">Something in the app broke</h1>
          <p>Your serves are safe on this {deviceNoun()}, and nothing was sent anywhere. Reloading usually fixes it.</p>
        </div>
        <div className="problem-actions">
          <button className="btn btn--primary btn--big btn--full" onClick={p.onReload}>
            Reload the app
          </button>
          <button className="btn btn--quiet btn--full" onClick={p.onBackup} disabled={p.backup === 'saving'}>
            {p.backup === 'saving'
              ? 'Saving…'
              : p.backup === 'saved'
                ? 'Backup saved'
                : p.backup === 'failed'
                  ? 'The backup failed. Try again'
                  : 'Save a backup first'}
          </button>
          <details className="problem-more" open={p.confirming}>
            <summary>Still broken?</summary>
            {p.confirming ? (
              <>
                <p role="alert">
                  This deletes every saved report on this {deviceNoun()}, and any videos kept with them.
                  {p.backup === 'saved' ? ' Your backup file can bring them back.' : ' Save a backup first if you can.'}
                </p>
                <button className="btn btn--quiet btn--full" onClick={p.onConfirmClear} disabled={p.clearing}>
                  {p.clearing ? 'Clearing…' : 'Delete them and reload'}
                </button>
                <button className="btn btn--quiet btn--full" onClick={p.onKeep} disabled={p.clearing}>
                  Keep them
                </button>
              </>
            ) : (
              <button className="btn btn--quiet btn--full" onClick={p.onClear}>
                Clear saved reports and reload
              </button>
            )}
            <p className="problem-detail">{p.message}</p>
          </details>
        </div>
      </div>
    </div>
  )
}
