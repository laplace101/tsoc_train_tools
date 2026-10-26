// Feature: llm-hardware-calculator, Properties 10, 11, 15, 22
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeTotalVRAM } from './aggregate';
import { computeThroughput } from './throughput';
import { computeCostMetrics } from './cost-metrics';
import type { ModelSpec, PrecisionConfig } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeModel(overrides: Partial<ModelSpec['architecture']> = {}): ModelSpec {
  return {
    id: 'test-model',
    family: 'llama',
    displayName: 'Test Model',
    releaseDate: '2024-01-01',
    license: 'Apache-2.0',
    paramsTotal: 7_000_000_000,
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
      maxContextLength: 131072,
      positionalEmbedding: 'rope',
      ...overrides,
    },
  };
}

const fp16: PrecisionConfig = { key: 'fp16', label: 'FP16', bytesPerParam: 2.0 };
const q4km: PrecisionConfig = { key: 'q4_k_m', label: 'GGUF Q4_K_M', bytesPerParam: 0.606 };

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe('computeTotalVRAM — unit tests', () => {
  it('Llama-3.1-70B Q4_K_M inference at 32k: total ≈ 55.8 GB (PRFAQ worked example)', () => {
    const model: ModelSpec = {
      ...makeModel(),
      paramsTotal: 70_550_000_000,
      architecture: {
        numLayers: 80, hiddenSize: 8192, intermediateSize: 28672,
        numAttentionHeads: 64, numKeyValueHeads: 8, headDim: 128,
        vocabSize: 128256, tieWordEmbeddings: false,
        attentionType: 'gqa', maxContextLength: 131072, positionalEmbedding: 'rope',
      },
    };
    const result = computeTotalVRAM(model, q4km, fp16, 32768, 1, 'inference');
    // weights ≈ 42.8, kv ≈ 10.7, overhead 1.0 → total ≈ 54.5–56 GB
    expect(result.totalGB).toBeGreaterThan(50);
    expect(result.totalGB).toBeLessThan(60);
    expect(result.weightsGB).toBeCloseTo(42.8, 0);
  });

  it('inference mode: kvCacheGB > 0, activations/gradients/optimizer = 0', () => {
    const result = computeTotalVRAM(makeModel(), fp16, fp16, 4096, 1, 'inference');
    expect(result.kvCacheGB).toBeGreaterThan(0);
    expect(result.activationsGB).toBe(0);
    expect(result.gradientsGB).toBe(0);
    expect(result.optimizerGB).toBe(0);
  });

  it('train mode: activations/gradients/optimizer > 0, kvCacheGB = 0', () => {
    const result = computeTotalVRAM(makeModel(), fp16, fp16, 2048, 1, 'train');
    expect(result.kvCacheGB).toBe(0);
    expect(result.activationsGB).toBeGreaterThan(0);
    expect(result.gradientsGB).toBeGreaterThan(0);
    expect(result.optimizerGB).toBeGreaterThan(0);
  });

  it('overhead is always 1 GB', () => {
    const result = computeTotalVRAM(makeModel(), fp16, fp16, 4096, 1, 'inference');
    expect(result.overheadGB).toBe(1.0);
  });

  it('train mode with TP/PP shards weights/gradients/optimizer and keeps the sum invariant', () => {
    const trainingOptions = {
      mode: 'full' as const,
      gradientCheckpointing: true,
      tp: 2,
      pp: 2,
      dp: 1,
    };
    const result = computeTotalVRAM(makeModel(), fp16, fp16, 2048, 1, 'train', trainingOptions);
    // weights = 7e9 * 2 / 1e9 = 14 GB; sharded by tp*pp = 4 → 3.5 GB
    expect(result.weightsGB).toBeCloseTo(3.5, 1);
    // gradients = 7e9 * 2 / 1e9 = 14 GB; /4 → 3.5 GB
    expect(result.gradientsGB).toBeCloseTo(3.5, 1);
    // optimizer = 7e9 * 12 / 1e9 = 84 GB; /4 → 21 GB
    expect(result.optimizerGB).toBeCloseTo(21, 1);
    // Sum invariant still holds
    const sum = result.weightsGB + result.kvCacheGB + result.activationsGB +
      result.gradientsGB + result.optimizerGB + result.overheadGB;
    expect(result.totalGB).toBeCloseTo(sum, 5);
  });

  it('default TP/PP/DP (1/1/1) leaves components unchanged vs no parallelism', () => {
    const base = computeTotalVRAM(makeModel(), fp16, fp16, 2048, 1, 'train', {
      mode: 'full', gradientCheckpointing: true,
    });
    const withDefaults = computeTotalVRAM(makeModel(), fp16, fp16, 2048, 1, 'train', {
      mode: 'full', gradientCheckpointing: true, tp: 1, pp: 1, dp: 1,
    });
    expect(withDefaults.totalGB).toBeCloseTo(base.totalGB, 5);
    expect(withDefaults.weightsGB).toBeCloseTo(base.weightsGB, 5);
  });

  it('sft_lora with loraTargetModules uses N_trainable (not full params) for gradients/optimizer', () => {
    // Two expanded q_proj modules (d_in = d_out = 4096) × rank 8 → tiny N_trainable.
    const trainableParams = 8 * (4096 + 4096) * 2; // 131,072 params
    const loraTargetModules = [
      { dIn: 4096, dOut: 4096 },
      { dIn: 4096, dOut: 4096 },
    ];
    const model = makeModel();
    const result = computeTotalVRAM(model, fp16, fp16, 2048, 1, 'train', {
      mode: 'lora',
      trainingMethodId: 'sft_lora',
      gradientCheckpointing: true,
      loraRank: 8,
      loraTargetModules,
    });
    const b = result;
    // Gradients = N_trainable × 2 bytes, far below the 7B full-model 14 GB.
    expect(b.gradientsGB).toBeCloseTo((trainableParams * 2) / 1e9, 6);
    expect(b.optimizerGB).toBeCloseTo((trainableParams * 12) / 1e9, 6);
    expect(b.gradientsGB).toBeLessThan((model.paramsTotal * 2) / 1e9 / 10);
    // Invariant holds after LoRA trainable trimming.
    expect(result.totalGB).toBeCloseTo(
      b.weightsGB + b.activationsGB + b.gradientsGB + b.optimizerGB + b.overheadGB,
      6
    );
  });
});

