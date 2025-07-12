import type { AstroIntegration } from 'astro';
import type { Locals, AstroI18nOptions } from './types.js';
import path from 'path';
import url from 'url';
import fs from 'fs';
import { parse, serialize } from 'cookie';

// ES module equivalent of __dirname
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

declare module 'astro' {
  interface Request {
      url: string;
      locals: Locals;
      headers: Record<string, string>;
  }
}
import { loadLocalesFrom, getTranslator, getAvailableLanguages } from './translator.js';

export function astroI18nPlugin(options: AstroI18nOptions = {}): AstroIntegration {
  const localesDir = options.localesDir ?? 'locales';
  const fallbackLang = options.fallbackLang ?? 'en';
  const components = options.components || {};

  return {
    name: 'astro-i18n',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config, logger }) => {
        logger.info('Plugin initialized, language files will be loaded on first translation request.');
        logger.info('Setting up automatic route detection...');
        
        const pagesDir = path.join(process.cwd(), 'src', 'pages');
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // 創建客戶端語言檢測和重定向處理器
        const languageDetectorContent = `
---
import { getAvailableLanguages } from "${path.resolve(__dirname, './translator.js').replace(/\\/g, '/')}";

const availableLanguages = getAvailableLanguages();
const fallbackLang = "${fallbackLang}";
---

<html>
<head>
  <meta charset="utf-8" />
  <title>語言檢測中...</title>
  <script define:vars={{ availableLanguages, fallbackLang }}>
    // 客戶端語言檢測函數
    function detectLanguage() {
      console.log('[astro-i18n] 開始客戶端語言檢測，可用語言:', availableLanguages.join(', '));
      
      // 1. 檢查 URL 查詢參數
      const urlParams = new URLSearchParams(window.location.search);
      const langParam = urlParams.get('lang');
      if (langParam && availableLanguages.includes(langParam)) {
        console.log('[astro-i18n] 從 URL 參數檢測到語言:', langParam);
        return langParam;
      }

      // 2. 檢查 Cookie
      console.log('[astro-i18n] 當前所有 Cookies:', document.cookie);
      const cookies = {};
      if (document.cookie) {
        document.cookie.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      console.log('[astro-i18n] 解析後的 Cookies:', JSON.stringify(cookies));
      
      const cookieLang = cookies.lang;
      if (cookieLang && availableLanguages.includes(cookieLang)) {
        console.log('[astro-i18n] 從 Cookie 檢測到語言:', cookieLang);
        return cookieLang;
      } else if (cookieLang) {
        console.log('[astro-i18n] Cookie 中的語言無效:', cookieLang, '可用語言:', availableLanguages);
      } else {
        console.log('[astro-i18n] 未找到語言 Cookie');
      }

      // 3. 檢查瀏覽器語言偏好
      const browserLangs = navigator.languages || [navigator.language];
      for (const browserLang of browserLangs) {
        const lang = browserLang.split('-')[0].toLowerCase();
        if (availableLanguages.includes(lang)) {
          console.log('[astro-i18n] 從瀏覽器語言檢測到:', lang);
          return lang;
        }
      }

      // 4. 使用後備語言
      console.log('[astro-i18n] 使用後備語言:', fallbackLang);
      return fallbackLang;
    }

    // 執行語言檢測和重定向
    const detectedLang = detectLanguage();
    
    // 從查詢參數中獲取原始路徑
    const urlParams = new URLSearchParams(window.location.search);
    const redirectPath = urlParams.get('redirect') || '/';
    
    // 移除 redirect 參數，保留其他查詢參數
    urlParams.delete('redirect');
    const remainingQuery = urlParams.toString();
    const queryString = remainingQuery ? '?' + remainingQuery : '';
    
    // 構建目標路徑
    const targetPath = '/' + detectedLang + (redirectPath === '/' ? '' : redirectPath);
    
    console.log('[astro-i18n] 檢測到語言:', detectedLang, '重定向路徑:', redirectPath, '目標路徑:', targetPath);
    
    // 設置語言 Cookie
    document.cookie = \`lang=\${detectedLang}; path=/; max-age=31536000; samesite=lax\`;
    
    // 重定向到語言版本
    window.location.replace(targetPath + queryString);
  </script>
</head>
<body>
  <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
    <p>正在檢測語言偏好...</p>
    <p>Detecting language preference...</p>
  </div>
</body>
</html>
        `;

        const detectorFilePath = path.join(tempDir, 'language-detector.astro');
        fs.writeFileSync(detectorFilePath, languageDetectorContent, 'utf-8');

        if (fs.existsSync(pagesDir)) {
          // 掃描所有頁面文件
          const scanPages = (dir: string, basePath = ''): Array<{path: string, file: string}> => {
            const pages: Array<{path: string, file: string}> = [];
            const entries = fs.readdirSync(dir);
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry);
              const stat = fs.statSync(fullPath);
              
              if (stat.isDirectory()) {
                pages.push(...scanPages(fullPath, path.join(basePath, entry)));
              } else if (entry.endsWith('.astro') && !entry.startsWith('[') && entry !== '404.astro') {
                const pagePath = path.join(basePath, entry.replace('.astro', ''));
                pages.push({
                  path: pagePath === 'index' ? '' : pagePath,
                  file: fullPath
                });
              }
            }
            
            return pages;
          };

          const userPages = scanPages(pagesDir);
          logger.info(`發現頁面: ${userPages.map(p => p.path || 'index').join(', ')}`);

          // 為每個頁面創建兩種路由：
          // 將語言檢測路由注入到一個唯一的、不衝突的內部路徑
          const detectorRoute = '/__i18n_detect_language__';
          injectRoute({
            pattern: detectorRoute,
            entrypoint: url.pathToFileURL(detectorFilePath).toString(),
          });
          logger.info(`注入語言檢測路由: ${detectorRoute}`);


          // 為每個頁面創建語言版本路由（/[lang]/path）
          for (const page of userPages) {
            const langRoute = page.path ? `/[lang]/${page.path}` : '/[lang]';
            
            // 創建語言版本路由
            const langFileName = `lang-${page.path.replace(/\//g, '-') || 'index'}.astro`;
            const langFilePath = path.join(tempDir, langFileName);

            // 讀取原始頁面內容
            const originalContent = fs.readFileSync(page.file, 'utf-8');
            
            // 提取原始頁面的 prerender 導出
            const prerenderMatch = originalContent.match(/export const prerender = (true|false);/);
            const prerenderExport = prerenderMatch ? `export const prerender = ${prerenderMatch[1]};` : '';

            // 計算從臨時文件到原始頁面目錄的相對路徑，用於修正導入路徑
            const originalPageDir = path.dirname(page.file);
            const tempFileDir = path.dirname(langFilePath);
            const relativePathToOriginal = path.relative(tempFileDir, originalPageDir).replace(/\\/g, '/');

            // 創建一個包裝器頁面，它將導入原始頁面並設置語言上下文
            const wrapperContent = `---
import { getStaticPaths as originalGetStaticPaths, getTranslator } from "${path.resolve(__dirname, './translator.js').replace(/\\/g, '/')}";
import OriginalPage from "${relativePathToOriginal}/${path.basename(page.file)}";

${prerenderExport}

export const getStaticPaths = async (context) => {
  if (originalGetStaticPaths) {
    const paths = await originalGetStaticPaths(context);
    return paths.map(p => ({ ...p, params: { ...p.params, lang: p.params?.lang || '' } }));
  }
  return [];
};

const { lang } = Astro.params;
const t = getTranslator(lang);

// 設置語言上下文
Astro.locals.lang = lang;
Astro.locals.t = t;
---

<OriginalPage {...Astro.props} />
`;
            let modifiedContent = wrapperContent;

            fs.writeFileSync(langFilePath, modifiedContent, 'utf-8');

            injectRoute({
              pattern: langRoute,
              entrypoint: url.pathToFileURL(langFilePath).toString(),
            });

            logger.info(`注入語言路由: ${langRoute}`);
          }
        }

        logger.info('Automatic route detection completed.');
      },
      'astro:server:setup': ({ server, logger }) => {
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        logger.info(`Adding temporary directory to Vite watcher: ${tempDir}`);
        server.watcher.add(tempDir);

        // 添加一个 Vite 中间件来处理根路径的重定向
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          const pathname = url.split('?')[0]; // 移除查詢參數
          
          // 跳過靜態資源和特殊路徑
          if (pathname.startsWith('/@') ||
              pathname.startsWith('/__') ||
              pathname.includes('.') ||
              pathname.startsWith('/node_modules')) {
            return next();
          }
          
          // 檢查是否已經有語言前綴 (例如 /en/, /zh/, /jp/)
          const pathParts = pathname.split('/').filter(Boolean);
          const availableLanguages = ['en', 'zh', 'jp']; // 可以從 getAvailableLanguages() 獲取
          
          // 如果第一個路徑段不是已知語言，則重定向到語言檢測器
          if (pathParts.length === 0 || !availableLanguages.includes(pathParts[0])) {
            logger.info(`[astro-i18n] 攔截到無語言前綴的請求: ${pathname}，重定向到語言檢測器`);
            // 將原始路徑作為查詢參數傳遞
            const originalQuery = url.includes('?') ? '&' + url.split('?')[1] : '';
            const redirectUrl = `/__i18n_detect_language__?redirect=${encodeURIComponent(pathname)}${originalQuery}`;
            res.writeHead(302, {
              'Location': redirectUrl,
            });
            res.end();
            return;
          }
          
          next();
        });
      },
      'astro:build:setup': ({ logger }) => {
        logger?.info('语言文件将在构建过程中按需加载');
        const rootDir = process.cwd();
        loadLocalesFrom(rootDir, localesDir, fallbackLang, logger);
      },
      'astro:build:done': ({ logger }) => {
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          logger.info('Cleaned up temporary i18n page directory.');
        }
      }
    }
  };
}
