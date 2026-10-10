import type { AssignmentWeights } from './assignment'

export const ASSIGNMENT_RECOMMENDATION_CONFIG: {
  modelKey: string
  modelVersion: string
  configVersion: string
  weights: AssignmentWeights
  maxDrivers: number
  maxTractors: number
  maxRecommendations: number
} = {
  modelKey: 'deterministic-assignment',
  modelVersion: '1.0.0',
  configVersion: 'ghana-haulage-v1',
  weights: {
    deadhead: 0.18,
    suitability: 0.12,
    maintenanceHealth: 0.14,
    driverHours: 0.12,
    routeExperience: 0.12,
    fuelEfficiency: 0.10,
    onTime: 0.10,
    projectedMargin: 0.12,
  },
  maxDrivers: 20,
  maxTractors: 20,
  maxRecommendations: 8,
}
