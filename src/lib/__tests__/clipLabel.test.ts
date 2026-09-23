/** The analysing screen names a clip the way a person would, not the camera. */
import { clipLabel } from '../clipLabel'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

heading('A clip is named for a person, not by the camera')

check('camera names become "Your clip"', () => {
  for (const name of [
    'VID_20260923_174512.mp4',
    'PXL_20260923_174512345.mp4',
    'IMG_4821.MOV',
    'trim.4F2A1B.MOV',
    'Screen Recording 2026-09-23 at 17.45.mp4',
    '20260923_174512.mp4',
    'recording.webm'.replace('recording', ''),
  ]) {
    assert(clipLabel(name) === 'Your clip', `"${name}" showed as "${clipLabel(name)}"`)
  }
})

check('a name somebody chose is kept, without its extension', () => {
  assert(clipLabel('first serves tuesday.mp4') === 'first serves tuesday', clipLabel('first serves tuesday.mp4'))
  assert(clipLabel('kick serve.mov') === 'kick serve', clipLabel('kick serve.mov'))
})

report()
