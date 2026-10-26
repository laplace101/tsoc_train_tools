import { t } from '@/lib/i18n';
export interface WarmupEstimate {
  loadTimeSec: number;       // model_bytes / storage_bandwidth
  compileTimeSec: number;    // framework-specific
  warmupTimeSec: number;     // CUDA graph capture etc.
  totalColdStartSec: number;
  notes: string;
}

export type Framework = 'vllm' | 'sglang' | 'llama.cpp' | 'ollama';

/**
 * Framework-specific compile and warmup times (seconds).
 * Based on empirical observations:
 *   vLLM/SGLang: 30s–3min compile, ~10s CUDA graph capture for 70B
 *   llama.cpp/ollama: minimal compile, fast warmup
 */
const FRAMEWORK_TIMES: Record<Framework, {
  compileBase: number;
  compilePerBillionParams: number;
  warmupBase: number;
  warmupPerBillionParams: number;
  notes: string;
}> = {
  vllm: {
    compileBase: 30,
    compilePerBillionParams: 1.5,
    warmupBase: 10,
    warmupPerBillionParams: 0.1,
    get notes() { return t('vLLM: CUDA graph capture ~10s for 70B; compile 30s–3min', 'vLLM：70B 模型的 CUDA graph 捕获约 10 秒；编译 30 秒–3 分钟'); },
  },
  sglang: {
    compileBase: 30,
    compilePerBillionParams: 1.5,
    warmupBase: 8,
    warmupPerBillionParams: 0.08,
    get notes() { return t('SGLang: similar to vLLM; RadixAttention adds ~5s overhead', 'SGLang：与 vLLM 类似；RadixAttention 额外增加约 5 秒开销'); },
  },
  'llama.cpp': {
    compileBase: 2,
    compilePerBillionParams: 0.1,
    warmupBase: 2,
    warmupPerBillionParams: 0.05,
    notes: 'llama.cpp: minimal compile; fast startup',
  },
  ollama: {
    compileBase: 3,
    compilePerBillionParams: 0.1,
    warmupBase: 2,
    warmupPerBillionParams: 0.05,
    get notes() { return t('Ollama: wraps llama.cpp; adds ~1s overhead for model management', 'Ollama：封装 llama.cpp；模型管理额外增加约 1 秒开销'); },
  },
};

/**
 * Estimate model load and warmup time.
 *
 * loadTimeSec    = modelBytes / (storageBandwidthGBs × 1e9)
 * compileTimeSec = framework base + per-billion-param scaling
 * warmupTimeSec  = CUDA graph capture / framework init
 * totalColdStart = load + compile + warmup
 */
export function estimateWarmup(
  modelBytes: number,
  storageBandwidthGBs: number,  // NVMe Gen4 = 7, Gen5 = 14
  framework: Framework,
  numParams: number
): WarmupEstimate {
  const loadTimeSec = storageBandwidthGBs > 0
    ? modelBytes / (storageBandwidthGBs * 1e9)
    : 0;

  const fw = FRAMEWORK_TIMES[framework];
  const billionParams = numParams / 1e9;
  const compileTimeSec = fw.compileBase + fw.compilePerBillionParams * billionParams;
  const warmupTimeSec = fw.warmupBase + fw.warmupPerBillionParams * billionParams;
  const totalColdStartSec = loadTimeSec + compileTimeSec + warmupTimeSec;

  return {
    loadTimeSec,
    compileTimeSec,
    warmupTimeSec,
    totalColdStartSec,
    notes: fw.notes,
  };
}
