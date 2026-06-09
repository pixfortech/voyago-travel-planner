import type { Expense, Traveller, Trip } from '@/types'
import {
  getTravellerBalances,
  getSettlementSummary,
} from '@/lib/calculations'

function escapeCSV(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(...cells: (string | number | undefined | null)[]): string {
  return cells.map(escapeCSV).join(',')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

export function downloadExpensesCSV(expenses: Expense[], trip: Trip) {
  const lines: string[] = [
    row(
      'Date', 'Title', 'Category', 'Amount', 'Currency', 'Paid By', 'Vendor', 'Vendor Type',
      'Location', 'Notes', 'Bill Attached', 'Bill Vendor', 'Bill Total', 'Bill Confidence',
    ),
  ]
  const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date))
  for (const e of sorted) {
    const hasBill = !!e.billImageUrl || e.billAnalysisStatus === 'confirmed'
    lines.push(row(
      e.date,
      e.title,
      e.category,
      e.amount,
      trip.currency,
      e.paidByName ?? '',
      e.vendorName ?? '',
      e.vendorType ?? '',
      e.locationName ?? '',
      e.notes,
      hasBill ? 'Yes' : 'No',
      e.billExtractedVendor ?? '',
      e.billExtractedTotal ?? '',
      e.billConfidence ?? '',
    ))
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const safe = trip.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  downloadBlob(blob, `${safe}_expenses.csv`)
}

export function downloadSettlementCSV(expenses: Expense[], travellers: Traveller[], trip: Trip) {
  const balances = getTravellerBalances(expenses, travellers)
  const settlements = getSettlementSummary(balances)

  const lines: string[] = [
    row('From', 'To', 'Amount', 'Currency'),
  ]
  for (const s of settlements) {
    lines.push(row(s.fromName, s.toName, s.amount, trip.currency))
  }

  if (settlements.length === 0) {
    lines.push(row('(no settlements needed)', '', '', ''))
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const safe = trip.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  downloadBlob(blob, `${safe}_settlements.csv`)
}
