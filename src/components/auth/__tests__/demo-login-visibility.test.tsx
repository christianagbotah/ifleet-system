import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DemoLoginPanel } from '../DemoLoginPanel'

describe('DemoLoginPanel visibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('stays hidden when the server has not enabled demo access', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ enabled: false, profiles: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<DemoLoginPanel />)

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/demo-login'))
    expect(screen.queryByText('Explore iFleetPro')).not.toBeInTheDocument()
  })

  it('renders exactly the runtime profiles returned by the server', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        enabled: true,
        profiles: [
          {
            key: 'operations-preview',
            label: 'Operations Preview',
            role: 'Dispatcher',
            description: 'Read-only operations preview',
            capability: 'Dispatch operations',
            position: null,
            department: 'Operations',
            order: 10,
          },
          {
            key: 'finance-preview',
            label: 'Finance Preview',
            role: 'Accountant',
            description: 'Read-only finance preview',
            capability: 'Finance reporting',
            position: null,
            department: 'Finance',
            order: 20,
          },
        ],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<DemoLoginPanel />)

    expect(await screen.findByText('Explore iFleetPro')).toBeInTheDocument()
    expect(screen.getAllByText('Operations Preview').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Finance Preview')).toBeInTheDocument()
    expect(screen.queryByText('Fleet Manager')).not.toBeInTheDocument()
  })
})
