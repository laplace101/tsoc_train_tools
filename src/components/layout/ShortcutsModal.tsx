import { X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/primitives/dialog';
import { SHORTCUT_CATEGORIES, SHORTCUT_DEFS } from '@/lib/keyboard-shortcuts';
import { useLanguage } from '@/lib/language';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

// Group shortcuts by category
const grouped = SHORTCUT_DEFS.reduce<Record<string, typeof SHORTCUT_DEFS>>((acc, s) => {
  if (!acc[s.category]) acc[s.category] = [];
  acc[s.category].push(s);
  return acc;
}, {});

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" aria-label={t('Keyboard shortcuts', '键盘快捷键')}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-fg-primary">{t('Keyboard Shortcuts', '键盘快捷键')}</h2>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={t('Close shortcuts modal', '关闭快捷键弹窗')}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {Object.entries(grouped).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-2">
                {t(SHORTCUT_CATEGORIES[category]?.en ?? category, SHORTCUT_CATEGORIES[category]?.cn ?? category)}
              </h3>
              <div className="flex flex-col gap-1">
                {shortcuts.map(s => (
                  <div key={s.keys} className="flex items-center justify-between py-1">
                    <span className="text-xs text-fg-default">{t(s.description.en, s.description.cn)}</span>
                    <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded border border-border-default bg-bg-muted font-mono text-[11px] text-fg-muted">
                      {s.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
