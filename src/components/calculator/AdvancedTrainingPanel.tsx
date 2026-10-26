import * as React from 'react';
import { Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/language';
import {
  computeGradAccumulation,
  computeSequencePacking,
  computeFlashAttentionSavings,
  type CheckpointMode,
} from '@/lib/formulas/training-advanced';

interface AdvancedTrainingPanelProps {
  numLayers: number;
  numHeads: number;
  seqLen: number;
  batchSize: number;
  bytesPerParam: number;
  activationsGB: number;
  /** Controlled FlashAttention state (from store). Defaults to true. */
  flashAttention?: boolean;
  /** Controlled activation checkpointing mode (from store). Defaults to 'selective'. */
  checkpointMode?: CheckpointMode;
  /** Called when FlashAttention toggles. */
  onFlashAttentionChange?: (v: boolean) => void;
  /** Called when checkpoint mode changes. */
  onCheckpointModeChange?: (m: CheckpointMode) => void;
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

function Toggle({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        checked ? 'bg-accent' : 'bg-bg-emphasis'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  );
}

const CHECKPOINT_MODES: { value: CheckpointMode; label: string }[] = [
  { value: 'none',      label: 'None' },
  { value: 'selective', label: 'Selective' },
  { value: 'full',      label: 'Full' },
];

export function AdvancedTrainingPanel({
  numLayers,
  numHeads,
  seqLen,
  batchSize,
  bytesPerParam,
  activationsGB,
  flashAttention: flashAttentionProp,
  checkpointMode: checkpointModeProp,
  onFlashAttentionChange,
  onCheckpointModeChange,
  className,
}: AdvancedTrainingPanelProps) {
  const { t } = useLanguage();
  const [accumSteps, setAccumSteps] = React.useState(4);
  const [sequencePacking, setSequencePacking] = React.useState(false);

  // When controlled props are provided (from the store), use them; otherwise
  // fall back to local state so the panel remains usable standalone.
  const isControlled = flashAttentionProp !== undefined;
  const [localFlash, setLocalFlash] = React.useState(true);
  const [localCheckpoint, setLocalCheckpoint] = React.useState<CheckpointMode>('selective');
  const flashAttention = isControlled ? flashAttentionProp : localFlash;
  const checkpointMode = isControlled ? (checkpointModeProp ?? 'selective') : localCheckpoint;

  const changeFlash = (v: boolean) => {
    onFlashAttentionChange?.(v);
    if (!isControlled) setLocalFlash(v);
  };
  const changeCheckpoint = (m: CheckpointMode) => {
    onCheckpointModeChange?.(m);
    if (!isControlled) setLocalCheckpoint(m);
  };

  const avgSeqLen = seqLen * 0.6; // assume 60% average fill

  const gradAccum = computeGradAccumulation(batchSize, accumSteps);
  const seqPacking = computeSequencePacking(avgSeqLen, seqLen, sequencePacking);
  const flashAttn = computeFlashAttentionSavings(numLayers, numHeads, seqLen, batchSize, bytesPerParam, flashAttention);
  // FlashAttention + checkpoint folding is applied in computeTotalVRAM, so the
  // activations passed in are already the folded per-GPU figure. Show that
  // authoritative value here; the flash/checkpoint rows below describe the
  // settings that produced it.
  const reducedActivationsGB = activationsGB;

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Brain size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('Advanced Training', '高级训练')}
        </h3>
      </div>

      <div className="space-y-3 mb-4">
        {/* Gradient Accumulation */}
        <div className="flex items-center gap-2">
          <label htmlFor="accum-steps" className="text-xs text-fg-muted w-44 flex-shrink-0">{t('Grad Accum Steps', '梯度累积步数')}</label>
          <input
            id="accum-steps"
            type="number"
            min={1}
            max={256}
            step={1}
            value={accumSteps}
            onChange={(e) => setAccumSteps(parseInt(e.target.value, 10) || 1)}
            className="flex-1 h-8 px-2 rounded-md border border-border-subtle bg-bg-muted text-xs font-mono text-fg-default focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Sequence Packing */}
        <div className="flex items-center justify-between">
          <label htmlFor="seq-packing" className="text-xs text-fg-muted">{t('Sequence Packing', '序列打包')}</label>
          <Toggle id="seq-packing" checked={sequencePacking} onChange={setSequencePacking} />
        </div>

        {/* FlashAttention */}
        <div className="flex items-center justify-between">
          <label htmlFor="flash-attn" className="text-xs text-fg-muted">{t('FlashAttention', 'FlashAttention')}</label>
          <Toggle id="flash-attn" checked={flashAttention} onChange={changeFlash} />
        </div>

        {/* Activation Checkpointing Mode */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-fg-muted">{t('Activation Checkpointing', '激活检查点')}</label>
          <div className="flex gap-1">
            {CHECKPOINT_MODES.map(({ value }) => (
              <button
                key={value}
                onClick={() => changeCheckpoint(value)}
                className={cn(
                  'flex-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors',
                  checkpointMode === value
                    ? 'bg-accent text-white border-accent'
                    : 'bg-bg-muted border-border-subtle text-fg-default hover:bg-bg-emphasis'
                )}
              >
                {value === 'none' ? t('None', '无') : value === 'selective' ? t('Selective', '选择性') : t('Full', '全量')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Outputs */}
      <div className="border-t border-border-subtle pt-3 flex flex-col">
        <KVRow label={t('Effective Batch', '有效批次')} value={`${gradAccum.effectiveBatch}`} highlight />
        <KVRow label={t('Grad Accum VRAM', '梯度累积显存')} value={`+${gradAccum.extraVRAMGB} GB`} />
        <KVRow label={t('Seq Utilization', '序列利用率')} value={`${seqPacking.utilizationPercent.toFixed(1)}%`} highlight />
        <KVRow label={t('Throughput ×', '吞吐 ×')} value={`${seqPacking.effectiveThroughputMultiplier.toFixed(2)}×`} />
        <KVRow label={t('Attn Score Mem', '注意力分数内存')} value={`${flashAttn.attentionScoreGB.toFixed(2)} GB`} />
        <KVRow label={t('FlashAttn Saves', 'FlashAttn 节省')} value={`${flashAttn.savedGB.toFixed(2)} GB`} highlight />
        <KVRow label={t('Activations', '激活')} value={`${reducedActivationsGB.toFixed(2)} GB`} highlight />
        <KVRow label={t('Compute Overhead', '计算开销')} value={`${checkpointMode === 'none' ? 0 : checkpointMode === 'selective' ? 5 : 33}%`} />
      </div>
    </div>
  );
}
