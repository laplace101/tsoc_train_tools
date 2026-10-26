import * as React from 'react';
import { getLang, setCurrentLang, type Lang } from '@/lib/i18n';

export type { Lang };

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (en: string, cn: string) => string;
}

const LanguageContext = React.createContext<LanguageContextValue>({
  lang: getLang(),
  setLang: () => {},
  t: (en) => en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(getLang);

  // Persist the choice so it survives a refresh, and keep the non-React
  // translation helper (src/lib/i18n.ts) in sync with it.
  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    setCurrentLang(next);
  }, []);

  const value = React.useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t: (en: string, cn: string) => (lang === 'en' ? en : cn),
    }),
    [lang, setLang]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return React.useContext(LanguageContext);
}
