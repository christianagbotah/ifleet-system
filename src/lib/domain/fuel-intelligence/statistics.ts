function finiteValues(values: number[]): number[] {
  return values.filter(Number.isFinite).slice().sort((a, b) => a - b)
}

export function median(values: number[]): number | null {
  const sorted = finiteValues(values)
  if (sorted.length === 0) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function medianAbsoluteDeviation(values: number[], medianValue?: number): number | null {
  const sorted = finiteValues(values)
  if (sorted.length === 0) return null
  const center = medianValue ?? median(sorted)
  if (center == null || !Number.isFinite(center)) return null
  return median(sorted.map((value) => Math.abs(value - center)))
}

function percentile(sorted: number[], probability: number): number | null {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const fraction = position - lower
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction
}

export function interquartileRange(values: number[]): { q1: number; q3: number; iqr: number } | null {
  const sorted = finiteValues(values)
  if (sorted.length === 0) return null
  const q1 = percentile(sorted, 0.25)
  const q3 = percentile(sorted, 0.75)
  if (q1 == null || q3 == null) return null
  return { q1, q3, iqr: q3 - q1 }
}
