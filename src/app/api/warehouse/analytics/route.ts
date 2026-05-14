import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    requireAuth(request)

    const totalItems = await db.warehouseItem.count({ where: { status: { not: 'discontinued' } } })
    const allItems = await db.warehouseItem.findMany({
      where: { status: { not: 'discontinued' } },
      select: { category: true, quantity: true, unitPrice: true, status: true, lastRestocked: true, warehouse: true },
    })

    // Total inventory value = sum of (quantity * unitPrice)
    const totalValue = allItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)

    // Items by category
    const categoryMap: Record<string, { count: number; value: number }> = {}
    for (const item of allItems) {
      if (!categoryMap[item.category]) categoryMap[item.category] = { count: 0, value: 0 }
      categoryMap[item.category].count += 1
      categoryMap[item.category].value += item.quantity * item.unitPrice
    }
    const itemsByCategory = Object.entries(categoryMap).map(([category, data]) => ({
      category,
      count: data.count,
      value: data.value,
    }))

    // Low stock alerts
    const lowStockItems = allItems.filter(item => item.quantity <= 0 || item.status === 'low_stock' || item.status === 'out_of_stock')
    const lowStockAlerts = lowStockItems.length

    // Status distribution
    const statusMap: Record<string, number> = {}
    for (const item of allItems) {
      statusMap[item.status] = (statusMap[item.status] || 0) + 1
    }
    const statusDistribution = Object.entries(statusMap).map(([status, count]) => ({ status, count }))

    // Restock trends (items restocked in last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const restockedItems = await db.warehouseItem.findMany({
      where: { lastRestocked: { gte: sixMonthsAgo } },
      select: { lastRestocked: true },
    })
    const monthMap: Record<string, number> = {}
    for (const item of restockedItems) {
      if (item.lastRestocked) {
        const key = `${item.lastRestocked.getFullYear()}-${String(item.lastRestocked.getMonth() + 1).padStart(2, '0')}`
        monthMap[key] = (monthMap[key] || 0) + 1
      }
    }
    const restockTrends = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }))

    // Unique categories
    const uniqueCategories = new Set(allItems.map(item => item.category))

    // Unique warehouses
    const uniqueWarehouses = new Set(allItems.map(item => item.warehouse))

    // Out of stock count
    const outOfStockCount = allItems.filter(item => item.status === 'out_of_stock' || item.quantity <= 0).length

    return NextResponse.json({
      totalItems,
      totalValue,
      lowStockAlerts,
      outOfStockCount,
      categoryCount: uniqueCategories.size,
      warehouseCount: uniqueWarehouses.size,
      itemsByCategory,
      statusDistribution,
      restockTrends,
    })
  } catch (error) {
    console.error('Warehouse analytics error:', error)
    return NextResponse.json({ error: 'Failed to fetch warehouse analytics' }, { status: 500 })
  }
}
