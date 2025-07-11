# Astro-i18n

一个由Gudupao开发的Astro国际化插件

## 安装

```bash
pnpm add astro-i18n
```

## 使用方法

### 1. 在Astro配置中添加插件

```typescript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { astroI18nPlugin } from 'astro-i18n';

export default defineConfig({
  integrations: [
    astroI18nPlugin({
      localesDir: 'locales',      // 语言文件目录，默认为'locales'
      fallbackLang: 'en',        // 后备语言，默认为'en'
      autoRedirect: true         // 是否自动重定向到用户语言路径，默认为true
    })
  ]
});
```

### 2. 创建语言文件

在项目根目录创建`locales`文件夹，并添加语言文件：

```
/locales
  /en.json      # 英文翻译
  /zh.json      # 中文翻译
```

### 3. 在页面中使用

```astro
---
// src/pages/[lang]/index.astro
export function getStaticPaths() {
  return [
    { params: { lang: 'en' } },
    { params: { lang: 'zh' } }
  ];
}

const { lang } = Astro.params;
const { t } = Astro.locals;
---

<html lang={lang}>
  <head>
    <title>{t('welcome')}</title>
  </head>
  <body>
    <h1>{t('hello')}</h1>
    <p>{t('language')}: {lang}</p>
  </body>
</html>
```

## 特性

- 支持URL路径语言代码 (`/en/about`, `/zh/about`)
- 自动语言检测（从URL、Cookie、Accept-Language头）
- 自动重定向到用户首选语言
- 支持参数化翻译
- 支持多级目录结构的翻译文件

## 许可证

MIT
