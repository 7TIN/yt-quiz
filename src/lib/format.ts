/**
 * Timestamp formatting shared by the panel UI and the Gemini prompts.
 * 754 → "12:34"; 3725 → "1:02:05".
 */
export function formatTimestamp(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  return `${minutes}:${String(rest).padStart(2, '0')}`
}
