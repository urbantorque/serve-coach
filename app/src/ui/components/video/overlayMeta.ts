/** Overlay chip labels, glyphs and legend lines (DESIGN §8.11 item 3). */
import { ArrowFatLinesUpIcon, ArrowLineUpIcon, EyeSlashIcon, PersonSimpleIcon, TennisBallIcon, type Icon } from '@phosphor-icons/react'
import type { OverlayId } from './overlayScene.ts'

export const OVERLAY_META: Record<OverlayId, { label: string; icon: Icon; legend: string }> = {
  body: { label: 'Body', icon: PersonSimpleIcon, legend: "Faded joints: we're less sure where they are." },
  toss: { label: 'Toss', icon: TennisBallIcon, legend: 'Blue: the ball. Marks show multiples of your height.' },
  contact: { label: 'Contact', icon: ArrowLineUpIcon, legend: 'Across: contact height. Upright: your front toe.' },
  legs: { label: 'Legs', icon: ArrowFatLinesUpIcon, legend: 'Floor line: your start. Path: hips. Ring: lowest point.' },
  none: { label: 'None', icon: EyeSlashIcon, legend: 'No overlay: your serve as filmed.' },
}
