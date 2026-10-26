import type { ModelSpec, PrecisionConfig, VRAMBreakdown, WorkloadMode, TrainingOptions } from './types';
import { computeWeightMemory } from './vram';
import { computeKVCache } from './kvcache';
import { modelHasAdvancedKV, computeModelKVCache } from './kv-formulas';
import { computeTrainingMemory } from './training';
import { computeTrainingMethodMemory } from './training-methods';
import type { TrainingMethodId } from './training-methods';
import { computeLoRAParams } from './lora';

const OVERHEAD_GB = 1.0; // CUDA context + framework overhead

/** Optional advanced-KV sizing knobs (from kv-cache-calculator integration). */
export interface KVVramOptions {
  /** Bytes per scalar element for the indexer side-cache. Defaults to kvPrecision. */
  indexerBytesPerElement?: number;
  /** Include MTP/draft layers in KV sizing. */
  includeDraftKvCache?: boolean;
  /** Include Qwen linear-attention runtime state. */
  includeLinearAttentionState?: boolean;
}

/**
 * Compute total VRAM breakdown for a given model, precision, and workload mode.
 *
 * Inference: weights + KV cache + overhead
 * Fine-tune / Train: weights + activations + gradients + optimizer + overhead
 *
 * Models with an advanced `kv` layout (kv-cache-calculator integration) are
 * sized through the per-formula engine in kv-formulas.ts; all others use the
 * generic MHA/GQA/MLA formula in kvcache.ts.
 *
 * When trainingOptions.trainingMethodId is set, dispatches to the per-method
 * formula from training-methods.ts for accurate multi-model memory accounting.
 */
