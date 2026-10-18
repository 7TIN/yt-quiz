/**
 * Timestamp formatting shared by the panel UI and the Gemini prompts.
 * 754 → "12:34"; 3725 → "1:02:05".
 */
import type { QuizCadence } from './types'
export function formatTimestamp(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

/** How often the loop quizzes, as UI copy: 1 → "every chapter". */
export function describeCadence(cadence: QuizCadence): string {
  if (cadence === 1) return 'every chapter'
  return cadence === 2 ? 'every 2nd chapter' : 'every 3rd chapter'
}
