import type { Expense, Traveller } from '@/types'

export function roundCurrency(amount: number): number {
  return Math.round(amount)
}

export interface TravellerBalance {
  travellerId: string
  name: string
  color: string
  totalPaid: number
  totalOwed: number
  net: number
}

export interface Settlement {
  from: string
  fromName: string
  fromColor: string
  to: string
  toName: string
  toColor: string
  amount: number
}

export function getTravellerBalances(
  expenses: Expense[],
  travellers: Traveller[]
): TravellerBalance[] {
  return travellers.map((traveller) => {
    const totalPaid = expenses
      .filter((e) => e.paidByTravellerId === traveller.id)
      .reduce((sum, e) => sum + e.amount, 0)

    const totalOwed = expenses
      .filter((e) => {
        const parts = e.participants ?? travellers.map((t) => t.id)
        return parts.includes(traveller.id)
      })
      .reduce((sum, e) => {
        const parts = e.participants ?? travellers.map((t) => t.id)
        return sum + e.amount / parts.length
      }, 0)

    return {
      travellerId: traveller.id,
      name: traveller.name,
      color: traveller.color,
      totalPaid,
      totalOwed: roundCurrency(totalOwed),
      net: roundCurrency(totalPaid - totalOwed),
    }
  })
}

export function getSettlementSummary(balances: TravellerBalance[]): Settlement[] {
  const settlements: Settlement[] = []
  const creditors = balances.filter((b) => b.net > 0).map((b) => ({ ...b }))
  const debtors = balances.filter((b) => b.net < 0).map((b) => ({ ...b }))

  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]
    const creditor = creditors[j]
    const amount = Math.min(Math.abs(debtor.net), creditor.net)

    if (amount > 0) {
      settlements.push({
        from: debtor.travellerId,
        fromName: debtor.name,
        fromColor: debtor.color,
        to: creditor.travellerId,
        toName: creditor.name,
        toColor: creditor.color,
        amount: roundCurrency(amount),
      })
    }

    debtor.net += amount
    creditor.net -= amount

    if (Math.abs(debtor.net) < 1) i++
    if (creditor.net < 1) j++
  }

  return settlements
}
