import { cn } from '@/lib/utils';
import type { ModelSpec } from '@/lib/formulas/types';
import { useLanguage } from '@/lib/language';
import {
  modelHasIndexerCache,
  modelHasDraftKvCache,
  modelHasLinearAttentionState,
} from '@/lib/formulas/kv-formulas';

interface AdvancedKVCacheConfigProps {
  model: ModelSpec;
  indexerPrecision: string;
  onIndexerPrecisionChange: (precision: string) => void;
  includeDraftKvCache: boolean;
  onDraftKvCacheChange: (enabled: boolean) => void;
  includeLinearAttentionState: boolean;
  onLinearAttentionStateChange: (enabled: boolean) => void;
}

const INDEXER_PRECISION_OPTIONS = [
  { key: 'fp16',     label: 'FP16', bytesPerParam: 2.0 },
  { key: 'fp8_e4m3', label: 'FP8',  bytesPerParam: 1.0 },
  { key: 'int8',     label: 'INT8', bytesPerParam: 1.0 },
  { key: 'int4',     label: 'INT4', bytesPerParam: 0.5 },
];

/** Toggle row used for draft-KV / linear-attention state. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-fg-default">{label}</span>
        <span className="text-[10px] text-fg-muted leading-tight">{hint}</span>
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className={cn(
          'block h-4 w-7 rounded-full transition-colors duration-fast',
          checked ? 'bg-accent' : 'bg-bg-muted border border-border-subtle'
        )} />
        <span className={cn(
          'absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform duration-fast',
          checked && 'translate-x-3'
        )} />
      </span>
    </label>
  );
}

/**
 * Advanced KV layout controls (kv-cache-calculator integration).
 * Renders nothing for models without an indexer / draft stack / linear state.
 */
export function AdvancedKVCacheConfig({
  model,
  indexerPrecision,
  onIndexerPrecisionChange,
  includeDraftKvCache,
  onDraftKvCacheChange,
  includeLinearAttentionState,
  onLinearAttentionStateChange,
}: AdvancedKVCacheConfigProps) {
  const { t } = useLanguage();
  const hasIndexer = modelHasIndexerCache(model);
  const hasDraft = modelHasDraftKvCache(model);
  const hasLinear = modelHasLinearAttentionState(model);

  if (!hasIndexer && !hasDraft && !hasLinear) return null;

  return (
    <div className="flex flex-col gap-2 p-2.5 rounded-lg border border-border-subtle bg-bg-muted/40">
      {hasIndexer && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-fg-default">
            {t('Indexer Cache Precision', '索引器 Cache 精度')}
          </label>
          <div role="radiogroup" aria-label={t('Indexer cache precision', 'Indexer 缓存精度')} className="flex flex-wrap gap-1">
            {INDEXER_PRECISION_OPTIONS.map(option => {
              const isSelected = indexerPrecision === option.key;
              return (
                <button
                  key={option.key}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onIndexerPrecisionChange(option.key)}
                  className={cn(
                    'px-2 py-1 rounded-md text-[11px] font-medium transition-colors duration-fast',
                    'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-muted border-border-subtle text-fg-default hover:bg-bg-emphasis hover:border-border-default'
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-fg-muted italic">
            {t('Precision of the DSA/MiniMax/DeepSeek-V4 indexer side-cache.', 'DSA/MiniMax/DeepSeek-V4 索引器旁路缓存的精度。')}
          </p>
        </div>
      )}

      {hasDraft && (
        <ToggleRow
          label={t('Include draft KV cache', '计入草稿层 KV Cache')}
          hint={t('Account for the MTP/draft layers\' KV in sizing.', '估算时计入 MTP / 草稿层的 KV 占用。')}
          checked={includeDraftKvCache}
          onChange={onDraftKvCacheChange}
        />
      )}

      {hasLinear && (
        <ToggleRow
          label={t('Include linear-attention state', '计入线性注意力状态')}
          hint={t('Qwen hybrid linear-attention recurrent/conv state (fixed, not seq-scaled).', 'Qwen 混合线性注意力的循环 / 卷积状态（固定大小，不随序列长度变化）。')}
          checked={includeLinearAttentionState}
          onChange={onLinearAttentionStateChange}
        />
      )}
    </div>
  );
}
