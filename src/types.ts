export type LocaleMap = Record<string, string>;
export interface Locals {
  lang: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLangInPath: boolean;
}

export interface I18nHelper {
  getAvailableLanguages: () => string[];
  getCurrentLang: () => string;
}

export interface Locals {
  lang: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLangInPath: boolean;
  i18n?: I18nHelper;
}

export interface AstroI18nOptions {
  /** 是否自动重定向到语言URL，默认为true */
  autoRedirect?: boolean;
  localesDir?: string;       // 默認為 "locales"
  fallbackLang?: string;     // 默認為 "en"
}