"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TableSkeleton } from "@/components/ui/skeleton"
import { ErrorBoundary } from "@/components/error-boundary"
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookHistory,
} from "@/lib/hooks/use-admin"
import type { WebhookConfig, WebhookTestResponse } from "@/lib/api"
import { formatDistanceToNow, format } from "date-fns"
import {
  Plus,
  Trash2,
  RefreshCw,
  Webhook,
  Play,
  Pencil,
  History,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

const AVAILABLE_EVENT_TYPES = [
  "kernel_update",
  "security_update",
  "package_install",
  "package_update",
]

function WebhookForm({
  initialData,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: {
  initialData?: Partial<WebhookConfig>
  onSubmit: (data: { name: string; url: string; enabled: boolean; event_types: string[]; headers_json: Record<string, string> | null }) => void
  onCancel: () => void
  isPending: boolean
  submitLabel: string
}) {
  const [name, setName] = useState(initialData?.name || "")
  const [url, setUrl] = useState(initialData?.url || "")
  const [urlError, setUrlError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true)
  const [eventTypes, setEventTypes] = useState<string[]>(initialData?.event_types || ["kernel_update"])
  const [headersText, setHeadersText] = useState(
    initialData?.headers_json ? JSON.stringify(initialData.headers_json, null, 2) : ""
  )

  const validateWebhookUrl = (value: string): string | null => {
    const trimmedValue = value.trim()

    if (!trimmedValue) {
      return "Please enter a webhook URL"
    }

    try {
      const parsedUrl = new URL(trimmedValue)
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return "Webhook URL must start with http:// or https://"
      }
      return null
    } catch {
      return "Enter a valid URL (for example: https://example.com/webhook)"
    }
  }

  const toggleEventType = (type: string) => {
    setEventTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Please enter a webhook name")
      return
    }
    const urlValidationError = validateWebhookUrl(url)
    if (urlValidationError) {
      setUrlError(urlValidationError)
      toast.error(urlValidationError)
      return
    }
    setUrlError(null)
    if (eventTypes.length === 0) {
      toast.error("Please select at least one event type")
      return
    }

    let parsedHeaders: Record<string, string> | null = null
    if (headersText.trim()) {
      try {
        parsedHeaders = JSON.parse(headersText)
      } catch {
        toast.error("Invalid JSON in custom headers")
        return
      }
    }

    onSubmit({
      name: name.trim(),
      url: url.trim(),
      enabled,
      event_types: eventTypes,
      headers_json: parsedHeaders,
    })
  }

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <Label htmlFor="webhook-name">Name</Label>
        <Input
          id="webhook-name"
          placeholder="e.g., Slack notifications, PagerDuty alerts"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="webhook-url">URL</Label>
        <Input
          id="webhook-url"
          type="url"
          placeholder="https://hooks.example.com/webhook"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (urlError) {
              setUrlError(null)
            }
          }}
          onBlur={() => setUrlError(validateWebhookUrl(url))}
          aria-invalid={urlError ? true : undefined}
        />
        {urlError && <p className="text-xs text-status-error">{urlError}</p>}
      </div>
      <div className="space-y-2">
        <Label>Event Types</Label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleEventType(type)}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                eventTypes.includes(type)
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-background text-muted-foreground border-control-border hover:bg-accent"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="webhook-headers">Custom Headers (JSON, optional)</Label>
        <Textarea
          id="webhook-headers"
          placeholder={'{\n  "Authorization": "Bearer token"\n}'}
          value={headersText}
          onChange={(e) => setHeadersText(e.target.value)}
          rows={3}
          className="font-mono text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="webhook-enabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-control-border"
        />
        <Label htmlFor="webhook-enabled" className="font-normal">
          Enabled
        </Label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </div>
  )
}

