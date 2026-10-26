import * as React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot, ResponsiveContainer } from 'recharts';
import { computeKVCache } from '@/lib/formulas/kvcache';
import { computeModelKVCache, modelHasAdvancedKV } from '@/lib/formulas/kv-formulas';
import type { ModelSpec } from '@/lib/formulas/types';
import { getKVPrecisionConfig } from '@/lib/formulas/precision';
import { useLanguage } from '@/lib/language';

interface KVCurveChartProps {
  model: ModelSpec;
  kvPrecision: string;
  /** Indexer cache precision (DSA/MiniMax/DeepSeek-V4). Defaults to kvPrecision. */
  indexerPrecision?: string;
  currentContext: number;
  batchSize: number;
}

// Context lengths to plot (log-spaced)
const PLOT_STEPS = [
  1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072,
  262144, 524288, 1048576, 2097152, 4194304, 10485760,
];

function formatCtxLabel(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1024) return `${n / 1024}K`;
  return String(n);
}

export function KVCurveChart({ model, kvPrecision, indexerPrecision, currentContext, batchSize }: KVCurveChartProps) {
  const { t } = useLanguage();
  const kvConfig = getKVPrecisionConfig(kvPrecision);
  const indexerConfig = getKVPrecisionConfig(indexerPrecision ?? kvPrecision);
  const arch = model.architecture;

  const kvFor = React.useCallback((seqLen: number): number => {
    if (modelHasAdvancedKV(model)) {
      // Advanced layout: total includes the indexer side-cache, matching VRAM.
      const result = computeModelKVCache(model, {
        batchSize,
        seqLen,
        kvBytesPerElement: kvConfig.bytesPerParam,
        indexerBytesPerElement: indexerConfig.bytesPerParam,
      });
      return result.totalGB;
    }
    const { kvCacheGB } = computeKVCache({
      numLayers: arch.numLayers,
      batchSize,
      seqLen,
      numKVHeads: arch.numKeyValueHeads,
      headDim: arch.headDim,
      bytesPerParam: kvConfig.bytesPerParam,
      attentionType: arch.attentionType,
      mlaCompressedDim: model.mlaCompressedDim,
    });
    return kvCacheGB;
  }, [arch, batchSize, kvConfig.bytesPerParam, indexerConfig.bytesPerParam, model]);

  const data = React.useMemo(() => {
    const maxCtx = model.architecture.maxContextLength;
    return PLOT_STEPS
      .filter(s => s <= Math.max(maxCtx, currentContext))
      .map(seqLen => ({
        ctx: seqLen,
        kvGB: kvFor(seqLen),
        label: formatCtxLabel(seqLen),
      }));
  }, [kvFor, model.architecture.maxContextLength, currentContext]);

  const currentKV = React.useMemo(() => kvFor(currentContext), [kvFor, currentContext]);

  if (data.length < 2) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium text-fg-muted">{t('KV Cache vs Context', 'KV Cache 与上下文长度的关系')}</span>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 8, fill: 'var(--color-fg-muted, #888)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 8, fill: 'var(--color-fg-muted, #888)' }}
            tickLine={false}
            axisLine={false}
            width={28}
            tickFormatter={v => `${v}G`}
          />
          <Tooltip
            contentStyle={{ fontSize: 10, padding: '2px 6px' }}
            formatter={(v: number) => [`${v.toFixed(2)} GB`, 'KV']}
            labelFormatter={l => `ctx: ${l}`}
          />
          <Line
            type="monotone"
            dataKey="kvGB"
            stroke="var(--color-accent, #6366f1)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={formatCtxLabel(data.reduce((prev, curr) =>
              Math.abs(curr.ctx - currentContext) < Math.abs(prev.ctx - currentContext) ? curr : prev
            ).ctx)}
            y={currentKV}
            r={3}
            fill="var(--color-accent, #6366f1)"
            stroke="white"
            strokeWidth={1}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
