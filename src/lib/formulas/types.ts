// ─── Workload & Fit Enums ────────────────────────────────────────────

/** The five calculator workload modes */
export type WorkloadMode = "inference" | "scale" | "finetune" | "train" | "reverse";

/** GPU fit classification: green (≤80%), yellow (80–100%), red (>100%) */
export type FitStatus = "green" | "yellow" | "red";

// ─── Model Data ──────────────────────────────────────────────────────

/** KV cache capacity formulas from kv-cache-calculator (calculator-core.js). */
export type KVFormula =
  | "standard_gqa"
  | "mla"
  | "dsa_mla"
  | "qwen_linear_full_hybrid"
  | "mixed_full_sliding_gqa"
  | "minimax_msa"
  | "deepseek_v4_hybrid";

export type KVFieldValue = number | number[] | boolean | string | undefined;

/**
 * Native KV cache layout config (mirrors kv-cache-calculator model entries).
 * Drives the advanced KV formula engine in kv-formulas.ts. When present,
 * KV sizing uses this instead of the generic architecture fields.
 */
export interface KVLayoutConfig {
  formula: KVFormula;
  /** Raw model config fields, e.g. num_hidden_layers, head_dim, compress_ratios. */
  fields: Record<string, KVFieldValue>;
  /** Default tokens used when no explicit context length is provided. */
  defaultTokens?: number;
  /** Native max context length (max_position_embeddings). */
  maxPositionEmbeddings?: number;
}

export interface ModelSpec {
  id: string;
  family: string;
  displayName: string;
  releaseDate: string;
  license: string;
  paramsTotal: number;
  paramsActive?: number;
  architecture: {
    numLayers: number;
    hiddenSize: number;
    intermediateSize: number;
    numAttentionHeads: number;
    numKeyValueHeads: number;
    headDim: number;
    vocabSize: number;
    tieWordEmbeddings: boolean;
    attentionType: "mha" | "gqa" | "mqa" | "mla";
    maxContextLength: number;
    positionalEmbedding: "rope" | "alibi" | "yarn" | "learned";
  };
  moe?: {
    numExperts: number;
    expertsPerToken: number;
    sharedExperts?: number;
  };
  mlaCompressedDim?: number;
  trainingTokens?: number;
  notes?: string;
  huggingfaceId?: string;
  apiOnly?: boolean;
  /** Advanced KV layout config (from kv-cache-calculator). Overrides generic KV sizing. */
  kv?: KVLayoutConfig;
}

// ─── GPU Data ────────────────────────────────────────────────────────

export interface GPUSpec {
  id: string;
  vendor: "nvidia" | "amd" | "apple" | "intel" | "google-tpu" | "aws" | "huawei" | "dcu" | "hygon" | "cerebras" | "groq" | "sambanova" | "tenstorrent" | "qualcomm";
  name: string;
  category: "consumer" | "workstation" | "datacenter" | "apple-silicon" | "tpu" | "edge" | "wafer-scale";
  memoryGB: number;
  memoryBandwidthGBs: number;
  flops: {
    fp64?: number;
    fp32: number;
    fp16: number;
    fp8?: number;
    int8: number;
    sparsity?: boolean;
  };
  tdpWatts: number;
  nvlink?: { perGPU_GBs: number } | null;
  formFactor: "pcie" | "sxm" | "oam" | "integrated" | "mxm";
  msrpUSD?: number;
  streetUSD?: number;
  releaseYear: number;
  notes?: string;
}

// ─── Cloud Data ──────────────────────────────────────────────────────

export interface CloudInstance {
  id: string;
  provider: string;
  instanceType: string;
  gpus: { id: string; count: number }[];
  vcpus: number;
  ramGB: number;
  storageGB: number;
  networkGbps: number;
  interconnect?: "nvlink" | "nvswitch" | "infiniband-400" | "infiniband-800" | "rocev2" | "pcie";
  pricing: {
    onDemandUSDPerHour: number;
    spotUSDPerHour?: number;
    reserved1yUSDPerHour?: number;
    reserved3yUSDPerHour?: number;
  };
  regions: string[];
  notes?: string;
  lastPriceUpdate: string;
}

