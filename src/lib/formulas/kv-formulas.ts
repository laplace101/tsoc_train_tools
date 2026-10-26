/**
 * Advanced KV cache capacity formulas.
 *
 * Ported from kv-cache-calculator's `web/assets/calculator-core.js`
 * (MIT, adapted from kvcache-ai/kvcache-blog) so llm-infra can size KV cache
 * for DSA/MLA indexers, Qwen linear/full hybrids, sliding-window hybrids,
 * MiniMax sparse attention, and DeepSeek V4 compressed caches — layouts the
 * generic MHA/GQA/MLA formula in kvcache.ts cannot express.
 *
 * Models carrying a `kv` block on ModelSpec are sized through here; all other
 * models keep the generic path in kvcache.ts.
 */

import type {
  AdvancedKVCacheResult,
  KVFormula,
  KVFormulaRow,
  KVLayoutConfig,
  KVFieldValue,
  KVElementComponent,
  ModelSpec,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const QWEN_LINEAR_CONV_BYTES_PER_ELEMENT = 2; // conv state estimated at BF16/FP16
const QWEN_LINEAR_RECURRENT_BYTES_PER_ELEMENT = 4; // recurrent state estimated at FP32

export const FORMULA_LABELS: Record<KVFormula, string> = {
  standard_gqa: 'Standard MHA/GQA',
  mla: 'MLA latent KV',
  dsa_mla: 'DSA/MLA with indexer',
  qwen_linear_full_hybrid: 'Qwen linear/full hybrid',
  mixed_full_sliding_gqa: 'Mixed full/sliding GQA',
  minimax_msa: 'MiniMax MSA sparse attention',
  deepseek_v4_hybrid: 'DeepSeek V4 hybrid sparse attention',
};

// ─── Field helpers ───────────────────────────────────────────────────────────

function isDeepSeekV4(model: KVLayoutConfig): boolean {
  return model.formula === 'deepseek_v4_hybrid';
}

function getField(model: KVLayoutConfig, name: string): number {
  const value = model.fields[name];
  if (value === undefined || !Number.isFinite(Number(value))) {
    throw new Error(`Model ${model.formula} is missing numeric field ${name}`);
  }
  return Number(value);
}

function optionalField(model: KVLayoutConfig, name: string, fallback: number): number {
  const value = model.fields[name];
  if (value !== undefined && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function safeNumber(value: KVFieldValue, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function countByValue(values: number[], target: number): number {
  return values.filter((value) => value === target).length;
}

// ─── Feature detection (used by store to reset model defaults) ───────────────

/** Whether this model carries an indexer side-cache (DSA/MiniMax/DeepSeek-V4). */
export function modelHasIndexerCache(model: ModelSpec): boolean {
  return Boolean(
    model?.kv && Number.isFinite(Number(model.kv.fields.index_head_dim)),
  );
}

/** Whether this model exposes a draft/MTP KV stack that can be toggled. */
export function modelHasDraftKvCache(model: ModelSpec): boolean {
  if (!model?.kv) return false;
  if (isDeepSeekV4(model.kv)) {
    const layers = safeNumber(model.kv.fields.num_hidden_layers, 0);
    return (
      Array.isArray(model.kv.fields.compress_ratios) &&
      model.kv.fields.compress_ratios.length > layers
    );
  }
  return draftLayerCount(model.kv) > 0;
}

/** Whether this model keeps Qwen linear-attention runtime state. */
export function modelHasLinearAttentionState(model: ModelSpec): boolean {
  return Boolean(model?.kv && model.kv.formula === 'qwen_linear_full_hybrid');
}

function draftLayerCount(model: KVLayoutConfig): number {
  if (model.fields.disable_draft_kv_cache === true) return 0;
  const nextnLayers = safeNumber(model.fields.num_nextn_predict_layers, 0);
  if (nextnLayers > 0) return nextnLayers;
  if (model.fields.use_mtp === true) {
    return (
      safeNumber(model.fields.num_mtp_modules, 0) *
      safeNumber(model.fields.mtp_transformer_layers, 0)
    );
  }
  return 0;
}

function indexerLayerPlan(model: KVLayoutConfig, layers: number, draftLayers: number) {
  const mainIndexerLayers = optionalField(model, 'indexer_full_layers', layers);
  const sharedIndexerLayers = optionalField(
    model,
    'indexer_shared_layers',
    Math.max(0, layers - mainIndexerLayers),
  );
  const draftIndexerLayers =
    draftLayers > 0 ? optionalField(model, 'draft_indexer_layers', draftLayers) : 0;
  return {
    mainIndexerLayers,
    sharedIndexerLayers,
    draftIndexerLayers,
    activeIndexerLayers: mainIndexerLayers + draftIndexerLayers,
  };
}

function fieldList(model: KVLayoutConfig, names: string[]): string {
  const fields = model.fields;
  if (!fields || typeof fields !== 'object') return '';
  return names
    .filter((name) => Object.prototype.hasOwnProperty.call(fields, name))
    .map((name) => `${name}=${String(fields[name])}`)
    .join(', ');
}

// ─── Element plan (per formula) ──────────────────────────────────────────────

export interface KVElementSettings {
  includeDraftKvCache: boolean;
  includeLinearAttentionState: boolean;
}

export interface KVByteGroup {
  role: 'kv' | 'indexer' | 'cache' | 'linear_state';
  label: string;
  /** Per-sequence scalar elements; multiplied by precision bytes for bytes. */
  elements?: number;
  /** Explicit per-sequence bytes (linear_state groups). */
  bytesPerSequence?: number;
}

export interface KVElementPlan {
  elementsPerSequence: number;
  elementsPerToken: number;
  formulaLabel: string;
  formulaText: string;
  formulaRows: KVFormulaRow[];
  note: string;
  byteGroups: KVByteGroup[];
  components: KVElementComponent[];
}

function calculateElementsPerSequence(
  model: KVLayoutConfig,
  tokens: number,
  settings: KVElementSettings,
): KVElementPlan {
  const formula = model.formula;
  const { includeDraftKvCache, includeLinearAttentionState } = settings;

  if (formula === 'standard_gqa') {
    const layers = getField(model, 'num_hidden_layers');
    const draftLayers = includeDraftKvCache ? draftLayerCount(model) : 0;
    const activeLayers = layers + draftLayers;
    const kvHeads = getField(model, 'num_key_value_heads');
    const headDim = getField(model, 'head_dim');
    const elementsPerToken = activeLayers * 2 * kvHeads * headDim;
    return {
      elementsPerSequence: elementsPerToken * tokens,
      elementsPerToken,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'active_layers = main_layers + draft_layers_if_enabled\ntotal_bytes = tokens * sequences * active_layers * 2 * num_key_value_heads * head_dim * precision_bytes',
      formulaRows: [
        {
          name: 'active_layers',
          expression: 'main_layers + draft_layers_if_enabled',
          description: 'Draft layers are counted only when Include draft KV cache is enabled for models that define an MTP/draft stack.',
        },
        {
          name: 'total_bytes',
          expression: 'tokens x sequences x active_layers x 2 x num_key_value_heads x head_dim x precision_bytes',
          description: 'Total KV cache bytes for all cached tokens and concurrent sequences.',
        },
      ],
      note: 'Production estimate of base KV payload; allocator and memory-pool bytes are excluded. Draft KV is included only when the checkbox is enabled.',
      byteGroups: [{ role: 'kv', label: 'KV cache', elements: elementsPerToken * tokens }],
      components: [
        ['Main layers', layers],
        ['Draft layers included', draftLayers, 'Extra MTP/draft layers included in KV capacity when the checkbox is enabled.'],
        ['Per-token elements', elementsPerToken, 'Number of scalar KV elements needed for one token before multiplying by precision bytes.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'num_key_value_heads', 'head_dim'])],
      ],
    };
  }

  if (formula === 'mla') {
    const layers = getField(model, 'num_hidden_layers');
    const draftLayers = includeDraftKvCache ? draftLayerCount(model) : 0;
    const activeLayers = layers + draftLayers;
    const kvRank = getField(model, 'kv_lora_rank');
    const ropeDim = getField(model, 'qk_rope_head_dim');
    const elementsPerToken = activeLayers * (kvRank + ropeDim);
    return {
      elementsPerSequence: elementsPerToken * tokens,
      elementsPerToken,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'active_layers = main_layers + draft_layers_if_enabled\ntotal_bytes = tokens * sequences * active_layers * (kv_lora_rank + qk_rope_head_dim) * precision_bytes',
      formulaRows: [
        {
          name: 'active_layers',
          expression: 'main_layers + draft_layers_if_enabled',
          description: 'Draft layers are counted only when Include draft KV cache is enabled for models that define an MTP/draft stack.',
        },
        {
          name: 'total_bytes',
          expression: 'tokens x sequences x active_layers x (kv_lora_rank + qk_rope_head_dim) x precision_bytes',
          description: 'Total latent KV bytes for all cached tokens and concurrent sequences.',
        },
      ],
      note: 'Production estimate of MLA latent KV payload; allocator and memory-pool bytes are excluded. Draft KV is included only when the checkbox is enabled.',
      byteGroups: [{ role: 'kv', label: 'KV cache', elements: elementsPerToken * tokens }],
      components: [
        ['Main layers', layers],
        ['Draft layers included', draftLayers, 'Extra MTP/draft layers included in KV capacity when the checkbox is enabled.'],
        ['Per-token elements', elementsPerToken, 'Number of scalar latent KV elements needed for one token before multiplying by precision bytes.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'kv_lora_rank', 'qk_rope_head_dim'])],
      ],
    };
  }

  if (formula === 'dsa_mla') {
    const layers = getField(model, 'num_hidden_layers');
    const draftLayers = includeDraftKvCache ? draftLayerCount(model) : 0;
    const activeLayers = layers + draftLayers;
    const indexerPlan = indexerLayerPlan(model, layers, draftLayers);
    const indexDim = getField(model, 'index_head_dim');
    const kvRank = getField(model, 'kv_lora_rank');
    const ropeDim = getField(model, 'qk_rope_head_dim');
    const kvElementsPerLayer = kvRank + ropeDim;
    const indexerElementsPerLayer = indexDim;

    const kvElementsPerToken = activeLayers * kvElementsPerLayer;
    const indexerElementsPerToken =
      indexerPlan.activeIndexerLayers * indexerElementsPerLayer;
    const elementsPerToken = kvElementsPerToken + indexerElementsPerToken;
    return {
      elementsPerSequence: elementsPerToken * tokens,
      elementsPerToken,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'active_layers = main_layers + draft_layers_if_enabled\nactive_indexer_layers = main_indexer_layers + draft_indexer_layers_if_enabled\nkv_bytes = tokens * sequences * active_layers * (kv_lora_rank + qk_rope_head_dim) * kv_precision_bytes\nindexer_bytes = tokens * sequences * active_indexer_layers * index_head_dim * indexer_precision_bytes\ntotal_bytes = kv_bytes + indexer_bytes',
      formulaRows: [
        {
          name: 'active_layers',
          expression: 'main_layers + draft_layers_if_enabled',
          description: 'Draft layers are counted only when Include draft KV cache is enabled for models that define a next-token prediction stack.',
        },
        {
          name: 'active_indexer_layers',
          expression: 'main_indexer_layers + draft_indexer_layers_if_enabled',
          description: 'For DSA models with shared indexer layers, only full indexer layers allocate independent indexer key cache.',
        },
        {
          name: 'kv_bytes',
          expression: 'tokens x sequences x active_layers x (kv_lora_rank + qk_rope_head_dim) x kv_precision_bytes',
          description: 'Latent KV payload stored by the production MLA/DSA path.',
        },
        {
          name: 'indexer_bytes',
          expression: 'tokens x sequences x active_indexer_layers x index_head_dim x indexer_precision_bytes',
          description: 'Additional per-token indexer state used by the indexer attention path.',
        },
        {
          name: 'total_bytes',
          expression: 'kv_bytes + indexer_bytes',
          description: 'Combined cache payload after applying the selected KV and indexer precisions.',
        },
      ],
      note: indexerPlan.sharedIndexerLayers > 0
        ? 'Production estimate uses latent KV plus independently stored indexer state; shared indexer layers reuse the full indexer layers\' selection. Expanded HF-compatible cache is not included.'
        : 'Production estimate uses latent KV plus indexer state; expanded HF-compatible cache is not included.',
      byteGroups: [
        { role: 'kv', label: 'KV cache', elements: kvElementsPerToken * tokens },
        { role: 'indexer', label: 'Indexer cache', elements: indexerElementsPerToken * tokens },
      ],
      components: [
        ['Main layers', layers],
        ['Draft layers included', draftLayers, 'Extra next-token prediction layers included in KV capacity when the checkbox is enabled.'],
        ['Main indexer layers', indexerPlan.mainIndexerLayers, 'Full indexer layers that allocate independent indexer key cache.'],
        ['Shared indexer layers', indexerPlan.sharedIndexerLayers, 'DSA layers that reuse the previous full indexer layer\'s top-k selection.'],
        ['Draft indexer layers included', indexerPlan.draftIndexerLayers, 'Draft/MTP indexer layers counted when Include draft KV cache is enabled.'],
        ['KV elements per token', kvElementsPerToken, 'Latent KV elements per token before applying KV precision.'],
        ['Indexer elements per token', indexerElementsPerToken, 'Indexer elements per token before applying indexer precision.'],
        ['Per-token elements', elementsPerToken, 'KV plus indexer scalar elements per token before multiplying by precision bytes.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'kv_lora_rank', 'qk_rope_head_dim', 'index_head_dim', 'indexer_full_layers', 'indexer_shared_layers', 'draft_indexer_layers'])],
      ],
    };
  }

  if (formula === 'qwen_linear_full_hybrid') {
    const layers = getField(model, 'num_hidden_layers');
    const fullLayers = getField(model, 'full_attention_layers');
    const linearLayers = getField(model, 'linear_attention_layers');
    const kvHeads = getField(model, 'num_key_value_heads');
    const headDim = getField(model, 'head_dim');
    const linearKeyHeads = getField(model, 'linear_num_key_heads');
    const linearKeyDim = getField(model, 'linear_key_head_dim');
    const linearValueHeads = getField(model, 'linear_num_value_heads');
    const linearValueDim = getField(model, 'linear_value_head_dim');
    const linearConvKernel = getField(model, 'linear_conv_kernel_dim');
    const mtpLayers = optionalField(model, 'mtp_num_hidden_layers', 0);
    const elementsPerToken = fullLayers * 2 * kvHeads * headDim;
    const fullElements = elementsPerToken * tokens;
    const linearConvElements =
      linearLayers *
      linearConvKernel *
      (2 * linearKeyHeads * linearKeyDim + linearValueHeads * linearValueDim);
    const linearRecurrentElements = linearLayers * linearValueHeads * linearKeyDim * linearValueDim;
    const linearStateBytesPerSequence =
      includeLinearAttentionState
        ? linearConvElements * QWEN_LINEAR_CONV_BYTES_PER_ELEMENT +
          linearRecurrentElements * QWEN_LINEAR_RECURRENT_BYTES_PER_ELEMENT
        : 0;
    const byteGroups: KVByteGroup[] = [
      { role: 'kv', label: 'Full-attention KV cache', elements: fullElements },
    ];
    const formulaRows = [
      {
        name: 'full_kv_bytes',
        expression: 'tokens x sequences x full_attention_layers x 2 x num_key_value_heads x head_dim x precision_bytes',
        description: 'Only Qwen full-attention layers are counted as ordinary token-linear KV cache.',
      },
    ];

    if (includeLinearAttentionState) {
      byteGroups.push({
        role: 'linear_state',
        label: 'Linear-attention state',
        bytesPerSequence: linearStateBytesPerSequence,
      });
      formulaRows.push(
        {
          name: 'linear_conv_state_bytes',
          expression:
            'sequences x linear_attention_layers x linear_conv_kernel_dim x (2 x linear_num_key_heads x linear_key_head_dim + linear_num_value_heads x linear_value_head_dim) x 2',
          description: 'Fixed-size Qwen linear-attention convolution state, estimated at BF16/FP16 precision.',
        },
        {
          name: 'linear_recurrent_state_bytes',
          expression:
            'sequences x linear_attention_layers x linear_num_value_heads x linear_key_head_dim x linear_value_head_dim x 4',
          description: 'Fixed-size Qwen Gated DeltaNet recurrent state, estimated at FP32 precision.',
        },
        {
          name: 'total_bytes',
          expression: 'full_kv_bytes + linear_conv_state_bytes + linear_recurrent_state_bytes',
          description: 'Ordinary full-attention KV plus optional Qwen linear-attention runtime state.',
        },
      );
    } else {
      formulaRows.push(
        {
          name: 'linear_attention_state',
          expression: 'excluded unless Include linear-attention state is enabled',
          description: 'Qwen linear-attention / Gated DeltaNet layers keep non-standard recurrent and convolution state rather than ordinary per-token K/V tensors.',
        },
        {
          name: 'total_bytes',
          expression: 'full_kv_bytes',
          description: 'Capacity-planning estimate for reusable ordinary KV payload only.',
        },
      );
    }

    return {
      elementsPerSequence:
        fullElements + (includeLinearAttentionState ? linearConvElements + linearRecurrentElements : 0),
      elementsPerToken,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'full_kv_bytes = tokens * sequences * full_attention_layers * 2 * num_key_value_heads * head_dim * precision_bytes\ntotal_bytes = full_kv_bytes + optional_linear_attention_state_bytes',
      formulaRows,
      note: includeLinearAttentionState
        ? 'Qwen3.5/3.6 linear-attention state is sequence-level runtime state, not per-token KV. It does not grow linearly with tokens, so it matters more for short prompts and is diluted by full-attention KV at long context.'
        : 'Qwen3.5/3.6 linear-attention recurrent/conv state is not ordinary per-token KV and is excluded by default. Enable the linear-attention state option to add a fixed runtime-state estimate.',
      byteGroups,
      components: [
        ['Main layers', layers],
        ['Full-attention layers', fullLayers, 'Layers counted as ordinary token-linear KV cache.'],
        ['Linear-attention layers', linearLayers, 'Qwen Gated DeltaNet layers whose runtime state is optional and does not grow linearly with token count.'],
        ['Linear state included', includeLinearAttentionState ? 'Yes' : 'No', 'When enabled, adds fixed convolution and recurrent state for Qwen linear-attention layers.'],
        ['Linear conv elements', linearConvElements, 'Fixed convolution-state scalar elements per sequence before applying the 2-byte estimate.'],
        ['Linear recurrent elements', linearRecurrentElements, 'Fixed recurrent-state scalar elements per sequence before applying the 4-byte estimate.'],
        ['MTP layers not included', mtpLayers, 'Qwen3.5/3.6 configs expose MTP layers, but the cache shape is not explicit enough to include defensibly.'],
        ['Per-token elements', elementsPerToken, 'Ordinary full-attention KV scalar elements per token before multiplying by precision bytes.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'full_attention_layers', 'linear_attention_layers', 'num_key_value_heads', 'head_dim', 'linear_num_key_heads', 'linear_key_head_dim', 'linear_num_value_heads', 'linear_value_head_dim', 'linear_conv_kernel_dim'])],
      ],
    };
  }

  if (formula === 'mixed_full_sliding_gqa') {
    const layers = getField(model, 'num_hidden_layers');
    const fullLayers = getField(model, 'full_attention_layers');
    const slidingLayers = getField(model, 'sliding_attention_layers');
    const kvHeads = getField(model, 'num_key_value_heads');
    const headDim = getField(model, 'head_dim');
    const fullKvHeads = optionalField(model, 'num_global_key_value_heads', kvHeads);
    const fullHeadDim = optionalField(model, 'global_head_dim', headDim);
    const fullVHeadDim = optionalField(
      model,
      'global_v_head_dim',
      optionalField(model, 'v_head_dim', fullHeadDim),
    );
    const slidingKvHeads = optionalField(
      model,
      'swa_num_key_value_heads',
      optionalField(model, 'sliding_num_key_value_heads', kvHeads),
    );
    const slidingHeadDim = optionalField(
      model,
      'swa_head_dim',
      optionalField(model, 'sliding_head_dim', headDim),
    );
    const slidingVHeadDim = optionalField(
      model,
      'swa_v_head_dim',
      optionalField(model, 'sliding_v_head_dim', optionalField(model, 'v_head_dim', slidingHeadDim)),
    );
    const slidingWindow = getField(model, 'sliding_window');
    const retainedSlidingTokens = Math.min(tokens, slidingWindow);
    const fullElements = tokens * fullLayers * fullKvHeads * (fullHeadDim + fullVHeadDim);
    const slidingElements = retainedSlidingTokens * slidingLayers * slidingKvHeads * (slidingHeadDim + slidingVHeadDim);
    const elementsPerSequence = fullElements + slidingElements;
    return {
      elementsPerSequence,
      elementsPerToken: elementsPerSequence / tokens,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'full_kv_bytes = tokens * sequences * full_layers * full_kv_heads * (full_head_dim + full_v_head_dim) * precision_bytes\nsliding_kv_bytes = min(tokens, sliding_window) * sequences * sliding_layers * sliding_kv_heads * (sliding_head_dim + sliding_v_head_dim) * precision_bytes\ntotal_bytes = full_kv_bytes + sliding_kv_bytes',
      formulaRows: [
        {
          name: 'full_kv_bytes',
          expression: 'tokens x sequences x full_layers x full_kv_heads x (full_head_dim + full_v_head_dim) x precision_bytes',
          description: 'Full-attention layers retain ordinary KV for all cached tokens.',
        },
        {
          name: 'sliding_kv_bytes',
          expression: 'min(tokens, sliding_window) x sequences x sliding_layers x sliding_kv_heads x (sliding_head_dim + sliding_v_head_dim) x precision_bytes',
          description: 'Sliding-attention layers retain only the local window for each sequence.',
        },
        {
          name: 'total_bytes',
          expression: 'full_kv_bytes + sliding_kv_bytes',
          description: 'Combined reusable full-attention and sliding-window KV payload.',
        },
      ],
      note: 'Production estimate counts text-generation KV payload only. Vision/audio encoder activations and allocator memory are excluded.',
      byteGroups: [
        { role: 'kv', label: 'Full-attention KV cache', elements: fullElements },
        { role: 'kv', label: 'Sliding-window KV cache', elements: slidingElements },
      ],
      components: [
        ['Main layers', layers],
        ['Stored layers', optionalField(model, 'stored_layers', fullLayers + slidingLayers), 'KV-producing layers counted after model-specific KV sharing, when configured.'],
        ['Full-attention layers', fullLayers, 'Layers whose KV grows with total cached tokens.'],
        ['Sliding-attention layers', slidingLayers, 'Layers whose KV is capped by the sliding window.'],
        ['Retained sliding tokens', retainedSlidingTokens, 'min(tokens, sliding_window) for sliding-attention layers.'],
        ['Full K+V dims', fullHeadDim + fullVHeadDim, 'Key plus value dimensions per full-attention KV head.'],
        ['Sliding K+V dims', slidingHeadDim + slidingVHeadDim, 'Key plus value dimensions per sliding-window KV head.'],
        ['Full-attention elements', fullElements, 'Full-attention scalar KV elements before applying precision bytes.'],
        ['Sliding-window elements', slidingElements, 'Sliding-window scalar KV elements before applying precision bytes.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'full_attention_layers', 'sliding_attention_layers', 'num_key_value_heads', 'num_global_key_value_heads', 'head_dim', 'global_head_dim', 'v_head_dim', 'global_v_head_dim', 'swa_num_key_value_heads', 'swa_head_dim', 'swa_v_head_dim', 'sliding_window'])],
      ],
    };
  }

  if (formula === 'minimax_msa') {
    const layers = getField(model, 'num_hidden_layers');
    const fullLayers = getField(model, 'full_attention_layers');
    const sparseLayers = getField(model, 'sparse_attention_layers');
    const kvHeads = getField(model, 'num_key_value_heads');
    const headDim = getField(model, 'head_dim');
    const indexDim = getField(model, 'index_head_dim');
    const indexHeads = optionalField(model, 'index_n_heads', kvHeads);
    const blockSize = getField(model, 'index_block_size');
    const topkBlocks = getField(model, 'index_topk_blocks');
    const localBlocks = optionalField(model, 'index_local_blocks', 0);
    const mtpModules = optionalField(model, 'num_mtp_modules', 0);
    const nextnLayers = optionalField(model, 'num_nextn_predict_layers', 0);
    const kvElementsPerToken = layers * 2 * kvHeads * headDim;
    const indexerElementsPerToken = sparseLayers * indexDim;
    const elementsPerToken = kvElementsPerToken + indexerElementsPerToken;
    const kvElements = kvElementsPerToken * tokens;
    const indexerElements = indexerElementsPerToken * tokens;

    return {
      elementsPerSequence: elementsPerToken * tokens,
      elementsPerToken,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'kv_bytes = tokens * sequences * layers * 2 * num_key_value_heads * head_dim * kv_precision_bytes\nindexer_bytes = tokens * sequences * sparse_attention_layers * index_head_dim * indexer_precision_bytes\ntotal_bytes = kv_bytes + indexer_bytes',
      formulaRows: [
        {
          name: 'kv_bytes',
          expression: 'tokens x sequences x layers x 2 x num_key_value_heads x head_dim x kv_precision_bytes',
          description: 'MiniMax M3 stores ordinary main K/V cache for both full-attention and sparse-attention layers.',
        },
        {
          name: 'indexer_bytes',
          expression: 'tokens x sequences x sparse_attention_layers x index_head_dim x indexer_precision_bytes',
          description: 'MSA sparse layers keep a key-only side cache for the lightning indexer; index_n_heads affects scoring, not the stored index-key cache width.',
        },
        {
          name: 'total_bytes',
          expression: 'kv_bytes + indexer_bytes',
          description: 'Combined main KV cache and MSA index-key side cache.',
        },
      ],
      note: 'MiniMax Sparse Attention (MSA) uses a lightweight indexer to pick the most relevant KV blocks for each query, so long-context attention can read a sparse subset of the cached tokens while keeping a separate indexer cache for block selection.',
      byteGroups: [
        { role: 'kv', label: 'KV cache', elements: kvElements },
        { role: 'indexer', label: 'Indexer cache', elements: indexerElements },
      ],
      components: [
        ['Main layers', layers],
        ['Full-attention layers', fullLayers, 'Dense/full-attention layers without the MSA indexer branch.'],
        ['Sparse-attention layers', sparseLayers, 'MSA layers that add a key-only indexer side cache.'],
        ['KV elements per token', kvElementsPerToken, 'Main K/V elements per token before applying KV precision.'],
        ['Indexer elements per token', indexerElementsPerToken, 'MSA index-key elements per token before applying indexer precision.'],
        ['Index heads', indexHeads, 'Indexer query heads used for scoring selected KV blocks; the stored index-key cache is key-only.'],
        ['Index block size', blockSize, 'Number of tokens per sparse-selection block. This is not a sliding-window cache cap.'],
        ['Top-k blocks', topkBlocks, 'Sparse blocks selected by the indexer for each query.'],
        ['Local blocks', localBlocks, 'Recent local blocks always visible to the sparse attention path.'],
        ['MTP modules not included', mtpModules, 'The public MiniMax M3 checkpoint/config exposes MTP fields, but bundled MTP weights are not modeled in the base serving path.'],
        ['Next-N layers not included', nextnLayers, 'Config field retained for traceability; draft KV is not included for MiniMax M3.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'full_attention_layers', 'sparse_attention_layers', 'num_key_value_heads', 'head_dim', 'index_head_dim', 'index_n_heads', 'index_block_size', 'index_topk_blocks', 'index_local_blocks', 'indexer_fixed_precision_id'])],
      ],
    };
  }

  if (formula === 'deepseek_v4_hybrid') {
    const headDim = getField(model, 'head_dim');
    const indexDim = getField(model, 'index_head_dim');
    const slidingWindow = getField(model, 'sliding_window');
    const layers = getField(model, 'num_hidden_layers');
    const allRatios = Array.isArray(model.fields.compress_ratios)
      ? model.fields.compress_ratios.map((ratio) => Number(ratio))
      : [];
    const mainRatios = allRatios.slice(0, layers);
    const draftRatios = allRatios.slice(layers);
    const activeRatios = includeDraftKvCache ? mainRatios.concat(draftRatios) : mainRatios;

    if (!activeRatios.length) {
      throw new Error(`Model ${model.formula} is missing compress_ratios`);
    }

    let windowElements = 0;
    let compressedElements = 0;
    let indexerElements = 0;
    const ratioZeroLayers = countByValue(activeRatios, 0);
    const ratioFourLayers = countByValue(activeRatios, 4);
    const ratio128Layers = countByValue(activeRatios, 128);
    const ratioZeroElements = ratioZeroLayers * slidingWindow * headDim;

    activeRatios.forEach((ratio) => {
      windowElements += slidingWindow * headDim;
      if (ratio > 0) {
        compressedElements += Math.floor(tokens / ratio) * headDim;
      }
      if (ratio === 4) {
        indexerElements += Math.floor(tokens / 4) * indexDim;
      }
    });

    const attentionElements = windowElements + compressedElements;
    const elementsPerSequence = attentionElements + indexerElements;
    return {
      elementsPerSequence,
      elementsPerToken: elementsPerSequence / tokens,
      formulaLabel: FORMULA_LABELS[formula],
      formulaText:
        'sliding_kv_bytes = active_layers * sliding_window * head_dim * kv_precision_bytes\ncompressed_kv_bytes = sum_ratio>0(floor(tokens / compress_ratio) * head_dim) * kv_precision_bytes\nkv_bytes = sliding_kv_bytes + compressed_kv_bytes\nindexer_bytes = ratio4_layers * floor(tokens / 4) * index_head_dim * indexer_precision_bytes\ntotal_bytes = sequences * (kv_bytes + indexer_bytes)',
      formulaRows: [
        {
          name: 'sliding_kv_bytes',
          expression: 'active_layers x sliding_window x head_dim x kv_precision_bytes',
          description: 'Includes ratio=0 layers. Ratio=0 layers only contribute this fixed sliding-window KV and do not add compressed KV slots.',
        },
        {
          name: 'compressed_kv_bytes',
          expression: 'sum over ratio>0 layers: floor(tokens / compress_ratio) x head_dim x kv_precision_bytes',
          description: 'Compressed KV cache from layers whose compress_ratio is greater than zero; each layer keeps floor(tokens / compress_ratio) compressed slots.',
        },
        {
          name: 'kv_bytes',
          expression: 'sliding_kv_bytes + compressed_kv_bytes',
          description: 'Main DeepSeek V4 KV cache before adding the separate indexer cache.',
        },
        {
          name: 'indexer_bytes',
          expression: 'ratio4_layers x floor(tokens / 4) x index_head_dim x indexer_precision_bytes',
          description: 'Ratio=4 layers keep an extra compressed indexer cache that can use a separate precision.',
        },
        {
          name: 'total_bytes',
          expression: 'sequences x (kv_bytes + indexer_bytes)',
          description: 'Combined DeepSeek V4 cache payload for all concurrent sequences.',
        },
      ],
      note: 'Production estimate uses the official sliding-window/compressed-cache layout. The default DeepSeek V4 setting uses FP8 attention cache and FP4 indexer cache.',
      byteGroups: [
        { role: 'kv', label: 'KV cache', elements: attentionElements },
        { role: 'indexer', label: 'Indexer cache', elements: indexerElements },
      ],
      components: [
        ['Main layers', mainRatios.length],
        ['Draft layers included', includeDraftKvCache ? draftRatios.length : 0, 'Extra MTP/draft layers after the main transformer layers. In DeepSeek V4 configs these are ratio=0 layers.'],
        ['Ratio=4 layers', ratioFourLayers, 'Layers whose compressed cache ratio is 4; these layers also carry indexer cache.'],
        ['Ratio=128 layers', ratio128Layers, 'Layers whose compressed cache keeps floor(tokens / 128) compressed KV slots.'],
        ['Ratio=0 layers', ratioZeroLayers, 'Layers with no compressed KV segment; they keep only the sliding-window KV cache.'],
        ['Ratio=0 KV elements', ratioZeroElements, 'The ratio=0 contribution: ratio0_layers x sliding_window x head_dim.'],
        ['Sliding-window elements', windowElements, 'Per-layer local KV reserve: sliding_window x head_dim, summed across active layers.'],
        ['Compressed elements', compressedElements, 'Compressed KV elements from layers with compress_ratio greater than zero.'],
        ['KV elements', attentionElements, 'Sliding-window plus compressed attention cache elements before applying KV precision.'],
        ['Indexer elements', indexerElements, 'Compressed indexer elements from ratio=4 layers before applying indexer precision.'],
      ],
    };
  }

  // Fallback: unknown/unsupported formula (e.g. a bad data entry like "woxi").
  // Rather than throwing — which would blank the whole app since there is no
  // error boundary — estimate it as standard GQA using the model's own fields.
  // This keeps the calculator usable for any model, even with an unrecognized
  // kv.formula value.
  {
    const layers = optionalField(model, 'num_hidden_layers', 0);
    const draftLayers = includeDraftKvCache ? draftLayerCount(model) : 0;
    const activeLayers = layers + draftLayers;
    const kvHeads = optionalField(model, 'num_key_value_heads', 0);
    const headDim = optionalField(model, 'head_dim', 0);
    const elementsPerToken = activeLayers * 2 * kvHeads * headDim;
    return {
      elementsPerSequence: elementsPerToken * tokens,
      elementsPerToken,
      formulaLabel: `Unknown (${formula}) — estimated as GQA`,
      formulaText:
        'total_bytes = tokens * sequences * active_layers * 2 * num_key_value_heads * head_dim * precision_bytes',
      formulaRows: [
        {
          name: 'total_bytes',
          expression: 'tokens x sequences x active_layers x 2 x num_key_value_heads x head_dim x precision_bytes',
          description: `Formula "${formula}" is not recognized; estimated with the standard GQA layout from the model's own fields.`,
        },
      ],
      note: `Formula "${formula}" is not supported by the KV engine; a standard GQA estimate is shown instead.`,
      byteGroups: [{ role: 'kv', label: 'KV cache', elements: elementsPerToken * tokens }],
      components: [
        ['Main layers', layers],
        ['Draft layers included', draftLayers, 'Extra MTP/draft layers included in KV capacity when the checkbox is enabled.'],
        ['Per-token elements', elementsPerToken, 'Number of scalar KV elements needed for one token before multiplying by precision bytes.'],
        ['Model fields', fieldList(model, ['num_hidden_layers', 'num_key_value_heads', 'head_dim'])],
      ],
    };
  }
}

// ─── Public entry points ─────────────────────────────────────────────────────

/** True when the model should be sized with the advanced KV engine. */
export function modelHasAdvancedKV(model: ModelSpec): boolean {
  return Boolean(model?.kv?.formula);
}

export interface KVEngineInput {
  batchSize: number;
  seqLen: number;
  /** Bytes per scalar element for the KV payload (e.g. 2 for FP16/BF16). */
  kvBytesPerElement: number;
  /** Bytes per scalar element for the indexer side-cache (e.g. 0.5 for FP4/INT4). */
  indexerBytesPerElement: number;
  includeDraftKvCache?: boolean;
  includeLinearAttentionState?: boolean;
}

function bytesPerElementForRole(role: KVByteGroup['role'], precision: {
  kvBytesPerElement: number;
  indexerBytesPerElement: number;
}): number {
  if (role === 'kv' || role === 'cache') {
    return precision.kvBytesPerElement;
  }
  if (role === 'indexer') return precision.indexerBytesPerElement;
  // linear_state groups carry explicit bytesPerSequence and never reach here.
  return precision.kvBytesPerElement;
}

/**
 * Compute KV cache for a model with an advanced `kv` layout.
 *
 * Byte groups are resolved per-sequence (elements × precision bytes, or the
 * explicit bytesPerSequence for Qwen linear state) and then scaled by
 * `batchSize` (concurrent sequences). Indexer groups are reported separately.
 */
export function computeModelKVCache(model: ModelSpec, input: KVEngineInput): AdvancedKVCacheResult {
  const layout = model.kv;
  if (!layout) {
    throw new Error(`Model ${model.id} has no advanced KV layout config`);
  }

  const tokens = Math.max(1, Math.floor(input.seqLen));
  const sequences = Math.max(1, Math.floor(input.batchSize));
  const settings: KVElementSettings = {
    includeDraftKvCache: Boolean(input.includeDraftKvCache),
    includeLinearAttentionState: Boolean(input.includeLinearAttentionState),
  };

  const elementPlan = calculateElementsPerSequence(layout, tokens, settings);

  const precision = {
    kvBytesPerElement: input.kvBytesPerElement,
    indexerBytesPerElement: input.indexerBytesPerElement,
  };

  const kvBytesPerSequence = elementPlan.byteGroups
    .filter((g) => g.role === 'kv' || g.role === 'cache')
    .reduce(
      (total, g) =>
        total +
        (Number.isFinite(g.bytesPerSequence)
          ? (g.bytesPerSequence as number)
          : (g.elements as number) * bytesPerElementForRole(g.role, precision)),
      0,
    );

  const indexerBytesPerSequence = elementPlan.byteGroups
    .filter((g) => g.role === 'indexer')
    .reduce(
      (total, g) =>
        total +
        (Number.isFinite(g.bytesPerSequence)
          ? (g.bytesPerSequence as number)
          : (g.elements as number) * bytesPerElementForRole(g.role, precision)),
      0,
    );

  const linearStateBytesPerSequence = elementPlan.byteGroups
    .filter((g) => g.role === 'linear_state')
    .reduce((total, g) => total + ((g.bytesPerSequence as number) ?? 0), 0);

  const bytesPerSequence =
    kvBytesPerSequence + indexerBytesPerSequence + linearStateBytesPerSequence;
  const rawBytes = bytesPerSequence * sequences;

  return {
    kvCacheGB: (kvBytesPerSequence * sequences) / 1e9,
    indexerCacheGB: (indexerBytesPerSequence * sequences) / 1e9,
    totalGB: rawBytes / 1e9,
    rawBytes,
    bytesPerSequence,
    elementsPerToken: elementPlan.elementsPerToken,
    formulaLabel: elementPlan.formulaLabel,
    note: elementPlan.note,
    formulaText: elementPlan.formulaText,
    formulaRows: elementPlan.formulaRows,
    components: elementPlan.components,
  };
}
