import { db } from '@/lib/db'

import type {
  FuelReviewCaseCreateInput,
  FuelReviewCaseSummary,
  FuelReviewRepository,
  FuelReviewResolutionInput,
} from './fuel-review'

export class PrismaFuelReviewRepository implements FuelReviewRepository {
  async findOpenBySubject(subjectId: string): Promise<FuelReviewCaseSummary | null> {
    return db.aiReviewCase.findFirst({
      where: {
        caseType: 'fuel_anomaly',
        subjectType: 'FuelLog',
        subjectId,
        status: { in: ['open', 'escalated'] },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(input: FuelReviewCaseCreateInput): Promise<FuelReviewCaseSummary> {
    return db.aiReviewCase.create({ data: input })
  }

  async findById(id: string): Promise<FuelReviewCaseSummary | null> {
    return db.aiReviewCase.findUnique({ where: { id } })
  }

  async updateResolution(id: string, input: FuelReviewResolutionInput): Promise<FuelReviewCaseSummary> {
    return db.aiReviewCase.update({ where: { id }, data: input })
  }
}