function DeliveryHistoryDialog({
  webhookId,
  webhookName,
  open,
  onOpenChange,
}: {
  webhookId: number
  webhookName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: history, isLoading } = useWebhookHistory(open ? webhookId : 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Delivery History</DialogTitle>
          <DialogDescription>Recent deliveries for &quot;{webhookName}&quot;</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : !history || history.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <History className="w-8 h-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
            <p>No delivery history yet</p>
          </div>
        ) : (
          <Table>
            <TableCaption className="sr-only">Webhook delivery history</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Attempt</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.status_code && entry.status_code >= 200 && entry.status_code < 300 ? (
                      <Badge variant="success">{entry.status_code}</Badge>
                    ) : entry.status_code ? (
                      <Badge variant="destructive">{entry.status_code}</Badge>
                    ) : (
                      <Badge variant="outline">Error</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.event_type}</TableCell>
                  <TableCell>#{entry.attempt_number}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <time dateTime={new Date(entry.delivered_at).toISOString()}>
                      {format(new Date(entry.delivered_at), "MMM d, HH:mm:ss")}
                    </time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}

function WebhooksContent() {
  const { data, isLoading, error, refetch } = useWebhooks()
  const createMutation = useCreateWebhook()
  const updateMutation = useUpdateWebhook()
  const deleteMutation = useDeleteWebhook()
  const testMutation = useTestWebhook()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showTestDialog, setShowTestDialog] = useState(false)
  const [showHistoryDialog, setShowHistoryDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<WebhookConfig | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const [testTarget, setTestTarget] = useState<{ id: number; name: string } | null>(null)
  const [historyTarget, setHistoryTarget] = useState<{ id: number; name: string } | null>(null)
  const [testResult, setTestResult] = useState<WebhookTestResponse | null>(null)

  const webhooks = data?.webhooks || []

  const handleCreate = async (formData: { name: string; url: string; enabled: boolean; event_types: string[]; headers_json: Record<string, string> | null }) => {
    try {
      await createMutation.mutateAsync(formData)
      setShowCreateDialog(false)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleEdit = async (formData: { name: string; url: string; enabled: boolean; event_types: string[]; headers_json: Record<string, string> | null }) => {
    if (!editTarget) return
    try {
      await updateMutation.mutateAsync({
        webhookId: editTarget.id,
        data: formData,
      })
      setShowEditDialog(false)
      setEditTarget(null)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
      setShowDeleteDialog(false)
      setDeleteTarget(null)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleTest = async () => {
    if (!testTarget) return
    setTestResult(null)
    try {
      const result = await testMutation.mutateAsync({
        webhookId: testTarget.id,
      })
      setTestResult(result)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleToggleEnabled = async (webhook: WebhookConfig) => {
    try {
      await updateMutation.mutateAsync({
        webhookId: webhook.id,
        data: { enabled: !webhook.enabled },
      })
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: "Refreshing webhooks...",
      success: "Webhooks refreshed",
      error: "Failed to refresh webhooks",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Webhooks</h2>
          <p className="text-sm text-muted-foreground">
            Configure webhook endpoints for event notifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add Webhook
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : error ? (
        <div className="p-4 rounded-lg border glass-surface border-status-error text-status-error">
          Failed to load webhooks. Please try again.
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="p-8 text-center">
          <Webhook className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-muted-foreground">No webhooks configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a webhook to receive notifications when package events occur
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook) => (
            <Card key={webhook.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {webhook.name}
                      <Badge variant={webhook.enabled ? "success" : "secondary"}>
                        {webhook.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </CardTitle>
                    <p className="text-sm font-mono text-muted-foreground break-all">
                      {webhook.url}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleEnabled(webhook)}
                      aria-label={webhook.enabled ? "Disable webhook" : "Enable webhook"}
                      title={webhook.enabled ? "Disable" : "Enable"}
                    >
                      {webhook.enabled ? (
                        <XCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTestTarget({ id: webhook.id, name: webhook.name })
                        setTestResult(null)
                        setShowTestDialog(true)
                      }}
                      aria-label={`Test webhook ${webhook.name}`}
                      title="Test"
                    >
                      <Play className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setHistoryTarget({ id: webhook.id, name: webhook.name })
                        setShowHistoryDialog(true)
                      }}
                      aria-label={`View history for ${webhook.name}`}
                      title="History"
                    >
                      <History className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditTarget(webhook)
                        setShowEditDialog(true)
                      }}
                      aria-label={`Edit webhook ${webhook.name}`}
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget({ id: webhook.id, name: webhook.name })
                        setShowDeleteDialog(true)
                      }}
                      className="text-control-danger hover:text-control-danger-hover hover:bg-control-danger-hover-surface"
                      aria-label={`Delete webhook ${webhook.name}`}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-muted-foreground">Events:</span>
                  {webhook.event_types.map((type) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground ml-auto">
                    Updated{" "}
                    <time dateTime={new Date(webhook.updated_at).toISOString()}>
                      {formatDistanceToNow(new Date(webhook.updated_at), { addSuffix: true })}
                    </time>
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Webhook Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Webhook</DialogTitle>
            <DialogDescription>
              Configure a new webhook endpoint to receive event notifications.
            </DialogDescription>
          </DialogHeader>
          <WebhookForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreateDialog(false)}
            isPending={createMutation.isPending}
            submitLabel="Create Webhook"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Webhook Dialog */}
      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open)
          if (!open) setEditTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Webhook</DialogTitle>
            <DialogDescription>
              Update the webhook configuration for &quot;{editTarget?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <WebhookForm
              initialData={editTarget}
              onSubmit={handleEdit}
              onCancel={() => {
                setShowEditDialog(false)
                setEditTarget(null)
              }}
              isPending={updateMutation.isPending}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Webhook</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the webhook &quot;{deleteTarget?.name}&quot;?
              This will also delete all delivery history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Webhook Dialog */}
      <Dialog
        open={showTestDialog}
        onOpenChange={(open) => {
          setShowTestDialog(open)
          if (!open) {
            setTestTarget(null)
            setTestResult(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test Webhook</DialogTitle>
            <DialogDescription>
              Send a test payload to &quot;{testTarget?.name}&quot; to verify the endpoint is working.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!testResult && !testMutation.isPending && (
              <p className="text-sm text-muted-foreground">
                Click the button below to send a test event to this webhook endpoint.
              </p>
            )}
            {testMutation.isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span className="text-sm">Sending test payload...</span>
              </div>
            )}
            {testResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <Badge variant="success">Success</Badge>
                  ) : (
                    <Badge variant="destructive">Failed</Badge>
                  )}
                  {testResult.status_code && (
                    <span className="text-sm text-muted-foreground">
                      HTTP {testResult.status_code}
                    </span>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {testResult.delivery_time_ms}ms
                  </span>
                </div>
                {testResult.error_message && (
                  <div className="p-3 rounded-md glass-surface border-status-error">
                    <p className="text-sm text-status-error">{testResult.error_message}</p>
                  </div>
                )}
                {testResult.response_body && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Response Body</p>
                    <pre className="p-3 rounded-md bg-muted text-xs font-mono overflow-auto max-h-32">
                      {testResult.response_body}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTestDialog(false)
                setTestTarget(null)
                setTestResult(null)
              }}
            >
              Close
            </Button>
            <Button onClick={handleTest} disabled={testMutation.isPending}>
              {testMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Testing...
                </>
              ) : testResult ? (
                "Retry Test"
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  Send Test
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery History Dialog */}
      {historyTarget && (
        <DeliveryHistoryDialog
          webhookId={historyTarget.id}
          webhookName={historyTarget.name}
          open={showHistoryDialog}
          onOpenChange={(open) => {
            setShowHistoryDialog(open)
            if (!open) setHistoryTarget(null)
          }}
        />
      )}
    </div>
  )
}

export default function WebhooksPage() {
  return (
    <ErrorBoundary>
      <WebhooksContent />
    </ErrorBoundary>
  )
}
