import { CURRENCY_SYMBOL, APP_NAME, APP_TAGLINE } from '@/lib/constants'

export interface WaybillData {
  trip: {
    tripNumber: string
    waybillNumber?: string | null
    status: string
    itemName: string
    quantity: number
    unit: string
    totalRevenue?: number | null
    departureTime: string
    estimatedArrival?: string | null
    createdAt?: string | null
    loadingLocation: string
    loadingAddress?: string | null
    destination: string
    destinationAddress?: string | null
    customerName?: string | null
    customerPhone?: string | null
    notes?: string | null
  }
  driver: {
    firstName: string
    lastName: string
    phone?: string | null
    licenseNumber?: string | null
    licenseClass?: string | null
  }
  truck: {
    plateNumber: string
    make: string
    model: string
    year?: number | null
    color?: string | null
  }
  deliveryStops?: Array<{
    destination: string
    expectedQty: number
    actualQty?: number | null
    unit: string
    status: string
    customerName?: string | null
  }>
}

function formatDT(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  loading: 'Loading',
  loaded: 'Loaded',
  waiting_at_depot: 'Waiting at Depot',
  departed_depot: 'Departed',
  in_transit: 'In Transit',
  arrived_destination: 'Arrived',
  waiting_to_offload: 'Waiting to Offload',
  offloading: 'Offloading',
  offloaded: 'Offloaded',
  return_journey: 'Return Journey',
  arrived_depot: 'Arrived at Depot',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function generateWaybill(data: WaybillData): void {
  const { trip, driver, truck, deliveryStops } = data
  const now = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  const statusLabel = STATUS_LABELS[trip.status] || trip.status
  const revenueStr = trip.totalRevenue ? `${CURRENCY_SYMBOL}${trip.totalRevenue.toLocaleString()}` : 'N/A'

  const deliveryStopsHtml = deliveryStops && deliveryStops.length > 0
    ? `
    <div class="section">
      <div class="section-title">Delivery Stops</div>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Destination</th>
            <th>Customer</th>
            <th>Expected Qty</th>
            <th>Actual Qty</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${deliveryStops.map((stop, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${stop.destination}</td>
              <td>${stop.customerName || '—'}</td>
              <td>${stop.expectedQty} ${stop.unit}</td>
              <td>${stop.actualQty != null ? `${stop.actualQty} ${stop.unit}` : '—'}</td>
              <td>${STATUS_LABELS[stop.status] || stop.status}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`
    : ''

  const notesHtml = trip.notes
    ? `
    <div class="section">
      <div class="section-title">Special Instructions / Notes</div>
      <p style="font-size:13px;color:#444;line-height:1.6;">${trip.notes.replace(/\n/g, '<br>')}</p>
    </div>`
    : ''

  const waybillHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Waybill - ${trip.tripNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      color: #1a1a1a;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid #f59e0b;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      color: #f59e0b;
      font-size: 24px;
      margin-bottom: 4px;
      letter-spacing: 1px;
    }
    .header p { color: #666; font-size: 12px; }
    .title-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding: 12px 16px;
      background: #1e293b;
      color: #fff;
      border-radius: 8px;
    }
    .title-bar .waybill-label {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .title-bar .waybill-meta {
      text-align: right;
      font-size: 11px;
      color: #94a3b8;
    }
    .title-bar .waybill-meta strong { color: #f59e0b; }
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .section { margin-bottom: 20px; }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #f59e0b;
      font-weight: 700;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e5e7eb;
    }
    .field { margin-bottom: 8px; }
    .field-label {
      font-size: 10px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .field-value { font-size: 14px; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
    th {
      background: #fef3c7;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #92400e;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 24px;
      margin-top: 40px;
    }
    .signature-box { text-align: center; }
    .signature-line {
      border-top: 1px solid #333;
      margin-top: 60px;
      padding-top: 8px;
      font-size: 11px;
      color: #666;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10px;
      color: #999;
      border-top: 1px solid #e5e7eb;
      padding-top: 12px;
    }
    @media print {
      body { padding: 20px; }
      .title-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${APP_NAME}</h1>
    <p>${APP_TAGLINE}</p>
  </div>

  <div class="title-bar">
    <div>
      <div class="waybill-label">WAYBILL</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${trip.tripNumber}${trip.waybillNumber ? ` / ${trip.waybillNumber}` : ''}</div>
    </div>
    <div class="waybill-meta">
      <div>Generated: <strong>${now}</strong></div>
      <div>Status: <span class="status-badge">${statusLabel}</span></div>
    </div>
  </div>

  <div class="grid">
    <div class="section">
      <div class="section-title">Consignor / Shipper</div>
      <div class="field">
        <div class="field-label">Loading Location</div>
        <div class="field-value">${trip.loadingLocation}</div>
      </div>
      ${trip.loadingAddress ? `<div class="field"><div class="field-label">Address</div><div class="field-value">${trip.loadingAddress}</div></div>` : ''}
      ${trip.customerName ? `<div class="field"><div class="field-label">Customer</div><div class="field-value">${trip.customerName}</div></div>` : ''}
      ${trip.customerPhone ? `<div class="field"><div class="field-label">Phone</div><div class="field-value">${trip.customerPhone}</div></div>` : ''}
    </div>
    <div class="section">
      <div class="section-title">Consignee / Receiver</div>
      <div class="field">
        <div class="field-label">Destination</div>
        <div class="field-value">${trip.destination}</div>
      </div>
      ${trip.destinationAddress ? `<div class="field"><div class="field-label">Address</div><div class="field-value">${trip.destinationAddress}</div></div>` : ''}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Trip Details</div>
    <table>
      <tr><th>Trip Number</th><td>${trip.tripNumber}</td></tr>
      ${trip.waybillNumber ? `<tr><th>Waybill Number</th><td>${trip.waybillNumber}</td></tr>` : ''}
      <tr><th>Departure</th><td>${formatDT(trip.departureTime)}</td></tr>
      ${trip.estimatedArrival ? `<tr><th>Est. Arrival</th><td>${formatDT(trip.estimatedArrival)}</td></tr>` : ''}
      <tr><th>Cargo</th><td>${trip.itemName}</td></tr>
      <tr><th>Quantity</th><td>${trip.quantity} ${trip.unit}</td></tr>
      <tr><th>Revenue</th><td><strong>${revenueStr}</strong></td></tr>
    </table>
  </div>

  <div class="grid">
    <div class="section">
      <div class="section-title">Driver Information</div>
      <table>
        <tr><th>Name</th><td>${driver.firstName} ${driver.lastName}</td></tr>
        ${driver.phone ? `<tr><th>Phone</th><td>${driver.phone}</td></tr>` : ''}
        ${driver.licenseNumber ? `<tr><th>License</th><td>${driver.licenseNumber}</td></tr>` : ''}
        ${driver.licenseClass ? `<tr><th>Class</th><td>${driver.licenseClass}</td></tr>` : ''}
      </table>
    </div>
    <div class="section">
      <div class="section-title">Vehicle Information</div>
      <table>
        <tr><th>Plate Number</th><td>${truck.plateNumber}</td></tr>
        <tr><th>Make / Model</th><td>${truck.make} ${truck.model}</td></tr>
        ${truck.year ? `<tr><th>Year</th><td>${truck.year}</td></tr>` : ''}
        ${truck.color ? `<tr><th>Color</th><td>${truck.color}</td></tr>` : ''}
      </table>
    </div>
  </div>

  ${deliveryStopsHtml}
  ${notesHtml}

  <div class="signatures">
    <div class="signature-box">
      <div class="signature-line">Driver's Signature</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Receiver's Signature</div>
    </div>
    <div class="signature-box">
      <div class="signature-line">Warehouse Manager</div>
    </div>
  </div>

  <div class="footer">
    ${APP_NAME} &mdash; ${APP_TAGLINE}<br>
    This is a computer-generated waybill. Generated on ${formatDate(new Date().toISOString())}.
  </div>
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=800,height=600')
  if (printWindow) {
    printWindow.document.write(waybillHtml)
    printWindow.document.close()
    printWindow.onload = () => {
      printWindow.print()
    }
  }
}
