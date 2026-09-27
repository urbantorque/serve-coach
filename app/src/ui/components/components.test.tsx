import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MetricValue as MetricValueData } from '../../analysis/types.ts'
import { useToastStore } from '../../data/stores/toast.ts'
import {
  Button,
  EmptyState,
  EvidenceTierChip,
  MetricTile,
  MetricValue,
  ProgressStages,
  SegmentedControl,
  Sheet,
  StatusChip,
  TabBar,
  ToastViewport,
  UnavailableRow,
  VerdictChip,
} from './index.ts'
import { VideoCameraIcon } from '@phosphor-icons/react'

const est: MetricValueData = {
  id: 'rhythm-release-to-contact',
  value: 920,
  unit: 'ms',
  status: 'estimated',
  confidence: 0.8,
  basis: 'test',
  n: 12,
  nEligible: 14,
  uncertainty: { kind: 'ci95', low: 880, high: 980 },
}

describe('StatusChip', () => {
  it('shows glyph and word for every state, never colour alone', () => {
    render(
      <>
        <StatusChip status="measured" />
        <StatusChip status="estimated" />
        <StatusChip status="player-entered" />
        <StatusChip status="experimental" />
        <StatusChip status="unavailable" />
      </>,
    )
    for (const word of ['Measured', 'Estimate', 'You logged', 'Experimental', 'Not available']) {
      expect(screen.getByText(word)).toBeInTheDocument()
    }
    expect(document.querySelector('[data-status="experimental"]')?.className).toContain('border-dashed')
    expect(document.querySelector('[data-status="player-entered"]')?.className).toContain('border-solid')
  })

  it('the compact chip keeps an accessible name; the tappable chip is a button', async () => {
    const onOpen = vi.fn()
    render(
      <>
        <StatusChip status="estimated" compact />
        <StatusChip status="experimental" onOpenInfo={onOpen} />
      </>,
    )
    expect(screen.getByText('Estimate')).toHaveClass('sr-only')
    await userEvent.click(screen.getByRole('button', { name: /Experimental/ }))
    expect(onOpen).toHaveBeenCalled()
  })
})

describe('MetricValue', () => {
  it('refuses to render a number without a status (throws in development)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bad = { ...est, status: undefined } as unknown as MetricValueData
    expect(() => render(<MetricValue metricId="rhythm-release-to-contact" value={bad} />)).toThrow(/no status/)
    spy.mockRestore()
  })

  it('renders an estimate with ≈, its chip, data attributes and a spoken sentence', () => {
    render(<MetricValue metricId="rhythm-release-to-contact" value={est} detail />)
    const el = document.querySelector('[data-metric="rhythm-release-to-contact"]')
    expect(el).toHaveAttribute('data-status', 'estimated')
    expect(el?.textContent).toContain('≈')
    expect(el?.textContent).toContain('0.92')
    expect(el?.querySelector('.text-footnote')?.textContent).toBe('likely 0.88 to 0.98 s')
    expect(screen.getByText(/Toss-to-hit time, about 0.92 seconds, Estimate/)).toHaveClass('sr-only')
  })

  it('an unavailable value shows its reason and no number', () => {
    render(<MetricValue metricId="knee-bend-band" value={{ id: 'knee-bend-band', value: null, unit: 'band', status: 'unavailable', confidence: 0, basis: '', reasonCode: 'NEEDS_REAR_VIEW' }} />)
    const el = document.querySelector('[data-metric="knee-bend-band"]')
    expect(el?.textContent).toContain('Needs a view from behind')
    expect(el?.textContent).not.toMatch(/\d/)
  })
})

