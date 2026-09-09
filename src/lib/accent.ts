/* Dérive une palette d'accent (encre, fond doux, bordure, lueur, dégradé) à partir de la
   couleur d'un établissement — port direct de la logique `renderVals()` de la maquette
   Landing.dc.html, pour que chaque landing page garde son identité tout en restant dans le
   thème sombre commun. */
export interface AccentPalette {
  accent: string
  accentInk: string
  accentSoft: string
  accentBorder: string
  accentGlow: string
  accentGrad: string
}

function clamp255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function deriveAccent(hexInput: string | null | undefined): AccentPalette {
  const hex = (hexInput ?? '#e9cf94').trim()
  const parsed = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  const n = parsed ? parseInt(parsed[1], 16) : 0xe9cf94
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255

  const toHex = (channels: number[]) =>
    '#' + channels.map((c) => clamp255(c).toString(16).padStart(2, '0')).join('')
  const lighten = (t: number) => toHex([r, g, b].map((c) => c + (255 - c) * t))
  const darken = (t: number) => toHex([r, g, b].map((c) => c * (1 - t)))

  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const accentHex = toHex([r, g, b])

  return {
    accent: accentHex,
    accentInk: lum > 0.7 ? '#141019' : '#ffffff',
    accentSoft: `rgba(${r},${g},${b},.14)`,
    accentBorder: `rgba(${r},${g},${b},.4)`,
    accentGlow: `rgba(${r},${g},${b},.45)`,
    accentGrad: `linear-gradient(150deg, ${lighten(0.28)} 0%, ${accentHex} 48%, ${darken(0.24)} 100%)`,
  }
}