// ─── Property 10: VRAM breakdown sum invariant ───────────────────────────────
// **Validates: Requirements 3.6, 4.1, 4.4**

describe('Property 10: VRAM breakdown sum invariant', () => {
  it('sum of all components equals totalGB', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 512, max: 32768 }),
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom('inference', 'train', 'finetune') as fc.Arbitrary<'inference' | 'train' | 'finetune'>,
        (contextLength, batchSize, mode) => {
          const result = computeTotalVRAM(makeModel(), fp16, fp16, contextLength, batchSize, mode);
          const sum = result.weightsGB + result.kvCacheGB + result.activationsGB +
            result.gradientsGB + result.optimizerGB + result.overheadGB;
          expect(result.totalGB).toBeCloseTo(sum, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Mode-dependent VRAM components ─────────────────────────────
// **Validates: Requirements 11.2, 11.3, 11.4**

describe('Property 11: Mode-dependent VRAM components', () => {
  it('inference: kvCache > 0, training components = 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 512, max: 32768 }),
        fc.integer({ min: 1, max: 8 }),
        (contextLength, batchSize) => {
          const result = computeTotalVRAM(makeModel(), fp16, fp16, contextLength, batchSize, 'inference');
          expect(result.kvCacheGB).toBeGreaterThan(0);
          expect(result.activationsGB).toBe(0);
          expect(result.gradientsGB).toBe(0);
          expect(result.optimizerGB).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('train: activations/gradients/optimizer > 0, kvCache = 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 512, max: 4096 }),
        fc.integer({ min: 1, max: 4 }),
        (contextLength, batchSize) => {
          const result = computeTotalVRAM(makeModel(), fp16, fp16, contextLength, batchSize, 'train');
          expect(result.kvCacheGB).toBe(0);
          expect(result.activationsGB).toBeGreaterThan(0);
          expect(result.gradientsGB).toBeGreaterThan(0);
          expect(result.optimizerGB).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 15: Throughput formula correctness ─────────────────────────────
// **Validates: Requirements 7.1, 7.3, 7.4**

describe('Property 15: Throughput formula correctness', () => {
  it('returns floor(bandwidth / activeWeights × efficiency) as whole number', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(8000), noNaN: true }),   // bandwidth GB/s
        fc.float({ min: Math.fround(1), max: Math.fround(700), noNaN: true }),       // activeWeightsGB
        fc.float({ min: Math.fround(0.55), max: Math.fround(0.95), noNaN: true }),   // efficiencyFactor
        (memoryBandwidthGBs, activeWeightsGB, efficiencyFactor) => {
          const result = computeThroughput({ memoryBandwidthGBs, activeWeightsGB, efficiencyFactor });
          const expected = Math.floor((memoryBandwidthGBs / activeWeightsGB) * efficiencyFactor);
          expect(result.tokensPerSecond).toBe(expected);
          expect(Number.isInteger(result.tokensPerSecond)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns 0 when activeWeightsGB is 0', () => {
    const result = computeThroughput({ memoryBandwidthGBs: 1000, activeWeightsGB: 0, efficiencyFactor: 0.8 });
    expect(result.tokensPerSecond).toBe(0);
  });
});

// ─── Property 22: Cost per million tokens formula ────────────────────────────
// **Validates: Requirements 29.2, 36.3**

describe('Property 22: Cost per million tokens formula', () => {
  it('costPerMillionTokens = round((hourlyCloudCost / (tokPerSec × 3600)) × 1_000_000, 2)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),   // hourlyCloudCost
        fc.integer({ min: 1, max: 10000 }),               // tokensPerSecond
        (hourlyCloudCost, tokensPerSecond) => {
          const result = computeCostMetrics({
            tokensPerSecond, hourlyCloudCost,
            contextLength: 4096, activeWeightsGB: 16, computeTFLOPS: 312,
          });
          const expected = Math.round((hourlyCloudCost / (tokensPerSecond * 3600)) * 1_000_000 * 100) / 100;
          expect(result.costPerMillionTokens).toBe(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('returns 0 when tokensPerSecond is 0', () => {
    const result = computeCostMetrics({
      tokensPerSecond: 0, hourlyCloudCost: 2.49,
      contextLength: 4096, activeWeightsGB: 16, computeTFLOPS: 312,
    });
    expect(result.costPerMillionTokens).toBe(0);
  });
});
