import { t } from '@/lib/i18n';
export type RedundancyMode = 'none' | 'n_plus_1' | 'n_plus_2' | 'multi_az';

export interface FailoverConfig {
  mode: RedundancyMode;
  costMultiplier: number;
  checkpointFrequencyHours: number;
  notes: string;
}

export const REDUNDANCY_CONFIGS: Record<RedundancyMode, FailoverConfig> = {
  none: {
    mode: 'none',
    costMultiplier: 1.0,
    checkpointFrequencyHours: 1,
    get notes() { return t('No redundancy', '无冗余'); },
  },
  n_plus_1: {
    mode: 'n_plus_1',
    costMultiplier: 1.12,
    checkpointFrequencyHours: 0.5,
    get notes() { return t('N+1: +12% cost', 'N+1：成本 +12%'); },
  },
  n_plus_2: {
    mode: 'n_plus_2',
    costMultiplier: 1.25,
    checkpointFrequencyHours: 0.25,
    get notes() { return t('N+2: +25% cost', 'N+2：成本 +25%'); },
  },
  multi_az: {
    mode: 'multi_az',
    costMultiplier: 2.0,
    checkpointFrequencyHours: 0.1,
    get notes() { return t('Multi-AZ: 2× cost', '多可用区：成本 2 倍'); },
  },
};

/**
 * Apply redundancy cost multiplier to a base hourly cost.
 */
export function computeRedundancyCost(
  baseCostPerHour: number,
  mode: RedundancyMode
): number {
  return baseCostPerHour * REDUNDANCY_CONFIGS[mode].costMultiplier;
}
