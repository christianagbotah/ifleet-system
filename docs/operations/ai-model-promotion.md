# AI Model Promotion Runbook

## Purpose

Learned models in iFleetPro are advisory only. A model may move from `shadow` to `advisory` only after it passes a documented offline evaluation against the deterministic baseline for the same model family. There is no autonomous-execution status.

## Required evidence

Record all of the following for every candidate model version:

- model key and immutable version;
- dataset window (`from`, `to`) and row count;
- exact feature/label allow-list used by `scripts/ai/export-training-dataset.ts`;
- confirmation that direct identity/contact fields were excluded;
- leakage review confirming every feature was available at the prediction `asOf` time;
- train/validation/holdout split policy and holdout window;
- deterministic baseline metrics on the same holdout rows;
- learned-model metrics on the same holdout rows;
- configured promotion criteria per metric;
- data-quality threshold and minimum sample count;
- reviewer, decision date, rollback version and reason for promotion/rejection.

## Promotion gate

1. Export a sanitized dataset with an explicit feature/label allow-list.
2. Verify there are no direct identifiers or contact fields in the export.
3. Train/evaluate outside the production application process.
4. Compute deterministic-baseline and learned-model metrics on the identical untouched holdout set.
5. Run `scripts/ai/evaluate-model.ts` with the model-family criteria.
6. If any required metric is missing/non-finite, or the learned model fails any minimum relative improvement, promotion fails closed.
7. A passing candidate may be registered as `shadow` first. Observe freshness, data quality and drift before changing to `advisory`.
8. `disabled` is always valid as an emergency rollback state. Historical predictions retain their original `modelKey` and `modelVersion` and are never rewritten.

## Example evaluation payload

```json
{
  "modelMetrics": { "mae": 8.0, "coverage": 0.92 },
  "baselineMetrics": { "mae": 10.0, "coverage": 0.90 },
  "criteria": {
    "mae": { "direction": "lower", "minRelativeImprovement": 0.10 },
    "coverage": { "direction": "higher", "minRelativeImprovement": 0.00 }
  }
}
```

## Rollback

If production advisory quality degrades, set the affected model version to `disabled` or restore the previously approved version. Do not delete or mutate historical predictions. Re-run offline evaluation before any later re-promotion.
