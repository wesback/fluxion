"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
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
import { useAPIKeys, useCreateAPIKey, useDeleteAPIKey } from "@/lib/hooks/use-admin"
import { formatDistanceToNow } from "date-fns"
import { Plus, Trash2, Copy, RefreshCw, Key, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

function APIKeysContent() {
  const { data, isLoading, error, refetch } = useAPIKeys()
  const createMutation = useCreateAPIKey()
  const deleteMutation = useDeleteAPIKey()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showKeyDialog, setShowKeyDialog] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyRole, setNewKeyRole] = useState("user")
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const apiKeys = data?.items || []

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error("Please enter a name for the API key")
      return
    }
    try {
      const result = await createMutation.mutateAsync({
        name: newKeyName.trim(),
        role: newKeyRole,
      })
      setCreatedKey(result.api_key)
      setShowCreateDialog(false)
      setShowKeyDialog(true)
      setNewKeyName("")
      setNewKeyRole("user")
      toast.success("API key created successfully")
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

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey)
      toast.success("API key copied to clipboard")
    }
  }

  const handleRefresh = () => {
    toast.promise(refetch(), {
      loading: "Refreshing API keys...",
      success: "API keys refreshed",
      error: "Failed to refresh API keys",
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">API Keys</h2>
          <p className="text-sm text-muted-foreground">
            Manage API keys for authenticating with the Fluxion API
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create Key
          </Button>
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : error ? (
        <div className="p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
          Failed to load API keys. Please try again.
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {data?.total ?? 0} API Key{(data?.total ?? 0) !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableCaption className="sr-only">API keys table</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Created</TableHead>
                  <TableHead className="hidden md:table-cell">Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      <Key className="w-8 h-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
                      <p>No API keys found</p>
                      <p className="text-xs mt-1">Create your first API key to get started</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  apiKeys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <Badge variant={key.role === "admin" ? "default" : "secondary"}>
                          {key.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={key.is_active ? "success" : "destructive"}>
                          {key.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        <time dateTime={new Date(key.created_at).toISOString()}>
                          {formatDistanceToNow(new Date(key.created_at), { addSuffix: true })}
                        </time>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {key.last_used ? (
                          <time dateTime={new Date(key.last_used).toISOString()}>
                            {formatDistanceToNow(new Date(key.last_used), { addSuffix: true })}
                          </time>
                        ) : (
                          <span className="text-muted-foreground/60">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteTarget({ id: key.id, name: key.name })
                            setShowDeleteDialog(true)
                          }}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label={`Delete API key ${key.name}`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Key Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for authenticating with the Fluxion API.
              The key will only be shown once after creation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g., production-server, ci-pipeline"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-role">Role</Label>
              <Select
                id="key-role"
                value={newKeyRole}
                onChange={(e) => setNewKeyRole(e.target.value)}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Admin keys can manage API keys and webhooks. User keys can only submit and query updates.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !newKeyName.trim()}>
              {createMutation.isPending ? "Creating..." : "Create Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Created Key Dialog */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy your API key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 rounded-md bg-muted font-mono text-sm break-all select-all">
                {createdKey}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopyKey} aria-label="Copy API key">
                <Copy className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                This is the only time the full API key will be displayed.
                Store it securely — you won&apos;t be able to retrieve it later.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowKeyDialog(false); setCreatedKey(null) }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the API key &quot;{deleteTarget?.name}&quot;?
              This action cannot be undone. Any services using this key will lose access.
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
              {deleteMutation.isPending ? "Deleting..." : "Delete Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function APIKeysPage() {
  return (
    <ErrorBoundary>
      <APIKeysContent />
    </ErrorBoundary>
  )
}
