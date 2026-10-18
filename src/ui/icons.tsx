interface IconProps {
  className?: string
}

/** Product mark: rounded gradient tile with a play glyph. */
export function LogoMark({ className }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="ll-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="8" fill="url(#ll-logo-gradient)" />
      <path d="M11.4 9.2v9.6l8-4.8z" fill="#ffffff" />
    </svg>
  )
}

export function ChevronDown({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 6.25 8 10l4-3.75"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
