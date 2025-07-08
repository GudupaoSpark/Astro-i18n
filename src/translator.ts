// import path from 'path';

let localesCache: Record<string, Record<string, string>> = {};
let fallbackLang = 'en';

import path from 'path';
import { fileURLToPath } from 'url';

export async function loadLocalesFrom(rootDir: string, dir = 'locales', fallback = 'en') {
  fallbackLang = fallback;
  const localeDir = path.join(rootDir, dir);

  try {
    const globbedFiles = import.meta.glob('./locales/*.json', { eager: true });

    for (const filePath in globbedFiles) {
      const lang = path.basename(filePath, '.json');
      try {
        const json = globbedFiles[filePath];
        localesCache[lang] = json;
      } catch (e) {
        console.warn(`[astro-i18n] 語言檔 ${filePath} 載入失敗：`, e);
      }
    }
  } catch (e) {
    console.warn(`[astro-i18n] 語言資料夾不存在：${localeDir}`);
  }
}

export function getTranslator(lang: string): (key: string) => string {
  const dict = localesCache[lang] ?? {};
  const fallbackDict = localesCache[fallbackLang] ?? {};

  return (key: string) => {
    return dict[key] ?? fallbackDict[key] ?? key;
  };
}
