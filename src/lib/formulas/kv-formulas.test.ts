// Advanced KV formula engine — golden values from kv-cache-calculator tests
import { describe, it, expect } from 'vitest';
import {
  computeModelKVCache,
  modelHasAdvancedKV,
  modelHasDraftKvCache,
  modelHasIndexerCache,
  modelHasLinearAttentionState,
  FORMULA_LABELS,
} from './kv-formulas';
import type { ModelSpec, KVFormula, KVLayoutConfig } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKVModel(formula: KVFormula, fields: KVLayoutConfig['fields'], overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: overrides.id ?? 'test-model',
    family: 'test',
    displayName: 'Test Model',
    releaseDate: '2026-01-01',
    license: 'Apache-2.0',
    paramsTotal: 10_000_000_000,
    architecture: {
      numLayers: 32,
      hiddenSize: 4096,
      intermediateSize: 11008,
      numAttentionHeads: 32,
      numKeyValueHeads: 8,
      headDim: 128,
      vocabSize: 32000,
      tieWordEmbeddings: false,
      attentionType: 'gqa',
      maxContextLength: 262144,
      positionalEmbedding: 'rope',
    },
    ...overrides,
    kv: { formula, fields },
  };
}

// DeepSeek V4 Pro compress_ratios (62 = 61 main layers + 1 draft ratio=0 layer)
const DEEPSEEK_V4_PRO_RATIOS = [
  128, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4,
  128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128,
  4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4, 128, 4,
  128, 4, 128, 4, 0,
];

const deepseekV4Pro = () => makeKVModel('deepseek_v4_hybrid', {
  head_dim: 512,
  index_head_dim: 128,
  sliding_window: 128,
  num_hidden_layers: 61,
  compress_ratios: DEEPSEEK_V4_PRO_RATIOS,
});

// ─── Unit tests ──────────────────────────────────────────────────────────────

describe('computeModelKVCache — standard GQA', () => {
  it('Qwen3-32B @128k BF16 matches the upstream golden value (31.25 GiB)', () => {
    const model = makeKVModel('standard_gqa', {
      num_hidden_layers: 64,
      num_key_value_heads: 8,
      head_dim: 128,
    });
    const result = computeModelKVCache(model, {
      batchSize: 1,
      seqLen: 128000,
      kvBytesPerElement: 2,
      indexerBytesPerElement: 2,
    });
    expect(result.elementsPerToken).toBe(131072);
    expect(result.rawBytes).toBe(131072 * 128000 * 2);
    expect(result.kvCacheGB).toBeCloseTo(33.554432, 5);
    expect(result.indexerCacheGB).toBe(0);
    expect(result.totalGB).toBeCloseTo(33.554432, 5);
    expect(result.formulaLabel).toBe(FORMULA_LABELS.standard_gqa);
  });
});

describe('computeModelKVCache — DeepSeek V4 hybrid', () => {
  it('default FP8 KV + FP4 indexer splits the payload into two byte groups', () => {
    const result = computeModelKVCache(deepseekV4Pro(), {
      batchSize: 1,
      seqLen: 1024,
      kvBytesPerElement: 1, // FP8
      indexerBytesPerElement: 0.5, // FP4
    });
    // 61 main layers: 30 ratio=4 + 31 ratio=128; draft (ratio=0) excluded.
    // attention = 61*128*512 + 30*floor(1024/4)*512 + 31*floor(1024/128)*512
    const attentionElements = 61 * 128 * 512 + 30 * 256 * 512 + 31 * 8 * 512;
    const indexerElements = 30 * 256 * 128;
    expect(result.elementsPerToken).toBe((attentionElements + indexerElements) / 1024);
    expect(result.kvCacheGB).toBeCloseTo(attentionElements / 1e9, 6);
    expect(result.indexerCacheGB).toBeCloseTo(indexerElements * 0.5 / 1e9, 6);
    expect(result.totalGB).toBeCloseTo((attentionElements + indexerElements * 0.5) / 1e9, 6);
    expect(result.formulaLabel).toBe(FORMULA_LABELS.deepseek_v4_hybrid);
  });

  it('with draft KV enabled adds the trailing ratio=0 layer to sliding-window KV', () => {
    const off = computeModelKVCache(deepseekV4Pro(), {
      batchSize: 1, seqLen: 1024, kvBytesPerElement: 2, indexerBytesPerElement: 2,
    });
    const on = computeModelKVCache(deepseekV4Pro(), {
      batchSize: 1, seqLen: 1024, kvBytesPerElement: 2, indexerBytesPerElement: 2,
      includeDraftKvCache: true,
    });
    // Draft layer contributes only sliding-window KV: 128 * 512 * kvBytes
    expect(on.kvCacheGB - off.kvCacheGB).toBeCloseTo((128 * 512 * 2) / 1e9, 6);
  });

  it('exposes the formula steps and components used for the UI formula card', () => {
    const result = computeModelKVCache(deepseekV4Pro(), {
      batchSize: 32,
      seqLen: 262144,
      kvBytesPerElement: 1, // FP8
      indexerBytesPerElement: 0.5, // FP4 (default indexer)
    });
    expect(result.formulaText).toContain('sliding_kv_bytes');
    expect(result.formulaRows?.length).toBeGreaterThan(0);
    const names = result.formulaRows?.map((r) => r.name) ?? [];
    expect(names).toContain('compressed_kv_bytes');
    expect(names).toContain('indexer_bytes');
    expect(result.components?.some(([name, value]) => /ratio=4/i.test(name) && value === 30)).toBe(true);
    // Regression anchor: the number the summary panel shows for this setting.
    expect(result.totalGB).toBeCloseTo(37.41, 2);
  });
});

