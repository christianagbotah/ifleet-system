import type { Prisma } from "@/generated/client"

export async function reserveTripNumber(
  tx: Prisma.TransactionClient,
  at: Date,
): Promise<string> {
  const year = at.getUTCFullYear()
  const sequence = await tx.tripSequence.upsert({
    where: { year },
    create: { year, lastValue: 1 },
    update: { lastValue: { increment: 1 } },
    select: { lastValue: true },
  })

  return `TRP-${year}-${String(sequence.lastValue).padStart(3, "0")}`
}
