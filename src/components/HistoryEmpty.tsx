interface Props {
  /** Pick a clip, through the first-run guide where the hand is not set yet. */
  onAnalyse: () => void
  onExample: () => void
}

/**
 * The history sheet with nothing in it (N0.5).
 *
 * It used to end in one grey sentence. A first look at "Your serves" is the
 * moment a player is deciding whether to start, so it offers the same two ways
 * in that Home does.
 */
export default function HistoryEmpty({ onAnalyse, onExample }: Props) {
  return (
    <div className="sheet-empty">
      <p>No serves yet. Every report you get lands here.</p>
      <div className="sheet-empty-actions">
        <button className="btn btn--primary btn--full" onClick={onAnalyse}>
          Analyse a serve
        </button>
        <button className="btn btn--ghost btn--full" onClick={onExample}>
          See an example report
        </button>
      </div>
    </div>
  )
}
