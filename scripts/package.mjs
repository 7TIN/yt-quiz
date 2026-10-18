/**
 * Packages dist/ into the ZIP the Chrome Web Store, Edge Add-ons and a GitHub
 * release all accept: manifest.json at the archive root (no wrapper folder),
 * just the built extension. Run `bun run build` first — this only packs what is
 * already built, and it refuses to pack a version the manifest does not carry.
 *
 *   bun run zip
 *
 * Cross-platform on purpose: `zip`, then bsdtar's zip writer, then PowerShell's
 * Compress-Archive, whichever exists — the first one that produces an archive
 * with the right shape wins.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const manifestPath = join(dist, 'manifest.json')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

if (!existsSync(manifestPath)) {
  console.error('[zip] dist/manifest.json is missing - run `bun run build` first.')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.version !== pkg.version) {
  console.error(
    `[zip] version mismatch: manifest.json says ${manifest.version}, package.json says ${pkg.version}. ` +
      'Bump both before packaging - the stores read the manifest.',
  )
  process.exit(1)
}

const zipPath = join(root, `learning-loop-${manifest.version}.zip`)
/** Top-level entries inside dist: the whole extension, nothing else. */
const entries = readdirSync(dist)
const REQUIRED = ['manifest.json', 'background.js', 'content.js', 'transcript-bridge.js', 'index.html']

/** Archive entries, or null when this machine has no reader for ZIPs. */
function listZip(file) {
  const readers = [
    ['tar', ['-tf', file]], // bsdtar (Windows 10+, macOS): reads ZIPs
    ['unzip', ['-Z1', file]], // Info-ZIP (Linux, macOS)
  ]
  for (const [cmd, args] of readers) {
    try {
      return execFileSync(cmd, args, { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
    } catch {
      /* reader missing or the archive is broken; try the next one */
    }
  }
  return null
}

function shapeProblem(listing) {
  if (listing === null) return null
  const missing = REQUIRED.filter((name) => !listing.includes(name))
  if (missing.length > 0) return `missing ${missing.join(', ')}`
  if (listing.some((name) => name.startsWith('dist/') || name === 'dist')) {
    return 'has a dist/ wrapper folder - manifest.json must sit at the root'
  }
  return null
}

const zippers = [
  { name: 'zip', cmd: 'zip', args: ['-r', zipPath, ...entries], cwd: dist },
  {
    name: 'bsdtar',
    cmd: 'tar',
    args: ['--format=zip', '-cf', zipPath, ...entries],
    cwd: dist,
  },
  {
    name: 'Compress-Archive',
    cmd: 'powershell',
    args: [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${join(dist, '*')}' -DestinationPath '${zipPath}' -Force`,
    ],
    cwd: root,
  },
]

let packedWith = null
for (const zipper of zippers) {
  rmSync(zipPath, { force: true })
  try {
    execFileSync(zipper.cmd, zipper.args, { cwd: zipper.cwd, stdio: 'ignore' })
  } catch {
    continue // that tool is not installed here
  }
  const listing = listZip(zipPath)
  const problem = shapeProblem(listing)
  if (problem === null) {
    packedWith = { name: zipper.name, listing }
    break
  }
  console.warn(`[zip] ${zipper.name} produced a bad archive (${problem}); trying the next tool`)
}

if (!packedWith) {
  rmSync(zipPath, { force: true })
  console.error('[zip] no usable ZIP tool found (tried zip, bsdtar and Compress-Archive).')
  process.exit(1)
}

const kb = Math.round(statSync(zipPath).size / 1024)
const verified =
  packedWith.listing === null
    ? 'unverified - no ZIP reader on this machine, check it by hand'
    : `${packedWith.listing.length} files verified`
console.log(`[zip] ${zipPath} - v${manifest.version}, ${kb} KB, ${verified} (packed with ${packedWith.name})`)
console.log('[zip] upload this file to the Chrome Web Store and Edge Add-ons, or attach it to a GitHub release.')
