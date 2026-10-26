import * as React from 'react';
import { Zap, Wrench, Repeat, Share2, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalculatorStore } from '@/store/calculator-store';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '@/lib/language';
import type { WorkloadMode } from '@/lib/formulas/types';
import { t } from '@/lib/i18n';

// Calculator modes — Reverse is a separate page, not a mode
const CALC_TABS: { mode: WorkloadMode; label: { en: string; cn: string }; icon: React.ReactNode; key: string }[] = [
  { mode: 'inference', label: { get en() { return t('Inference', '推理'); }, cn: '推理' }, icon: <Zap size={14} />, key: 'i' },
  { mode: 'train',     label: { get en() { return t('Train', '训练'); }, cn: '训练' },     icon: <Wrench size={14} />, key: 't' },
];

interface ModeTabsBarProps {
  onShare?: () => void;
  onCompare?: () => void;
}

export function ModeTabsBar({ onShare, onCompare }: ModeTabsBarProps) {
  const { mode, setMode } = useCalculatorStore();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const isReversePage = location.pathname === '/reverse';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isReversePage) return;
    const tabs = CALC_TABS.map(t => t.mode);
    const currentIndex = tabs.indexOf(mode);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setMode(tabs[(currentIndex + 1) % tabs.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setMode(tabs[(currentIndex - 1 + tabs.length) % tabs.length]);
    }
  };

  return (
    <div
      className="h-12 border-b border-border-subtle bg-bg-base sticky top-12 z-[19] flex items-center px-6 gap-1"
      role="navigation"
      aria-label={t('Calculator modes', '计算器模式')}
    >
      {/* Mode tabs */}
      <div
        role="tablist"
        aria-label={t('Workload mode', '工作负载模式')}
        className="flex items-center gap-1"
        onKeyDown={handleKeyDown}
      >
        {/* Calculator mode tabs — only shown on calculator page */}
        {!isReversePage && CALC_TABS.map(tab => {
          const isActive = mode === tab.mode;
          return (
            <button
              key={tab.mode}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setMode(tab.mode)}
              className={cn(
                'h-12 px-3.5 flex items-center gap-1.5 text-sm font-medium relative',
                'border-b-2 -mb-px transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                isActive
                  ? 'text-fg-primary border-accent'
                  : 'text-fg-muted border-transparent hover:text-fg-default hover:border-border-subtle'
              )}
              title={`${t(tab.label.en, tab.label.cn)} (${tab.key})`}
            >
              {tab.icon}
              {t(tab.label.en, tab.label.cn)}
            </button>
          );
        })}

        {/* Reverse — always a nav link, active when on /reverse */}
        <button
          onClick={() => isReversePage ? navigate('/') : navigate('/reverse')}
          className={cn(
            'h-12 px-3.5 flex items-center gap-1.5 text-sm font-medium relative',
            'border-b-2 -mb-px transition-colors duration-fast',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            isReversePage
              ? 'text-fg-primary border-accent'
              : 'text-fg-muted border-transparent hover:text-fg-default hover:border-border-subtle'
          )}
          title={t('Reverse: find models that fit your GPU (r)', '反查：找到适配你 GPU 的模型（r）')}
        >
          <Repeat size={14} />
          {t('Reverse', '反查')}
        </button>
      </div>

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-2">
        {!isReversePage && (
          <>
            <button
              onClick={onShare}
              className="h-8 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-bg-muted border border-border-subtle text-fg-primary hover:bg-bg-emphasis transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('Share current configuration (⌘Enter)', '分享当前配置（⌘Enter）')}
              title={t('Share (⌘Enter)', '分享（⌘Enter）')}
            >
              <Share2 size={14} />
              {t('Share', '分享')}
            </button>
            <button
              onClick={onCompare}
              className="h-8 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-bg-muted border border-border-subtle text-fg-primary hover:bg-bg-emphasis transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t('Compare configurations (c)', '对比配置（c）')}
              title={t('Compare (c)', '对比（c）')}
            >
              <ArrowLeftRight size={14} />
              {t('Compare', '对比')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
