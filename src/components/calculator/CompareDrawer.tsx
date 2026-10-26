import * as React from 'react';
import { X, ArrowLeftRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalculatorStore } from '@/store/calculator-store';
import { useToast } from '@/components/feedback/Toast';
import {
  getPrecisionConfig, getKVPrecisionConfig,
  computeTotalVRAM, computeThroughput, recommendGPUs, recommendCloudInstances,
} from '@/lib/formulas';
import type { CalculatorState, ModelSpec, GPUSpec, CloudInstance } from '@/lib/formulas/types';
import { useLanguage } from '@/lib/language';
import { t } from '@/lib/i18n';

interface ComputedConfig {
  state: CalculatorState;
  modelName: string;
  totalVRAM: number;
  tokensPerSecond: number | null;
  fitLabel: string;
  bestCloudPerHour: number | null;
  costPerMTok: number | null;
}

const DEFAULT_EFFICIENCY = 0.8;

function computeConfig(state: CalculatorState, modelDb: ModelSpec[], gpuDb: GPUSpec[], cloudDb: CloudInstance[]): ComputedConfig {
  const model = modelDb.find(m => m.id === state.model);
  if (!model) {
    return { state, modelName: state.model, totalVRAM: 0, tokensPerSecond: null, fitLabel: '—', bestCloudPerHour: null, costPerMTok: null };
  }

  const precisionConfig = getPrecisionConfig(state.precision);
  const kvPrecisionConfig = getKVPrecisionConfig(state.kvPrecision);
  const breakdown = computeTotalVRAM(model, precisionConfig, kvPrecisionConfig, state.ctx, state.batch, state.mode);

  const activeParams = model.paramsActive ?? model.paramsTotal;
  const activeWeightsGB = (activeParams * precisionConfig.bytesPerParam) / 1e9;

  const gpuRecs = recommendGPUs(breakdown.totalGB, gpuDb, { activeWeightsGB, efficiencyFactor: DEFAULT_EFFICIENCY });
  const topGPU = gpuRecs.allFits.find(f => f.fitStatus !== 'red');
  const fitLabel = topGPU ? `${topGPU.gpu.name} (${topGPU.fitStatus})` : t('No fit', '装不下');

  const tokensPerSecond = topGPU
    ? computeThroughput({ memoryBandwidthGBs: topGPU.gpu.memoryBandwidthGBs, activeWeightsGB, efficiencyFactor: DEFAULT_EFFICIENCY }).tokensPerSecond
    : null;

  const cloudRecs = recommendCloudInstances(breakdown.totalGB, cloudDb, gpuDb);
  const bestCloud = cloudRecs[0];
  const bestCloudPerHour = bestCloud?.onDemandPerHour ?? null;
  const costPerMTok = bestCloud?.costPerMillionTokens ?? null;

  return { state, modelName: model.displayName, totalVRAM: breakdown.totalGB, tokensPerSecond, fitLabel, bestCloudPerHour, costPerMTok };
}

