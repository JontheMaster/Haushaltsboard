// Regenradar (DWD RV über Bright Sky): Umrechnung lat/lon → Pixel im Radar-Raster (keine Imports, auch vom
// Karten-Skript genutzt). Polarstereografisch, proj-string laut Bright-Sky-Doku:
//   +proj=stere +lat_0=90 +lat_ts=60 +lon_0=10 +a=6378137 +b=6356752.3142451802 +x_0=543196.83521776402 +y_0=3622588.8619310018
// Gesamtraster 1100 (x) × 1200 (y) Pixel à 1 km; Pixel i hat seine Mitte bei x = i·1000 m, Zeile j bei y = −j·1000 m.

const A = 6378137
const B = 6356752.3142451802
const E = Math.sqrt(1 - (B * B) / (A * A))
const LAT_TS = (60 * Math.PI) / 180
const LON_0 = (10 * Math.PI) / 180
const X_0 = 543196.83521776402
const Y_0 = 3622588.8619310018

const t = (phi: number) => Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2)
const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2)
const RHO_K = (A * m(LAT_TS)) / t(LAT_TS)

/** lat/lon (Grad) → Pixel (Spalte x, Zeile y, mit Nachkommastellen) im Gesamtraster */
export function latLonToGrid(lat: number, lon: number): { x: number; y: number } {
  const phi = (lat * Math.PI) / 180
  const lam = (lon * Math.PI) / 180 - LON_0
  const rho = RHO_K * t(phi)
  const px = rho * Math.sin(lam) + X_0
  const py = -rho * Math.cos(lam) + Y_0
  return { x: px / 1000, y: -py / 1000 }
}

/** Fester Ausschnitt um die Nürnberger Stadtmitte (nicht ums Zuhause, damit Karte und Repo nichts verraten) */
export const RADAR_CENTER = { lat: 49.45, lon: 11.08 }
export const RADAR_DISTANCE_M = 40000

// ───────── Stufen: Rohwert (0,01 mm / 5 min) ↔ 8 Bit für die Übertragung ─────────

/** Rohwert, der Stufe 255 entspricht: 100 mm/h = 8,33 mm / 5 min */
const RAW_MAX = 833

/** Rohwert → Stufe 0–255 (0 = trocken, darüber logarithmisch, damit leichter Regen fein aufgelöst bleibt) */
export function toLevel(raw: number): number {
  if (raw <= 0 || raw >= 65000) return 0
  return Math.max(1, Math.min(255, Math.round((254 * Math.log1p(raw)) / Math.log1p(RAW_MAX)) + 1))
}

/** Stufe → mm/h (Umkehrung von toLevel, für Farben und Anzeige) */
export function levelToMmh(level: number): number {
  if (level <= 0) return 0
  return (Math.expm1(((level - 1) * Math.log1p(RAW_MAX)) / 254) * 12) / 100
}

/** Rohwert → mm/h */
export const rawToMmh = (raw: number) => (raw * 12) / 100
