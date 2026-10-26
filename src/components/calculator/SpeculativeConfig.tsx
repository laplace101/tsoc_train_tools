import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { computeSpeculativeOverhead, estimateSpeedup, type SpeculativeMethod } from '@/lib/formulas/speculative';
import { t } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';

interface SpeculativeConfigProps {
  batchSize?: number;
  contextLength?: number;
  className?: string;
}

const DRAFT_METHODS: { key: SpeculativeMethod; label: string; description: string }[] = [
  { key: 'draft_model',   label: 'Draft Model 1B', get description() { return t('Small draft model (e.g. Llama 3.2 1B)', '小型草稿模型（如 Llama 3.2 1B）'); } },
  { key: 'medusa',        label: 'Medusa',          get description() { return t('Multi-head decoding, no draft model', '多头解码，无需草稿模型'); } },
  { key: 'eagle2',        label: 'EAGLE-2',         get description() { return t('Feature-level draft, high speedup', '特征级草稿，加速比高'); } },
  { key: 'eagle3',        label: 'EAGLE-3',         get description() { return t('Latest EAGLE variant, best speedup', '最新的 EAGLE 变体，加速比最高'); } },
  { key: 'lookahead',     label: 'Lookahead',       get description() { return t('Jacobi decoding, no extra model', 'Jacobi 解码，无需额外模型'); } },
  { key: 'prompt_lookup', label: 'Prompt Lookup',   get description() { return t('Copy from prompt, RAG-friendly', '从提示词复制，对 RAG 友好'); } },
];

// Approximate overhead for a 1B draft model
const DRAFT_1B_PARAMS = 1_240_000_000;
const DRAFT_1B_LAYERS = 16;

export function SpeculativeConfig({ batchSize = 1, contextLength = 4096, className }: SpeculativeConfigProps) {
  const { t } = useLanguage();
  const [enabled, setEnabled] = React.useState(false);
  const [method, setMethod] = React.useState<SpeculativeMethod>('eagle3');

  const speedup = estimateSpeedup(method);

  // Only compute overhead for draft_model method
  const overhead = method === 'draft_model'
    ? computeSpeculativeOverhead(DRAFT_1B_PARAMS, DRAFT_1B_LAYERS, {
        batchSize,
        seqLen: contextLength,
        numKVHeads: 8,
        headDim: 64,
        bytesPerParam: 2,
      })
    : { draftModelGB: 0, draftKVGB: 0, totalOverheadGB: 0 };

  const showBatchWarning = batchSize > 8;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-default">{t('Speculative Decoding', '投机解码')}</span>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(e => !e)}
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            enabled ? 'bg-accent' : 'bg-bg-emphasis'
          )}
        >
          <span
            className={cn(
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
            )}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* Method selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] text-fg-muted">{t('Draft method', '草稿方法')}</span>
            <div className="flex flex-col gap-1">
              {DRAFT_METHODS.map(m => {
                const isSelected = method === m.key;
                return (
                  <button
                    key={m.key}
                    onClick={() => setMethod(m.key)}
                    className={cn(
                      'flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs border transition-colors text-left',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'bg-accent/10 border-accent/40 text-fg-primary'
                        : 'bg-bg-muted border-border-subtle text-fg-default hover:bg-bg-emphasis'
                    )}
                  >
                    <span className="font-medium">{m.label}</span>
                    <span className="text-[10px] text-fg-muted ml-2 truncate">{m.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats */}
          <div className="rounded-md bg-bg-muted border border-border-subtle px-3 py-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-fg-muted">{t('Estimated speedup', '预计加速比')}</span>
              <span className="text-sm font-mono font-semibold text-green-500">
                {speedup.min}–{speedup.max}×
              </span>
            </div>
            {method === 'draft_model' && overhead.totalOverheadGB > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-fg-muted">{t('Draft model VRAM', '草稿模型显存')}</span>
                  <span className="text-xs font-mono text-fg-default">{overhead.draftModelGB.toFixed(2)} GB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-fg-muted">{t('Draft KV cache', '草稿 KV Cache')}</span>
                  <span className="text-xs font-mono text-fg-default">{overhead.draftKVGB.toFixed(3)} GB</span>
                </div>
                <div className="flex items-center justify-between border-t border-border-subtle pt-1 mt-0.5">
                  <span className="text-[10px] text-fg-muted font-medium">{t('Total overhead', '总开销')}</span>
                  <span className="text-xs font-mono font-semibold text-fg-primary">{overhead.totalOverheadGB.toFixed(2)} GB</span>
                </div>
              </>
            )}
            {method !== 'draft_model' && (
              <p className="text-[10px] text-fg-muted">{t('No extra VRAM required for this method.', '该方法不需要额外显存。')}</p>
            )}
          </div>

          {/* Batch warning */}
          {showBatchWarning && (
            <div className="flex items-start gap-1.5 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-2.5 py-2">
              <AlertTriangle size={12} className="text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-yellow-600 dark:text-yellow-400">
                Only effective at batch ≤ 8; diminishes at large batch (current: {batchSize})
              </p>
            </div>
          )}
          {!showBatchWarning && (
            <p className="text-[10px] text-fg-muted italic">
              {t('Only effective at batch ≤ 8; diminishes at large batch', '仅在 batch ≤ 8 时有效；批量增大后效果衰减')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
