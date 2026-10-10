export type AiModelStatus = 'shadow' | 'advisory' | 'disabled'

export interface AiModelExplanation {
  summary: string
  reasons?: string[]
  metadata?: Record<string, unknown>
}

export interface AiModelAdapter<Input, Output> {
  modelKey: string
  version: string
  status: AiModelStatus
  minimumDataQuality: number
  predict(input: Input): Output | Promise<Output>
  explain(output: Output): AiModelExplanation
}

export interface AiModelPrediction<Output> {
  modelKey: string
  modelVersion: string
  status: Exclude<AiModelStatus, 'disabled'>
  output: Output
  explanation: AiModelExplanation
}

export class AiModelRegistry {
  private readonly models = new Map<string, AiModelAdapter<unknown, unknown>>()

  register<Input, Output>(model: AiModelAdapter<Input, Output>): this {
    if (!model.modelKey.trim() || !model.version.trim()) throw new Error('model key and version are required')
    if (!Number.isFinite(model.minimumDataQuality) || model.minimumDataQuality < 0 || model.minimumDataQuality > 1) {
      throw new Error('minimum data quality must be between 0 and 1')
    }
    const key = this.key(model.modelKey, model.version)
    if (this.models.has(key)) throw new Error(`model already registered: ${model.modelKey}@${model.version}`)
    this.models.set(key, model as AiModelAdapter<unknown, unknown>)
    return this
  }

  resolve<Input = unknown, Output = unknown>(modelKey: string, version: string): AiModelAdapter<Input, Output> {
    const model = this.models.get(this.key(modelKey, version))
    if (!model) throw new Error(`unknown AI model: ${modelKey}@${version}`)
    return model as AiModelAdapter<Input, Output>
  }

  resolveHistorical(reference: { modelKey: string; modelVersion: string }): AiModelAdapter<unknown, unknown> {
    return this.resolve(reference.modelKey, reference.modelVersion)
  }

  list(): Array<{ modelKey: string; version: string; status: AiModelStatus; minimumDataQuality: number }> {
    return [...this.models.values()]
      .map((model) => ({
        modelKey: model.modelKey,
        version: model.version,
        status: model.status,
        minimumDataQuality: model.minimumDataQuality,
      }))
      .sort((a, b) => a.modelKey.localeCompare(b.modelKey) || a.version.localeCompare(b.version))
  }

  async predict<Input, Output>(modelKey: string, version: string, input: Input, dataQualityScore: number): Promise<AiModelPrediction<Output>> {
    const model = this.resolve<Input, Output>(modelKey, version)
    if (model.status === 'disabled') throw new Error(`AI model is disabled: ${modelKey}@${version}`)
    if (!Number.isFinite(dataQualityScore) || dataQualityScore < model.minimumDataQuality) {
      throw new Error(`data quality ${dataQualityScore} is below model minimum ${model.minimumDataQuality}`)
    }
    const output = await model.predict(input)
    return {
      modelKey,
      modelVersion: model.version,
      status: model.status,
      output,
      explanation: model.explain(output),
    }
  }

  private key(modelKey: string, version: string): string {
    return `${modelKey.trim()}@${version.trim()}`
  }
}
