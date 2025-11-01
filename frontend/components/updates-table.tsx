import { formatDistanceToNow } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card } from "@/components/ui/card"

interface Update {
  hostname?: string
  package_name: string
  old_version: string | null
  new_version: string
  update_timestamp?: string
  timestamp?: string
}

interface UpdatesTableProps {
  updates: Update[]
  showHostname?: boolean
}

export function UpdatesTable({ updates, showHostname = true }: UpdatesTableProps) {
  if (updates.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No updates found
      </Card>
    )
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            {showHostname && <TableHead>Hostname</TableHead>}
            <TableHead>Package</TableHead>
            <TableHead>Old Version</TableHead>
            <TableHead>New Version</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {updates.map((update, index) => {
            const timestamp = update.update_timestamp || update.timestamp
            return (
              <TableRow key={index}>
                {showHostname && (
                  <TableCell className="font-medium">
                    {update.hostname}
                  </TableCell>
                )}
                <TableCell className="font-mono text-sm">
                  {update.package_name}
                </TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {update.old_version || "N/A"}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {update.new_version}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {timestamp
                    ? formatDistanceToNow(new Date(timestamp), { addSuffix: true })
                    : "N/A"}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
