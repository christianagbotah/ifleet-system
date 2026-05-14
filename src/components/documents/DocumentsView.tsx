'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  Search,
  Plus,
  Download,
  Eye,
  X,
  Loader2,
  FolderOpen,
  AlertCircle,
  Paperclip,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { fetchDocuments, uploadDocument, deleteDocument, getDocumentPreviewUrl, getDocumentDownloadUrl, type Document } from '@/lib/api'
import { useAuthStore } from '@/lib/store/auth'
import { toast } from 'sonner'

// ============ Constants ============

const CATEGORIES = [
  { value: 'all', label: 'All Documents' },
  { value: 'receipt', label: 'Receipts' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'waybill', label: 'Waybills' },
  { value: 'maintenance_report', label: 'Maintenance' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'license', label: 'Licenses' },
  { value: 'ghana_card', label: 'Ghana Card' },
  { value: 'other', label: 'Other' },
] as const

const CATEGORY_COLORS: Record<string, string> = {
  receipt: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  invoice: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  waybill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  maintenance_report: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  insurance: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  license: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  ghana_card: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return { icon: ImageIcon, label: 'Image' }
  if (mimeType === 'application/pdf') return { icon: FileText, label: 'PDF' }
  if (mimeType.includes('word')) return { icon: File, label: 'Word' }
  return { icon: Paperclip, label: 'File' }
}

function isPreviewable(mimeType: string): boolean {
  const previewableTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ]
  return previewableTypes.includes(mimeType)
}

// ============ Skeleton Loader ============

function DocumentSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ Main Component ============

