import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChartFrame } from './ChartFrame.tsx'
import { IntervalBars } from './IntervalBars.tsx'
import { PlacementMap } from './PlacementMap.tsx'
import { Sparkline } from './Sparkline.tsx'
import { StripPlot } from './StripPlot.tsx'
import { TossScatter } from './TossScatter.tsx'
import { WilsonBar } from './WilsonBar.tsx'

// Static plots are role=img; plots you can move through with the arrow keys are role=application
// (aria-roledescription chart) with key help, so screen readers pass the keys through.
const svgOf = (name: RegExp) => screen.queryByRole('application', { name }) ?? screen.getByRole('img', { name })

describe('charts render accessible SVG (role img + data summary)', () => {
  it('Sparkline: band, latest label, keyboard selection announces the callout', () => {
    const onOpen = vi.fn()
    render(
      <Sparkline
        label="Toss spread over 3 sessions"
        band={[12, 15]}
        latestLabel="≈ 11 cm"
        onOpen={onOpen}
        points={[
          { key: 'a', value: 15, label: '12 Sep', callout: '15 cm · 12 Sep' },
          { key: 'b', value: 13, label: '19 Sep', callout: '13 cm · 19 Sep' },
          { key: 'c', value: 11, label: '26 Sep', callout: '11 cm · 26 Sep' },
        ]}
      />,
    )
    const svg = svgOf(/Toss spread over 3 sessions/)
    // Interactive: an application with key help, so screen readers pass the arrow keys through.
    expect(svg.getAttribute('role')).toBe('application')
    expect(svg.getAttribute('aria-roledescription')).toBe('chart')
    expect(svg).toHaveAccessibleDescription(/arrow keys to move between points, Enter to open/)
    expect(svg).toHaveTextContent('usual')
    expect(svg).toHaveTextContent('≈ 11 cm')
    fireEvent.keyDown(svg, { key: 'ArrowRight' })
    expect(screen.getByText('15 cm · 12 Sep', { selector: '[aria-live]' })).toBeInTheDocument()
    fireEvent.keyDown(svg, { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith('a')
    fireEvent.keyDown(svg, { key: 'Escape' })
    expect(document.querySelector('[aria-live]')?.textContent).toBe('')
  })

  it('StripPlot: one mark per serve in the outcome vocabulary, median label and unit on the last tick', () => {
    render(
      <StripPlot
        label="Toss height, 4 serves"
        domain={[3, 3.6]}
        unit="m"
        rows={[
          {
            key: 'r',
            median: 3.3,
            medianLabel: 'middle 3.30 m',
            data: [
              { id: '1', value: 3.2, kind: 'in', callout: 'a' },
              { id: '2', value: 3.3, kind: 'net', callout: 'b' },
              { id: '3', value: 3.4, kind: 'long', callout: 'c' },
              { id: '4', value: 3.3, kind: 'untagged', callout: 'd' },
            ],
          },
        ]}
      />,
    )
    const svg = svgOf(/Toss height, 4 serves/)
    expect(svg.querySelectorAll('[data-mark]')).toHaveLength(4)
    expect(svg.querySelector('[data-mark="net"] polygon')).toBeTruthy()
    expect(svg).toHaveTextContent('middle 3.30 m')
    // Ticks print exactly (3.25, never a rounded 3.3) with the unit on the last one.
    expect(svg).toHaveTextContent(/3\.25/)
    expect(svg).toHaveTextContent(/3\.50 m/)
  })

  it('TossScatter: front-toe reference, usual area, centroid and one mark per toss', () => {
    render(
      <TossScatter
        label="Toss map, 3 serves"
        usual={{ cx: 25, cy: 330, rx: 10, ry: 14, angle: 0 }}
        centroid={{ xCm: 25, yCm: 330 }}
        points={[
          { id: 'a', xCm: 20, yCm: 320, kind: 'in', callout: 'a' },
          { id: 'b', xCm: 30, yCm: 340, kind: 'wide', callout: 'b' },
          { id: 'c', xCm: 25, yCm: 335, kind: 'in', extrapolated: { lowCm: 320, highCm: 350 }, callout: 'c' },
        ]}
      />,
    )
    const svg = svgOf(/Toss map, 3 serves/)
    expect(svg).toHaveTextContent('Front toe')
    expect(svg).toHaveTextContent('usual')
    expect(svg).toHaveTextContent('Into court →')
    expect(svg.querySelectorAll('[data-mark]')).toHaveLength(3)
    expect(svg.querySelector('ellipse')).toBeTruthy()
  })

  it('PlacementMap: deuce reads Wide | Body | T and says it is a schematic via its summary', () => {
    render(
      <PlacementMap
        side="deuce"
        label="Service box schematic, 4 tagged serves"
        serves={[
          { id: '1', outcome: 'in', zone: 'T', callout: 'In' },
          { id: '2', outcome: 'in', zone: 'T', callout: 'In' },
          { id: '3', outcome: 'net', zone: 'body', callout: 'Net' },
          { id: '4', outcome: 'in', callout: 'In' },
        ]}
      />,
    )
    const svg = svgOf(/Service box schematic/)
    const labels = [...svg.querySelectorAll('text')].map((t) => t.textContent)
    expect(labels.indexOf('Wide')).toBeLessThan(labels.indexOf('T'))
    expect(svg).toHaveTextContent('In, zone not logged: 1')
    // Three placed serves plus the mark beside "In, zone not logged".
    expect(svg.querySelectorAll('[data-mark]')).toHaveLength(4)
  })

  it('IntervalBars: before and after with nested bars and the about-the-same zone', () => {
    render(
      <IntervalBars
        label="Before 17 cm, after 11 cm"
        domain={[5, 25]}
        sameZone={[14.5, 20]}
        unit="cm"
        directionLabel="← Steadier"
        rows={[
          { key: 'b', label: 'Before', tone: 'neutral', estimate: 17, ci95: [13, 23], ci80: [14.5, 21], callout: '17 cm' },
          { key: 'a', label: 'After', tone: 'good', estimate: 11, ci95: [8.5, 15], ci80: [9.5, 13.5], callout: '11 cm', units: ['in', 'in', 'net'] },
        ]}
      />,
    )
    const svg = svgOf(/Before 17 cm, after 11 cm/)
    expect(svg).toHaveTextContent('About the same')
    expect(svg).toHaveTextContent('← Steadier')
    expect(svg.querySelectorAll('[data-mark]')).toHaveLength(3)
  })

  it('WilsonBar is an image with its range in words', () => {
    render(<WilsonBar rate={0.6} low={0.4} high={0.77} label="Likely 40 to 77 percent" />)
    expect(svgOf(/Likely 40 to 77 percent/)).toBeInTheDocument()
  })
})

describe('ChartFrame (DESIGN §9.1)', () => {
  it('takeaway title, state chip, table view with the same rows', () => {
    render(
      <ChartFrame
        title="Your toss height was steadier than usual"
        subtitle="Side view, deuce, first serves"
        status="estimated"
        metricId="toss-height-spread"
        table={{ caption: 'Toss peaks', columns: ['Serve', 'Height'], rows: [{ key: '1', cells: ['Serve 1', '≈ 3.30 m'] }] }}
      >
        <svg role="img" aria-label="plot" />
      </ChartFrame>,
    )
    expect(screen.getByRole('figure', { name: /steadier than usual/ })).toBeInTheDocument()
    expect(document.querySelector('[data-metric="toss-height-spread"]')?.getAttribute('data-status')).toBe('estimated')
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }))
    expect(screen.getByRole('table', { name: 'Toss peaks' })).toHaveTextContent('≈ 3.30 m')
  })

  it('insufficient data replaces the plot with the reason', () => {
    render(
      <ChartFrame title="Toss map" insufficient="Needs 5 measured tosses. You have 3.">
        <svg role="img" aria-label="plot" />
      </ChartFrame>,
    )
    expect(screen.getByText('Needs 5 measured tosses. You have 3.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'plot' })).toBeNull()
  })
})
