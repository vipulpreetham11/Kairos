'use client'

import { Minus, TrendingDown, TrendingUp } from 'lucide-react'

interface TrendArrowProps {
  trend: 'improving' | 'stable' | 'declining' | 'critical'
  value?: number
}

export function TrendArrow({ trend, value }: TrendArrowProps) {
  if (trend === 'improving') return <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><TrendingUp className="h-4 w-4" />{value ?? ''}</span>
  if (trend === 'stable') return <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><Minus className="h-4 w-4" /></span>
  if (trend === 'declining') return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><TrendingDown className="h-4 w-4" />{value ?? ''}</span>
  return <span className="inline-flex animate-pulse items-center gap-1 text-xs font-medium text-red-600"><TrendingDown className="h-4 w-4" /><TrendingDown className="h-4 w-4 -ml-2" />{value ?? ''}</span>
}
