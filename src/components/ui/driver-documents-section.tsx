'use client'

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, differenceInDays } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Paperclip,
  Upload,
  FileText,
  Image,
  Download,
  Trash2,
  AlertTriangle,
  X,
  File,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast-config'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ─── Data Types ────────────────────────────────────────────────────────────

interface DriverDocument {
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
}

// ─── Constants ─────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: 'license', label: "Driver's License" },
  { value: 'insurance', label: 'Insurance' },
  { value: 'background_check', label: 'Background Check' },
  { value: 'medical', label: 'Medical Certificate' },
  { value: 'other', label: 'Other' },
] as const

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50',
  expired: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50',
  revoked: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:border-gray-700/50',
}

const typeColors: Record<string, string> = {
  license: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  insurance: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  background_check: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  medical: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400',
}

const typeLabels: Record<string, string> = {
  license: "License",
  insurance: "Insurance",
  background_check: "BG Check",
  medical: "Medical",
  other: "Other",
}

const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.doc,.docx'

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image
  return FileText
}

function getExpiryInfo(expiryDate: string | null): { days: number; isExpired: boolean; isExpiringSoon: boolean } | null {
  if (!expiryDate) return null
  const days = differenceInDays(new Date(expiryDate), new Date())
  return {
    days,
    isExpired: days < 0,
    isExpiringSoon: days >= 0 && days <= 30,
  }
}

// ─── Upload Form State ─────────────────────────────────────────────────────

interface UploadFormState {
  documentType: string
  documentName: string
  file: File | null
  expiryDate: string
  notes: string
}

const initialFormState: UploadFormState = {
  documentType: '',
  documentName: '',
  file: null,
  expiryDate: '',
  notes: '',
}

// ─── Main Component ────────────────────────────────────────────────────────

interface DriverDocumentsSectionProps {
  driverId: string
  driverName: string
}

