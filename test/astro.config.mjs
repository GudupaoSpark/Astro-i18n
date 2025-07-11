  // @ts-check
  import { defineConfig } from 'astro/config';
  import { astroI18nPlugin } from '../src/plugin.js';
  import path from 'path';

  // 獲取當前工作目錄
  const cwd = process.cwd();
  console.log(`當前工作目錄: ${cwd}`);

  // 計算正確的語言文件路徑
  const localesPath = path.resolve(cwd, 'test/locales');
  console.log(`語言文件路徑: ${localesPath}`);

  // https://astro.build/config
  export default defineConfig({
      base: '/', // Set base URL to root
      integrations: [
      astroI18nPlugin({
          localesDir: 'test/locales',  // 顯式指定完整路徑
          fallbackLang: 'en'
      })
    ]
  });
