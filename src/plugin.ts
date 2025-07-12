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

  console.log(`[astro-i18n] 插件初始化完成，语言文件将在首次翻译时自动加载`);
  return {
    name: 'astro-i18n',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config, logger }) => {
        logger.info('[astro-i18n] Setting up automatic route detection...');
        
        // 自動掃描 src/pages 目錄，為每個頁面生成語言路由
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
    const currentPath = window.location.pathname;
    const targetPath = '/' + detectedLang + (currentPath === '/' ? '' : currentPath);
    
    console.log('[astro-i18n] 檢測到語言:', detectedLang, '當前路徑:', currentPath, '目標路徑:', targetPath);
    
    // 設置語言 Cookie
    document.cookie = \`lang=\${detectedLang}; path=/; max-age=31536000; samesite=lax\`;
    
    // 重定向到語言版本
    window.location.replace(targetPath + window.location.search);
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
          logger.info(`[astro-i18n] 發現頁面: ${userPages.map(p => p.path || 'index').join(', ')}`);

          // 為每個頁面創建兩種路由：
          // 1. 語言檢測重定向路由（原始路徑）
          // 2. 語言版本路由（/[lang]/path）
          for (const page of userPages) {
            const originalRoute = page.path ? `/${page.path}` : '/';
            const langRoute = page.path ? `/[lang]/${page.path}` : '/[lang]';
            
            // 1. 創建語言檢測重定向路由
            const redirectFileName = `redirect-${page.path.replace(/\//g, '-') || 'index'}.astro`;
            const redirectFilePath = path.join(tempDir, redirectFileName);
            
            fs.writeFileSync(redirectFilePath, languageDetectorContent, 'utf-8');
            
            injectRoute({
              pattern: originalRoute,
              entrypoint: url.pathToFileURL(redirectFilePath).toString(),
            });
            
            logger.info(`[astro-i18n] 注入重定向路由: ${originalRoute} -> 語言檢測`);
            
            // 2. 創建語言版本路由
            const langFileName = `lang-${page.path.replace(/\//g, '-') || 'index'}.astro`;
            const langFilePath = path.join(tempDir, langFileName);

            // 讀取原始頁面內容
            const originalContent = fs.readFileSync(page.file, 'utf-8');
            
            // 智能修改原始頁面，添加語言支持
            let modifiedContent = originalContent;
            
            // 計算從臨時文件到原始頁面目錄的相對路徑，用於修正導入路徑
            const originalPageDir = path.dirname(page.file);
            const tempFileDir = path.dirname(langFilePath);
            const relativePathToOriginal = path.relative(tempFileDir, originalPageDir);
            
            // 修正所有相對導入路徑
            modifiedContent = modifiedContent.replace(
              /import\s+.*?\s+from\s+['"](\.\.[^'"]*)['"]/g,
              (match, importPath) => {
                const correctedPath = path.posix.join(relativePathToOriginal, importPath).replace(/\\/g, '/');
                return match.replace(importPath, correctedPath);
              }
            );
            
            // 檢查是否已經有 frontmatter
            const frontmatterMatch = modifiedContent.match(/^---\s*\n([\s\S]*?)\n---/);
            
            if (frontmatterMatch) {
              const existingFrontmatter = frontmatterMatch[1];
              
              // 檢查是否已經導入了我們需要的函數
              const hasGetStaticPaths = existingFrontmatter.includes('getStaticPaths');
              const hasGetTranslator = existingFrontmatter.includes('getTranslator');
              
              // 檢查是否已經定義了 lang 和 t 變數
              const hasLangVar = existingFrontmatter.includes('const lang') || existingFrontmatter.includes('let lang');
              const hasTVar = existingFrontmatter.includes('const t') || existingFrontmatter.includes('let t');
              
              let newImports = '';
              let newVars = '';
              
              // 添加必要的導入
              if (!hasGetStaticPaths || !hasGetTranslator) {
                const imports = [];
                if (!hasGetStaticPaths) imports.push('getStaticPaths');
                if (!hasGetTranslator) imports.push('getTranslator');
                newImports = `import { ${imports.join(', ')} } from "${path.resolve(__dirname, './translator.js').replace(/\\/g, '/')}";\n`;
              }
              
              // 添加 getStaticPaths 導出
              if (!hasGetStaticPaths) {
                newImports += 'export { getStaticPaths };\n';
              }
              
              // 先處理現有的變數定義
              let updatedFrontmatter = existingFrontmatter;
              
              if (hasLangVar) {
                // 替換現有的 lang 定義
                updatedFrontmatter = updatedFrontmatter.replace(
                  /const lang = ['"][^'"]*['"];?/g,
                  'const { lang } = Astro.params;'
                );
              } else {
                // 添加新的 lang 變數
                newVars += 'const { lang } = Astro.params;\n';
              }
              
              if (hasTVar) {
                // 替換現有的 t 定義
                updatedFrontmatter = updatedFrontmatter.replace(
                  /const t = getTranslator\(['"][^'"]*['"]\);?/g,
                  'const t = getTranslator(lang);'
                );
              } else {
                // 添加新的 t 變數
                newVars += 'const t = getTranslator(lang);\n';
              }
              
              // 插入新的導入和變數到 frontmatter 開始處，但語言上下文設置要放在最後
              const newFrontmatter = newImports + newVars + updatedFrontmatter + '\n// 設置語言上下文\nAstro.locals.lang = lang;\nAstro.locals.t = t;\n';
              modifiedContent = modifiedContent.replace(
                /^---\s*\n[\s\S]*?\n---/,
                `---\n${newFrontmatter}\n---`
              );
            } else {
              // 如果沒有 frontmatter，創建一個新的
              const newFrontmatter = `---
import { getStaticPaths, getTranslator } from "${path.resolve(__dirname, './translator.js').replace(/\\/g, '/')}";

export { getStaticPaths };

const { lang } = Astro.params;
const t = getTranslator(lang);

// 設置語言上下文
Astro.locals.lang = lang;
Astro.locals.t = t;
---

`;
              modifiedContent = newFrontmatter + modifiedContent;
            }

            fs.writeFileSync(langFilePath, modifiedContent, 'utf-8');

            injectRoute({
              pattern: langRoute,
              entrypoint: url.pathToFileURL(langFilePath).toString(),
            });

            logger.info(`[astro-i18n] 注入語言路由: ${langRoute}`);
          }
        }

        logger.info('[astro-i18n] Automatic route detection completed.');
      },
      'astro:build:setup': ({ logger }) => {
        logger?.info('[astro-i18n] 语言文件将在构建过程中按需加载');
        const rootDir = process.cwd();
        loadLocalesFrom(rootDir, localesDir, fallbackLang, logger);
      },
      'astro:build:done': ({ logger }) => {
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          logger.info('[astro-i18n] Cleaned up temporary i18n page directory.');
        }
      }
    }
  };
}
