import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

const VALID_ACTIONS = ['delete', 'mark_sent', 'mark_paid'] as const

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { action, ids } = body as { action?: string; ids?: string[] }

    if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      )
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot process more than 100 items at once' }, { status: 400 })
    }

    // Fetch all invoices for validation
    const invoices = await db.invoice.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
      },
    })

    let success = 0
    let failed = 0
    const errors: { id: string; message: string }[] = []

    for (const id of ids) {
      const invoice = invoices.find(inv => inv.id === id)

      if (!invoice) {
        failed++
        errors.push({ id, message: 'Invoice not found' })
        continue
      }

      // Cannot modify paid invoices
      if (invoice.status === 'paid') {
        failed++
        errors.push({
          id,
          message: `Cannot modify paid invoice ${invoice.invoiceNumber}`,
        })
        continue
      }

      if (action === 'delete') {
        // Delete invoice (only draft/cancelled allowed)
        if (invoice.status !== 'draft' && invoice.status !== 'cancelled') {
          failed++
          errors.push({
            id,
            message: `Cannot cancel invoice ${invoice.invoiceNumber} with status "${invoice.status}". Only draft/cancelled invoices can be deleted.`,
          })
          continue
        }

        await db.invoice.delete({ where: { id } })

        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'Invoice',
          entityId: id,
          details: { invoiceNumber: invoice.invoiceNumber, previousStatus: invoice.status, bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'mark_sent') {
        if (invoice.status !== 'draft') {
          failed++
          errors.push({
            id,
            message: `Cannot mark invoice ${invoice.invoiceNumber} as sent. Only draft invoices can be sent.`,
          })
          continue
        }

        await db.invoice.update({
          where: { id },
          data: { status: 'sent' },
        })

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Invoice',
          entityId: id,
          details: { invoiceNumber: invoice.invoiceNumber, previousStatus: invoice.status, newStatus: 'sent', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      } else if (action === 'mark_paid') {
        if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
          failed++
          errors.push({
            id,
            message: `Cannot mark invoice ${invoice.invoiceNumber} as paid. Only sent/overdue invoices can be marked as paid.`,
          })
          continue
        }

        await db.invoice.update({
          where: { id },
          data: { status: 'paid', paidAmount: { increment: undefined } },
        })

        // Set paidAmount to totalAmount if not already fully paid
        const updatedInvoice = await db.invoice.findUnique({ where: { id }, select: { totalAmount: true, paidAmount: true } })
        if (updatedInvoice && updatedInvoice.paidAmount < updatedInvoice.totalAmount) {
          await db.invoice.update({
            where: { id },
            data: { paidAmount: updatedInvoice.totalAmount },
          })
        }

        createAuditLog({
          userId: auth.userId,
          action: 'update',
          entity: 'Invoice',
          entityId: id,
          details: { invoiceNumber: invoice.invoiceNumber, previousStatus: invoice.status, newStatus: 'paid', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})

        success++
      }
    }

    return NextResponse.json({ success, failed, errors })
  } catch (error) {
    console.error('Bulk invoice action error:', error)
    return NextResponse.json({ error: 'Failed to perform bulk action on invoices' }, { status: 500 })
  }
}
