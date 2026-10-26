import { Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { recommendTopology } from '@/lib/formulas/topology';
import { INTERCONNECT_DB } from '@/types/network';
import { useLanguage } from '@/lib/language';

interface ClusterTopologyProps {
  numGPUs: number;
  workload: 'training' | 'inference';
  tpDegree?: number;
  ppStages?: number;
  dpReplicas?: number;
  className?: string;
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border-subtle last:border-0">
      <span className="text-xs text-fg-muted flex-shrink-0 w-28">{label}</span>
      <span className="text-xs font-mono text-fg-default text-right break-all">{value}</span>
    </div>
  );
}

export function ClusterTopology({
  numGPUs,
  workload,
  tpDegree,
  ppStages,
  dpReplicas,
  className,
}: ClusterTopologyProps) {
  const { t } = useLanguage();
  const topo = recommendTopology(numGPUs, workload);

  // Find interconnect spec for bandwidth/latency info
  const interconnectId = numGPUs <= 8 ? 'nvlink4'
    : numGPUs <= 64 ? 'ib-ndr'
    : numGPUs <= 512 ? 'ib-ndr'
    : 'ib-xdr';
  const spec = INTERCONNECT_DB.find(s => s.id === interconnectId);

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-4', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Network size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('Network Topology', '网络拓扑')}
        </h3>
      </div>

      <div className="flex flex-col">
        <KVRow label={t('Topology', '拓扑')} value={topo.description} />
        <KVRow label={t('Interconnect', '互联方式')} value={topo.interconnect} />
        {spec && (
          <>
            <KVRow label={t('Bandwidth', '带宽')} value={`${spec.bandwidthGBs} GB/s`} />
            <KVRow label={t('Latency', '延迟')} value={`${spec.latencyUs} µs`} />
          </>
        )}
        {tpDegree != null && tpDegree > 1 && (
          <KVRow label={t('TP groups', 'TP 分组数')} value={t(`${Math.floor(numGPUs / tpDegree)} × ${tpDegree} GPUs (intra-node)`, `${Math.floor(numGPUs / tpDegree)} × ${tpDegree} 张 GPU（节点内）`)} />
        )}
        {ppStages != null && ppStages > 1 && (
          <KVRow label={t('PP stages', 'PP 阶段数')} value={t(`${ppStages} stages`, `${ppStages} 个阶段`)} />
        )}
        {dpReplicas != null && dpReplicas > 1 && (
          <KVRow label={t('DP replicas', 'DP 副本数')} value={`${dpReplicas}`} />
        )}
        <KVRow label={t('Notes', '说明')} value={topo.notes} />
      </div>
    </div>
  );
}
