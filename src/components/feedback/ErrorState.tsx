import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/language';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  const { t } = useLanguage();
  const text = message ?? t('Something went wrong.', '出错了。');
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
      <AlertCircle size={32} className="text-red-500" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-fg-default">{t('Error', '错误')}</h3>
        <p className="text-xs text-fg-muted max-w-xs">{text}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 text-xs font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          {t('Try again', '重试')}
        </button>
      )}
    </div>
  );
}
