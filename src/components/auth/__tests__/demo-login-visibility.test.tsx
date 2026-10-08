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
      new Response(JSON.stringify({ enabled: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<DemoLoginPanel />)

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith('/api/auth/demo-login'))
    expect(screen.queryByText('Explore iFleetPro')).not.toBeInTheDocument()
  })

  it('shows the six-role chooser when the server explicitly enables demo access', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ enabled: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    render(<DemoLoginPanel />)

    expect(await screen.findByText('Explore iFleetPro')).toBeInTheDocument()
    expect(screen.getAllByText('Fleet Manager').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Dispatcher')).toBeInTheDocument()
    expect(screen.getByText('Driver')).toBeInTheDocument()
    expect(screen.getByText('Mechanic')).toBeInTheDocument()
    expect(screen.getByText('Accountant')).toBeInTheDocument()
  })
})
