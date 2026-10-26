import { t } from '@/lib/i18n';
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
  get standard_gqa() { return t('Standard MHA/GQA', '标准 MHA/GQA'); },
  get mla() { return t('MLA latent KV', 'MLA 隐变量 KV'); },
  get dsa_mla() { return t('DSA/MLA with indexer', 'DSA/MLA + indexer'); },
  get qwen_linear_full_hybrid() { return t('Qwen linear/full hybrid', 'Qwen linear/full 混合'); },
  get mixed_full_sliding_gqa() { return t('Mixed full/sliding GQA', '全注意力 / 滑窗混合 GQA'); },
  get minimax_msa() { return t('MiniMax MSA sparse attention', 'MiniMax MSA 稀疏注意力'); },
  get deepseek_v4_hybrid() { return t('DeepSeek V4 hybrid sparse attention', 'DeepSeek V4 混合稀疏注意力'); },
};

// ─── Field helpers ───────────────────────────────────────────────────────────

function isDeepSeekV4(model: KVLayoutConfig): boolean {
  return model.formula === 'deepseek_v4_hybrid';
}

function getField(model: KVLayoutConfig, name: string): number {
  const value = model.fields[name];
  if (value === undefined || !Number.isFinite(Number(value))) {
    throw new Error(t(`Model ${model.formula} is missing numeric field ${name}`, `模型 ${model.formula} 缺少数值字段 ${name}`));
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
          description: t('Draft layers are counted only when Include draft KV cache is enabled for models that define an MTP/draft stack.', '仅当模型定义了 MTP/草稿层，并且勾选了「包含草稿 KV 缓存」时才计入草稿层。'),
        },
        {
          name: 'total_bytes',
          expression: 'tokens x sequences x active_layers x 2 x num_key_value_heads x head_dim x precision_bytes',
          description: t('Total KV cache bytes for all cached tokens and concurrent sequences.', '所有已缓存 token 与并发序列的 KV 缓存总字节数。'),
        },
      ],
      note: t('Production estimate of base KV payload; allocator and memory-pool bytes are excluded. Draft KV is included only when the checkbox is enabled.', '生产环境下基础 KV 占用的估算值，不含分配器与内存池开销。只有勾选复选框时才包含草稿 KV。'),
      byteGroups: [{ role: 'kv', label: t('KV cache', 'KV 缓存'), elements: elementsPerToken * tokens }],
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Draft layers included', '计入的草稿层'), draftLayers, t('Extra MTP/draft layers included in KV capacity when the checkbox is enabled.', '勾选复选框后，额外计入 KV 容量的 MTP/草稿层。')],
        [t('Per-token elements', '每 token 元素数'), elementsPerToken, t('Number of scalar KV elements needed for one token before multiplying by precision bytes.', '单个 token 所需的标量 KV 元素数（再乘以精度字节数）。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'num_key_value_heads', 'head_dim'])],
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
          description: t('Draft layers are counted only when Include draft KV cache is enabled for models that define an MTP/draft stack.', '仅当模型定义了 MTP/草稿层，并且勾选了「包含草稿 KV 缓存」时才计入草稿层。'),
        },
        {
          name: 'total_bytes',
          expression: 'tokens x sequences x active_layers x (kv_lora_rank + qk_rope_head_dim) x precision_bytes',
          description: t('Total latent KV bytes for all cached tokens and concurrent sequences.', '所有已缓存 token 与并发序列的隐变量 KV 总字节数。'),
        },
      ],
      note: t('Production estimate of MLA latent KV payload; allocator and memory-pool bytes are excluded. Draft KV is included only when the checkbox is enabled.', '生产环境下 MLA 隐变量 KV 占用的估算值，不含分配器与内存池开销。只有勾选复选框时才包含草稿 KV。'),
      byteGroups: [{ role: 'kv', label: t('KV cache', 'KV 缓存'), elements: elementsPerToken * tokens }],
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Draft layers included', '计入的草稿层'), draftLayers, t('Extra MTP/draft layers included in KV capacity when the checkbox is enabled.', '勾选复选框后，额外计入 KV 容量的 MTP/草稿层。')],
        [t('Per-token elements', '每 token 元素数'), elementsPerToken, t('Number of scalar latent KV elements needed for one token before multiplying by precision bytes.', '单个 token 所需的标量隐变量 KV 元素数（再乘以精度字节数）。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'kv_lora_rank', 'qk_rope_head_dim'])],
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
          description: t('Draft layers are counted only when Include draft KV cache is enabled for models that define a next-token prediction stack.', '仅当模型定义了下一 token 预测栈，并且勾选了「包含草稿 KV 缓存」时才计入草稿层。'),
        },
        {
          name: 'active_indexer_layers',
          expression: 'main_indexer_layers + draft_indexer_layers_if_enabled',
          description: t('For DSA models with shared indexer layers, only full indexer layers allocate independent indexer key cache.', '对于带共享 indexer 层的 DSA 模型，只有完整 indexer 层才会单独分配 indexer key 缓存。'),
        },
        {
          name: 'kv_bytes',
          expression: 'tokens x sequences x active_layers x (kv_lora_rank + qk_rope_head_dim) x kv_precision_bytes',
          description: t('Latent KV payload stored by the production MLA/DSA path.', '生产 MLA/DSA 路径中存储的隐变量 KV 数据量。'),
        },
        {
          name: 'indexer_bytes',
          expression: 'tokens x sequences x active_indexer_layers x index_head_dim x indexer_precision_bytes',
          description: t('Additional per-token indexer state used by the indexer attention path.', 'indexer 注意力路径额外使用的每 token indexer 状态。'),
        },
        {
          name: 'total_bytes',
          expression: 'kv_bytes + indexer_bytes',
          description: t('Combined cache payload after applying the selected KV and indexer precisions.', '应用所选 KV 与 indexer 精度后的缓存总量。'),
        },
      ],
      note: indexerPlan.sharedIndexerLayers > 0
        ? 'Production estimate uses latent KV plus independently stored indexer state; shared indexer layers reuse the full indexer layers\' selection. Expanded HF-compatible cache is not included.'
        : t('Production estimate uses latent KV plus indexer state; expanded HF-compatible cache is not included.', '生产估算使用隐变量 KV 加上 indexer 状态，不含展开后的 HF 兼容缓存。'),
      byteGroups: [
        { role: 'kv', label: t('KV cache', 'KV 缓存'), elements: kvElementsPerToken * tokens },
        { role: 'indexer', label: t('Indexer cache', 'Indexer 缓存'), elements: indexerElementsPerToken * tokens },
      ],
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Draft layers included', '计入的草稿层'), draftLayers, t('Extra next-token prediction layers included in KV capacity when the checkbox is enabled.', '勾选复选框后，额外计入 KV 容量的下一 token 预测层。')],
        [t('Main indexer layers', '主 indexer 层数'), indexerPlan.mainIndexerLayers, t('Full indexer layers that allocate independent indexer key cache.', '会单独分配 indexer key 缓存的完整 indexer 层。')],
        [t('Shared indexer layers', '共享 indexer 层数'), indexerPlan.sharedIndexerLayers, t("DSA layers that reuse the previous full indexer layer's top-k selection.", '复用上一层完整 indexer 的 top-k 选择的 DSA 层。')],
        [t('Draft indexer layers included', '计入的草稿 indexer 层数'), indexerPlan.draftIndexerLayers, t('Draft/MTP indexer layers counted when Include draft KV cache is enabled.', '勾选「包含草稿 KV 缓存」时计入的草稿/MTP indexer 层。')],
        [t('KV elements per token', '每 token 的 KV 元素数'), kvElementsPerToken, t('Latent KV elements per token before applying KV precision.', '应用 KV 精度前，每 token 的隐变量 KV 元素数。')],
        [t('Indexer elements per token', '每 token 的 indexer 元素数'), indexerElementsPerToken, t('Indexer elements per token before applying indexer precision.', '应用 indexer 精度前，每 token 的 indexer 元素数。')],
        [t('Per-token elements', '每 token 元素数'), elementsPerToken, t('KV plus indexer scalar elements per token before multiplying by precision bytes.', '每 token 的 KV 与 indexer 标量元素数合计（再乘以精度字节数）。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'kv_lora_rank', 'qk_rope_head_dim', 'index_head_dim', 'indexer_full_layers', 'indexer_shared_layers', 'draft_indexer_layers'])],
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
      { role: 'kv', label: t('Full-attention KV cache', '全注意力 KV 缓存'), elements: fullElements },
    ];
    const formulaRows = [
      {
        name: 'full_kv_bytes',
        expression: 'tokens x sequences x full_attention_layers x 2 x num_key_value_heads x head_dim x precision_bytes',
        description: t('Only Qwen full-attention layers are counted as ordinary token-linear KV cache.', '只有 Qwen 全注意力层按普通的「随 token 线性增长」的 KV 缓存计算。'),
      },
    ];

    if (includeLinearAttentionState) {
      byteGroups.push({
        role: 'linear_state',
        label: t('Linear-attention state', '线性注意力状态'),
        bytesPerSequence: linearStateBytesPerSequence,
      });
      formulaRows.push(
        {
          name: 'linear_conv_state_bytes',
          expression:
            'sequences x linear_attention_layers x linear_conv_kernel_dim x (2 x linear_num_key_heads x linear_key_head_dim + linear_num_value_heads x linear_value_head_dim) x 2',
          description: t('Fixed-size Qwen linear-attention convolution state, estimated at BF16/FP16 precision.', '固定大小的 Qwen 线性注意力卷积状态，按 BF16/FP16 精度估算。'),
        },
        {
          name: 'linear_recurrent_state_bytes',
          expression:
            'sequences x linear_attention_layers x linear_num_value_heads x linear_key_head_dim x linear_value_head_dim x 4',
          description: t('Fixed-size Qwen Gated DeltaNet recurrent state, estimated at FP32 precision.', '固定大小的 Qwen Gated DeltaNet 循环状态，按 FP32 精度估算。'),
        },
        {
          name: 'total_bytes',
          expression: 'full_kv_bytes + linear_conv_state_bytes + linear_recurrent_state_bytes',
          description: t('Ordinary full-attention KV plus optional Qwen linear-attention runtime state.', '普通全注意力 KV，加上可选的 Qwen 线性注意力运行时状态。'),
        },
      );
    } else {
      formulaRows.push(
        {
          name: 'linear_attention_state',
          expression: t('excluded unless Include linear-attention state is enabled', '除非启用「包含线性注意力状态」，否则不计入'),
          description: t('Qwen linear-attention / Gated DeltaNet layers keep non-standard recurrent and convolution state rather than ordinary per-token K/V tensors.', 'Qwen 线性注意力 / Gated DeltaNet 层保存的是非标准的循环状态与卷积状态，而不是普通的每 token K/V 张量。'),
        },
        {
          name: 'total_bytes',
          expression: 'full_kv_bytes',
          description: t('Capacity-planning estimate for reusable ordinary KV payload only.', '仅针对可复用的普通 KV 数据量给出容量规划估算。'),
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
        ? t('Qwen3.5/3.6 linear-attention state is sequence-level runtime state, not per-token KV. It does not grow linearly with tokens, so it matters more for short prompts and is diluted by full-attention KV at long context.', 'Qwen3.5/3.6 的线性注意力状态是序列级运行时状态，而不是每 token 的 KV。它不随 token 数线性增长，因此短提示词时影响更大，长上下文下则会被全注意力 KV 稀释。')
        : t('Qwen3.5/3.6 linear-attention recurrent/conv state is not ordinary per-token KV and is excluded by default. Enable the linear-attention state option to add a fixed runtime-state estimate.', 'Qwen3.5/3.6 的线性注意力循环/卷积状态不是普通的每 token KV，默认不计入。勾选线性注意力状态选项后，会额外加上固定运行时状态估算。'),
      byteGroups,
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Full-attention layers', '全注意力层数'), fullLayers, t('Layers counted as ordinary token-linear KV cache.', '按普通「随 token 线性增长」的 KV 缓存计算的层。')],
        [t('Linear-attention layers', '线性注意力层数'), linearLayers, t('Qwen Gated DeltaNet layers whose runtime state is optional and does not grow linearly with token count.', 'Qwen Gated DeltaNet 层，其运行时状态可选，且不随 token 数线性增长。')],
        [t('Linear state included', '包含线性状态'), includeLinearAttentionState ? t('Yes', '是') : t('No', '否'), t('When enabled, adds fixed convolution and recurrent state for Qwen linear-attention layers.', '启用后，为 Qwen 线性注意力层加上固定的卷积状态与循环状态。')],
        [t('Linear conv elements', '线性卷积元素数'), linearConvElements, t('Fixed convolution-state scalar elements per sequence before applying the 2-byte estimate.', '按 2 字节估算前，每序列固定的卷积状态标量元素数。')],
        [t('Linear recurrent elements', '线性循环元素数'), linearRecurrentElements, t('Fixed recurrent-state scalar elements per sequence before applying the 4-byte estimate.', '按 4 字节估算前，每序列固定的循环状态标量元素数。')],
        [t('MTP layers not included', '未计入的 MTP 层数'), mtpLayers, t('Qwen3.5/3.6 configs expose MTP layers, but the cache shape is not explicit enough to include defensibly.', 'Qwen3.5/3.6 配置里暴露了 MTP 层，但缓存形状信息不够明确，无法有把握地计入。')],
        [t('Per-token elements', '每 token 元素数'), elementsPerToken, t('Ordinary full-attention KV scalar elements per token before multiplying by precision bytes.', '普通全注意力 KV 的每 token 标量元素数（再乘以精度字节数）。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'full_attention_layers', 'linear_attention_layers', 'num_key_value_heads', 'head_dim', 'linear_num_key_heads', 'linear_key_head_dim', 'linear_num_value_heads', 'linear_value_head_dim', 'linear_conv_kernel_dim'])],
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
          description: t('Full-attention layers retain ordinary KV for all cached tokens.', '全注意力层为所有已缓存 token 保留普通 KV。'),
        },
        {
          name: 'sliding_kv_bytes',
          expression: 'min(tokens, sliding_window) x sequences x sliding_layers x sliding_kv_heads x (sliding_head_dim + sliding_v_head_dim) x precision_bytes',
          description: t('Sliding-attention layers retain only the local window for each sequence.', '滑窗注意力层每个序列只保留局部窗口内的 KV。'),
        },
        {
          name: 'total_bytes',
          expression: 'full_kv_bytes + sliding_kv_bytes',
          description: t('Combined reusable full-attention and sliding-window KV payload.', '全注意力与滑窗 KV 合并后的可复用数据量。'),
        },
      ],
      note: t('Production estimate counts text-generation KV payload only. Vision/audio encoder activations and allocator memory are excluded.', '生产估算只统计文本生成的 KV 数据量，不含视觉/音频编码器的激活值与分配器内存。'),
      byteGroups: [
        { role: 'kv', label: t('Full-attention KV cache', '全注意力 KV 缓存'), elements: fullElements },
        { role: 'kv', label: t('Sliding-window KV cache', '滑窗 KV 缓存'), elements: slidingElements },
      ],
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Stored layers', '实际存储的层数'), optionalField(model, 'stored_layers', fullLayers + slidingLayers), t('KV-producing layers counted after model-specific KV sharing, when configured.', '若模型配置了 KV 共享，则按共享后的结果统计会产生 KV 的层数。')],
        [t('Full-attention layers', '全注意力层数'), fullLayers, t('Layers whose KV grows with total cached tokens.', 'KV 随已缓存 token 总数增长的层。')],
        [t('Sliding-attention layers', '滑窗注意力层数'), slidingLayers, t('Layers whose KV is capped by the sliding window.', 'KV 大小受滑窗上限约束的层。')],
        [t('Retained sliding tokens', '保留的滑窗 token 数'), retainedSlidingTokens, 'min(tokens, sliding_window) for sliding-attention layers.'],
        [t('Full K+V dims', '全注意力 K+V 维度'), fullHeadDim + fullVHeadDim, t('Key plus value dimensions per full-attention KV head.', '每个全注意力 KV 头的 key 与 value 维度之和。')],
        [t('Sliding K+V dims', '滑窗 K+V 维度'), slidingHeadDim + slidingVHeadDim, t('Key plus value dimensions per sliding-window KV head.', '每个滑窗 KV 头的 key 与 value 维度之和。')],
        [t('Full-attention elements', '全注意力元素数'), fullElements, t('Full-attention scalar KV elements before applying precision bytes.', '应用精度字节数之前的全注意力标量 KV 元素数。')],
        [t('Sliding-window elements', '滑窗元素数'), slidingElements, t('Sliding-window scalar KV elements before applying precision bytes.', '应用精度字节数之前的滑窗标量 KV 元素数。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'full_attention_layers', 'sliding_attention_layers', 'num_key_value_heads', 'num_global_key_value_heads', 'head_dim', 'global_head_dim', 'v_head_dim', 'global_v_head_dim', 'swa_num_key_value_heads', 'swa_head_dim', 'swa_v_head_dim', 'sliding_window'])],
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
          description: t('MiniMax M3 stores ordinary main K/V cache for both full-attention and sparse-attention layers.', 'MiniMax M3 对全注意力和稀疏注意力层都保存普通的主 K/V 缓存。'),
        },
        {
          name: 'indexer_bytes',
          expression: 'tokens x sequences x sparse_attention_layers x index_head_dim x indexer_precision_bytes',
          description: t('MSA sparse layers keep a key-only side cache for the lightning indexer; index_n_heads affects scoring, not the stored index-key cache width.', 'MSA 稀疏层为 lightning indexer 保存只含 key 的旁路缓存；index_n_heads 影响打分，不影响已存储 index-key 缓存的宽度。'),
        },
        {
          name: 'total_bytes',
          expression: 'kv_bytes + indexer_bytes',
          description: t('Combined main KV cache and MSA index-key side cache.', '主 KV 缓存与 MSA index-key 旁路缓存之和。'),
        },
      ],
      note: t('MiniMax Sparse Attention (MSA) uses a lightweight indexer to pick the most relevant KV blocks for each query, so long-context attention can read a sparse subset of the cached tokens while keeping a separate indexer cache for block selection.', 'MiniMax 稀疏注意力（MSA）用一个轻量 indexer 为每个 query 选出最相关的 KV 块，因此长上下文注意力只需读取缓存 token 的稀疏子集，同时保留独立的 indexer 缓存用于块选择。'),
      byteGroups: [
        { role: 'kv', label: t('KV cache', 'KV 缓存'), elements: kvElements },
        { role: 'indexer', label: t('Indexer cache', 'Indexer 缓存'), elements: indexerElements },
      ],
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Full-attention layers', '全注意力层数'), fullLayers, t('Dense/full-attention layers without the MSA indexer branch.', '不含 MSA indexer 分支的稠密/全注意力层。')],
        [t('Sparse-attention layers', '稀疏注意力层数'), sparseLayers, t('MSA layers that add a key-only indexer side cache.', '额外带只含 key 的 indexer 旁路缓存的 MSA 层。')],
        [t('KV elements per token', '每 token 的 KV 元素数'), kvElementsPerToken, t('Main K/V elements per token before applying KV precision.', '应用 KV 精度前，每 token 的主 K/V 元素数。')],
        [t('Indexer elements per token', '每 token 的 indexer 元素数'), indexerElementsPerToken, t('MSA index-key elements per token before applying indexer precision.', '应用 indexer 精度前，每 token 的 MSA index-key 元素数。')],
        [t('Index heads', 'Indexer 头数'), indexHeads, t('Indexer query heads used for scoring selected KV blocks; the stored index-key cache is key-only.', '用于给选中 KV 块打分的 indexer query 头数；存储的 index-key 缓存只含 key。')],
        [t('Index block size', 'Indexer 块大小'), blockSize, t('Number of tokens per sparse-selection block. This is not a sliding-window cache cap.', '每个稀疏选择块包含的 token 数，这不是滑窗缓存上限。')],
        [t('Top-k blocks', 'Top-k 块数'), topkBlocks, t('Sparse blocks selected by the indexer for each query.', 'indexer 为每个 query 选出的稀疏块数量。')],
        [t('Local blocks', '本地块数'), localBlocks, t('Recent local blocks always visible to the sparse attention path.', '稀疏注意力路径始终可见的近期本地块数量。')],
        [t('MTP modules not included', '未计入的 MTP 模块数'), mtpModules, t('The public MiniMax M3 checkpoint/config exposes MTP fields, but bundled MTP weights are not modeled in the base serving path.', '公开的 MiniMax M3 checkpoint/config 里暴露了 MTP 字段，但基础推理路径并未建模配套的 MTP 权重。')],
        [t('Next-N layers not included', '未计入的 Next-N 层数'), nextnLayers, t('Config field retained for traceability; draft KV is not included for MiniMax M3.', '保留该配置字段便于追溯；MiniMax M3 不计入草稿 KV。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'full_attention_layers', 'sparse_attention_layers', 'num_key_value_heads', 'head_dim', 'index_head_dim', 'index_n_heads', 'index_block_size', 'index_topk_blocks', 'index_local_blocks', 'indexer_fixed_precision_id'])],
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
          description: t('Includes ratio=0 layers. Ratio=0 layers only contribute this fixed sliding-window KV and do not add compressed KV slots.', '包含 ratio=0 的层。ratio=0 的层只贡献这部分固定的滑窗 KV，不增加压缩 KV 槽位。'),
        },
        {
          name: 'compressed_kv_bytes',
          expression: 'sum over ratio>0 layers: floor(tokens / compress_ratio) x head_dim x kv_precision_bytes',
          description: t('Compressed KV cache from layers whose compress_ratio is greater than zero; each layer keeps floor(tokens / compress_ratio) compressed slots.', 'compress_ratio 大于 0 的层产生的压缩 KV 缓存；每层保留 floor(tokens / compress_ratio) 个压缩槽位。'),
        },
        {
          name: 'kv_bytes',
          expression: 'sliding_kv_bytes + compressed_kv_bytes',
          description: t('Main DeepSeek V4 KV cache before adding the separate indexer cache.', '加上独立 indexer 缓存之前的主要 DeepSeek V4 KV 缓存。'),
        },
        {
          name: 'indexer_bytes',
          expression: 'ratio4_layers x floor(tokens / 4) x index_head_dim x indexer_precision_bytes',
          description: t('Ratio=4 layers keep an extra compressed indexer cache that can use a separate precision.', 'ratio=4 的层额外保留一份压缩 indexer 缓存，可使用独立的精度。'),
        },
        {
          name: 'total_bytes',
          expression: 'sequences x (kv_bytes + indexer_bytes)',
          description: t('Combined DeepSeek V4 cache payload for all concurrent sequences.', '所有并发序列的 DeepSeek V4 缓存总量。'),
        },
      ],
      note: t('Production estimate uses the official sliding-window/compressed-cache layout. The default DeepSeek V4 setting uses FP8 attention cache and FP4 indexer cache.', '生产估算采用官方的滑窗/压缩缓存布局。DeepSeek V4 的默认设置使用 FP8 注意力缓存和 FP4 indexer 缓存。'),
      byteGroups: [
        { role: 'kv', label: t('KV cache', 'KV 缓存'), elements: attentionElements },
        { role: 'indexer', label: t('Indexer cache', 'Indexer 缓存'), elements: indexerElements },
      ],
      components: [
        [t('Main layers', '主层数'), mainRatios.length],
        [t('Draft layers included', '计入的草稿层'), includeDraftKvCache ? draftRatios.length : 0, t('Extra MTP/draft layers after the main transformer layers. In DeepSeek V4 configs these are ratio=0 layers.', '主 Transformer 层之后的额外 MTP/草稿层。在 DeepSeek V4 配置中这些是 ratio=0 的层。')],
        [t('Ratio=4 layers', 'ratio=4 的层数'), ratioFourLayers, t('Layers whose compressed cache ratio is 4; these layers also carry indexer cache.', '压缩缓存比例为 4 的层；这些层还带有 indexer 缓存。')],
        [t('Ratio=128 layers', 'ratio=128 的层数'), ratio128Layers, t('Layers whose compressed cache keeps floor(tokens / 128) compressed KV slots.', '压缩缓存保留 floor(tokens / 128) 个压缩 KV 槽位的层。')],
        [t('Ratio=0 layers', 'ratio=0 的层数'), ratioZeroLayers, t('Layers with no compressed KV segment; they keep only the sliding-window KV cache.', '没有压缩 KV 段的层；它们只保留滑窗 KV 缓存。')],
        [t('Ratio=0 KV elements', 'ratio=0 的 KV 元素数'), ratioZeroElements, t('The ratio=0 contribution: ratio0_layers x sliding_window x head_dim.', 'ratio=0 部分的贡献：ratio0_layers × sliding_window × head_dim。')],
        [t('Sliding-window elements', '滑窗元素数'), windowElements, t('Per-layer local KV reserve: sliding_window x head_dim, summed across active layers.', '每层的本地 KV 预留：sliding_window × head_dim，在所有生效层上求和。')],
        [t('Compressed elements', '压缩元素数'), compressedElements, t('Compressed KV elements from layers with compress_ratio greater than zero.', 'compress_ratio 大于 0 的层产生的压缩 KV 元素数。')],
        [t('KV elements', 'KV 元素数'), attentionElements, t('Sliding-window plus compressed attention cache elements before applying KV precision.', '应用 KV 精度前，滑窗与压缩注意力缓存的元素数之和。')],
        [t('Indexer elements', 'Indexer 元素数'), indexerElements, t('Compressed indexer elements from ratio=4 layers before applying indexer precision.', '应用 indexer 精度前，ratio=4 层产生的压缩 indexer 元素数。')],
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
      formulaLabel: t(`Unknown (${formula}) — estimated as GQA`, `未知公式（${formula}）—— 按 GQA 估算`),
      formulaText:
        'total_bytes = tokens * sequences * active_layers * 2 * num_key_value_heads * head_dim * precision_bytes',
      formulaRows: [
        {
          name: 'total_bytes',
          expression: 'tokens x sequences x active_layers x 2 x num_key_value_heads x head_dim x precision_bytes',
          description: t(`Formula "${formula}" is not recognized; estimated with the standard GQA layout from the model's own fields.`, `无法识别公式「${formula}」，已改用模型自身字段按标准 GQA 布局估算。`),
        },
      ],
      note: t(`Formula "${formula}" is not supported by the KV engine; a standard GQA estimate is shown instead.`, `KV 引擎不支持公式「${formula}」，此处显示标准 GQA 估算结果。`),
      byteGroups: [{ role: 'kv', label: t('KV cache', 'KV 缓存'), elements: elementsPerToken * tokens }],
      components: [
        [t('Main layers', '主层数'), layers],
        [t('Draft layers included', '计入的草稿层'), draftLayers, t('Extra MTP/draft layers included in KV capacity when the checkbox is enabled.', '勾选复选框后，额外计入 KV 容量的 MTP/草稿层。')],
        [t('Per-token elements', '每 token 元素数'), elementsPerToken, t('Number of scalar KV elements needed for one token before multiplying by precision bytes.', '单个 token 所需的标量 KV 元素数（再乘以精度字节数）。')],
        [t('Model fields', '模型字段'), fieldList(model, ['num_hidden_layers', 'num_key_value_heads', 'head_dim'])],
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
    throw new Error(t(`Model ${model.id} has no advanced KV layout config`, `模型 ${model.id} 没有配置高级 KV 布局`));
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
