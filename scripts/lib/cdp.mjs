/**
 * Minimal Chrome DevTools Protocol client (no dependency).
 * Used by the dev probe scripts to drive a real Chromium browser:
 * navigate, evaluate JS in the page, and read results back.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

export function findBrowser() {
  const candidates = [
    process.env.LL_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export async function launchBrowser({ browser, url, extraArgs = [], profilePrefix = 'll-cdp-' }) {
  const port = 9200 + Math.floor(Math.random() * 500)
  const userDataDir = mkdtempSync(join(tmpdir(), profilePrefix))
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=msSmartScreenProtection',
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1400,900',
    ...extraArgs,
    url,
  ]
  const proc = spawn(browser, args, { stdio: 'ignore', detached: false })

  const target = await waitForPageTarget(port, 30_000)
  return {
    port,
    target,
    userDataDir,
    async kill() {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { stdio: 'ignore' })
      } else {
        proc.kill('SIGKILL')
      }
      await delay(300)
    },
  }
}

async function waitForPageTarget(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      const targets = await response.json()
      const page = targets.find(
        (t) => t.type === 'page' && (t.url.startsWith('http') || t.url === 'about:blank'),
      )
      if (page && page.webSocketDebuggerUrl) return page
    } catch (error) {
      lastError = error
    }
    await delay(300)
  }
  throw new Error(`no debuggable page target after ${timeoutMs}ms: ${lastError ?? 'timeout'}`)
}

export class CdpSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl
    this.nextId = 1
    this.pending = new Map()
    this.eventHandlers = new Map()
    this.socket = null
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.webSocketUrl)
      this.socket = socket
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(typeof event.data === 'string' ? event.data : '')
        if (message.method) {
          const handlers = this.eventHandlers.get(message.method)
          if (handlers) for (const handler of handlers) handler(message.params)
          return
        }
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)))
        else pending.resolve(message.result)
      })
      socket.addEventListener('open', () => resolve(this))
      socket.addEventListener('error', (event) => reject(new Error(`websocket error: ${String(event.message ?? '')}`)))
    })
  }

  /** Subscribes to a CDP event (e.g. 'Network.requestWillBeSent'). */
  on(method, handler) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, [])
    this.eventHandlers.get(method).push(handler)
  }

  send(method, params = {}, timeoutMs = 60_000) {
    const id = this.nextId++
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
    })
    this.socket.send(JSON.stringify({ id, method, params }))
    return promise
  }

  /** Evaluates JS in the page (main world by default) and returns the value. */
  async evaluate(expression, { awaitPromise = true, timeoutMs = 60_000 } = {}) {
    const result = await this.send(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue: true, userGesture: true },
      timeoutMs,
    )
    if (result.exceptionDetails) {
      throw new Error(`evaluate failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`)
    }
    return result.result?.value
  }

  /** Polls an expression until it returns truthy (in page time). */
  async waitFor(expression, { timeoutMs = 30_000, pollMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const value = await this.evaluate(expression)
        if (value) return value
      } catch {
        // page may be mid-navigation; retry
      }
      await delay(pollMs)
    }
    throw new Error(`waitFor timed out: ${expression.slice(0, 120)}`)
  }

  close() {
    try {
      this.socket?.close()
    } catch {
      // ignore
    }
  }
}

export { delay }
