export const safe = {
  number(value: unknown, fallback = 0): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }
    return fallback
  },

  string(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback
  },

  array<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : []
  },

  date(value: unknown): Date | null {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const dateValue = new Date(value)
      return Number.isNaN(dateValue.getTime()) ? null : dateValue
    }
    return null
  },
}
