export type LocaleMap = Record<string, string>;
export type Translations = Record<string, any>;

export interface I18nHelper {
  getAvailableLanguages: () => string[];
  getCurrentLang: () => string;
}

export interface Locals {
  lang: string;
  isLangInPath: boolean;
  i18n?: I18nHelper;
}

export interface AstroI18nOptions {
  /** Whether to automatically redirect to the language URL, defaults to true */
  autoRedirect?: boolean;
  /** Whether to use path-based routing (e.g., /en/page), defaults to true */
  pathBasedRouting?: boolean;
  localesDir?: string;       // Defaults to "locales"
  fallbackLang?: string;     // Defaults to "en"
  components?: {
    Layout?: string;
    LanguageSwitcher?: string;
    TestAstro?: string;
    TestReact?: string;
  };
}