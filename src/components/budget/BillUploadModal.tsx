'use client'

/**
 * BillUploadModal — Phase 14 Bill Upload + Spend Analysis.
 *
 * Attaches a bill image/PDF to an existing expense and runs an AI DRAFT analysis
 * from manually-entered bill fields (image OCR/vision is Coming Soon). The user
 * reviews detected-vs-confirmed values side by side and must explicitly confirm
 * before any expense field is changed — the expense amount is NEVER overwritten
 * silently.
 *
 * Bills are private to trip members and never appear on public share pages.
 */

import { useRef, useState } from 'react'
import {
  Upload, FileText, Loader2, Sparkles, AlertTriangle, Check, X, Plus, Trash2, FlaskConical, Image as ImageIcon,
} from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import {
  uploadBillImage, isAcceptedBill, BILL_ACCEPT_ATTR, MAX_BILL_BYTES,
} from '@/lib/bills/storage'
import { vendorTypeLabel, vendorTypeIcon, expenseCategoryIcon, formatCurrency } from '@/lib/utils'
import type {
  Trip, Expense, ExpenseCategory, VendorType, BillExtractedItem,
  BillAnalysisInput, BillAnalysisResponse, BillAnalysisResult, BillConfidence,
} from '@/types'

const CATEGORIES: ExpenseCategory[] = ['accommodation', 'transport', 'food', 'activities', 'shopping', 'other']
const VENDOR_TYPES: VendorType[] = ['restaurant', 'hotel', 'transport', 'tickets', 'shopping', 'emergency', 'miscellaneous']

const CONFIDENCE_META: Record<BillConfidence, { label: string; cls: string }> = {
  low: { label: 'Low confidence', cls: 'bg-amber-50 text-amber-600' },
  medium: { label: 'Medium confidence', cls: 'bg-blue-50 text-blue-600' },
  high: { label: 'High confidence', cls: 'bg-emerald-50 text-emerald-600' },
}

interface Props {
  open: boolean
  onClose: () => void
  trip: Trip
  expense: Expense
  /** Persist confirmed expense + bill fields. */
  onConfirm: (updates: Partial<Expense>) => Promise<void>
}

interface UploadedBill {
  billImageUrl: string
  billStoragePath: string
  billContentType: string
  billSizeBytes: number
  billOriginalFileName: string
}

