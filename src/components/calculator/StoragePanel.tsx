import { HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeTotalStorage, recommendStorageTier } from '@/lib/formulas/storage';
import { computeCheckpointWriteBandwidth, checkCheckpointFeasibility } from '@/lib/formulas/disk-iops';
import { useLanguage } from '@/lib/language';

interface StoragePanelProps {
  numTokens: number;           // training tokens
  numCheckpoints: number;      // checkpoints to keep
  numParams: number;           // model params
  checkpointTimeBudgetSec?: number;  // default 60s
  diskBandwidthMBs?: number;   // current disk bandwidth for feasibility check
  className?: string;
}

function KVRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border-subtle last:border-0">
      <span className="text-xs text-fg-muted flex-shrink-0 w-36">{label}</span>
      <span className={cn('text-xs font-mono text-right break-all', warn ? 'text-red-400 font-semibold' : 'text-fg-default')}>
        {value}
      </span>
    </div>
  );
}

function formatGB(gb: number): string {
  if (gb >= 1000) return `${(gb / 1000).toFixed(1)} TB`;
  return `${gb.toFixed(1)} GB`;
}

export function StoragePanel({
  numTokens,
  numCheckpoints,
  numParams,
  checkpointTimeBudgetSec = 60,
  diskBandwidthMBs,
  className,
}: StoragePanelProps) {
  const { t } = useLanguage();
  const storage = computeTotalStorage(numTokens, numCheckpoints, numParams);
  const ckptWriteMBs = computeCheckpointWriteBandwidth(numParams, checkpointTimeBudgetSec);
  const storageTier = recommendStorageTier(ckptWriteMBs);

  const feasibility = diskBandwidthMBs != null
    ? checkCheckpointFeasibility(numParams, checkpointTimeBudgetSec, diskBandwidthMBs)
    : null;

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <HardDrive size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('Storage', '存储')}
        </h3>
      </div>

      <div className="flex flex-col">
        <KVRow label={t('Training data', '训练数据')} value={formatGB(storage.dataGB)} />
        <KVRow label={t('Checkpoints', '检查点')} value={`${formatGB(storage.checkpointsGB)} (×${numCheckpoints})`} />
        <KVRow label={t('Logs', '日志')} value={formatGB(storage.logsGB)} />
        <KVRow label={t('Headroom (20%)', '预留余量（20%）')} value={formatGB(storage.headroomGB)} />
        <KVRow label={t('Total', '合计')} value={formatGB(storage.totalGB)} />
        <KVRow label={t('Ckpt write BW', '检查点写带宽')} value={`${ckptWriteMBs.toFixed(0)} MB/s`} />
        <KVRow label={t('Ckpt budget', '检查点预算')} value={`${checkpointTimeBudgetSec}s`} />
        <KVRow label={t('Recommended tier', '推荐档位')} value={storageTier} />
        {feasibility && (
          <KVRow
            label={t('Feasibility', '可行性')}
            value={feasibility.feasible ? '✓ Feasible' : '✗ Exceeds disk BW'}
            warn={!feasibility.feasible}
          />
        )}
      </div>
    </div>
  );
}
