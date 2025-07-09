// @ts-check
import { defineConfig } from 'astro/config';
import { astroI18nPlugin } from '../src/plugin.ts';
// https://astro.build/config
export default defineConfig({
    integrations: [
    astroI18nPlugin({
      localesDir: 'locales',     // 根目錄下語言資料夾
      fallbackLang: 'en'
    })
  ]
});
