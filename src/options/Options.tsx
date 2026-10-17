import { LogoMark } from '../ui/icons'

/**
 * Options page. Phase 1 is a placeholder: the API key field, model, language,
 * level, quiz frequency and cache controls arrive with the Gemini client in
 * Phase 3. The privacy notice below is already final wording.
 */
export function Options() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-6 py-10">
      <header className="flex items-center gap-3">
        <LogoMark className="size-9 shrink-0" />
        <div>
          <h1 className="text-lg font-semibold">Learning Loop for YouTube</h1>
          <p className="text-sm text-muted">Extension settings</p>
        </div>
      </header>

      <section className="rounded-2xl border border-line bg-surface-2 p-5">
        <h2 className="text-sm font-semibold">Settings arrive in Phase 3</h2>
        <p className="mt-1 text-sm text-muted">
          The API key field, model ID, language, level, quiz frequency and cache controls are built
          together with the Gemini client. Nothing is stored yet, and the extension does not call
          any API in its current state.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-surface-2 p-5">
        <h2 className="text-sm font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-muted">
          Your Gemini API key is stored only in this browser (chrome.storage.local). Transcript
          text and your questions are sent directly to Google&apos;s Gemini API using your own key.
          Nothing is sent to the extension&apos;s developer and no analytics are collected. Cached
          summaries, quizzes and facts never leave your machine.
        </p>
      </section>
    </main>
  )
}
