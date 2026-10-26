import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GPUSpec } from '@/lib/formulas/types';

interface SelectedHardwarePanelProps {
  gpu: GPUSpec;
  className?: string;
}

const FORM_FACTOR_LABELS: Record<string, string> = {
  pcie: 'PCIe',
  sxm: 'SXM',
  oam: 'OAM',
  integrated: 'Integrated',
  mxm: 'MXM',
};

/** Build the ordered list of spec tiles from the GPU's present fields. */
function buildSpecs(gpu: GPUSpec): { label: string; value: string }[] {
  const specs: { label: string; value: string }[] = [
    { label: 'VRAM', value: `${gpu.memoryGB} GB` },
    { label: 'Bandwidth', value: `${gpu.memoryBandwidthGBs} GB/s` },
  ];
  // Float FLOPS — most LLM-relevant first, only show what the spec defines.
  if (gpu.flops.fp16 != null) specs.push({ label: 'FP16', value: `${gpu.flops.fp16} TF` });
  if (gpu.flops.fp8 != null) specs.push({ label: 'FP8', value: `${gpu.flops.fp8} TF` });
  if (gpu.flops.fp64 != null) specs.push({ label: 'FP64', value: `${gpu.flops.fp64} TF` });
  if (gpu.flops.fp32 != null) specs.push({ label: 'FP32', value: `${gpu.flops.fp32} TF` });
  if (gpu.flops.int8 != null) specs.push({ label: 'INT8', value: `${gpu.flops.int8} TOPS` });
  specs.push({ label: 'TDP', value: `${gpu.tdpWatts} W` });
  specs.push({ label: 'Form', value: FORM_FACTOR_LABELS[gpu.formFactor] ?? gpu.formFactor });
  return specs;
}

export function SelectedHardwarePanel({ gpu, className }: SelectedHardwarePanelProps) {
  const specs = buildSpecs(gpu);

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-3', className)}>
      <div className="flex items-center gap-2 mb-2.5">
        <Cpu size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Selected Hardware
        </h3>
      </div>

      {/* Name + vendor + category */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-fg-primary truncate">{gpu.name}</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-bg-emphasis text-fg-muted flex-shrink-0">
          {gpu.vendor}
        </span>
      </div>
      <p className="text-[10px] text-fg-muted font-mono mb-3">
        {gpu.category}
      </p>

      {/* Spec grid */}
      <div className="grid grid-cols-2 gap-2">
        {specs.map(s => (
          <div key={s.label} className="rounded-md border border-border-subtle bg-bg-base/40 px-2.5 py-1.5">
            <div className="text-[9px] uppercase tracking-wide text-fg-muted">{s.label}</div>
            <div className="text-xs font-mono font-medium text-fg-default tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
