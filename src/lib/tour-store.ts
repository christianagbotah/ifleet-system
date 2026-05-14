import { create } from 'zustand'

const STORAGE_KEY = 'ifleetpro-tour-completed'

function loadCompletedSteps(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return new Set(JSON.parse(stored) as string[])
    }
  } catch {
    // Ignore parse errors
  }
  return new Set()
}

function saveCompletedSteps(steps: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...steps]))
  } catch {
    // Ignore quota errors
  }
}

interface TourState {
  isActive: boolean
  currentStep: number
  completedSteps: Set<string>
  startTour: () => void
  nextStep: () => void
  prevStep: () => void
  endTour: () => void
  completeStep: (stepId: string) => void
  isTourCompleted: () => boolean
}

export const useTourStore = create<TourState>((set, get) => ({
  isActive: false,
  currentStep: 0,
  completedSteps: loadCompletedSteps(),

  startTour: () => set({ isActive: true, currentStep: 0 }),

  nextStep: () =>
    set((state) => ({ currentStep: Math.min(state.currentStep + 1, 7) })),

  prevStep: () =>
    set((state) => ({ currentStep: Math.max(state.currentStep - 1, 0) })),

  endTour: () => {
    const { completedSteps } = get()
    // Mark the full tour as completed
    const newSteps = new Set(completedSteps)
    newSteps.add('tour-completed')
    saveCompletedSteps(newSteps)
    set({ isActive: false, currentStep: 0, completedSteps: newSteps })
  },

  completeStep: (stepId: string) => {
    const { completedSteps } = get()
    const newSteps = new Set(completedSteps)
    newSteps.add(stepId)
    saveCompletedSteps(newSteps)
    set({ completedSteps: newSteps })
  },

  isTourCompleted: () => get().completedSteps.has('tour-completed'),
}))
