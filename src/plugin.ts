import type { AstroIntegration } from 'astro';
import type { Request } from 'astro';
import type { Locals, AstroI18nOptions } from './types.js';
// 导入 cookie 模块
import { parse, serialize } from 'cookie';
import path from 'path';

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

  // 立即加载语言文件，确保翻译缓存在插件初始化时就可用
  console.log(`[astro-i18n] 插件初始化中，尝试加载语言文件...`);
  loadLocalesFrom(process.cwd(), localesDir, fallbackLang, console);

  // 验证语言文件是否成功加载
  const availableLangs = getAvailableLanguages();
  if (availableLangs.length > 0) {
    console.log(`[astro-i18n] 已成功加载以下语言: ${availableLangs.join(', ')}`);
  } else {
    console.warn(`[astro-i18n] 警告：未能加载任何语言文件，将使用硬编码翻译`);
  }

  return {
    name: 'astro-i18n',
    hooks: {
      'astro:build:setup': ({ logger }) => {
        // 在编译时确认语言文件已加载，如果需要重新加载则执行
        if (getAvailableLanguages().length === 0) {
          logger?.info('[astro-i18n] 在构建过程中加载语言文件');
          loadLocalesFrom(process.cwd(), localesDir, fallbackLang, logger);
        } else {
          logger?.info('[astro-i18n] 语言文件已加载，无需重复加载');
        }
      },

      'astro:server:setup': ({ server, logger }) => {
        // 在服务器启动时确认语言文件已加载，如果需要重新加载则执行
        if (getAvailableLanguages().length === 0) {
          logger?.info('[astro-i18n] 在服务器启动时加载语言文件');
          loadLocalesFrom(process.cwd(), localesDir, fallbackLang, logger);
        } else {
          logger?.info('[astro-i18n] 语言文件已加载，无需重复加载');
        }
        
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

            // 获取翻译函数并进行测试调用
            const t = getTranslator(lang);
            console.log(`[astro-i18n] 翻译器测试 - hello: ${t('hello')}`);

            // 设置语言在请求locals中
            req.locals = { 
              lang, 
              t,
              isLangInPath,
              i18n: {
                // 提供一些额外工具函数
                getAvailableLanguages: () => availableLangs,
                getCurrentLang: () => lang
              }
            };

            next();
        });
      }
    }
  };
}