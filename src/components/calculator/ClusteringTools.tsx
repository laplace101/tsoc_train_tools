import { Server } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CLUSTERING_TOOLS, type ClusteringTool } from '@/data/clustering-tools';
import { useLanguage } from '@/lib/language';
import { t } from '@/lib/i18n';

interface ClusteringToolsProps {
  className?: string;
}

const GROUP_LABELS: Record<ClusteringTool['group'], string> = {
  get production() { return t('Production', '生产级'); },
  hpc: 'HPC',
  get lightweight() { return t('Lightweight', '轻量级'); },
  get consumer() { return t('Consumer', '消费级'); },
};

const GROUPS: ClusteringTool['group'][] = ['production', 'hpc', 'lightweight', 'consumer'];

function ComplexityStars({ value }: { value: number }) {
  return (
    <span className="text-[11px] font-mono" aria-label={t(`Setup complexity ${value} of 5`, `设置复杂度 ${value} / 5`)}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < value ? 'text-accent' : 'text-fg-subtle'}>★</span>
      ))}
    </span>
  );
}

function ToolCard({ tool }: { tool: ClusteringTool }) {
  const { t } = useLanguage();
  return (
    <div className="rounded border border-border-subtle bg-bg-default p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <a
            href={tool.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-fg-default hover:text-accent transition-colors"
          >
            {tool.name}
          </a>
          <p className="text-[11px] text-fg-muted mt-0.5">{tool.scenario}</p>
        </div>
        <ComplexityStars value={tool.setupComplexity} />
      </div>

      <p className="text-[11px] text-fg-muted leading-relaxed">{tool.description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-fg-muted">
        <span><span className="font-medium">{t('Max size:', '最大规模：')}</span> {tool.maxClusterSize}</span>
        <span><span className="font-medium">Latency:</span> {tool.latencyOverhead}</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {tool.supportedHardware.map(hw => (
          <span
            key={hw}
            className="text-[10px] bg-bg-muted border border-border-subtle rounded px-1.5 py-0.5 text-fg-muted"
          >
            {hw}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ClusteringTools({ className }: ClusteringToolsProps) {
  const { t } = useLanguage();
  const byGroup = GROUPS.reduce<Record<ClusteringTool['group'], ClusteringTool[]>>(
    (acc, g) => {
      acc[g] = CLUSTERING_TOOLS.filter(t => t.group === g);
      return acc;
    },
    { production: [], hpc: [], lightweight: [], consumer: [] },
  );

  return (
    <div className={cn('rounded-lg border border-border-subtle bg-bg-muted p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Server size={14} className="text-fg-muted" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          {t('Clustering Software', '集群软件')}
        </h3>
        <span className="text-[10px] text-fg-muted ml-auto">★ = setup complexity</span>
      </div>

      <div className="flex flex-col gap-5">
        {GROUPS.map(group => {
          const tools = byGroup[group];
          if (tools.length === 0) return null;
          return (
            <div key={group}>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {GROUP_LABELS[group]}
              </h4>
              <div className="flex flex-col gap-2">
                {tools.map(tool => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
