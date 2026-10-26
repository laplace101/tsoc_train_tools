import { t } from '@/lib/i18n';
/**
 * Disk throughput and tier recommendation formulas.
 */

export interface StorageTier {
  name: string;
  typicalBandwidthMBs: number;
  description: string;
}

export const STORAGE_TIERS: StorageTier[] = [
  { name: 'HDD',         typicalBandwidthMBs: 200,    get description() { return t('Spinning disk, ~200 MB/s', '机械硬盘，约 200 MB/s'); } },
  { name: 'SATA SSD',    typicalBandwidthMBs: 550,    get description() { return t('SATA SSD, ~550 MB/s', 'SATA SSD，约 550 MB/s'); } },
  { name: 'NVMe Gen4',   typicalBandwidthMBs: 7000,   get description() { return t('NVMe Gen4, ~7 GB/s', 'NVMe Gen4，约 7 GB/s'); } },
  { name: 'NVMe Gen5',   typicalBandwidthMBs: 14000,  get description() { return t('NVMe Gen5, ~14 GB/s', 'NVMe Gen5，约 14 GB/s'); } },
  { name: t('Parallel FS', '并行文件系统'), typicalBandwidthMBs: 100000, get description() { return t('Lustre/GPFS, 100+ GB/s', 'Lustre/GPFS，100+ GB/s'); } },
];

/**
 * Checkpoint write bandwidth requirement in MB/s.
 * checkpoint_bytes / time_budget_sec / 1e6
 * checkpoint_bytes = params × 16
 */
export function computeCheckpointWriteBandwidth(numParams: number, timeBudgetSec: number): number {
  if (timeBudgetSec <= 0) return 0;
  const checkpointBytes = numParams * 16;
  return checkpointBytes / timeBudgetSec / 1e6;
}

/**
 * Check if checkpoint write is feasible within the given disk bandwidth.
 */
export function checkCheckpointFeasibility(
  numParams: number,
  timeBudgetSec: number,
  diskBandwidthMBs: number,
): { feasible: boolean; requiredMBs: number; message: string } {
  const requiredMBs = computeCheckpointWriteBandwidth(numParams, timeBudgetSec);
  const feasible = requiredMBs <= diskBandwidthMBs;
  const message = feasible
    ? `检查点写入可行：需要 ${requiredMBs.toFixed(0)} MB/s，可用 ${diskBandwidthMBs} MB/s`
    : `检查点写入超出磁盘吞吐：需要 ${requiredMBs.toFixed(0)} MB/s，但只有 ${diskBandwidthMBs} MB/s 可用`;
  return { feasible, requiredMBs, message };
}
