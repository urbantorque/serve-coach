/**
 * The glance read aloud (D6.2): which voice reads it, and that no voice but an
 * on-device one ever does.
 */
import { pickLocalVoice, type VoiceInfo } from '../speech'
import { assert, check, heading, report } from '../analysis/__tests__/harness'

const voice = (lang: string, localService: boolean, isDefault = false): VoiceInfo & { name: string } => ({
  name: `${lang}${localService ? '' : ' (online)'}`,
  lang,
  localService,
  default: isDefault,
})

heading('Which voice reads the glance')

check('a remote voice is never chosen, even when it is the default and the only match', () => {
  const remote = [voice('en-GB', false, true), voice('en-US', false)]
  assert(pickLocalVoice(remote, 'en-GB') === undefined, 'a voice that sends the text away was chosen')
  const mixed = [voice('en-GB', false, true), voice('fr-FR', true)]
  assert(pickLocalVoice(mixed, 'en-GB')?.localService === true, 'a local voice was passed over for a remote one')
})

check("the player's language and region first, then their language, then the device default", () => {
  const voices = [voice('fr-FR', true, true), voice('en-US', true), voice('en-GB', true), voice('en-GB', false)]
  assert(pickLocalVoice(voices, 'en-GB')?.lang === 'en-GB', 'the exact region wasn’t preferred')
  assert(pickLocalVoice(voices, 'en-AU')?.lang === 'en-US', 'the language in another region wasn’t next')
  assert(pickLocalVoice(voices, 'de-DE')?.lang === 'fr-FR', 'the device default wasn’t the fallback')
  assert(pickLocalVoice([], 'en-GB') === undefined, 'a voice was found where there are none')
})

report()
