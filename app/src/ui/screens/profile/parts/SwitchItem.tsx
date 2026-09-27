import { SwitchRow, type SwitchRowProps } from './Switch.tsx'

/** A switch row inside a <ListGroup>, with the list's inset divider (DESIGN §8.5, §8.23). */
export function SwitchItem(props: SwitchRowProps) {
  return (
    <li className="relative [&:first-child>[data-divider]]:hidden">
      <span data-divider aria-hidden="true" className={`absolute top-0 right-4 h-px bg-line court:h-0.5 ${props.leading ? 'left-[68px]' : 'left-4'}`} />
      <SwitchRow {...props} />
    </li>
  )
}
