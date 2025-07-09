export type LocaleMap = Record<string, string>;
export interface Locals {
  lang: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLangInPath: boolean;
}

export interface AstroI18nOptions {
  /** 是否自动重定向到语言URL，默认为true */
  autoRedirect?: boolean;
  localesDir?: string;       // 默認為 "locales"
  fallbackLang?: string;     // 默認為 "en"
}