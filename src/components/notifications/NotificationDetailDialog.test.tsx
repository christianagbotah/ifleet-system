import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NotificationDetailDialog } from '@/components/notifications/NotificationDetailDialog'
import type { Notification } from '@/lib/api'

const baseNotification: Notification = {
  id: 'notification-1',
  userId: 'user-1',
  type: 'trip_departed',
  title: 'Trip departed',
  message: 'Truck left the depot',
  channel: 'in_app',
  isRead: true,
  metadata: null,
  createdAt: '2026-10-23T10:00:00.000Z',
}

function renderDialog(notification: Notification) {
  return render(
    <NotificationDetailDialog
      notification={notification}
      open
      onOpenChange={vi.fn()}
    />,
  )
}

describe('NotificationDetailDialog channel truth', () => {
  it('labels provider acceptance and live push without claiming final recipient delivery', () => {
    renderDialog({
      ...baseNotification,
      smsSent: true,
      smsSentAt: '2026-10-23T10:00:01.000Z',
      emailSent: true,
      emailSentAt: '2026-10-23T10:00:02.000Z',
      pushSent: true,
      pushSentAt: '2026-10-23T10:00:03.000Z',
    })

    expect(screen.getByText('Channel status')).toBeInTheDocument()
    expect(screen.getByText('In-app saved')).toBeInTheDocument()
    expect(screen.getByText('SMS accepted')).toBeInTheDocument()
    expect(screen.getByText('Email accepted')).toBeInTheDocument()
    expect(screen.getByText('Live push sent')).toBeInTheDocument()
    expect(screen.queryByText('Delivered via')).not.toBeInTheDocument()
  })

  it('shows generic failed-attempt labels without exposing raw provider errors', () => {
    renderDialog({
      ...baseNotification,
      smsSent: false,
      smsError: 'Hubtel rejected recipient 0240000000 with provider code 42',
      emailSent: false,
      emailError: 'SMTP authentication rejected for internal-account@example.com',
      pushSent: false,
    })

    expect(screen.getByText('SMS failed')).toBeInTheDocument()
    expect(screen.getByText('Email failed')).toBeInTheDocument()
    expect(screen.queryByText(/provider code 42/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/internal-account@example.com/i)).not.toBeInTheDocument()
  })
})
