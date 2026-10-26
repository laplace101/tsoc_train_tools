import * as React from 'react';

export type Lang = 'en' | 'cn';

const STORAGE_KEY = 'llmcalc-lang';

function getInitialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'cn') return stored;
  } catch {
    // localStorage unavailable (e.g. private mode); fall through to default
  }
  return 'en';
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (en: string, cn: string) => string;
}

const LanguageContext = React.createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (en) => en,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = React.useState<Lang>(getInitialLang);

  // Persist the choice so it survives a refresh.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore write failures
    }
  }, [lang]);

  const value = React.useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      t: (en: string, cn: string) => (lang === 'en' ? en : cn),
    }),
    [lang]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return React.useContext(LanguageContext);
}
