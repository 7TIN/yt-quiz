/**
 * Small shared primitives: the button family, its icon-only sibling and the
 * loading spinner. Deliberately tiny — the design language lives in the
 * styles.css tokens, these just keep every button in the product identical.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 font-medium whitespace-nowrap ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
  'disabled:pointer-events-none disabled:opacity-45 ' +
  'motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 ' +
  'motion-safe:active:scale-[.97]'

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 rounded-md px-2.5 text-xs',
  md: 'h-8 rounded-lg px-3 text-sm',
  lg: 'h-10 rounded-lg px-4 text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icon rendered before the label (14–16px, inherits the label color). */
  leftIcon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className ?? ''}`}
      {...rest}
    >
      {leftIcon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also used as the tooltip. */
  label: string
  variant?: Extract<ButtonVariant, 'ghost' | 'secondary'>
  size?: Extract<ButtonSize, 'sm' | 'md'>
}

export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const box = size === 'sm' ? 'size-7 rounded-md' : 'size-8 rounded-lg'
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${BASE} ${VARIANT[variant]} ${box} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}

/** A quiet inline spinner: track in --ll-line, head in the accent color. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent ${className ?? ''}`}
    />
  )
}
