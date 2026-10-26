import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';

interface UserExperienceSummaryProps {
  modelName: string;
  gpuName: string;
  concurrentUsers: number;
  ttftMs: number;
  tpotMs: number;
  avgOutputTokens: number;
  aggregateThroughput: number;
  maxConcurrentUsers: number;
  totalVRAMGB: number;
  usedVRAMGB: number;
  costPerUserPerHour: number;
  costPerMTokens: number;
  costPerRequest: number;
  bottleneck: 'memory' | 'throughput' | 'prefill';
  sloTTFTMs: number;
  sloTPOTMs: number;
  // "What if?" 2× GPU scenario
  doubleGPUMaxUsers?: number;
  doubleGPUCostPerHour?: number;
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function SLOStatus({ actual, slo }: { actual: number; slo: number }) {
  const p95 = actual * 1.5;
  const met = p95 <= slo;
  return (
    <span className={cn('text-xs font-semibold ml-1', met ? 'text-green-500' : 'text-red-500')}>
      {met ? '🟢' : '🔴'}
    </span>
  );
}

const BOTTLENECK_TIPS: Record<string, string[]> = {
  memory: [
    t('Use FP8 KV cache to increase capacity ~2×', '用 FP8 KV Cache 把容量提升约 2 倍'),
    t('Enable PagedAttention to reduce fragmentation', '开启 PagedAttention 以减少显存碎片'),
    t('Reduce context length to free KV cache memory', '缩短上下文长度以释放 KV Cache 显存'),
  ],
  throughput: [
    t('Use a GPU with higher memory bandwidth', '换用显存带宽更高的 GPU'),
    t('Reduce model size with quantization (Q4/Q8)', '用量化（Q4/Q8）缩小模型体积'),
    t('Add more GPU replicas to scale throughput', '增加 GPU 副本来提升吞吐'),
  ],
  prefill: [
    t('Use chunked prefill to reduce head-of-line blocking', '用分块 prefill 减少队头阻塞'),
    t('Upgrade to a higher-FLOPS GPU', '升级到 FLOPS 更高的 GPU'),
    t('Use speculative decoding to reduce prefill load', '用投机解码降低 prefill 负载'),
  ],
};

export function UserExperienceSummary({
  modelName,
  gpuName,
  concurrentUsers,
  ttftMs,
  tpotMs,
  avgOutputTokens,
  aggregateThroughput,
  maxConcurrentUsers,
  totalVRAMGB,
  usedVRAMGB,
  costPerUserPerHour,
  costPerMTokens,
  costPerRequest,
  bottleneck,
  sloTTFTMs,
  sloTPOTMs,
  doubleGPUMaxUsers,
  doubleGPUCostPerHour,
}: UserExperienceSummaryProps) {
  const { t } = useLanguage();
  const e2eMs = ttftMs + avgOutputTokens * tpotMs;
  const vramPct = totalVRAMGB > 0 ? Math.round((usedVRAMGB / totalVRAMGB) * 100) : 0;
  const capacityPct = maxConcurrentUsers > 0 ? Math.round((concurrentUsers / maxConcurrentUsers) * 100) : 0;
  const tokPerSec = tpotMs > 0 ? Math.round(1000 / tpotMs) : 0;
  const tips = BOTTLENECK_TIPS[bottleneck] ?? [];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-4 flex flex-col gap-3">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{t('User Experience Summary', '用户体验摘要')}</p>
        <p className="text-xs text-fg-muted mt-0.5">
          For {concurrentUsers.toLocaleString()} concurrent users on {gpuName}
        </p>
        <p className="text-xs text-fg-muted">Model: {modelName}</p>
      </div>

      {/* Latency metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">⏱ Time to first token</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">
            {formatMs(ttftMs)}
            <SLOStatus actual={ttftMs} slo={sloTTFTMs} />
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">⏱ Per-token latency</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">
            {formatMs(tpotMs)}
            <SLOStatus actual={tpotMs} slo={sloTPOTMs} />
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">⏱ Token generation speed</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">{tokPerSec} tok/s</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">⏱ Full response time</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">
            {formatMs(e2eMs)} <span className="text-[10px] text-fg-muted">({avgOutputTokens} tokens)</span>
          </span>
        </div>
      </div>

      {/* Throughput & capacity */}
      <div className="grid grid-cols-2 gap-2 border-t border-border-subtle pt-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">📊 Effective throughput</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">
            {Math.round(aggregateThroughput).toLocaleString()} tok/s
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">📊 Max capacity</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">
            {maxConcurrentUsers.toLocaleString()} users <span className="text-[10px] text-fg-muted">({capacityPct}% used)</span>
          </span>
        </div>
        <div className="flex flex-col gap-0.5 col-span-2">
          <span className="text-[10px] text-fg-muted">📊 VRAM utilization</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">
            {usedVRAMGB.toFixed(1)} / {totalVRAMGB} GB ({vramPct}%)
          </span>
        </div>
      </div>

      {/* Cost metrics */}
      <div className="grid grid-cols-3 gap-2 border-t border-border-subtle pt-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">💰 Per request</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">{formatCost(costPerRequest)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">💰 Per 1M tokens</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">{formatCost(costPerMTokens)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-fg-muted">💰 Per user/hour</span>
          <span className="text-sm font-mono font-semibold text-fg-primary">{formatCost(costPerUserPerHour)}</span>
        </div>
      </div>

      {/* Bottleneck */}
      <div className="border-t border-border-subtle pt-2">
        <p className="text-xs font-medium text-fg-default">
          ⚡ Bottleneck: <span className="text-amber-500 capitalize">{bottleneck === 'throughput' ? t('Memory bandwidth (decode)', '显存带宽（decode）') : bottleneck === 'memory' ? t('KV cache memory', 'KV Cache 显存') : t('Prefill compute', 'Prefill 算力')}</span>
        </p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {tips.slice(0, 2).map(tip => (
            <li key={tip} className="text-[10px] text-fg-muted">💡 {tip}</li>
          ))}
        </ul>
      </div>

      {/* What if? */}
      {doubleGPUMaxUsers !== undefined && doubleGPUCostPerHour !== undefined && (
        <div className="border-t border-border-subtle pt-2 bg-bg-muted/50 rounded px-2 py-1.5">
          <p className="text-[10px] font-medium text-fg-default">
            What if? With 2× GPUs: {doubleGPUMaxUsers.toLocaleString()} users, same latency, {formatCost(doubleGPUCostPerHour)}/h
          </p>
        </div>
      )}
    </div>
  );
}
