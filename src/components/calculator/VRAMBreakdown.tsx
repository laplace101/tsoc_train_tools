import * as React from 'react';
import { cn } from '@/lib/utils';
import type { VRAMBreakdown as VRAMBreakdownType, GPUSpec } from '@/lib/formulas/types';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';

interface VRAMBreakdownProps {
  breakdown: VRAMBreakdownType;
  gpuRef?: GPUSpec | null;
  kvPrecisionLabel?: string;
  framework?: string;
  numGPUs?: number;
  className?: string;
}

const SEGMENTS = [
  { key: 'weightsGB',    get label() { return t('Weights', '权重'); },    color: 'bg-[#7c3aed] dark:bg-[#8b5cf6]',  dot: 'bg-[#7c3aed] dark:bg-[#8b5cf6]' },
  { key: 'kvCacheGB',    label: 'KV Cache',   color: 'bg-[#0891b2] dark:bg-[#06b6d4]',  dot: 'bg-[#0891b2] dark:bg-[#06b6d4]' },
  { key: 'activationsGB',get label() { return t('Activations', '激活值'); },color: 'bg-[#ca8a04] dark:bg-[#eab308]',  dot: 'bg-[#ca8a04] dark:bg-[#eab308]' },
  { key: 'gradientsGB',  get label() { return t('Gradients', '梯度'); },  color: 'bg-[#db2777] dark:bg-[#ec4899]',  dot: 'bg-[#db2777] dark:bg-[#ec4899]' },
  { key: 'optimizerGB',  get label() { return t('Optimizer', '优化器'); },  color: 'bg-[#ea580c] dark:bg-[#f97316]',  dot: 'bg-[#ea580c] dark:bg-[#f97316]' },
  { key: 'overheadGB',   get label() { return t('Overhead', '开销'); },   color: 'bg-[#64748b] dark:bg-[#94a3b8]',  dot: 'bg-[#64748b] dark:bg-[#94a3b8]' },
] as const;

