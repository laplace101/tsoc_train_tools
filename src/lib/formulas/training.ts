import type { TrainingMemoryInput, TrainingMemoryResult } from './types';

/**
 * Compute training memory requirements in GB.
 *
 * Activation memory per layer (Korthikanti et al. 2022):
 *   act_per_layer = seqLen × batch × hiddenSize × (34 + 5 × seqLen × numAttentionHeads / hiddenSize) × 2 bytes
 *
 * With gradient checkpointing:
 *   act_total ≈ sqrt(numLayers) × act_per_layer
 *
 * Optimizer states (mixed-precision Adam):
 *   full:  12 × numParams bytes  (FP32 master 4 + FP32 m 4 + FP32 v 4)
 *   lora:  12 × trainableParams bytes
 *   qlora: ~8 × trainableParams bytes (paged AdamW 8-bit)
 *
 * Gradients:
 *   full:  2 × numParams bytes (FP16)
 *   lora/qlora: 2 × trainableParams bytes
 */
export function computeTrainingMemory(input: TrainingMemoryInput): TrainingMemoryResult {
  const {
    numParams,
    numLayers,
    hiddenSize,
    numAttentionHeads,
    seqLen,
    batchSize,
    bytesPerParam,
    mode,
    gradientCheckpointing,
    loraRank,
    loraTargetModules,
    flashAttention = false,
    checkpointMode,
  } = input;

  // ── Activations ──────────────────────────────────────────────────────────
  // Per-layer activation memory (FP16/BF16, 2 bytes)
  const actPerLayer =
    seqLen * batchSize * hiddenSize *
    (34 + (5 * seqLen * numAttentionHeads) / hiddenSize) *
    2; // bytes

  // Full (non-checkpointed) activation total in GB.
  const fullActGB = (numLayers * actPerLayer) / 1e9;

  // FlashAttention avoids materializing the O(N²) attention score matrix.
  // Drop the attention-score term from the activation budget when enabled.
  const attentionScoreGB =
    (numLayers * numAttentionHeads * seqLen * seqLen * batchSize * bytesPerParam) / 1e9;
  const baseActGB = flashAttention ? Math.max(0, fullActGB - attentionScoreGB) : fullActGB;

  // Activation checkpointing mode. `checkpointMode` takes precedence; otherwise
  // fall back to the legacy boolean `gradientCheckpointing` (true → 'full' i.e. sqrt).
  const mode_ = checkpointMode ?? (gradientCheckpointing ? 'full' : 'none');

  let totalActivationBytes: number;
  if (mode_ === 'full') {
    // Classic checkpointing: sqrt(numLayers) layers stored
    totalActivationBytes = (Math.sqrt(numLayers) * (baseActGB / numLayers)) * 1e9;
  } else if (mode_ === 'selective') {
    // Selective: drops attention-score memory (~0.65×)
    totalActivationBytes = baseActGB * 0.65 * 1e9;
  } else {
    totalActivationBytes = baseActGB * 1e9;
  }
  const activationsGB = totalActivationBytes / 1e9;

  // ── Trainable parameters (LoRA / QLoRA) ──────────────────────────────────
  let trainableParams = numParams; // full fine-tuning: all params
  if ((mode === 'lora' || mode === 'qlora') && loraTargetModules && loraRank) {
    trainableParams = loraTargetModules.reduce(
      (sum, mod) => sum + loraRank * (mod.dIn + mod.dOut),
      0
    );
  }

  // ── Gradients ────────────────────────────────────────────────────────────
  // FP16 gradients: 2 bytes per trainable param
  const gradientsGB = (trainableParams * 2) / 1e9;

  // ── Optimizer states ─────────────────────────────────────────────────────
  let optimizerGB: number;
  if (mode === 'full') {
    // Mixed-precision Adam: 12 bytes per param (ZeRO K=12)
    // (FP32 master 4 + FP32 momentum 4 + FP32 variance 4)
    optimizerGB = (numParams * 12) / 1e9;
  } else if (mode === 'lora') {
    // LoRA: Adam on trainable params only (12 bytes each)
    optimizerGB = (trainableParams * 12) / 1e9;
  } else {
    // QLoRA: paged AdamW 8-bit (~8 bytes per trainable param)
    optimizerGB = (trainableParams * 8) / 1e9;
  }

  // ── Base weights ─────────────────────────────────────────────────────────
  // For QLoRA, base weights are in NF4 (~0.5 bytes/param)
  // For full/lora, base weights use the provided bytesPerParam
  const effectiveBytesPerParam = mode === 'qlora' ? 0.5 : bytesPerParam;
  const weightsGB = (numParams * effectiveBytesPerParam) / 1e9;

  const totalTrainingGB = weightsGB + activationsGB + gradientsGB + optimizerGB;

  return {
    activationsGB,
    gradientsGB,
    optimizerGB,
    totalTrainingGB,
  };
}
