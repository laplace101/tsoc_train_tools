import * as React from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeReplicas, computeBlendedCost } from '@/lib/formulas/replicas';
import { Slider } from '@/components/primitives/slider';
import { useLanguage } from '@/lib/language';

interface ScaleEstimatorProps {
  tokensPerSecond: number;    // per-replica throughput
  gpusPerReplica: number;
  costPerGPUHour: number;
  className?: string;
}

function KVRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border-subtle last:border-0">
      <span className="text-xs text-fg-muted flex-shrink-0 w-40">{label}</span>
      <span className={cn('text-xs font-mono text-right break-all', highlight ? 'text-accent font-semibold' : 'text-fg-default')}>
        {value}
      </span>
    </div>
  );
}

function formatCost(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}k`;
  return `$${usd.toFixed(2)}`;
}

export function ScaleEstimator({
  tokensPerSecond,
  gpusPerReplica,
  costPerGPUHour,
  className,
}: ScaleEstimatorProps) {
  const { t } = useLanguage();
  const [targetQPS, setTargetQPS] = React.useState(100);
  const [avgOutputTokens, setAvgOutputTokens] = React.useState(200);
  const [safetyFactor, setSafetyFactor] = React.useState(1.4);
  const [spotPercent, setSpotPercent] = React.useState(0);

  const config = React.useMemo(
    () => computeReplicas(targetQPS, tokensPerSecond, avgOutputTokens, safetyFactor, gpusPerReplica, costPerGPUHour),
    [targetQPS, tokensPerSecond, avgOutputTokens, safetyFactor, gpusPerReplica, costPerGPUHour],
  );

  const blended = React.useMemo(
    () => computeBlendedCost(config.costPerHour, spotPercent),
    [config.costPerHour, spotPercent],
  );

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('Scale Estimator', '规模估算')}
        </h3>
      </div>

      {/* Inputs */}
      <div className="flex flex-col gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-fg-muted">{t('Target QPS:', '目标 QPS：')} <span className="font-mono text-fg-default">{targetQPS}</span></span>
          <Slider min={1} max={10000} step={1} value={targetQPS} onChange={e => setTargetQPS(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-fg-muted">{t('Avg output tokens:', '平均输出 Token 数：')} <span className="font-mono text-fg-default">{avgOutputTokens}</span></span>
          <Slider min={10} max={2000} step={10} value={avgOutputTokens} onChange={e => setAvgOutputTokens(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-fg-muted">{t('Safety factor:', '安全系数：')} <span className="font-mono text-fg-default">{safetyFactor.toFixed(1)}×</span></span>
          <Slider min={1.2} max={2.0} step={0.1} value={safetyFactor} onChange={e => setSafetyFactor(Number(e.target.value))} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-fg-muted">{t('Spot %:', '竞价实例占比：')} <span className="font-mono text-fg-default">{spotPercent}%</span></span>
          <Slider min={0} max={80} step={5} value={spotPercent} onChange={e => setSpotPercent(Number(e.target.value))} />
        </label>
      </div>

      {/* Results */}
      <div className="flex flex-col">
        <KVRow label={t('Replicas', '副本数')} value={String(config.replicas)} highlight />
        <KVRow label={t('Total GPUs', 'GPU 总数')} value={String(config.totalGPUs)} highlight />
        <KVRow label={t('Cost / hour', '成本 / 小时')} value={spotPercent > 0 ? `${formatCost(blended.blendedCostPerHour)} (${blended.savingsPercent.toFixed(0)}% saved)` : formatCost(config.costPerHour)} />
        <KVRow label={t('Cost / day', '成本 / 天')} value={formatCost(spotPercent > 0 ? blended.blendedCostPerHour * 24 : config.costPerDay)} />
        <KVRow label={t('Cost / month', '成本 / 月')} value={formatCost(spotPercent > 0 ? blended.blendedCostPerHour * 24 * 30 : config.costPerMonth)} />
      </div>

      {/* Auto-scaling thresholds */}
      <div className="mt-4 border-t border-border-subtle pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-2">{t('Auto-scale triggers', '自动扩缩触发条件')}</p>
        <div className="flex flex-col gap-1 text-[11px] text-fg-muted">
          <span>GPU util ≥ {config.autoScaleThresholds.scaleUpGPUUtil}%</span>
          <span>KV cache ≥ {config.autoScaleThresholds.scaleUpCacheUtil}%</span>
          <span>Queue depth ≥ {config.autoScaleThresholds.scaleUpQueueDepth}</span>
          <span>Cooldown: {config.autoScaleThresholds.cooldownSec}s</span>
        </div>
      </div>
    </div>
  );
}
