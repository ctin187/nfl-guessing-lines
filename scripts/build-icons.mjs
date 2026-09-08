#!/usr/bin/env node
/**
 * Rasterises public/icon.svg into the PNG sizes the manifest and iOS need.
 * Run after editing the SVG: npm run icons
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(resolve(ROOT, 'public/icon.svg'))

// A maskable icon gets cropped to whatever shape the launcher wants, so the mark
// has to sit inside the middle 80%. Shrink it onto a full-bleed background.
const MASK_BG = '#16191e'

const jobs = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

for (const { file, size } of jobs) {
  const png = await sharp(svg, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  writeFileSync(resolve(ROOT, 'public', file), png)
  console.log(`public/${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}

const inner = Math.round(512 * 0.62)
const mark = await sharp(svg, { density: 512 }).resize(inner, inner).png().toBuffer()
const maskable = await sharp({
  create: { width: 512, height: 512, channels: 4, background: MASK_BG },
})
  .composite([{ input: mark, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toBuffer()
writeFileSync(resolve(ROOT, 'public/icon-maskable-512.png'), maskable)
console.log(`public/icon-maskable-512.png  512x512  ${(maskable.length / 1024).toFixed(1)} kB`)
