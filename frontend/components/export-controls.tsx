"use client"

import { Download } from "lucide-react"
import { Select } from "@/components/ui/select"

export const EXPORT_ROW_LIMIT = 10_000

type ExportFormat = "csv" | "json"

interface ExportControlsProps<T> {
  rows: T[]
  columns: Array<{ key: keyof T; label: string }>
  filename: string
  disabled?: boolean
  serverExport?: {
    url: string
    params?: Record<string, string | number | boolean | undefined>
    rowCount?: number
  }
}

function escapeCsv(value: unknown) {
  const stringValue = value == null ? "" : String(value)
  return `"${stringValue.replaceAll('"', '""')}"`
}

export function ExportControls<T>({ rows, columns, filename, disabled, serverExport }: ExportControlsProps<T>) {
  const exportRows = rows.slice(0, EXPORT_ROW_LIMIT)
  const exportCount = serverExport
    ? Math.min(serverExport.rowCount ?? 0, EXPORT_ROW_LIMIT)
    : exportRows.length

  const download = (format: ExportFormat) => {
    if (exportCount === 0) return

    if (serverExport) {
      const params = new URLSearchParams()
      Object.entries(serverExport.params ?? {}).forEach(([key, value]) => {
        if (value !== undefined) params.set(key, String(value))
      })
      params.set("format", format)
      const link = document.createElement("a")
      link.href = `${serverExport.url}?${params.toString()}`
      link.download = `${filename}.${format}`
      link.click()
      return
    }

    const content = format === "json"
      ? JSON.stringify(exportRows, null, 2)
      : [
          columns.map((column) => escapeCsv(column.label)).join(","),
          ...exportRows.map((row) => columns.map((column) => escapeCsv(row[column.key])).join(",")),
        ].join("\n")
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${filename}.${format}`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex items-center gap-2" aria-label="Export results">
      <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <Select
        aria-label="Export format"
        defaultValue=""
        disabled={disabled || exportCount === 0}
        onChange={(event) => {
          const format = event.target.value as ExportFormat
          if (format) download(format)
          event.currentTarget.value = ""
        }}
      >
        <option value="">Export</option>
        <option value="csv">CSV ({exportCount.toLocaleString()} rows)</option>
        <option value="json">JSON ({exportCount.toLocaleString()} rows)</option>
      </Select>
    </div>
  )
}
