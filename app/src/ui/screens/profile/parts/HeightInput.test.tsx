// The height box is one 52 px target (DESIGN §12, §14): a tap anywhere in it, the "cm" included,
// focuses the field, and the field keeps its one visible name.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { HeightInput } from './HeightInput.tsx'

describe('HeightInput target', () => {
  it('a tap on the box outside the digits focuses the field', async () => {
    const user = userEvent.setup()
    render(<HeightInput valueCm={null} onChange={vi.fn()} reasonOpen />)
    const input = screen.getByRole('textbox', { name: 'Your height' })
    const box = input.closest('label')
    expect(box, 'the box is a label for the field').not.toBeNull()
    expect(box).toHaveAttribute('for', input.id)
    await user.click(screen.getByText('cm'))
    expect(input).toHaveFocus()
  })

  it('typing still commits whole centimetres', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<HeightInput valueCm={null} onChange={onChange} reasonOpen />)
    await user.click(screen.getByText('cm'))
    await user.keyboard('178')
    expect(onChange).toHaveBeenLastCalledWith(178)
  })
})
