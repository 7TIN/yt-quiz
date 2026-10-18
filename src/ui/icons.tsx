/**
 * The icon set: a handful of 24×24 stroke icons (Geist-style 2px geometry) plus
 * the product mark. Everything inherits `currentColor`, so icons pick up the
 * text color of whatever they sit in.
 */
import type { ReactNode } from 'react'

interface IconProps {
  className?: string
}

function Stroke({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  )
}

interface FilledIconProps extends IconProps {
  children: ReactNode
}

function Filled({ className, children }: FilledIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      {children}
    </svg>
  )
}

/** Product mark: a neutral tile with a play glyph punched out of it. */
export function LogoMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={className}>
      <rect width="28" height="28" rx="8" className="fill-ink" />
      <path d="M11.6 9.3v9.4l7.8-4.7z" className="fill-surface" />
    </svg>
  )
}

export function ChevronDown({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="m6 9 6 6 6-6" />
    </Stroke>
  )
}

export function PlayIcon({ className }: IconProps) {
  return (
    <Filled className={className}>
      <path d="M8 5.4v13.2L19 12z" />
    </Filled>
  )
}

export function StopIcon({ className }: IconProps) {
  return (
    <Filled className={className}>
      <rect x="7" y="7" width="10" height="10" rx="2.5" />
    </Filled>
  )
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Stroke>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Stroke>
  )
}

export function XIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Stroke>
  )
}

export function AlertIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20.2h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Stroke>
  )
}

export function RefreshIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </Stroke>
  )
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Stroke>
  )
}

export function LightbulbIcon({ className }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.4 1 1 1 1.7V18h6v-1.6c0-.7.4-1.3 1-1.7A7 7 0 0 0 12 2Z" />
      <path d="M9.5 21h5" />
    </Stroke>
  )
}

/** Lightning bolt marking an active quiz moment. */
export function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M9.1 1 3.2 9h3.3L6.2 15l6-8H9.4L9.1 1Z" fill="currentColor" />
    </svg>
  )
}
