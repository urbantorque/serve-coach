/** What the app calls the device it is on (N3.4). */
import { deviceNoun } from '../device'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

heading('A laptop isn’t told it is a phone')

check('a fine pointer is a computer, whatever the screen', () => {
  assert(deviceNoun({ coarse: false, shortSide: 390 }) === 'computer', 'a mouse on a small window was a phone')
  assert(deviceNoun({ coarse: false, shortSide: 1440 }) === 'computer', 'a laptop wasn’t a computer')
})

check('a touch screen is a phone when small and a tablet when large', () => {
  assert(deviceNoun({ coarse: true, shortSide: 390 }) === 'phone', 'a phone wasn’t a phone')
  assert(deviceNoun({ coarse: true, shortSide: 820 }) === 'tablet', 'a tablet wasn’t a tablet')
})

check('with no window to ask, it is a phone, so the suite reads every line as before', () => {
  assert(deviceNoun({}) === 'phone', 'no window wasn’t a phone')
  assert(deviceNoun() === 'phone', 'the suite isn’t told phone')
})

report()
