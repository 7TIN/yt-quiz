import { createRoot } from 'react-dom/client'
import '../ui/styles.css'
import { Options } from './Options'

// The options page is a normal document, so it can follow the OS preference
// (the content panel follows YouTube's own theme instead).
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => {
  document.documentElement.dataset.theme = mediaQuery.matches ? 'dark' : 'light'
}
applyTheme()
mediaQuery.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(<Options />)