export default function BillUploadModal({ open, onClose, trip, expense, onConfirm }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploaded, setUploaded] = useState<UploadedBill | null>(
    expense.billImageUrl && expense.billStoragePath
      ? {
          billImageUrl: expense.billImageUrl,
          billStoragePath: expense.billStoragePath,
          billContentType: expense.billContentType ?? '',
          billSizeBytes: expense.billSizeBytes ?? 0,
          billOriginalFileName: expense.billOriginalFileName ?? 'bill',
        }
      : null,
  )
  const [uploadError, setUploadError] = useState('')

  // Manual bill fields
  const [vendorName, setVendorName] = useState(expense.billExtractedVendor ?? expense.vendorName ?? '')
  const [billDate, setBillDate] = useState(expense.billExtractedDate ?? expense.date ?? '')
  const [total, setTotal] = useState(expense.billExtractedTotal != null ? String(expense.billExtractedTotal) : '')
  const [tax, setTax] = useState(expense.billExtractedTax != null ? String(expense.billExtractedTax) : '')
  const [serviceCharge, setServiceCharge] = useState('')
  const [items, setItems] = useState<BillExtractedItem[]>(expense.billExtractedItems ?? [])
  const [billNotes, setBillNotes] = useState('')

  // Analysis state
  const [analysing, setAnalysing] = useState(false)
  const [draft, setDraft] = useState<BillAnalysisResult | null>(null)
  const [isMock, setIsMock] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  // Confirmed (editable) values — default to safe non-overwriting values
  const [confirmAmount, setConfirmAmount] = useState(String(expense.amount))
  const [confirmCategory, setConfirmCategory] = useState<ExpenseCategory>(expense.category)
  const [confirmVendorType, setConfirmVendorType] = useState<VendorType | ''>(expense.vendorType ?? '')
  const [confirming, setConfirming] = useState(false)

  const travellerCount = Math.max(trip.travellers?.length ?? 1, 1)

  function handlePickFile() {
    fileRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!isAcceptedBill(file)) {
      setUploadError('Please choose a JPEG, PNG, WebP or PDF file.')
      return
    }
    if (file.size > MAX_BILL_BYTES) {
      setUploadError('File is too large (max 10 MB).')
      return
    }
    setUploadError('')
    setUploading(true)
    setProgress(0)
    try {
      const result = await uploadBillImage(trip.id, expense.id, file, setProgress)
      setUploaded(result)
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  function addItem() {
    setItems((prev) => [...prev, { name: '' }])
  }
  function updateItem(idx: number, patch: Partial<BillExtractedItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleAnalyse() {
    setAnalysing(true)
    setAnalysisError('')
    try {
      const input: BillAnalysisInput = {
        tripName: trip.name,
        destination: trip.destination,
        currency: trip.currency,
        travellerCount,
        vendorName: vendorName.trim() || undefined,
        date: billDate || undefined,
        total: total ? parseFloat(total) : undefined,
        tax: tax ? parseFloat(tax) : undefined,
        serviceCharge: serviceCharge ? parseFloat(serviceCharge) : undefined,
        items: items.filter((it) => it.name.trim()),
        notes: billNotes.trim() || undefined,
      }
      const res = await fetch('/api/ai/bill-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
        throw new Error(data.message || data.error || `Request failed (${res.status})`)
      }
      const data = (await res.json()) as BillAnalysisResponse
      setDraft(data.result)
      setIsMock(data.isMock)
      // Pre-fill confirmed category / vendor type from the draft (but NOT amount).
      setConfirmCategory(data.result.suggestedCategory)
      if (data.result.suggestedVendorType) setConfirmVendorType(data.result.suggestedVendorType)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed.')
    } finally {
      setAnalysing(false)
    }
  }

  async function handleConfirm() {
    setConfirming(true)
    try {
      const cleanItems = items.filter((it) => it.name.trim())
      const updates: Partial<Expense> = {
        amount: parseFloat(confirmAmount) || expense.amount,
        category: confirmCategory,
        date: billDate || expense.date,
        billAnalysisStatus: 'confirmed',
      }
      if (vendorName.trim()) updates.vendorName = vendorName.trim()
      if (confirmVendorType) updates.vendorType = confirmVendorType
      // Bill attachment fields
      if (uploaded) {
        updates.billImageUrl = uploaded.billImageUrl
        updates.billStoragePath = uploaded.billStoragePath
        updates.billOriginalFileName = uploaded.billOriginalFileName
        updates.billContentType = uploaded.billContentType
        updates.billSizeBytes = uploaded.billSizeBytes
        updates.billUploadedAt = new Date().toISOString()
      }
      // Draft / extracted fields
      if (draft) {
        updates.billAnalysisSummary = draft.summary
        updates.billConfidence = draft.confidence
      }
      if (vendorName.trim()) updates.billExtractedVendor = vendorName.trim()
      if (billDate) updates.billExtractedDate = billDate
      if (total) updates.billExtractedTotal = parseFloat(total)
      if (tax) updates.billExtractedTax = parseFloat(tax)
      if (cleanItems.length > 0) updates.billExtractedItems = cleanItems

      await onConfirm(updates)
      onClose()
    } catch {
      setConfirming(false)
    }
  }

  const detectedTotal = draft?.detectedTotal
  const amountChanged = parseFloat(confirmAmount) !== expense.amount
  const confidence = draft?.confidence ? CONFIDENCE_META[draft.confidence] : null

  return (
    <Modal open={open} onClose={onClose} title="Bill & Spend Analysis">
      <div className="space-y-5">

        {/* Bound expense */}
        <div className="flex items-center gap-2.5 bg-gray-50 rounded-xl px-3.5 py-2.5">
          <span className="text-lg">{expenseCategoryIcon(expense.category)}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-gray-900 truncate">{expense.title}</p>
            <p className="text-xs text-gray-400">Current amount: {formatCurrency(expense.amount, trip.currency)}</p>
          </div>
        </div>

        {/* ── Step 1: Bill image ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-gray-800">1 · Attach bill image</p>
            <span className="text-[10px] font-black text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
              Optional
            </span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={BILL_ACCEPT_ATTR}
            onChange={handleFileChange}
            className="hidden"
          />

          {uploaded ? (
            <div className="flex items-center gap-3 border border-gray-200 rounded-xl p-3">
              {uploaded.billContentType.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploaded.billImageUrl} alt="Bill" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{uploaded.billOriginalFileName}</p>
                <p className="text-xs text-emerald-600 font-medium flex items-center gap-1"><Check size={11} /> Attached (private)</p>
              </div>
              <button onClick={handlePickFile} className="text-xs font-semibold text-primary-600 hover:text-primary-700">
                Replace
              </button>
            </div>
          ) : (
            <button
              onClick={handlePickFile}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
            >
              {uploading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-xs font-semibold">Uploading… {progress}%</span>
                </>
              ) : (
                <>
                  <Upload size={20} />
                  <span className="text-xs font-semibold">Tap to upload JPEG / PNG / WebP / PDF</span>
                  <span className="text-[11px] text-gray-300">Max 10 MB · private to trip members</span>
                </>
              )}
            </button>
          )}
          {uploadError && <p className="text-xs text-red-500 font-medium mt-1.5">{uploadError}</p>}

          {/* OCR coming soon note */}
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-gray-400">
            <ImageIcon size={11} />
            Automatic reading of bill images (OCR) is <span className="font-semibold text-gray-500">Coming Soon</span> — enter details below for now.
          </div>
        </section>

        {/* ── Step 2: Manual bill fields ── */}
        <section className="space-y-3">
          <p className="text-sm font-bold text-gray-800">2 · Bill details</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Vendor" placeholder="e.g. Café Mondegar" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
            <Input label="Bill date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Total" type="number" min="0" step="0.01" placeholder="0" value={total} onChange={(e) => setTotal(e.target.value)} />
            <Input label="Tax" type="number" min="0" step="0.01" placeholder="0" value={tax} onChange={(e) => setTax(e.target.value)} />
            <Input label="Service" type="number" min="0" step="0.01" placeholder="0" value={serviceCharge} onChange={(e) => setServiceCharge(e.target.value)} />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-sm font-medium text-gray-700">Items (optional)</p>
              <button onClick={addItem} className="text-xs font-semibold text-primary-600 hover:text-primary-700 inline-flex items-center gap-1">
                <Plus size={12} /> Add item
              </button>
            </div>
            {items.length > 0 && (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      placeholder="Item name"
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    />
                    <input
                      value={it.quantity ?? ''}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Qty"
                      type="number"
                      min="0"
                      className="w-16 px-2 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    />
                    <input
                      value={it.amount ?? ''}
                      onChange={(e) => updateItem(idx, { amount: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Amt"
                      type="number"
                      min="0"
                      className="w-20 px-2 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-300"
                    />
                    <button onClick={() => removeItem(idx)} className="p-1.5 text-gray-300 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Input label="Notes (optional)" placeholder="Bill no., remarks…" value={billNotes} onChange={(e) => setBillNotes(e.target.value)} />

          <button
            onClick={handleAnalyse}
            disabled={analysing}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white text-sm font-semibold shadow-md hover:-translate-y-px transition-all disabled:opacity-60"
          >
            {analysing ? <><Loader2 size={16} className="animate-spin" /> Analysing…</> : <><Sparkles size={16} /> Analyse Bill (AI Draft)</>}
          </button>
          {analysisError && <p className="text-xs text-red-500 font-medium">{analysisError}</p>}
        </section>

        {/* ── Step 3: Review draft + confirm ── */}
        {draft && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-gray-800">3 · Review &amp; confirm</p>
              <span className="text-[10px] font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full uppercase tracking-wide">AI Draft</span>
              {confidence && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${confidence.cls}`}>{confidence.label}</span>}
            </div>

            {isMock && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <FlaskConical size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <span className="font-bold">Development mock draft.</span> Built locally from your entries, not a live AI model.
                </p>
              </div>
            )}

            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-3">{draft.summary}</p>

            {draft.warnings.length > 0 && (
              <div className="space-y-1">
                {draft.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                    <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {w}
                  </div>
                ))}
              </div>
            )}

            {/* Side-by-side: detected vs confirmed */}
            <div className="grid grid-cols-2 gap-3">
              {/* Detected (read-only) */}
              <div className="rounded-xl border border-gray-200 p-3 space-y-2 bg-gray-50/50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Detected (draft)</p>
                <DetectedRow label="Vendor" value={draft.detectedVendor ?? '—'} />
                <DetectedRow label="Date" value={draft.detectedDate ?? '—'} />
                <DetectedRow label="Total" value={detectedTotal != null ? formatCurrency(detectedTotal, trip.currency) : '—'} />
                <DetectedRow label="Tax" value={draft.detectedTax != null ? formatCurrency(draft.detectedTax, trip.currency) : '—'} />
                <DetectedRow label="Category" value={draft.suggestedCategory} />
                <DetectedRow label="Vendor type" value={vendorTypeLabel(draft.suggestedVendorType)} />
                {draft.perPersonSplit != null && (
                  <DetectedRow label={`Per person (${travellerCount})`} value={formatCurrency(draft.perPersonSplit, trip.currency)} />
                )}
              </div>

              {/* Confirmed (editable) */}
              <div className="rounded-xl border border-primary-200 p-3 space-y-2.5 bg-primary-50/30">
                <p className="text-[10px] font-black text-primary-500 uppercase tracking-wide">Confirmed (saved)</p>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Amount</label>
                  <input
                    type="number" min="0" step="0.01" value={confirmAmount}
                    onChange={(e) => setConfirmAmount(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                  {detectedTotal != null && parseFloat(confirmAmount) !== detectedTotal && (
                    <button
                      onClick={() => setConfirmAmount(String(detectedTotal))}
                      className="text-[11px] text-primary-600 hover:underline mt-1"
                    >
                      Use detected {formatCurrency(detectedTotal, trip.currency)}
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Category</label>
                  <select
                    value={confirmCategory}
                    onChange={(e) => setConfirmCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300 capitalize"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{expenseCategoryIcon(c)} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 mb-1">Vendor type</label>
                  <select
                    value={confirmVendorType}
                    onChange={(e) => setConfirmVendorType(e.target.value as VendorType | '')}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
                  >
                    <option value="">—</option>
                    {VENDOR_TYPES.map((v) => <option key={v} value={v}>{vendorTypeIcon(v)} {vendorTypeLabel(v)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {amountChanged && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
                Confirming will change this expense&apos;s amount from {formatCurrency(expense.amount, trip.currency)} to {formatCurrency(parseFloat(confirmAmount) || 0, trip.currency)}. Settlement will recalculate.
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={confirming}>
            <X size={15} /> Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={confirming || (!uploaded && !draft)}
          >
            {confirming ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Confirm &amp; Save</>}
          </Button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed">
          Nothing is saved until you confirm. AI output is an approximate draft — review every field. Bills are private to trip members and never shown on public share pages.
        </p>
      </div>
    </Modal>
  )
}

function DetectedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-700 capitalize truncate text-right">{value}</span>
    </div>
  )
}
