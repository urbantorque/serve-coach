import { Component, type ErrorInfo, type ReactNode } from 'react'
import { clearSessions, safely } from '../lib/storage/db'
import { Icon } from './primitives'

interface Props {
  children: ReactNode
}

interface State {
  error?: Error
  clearing: boolean
  cleared: boolean
}

/**
 * Last line of defence against a white screen.
 *
 * The likeliest cause is a saved report written by an older version of the app,
 * which is exactly the case where an unrecoverable blank page is worst: the data
 * lives on the device, so it fails again on every reload, and a dead render
 * cannot offer to delete it. `normalise` in the storage layer should catch that
 * first — this catches whatever it did not, and always leaves a way out.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { clearing: false, cleared: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry to send it to — the app has no server — so leave it in the
    // console where it is at least findable.
    console.error('Serve Coach hit an unrecoverable render error:', error, info.componentStack)
  }

  private reset = () => window.location.reload()

  private clearAndReload = async () => {
    this.setState({ clearing: true })
    await safely(clearSessions, undefined)
    this.setState({ cleared: true })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="shell">
        <div className="screen empty">
          <div className="empty-inner">
            <span className="empty-mark">
              <Icon name="warn" size={26} />
            </span>
            <h1>Something in the app broke</h1>
            <p className="empty-lead">
              Nothing of yours was sent anywhere — this all happens on your device. Reloading
              usually fixes it.
            </p>
            <button className="btn btn--primary btn--full" onClick={this.reset}>
              Reload the app
            </button>
            <button
              className="btn btn--ghost btn--full"
              onClick={() => void this.clearAndReload()}
              disabled={this.state.clearing}
            >
              {this.state.clearing ? 'Clearing…' : 'Clear saved reports and reload'}
            </button>
            <p className="fineprint">
              Clearing removes your saved reports from this device. Your videos were never
              stored, so nothing else is lost.
            </p>
            <details className="error-detail">
              <summary>Technical detail</summary>
              <pre>{this.state.error.message}</pre>
            </details>
          </div>
        </div>
      </div>
    )
  }
}
