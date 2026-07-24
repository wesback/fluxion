"use client"

import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GlassTooltip } from '@/components/charts/glass-tooltip'

interface LineChartProps {
  title: string
  data: Array<{ name: string; value: number }>
  dataKey?: string
  nameKey?: string
}

export function LineChart({ title, data, dataKey = 'value', nameKey = 'name' }: LineChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <RechartsLineChart data={data}>
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
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="hsl(var(--chart-series-1))"
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--chart-series-1))' }}
            />
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

