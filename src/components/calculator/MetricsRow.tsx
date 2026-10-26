import { cn } from '@/lib/utils';
import type { CostMetricsResult } from '@/lib/formulas/types';
import { useLanguage } from '@/lib/language';

interface MetricsRowProps {
  tokensPerSecond?: number | null;
  costMetrics?: CostMetricsResult | null;
  gpuName?: string;
  contextLength?: number;
  className?: string;
}

interface MetricCardProps {
  label: string;
  value: string;
  subtitle: string;
}

function MetricCard({ label, value, subtitle }: MetricCardProps) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 bg-bg-muted rounded-lg border border-border-subtle">
      <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
        {label}
      </span>
      <span className="text-[22px] font-mono font-semibold text-fg-primary leading-none tabular-nums">
        {value}
      </span>
      <span className="text-[11px] font-mono text-fg-muted truncate">
        {subtitle}
      </span>
    </div>
  );
}

export function MetricsRow({ tokensPerSecond, costMetrics, gpuName, contextLength, className }: MetricsRowProps) {
  const { t } = useLanguage();
  const tokPerSecValue = tokensPerSecond != null
    ? tokensPerSecond.toLocaleString()
    : 'N/A';

  const costValue = costMetrics?.costPerMillionTokens != null && costMetrics.costPerMillionTokens > 0
    ? `$${costMetrics.costPerMillionTokens.toFixed(2)}`
    : 'N/A';

  const ttftValue = costMetrics?.timeToFirstTokenMs != null && costMetrics.timeToFirstTokenMs > 0
    ? costMetrics.timeToFirstTokenMs < 1000
      ? `${Math.round(costMetrics.timeToFirstTokenMs)}ms`
      : `${(costMetrics.timeToFirstTokenMs / 1000).toFixed(1)}s`
    : 'N/A';

  const ctxLabel = contextLength
    ? `${contextLength >= 1024 ? `${contextLength / 1024}k` : contextLength} ctx`
    : '';

  return (
    <div className={cn('grid grid-cols-3 gap-3', className)}>
      <MetricCard
        label={t('Throughput', '吞吐')}
        value={tokPerSecValue}
        subtitle={gpuName ? `tok/s · ${gpuName}` : 'tok/s'}
      />
      <MetricCard
        label={t('Cost / 1M tokens', '每 100 万 token 成本')}
        value={costValue}
        subtitle={gpuName ? t(`batched · ${gpuName}`, `批处理 · ${gpuName}`) : t('on-demand', '按需')}
      />
      <MetricCard
        label={t('Time to First Token', '首字延迟')}
        value={ttftValue}
        subtitle={ctxLabel ? t(`prefill ${ctxLabel}`, `预填充 ${ctxLabel}`) : t('prefill', '预填充')}
      />
    </div>
  );
}
