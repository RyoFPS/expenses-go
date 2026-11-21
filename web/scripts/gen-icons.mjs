// Membuat ikon PWA (public/icon-*.png) dan app/icon.svg dari satu SVG. Jalankan: node scripts/gen-icons.mjs
import { writeFileSync } from "node:fs"
import sharp from "sharp"

const glyph = (s) => `
  <g transform="translate(${s * 0.22} ${s * 0.27}) scale(${s / 512})">
    <rect x="0" y="40" width="290" height="200" rx="40" fill="#1f3d0c"/>
    <rect x="0" y="0" width="230" height="70" rx="30" fill="#1f3d0c" opacity="0.55"/>
    <rect x="190" y="105" width="100" height="70" rx="28" fill="#c6f432"/>
    <circle cx="230" cy="140" r="14" fill="#1f3d0c"/>
  </g>`

const icon = (size, { maskable = false } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.22}" fill="#c6f432"/>
  ${maskable ? `<g transform="translate(${size * 0.1} ${size * 0.1}) scale(0.8)">${glyph(size)}</g>` : glyph(size)}
</svg>`

writeFileSync("app/icon.svg", icon(512))
for (const [file, size, opts] of [
  ["public/icon-192.png", 192, {}],
  ["public/icon-512.png", 512, {}],
  ["public/icon-maskable-512.png", 512, { maskable: true }],
  ["app/apple-icon.png", 180, { maskable: true }],
]) {
  await sharp(Buffer.from(icon(size, opts))).png().toFile(file)
  console.log("wrote", file)
}