function DeltaBadge({ value, unit = '', lowerIsBetter = false }: { value: number; unit?: string; lowerIsBetter?: boolean }) {
  if (value === 0) return <span className="text-fg-muted text-[10px] font-mono">—</span>;
  const isPositive = value > 0;
  const isGood = lowerIsBetter ? !isPositive : isPositive;
  return (
    <span className={cn('text-[10px] font-mono font-medium', isGood ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
      {isPositive ? '+' : ''}{value.toFixed(1)}{unit}
    </span>
  );
}

interface CompareDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CompareDrawer({ open, onClose }: CompareDrawerProps) {
  const { t } = useLanguage();
  const { compareConfigs, removeCompareConfig, modelDb, gpuDb, cloudDb, addCompareConfig } = useCalculatorStore();
  const { showToast } = useToast();

  const computed = React.useMemo(
    () => compareConfigs.map(cfg => computeConfig(cfg, modelDb, gpuDb, cloudDb)),
    [compareConfigs, modelDb, gpuDb, cloudDb]
  );

  const anchor = computed[0];

  const handleAdd = () => {
    if (compareConfigs.length >= 3) {
      showToast(t('Maximum 3 configurations', '最多只能保留 3 个配置'), 'error');
      return;
    }
    addCompareConfig();
    showToast(t('Added to compare', '已加入对比'), 'success');
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[39]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 right-0 h-full w-[480px] max-w-full bg-bg-base border-l border-border-subtle z-[40]',
          'flex flex-col shadow-lg transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        aria-label={t('Compare configurations', '对比配置')}
        role="complementary"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-2">
            <ArrowLeftRight size={16} className="text-fg-muted" />
            <h2 className="text-sm font-semibold text-fg-primary">{t('Compare', '对比')}</h2>
            <span className="text-xs text-fg-muted font-mono">{compareConfigs.length}/3</span>
          </div>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={t('Close compare drawer', '关闭对比抽屉')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {computed.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <ArrowLeftRight size={32} className="text-fg-muted" />
              <p className="text-sm text-fg-muted">{t('No configurations to compare.', '没有可对比的配置。')}</p>
              <p className="text-xs text-fg-muted">{t('Press', '按下')} <kbd className="px-1.5 py-0.5 rounded border border-border-default bg-bg-muted font-mono text-[10px]">c</kbd> {t('to add the current config.', '即可把当前配置加入对比。')}</p>
            </div>
          ) : (
            computed.map((cfg, i) => {
              const isAnchor = i === 0;
              return (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border p-4 flex flex-col gap-3',
                    isAnchor ? 'border-accent/40 bg-accent/5' : 'border-border-subtle bg-bg-muted'
                  )}
                >
                  {/* Config header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        {isAnchor && (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent text-white">
                            {t('Anchor', '基准')}
                          </span>
                        )}
                        <span className="text-xs font-medium text-fg-muted uppercase tracking-wide">
                          {cfg.state.mode}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-fg-primary truncate">{cfg.modelName}</h3>
                      <p className="text-[11px] font-mono text-fg-muted">
                        {cfg.state.precision.toUpperCase()} · {(cfg.state.ctx / 1024).toFixed(0)}k ctx · batch {cfg.state.batch}
                      </p>
                    </div>
                    <button
                      onClick={() => removeCompareConfig(i)}
                      className="text-fg-muted hover:text-red-500 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      aria-label={t(`Remove config ${i + 1}`, `移除配置 ${i + 1}`)}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    {/* Total VRAM */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-fg-muted uppercase tracking-wide">{t('Total VRAM', '显存总计')}</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-mono font-semibold text-fg-primary">{cfg.totalVRAM.toFixed(1)} GB</span>
                        {!isAnchor && anchor && (
                          <DeltaBadge value={cfg.totalVRAM - anchor.totalVRAM} unit=" GB" lowerIsBetter />
                        )}
                      </div>
                    </div>

                    {/* Throughput */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-fg-muted uppercase tracking-wide">{t('Tok/s', 'tok/s')}</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-mono font-semibold text-fg-primary">
                          {cfg.tokensPerSecond != null ? cfg.tokensPerSecond.toLocaleString() : '—'}
                        </span>
                        {!isAnchor && anchor?.tokensPerSecond != null && cfg.tokensPerSecond != null && (
                          <DeltaBadge value={cfg.tokensPerSecond - anchor.tokensPerSecond} />
                        )}
                      </div>
                    </div>

                    {/* Best cloud $/h */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-fg-muted uppercase tracking-wide">{t('Best $/h', '最优 $/小时')}</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-mono font-semibold text-fg-primary">
                          {cfg.bestCloudPerHour != null ? `$${cfg.bestCloudPerHour.toFixed(2)}` : '—'}
                        </span>
                        {!isAnchor && anchor?.bestCloudPerHour != null && cfg.bestCloudPerHour != null && (
                          <DeltaBadge value={cfg.bestCloudPerHour - anchor.bestCloudPerHour} unit="$" lowerIsBetter />
                        )}
                      </div>
                    </div>

                    {/* $/M tokens */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-fg-muted uppercase tracking-wide">$/M tok</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-mono font-semibold text-fg-primary">
                          {cfg.costPerMTok != null ? `$${cfg.costPerMTok.toFixed(2)}` : '—'}
                        </span>
                        {!isAnchor && anchor?.costPerMTok != null && cfg.costPerMTok != null && (
                          <DeltaBadge value={cfg.costPerMTok - anchor.costPerMTok} unit="$" lowerIsBetter />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* GPU fit */}
                  <div className="text-[11px] font-mono text-fg-muted border-t border-border-subtle pt-2">
                    {cfg.fitLabel}
                  </div>
                </div>
              );
            })
          )}

          {/* Add button */}
          {compareConfigs.length < 3 && (
            <button
              onClick={handleAdd}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg border border-dashed border-border-default text-xs text-fg-muted hover:text-fg-default hover:border-border-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={14} />
              {t('Add current config', '添加当前配置')}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
