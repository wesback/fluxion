"use client"

import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BarChartProps {
  title: string
  data: Array<{ name: string; value: number }>
  dataKey?: string
  nameKey?: string
}

// Generate a consistent, visually appealing color based on a string hash
function stringToColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
    hash = hash & hash // Convert to 32bit integer
  }
  
  // Use golden ratio to distribute hues evenly across the color wheel
  const goldenRatioConjugate = 0.618033988749895
  const hue = (Math.abs(hash) * goldenRatioConjugate * 360) % 360
  
  // High saturation for vibrant colors, moderate lightness for good visibility
  const saturation = 70 + (Math.abs(hash >> 8) % 15) // 70-85%
  const lightness = 50 + (Math.abs(hash >> 16) % 10) // 50-60%
  
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}

export function BarChart({ title, data, dataKey = 'value', nameKey = 'name' }: BarChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <RechartsBarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey={nameKey} 
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <YAxis 
              className="text-xs"
              tick={{ fill: 'currentColor' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Bar 
              dataKey={dataKey} 
              radius={[4, 4, 0, 0]}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={stringToColor(entry[nameKey as keyof typeof entry] as string)} />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
