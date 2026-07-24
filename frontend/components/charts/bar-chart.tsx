"use client"

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GlassTooltip } from '@/components/charts/glass-tooltip'

interface BarChartProps {
  title: string
  data: Array<{ name: string; value: number }>
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

export function BarChart({ title, data, dataKey = 'value', nameKey = 'name' }: BarChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <RechartsBarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
            <XAxis
              dataKey={nameKey}
              className="text-xs"
              tick={{ fill: 'hsl(var(--chart-axis))' }}
            />
            <YAxis
              className="text-xs"
              tick={{ fill: 'hsl(var(--chart-axis))' }}
            />
            <Tooltip content={<GlassTooltip />} />
            <Bar
              dataKey={dataKey}
              radius={[4, 4, 0, 0]}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_SERIES[index % 5]} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

