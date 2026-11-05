import { ATTRIBUTION } from '../lib/figure/modelCredit'

/**
 * Whose work is in here. The motion data's licence asks for this, and the rest
 * is owed anyway.
 */
export default function Credits() {
  return (
    <details className="credits">
      <summary>Credits</summary>
      <p>{ATTRIBUTION}</p>
      <p>Archivo, by the Archivo Project Authors, under the SIL Open Font License.</p>
      <p>Icons from Phosphor, MIT licence.</p>
    </details>
  )
}