export function computeTotalVRAM(
  model: ModelSpec,
  precision: PrecisionConfig,
  kvPrecision: PrecisionConfig,
  contextLength: number,
  batchSize: number,
  mode: WorkloadMode,
  trainingOptions?: TrainingOptions,
  kvOptions?: KVVramOptions
): VRAMBreakdown {
  const { architecture, paramsTotal } = model;

  // ── Weights ──────────────────────────────────────────────────────────────
  const { weightGB } = computeWeightMemory({
    numParams: paramsTotal,
    bytesPerParam: precision.bytesPerParam,
  });
  let weightsGB = weightGB;

  // ── KV Cache (inference / scale modes) ───────────────────────────────────
  let kvCacheGB = 0;
  if (mode === 'inference' || mode === 'scale') {
    if (modelHasAdvancedKV(model)) {
      // Advanced layout (DSA/MLA indexer, Qwen hybrid, MiniMax MSA, DeepSeek V4…)
      const kvResult = computeModelKVCache(model, {
        batchSize,
        seqLen: contextLength,
        kvBytesPerElement: kvPrecision.bytesPerParam,
        indexerBytesPerElement: kvOptions?.indexerBytesPerElement ?? kvPrecision.bytesPerParam,
        includeDraftKvCache: kvOptions?.includeDraftKvCache,
        includeLinearAttentionState: kvOptions?.includeLinearAttentionState,
      });
      // KV cache segment includes the indexer side-cache (it's serving memory).
      kvCacheGB = kvResult.totalGB;
    } else {
      const kvResult = computeKVCache({
        numLayers: architecture.numLayers,
        batchSize,
        seqLen: contextLength,
        numKVHeads: architecture.numKeyValueHeads,
        headDim: architecture.headDim,
        bytesPerParam: kvPrecision.bytesPerParam,
        attentionType: architecture.attentionType,
        mlaCompressedDim: model.mlaCompressedDim,
      });
      kvCacheGB = kvResult.kvCacheGB;
    }
  }

  // ── Training components (finetune / train modes) ──────────────────────────
  let activationsGB = 0;
  let gradientsGB = 0;
  let optimizerGB = 0;
  let extraModelsGB = 0;

  if (mode === 'finetune' || mode === 'train') {
    const opts = trainingOptions ?? {
      mode: mode === 'train' ? 'full' : 'lora',
      gradientCheckpointing: true,
    };

    // ── Dispatch to per-method formula if trainingMethodId is set ────────
    if (opts.trainingMethodId) {
      // Compute activations first (needed by method formula)
      const trainingResult = computeTrainingMemory({
        numParams: paramsTotal,
        numLayers: architecture.numLayers,
        hiddenSize: architecture.hiddenSize,
        numAttentionHeads: architecture.numAttentionHeads,
        seqLen: contextLength,
        batchSize,
        bytesPerParam: precision.bytesPerParam,
        mode: opts.mode,
        gradientCheckpointing: opts.gradientCheckpointing,
        loraRank: opts.loraRank,
        loraTargetModules: opts.loraTargetModules,
        flashAttention: opts.flashAttention,
        checkpointMode: opts.checkpointMode,
      });

      // Compute trainable params for LoRA methods
      let trainableParams = paramsTotal;
      if (opts.loraTargetModules && opts.loraRank) {
        trainableParams = computeLoRAParams({
          rank: opts.loraRank,
          alpha: opts.loraRank,
          targetModules: opts.loraTargetModules.map((m, i) => ({
            name: `module_${i}`,
            dIn: m.dIn,
            dOut: m.dOut,
          })),
        });
      }

      const methodMemory = computeTrainingMethodMemory(
        opts.trainingMethodId as TrainingMethodId,
        paramsTotal,
        trainableParams,
        trainingResult.activationsGB,
        precision.bytesPerParam
      );

      activationsGB = methodMemory.breakdown.activationsGB;
      gradientsGB = methodMemory.breakdown.gradientsGB;
      optimizerGB = methodMemory.breakdown.optimizerGB;
      extraModelsGB = methodMemory.breakdown.extraModelsGB;

      // For methods with extra models, the weightsGB from computeWeightMemory
      // only covers the base model — we add extra models to optimizerGB slot
      // to keep the VRAMBreakdown interface compatible.
      // We fold extraModelsGB into optimizerGB for display purposes.
      optimizerGB += extraModelsGB;
    } else {
      // ── Legacy path: use existing training.ts formula ─────────────────
      const trainingResult = computeTrainingMemory({
        numParams: paramsTotal,
        numLayers: architecture.numLayers,
        hiddenSize: architecture.hiddenSize,
        numAttentionHeads: architecture.numAttentionHeads,
        seqLen: contextLength,
        batchSize,
        bytesPerParam: precision.bytesPerParam,
        mode: opts.mode,
        gradientCheckpointing: opts.gradientCheckpointing,
        loraRank: opts.loraRank,
        loraTargetModules: opts.loraTargetModules,
        flashAttention: opts.flashAttention,
        checkpointMode: opts.checkpointMode,
      });

      activationsGB = trainingResult.activationsGB;
      gradientsGB = trainingResult.gradientsGB;
      optimizerGB = trainingResult.optimizerGB;
    }

    // ── Parallelism (TP/PP/DP) ────────────────────────────────────────────
    // When tp/pp/dp are set, size the breakdown per GPU. Weights, gradients and
    // optimizer states are sharded across TP×PP shards; activations are sharded
    // across TP only. Data-parallel replicas don't further reduce per-GPU memory.
    // Default 1/1/1 is a no-op, preserving existing callers.
    const tp = Math.max(1, opts.tp ?? 1);
    const pp = Math.max(1, opts.pp ?? 1);
    if (tp > 1 || pp > 1) {
      const weightShards = tp * pp;
      weightsGB = weightsGB / weightShards;
      gradientsGB = gradientsGB / weightShards;
      optimizerGB = optimizerGB / weightShards;
      activationsGB = activationsGB / tp;
    }
  }

  const totalGB =
    weightsGB + kvCacheGB + activationsGB + gradientsGB + optimizerGB + OVERHEAD_GB;

  return {
    weightsGB,
    kvCacheGB,
    activationsGB,
    gradientsGB,
    optimizerGB,
    overheadGB: OVERHEAD_GB,
    totalGB,
  };
}
