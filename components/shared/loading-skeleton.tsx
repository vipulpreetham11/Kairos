'use client'

export function CardSkeleton() {
  return <div className="h-[120px] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
}

export function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-4 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      ))}
    </div>
  )
}

export function ChartSkeleton() {
  return <div className="h-[200px] w-full animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
}

export function InsightSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="h-4 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-full animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-8 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}
