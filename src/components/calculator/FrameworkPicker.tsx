import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SERVING_FRAMEWORKS, type ServingFramework } from '@/data/serving-frameworks';
import type { GPUSpec } from '@/lib/formulas/types';
import { useLanguage } from '@/lib/language';

interface FrameworkPickerProps {
  gpu?: GPUSpec | null;
  quantization?: string;
  mode?: string;
  className?: string;
}

function getRecommendedFrameworks(
  gpu: GPUSpec | null | undefined,
  quantization: string,
  mode: string
): ServingFramework[] {
  const quant = quantization.toLowerCase();
  const vendor = gpu?.vendor;

  // GGUF → llama.cpp
  if (quant === 'gguf') {
    return SERVING_FRAMEWORKS.filter(f => f.id === 'llama.cpp');
  }
  // EXL2 → ExLlamaV2
  if (quant === 'exl2') {
    return SERVING_FRAMEWORKS.filter(f => f.id === 'exllamav2');
  }
  // Apple Silicon → MLX or llama.cpp
  if (vendor === 'apple') {
    return SERVING_FRAMEWORKS.filter(f => f.id === 'mlx' || f.id === 'llama.cpp');
  }
  // AMD → vLLM, SGLang, or TGI
  if (vendor === 'amd') {
    return SERVING_FRAMEWORKS.filter(f => f.id === 'vllm' || f.id === 'sglang' || f.id === 'tgi');
  }
  // NVIDIA + training → not applicable
  if (vendor === 'nvidia' && (mode === 'train' || mode === 'finetune')) {
    return [];
  }
  // NVIDIA + FP8/INT8 + inference → vLLM or SGLang
  if (vendor === 'nvidia' && (quant === 'fp8' || quant === 'fp8_e4m3' || quant === 'fp8_e5m2' || quant === 'int8')) {
    return SERVING_FRAMEWORKS.filter(f => f.id === 'vllm' || f.id === 'sglang');
  }
  // NVIDIA (other quantizations) → vLLM or SGLang
  if (vendor === 'nvidia') {
    return SERVING_FRAMEWORKS.filter(f => f.id === 'vllm' || f.id === 'sglang');
  }
  // Default → vLLM
  return SERVING_FRAMEWORKS.filter(f => f.id === 'vllm');
}

const HARDWARE_ICONS: Record<string, string> = {
  nvidia: 'NV', amd: 'AMD', apple: 'APL', intel: 'INT', cpu: 'CPU',
};

export function FrameworkPicker({ gpu, quantization = 'fp16', mode = 'inference', className }: FrameworkPickerProps) {
  const { t } = useLanguage();
  const isTraining = mode === 'train' || mode === 'finetune';
  const recommended = getRecommendedFrameworks(gpu, quantization, mode);

  // Show top 4 frameworks in comparison table
  const tableFrameworks = SERVING_FRAMEWORKS.slice(0, 6);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <span className="text-xs font-medium text-fg-default">{t('Serving Framework', '推理框架')}</span>

      {isTraining && gpu?.vendor === 'nvidia' ? (
        <p className="text-xs text-fg-muted italic">
          {t('Training workloads use PyTorch / DeepSpeed / FSDP — serving frameworks not applicable.', '训练负载使用 PyTorch / DeepSpeed / FSDP，不适用推理框架。')}
        </p>
      ) : recommended.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] text-fg-muted">{t('Recommended for your config:', '针对当前配置的推荐：')}</p>
          <div className="flex flex-wrap gap-1.5">
            {recommended.map(fw => (
              <a
                key={fw.id}
                href={fw.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
              >
                {fw.name}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
          <p className="text-[10px] text-fg-muted">
            Efficiency: {recommended[0]?.efficiencyFactor.min}–{recommended[0]?.efficiencyFactor.max}×
          </p>
        </div>
      ) : (
        <p className="text-xs text-fg-muted italic">{t('Select a GPU to get framework recommendations.', '选择 GPU 以获得框架推荐。')}</p>
      )}

      {/* Comparison table */}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-left py-1 px-1 text-fg-muted font-medium">{t('Framework', '框架')}</th>
              <th className="text-center py-1 px-1 text-fg-muted font-medium">{t('HW', '硬件')}</th>
              <th className="text-center py-1 px-1 text-fg-muted font-medium">{t('PA', '并行')}</th>
              <th className="text-center py-1 px-1 text-fg-muted font-medium">Pfx$</th>
              <th className="text-center py-1 px-1 text-fg-muted font-medium">{t('Spec', '投机')}</th>
              <th className="text-right py-1 px-1 text-fg-muted font-medium">{t('Eff.', '效率')}</th>
            </tr>
          </thead>
          <tbody>
            {tableFrameworks.map(fw => {
              const isRec = recommended.some(r => r.id === fw.id);
              return (
                <tr
                  key={fw.id}
                  className={cn(
                    'border-b border-border-subtle/50',
                    isRec && 'bg-accent/5'
                  )}
                >
                  <td className="py-1 px-1">
                    <a
                      href={fw.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn('hover:underline', isRec ? 'text-accent font-semibold' : 'text-fg-default')}
                    >
                      {fw.name}
                    </a>
                  </td>
                  <td className="py-1 px-1 text-center">
                    <span className="font-mono text-fg-muted">
                      {fw.hardware.map(h => HARDWARE_ICONS[h] ?? h).join('/')}
                    </span>
                  </td>
                  <td className="py-1 px-1 text-center">
                    {fw.features.pagedAttention ? '✓' : '–'}
                  </td>
                  <td className="py-1 px-1 text-center">
                    {fw.features.prefixCache ? '✓' : '–'}
                  </td>
                  <td className="py-1 px-1 text-center">
                    {fw.features.speculativeDecoding ? '✓' : '–'}
                  </td>
                  <td className="py-1 px-1 text-right font-mono text-fg-muted">
                    {fw.efficiencyFactor.min}–{fw.efficiencyFactor.max}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