// ─── Precision ───────────────────────────────────────────────────────

export interface PrecisionConfig {
  key: string;
  label: string;
  bytesPerParam: number;
}

// ─── VRAM Breakdown ──────────────────────────────────────────────────

export interface VRAMBreakdown {
  weightsGB: number;
  kvCacheGB: number;
  activationsGB: number;
  gradientsGB: number;
  optimizerGB: number;
  overheadGB: number;
  totalGB: number;
}

// ─── Calculator State (URL-serializable) ─────────────────────────────

export interface CalculatorState {
  model: string;
  precision: string;
  kvPrecision: string;
  ctx: number;
  batch: number;
  mode: WorkloadMode;
  gpu?: string;
  compare?: string[];
  /** Training method ID — empty string means no method selected */
  trainingMethod?: string;
  // Spec 10: Concurrent user capacity
  users?: number;
  avgPrompt?: number;
  avgOutput?: number;
  sloTtft?: number;
  sloTpot?: number;
  batch10?: boolean;
  // Advanced KV layout (kv-cache-calculator integration)
  /** Indexer cache precision key (KV_PRECISION_MAP) when the model has an indexer. */
  indexerPrecision?: string;
  /** Include MTP/draft layers in KV sizing. */
  includeDraftKvCache?: boolean;
  /** Include Qwen linear-attention runtime state. */
  includeLinearAttentionState?: boolean;
}

// ─── Training Options ────────────────────────────────────────────────

export interface TrainingOptions {
  mode: "full" | "lora" | "qlora";
  gradientCheckpointing: boolean;
  loraRank?: number;
  /** LoRA scaling factor (alpha); defaults to loraRank. */
  loraAlpha?: number;
  /** LoRA target module names selected by the user (q_proj, gate_proj, …). */
  loraModules?: string[];
  /** Already-expanded (all-layers) LoRA target shapes; used by the formula layer. */
  loraTargetModules?: { dIn: number; dOut: number }[];
  /** Optional explicit training method — overrides mode-based dispatch */
  trainingMethodId?: string;
  /** FlashAttention enabled. Formula treats omission as `false` (no savings); callers opt in. */
  flashAttention?: boolean;
  /** Activation checkpointing mode. When omitted, falls back to `gradientCheckpointing`. */
  checkpointMode?: "none" | "selective" | "full";
  /** Tensor parallel degree. Defaults to 1. */
  tp?: number;
  /** Pipeline parallel degree. Defaults to 1. */
  pp?: number;
  /** Data parallel degree. Defaults to 1. */
  dp?: number;
}

// ─── Advanced Settings ───────────────────────────────────────────────

export interface AdvancedSettings {
  framework: string;
  overheadMultiplier: number;
  tokenizer: string;
}

// ─── Weight Calculation ──────────────────────────────────────────────

export interface WeightCalcInput {
  numParams: number;
  bytesPerParam: number;
}

export interface WeightCalcResult {
  weightGB: number;
  rawBytes: number;
}

// ─── KV Cache Calculation ────────────────────────────────────────────

export interface KVCacheInput {
  numLayers: number;
  batchSize: number;
  seqLen: number;
  numKVHeads: number;
  headDim: number;
  bytesPerParam: number;
  attentionType: "mha" | "gqa" | "mqa" | "mla";
  mlaCompressedDim?: number;
}

export interface KVCacheResult {
  kvCacheGB: number;
  rawBytes: number;
}

/** One named step of a formula (e.g. "compressed_kv_bytes" → expression + why). */
export interface KVFormulaRow {
  name: string;
  expression: string;
  description: string;
}

/** Key numeric components feeding a formula: [name, value, optional note]. */
export type KVElementComponent = [string, number | string, string?];

/**
 * Advanced KV engine result (kv-formulas.ts). Splits the KV payload from any
 * indexer side-cache (DSA/MiniMax/DeepSeek-V4) so callers can show both.
 */
