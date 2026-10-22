import React from 'react'
import { render, screen } from '@testing-library/react'
import { Truck } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { StatsCard } from '../stats-card'

describe('StatsCard', () => {
  it('renders neutral operational context without inventing a percentage trend', () => {
    render(React.createElement(StatsCard as React.ComponentType<any>, {
      icon: Truck,
      title: 'Active Trucks',
      value: '7',
      context: '7 of 10 fleet active',
    }))

    expect(screen.getByText('7 of 10 fleet active')).toBeInTheDocument()
    expect(screen.queryByText(/0\.0%/)).not.toBeInTheDocument()
    expect(document.querySelector('.lucide-arrow-up')).toBeNull()
    expect(document.querySelector('.lucide-arrow-down')).toBeNull()
  })

  it('continues to render a real percentage trend when change data is supplied', () => {
    render(
      <StatsCard
        icon={Truck}
        title="Revenue"
        value="₵125K"
        change={25}
        changeLabel="vs last month"
      />,
    )

    expect(screen.getByText('25.0%')).toBeInTheDocument()
    expect(screen.getByText('vs last month')).toBeInTheDocument()
    expect(document.querySelector('.lucide-arrow-up')).not.toBeNull()
  })
})
