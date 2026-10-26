import * as React from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/language';
import { t } from '@/lib/i18n';
import {
  REDUNDANCY_CONFIGS,
  computeRedundancyCost,
  type RedundancyMode,
} from '@/lib/formulas/failover';

interface FailoverPanelProps {
  baseCostPerHour: number;
  className?: string;
}

function KVRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border-subtle last:border-0">
      <span className="text-xs text-fg-muted flex-shrink-0 w-44">{label}</span>
      <span className={cn('text-xs font-mono text-right break-all', highlight ? 'text-accent font-semibold' : 'text-fg-default')}>
        {value}
      </span>
    </div>
  );
}

const MODE_LABELS: Record<RedundancyMode, string> = {
  get none() { return t('None', '无'); },
  n_plus_1:  'N+1',
  n_plus_2:  'N+2',
  multi_az:  'Multi-AZ',
};

export function FailoverPanel({ baseCostPerHour, className }: FailoverPanelProps) {
  const { t } = useLanguage();
  const [mode, setMode] = React.useState<RedundancyMode>('none');

  const config = REDUNDANCY_CONFIGS[mode];
  const totalCost = computeRedundancyCost(baseCostPerHour, mode);

  const checkpointFreqLabel = config.checkpointFrequencyHours < 1
    ? t(`Every ${(config.checkpointFrequencyHours * 60).toFixed(0)} min`, `每 ${(config.checkpointFrequencyHours * 60).toFixed(0)} 分钟`)
    : t(`Every ${config.checkpointFrequencyHours} hr`, `每 ${config.checkpointFrequencyHours} 小时`);

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('Failover &amp; Redundancy', '故障转移与冗余')}
        </h3>
      </div>

      {/* Redundancy Mode Selector */}
      <div className="mb-4">
        <label className="text-xs text-fg-muted block mb-1.5">{t('Redundancy Mode', '冗余模式')}</label>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(MODE_LABELS) as RedundancyMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'px-2 py-1.5 rounded-md text-xs font-medium border transition-colors text-left',
                mode === m
                  ? 'bg-accent text-white border-accent'
                  : 'bg-bg-muted border-border-subtle text-fg-default hover:bg-bg-emphasis'
              )}
            >
              <span className="block font-semibold">{MODE_LABELS[m]}</span>
              <span className={cn('text-[10px]', mode === m ? 'text-white/80' : 'text-fg-muted')}>
                {REDUNDANCY_CONFIGS[m].notes}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Outputs */}
      <div className="border-t border-border-subtle pt-3 flex flex-col">
        <KVRow label={t('Cost Multiplier', '成本倍数')} value={`${config.costMultiplier}×`} highlight />
        <KVRow label={t('Base Cost/hr', '基础成本/小时')} value={`$${baseCostPerHour.toFixed(4)}`} />
        <KVRow label={t('Total Cost/hr', '总成本/小时')} value={`$${totalCost.toFixed(4)}`} highlight />
        <KVRow label={t('Checkpoint Freq', '检查点频率')} value={checkpointFreqLabel} />
        <div className="pt-2">
          <p className="text-[10px] text-fg-muted leading-relaxed">
            {t('Ref: Llama-3 training had ~8 interruptions/day on 16K H100s. Frequent checkpointing reduces lost work.', '参考：在 16K H100 上，Llama-3 训练每天约有 8 次中断。频繁做检查点可减少已完成工作的损失。')}
          </p>
        </div>
      </div>
    </div>
  );
}
