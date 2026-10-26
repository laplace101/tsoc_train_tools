import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/lib/use-theme';
import { useCalculatorStore } from '@/store/calculator-store';
import { useToast } from '@/components/feedback/Toast';
import { registerKeyboardShortcuts } from '@/lib/keyboard-shortcuts';
import { useLanguage } from '@/lib/language';

interface UseKeyboardShortcutsOptions {
  onOpenModelSearch: () => void;
  onOpenShortcutsModal: () => void;
}

export function useKeyboardShortcuts({
  onOpenModelSearch,
  onOpenShortcutsModal,
}: UseKeyboardShortcutsOptions) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toggleTheme } = useTheme();
  const { setMode, addCompareConfig, compareConfigs, getShareURL } = useCalculatorStore();
  const { showToast } = useToast();

  React.useEffect(() => {
    const cleanup = registerKeyboardShortcuts({
      openModelSearch: onOpenModelSearch,
      toggleTheme,
      copyShareURL: async () => {
        const url = getShareURL();
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          const input = document.createElement('input');
          input.value = url;
          input.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(input);
          input.select();
          document.execCommand('copy');
          document.body.removeChild(input);
        }
        showToast(t('Link copied to clipboard', '链接已复制到剪贴板'), 'success');
      },
      openShortcutsModal: onOpenShortcutsModal,
      setMode,
      addCompare: () => {
        if (compareConfigs.length >= 3) {
          showToast(t('Maximum 3 configurations', '最多只能保留 3 个配置'), 'error');
          return;
        }
        addCompareConfig();
        showToast(t('Added to compare — opening compare page', '已加入对比 —— 正在打开对比页'), 'success');
        navigate('/compare');
      },
      navigate: (path) => navigate(path),
    });

    return cleanup;
  }, [
    onOpenModelSearch,
    onOpenShortcutsModal,
    toggleTheme,
    setMode,
    addCompareConfig,
    compareConfigs.length,
    getShareURL,
    showToast,
    navigate,
    t,
  ]);
}
