"use client"

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GlassTooltip } from '@/components/charts/glass-tooltip'

interface BarChartProps {
  title: string
  data: Array<{ name: string; value: number }>
  valueUnit?: string
  dataKey?: string
  nameKey?: string
}

const CHART_SERIES = [
  "hsl(var(--chart-series-1))",
  "hsl(var(--chart-series-2))",
  "hsl(var(--chart-series-3))",
  "hsl(var(--chart-series-4))",
  "hsl(var(--chart-series-5))",
]

export function BarChart({ title, data, valueUnit = 'update', dataKey = 'value', nameKey = 'name' }: BarChartProps) {
  const gradientPrefix = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")

  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-4 pb-2 pt-4">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <ResponsiveContainer width="100%" height={220}>
          <RechartsBarChart data={data}>
            <defs>
              {CHART_SERIES.map((color, index) => (
                <linearGradient key={index} id={`${gradientPrefix}-${index}`} x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={color} stopOpacity={0.68} />
                  <stop offset="100%" stopColor={color} stopOpacity={1} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis
              dataKey={nameKey}
              className="text-xs"
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-axis)' }}
            />
            <YAxis
              className="text-xs"
              stroke="var(--chart-axis)"
              tick={{ fill: 'var(--chart-axis)' }}
            />
            <Tooltip content={<GlassTooltip valueUnit={valueUnit} />} />
            <Bar
              name="Count"
              dataKey={dataKey}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={`url(#${gradientPrefix}-${index % CHART_SERIES.length})`} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
        <ol aria-label={`${title} ranked values`} className="sr-only">
          {data.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex items-baseline gap-3">
              <span className="shrink-0 text-muted-foreground">Rank {index + 1}</span>
              <span className="min-w-0 flex-1 break-words">{item.name}</span>
              <span className="shrink-0 font-medium">
                {item.value} {valueUnit}{item.value === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
