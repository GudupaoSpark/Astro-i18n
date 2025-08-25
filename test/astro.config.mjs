// @ts-check
import { defineConfig } from 'astro/config';
import { astroI18nPlugin } from '../src/plugin.js';
import react from "@astrojs/react";
import vue from "@astrojs/vue";

// https://astro.build/config
export default defineConfig({
  base: '/', // Set base URL to root
  integrations: [
    react(),
    vue(),
    // 配置帶路徑的多語言模式 (默認)
    astroI18nPlugin({
      localesDir: './locales',  // 顯式指定完整路徑
      fallbackLang: 'en',
      autoDetectLanguage: true  // 啟用瀏覽器語言自動檢測
    }),
  ]
});
