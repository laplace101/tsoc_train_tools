// 非 React 环境也能使用的翻译工具。
// React 组件请优先用 useLanguage() 返回的 t()，纯数据模块直接 import 这里的 t()。

export type Lang = 'en' | 'cn';

const STORAGE_KEY = 'llmcalc-lang';

/** 首次访问（没有本地偏好）时使用的语言。 */
export const DEFAULT_LANG: Lang = 'cn';

function readStoredLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'cn') return stored;
  } catch {
    // localStorage 不可用（例如隐私模式），回退到默认语言
  }
  return DEFAULT_LANG;
}

let currentLang: Lang = typeof window === 'undefined' ? DEFAULT_LANG : readStoredLang();

export function getLang(): Lang {
  return currentLang;
}

/** 设置当前语言并持久化，React 层的 LanguageProvider 会同步调用它。 */
export function setCurrentLang(lang: Lang): void {
  currentLang = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 忽略写入失败
  }
}

/** 按当前语言返回对应文案：英文返回 en，中文返回 cn。 */
export function t(en: string, cn: string): string {
  return currentLang === 'en' ? en : cn;
}
