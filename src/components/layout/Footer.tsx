import { useLanguage } from '@/lib/language';

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="max-w-[1760px] mx-auto px-6 py-8 border-t border-border-subtle flex items-center justify-between text-[11px] text-fg-muted font-mono mt-8">
      <div className="flex items-center gap-1">
        <span>DCU-LLMcalculator v0.1.0</span>
        <span className="mx-1">·</span>
        <a href="/guides" className="hover:text-fg-primary transition-colors">{t('methodology', '方法说明')}</a>
        <span className="mx-1">·</span>
        <a href="https://github.com/kkpkishan/llm-infra-planner" target="_blank" rel="noopener noreferrer" className="hover:text-fg-primary transition-colors">github</a>
        <span className="mx-1">·</span>
        <a href="#" className="hover:text-fg-primary transition-colors">{t('changelog', '更新日志')}</a>
      </div>
      <div>{t('prices refreshed', '价格更新于')} · Apr 16, 2026 · 04:00 UTC</div>
    </footer>
  );
}
