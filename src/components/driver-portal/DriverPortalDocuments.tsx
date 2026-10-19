'use client'

import * as React from 'react'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CreditCard,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { toast } from 'sonner'

import { apiFetch, type Driver } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface DriverPortalDocumentsProps {
  driver: Driver
  onBack: () => void
}

interface DriverPortalDocument {
  id: string
  documentType: string
  documentName: string
  fileName: string
  fileSize: number
  mimeType: string
  status: string
  expiryDate: string | null
  issuedDate: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  downloadUrl: string
}

const DOCUMENT_LABELS: Record<string, string> = {
  license: "Driver's License",
  insurance: 'Insurance',
  background_check: 'Background Check',
  medical: 'Medical Certificate',
  other: 'Other',
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Size unavailable'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function IdentityRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  )
}

export function DriverPortalDocuments({ driver, onBack }: DriverPortalDocumentsProps) {
  const token = useAuthStore((state) => state.token)
  const [documents, setDocuments] = React.useState<DriverPortalDocument[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null)

  const loadDocuments = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<DriverPortalDocument[]>(`/api/drivers/${driver.id}/documents`)
      setDocuments(Array.isArray(data) ? data : [])
    } catch (err) {
      setDocuments([])
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [driver.id])

  React.useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  async function downloadDocument(document: DriverPortalDocument) {
    if (!token) {
      toast.error('Authentication required. Please sign in again.')
      return
    }

    setDownloadingId(document.id)
    try {
      const response = await fetch(
        `/api/drivers/${driver.id}/documents/${document.id}/download`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(payload?.error || 'Failed to download document')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = document.fileName || document.documentName || 'document'
      window.document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download document')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-4 p-4 pb-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onBack}
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">My Documents</h2>
          <p className="truncate text-xs text-gray-500">
            Read-only identity and fleet documents for {driver.firstName} {driver.lastName}
          </p>
        </div>
      </div>

      <Card className="rounded-xl">
        <CardHeader className="px-5 pb-0 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Shield className="h-4 w-4 text-amber-500" />
            Identity &amp; licence
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="divide-y divide-gray-100">
            <IdentityRow icon={CreditCard} label="Employee ID" value={driver.employeeId || '—'} />
            <IdentityRow icon={CreditCard} label="Licence Number" value={driver.licenseNumber || '—'} />
            <IdentityRow icon={Shield} label="Licence Class" value={driver.licenseClass || '—'} />
            <IdentityRow icon={CalendarClock} label="Licence Expiry" value={formatDate(driver.licenseExpiry)} />
            {driver.ghanaCardNumber && (
              <IdentityRow icon={CreditCard} label="Ghana Card Number" value={driver.ghanaCardNumber} />
            )}
          </div>
          <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
            These records are managed by your fleet office. Contact your fleet manager if any detail needs correction.
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl">
        <CardHeader className="flex-row items-center justify-between space-y-0 px-5 pb-2 pt-4">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FolderOpen className="h-4 w-4 text-sky-600" />
            Uploaded documents
          </CardTitle>
          {!loading && !error && (
            <Badge variant="secondary" className="text-xs">
              {documents.length}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8 text-center">
              <AlertCircle className="mb-2 h-7 w-7 text-red-500" />
              <p className="text-sm font-medium text-gray-700">Documents could not be loaded</p>
              <p className="mt-1 max-w-xs text-xs text-gray-500">{error}</p>
              <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => void loadDocuments()}>
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <FileText className="mb-2 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No uploaded documents yet</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-gray-400">
                Documents added by your fleet office will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {documents.map((document) => (
                <div key={document.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50">
                    <FileText className="h-5 w-5 text-sky-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">{document.documentName}</p>
                      <Badge variant="outline" className="hidden shrink-0 text-[10px] sm:inline-flex">
                        {DOCUMENT_LABELS[document.documentType] || document.documentType}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {formatFileSize(document.fileSize)} · Added {formatDate(document.createdAt)}
                    </p>
                    {document.notes && (
                      <p className="mt-1 line-clamp-1 text-xs text-gray-400">{document.notes}</p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => void downloadDocument(document)}
                    disabled={downloadingId === document.id}
                    aria-label={`Download ${document.documentName}`}
                  >
                    {downloadingId === document.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
