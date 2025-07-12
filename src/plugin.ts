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

          // 為每個頁面創建語言路由
          for (const page of userPages) {
            const routePattern = page.path ? `/[lang]/${page.path}` : '/[lang]';
            const tempFileName = `lang-${page.path.replace(/\//g, '-') || 'index'}.astro`;
            const tempFilePath = path.join(tempDir, tempFileName);

            // 讀取原始頁面內容
            const originalContent = fs.readFileSync(page.file, 'utf-8');
            
            // 智能修改原始頁面，添加語言支持
            let modifiedContent = originalContent;
            
            // 計算從臨時文件到原始頁面目錄的相對路徑，用於修正導入路徑
            const originalPageDir = path.dirname(page.file);
            const tempFileDir = path.dirname(tempFilePath);
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

            fs.writeFileSync(tempFilePath, modifiedContent, 'utf-8');

            injectRoute({
              pattern: routePattern,
              entrypoint: url.pathToFileURL(tempFilePath).toString(),
            });

            logger.info(`[astro-i18n] 注入路由: ${routePattern}`);
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
