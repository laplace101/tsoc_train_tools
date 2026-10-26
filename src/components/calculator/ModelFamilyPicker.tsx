import * as React from 'react';
import { Layers, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTooltip } from '@/components/primitives/InfoTooltip';
import type { ModelSpec } from '@/lib/formulas/types';

/** Value meaning "no family filter" — show every model. */
export const ALL_FAMILIES = 'all';

/** Curated display labels for known families; falls back to title-casing. */
const FAMILY_DISPLAY: Record<string, string> = {
  llama: 'Llama', mistral: 'Mistral', qwen: 'Qwen', deepseek: 'DeepSeek',
  gemma: 'Gemma', phi: 'Phi', olmo: 'OLMo', yi: 'Yi', falcon: 'Falcon',
  mamba: 'Mamba', bge: 'BGE', nomic: 'Nomic', falcon3: 'Falcon3',
  granite: 'Granite', starcoder2: 'StarCoder2', xgen: 'XGen', codegen25: 'CodeGen2.5',
  gpt: 'GPT', pythia: 'Pythia', redpajama: 'RedPajama', stablelm: 'StableLM',
  zephyr: 'Zephyr', smollm2: 'SmolLM2', nous: 'Nous', solar: 'Solar',
  internlm2_5: 'InternLM2.5', internlm3: 'InternLM3', baichuan2: 'Baichuan2',
  snowflake: 'Snowflake', vicuna: 'Vicuna', platypus2: 'Platypus2',
  multilingual: 'Multilingual', gte: 'GTE', nv: 'NV', grok: 'Grok',
  jamba: 'Jamba', moonlight: 'Moonlight', kimi: 'Kimi', glm: 'GLM',
  reka: 'Reka', xlam: 'XLAM', stable: 'Stable', smollm: 'SmolLM',
  smollm3: 'SmolLM3', smolvlm: 'SmolVLM', smolvlm2: 'SmolVLM2',
  hermes: 'Hermes', internlm2: 'InternLM2', baichuan: 'Baichuan',
  minicpm: 'MiniCPM', minicpm3: 'MiniCPM3', minicpm4: 'MiniCPM4',
  wizardcoder: 'WizardCoder', wizardmath: 'WizardMath', starling: 'Starling',
  magicoder: 'Magicoder', llava: 'LLaVA', seamless: 'Seamless', hf: 'HF',
  paraphrase: 'Paraphrase', e5: 'E5', jina: 'Jina', mxbai: 'MXBai',
  'stella_en_400m_v5': 'Stella 400M v5', 'stella_en_1.5b_v5': 'Stella 1.5B v5',
  clip: 'CLIP', siglip2: 'SigLIP2', cohere: 'Cohere',
  'qwen3.6': 'Qwen3.6', 'qwen3.5': 'Qwen3.5', 'qwen3.8': 'Qwen3.8', mimo: 'Xiaomi MiMo',
  minimax: 'MiniMax', all: 'All',
};

function formatFamily(family: string): string {
  if (FAMILY_DISPLAY[family]) return FAMILY_DISPLAY[family];
  return family
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface ModelFamilyPickerProps {
  models: ModelSpec[];
  /** Selected family value, or ALL_FAMILIES ('all') for every model. */
  value: string;
  onChange: (family: string) => void;
  className?: string;
}

export function ModelFamilyPicker({ models, value, onChange, className }: ModelFamilyPickerProps) {
  // Family → model count, sorted by count descending so major families are on top.
  const familyCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      counts.set(model.family, (counts.get(model.family) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [models]);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-xs font-medium text-fg-default flex items-center gap-1.5">
        <Layers size={14} className="text-fg-muted" />
        Model family
        <InfoTooltip paramKey="modelFamily" />
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label="Model family"
          className="w-full h-9 appearance-none px-3 pr-9 rounded-md border border-border-subtle bg-bg-muted text-sm text-fg-default hover:bg-bg-emphasis focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value={ALL_FAMILIES}>All models ({models.length})</option>
          {familyCounts.map(([family, count]) => (
            <option key={family} value={family}>
              {formatFamily(family)} ({count})
            </option>
          ))}
        </select>
        <ChevronsUpDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
        />
      </div>
    </div>
  );
}
