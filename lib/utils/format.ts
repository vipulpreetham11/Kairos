import { safe } from '@/lib/utils/safe'

const LOCALE = 'en-IN'

export const rupees = {
  fromPaise(paise: number): number {
    return safe.number(paise, 0) / 100
  },

  format(paise: number): string {
    const value = rupees.fromPaise(paise)
    return `₹${value.toLocaleString(LOCALE)}`
  },

  short(paise: number): string {
    const value = rupees.fromPaise(paise)

    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`
    if (value >= 1000) return `₹${Math.round(value / 1000)}K`
    return `₹${value.toLocaleString(LOCALE)}`
  },
}

export function formatDate(value: string | Date): string {
  const dateValue = value instanceof Date ? value : new Date(value)
  return dateValue.toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatRelativeTime(value: string | Date): string {
  const dateValue = value instanceof Date ? value : new Date(value)
  const diffMs = dateValue.getTime() - Date.now()
  const absMinutes = Math.abs(Math.round(diffMs / 60000))
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

  if (absMinutes < 60) return rtf.format(Math.round(diffMs / 60000), 'minute')

  const absHours = Math.abs(Math.round(diffMs / 3600000))
  if (absHours < 24) return rtf.format(Math.round(diffMs / 3600000), 'hour')

  return rtf.format(Math.round(diffMs / 86400000), 'day')
}

export function formatPercentage(value: number, fractionDigits = 0): string {
  return `${safe.number(value, 0).toFixed(fractionDigits)}%`
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
