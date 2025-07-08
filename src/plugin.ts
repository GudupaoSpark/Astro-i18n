import type { AstroIntegration } from 'astro';
import type { Request } from 'astro';
import type { Locals } from './types.js';
export interface RequestLocals {
  t: (key: string) => string;
  lang?: string;
}

declare module 'astro' {
  interface Request {
    locals: RequestLocals;
    headers: Record<string, string>;
  }
}
import { loadLocalesFrom, getTranslator } from './translator.js';

interface AstroI18nOptions {
  localesDir?: string;       // 默認為 "locales"
  fallbackLang?: string;     // 默認為 "en"
}

export function astroI18nPlugin(options: AstroI18nOptions = {}): AstroIntegration {
  const localesDir = options.localesDir ?? 'locales';
  const fallbackLang = options.fallbackLang ?? 'en';

  return {
    name: 'astro-i18n',
    hooks: {
      'astro:config:setup': ({ config }) => {
        const rootPath = config.root.pathname;
        if (rootPath) {
          loadLocalesFrom(rootPath, localesDir, fallbackLang);
        }
      },

      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req: Request, res, next) => {
          console.log('astro-i18n middleware running');
          const cookies = parseCookies(req.headers.cookie || '');
          const cookieLang = cookies.lang;
          const acceptLang = req.headers['accept-language'] || '';
          const autoLang = acceptLang.split(',')[0].split('-')[0];

          const lang = cookieLang || autoLang || fallbackLang;
          const t = getTranslator(lang);

          req.locals = { ...(req.locals ?? {}), lang, t };
          next();
        });
      }
    }
  };
}

function parseCookies(cookieString: string) {
  const cookies: Record<string, string> = {};
  if (!cookieString) return cookies;

  cookieString.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    if (name) cookies[name] = value || '';
  });

  return cookies;
}