function formatGB(value: number): string {
  if (value < 0.01) return '< 0.01';
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function VRAMBreakdown({ breakdown, gpuRef, kvPrecisionLabel = 'FP16', framework = 'vLLM', numGPUs = 1, className }: VRAMBreakdownProps) {
  const { t } = useLanguage();
  const [hoveredSegment, setHoveredSegment] = React.useState<string | null>(null);
  const prefersReducedMotion = React.useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  const total = breakdown.totalGB;
  const n = Math.max(1, numGPUs);
  const perGPU = total / n;
  const gpuMemory = gpuRef?.memoryGB ?? null;
  // When multi-GPU, check if per-GPU fits; single GPU checks total
  const utilizationPct = gpuMemory ? Math.round((perGPU / gpuMemory) * 100) : null;

  // Active segments (non-zero)
  const activeSegments = SEGMENTS.filter(s => breakdown[s.key] > 0);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Hero total */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="font-mono font-semibold text-[48px] leading-none tracking-tight text-fg-primary"
          aria-live="polite"
          aria-label={t(`${total.toFixed(1)} gigabytes total VRAM`, `显存总计 ${total.toFixed(1)} GB`)}
        >
          {total.toFixed(1)}
        </span>
        <span className="text-xl text-fg-muted font-mono ml-1">GB</span>
        {n > 1 && (
          <span className="text-sm font-mono text-fg-muted ml-2">
            ({formatGB(perGPU)} GB × {n} GPUs)
          </span>
        )}
      </div>

      {/* Context line */}
      {gpuMemory && utilizationPct !== null && (
        <p className="text-xs text-fg-muted font-mono -mt-2">
          {n > 1
            ? t(`${formatGB(perGPU)} GB per GPU · Fits ${utilizationPct}% on ${gpuRef?.name ?? 'GPU'}`, `${formatGB(perGPU)} GB/GPU · 在 ${gpuRef?.name ?? 'GPU'} 上占用 ${utilizationPct}%`)
            : t(`Fits ${utilizationPct}% on 1× ${gpuRef?.name ?? 'GPU'}`, `在 1× ${gpuRef?.name ?? 'GPU'} 上占用 ${utilizationPct}%`)}
          {' · '}KV {kvPrecisionLabel}
          {' · '}{framework}
        </p>
      )}

      {/* Stacked bar */}
      <div
        className="relative h-7 rounded-md overflow-hidden bg-bg-emphasis flex"
        role="img"
        aria-label={`VRAM breakdown: ${activeSegments.map(s => `${s.label} ${formatGB(breakdown[s.key])} GB`).join(', ')}`}
      >
        {activeSegments.map((segment, i) => {
          const pct = (breakdown[segment.key] / total) * 100;
          const isFirst = i === 0;
          const isLast = i === activeSegments.length - 1;
          const isHovered = hoveredSegment === segment.key;

          return (
            <div
              key={segment.key}
              className={cn(
                segment.color,
                'relative h-full cursor-default transition-opacity',
                isHovered ? 'opacity-90' : 'opacity-100',
                isFirst && 'rounded-l-md',
                isLast && 'rounded-r-md'
              )}
              style={{
                width: `${pct}%`,
                transition: prefersReducedMotion ? 'none' : 'width 400ms cubic-bezier(0.16, 1, 0.3, 1)',
                marginRight: i < activeSegments.length - 1 ? '2px' : 0,
              }}
              onMouseEnter={() => setHoveredSegment(segment.key)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 pointer-events-none">
                  <div className="bg-bg-base border border-border-default rounded-md px-2.5 py-1.5 shadow-md text-xs whitespace-nowrap">
                    <div className="font-medium text-fg-primary">{segment.label}</div>
                    <div className="font-mono text-fg-muted">{formatGB(breakdown[segment.key])} GB</div>
                    <div className="font-mono text-fg-muted">{pct.toFixed(1)}%</div>
                    {segment.key === 'weightsGB' && (
                      <div className="text-fg-muted mt-0.5" style={{ fontSize: '9px' }}>{t('includes embedding layer', '包含嵌入层')}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* GPU overflow indicator — based on per-GPU VRAM */}
        {gpuMemory && perGPU > gpuMemory && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
            style={{ left: `${(gpuMemory / perGPU) * 100}%` }}
            title={t(`GPU limit: ${gpuMemory} GB per GPU`, `GPU 上限：每张 ${gpuMemory} GB`)}
          />
        )}
      </div>

      {/* Legend — 2-column grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {activeSegments.map(segment => (
          <div
            key={segment.key}
            className="flex items-center gap-2"
            onMouseEnter={() => setHoveredSegment(segment.key)}
            onMouseLeave={() => setHoveredSegment(null)}
          >
            <span className={cn('w-2.5 h-2.5 rounded-sm flex-shrink-0', segment.dot)} />
            <span className="text-xs text-fg-muted flex-1 truncate">{segment.label}</span>
            <span className="text-xs font-mono text-fg-default tabular-nums">
              {formatGB(breakdown[segment.key])} GB
              {n > 1 && (
                <span className="text-fg-muted ml-1">
                  ({formatGB(breakdown[segment.key] / n)}/GPU)
                </span>
              )}
            </span>
          </div>
        ))}
        {/* Total row */}
        <div className="col-span-2 flex items-center gap-2 pt-1 border-t border-border-subtle mt-1">
          <span className="w-2.5 h-2.5 flex-shrink-0" />
          <span className="text-xs font-medium text-fg-default flex-1">
            Total{n > 1 ? ` (${n} GPUs)` : ''}
          </span>
          <span className="text-xs font-mono font-semibold text-fg-primary tabular-nums">
            {formatGB(total)} GB
            {n > 1 && (
              <span className="text-fg-muted font-normal ml-1">
                ({formatGB(perGPU)}/GPU)
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
