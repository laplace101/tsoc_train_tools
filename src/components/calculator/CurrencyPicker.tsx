/**
 * Task 12: Currency picker dropdown.
 * Persists preference in localStorage, shows exchange rate vs USD.
 */

import { useEffect, useState } from "react";
import { SUPPORTED_CURRENCIES, getExchangeRate, getRatesFetchedAt } from "../../lib/currency";
import type { SupportedCurrency } from "../../lib/currency";
import { t } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';

const STORAGE_KEY = "llm-calc-currency";

const CURRENCY_LABELS: Record<string, string> = {
  get USD() { return t('USD — US Dollar', 'USD — 美元'); },
  get EUR() { return t('EUR — Euro', 'EUR — 欧元'); },
  get GBP() { return t('GBP — British Pound', 'GBP — 英镑'); },
  get JPY() { return t('JPY — Japanese Yen', 'JPY — 日元'); },
  get INR() { return t('INR — Indian Rupee', 'INR — 印度卢比'); },
  get CNY() { return t('CNY — Chinese Yuan', 'CNY — 人民币'); },
  get KRW() { return t('KRW — Korean Won', 'KRW — 韩元'); },
  get CAD() { return t('CAD — Canadian Dollar', 'CAD — 加拿大元'); },
  get AUD() { return t('AUD — Australian Dollar', 'AUD — 澳大利亚元'); },
  get SGD() { return t('SGD — Singapore Dollar', 'SGD — 新加坡元'); },
  get BRL() { return t('BRL — Brazilian Real', 'BRL — 巴西雷亚尔'); },
  get CHF() { return t('CHF — Swiss Franc', 'CHF — 瑞士法郎'); },
  get SEK() { return t('SEK — Swedish Krona', 'SEK — 瑞典克朗'); },
};

interface CurrencyPickerProps {
  value?: SupportedCurrency;
  onChange?: (currency: SupportedCurrency) => void;
}

export function CurrencyPicker({ value, onChange }: CurrencyPickerProps) {
  const { t } = useLanguage();
  const [currency, setCurrency] = useState<SupportedCurrency>(() => {
    if (value) return value;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_CURRENCIES as readonly string[]).includes(stored)) {
      return stored as SupportedCurrency;
    }
    return "USD";
  });

  // Sync with external value prop
  useEffect(() => {
    if (value && value !== currency) setCurrency(value);
  }, [value, currency]);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as SupportedCurrency;
    setCurrency(next);
    localStorage.setItem(STORAGE_KEY, next);
    onChange?.(next);
  }

  const rate = getExchangeRate(currency);
  const fetchedAt = getRatesFetchedAt();
  const rateDate = new Date(fetchedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center gap-1.5" title={t(`Rates as of ${rateDate}`, `汇率更新于 ${rateDate}`)}>
      <select
        value={currency}
        onChange={handleChange}
        className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
        aria-label={t('Select display currency', '选择显示货币')}
      >
        {SUPPORTED_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {CURRENCY_LABELS[c] ?? c}
          </option>
        ))}
      </select>
      {currency !== "USD" && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          1 USD = {rate.toLocaleString("en-US", { maximumFractionDigits: 2 })} {currency}
        </span>
      )}
    </div>
  );
}

/**
 * Hook to read/write the persisted currency preference.
 */
export function useCurrency(): [SupportedCurrency, (c: SupportedCurrency) => void] {
  const [currency, setCurrencyState] = useState<SupportedCurrency>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_CURRENCIES as readonly string[]).includes(stored)) {
      return stored as SupportedCurrency;
    }
    return "USD";
  });

  function setCurrency(c: SupportedCurrency) {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  }

  return [currency, setCurrency];
}
