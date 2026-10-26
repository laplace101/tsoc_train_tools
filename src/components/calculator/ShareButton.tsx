import * as React from 'react';
import { Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCalculatorStore } from '@/store/calculator-store';
import { useToast } from '@/components/feedback/Toast';
import { useLanguage } from '@/lib/language';

interface ShareButtonProps {
  className?: string;
}

export function ShareButton({ className }: ShareButtonProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = React.useState(false);
  const { getShareURL } = useCalculatorStore();
  const { showToast } = useToast();

  const handleShare = async () => {
    const url = getShareURL();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: create a temporary input and select it
      const input = document.createElement('input');
      input.value = url;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(true);
    showToast(t('Link copied to clipboard', '链接已复制到剪贴板'), 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className={cn(
        'h-8 px-3 rounded-md text-sm font-medium flex items-center gap-1.5',
        'bg-bg-muted border border-border-subtle text-fg-primary',
        'hover:bg-bg-emphasis transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      aria-label={t('Copy share link (⌘Enter)', '复制分享链接（⌘Enter）')}
      title={t('Share (⌘Enter)', '分享（⌘Enter）')}
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Share2 size={14} />}
      {copied ? t('Copied!', '已复制！') : t('Share', '分享')}
    </button>
  );
}
