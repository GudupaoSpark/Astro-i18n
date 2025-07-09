import type { AstroIntegration } from 'astro';
import type { Request } from 'astro';
import type { Locals, AstroI18nOptions } from './types.js';
// 導入 cookie 模塊
import { parse, serialize } from 'cookie';

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

  // 加載語言文件
  loadLocalesFrom(process.cwd(), localesDir, fallbackLang);

  return {
    name: 'astro-i18n',
    hooks: {
      'astro:build:setup': ({ logger }) => {
        // 構建前檢查語言文件是否已加載
        if (Object.keys(getAvailableLanguages()).length === 0) {
          logger.warn('未找到任何語言文件。翻譯功能可能無法正常工作。');
        } else {
          logger.info(`已加載 ${getAvailableLanguages().length} 種語言: ${getAvailableLanguages().join(', ')}`);
        }
      },

      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req: any, res, next) => {
            console.log(`[astro-i18n] 处理请求: ${req.url}`);

            // 解析 cookie
            const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
            const cookieLang = typeof cookies.lang === 'string' ? cookies.lang : undefined;

            // 解析Accept-Language头
            const acceptLang = typeof req.headers['accept-language'] === 'string' ? req.headers['accept-language'] : '';
            const autoLang = acceptLang.split(',')[0].split('-')[0];

            // 从URL路径中提取语言代码
            const host = typeof req.headers.host === 'string' ? req.headers.host : 'localhost';
            const url = new URL(req.url, `http://${host}`);
            const pathSegments = url.pathname.split('/');

            // 检查第一个路径段是否是有效的语言代码
            const firstSegment = pathSegments[1] || '';
            // 从翻译缓存获取可用语言，如果为空则使用默认语言列表
            const dynamicLangs = getAvailableLanguages();
            const availableLangs = dynamicLangs.length > 0 ? 
                                 dynamicLangs : 
                                 ['en', 'zh']; // 简化支持的语言列表

            let lang = fallbackLang;
            let isLangInPath = false;

            if (availableLangs.includes(firstSegment)) {
              lang = firstSegment;
              isLangInPath = true;
              console.log(`[astro-i18n] 从URL路径检测到语言: ${lang}`);
            } else if (cookieLang && availableLangs.includes(cookieLang)) {
              lang = cookieLang;
              console.log(`[astro-i18n] 从Cookie检测到语言: ${lang}`);
            } else if (autoLang && availableLangs.includes(autoLang)) {
              lang = autoLang;
              console.log(`[astro-i18n] 从Accept-Language检测到语言: ${lang}`);
            } else {
              console.log(`[astro-i18n] 使用默认语言: ${lang}`);
            }

            // 自动导向到语言URL路径
            // 根據配置決定是否啟用自動重定向
            if (!isLangInPath && options.autoRedirect === true) { // 只有明確啟用才進行重定向
              // 获取当前URL和查询参数
              const pathname = url.pathname || '/';
              const search = url.search || '';

              // 构建重定向URL
              const redirectUrl = `/${lang}${pathname === '/' ? '' : pathname}${search}`;
              console.log(`[astro-i18n] 自动导向到语言URL: ${redirectUrl}`);

              // 设置cookie并重定向
              const cookieOptions = { 
                path: '/', 
                maxAge: 31536000 // 1年有效期
              };
              res.writeHead(302, {
                'Location': redirectUrl,
                'Set-Cookie': serialize('lang', lang, cookieOptions)
              });
              res.end();
              return;
            }

            // 获取翻译函数
            const t = getTranslator(lang);

            // 设置语言在请求locals中
            req.locals = { 
              lang, 
              t,
              isLangInPath
            };

            next();
        });
      }
    }
  };
}

// 不再需要自定義的 parseCookies 函數，使用 cookie 包的 parse 方法
