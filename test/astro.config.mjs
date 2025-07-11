// @ts-check
import { defineConfig } from 'astro/config';
import { astroI18nPlugin } from '../src/plugin.js';
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  base: '/', // Set base URL to root
  integrations: [
    react(),
    astroI18nPlugin({
      localesDir: './locales',  // 顯式指定完整路徑
      fallbackLang: 'en'
    })
  ]
});
