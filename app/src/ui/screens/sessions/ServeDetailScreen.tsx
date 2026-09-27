import { useParams } from 'react-router'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Serve detail (DESIGN §10.7, §8.9 to §8.11): annotated playback, phase timeline, key frames, stat drawer. Full screen. */
export function ServeDetailScreen() {
  const { sessionId = '', serveId = '' } = useParams()
  const index = /(\d+)$/.exec(serveId)?.[1]
  return (
    <StubScreen
      title={index ? `Serve ${Number(index)}` : 'Serve'}
      back={{ to: paths.sessionReport(sessionId), label: 'Report' }}
      purpose="Watch one serve with its overlay, step frame by frame, jump between phases and read the values for this serve. Works from key frames when the video was deleted."
      specs={['DESIGN §10.7', 'DESIGN §8.9 to §8.11', 'PRODUCT §6.6']}
    />
  )
}
