import { FilmReelIcon } from '@phosphor-icons/react'
import { Button, ListGroup, ListRow, RowIcon } from '../../components/index.ts'
import { paths } from '../../shell/paths.ts'
import { StubScreen } from '../StubScreen.tsx'

/** Record tab root, R1 set-up (DESIGN §10.3, PRODUCT §6.3.1 to §6.3.2): session plan, block card, then "Set up camera". */
export function RecordScreen() {
  return (
    <StubScreen
      title="Record"
      variant="root"
      purpose="Choose a session plan and describe the block, then set up the camera. The body check runs before every recording."
      specs={['DESIGN §10.3 R1', 'PRODUCT §6.3']}
      bottomAction={<Button to={paths.setupChoice()}>Set up camera</Button>}
    >
      <ListGroup label="Other ways to start">
        <ListRow
          to={paths.importVideo()}
          leading={
            <RowIcon>
              <FilmReelIcon size={24} aria-hidden="true" />
            </RowIcon>
          }
          title="Import a video"
        />
      </ListGroup>
    </StubScreen>
  )
}
