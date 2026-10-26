import * as React from 'react';
import { Moon, Sun, Keyboard, Github, Menu, X, Languages } from 'lucide-react';
import { useTheme } from '@/lib/use-theme';
import { useLanguage } from '@/lib/language';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { en: 'Calculator', cn: '计算器', href: '/' },
  { en: 'Compare', cn: '对比', href: '/compare' },
  { en: 'Reverse', cn: '反查', href: '/reverse' },
  { en: 'Models', cn: '模型库', href: '/models' },
  { en: 'Hardware', cn: '硬件', href: '/hardware' },
  { en: 'Guides', cn: '指南', href: '/guides' },
];

interface TopBarProps {
  currentPath?: string;
  onOpenShortcuts?: () => void;
}

export function TopBar({ currentPath = '/', onOpenShortcuts }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <>
      <header
        className="h-12 border-b border-border-subtle bg-bg-base sticky top-0 z-[20] flex items-center px-4 md:px-6 gap-4 md:gap-8"
        role="banner"
      >
        {/* Skip link */}
        <a href="#main-content" className="skip-link">{t('Skip to main content', '跳到主要内容')}</a>

        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="inline-grid grid-cols-3 gap-[2px]" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} className={cn('w-[4px] h-[4px] rounded-[1px]', i === 4 ? 'bg-accent' : 'bg-fg-muted')} />
            ))}
          </span>
          <span className="font-mono font-semibold text-sm tracking-tight text-fg-primary">DCU-LLMcalc</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-1 ml-4" aria-label={t('Main navigation', '主导航')}>
          {NAV_LINKS.map(link => (
            <a key={link.href} href={link.href}
              className={cn('text-sm px-2.5 py-1.5 rounded-md transition-colors duration-fast',
                currentPath === link.href ? 'text-fg-primary bg-bg-muted' : 'text-fg-muted hover:text-fg-primary hover:bg-bg-muted')}
              aria-current={currentPath === link.href ? 'page' : undefined}>
              {t(link.en, link.cn)}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1">
          {/* EN/CN language toggle */}
          <button onClick={() => setLang(lang === 'en' ? 'cn' : 'en')}
            className="h-8 px-2 rounded-md flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg-primary hover:bg-bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('Switch language (EN/CN)', '切换语言（EN/CN）')}
            title={t('Switch language (EN/CN)', '切换语言（EN/CN）')}>
            <Languages size={14} aria-hidden="true" />
            <span className="font-mono">{lang === 'en' ? 'EN' : 'CN'}</span>
          </button>
          <button onClick={toggleTheme}
            className="w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:text-fg-primary hover:bg-bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t(`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode (⌘\\)`, `切换到${theme === 'dark' ? '浅色' : '深色'}模式（⌘\\）`)}>
            {theme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
          <button onClick={onOpenShortcuts}
            className="hidden sm:flex w-8 h-8 rounded-md items-center justify-center text-fg-muted hover:text-fg-primary hover:bg-bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('Keyboard shortcuts (?)', '键盘快捷键（?）')}>
            <Keyboard size={16} aria-hidden="true" />
          </button>
          <a href="https://github.com/kkpkishan/llm-infra-planner.git" target="_blank" rel="noopener noreferrer"
            className="hidden sm:flex w-8 h-8 rounded-md items-center justify-center text-fg-muted hover:text-fg-primary hover:bg-bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('GitHub repository (opens in new tab)', 'GitHub 仓库（新标签页打开）')}>
            <Github size={16} aria-hidden="true" />
          </a>
          {/* Hamburger — mobile only */}
          <button onClick={() => setMobileMenuOpen(o => !o)}
            className="lg:hidden w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:text-fg-primary hover:bg-bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={mobileMenuOpen ? t('Close menu', '关闭菜单') : t('Open menu', '打开菜单')}
            aria-expanded={mobileMenuOpen} aria-controls="mobile-nav">
            {mobileMenuOpen ? <X size={16} aria-hidden="true" /> : <Menu size={16} aria-hidden="true" />}
          </button>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileMenuOpen && (
        <nav id="mobile-nav" className="lg:hidden fixed top-12 left-0 right-0 z-[19] bg-bg-base border-b border-border-subtle px-4 py-3 flex flex-col gap-1" aria-label={t('Mobile navigation', '移动端导航')}>
          {NAV_LINKS.map(link => (
            <a key={link.href} href={link.href} onClick={() => setMobileMenuOpen(false)}
              className={cn('text-sm px-3 py-2.5 rounded-md transition-colors min-h-[44px] flex items-center',
                currentPath === link.href ? 'text-fg-primary bg-bg-muted font-medium' : 'text-fg-muted hover:text-fg-primary hover:bg-bg-muted')}
              aria-current={currentPath === link.href ? 'page' : undefined}>
              {t(link.en, link.cn)}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}
