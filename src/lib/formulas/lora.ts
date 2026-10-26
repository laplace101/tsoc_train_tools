/**
 * LoRA (Low-Rank Adaptation) trainable parameter computation.
 * Each LoRA adapter for a linear layer W (d_in × d_out) adds:
 *   A: rank × d_in  +  B: rank × d_out  =  rank × (d_in + d_out) params
 */

export interface LoRATargetModule {
  name: string;
  dIn: number;
  dOut: number;
}

export interface LoRAConfig {
  rank: number;
  alpha: number;
  targetModules: LoRATargetModule[];
}

/**
 * Compute total trainable parameters for a LoRA configuration.
 * Formula: Σ_modules (rank × (d_in + d_out))
 */
export function computeLoRAParams(config: LoRAConfig): number {
  return config.targetModules.reduce(
    (sum, mod) => sum + config.rank * (mod.dIn + mod.dOut),
    0
  );
}

/**
 * Get default LoRA target modules for a standard transformer.
 * Targets q, k, v, o (attention) projections.
 *
 * @param hiddenSize - model hidden dimension
 * @param intermediateSize - FFN intermediate dimension
 * @param numLayers - number of transformer layers
 */
export function getDefaultLoRAModules(
  hiddenSize: number,
  intermediateSize: number,
  numLayers: number
): LoRATargetModule[] {
  // Attention projections (per layer, but LoRA is applied per-layer so we return per-layer modules)
  // The caller multiplies by numLayers if needed, but typically LoRA is applied to all layers
  // and the param count is already summed across layers via the model's weight shapes.
  // Here we return the per-layer module shapes; computeLoRAParams sums them.
  const attentionModules: LoRATargetModule[] = [
    { name: 'q_proj', dIn: hiddenSize, dOut: hiddenSize },
    { name: 'k_proj', dIn: hiddenSize, dOut: hiddenSize },
    { name: 'v_proj', dIn: hiddenSize, dOut: hiddenSize },
    { name: 'o_proj', dIn: hiddenSize, dOut: hiddenSize },
  ];

  // Replicate across all layers
  const modules: LoRATargetModule[] = [];
  for (let layer = 0; layer < numLayers; layer++) {
    for (const mod of attentionModules) {
      modules.push({ ...mod, name: `layers.${layer}.${mod.name}` });
    }
  }

  void intermediateSize; // available for FFN modules if needed
  return modules;
}

/**
 * Build the full (all-layers-expanded) list of LoRA target modules.
 *
 * The formula layer (`training.ts`, `aggregate.ts`) sums `rank × (d_in + d_out)`
 * over this array WITHOUT multiplying by numLayers, so the array must already
 * contain a copy of every selected module for every layer.
 *
 * @returns modules replicated across all `numLayers`, each with resolved d_in/d_out
 */
export function buildLoraTargetModules(
  modules: readonly string[],
  hiddenSize: number,
  intermediateSize: number,
  numLayers: number
): { name: string; dIn: number; dOut: number }[] {
  const shapes: Record<string, { dIn: number; dOut: number }> = {
    q_proj:    { dIn: hiddenSize, dOut: hiddenSize },
    k_proj:    { dIn: hiddenSize, dOut: hiddenSize },
    v_proj:    { dIn: hiddenSize, dOut: hiddenSize },
    o_proj:    { dIn: hiddenSize, dOut: hiddenSize },
    gate_proj: { dIn: hiddenSize, dOut: intermediateSize },
    up_proj:   { dIn: hiddenSize, dOut: intermediateSize },
    down_proj: { dIn: intermediateSize, dOut: hiddenSize },
  };
  const out: { name: string; dIn: number; dOut: number }[] = [];
  for (let layer = 0; layer < numLayers; layer++) {
    for (const name of modules) {
      const shape = shapes[name];
      if (!shape) continue;
      out.push({ name: `layers.${layer}.${name}`, ...shape });
    }
  }
  return out;
}

/** Standard LoRA rank steps (log-ish scale) */
export const LORA_RANK_STEPS = [4, 8, 16, 32, 64, 128] as const;
export type LoRARank = (typeof LORA_RANK_STEPS)[number];

/** Common target module names */
export const LORA_MODULE_NAMES = [
  'q_proj',
  'k_proj',
  'v_proj',
  'o_proj',
  'gate_proj',
  'up_proj',
  'down_proj',
] as const;
export type LoRAModuleName = (typeof LORA_MODULE_NAMES)[number];