describe('MetricTile', () => {
  it('is one tap target whose accessible name is the full sentence', () => {
    render(
      <MemoryRouter>
        <MetricTile metricId="rhythm-release-to-contact" value={est} usual="0.88 to 0.98 s" to="/metric/rhythm-release-to-contact" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAccessibleName(/Toss-to-hit time, about 0.92 seconds, Estimate/)
    expect(link).toHaveAccessibleName(/usual range 0.88 to 0.98 s/)
    expect(link).toHaveAttribute('data-status', 'estimated')
    expect(within(link).getByText('Estimate')).toBeInTheDocument()
    expect(within(link).getByText('12 of 14 serves')).toBeInTheDocument()
  })

  it('shows "Early read" for provisional values', () => {
    render(<MetricTile metricId="rhythm-release-to-contact" value={{ ...est, provisional: true }} />)
    expect(screen.getByText('Early read')).toBeInTheDocument()
  })
})

describe('UnavailableRow', () => {
  it('is a ghost row with the reason, never a dash', () => {
    render(
      <MemoryRouter>
        <ul>
          <UnavailableRow metricId="knee-bend-band" reasonCode="NEEDS_REAR_VIEW" to="/metric/knee-bend-band" />
        </ul>
      </MemoryRouter>,
    )
    const row = document.querySelector('[data-metric="knee-bend-band"]')
    expect(row).toHaveAttribute('data-status', 'unavailable')
    expect(row?.textContent).toContain('Knee bend')
    expect(row?.textContent).toContain('Needs a view from behind')
    expect(row?.textContent).not.toMatch(/[-–—]\s*$/)
  })
})

describe('Chips', () => {
  it('verdicts use the DESIGN §3.5 words, whatever spec spelling arrives', () => {
    render(
      <>
        <VerdictChip verdict="clear-improvement" />
        <VerdictChip verdict="too-early-to-tell" size="large" />
        <VerdictChip verdict="likely-worse" />
      </>,
    )
    expect(screen.getByText('Clearly better')).toBeInTheDocument()
    expect(screen.getByText('Too early to tell')).toBeInTheDocument()
    expect(screen.getByText('Likely worse')).toBeInTheDocument()
  })

  it('evidence tiers name themselves', () => {
    render(<EvidenceTierChip tier="coach-recommended" />)
    expect(screen.getByText('Coaches recommend')).toBeInTheDocument()
  })
})

describe('Button', () => {
  it('disabled buttons stay focusable, are aria-disabled and do nothing', async () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Continue
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Continue' })
    expect(b).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('loading replaces the label with "Saving…" and no spinner', () => {
    render(<Button loading>Save log</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Saving…')
  })
})

describe('SegmentedControl', () => {
  function Harness() {
    const [v, setV] = useState<'side' | 'ghost'>('side')
    return (
      <SegmentedControl
        label="Compare view"
        value={v}
        onChange={setV}
        options={[
          { value: 'side', label: 'Side by side' },
          { value: 'ghost', label: 'Ghost' },
        ]}
      />
    )
  }
  it('is a radio group with arrow-key selection', async () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Compare view' })
    const [a, b] = within(group).getAllByRole('radio')
    expect(a).toHaveAttribute('aria-checked', 'true')
    a.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(b).toHaveAttribute('aria-checked', 'true')
    expect(b).toHaveFocus()
  })
})

describe('Sheet', () => {
  function Harness({ dismissible = true }: { dismissible?: boolean }) {
    const [open, setOpen] = useState(false)
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} title="Quick body check" dismissible={dismissible}>
          <button type="button">All good</button>
          <button type="button">It hurts</button>
        </Sheet>
      </div>
    )
  }

  it('is a labelled modal dialog; Escape closes it and focus returns to the trigger', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Quick body check' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('traps focus inside while open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog')
    const buttons = within(dialog).getAllByRole('button')
    buttons.at(-1)?.focus()
    await userEvent.tab()
    expect(buttons[0]).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(buttons.at(-1)).toHaveFocus()
  })

  it('a non-dismissible sheet ignores Escape', async () => {
    render(<Harness dismissible={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('TabBar', () => {
  it('four tabs in D10 order, the current one marked with aria-current', () => {
    const router = createMemoryRouter([{ path: '*', element: <TabBar /> }], { initialEntries: ['/sessions'] })
    render(<RouterProvider router={router} />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Today', 'Record', 'Sessions', 'Progress'])
    expect(within(nav).getByRole('link', { name: 'Sessions' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current')
  })
})

describe('ProgressStages', () => {
  it('reports determinate progress, never an indeterminate spinner', () => {
    render(
      <ProgressStages
        overall={0.64}
        stages={[
          { id: 'a', label: 'Finding serves', state: 'done', detail: '14 found' },
          { id: 'b', label: 'Tracking the toss', state: 'active', fraction: 0.5 },
          { id: 'c', label: 'Timing each phase', state: 'waiting' },
        ]}
      />,
    )
    expect(screen.getByRole('progressbar', { name: 'Analysis progress' })).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByText('14 found')).toBeInTheDocument()
  })
})

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
    useToastStore.setState({ queue: [] })
  })

  it('announces politely and dismisses itself after 4 s (8 s with an action)', () => {
    vi.useFakeTimers()
    render(<ToastViewport />)
    act(() => {
      useToastStore.getState().show({ message: 'Practice logged' })
    })
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Practice logged')
    act(() => {
      vi.advanceTimersByTime(4100)
    })
    expect(useToastStore.getState().queue).toHaveLength(0)
    act(() => {
      useToastStore.getState().show({ message: 'Serve deleted.', action: { label: 'Undo', onPress: () => undefined } })
    })
    expect(useToastStore.getState().queue[0].durationMs).toBe(8000)
  })
})

describe('EmptyState', () => {
  it('has a title, a short body and one action', () => {
    render(<EmptyState icon={VideoCameraIcon} title="No sessions yet" body="Your sessions will appear here." action={<Button variant="secondary">Go to Record</Button>} />)
    expect(screen.getByRole('heading', { name: 'No sessions yet' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