export function DriverDocumentsSection({ driverId, driverName }: DriverDocumentsSectionProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DriverDocument | null>(null)
  const [form, setForm] = useState<UploadFormState>(initialFormState)
  const [isUploading, setIsUploading] = useState(false)

  // ── Fetch documents ──
  const { data: documents = [], isLoading } = useQuery<DriverDocument[]>({
    queryKey: ['driver-documents', driverId],
    queryFn: async () => {
      const res = await fetch(`/api/drivers/${driverId}/documents`)
      if (!res.ok) throw new Error('Failed to fetch documents')
      return res.json()
    },
    enabled: !!driverId,
    staleTime: 30_000,
  })

  // ── Upload mutation ──
  const uploadMutation = useMutation({
    mutationFn: async (data: { formData: UploadFormState; base64: string }) => {
      const file = data.formData.file!
      const res = await fetch(`/api/drivers/${driverId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: data.formData.documentType,
          documentName: data.formData.documentName,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          fileData: data.base64,
          expiryDate: data.formData.expiryDate || null,
          notes: data.formData.notes || null,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-documents', driverId] })
      toast.success('Document uploaded successfully')
      setForm(initialFormState)
      setUploadOpen(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload document')
    },
  })

  // ── Delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      const res = await fetch(`/api/drivers/${driverId}/documents/${docId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete document')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-documents', driverId] })
      toast.success('Document deleted')
      setDeleteOpen(false)
      setDeleteTarget(null)
    },
    onError: () => {
      toast.error('Failed to delete document')
    },
  })

  // ── File to base64 ──
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
    })
  }

  // ── Handle file select ──
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error('File exceeds 5MB size limit')
        return
      }
      setForm((prev) => ({
        ...prev,
        file,
        documentName: prev.documentName || file.name.replace(/\.[^/.]+$/, ''),
      }))
    }
  }, [])

  // ── Handle submit ──
  const handleSubmit = async () => {
    if (!form.documentType) {
      toast.error('Please select a document type')
      return
    }
    if (!form.documentName.trim()) {
      toast.error('Please enter a document name')
      return
    }
    if (!form.file) {
      toast.error('Please select a file')
      return
    }

    setIsUploading(true)
    try {
      const base64 = await fileToBase64(form.file)
      await uploadMutation.mutateAsync({ formData: form, base64 })
    } catch {
      // error handled by mutation onError
    } finally {
      setIsUploading(false)
    }
  }

  // ── Handle download ──
  const handleDownload = async (doc: DriverDocument) => {
    try {
      const res = await fetch(`/api/drivers/${driverId}/documents/${doc.id}`)
      if (!res.ok) throw new Error('Failed to fetch document')
      const fullDoc = await res.json()

      // Convert base64 to blob and trigger download
      const byteString = atob(fullDoc.fileData.split(',')[1] || fullDoc.fileData)
      const mimeType = fullDoc.mimeType || 'application/octet-stream'
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Failed to download document')
    }
  }

  // ── Handle delete ──
  const handleDelete = (doc: DriverDocument) => {
    setDeleteTarget(doc)
    setDeleteOpen(true)
  }

  const confirmDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Documents
        </h3>
        <Dialog open={uploadOpen} onOpenChange={(open) => {
          setUploadOpen(open)
          if (!open) setForm(initialFormState)
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Paperclip className="size-3" />
              Upload
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
              <DialogDescription>
                Upload a document for {driverName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Document Type */}
              <div className="space-y-1.5">
                <Label htmlFor="doc-type" className="text-xs">Document Type</Label>
                <Select
                  value={form.documentType}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, documentType: v }))}
                >
                  <SelectTrigger className="w-full" id="doc-type">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((dt) => (
                      <SelectItem key={dt.value} value={dt.value}>
                        {dt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Document Name */}
              <div className="space-y-1.5">
                <Label htmlFor="doc-name" className="text-xs">Document Name</Label>
                <Input
                  id="doc-name"
                  placeholder="e.g., Driver's License - Emmanuel Owusu"
                  value={form.documentName}
                  onChange={(e) => setForm((prev) => ({ ...prev, documentName: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>

              {/* File Input */}
              <div className="space-y-1.5">
                <Label className="text-xs">File</Label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors',
                    'hover:border-primary/50 hover:bg-muted/50',
                    'dark:hover:border-primary/40',
                    form.file ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-900/10' : 'border-muted-foreground/25'
                  )}
                >
                  {form.file ? (
                    <>
                      <FileText className="size-5 text-emerald-600 dark:text-emerald-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{form.file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(form.file.size)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          setForm((prev) => ({ ...prev, file: null }))
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                      >
                        <X className="size-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="size-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Click to select a file
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          PDF, JPG, PNG, DOC, DOCX — Max 5MB
                        </p>
                      </div>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES}
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Expiry Date */}
              <div className="space-y-1.5">
                <Label htmlFor="doc-expiry" className="text-xs">
                  Expiry Date <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="doc-expiry"
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="doc-notes" className="text-xs">
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="doc-notes"
                  placeholder="Any additional notes..."
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="text-sm min-h-[60px]"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadOpen(false)
                  setForm(initialFormState)
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isUploading || !form.documentType || !form.documentName || !form.file}
              >
                {isUploading ? (
                  <>
                    <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-muted-foreground">
          <div className="size-12 rounded-full bg-muted/80 dark:bg-muted/40 flex items-center justify-center mb-3">
            <FileText className="size-5 opacity-40" />
          </div>
          <p className="text-sm font-medium">No documents uploaded</p>
          <p className="text-xs mt-1 opacity-70">
            Click Upload to add license, insurance, or other documents
          </p>
        </div>
      ) : (
        <AnimatePresence mode="popLayout">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {documents.map((doc, idx) => {
              const FileIcon = getFileIcon(doc.mimeType)
              const expiryInfo = getExpiryInfo(doc.expiryDate)

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  className={cn(
                    'group relative rounded-lg border p-3 transition-colors',
                    'hover:bg-muted/50 dark:hover:bg-muted/30',
                    doc.status === 'expired'
                      ? 'border-red-200 dark:border-red-800/40'
                      : 'border-border'
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {/* File icon */}
                    <div className={cn(
                      'flex-shrink-0 size-9 rounded-md flex items-center justify-center',
                      doc.mimeType.startsWith('image/')
                        ? 'bg-emerald-100 dark:bg-emerald-900/30'
                        : 'bg-blue-100 dark:bg-blue-900/30'
                    )}>
                      <FileIcon className={cn(
                        'size-4',
                        doc.mimeType.startsWith('image/')
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-blue-600 dark:text-blue-400'
                      )} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-sm font-medium truncate" title={doc.documentName}>
                        {doc.documentName}
                      </p>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0 h-4', typeColors[doc.documentType] || '')}
                        >
                          {typeLabels[doc.documentType] || doc.documentType}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 py-0 h-4', statusColors[doc.status] || '')}
                        >
                          {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>·</span>
                        <span>{format(new Date(doc.createdAt), 'MMM d, yyyy')}</span>
                      </div>

                      {/* Expiry warning */}
                      {expiryInfo && expiryInfo.isExpired && (
                        <div className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-medium">
                          <AlertTriangle className="size-3" />
                          Expired {Math.abs(expiryInfo.days)} days ago
                        </div>
                      )}
                      {expiryInfo && !expiryInfo.isExpired && expiryInfo.isExpiringSoon && (
                        <div className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                          <AlertTriangle className="size-3" />
                          Expires in {expiryInfo.days} day{expiryInfo.days !== 1 ? 's' : ''}
                        </div>
                      )}
                      {expiryInfo && !expiryInfo.isExpired && !expiryInfo.isExpiringSoon && (
                        <div className="text-[10px] text-muted-foreground">
                          Expires {format(new Date(doc.expiryDate!), 'MMM d, yyyy')}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleDownload(doc)}
                        title="Download"
                      >
                        <Download className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                        onClick={() => handleDelete(doc)}
                        title="Delete"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </AnimatePresence>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.documentName}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
