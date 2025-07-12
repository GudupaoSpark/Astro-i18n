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

// Create client-side language detection and redirection processor
        const languageDetectorContent = `
---
import { getAvailableLanguages } from "${path.resolve(__dirname, './translator.js').replace(/\\/g, '/')}";

const availableLanguages = getAvailableLanguages();
const fallbackLang = "${fallbackLang}";
---

<html>
<head>
  <meta charset="utf-8" />
  <title>Language detection in progress...</title>
  <script define:vars={{ availableLanguages, fallbackLang }}>
    // Client-side language detection function
    function detectLanguage() {
      console.log('[astro-i18n] Starting client-side language detection, available languages:', availableLanguages.join(', '));
      
      // 1. Check URL query parameter
      const urlParams = new URLSearchParams(window.location.search);
      const langParam = urlParams.get('lang');
      if (langParam && availableLanguages.includes(langParam)) {
        console.log('[astro-i18n] Language detected from URL parameter:', langParam);
        return langParam;
      }

      // 2. Check Cookie
      console.log('[astro-i18n] All current Cookies:', document.cookie);
      const cookies = {};
      if (document.cookie) {
        document.cookie.split(';').forEach(cookie => {
          const parts = cookie.trim().split('=');
          if (parts.length === 2) {
            cookies[parts[0]] = decodeURIComponent(parts[1]);
          }
        });
      }
      console.log('[astro-i18n] Parsed Cookies:', JSON.stringify(cookies));
      
      const cookieLang = cookies.lang;
      if (cookieLang && availableLanguages.includes(cookieLang)) {
        console.log('[astro-i18n] Language detected from Cookie:', cookieLang);
        return cookieLang;
      } else if (cookieLang) {
        console.log('[astro-i18n] Invalid language in Cookie:', cookieLang, 'Available languages:', availableLanguages);
      } else {
        console.log('[astro-i18n] No language Cookie found');
      }

      // 3. Check browser language preference
      const browserLangs = navigator.languages || [navigator.language];
      for (const browserLang of browserLangs) {
        const lang = browserLang.split('-')[0].toLowerCase();
        if (availableLanguages.includes(lang)) {
          console.log('[astro-i18n] Detected from browser language:', lang);
          return lang;
        }
      }

      // 4. Use fallback language
      console.log('[astro-i18n] Using fallback language:', fallbackLang);
      return fallbackLang;
    }

    // Execute language detection and redirection
    const detectedLang = detectLanguage();
    
    // Get original path from query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const redirectPath = urlParams.get('redirect') || '/';
    
    // Remove redirect parameter, keep other query parameters
    urlParams.delete('redirect');
    const remainingQuery = urlParams.toString();
    const queryString = remainingQuery ? '?' + remainingQuery : '';
    
    // Construct target path
    const targetPath = '/' + detectedLang + (redirectPath === '/' ? '' : redirectPath);
    
    console.log('[astro-i18n] Detected language:', detectedLang, 'Redirect path:', redirectPath, 'Target path:', targetPath);
    
    // Set language Cookie
    document.cookie = \`lang=\${detectedLang}; path=/; max-age=31536000; samesite=lax\`;
    
    // Redirect to language version
    window.location.replace(targetPath + queryString);
  </script>
</head>
<body>
  <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
    <p>Detecting language preference...</p>
    <p>Detecting language preference...</p>
  </div>
</body>
</html>
        `;

        const detectorFilePath = path.join(tempDir, 'language-detector.astro');
        fs.writeFileSync(detectorFilePath, languageDetectorContent, 'utf-8');

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
          logger.info(`Found pages: ${userPages.map(p => p.path || 'index').join(', ')}`);

          // Create two routes for each page:
          // Inject the language detection route into a unique, non-conflicting internal path
          const detectorRoute = '/__i18n_detect_language__';
          injectRoute({
            pattern: detectorRoute,
            entrypoint: url.pathToFileURL(detectorFilePath).toString(),
          });
          logger.info(`Injected language detection route: ${detectorRoute}`);


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
        const tempDir = path.join(process.cwd(), 'node_modules', '.astro-i18n-temp');
        logger.info(`Adding temporary directory to Vite watcher: ${tempDir}`);
        server.watcher.add(tempDir);

        // Add a Vite middleware to handle root path redirection
        server.middlewares.use((req, res, next) => {
          const url = req.url || '';
          const pathname = url.split('?')[0]; // Remove query parameters
          
          // Skip static assets and special paths
          if (pathname.startsWith('/@') ||
              pathname.startsWith('/__') ||
              pathname.includes('.') ||
              pathname.startsWith('/node_modules')) {
            return next();
          }
          
          // Check if there is already a language prefix (e.g., /en/, /zh/, /jp/)
          const pathParts = pathname.split('/').filter(Boolean);
          const availableLanguages = ['en', 'zh', 'jp']; // Can be obtained from getAvailableLanguages()
          
          // If the first path segment is not a known language, redirect to the language detector
          if (pathParts.length === 0 || !availableLanguages.includes(pathParts[0])) {
            logger.info(`[astro-i18n] Intercepted request without language prefix: ${pathname}, redirecting to language detector`);
            // Pass the original path as a query parameter
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
        logger?.info('Language files will be loaded on demand during build process');
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
