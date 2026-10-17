/**
 * Generates the extension icons (public/icons/icon-16|48|128.png) without any
 * image dependency: a minimal PNG encoder over node:zlib plus tiny rasterizers
 * for a rounded square (indigo gradient) and a white play triangle.
 * Rendered at 4x and box-downsampled for smooth edges.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
const SIZES = [16, 48, 128]
const SUPERSAMPLE = 4

// ---------------------------------------------------------------- PNG encoder

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, crc])
}

/** rgba: Uint8Array of width*height*4 bytes. */
function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  // bytes 10-12: compression, filter, interlace = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------ rasterize

const lerp = (a, b, t) => a + (b - a) * t

/** Signed distance test for a rounded rectangle centered in [0,1]^2. */
function insideRoundedSquare(x, y, cornerRadius) {
  const half = 0.5
  const r = cornerRadius
  const dx = Math.abs(x - half) - (half - r)
  const dy = Math.abs(y - half) - (half - r)
  const outsideX = Math.max(dx, 0)
  const outsideY = Math.max(dy, 0)
  return Math.hypot(outsideX, outsideY) + Math.min(Math.max(dx, dy), 0) - r <= 0
}

/** Barycentric point-in-triangle for the play glyph. */
function insideTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNegative && hasPositive)
}

function renderIcon(size) {
  const work = size * SUPERSAMPLE
  const pixels = new Uint8ClampedArray(size * size * 4)

  // Play triangle in unit coordinates (slightly right-shifted to look centered).
  const [ax, ay] = [0.4, 0.3]
  const [bx, by] = [0.4, 0.7]
  const [cx, cy] = [0.69, 0.5]

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px * SUPERSAMPLE + sx + 0.5) / work
          const y = (py * SUPERSAMPLE + sy + 0.5) / work

          if (!insideRoundedSquare(x, y, 0.24)) continue

          if (insideTriangle(x, y, ax, ay, bx, by, cx, cy)) {
            r += 255
            g += 255
            b += 255
          } else {
            // Vertical gradient indigo-500 → indigo-600.
            const t = y
            r += lerp(0x63, 0x4f, t)
            g += lerp(0x66, 0x46, t)
            b += lerp(0xf1, 0xe5, t)
          }
          a += 255
        }
      }

      const samples = SUPERSAMPLE * SUPERSAMPLE
      const alpha = a / samples
      const index = (py * size + px) * 4
      if (alpha > 0) {
        // Un-premultiply so transparent corner pixels keep the tile color.
        pixels[index] = (r / samples / (alpha / 255)) | 0
        pixels[index + 1] = (g / samples / (alpha / 255)) | 0
        pixels[index + 2] = (b / samples / (alpha / 255)) | 0
      }
      pixels[index + 3] = Math.round(alpha)
    }
  }

  return encodePng(size, size, pixels)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, renderIcon(size))
  console.log(`wrote ${file}`)
}