export function DocumentsView() {
  const { user } = useAuthStore()
  const canWrite = user
    ? user.role === 'Admin' || user.role === 'Manager'
    : false

  const [documents, setDocuments] = React.useState<Document[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [activeCategory, setActiveCategory] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [summary, setSummary] = React.useState<Record<string, number>>({})

  // Upload dialog
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = React.useState<Document | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // Preview dialog
  const [previewDoc, setPreviewDoc] = React.useState<Document | null>(null)

  const loadDocuments = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchDocuments({
        category: activeCategory === 'all' ? undefined : activeCategory,
        search: searchQuery || undefined,
        page,
        limit: 24,
      })
      setDocuments(result.data)
      setTotal(result.total || 0)
      if (result.summary) setSummary(result.summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [activeCategory, searchQuery, page])

  React.useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  // Handle file selection
  const handleFileSelect = (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!allowed.includes(file.type)) {
      toast.error('File type not supported')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large (max 10MB)')
      return
    }
    setSelectedFile(file)
  }

  // Handle upload
  async function handleUpload() {
    if (!selectedFile) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('title', selectedFile.name)
      formData.append('category', uploadCategory)
      if (uploadDescription) formData.append('description', uploadDescription)
      if (uploadEntityType) formData.append('entityType', uploadEntityType)
      if (uploadEntityId) formData.append('entityId', uploadEntityId)

      await uploadDocument(formData)
      toast.success('Document uploaded successfully')
      setUploadOpen(false)
      resetUploadForm()
      loadDocuments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // Upload form state
  const [uploadCategory, setUploadCategory] = React.useState('other')
  const [uploadDescription, setUploadDescription] = React.useState('')
  const [uploadEntityType, setUploadEntityType] = React.useState('')
  const [uploadEntityId, setUploadEntityId] = React.useState('')

  const resetUploadForm = () => {
    setSelectedFile(null)
    setUploadCategory('other')
    setUploadDescription('')
    setUploadEntityType('')
    setUploadEntityId('')
    setDragOver(false)
  }

  // Handle delete
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteDocument(deleteTarget.id)
      toast.success('Document deleted')
      setDeleteTarget(null)
      loadDocuments()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  // Handle download
  const handleDownload = async (doc: Document) => {
    try {
      const response = await fetch(`/api/documents/${doc.id}/download`)
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Download started')
    } catch {
      toast.error('Failed to download document')
    }
  }

  // Handle preview
  const handlePreview = async (doc: Document) => {
    if (!isPreviewable(doc.mimeType)) {
      toast.error('Preview not available for this file type')
      return
    }
    setPreviewDoc(doc)
  }

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }
  const handleDragLeave = () => setDragOver(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  const totalPages = Math.ceil(total / 24)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Upload and manage receipts, invoices, waybills, and other fleet documents
          </p>
        </div>
        {canWrite && (
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Upload className="mr-2 h-4 w-4" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
          className="pl-9"
        />
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const count = cat.value === 'all' ? total : (summary[cat.value] || 0)
          return (
            <button
              key={cat.value}
              onClick={() => { setActiveCategory(cat.value); setPage(1) }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.value
                  ? 'bg-amber-500 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {cat.label}
              <span
                className={`ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs ${
                  activeCategory === cat.value
                    ? 'bg-white/20 text-white'
                    : 'bg-muted-foreground/10 text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Error State */}
      {error && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-950/30"
        >
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <Button variant="outline" size="sm" onClick={loadDocuments}>
            Try Again
          </Button>
        </motion.div>
      )}

      {/* Empty State */}
      {!loading && !error && documents.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center gap-4 py-16"
        >
          <div className="rounded-full bg-muted p-4">
            <FolderOpen className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-medium">No documents found</p>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? 'Try adjusting your search query'
                : 'Upload your first document to get started'}
            </p>
          </div>
          {canWrite && !searchQuery && (
            <Button
              onClick={() => setUploadOpen(true)}
              variant="outline"
              className="mt-2"
            >
              <Plus className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          )}
        </motion.div>
      )}

      {/* Document Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <DocumentSkeleton key={i} />
          ))}
        </div>
      ) : documents.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {documents.map((doc) => {
              const { icon: FileIcon } = getFileIcon(doc.mimeType)
              return (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* File type icon */}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                            doc.mimeType.startsWith('image/')
                              ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : doc.mimeType === 'application/pdf'
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}
                        >
                          <FileIcon className="h-5 w-5" />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <p className="truncate text-sm font-medium">{doc.title}</p>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p>{doc.title}</p>
                                {doc.description && <p className="mt-1 text-xs opacity-80">{doc.description}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}
                            >
                              {doc.category.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatFileSize(doc.fileSize)}
                            </span>
                          </div>

                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {formatDate(doc.createdAt)}
                          </p>

                          {doc.entityType && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              Linked to: {doc.entityType.replace(/_/g, ' ')}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex items-center gap-1 border-t pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-muted-foreground hover:text-amber-600"
                          onClick={() => handleDownload(doc)}
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>

                        {isPreviewable(doc.mimeType) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-amber-600"
                            onClick={() => handlePreview(doc)}
                            title="Preview"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-muted-foreground hover:text-red-600 ml-auto"
                            onClick={() => setDeleteTarget(doc)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </motion.div>
      ) : null}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} documents)
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(open) => { setUploadOpen(open); if (!open) resetUploadForm() }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload receipts, invoices, waybills, and other fleet documents.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            {/* Drag and drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
                dragOver
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                  : selectedFile
                    ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20'
                    : 'border-muted hover:border-amber-300 hover:bg-muted/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
              {selectedFile ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <FileText className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-red-500"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null) }}
                  >
                    <X className="mr-1 h-3 w-3" />
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium">
                      Drag & drop or click to select
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Images, PDF, Word (max 10MB)
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Category *</label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description (optional)</label>
              <Textarea
                placeholder="Brief description of the document..."
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Entity Link (optional) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Entity Type (optional)</label>
                <Select value={uploadEntityType} onValueChange={setUploadEntityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="driver">Driver</SelectItem>
                    <SelectItem value="trip">Trip</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="fuel_log">Fuel Log</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="insurance">Insurance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {uploadEntityType && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Entity ID</label>
                  <Input
                    placeholder="e.g., truck ID"
                    value={uploadEntityId}
                    onChange={(e) => setUploadEntityId(e.target.value)}
                  />
                </div>
              )}
            </div>
          </DialogBody>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setUploadOpen(false); resetUploadForm() }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null) }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{previewDoc?.title || 'Document Preview'}</DialogTitle>
            {previewDoc?.description && (
              <DialogDescription>{previewDoc.description}</DialogDescription>
            )}
          </DialogHeader>

          <DialogBody className="flex items-center justify-center">
            {previewDoc && isPreviewable(previewDoc.mimeType) ? (
              previewDoc.mimeType === 'application/pdf' ? (
                <iframe
                  src={getDocumentPreviewUrl(previewDoc.id)}
                  className="h-[70vh] w-full rounded-md border"
                  title={previewDoc.title}
                />
              ) : (
                <img
                  src={getDocumentPreviewUrl(previewDoc.id)}
                  alt={previewDoc.title}
                  className="max-h-[70vh] w-auto rounded-md border object-contain"
                />
              )
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <FileText className="h-12 w-12" />
                <p>Preview not available for this file type</p>
                <p className="text-xs">Supported: PDF, JPEG, PNG, GIF, WebP</p>
              </div>
            )}
          </DialogBody>

          {previewDoc && (
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setPreviewDoc(null)}
              >
                Close
              </Button>
              <Button
                onClick={() => handleDownload(previewDoc)}
                className="bg-amber-500 hover:bg-amber-600 text-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
