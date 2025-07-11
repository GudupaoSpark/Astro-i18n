import fs from 'fs';
import path from 'path';

let localesCache: Record<string, Record<string, string>> = {};
let fallbackLang = 'en';

// 直接加載硬編碼的翻譯，確保至少有基本的翻譯可用
function loadHardcodedTranslations() {
  console.log(`[astro-i18n] 加載硬編碼的翻譯作為備用`);

  // 添加基本的硬編碼翻譯 - 同时包含简单键名和命名空间键名
  localesCache['en'] = {
    'welcome': 'Welcome',
    'hello': 'Hello',
    'language': 'Language',
    'common.welcome': 'Welcome',
    'common.hello': 'Hello',
    'common.language': 'Language'
  };

  localesCache['zh'] = {
    'welcome': '欢迎',
    'hello': '你好',
    'language': '语言',
    'common.welcome': '欢迎',
    'common.hello': '你好',
    'common.language': '语言'
  };

  console.log(`[astro-i18n] 已加載硬編碼翻譯: en, zh`);
}

// 加载语言文件的函数
export function loadLocalesFrom(rootDir: string, dir = 'locales', fallback = 'en', logger?: any): void {
  fallbackLang = fallback;
  let localesDir = path.join(rootDir, dir);

  // 首先加載硬編碼的翻譯，確保至少有基本的翻譯可用
  if (Object.keys(localesCache).length === 0) {
    loadHardcodedTranslations();
  }

  // 使用console保证日志输出
  console.log(`[astro-i18n] 尝试加载语言文件从: ${localesDir}`);
  logger?.info?.(`[astro-i18n] 尝试加载语言文件从: ${localesDir}`);

  try {
    // 检查语言目录是否存在
    if (!fs.existsSync(localesDir)) {
      console.warn(`[astro-i18n] 无法找到语言目录: ${localesDir}`);

      // 尝试不同的目录路径来寻找语言文件
      const possiblePaths = [
        path.join(rootDir, '..', dir),      // 上级目录
        path.join(rootDir, '..', '..', dir), // 再上一级目录
        path.join(process.cwd(), dir),       // 当前工作目录
        path.join(rootDir, 'public', dir),   // public目录
        path.join(process.cwd(), 'public', dir) // 当前工作目录的public子目录
      ];

      console.log(`[astro-i18n] 尝试查找语言目录，可能的路径: ${possiblePaths.join(', ')}`);

      let found = false;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          console.log(`[astro-i18n] 在替代路径找到语言目录: ${testPath}`);
          localesDir = testPath;
          found = true;
          break;
        }
      }

      if (!found) {
        console.warn(`[astro-i18n] 尝试了多个路径但都不存在，语言文件无法加载`);
        console.warn(`[astro-i18n] 将使用硬编码的翻译作为备用`);
        return;
      }
    }

    // 读取目录内容
    const dirEntries = fs.readdirSync(localesDir);

    // 过滤出JSON文件
    const files = dirEntries.filter((file: string) => file.endsWith('.json'));

    // 检查是否有语言子目录
    const subDirs = dirEntries.filter(entry => {
      const entryPath = path.join(localesDir, entry);
      return fs.statSync(entryPath).isDirectory();
    });

    if (files.length === 0 && subDirs.length === 0) {
      logger?.warn(`[astro-i18n] 未找到语言文件或子目录在: ${localesDir}`);
      return;
    }

    // 处理根目录中的语言文件
    for (const file of files as string[]) {
      // 放宽文件名规则，允许任何JSON文件
      const filePath = path.join(localesDir, file);
      const lang = file.replace('.json', '').toLowerCase();

      try {
        console.log(`[astro-i18n] 尝试加载语言文件: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const translations = JSON.parse(content) as Record<string, string>;

        // 合并而不是替换现有翻译
        localesCache[lang] = { ...(localesCache[lang] || {}), ...translations };

        console.log(`[astro-i18n] 已加载语言: ${lang} (${Object.keys(translations).length} 个词条)`);
        console.log(`[astro-i18n] 语言文件内容示例: ${JSON.stringify(Object.entries(translations).slice(0, 2))}`);
      } catch (error) {
        console.error(`[astro-i18n] 加载 ${file} 失败:`, error);
      }
    }

    // 处理子目录中的语言文件
    for (const dir of subDirs) {
      const langDirPath = path.join(localesDir, dir);
      const langFiles = fs.readdirSync(langDirPath).filter((file: string) => file.endsWith('.json'));

      // 为每个语言目录创建一个翻译对象
      let langTranslations: Record<string, string> = {};

      for (const file of langFiles) {
        const filePath = path.join(langDirPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileTranslations = JSON.parse(content) as Record<string, string>;
          // 合并翻译，文件名作为命名空间前缀
          const namespace = file.replace('.json', '');
          if (namespace === 'common' || namespace === 'main') {
            // 对于通用文件，直接合并无需命名空间
            Object.assign(langTranslations, fileTranslations);
          } else {
            // 对于其他文件，使用命名空间
            Object.entries(fileTranslations).forEach(([key, value]) => {
              langTranslations[`${namespace}.${key}`] = value;
            });
          }
        } catch (error) {
          logger?.error(`[astro-i18n] 加载 ${dir}/${file} 失败:`, error);
        }
      }

      if (Object.keys(langTranslations).length > 0) {
        localesCache[dir] = langTranslations;
        logger?.info(`[astro-i18n] 已加载语言目录: ${dir} (${Object.keys(langTranslations).length} 个词条)`);
      }
    }
  } catch (error) {
    logger?.error(`[astro-i18n] 加载语言文件失败:`, error);
  }
}

// 获取翻译函数
export function getTranslator(lang: string): (key: string, params?: Record<string, string | number>) => string {
  // 检查语言缓存状态
  const availableLangs = getAvailableLanguages();
  if (availableLangs.length === 0) {
    console.warn(`[astro-i18n] 初始化翻译器时发现翻译缓存为空，正在重新加载硬编码翻译...`);
    loadHardcodedTranslations();
  }

  return (key: string, params?: Record<string, string | number>) => {
    // 由于每次调用都会检查，这里再次确认缓存状态
    if (Object.keys(localesCache).length === 0) {
      console.warn(`[astro-i18n] 翻译函数调用时发现缓存为空，正在重新加载硬编码翻译...`);
      loadHardcodedTranslations();
    }

    // 获取当前语言和后备语言的翻译
    const dict = localesCache[lang] || {};
    const fallbackDict = localesCache[fallbackLang] || {};

    // 尝试获取翻译文本，如果不存在则使用后备语言或键本身
    let text = dict[key];
    if (text === undefined) {
      text = fallbackDict[key];
      if (text === undefined) {
        // 如果后备语言也没有，则使用键本身
        console.warn(`[astro-i18n] 未找到翻译: ${key} (语言: ${lang}, 后备语言: ${fallbackLang})`);
        text = key;
      } else {
        // 从后备语言找到翻译
        console.info(`[astro-i18n] 使用后备语言 (${fallbackLang}) 的翻译: ${key}`);
      }
    } else {
      console.log(`[${key}] 翻譯 '${key}' => '${text}'`);
    }

    // 替换参数 (如 {name} 将被替换为 params.name)
    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(new RegExp(`\{${paramKey}\}`, 'g'), String(value));
      });
    }

    return text;
  };
}

// 辅助函数：获取当前语言的所有翻译
export function getTranslations(lang: string): Record<string, string> {
  return localesCache[lang] || {};
}

// 辅助函数：检查键是否存在于翻译中
export function hasTranslation(lang: string, key: string): boolean {
  return key in (localesCache[lang] || {}) || key in (localesCache[fallbackLang] || {});
}

// 辅助函数：获取所有已加载的语言
export function getAvailableLanguages(): string[] {
  return Object.keys(localesCache);
}
