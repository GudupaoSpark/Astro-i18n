import type { AstroIntegration, AstroConfig } from 'astro';
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
  const pathBasedRouting = options.pathBasedRouting ?? true; // Default to true to maintain backward compatibility
  const autoDetectLanguage = options.autoDetectLanguage ?? true; // Default to true to maintain backward compatibility
  const components = options.components || {};

  let userPages: Array<{path: string, file: string}> = [];
  let astroConfig: AstroConfig;

  function createRedirectHtml(availableLanguages: string[], fallbackLang: string, autoDetectLanguage: boolean): string {
    const clientLanguageDetector = `
      function detectLanguage(availableLanguages, fallbackLang, autoDetectLanguage) {
        const urlParams = new URLSearchParams(window.location.search);
        const langParam = urlParams.get('lang');
        if (langParam && availableLanguages.includes(langParam)) return langParam;

        const cookies = {};
        if (document.cookie) {
          document.cookie.split(';').forEach(cookie => {
            const parts = cookie.trim().split('=');
            if (parts.length === 2) cookies[parts[0]] = decodeURIComponent(parts[1]);
          });
        }
        const cookieLang = cookies.lang;
        if (cookieLang && availableLanguages.includes(cookieLang)) return cookieLang;

        // 如果啟用了自動檢測語言，則檢測瀏覽器語言
        if (autoDetectLanguage) {
          const browserLangs = navigator.languages || [navigator.language];
          for (const browserLang of browserLangs) {
            const lang = browserLang.split('-')[0].toLowerCase();
            if (availableLanguages.includes(lang)) return lang;
          }
        }
        
        // 如果沒有匹配到瀏覽器語言或未啟用自動檢測，則使用 fallbackLang
        return fallbackLang;
      }
    `;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Redirecting...</title>
  <script>
    (function() {
      const availableLanguages = ${JSON.stringify(availableLanguages)};
      const fallbackLang = "${fallbackLang}";
      const autoDetectLanguage = ${autoDetectLanguage};
      ${clientLanguageDetector}
      const detectedLang = detectLanguage(availableLanguages, fallbackLang, autoDetectLanguage);
      const pathName = window.location.pathname;
      const search = window.location.search;
      document.cookie = \`lang=\${detectedLang}; path=/; max-age=31536000; samesite=lax\`;
      const targetPath = '/' + detectedLang + (pathName === '/' ? '' : pathName);
      const redirectUrl = targetPath + search;
      window.location.replace(redirectUrl);
    })();
  </script>
</head>
<body>
  <p>Redirecting to your preferred language...</p>
</body>
</html>`;
  }

  return {
    name: 'astro-i18n',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config, logger }) => {
        astroConfig = config;
        logger.info('Plugin initialized, language files will be loaded on first translation request.');
        logger.info('Setting up automatic route detection...');
        
        // Only setup automatic route detection if path-based routing is enabled
        if (!pathBasedRouting) {
          logger.info('Path-based routing is disabled, skipping automatic route detection.');
          return;
        }
        
        const pagesDir = path.join(url.fileURLToPath(config.srcDir), 'pages');
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        if (fs.existsSync(pagesDir)) {
          // Scan all page files
          const scanPages = (dir: string, basePath = ''): Array<{path: string, file: string}> => {
            const pages: Array<{path: string, file: string}> = [];
            const entries = fs.readdirSync(dir);
            
            for (const entry of entries) {
              const fullPath = path.join(dir, entry);
              const stat = fs.statSync(fullPath);
              
              if (stat.isDirectory()) {
                pages.push(...scanPages(fullPath, path.join(basePath, entry)));
              } else if (entry.endsWith('.astro') && !entry.endsWith('.ni.astro') && !entry.startsWith('[') && entry !== '404.astro') {
                const pagePath = path.join(basePath, entry.replace('.astro', ''));
                pages.push({
                  path: pagePath === 'index' ? '' : pagePath,
                  file: fullPath
                });
              }
            }
            
            return pages;
          };

          userPages = scanPages(pagesDir);
          logger.info(`Found pages: ${userPages.map(p => p.path || 'index').join(', ')}`);

          // Create language version routes for each page (/[lang]/path)
          for (const page of userPages) {
            const langRoute = page.path ? `/[lang]/${page.path}` : '/[lang]';
            
            // Create language version route
            const langFileName = `lang-${page.path.replace(/\//g, '-') || 'index'}.astro`;
            const langFilePath = path.join(tempDir, langFileName);

            // Read original page content
            const originalContent = fs.readFileSync(page.file, 'utf-8');
            
            // Extract prerender export from the original page
            const prerenderMatch = originalContent.match(/export const prerender = (true|false);/);
            const prerenderExport = prerenderMatch ? `export const prerender = ${prerenderMatch[1]};` : '';

            // Calculate relative path from temp file to original page directory for import path correction
            const originalPageDir = path.dirname(page.file);
            const tempFileDir = path.dirname(langFilePath);
            const relativePathToOriginal = path.relative(tempFileDir, originalPageDir).replace(/\\/g, '/');

            // Create a wrapper page that imports the original page and sets the language context
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

// Set language context
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

            logger.info(`Injected language route: ${langRoute}`);
          }
        }

        logger.info('Automatic route detection completed.');
      },
      'astro:server:setup': ({ server, logger }) => {
        // Only setup middleware if path-based routing is enabled
        if (!pathBasedRouting) {
          logger.info('Path-based routing is disabled, skipping root path redirection middleware.');
          return;
        }
        
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        logger.info(`Adding temporary directory to Vite watcher: ${tempDir}`);
        server.watcher.add(tempDir);

        // Add a Vite middleware to handle root path redirection
        server.middlewares.use((req, res, next) => {
          const reqUrl = req.url || '';
          const pathname = reqUrl.split('?')[0];

          if (pathname.startsWith('/@') || pathname.startsWith('/__') || pathname.includes('.') || pathname.startsWith('/node_modules')) {
            return next();
          }

          const pathParts = pathname.split('/').filter(Boolean);
          const availableLanguages = getAvailableLanguages();

          if (pathParts.length > 0 && availableLanguages.includes(pathParts[0])) {
            return next();
          }
          
          logger.info(`[astro-i18n] Intercepted request without language prefix: ${pathname}, serving language detector`);

          const redirectContent = createRedirectHtml(availableLanguages, fallbackLang, autoDetectLanguage);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(redirectContent);
        });
      },
      'astro:build:setup': ({ logger }) => {
        logger?.info('Language files will be loaded on demand during build process');
        const rootDir = process.cwd();
        loadLocalesFrom(rootDir, localesDir, fallbackLang, logger);
      },
      'astro:build:done': ({ dir, logger }) => {
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
          logger.info('Cleaned up temporary i18n page directory.');
        }

        const destDir = url.fileURLToPath(dir);

        // Only create redirect pages if path-based routing is enabled
        if (pathBasedRouting) {
          logger.info('Creating root redirect pages for static build...');
  // Handle 404 page
          logger.info('Ensuring 404.html is correctly placed...');
          const astro404Path = path.join(destDir, '404.html');

          if (fs.existsSync(astro404Path)) {
              logger.info('Verified: 404.html found in build output.');
          } else {
              const nested404Path = path.join(destDir, '404', 'index.html');
              if (fs.existsSync(nested404Path)) {
                  fs.renameSync(nested404Path, astro404Path);
                  try {
                      fs.rmdirSync(path.join(destDir, '404'));
                  } catch (e) {
                      // Ignore error if directory is not empty for some reason
                  }
                  logger.info('Moved /404/index.html to /404.html.');
              } else {
                  logger.info('No 404.astro page found or built. Skipping 404 page handling.');
              }
          }
          const availableLanguages = getAvailableLanguages();

          if (availableLanguages.length === 0) {
            logger.info('No languages found, skipping redirect page generation.');
            return;
          }

          const redirectContent = createRedirectHtml(availableLanguages, fallbackLang, autoDetectLanguage);

          for (const page of userPages) {
            const firstPart = page.path.split('/')[0];
            if (availableLanguages.includes(firstPart)) {
              continue;
            }

            const pagePath = page.path === '' ? 'index.html' : path.join(page.path, 'index.html');
            const filePath = path.join(destDir, pagePath);
            
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            
            fs.writeFileSync(filePath, redirectContent, 'utf-8');
            logger.info(`Created redirect page: /${page.path || ''} -> ${filePath.replace(destDir, '')}`);
          }
          logger.info('Redirect pages created.');
        }

        // Cleanup .ni files after build to avoid duplicates.
        const cleanupNiFiles = (currentDir: string) => {
          // First, recurse into subdirectories.
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              cleanupNiFiles(path.join(currentDir, entry.name));
            }
          }
          
          // Then, process files and directories in the current directory.
          // This post-order traversal ensures we handle contents before their parent directories.
          const currentEntries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of currentEntries) {
            if (entry.name.includes('.ni')) {
              const oldPath = path.join(currentDir, entry.name);
              const newName = entry.name.replace(/\.ni/g, '');
              const newPath = path.join(currentDir, newName);

              if (fs.existsSync(newPath)) {
                // If the non-.ni version already exists, the .ni version is a duplicate. Remove it.
                fs.rmSync(oldPath, { recursive: true, force: true });
                logger.info(`Removed duplicate .ni path: ${oldPath}`);
              } else {
                // Otherwise, just rename it.
                fs.renameSync(oldPath, newPath);
                logger.info(`Renamed ${oldPath} to ${newPath}`);
              }
            }
          }
        };

        logger.info('Cleaning up .ni files...');
        cleanupNiFiles(destDir);
        logger.info('Finished cleaning up .ni files.');
      }
    }
  };
}