describe('computeModelKVCache — MiniMax MSA', () => {
  it('reports KV and indexer side-cache separately', () => {
    const model = makeKVModel('minimax_msa', {
      num_hidden_layers: 60,
      full_attention_layers: 3,
      sparse_attention_layers: 57,
      num_key_value_heads: 4,
      head_dim: 128,
      index_head_dim: 128,
      index_n_heads: 4,
      index_block_size: 128,
      index_topk_blocks: 16,
      index_local_blocks: 1,
      num_mtp_modules: 7,
      num_nextn_predict_layers: 1,
      disable_draft_kv_cache: true,
      indexer_fixed_precision_id: 'bf16_fp16',
    });
    const result = computeModelKVCache(model, {
      batchSize: 1,
      seqLen: 1024,
      kvBytesPerElement: 2,
      indexerBytesPerElement: 2,
    });
    expect(result.elementsPerToken).toBe(60 * 2 * 4 * 128 + 57 * 128);
    expect(result.kvCacheGB).toBeCloseTo((60 * 2 * 4 * 128 * 1024 * 2) / 1e9, 6);
    expect(result.indexerCacheGB).toBeCloseTo((57 * 128 * 1024 * 2) / 1e9, 6);
    expect(result.formulaLabel).toBe(FORMULA_LABELS.minimax_msa);
  });
});

describe('computeModelKVCache — Qwen linear/full hybrid', () => {
  it('excludes linear state by default, adds fixed runtime state when enabled', () => {
    const model = makeKVModel('qwen_linear_full_hybrid', {
      num_hidden_layers: 64,
      full_attention_layers: 16,
      linear_attention_layers: 48,
      linear_conv_kernel_dim: 4,
      linear_key_head_dim: 128,
      linear_num_key_heads: 16,
      linear_num_value_heads: 48,
      linear_value_head_dim: 128,
      num_attention_heads: 24,
      num_key_value_heads: 4,
      head_dim: 256,
      mtp_num_hidden_layers: 1,
    });
    const base = computeModelKVCache(model, {
      batchSize: 1, seqLen: 1024, kvBytesPerElement: 2, indexerBytesPerElement: 2,
    });
    const withState = computeModelKVCache(model, {
      batchSize: 1, seqLen: 1024, kvBytesPerElement: 2, indexerBytesPerElement: 2,
      includeLinearAttentionState: true,
    });
    const conv = 48 * 4 * (2 * 16 * 128 + 48 * 128);
    const recurrent = 48 * 48 * 128 * 128;
    const linearStateBytes = conv * 2 + recurrent * 4;
    expect(base.kvCacheGB).toBeCloseTo((16 * 2 * 4 * 256 * 1024 * 2) / 1e9, 6);
    expect(withState.totalGB - base.totalGB).toBeCloseTo(linearStateBytes / 1e9, 6);
    expect(withState.rawBytes).toBe(base.rawBytes + linearStateBytes);
  });
});

describe('feature detection', () => {
  it('detects indexer cache for DSA/MiniMax/DeepSeek-V4 models only', () => {
    expect(modelHasIndexerCache(deepseekV4Pro())).toBe(true);
    expect(modelHasIndexerCache(makeKVModel('mla', { num_hidden_layers: 61, kv_lora_rank: 512, qk_rope_head_dim: 64 }))).toBe(false);
  });

  it('detects draft KV stack from compress_ratios length', () => {
    expect(modelHasDraftKvCache(deepseekV4Pro())).toBe(true);
    // DeepSeek V3 MLA has no draft stack
    expect(modelHasDraftKvCache(makeKVModel('mla', { num_hidden_layers: 61, kv_lora_rank: 512, qk_rope_head_dim: 64 }))).toBe(false);
  });

  it('detects Qwen linear attention state models', () => {
    expect(modelHasLinearAttentionState(makeKVModel('qwen_linear_full_hybrid', { full_attention_layers: 1 }))).toBe(true);
    expect(modelHasLinearAttentionState(deepseekV4Pro())).toBe(false);
  });

  it('modelHasAdvancedKV is false when the kv block is absent', () => {
    const plain = makeKVModel('standard_gqa', {});
    delete (plain as Partial<ModelSpec>).kv;
    expect(modelHasAdvancedKV(plain)).toBe(false);
    expect(modelHasAdvancedKV(deepseekV4Pro())).toBe(true);
  });
});