export interface AdvancedKVCacheResult {
  /** KV cache bytes (GB) — kv/attention/cache byte groups only. */
  kvCacheGB: number;
  /** Indexer side-cache bytes (GB); 0 for models without an indexer. */
  indexerCacheGB: number;
  /** Combined KV + indexer bytes (GB). */
  totalGB: number;
  /** Combined raw bytes. */
  rawBytes: number;
  /** Combined bytes / sequences. */
  bytesPerSequence: number;
  /** Per-token scalar elements (KV + indexer) before precision bytes. */
  elementsPerToken: number;
  /** Human label for the formula used, e.g. "DSA/MLA with indexer". */
  formulaLabel: string;
  /** Capacity-planning note about what is / is not included. */
  note: string;
  /** Plain-text, line-oriented description of the formula (for display). */
  formulaText?: string;
  /** Named formula steps (name → expression + description) for UI display. */
  formulaRows?: KVFormulaRow[];
  /** Key numeric components feeding the formula (name, value, optional note). */
  components?: KVElementComponent[];
}

// ─── Training Memory Calculation ─────────────────────────────────────

export interface TrainingMemoryInput {
  numParams: number;
  numLayers: number;
  hiddenSize: number;
  numAttentionHeads: number;
  seqLen: number;
  batchSize: number;
  bytesPerParam: number;
  mode: "full" | "lora" | "qlora";
  gradientCheckpointing: boolean;
  loraRank?: number;
  loraTargetModules?: { dIn: number; dOut: number }[];
  /** FlashAttention enabled. Formula treats omission as `false` (no savings); callers opt in. */
  flashAttention?: boolean;
  /** Activation checkpointing mode. When omitted, falls back to `gradientCheckpointing`. */
  checkpointMode?: "none" | "selective" | "full";
}

export interface TrainingMemoryResult {
  activationsGB: number;
  gradientsGB: number;
  optimizerGB: number;
  totalTrainingGB: number;
}

// ─── Throughput Calculation ──────────────────────────────────────────

export interface ThroughputInput {
  memoryBandwidthGBs: number;
  activeWeightsGB: number;
  efficiencyFactor: number;
}

export interface ThroughputResult {
  tokensPerSecond: number;
}

// ─── Cost Metrics ────────────────────────────────────────────────────

export interface CostMetricsInput {
  tokensPerSecond: number;
  hourlyCloudCost: number;
  contextLength: number;
  activeWeightsGB: number;
  computeTFLOPS: number;
}

export interface CostMetricsResult {
  costPerMillionTokens: number;
  timeToFirstTokenMs: number;
}

// ─── GPU Recommendations ─────────────────────────────────────────────

export interface GPUFitResult {
  gpu: GPUSpec;
  fitStatus: FitStatus;
  utilizationPercent: number;
  freeVRAMGB: number;
  tokensPerSecond?: number;
}

export interface GPURecommendations {
  allFits: GPUFitResult[];
  budget: GPUFitResult | null;
  balanced: GPUFitResult | null;
  performance: GPUFitResult | null;
}

// ─── Cloud Recommendations ───────────────────────────────────────────

export interface CloudRecommendation {
  instance: CloudInstance;
  totalGPUMemoryGB: number;
  fitStatus: FitStatus;
  onDemandPerHour: number;
  spotPerHour?: number;
  costPerMillionTokens?: number;
  isBestPrice: boolean;
}

// ─── Cluster Recommendations ─────────────────────────────────────────

export interface ClusterRecommendation {
  topology: string;
  alternativeTopology?: string;
  framework: string;
  frameworkArgs: string;
  alternativeRuntime?: string;
}

// ─── Stack Recommendations ───────────────────────────────────────────

export interface StackRecommendation {
  os: string;
  driver: string;
  cuda: string;
  pytorch: string;
  container: string;
  monitoring: string;
}

// ─── Scale Mode ──────────────────────────────────────────────────────

export interface ScaleConfig {
  targetQPS: number;
  avgOutputTokens: number;
  concurrentUsers: number;
  headroomFactor: number;
}
