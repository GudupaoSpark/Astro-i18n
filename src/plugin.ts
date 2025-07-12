import type { AstroIntegration } from 'astro';
import type { Locals, AstroI18nOptions } from './types.js';
// 导入 cookie 模块
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

  // 不再在插件初始化时加载语言文件
  // 改为在首次调用翻译器时自动加载
  console.log(`[astro-i18n] 插件初始化完成，语言文件将在首次翻译时自动加载`);
  return {
    name: 'astro-i18n',
    hooks: {
      'astro:build:setup': ({ logger }) => {
        logger?.info('[astro-i18n] 语言文件将在构建过程中按需加载');
      },

      'astro:server:setup': ({ server, logger }) => {
        logger?.info('[astro-i18n] 语言文件将在服务器处理请求时按需加载');
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

            // 强制重新检查可用语言
            const dynamicLangs = getAvailableLanguages();
            console.log(`[astro-i18n] 当前可用语言: ${dynamicLangs.join(', ')}`);

            // 确保至少有英文和中文可用
            const availableLangs = dynamicLangs.length > 0 ?
                                 dynamicLangs :
                                 [fallbackLang]; // 使用回退语言作为最终保障

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
            // 根据配置决定是否启用自动重定向
            if (!isLangInPath && options.autoRedirect === true) { // 只有明确启用才进行重定向
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

            // 设置语言在请求locals中
            // 获取翻译函数
            // 设置语言和翻译函数在请求locals中
            req.locals.lang = lang;
            req.locals.isLangInPath = isLangInPath;
            req.locals.i18n = {
              getAvailableLanguages: () => availableLangs,
              getCurrentLang: () => lang
            };

            next();
        });
      }
    }
  };
}
