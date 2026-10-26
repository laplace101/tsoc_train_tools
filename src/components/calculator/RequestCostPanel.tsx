import type { RequestCostResult } from '@/lib/formulas/request-cost';
import { useLanguage } from '@/lib/language';

interface RequestCostPanelProps {
  result: RequestCostResult;
  hourlyCloudCost: number;
  // API comparison (Together/Fireworks typical pricing)
  apiInputCostPerMTokens?: number;
  apiOutputCostPerMTokens?: number;
  apiName?: string;
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.0001) return `$${(usd * 1e6).toFixed(2)}µ`;
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-subtle/50 last:border-0">
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="text-right">
        <span className="text-xs font-mono font-semibold text-fg-primary">{value}</span>
        {sub && <span className="text-[10px] text-fg-muted ml-1">{sub}</span>}
      </div>
    </div>
  );
}

export function RequestCostPanel({
  result,
  hourlyCloudCost,
  apiInputCostPerMTokens = 0.20,
  apiOutputCostPerMTokens = 0.60,
  apiName = 'Together AI',
}: RequestCostPanelProps) {
  const { t } = useLanguage();
  const {
    costPerRequest,
    costPerMInputTokens,
    costPerMOutputTokens,
    costPerUserPerHour,
    costPerUserPerMonth,
    breakevenRequestsPerHour,
  } = result;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-fg-default">{t('Request Cost', '请求成本')}</span>

      <div className="rounded-md border border-border-subtle bg-bg-subtle p-3 flex flex-col">
        <Row label={t('Per request', '每次请求')} value={formatCost(costPerRequest)} />
        <Row label={t('Per 1M input tokens', '每 100 万输入 token')} value={formatCost(costPerMInputTokens)} />
        <Row label={t('Per 1M output tokens', '每 100 万输出 token')} value={formatCost(costPerMOutputTokens)} />
        <Row label={t('Per user / hour', '每用户 / 小时')} value={formatCost(costPerUserPerHour)} />
        <Row label={t('Per user / month', '每用户 / 月')} value={formatCost(costPerUserPerMonth)} sub="(8h/day, 22 days)" />

        {/* API comparison */}
        <div className="mt-2 pt-2 border-t border-border-subtle">
          <p className="text-[10px] font-medium text-fg-muted mb-1">vs {apiName} API</p>
          <Row label={t('API input (1M tokens)', 'API 输入（100 万 token）')} value={`$${apiInputCostPerMTokens.toFixed(2)}`} />
          <Row label={t('API output (1M tokens)', 'API 输出（100 万 token）')} value={`$${apiOutputCostPerMTokens.toFixed(2)}`} />
        </div>

        {/* Breakeven */}
        {breakevenRequestsPerHour > 0 && (
          <div className="mt-2 pt-2 border-t border-border-subtle">
            <p className="text-[10px] text-fg-muted">
              Self-hosting cheaper than API at &gt;{breakevenRequestsPerHour.toLocaleString()} req/hour
            </p>
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-border-subtle">
          <p className="text-[10px] text-fg-muted">
            Instance cost: ${hourlyCloudCost.toFixed(2)}/hour
          </p>
        </div>
      </div>
    </div>
  );
}
