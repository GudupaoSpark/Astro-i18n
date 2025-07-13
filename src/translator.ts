import fs from 'fs';
import path from 'path';

let _logger: any = console; // Defaults to console, updates if a logger is provided
let localesCache: Record<string, Record<string, string>> = {};
let fallbackLang = 'en';
let loaded = false; // Add global loading status flag


// Function to load language files
export function loadLocalesFrom(rootDir: string, dir = 'locales', fallback = 'en', logger?: any): void {
  fallbackLang = fallback;
  let localesDir = path.join(rootDir, dir);

  // If a logger is provided, use it
  if (logger) {
    _logger = logger;
  } else {
    _logger = {
      info: console.log, // Ensure info method exists
      ..._logger
    };
  }

  _logger.info(`Attempting to load language files from: ${localesDir}`);

  try {
    // Check if the language directory exists
    if (!fs.existsSync(localesDir)) {
      _logger.info(`Could not find language directory: ${localesDir}`);

      // Try different directory paths to find language files
      const possiblePaths = [
        path.join(rootDir, '..', dir),      // Parent directory
        path.join(rootDir, '..', '..', dir), // Grandparent directory
        path.join(process.cwd(), dir),       // Current working directory
        path.join(rootDir, 'public', dir),   // public directory
        path.join(process.cwd(), 'public', dir) // public subdirectory of current working directory
      ];

      _logger.info(`Attempting to find language directory, possible paths: ${possiblePaths.join(', ')}`);

      let found = false;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          _logger.info(`Found language directory at alternative path: ${testPath}`);
          localesDir = testPath;
          found = true;
          break;
        }
      }

      if (!found) {
        _logger.info(`Multiple paths attempted but none found, language files cannot be loaded`);
        _logger.info(`Will use hardcoded translations as a fallback`);
        return;
      }
    }

    // Read directory contents
    const dirEntries = fs.readdirSync(localesDir);

    // Filter out JSON files
    const files = dirEntries.filter((file: string) => file.endsWith('.json'));

    // Check for language subdirectories
    const subDirs = dirEntries.filter(entry => {
      const entryPath = path.join(localesDir, entry);
      return fs.statSync(entryPath).isDirectory();
    });

    if (files.length === 0 && subDirs.length === 0) {
      _logger.info(`No language files or subdirectories found in: ${localesDir}`);
      return;
    }

    // Process language files in the root directory
    for (const file of files as string[]) {
      // Relax filename rules, allow any JSON file
      const filePath = path.join(localesDir, file);
      const lang = file.replace('.json', '').toLowerCase();

      try {
        _logger.info(`Attempting to load language file: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf-8');
        const translations = JSON.parse(content) as Record<string, string>;

        // Merge instead of replacing existing translations
        localesCache[lang] = { ...(localesCache[lang] || {}), ...translations };

        _logger.info(`Loaded language: ${lang} (${Object.keys(translations).length} entries)`);
        _logger.info(`Language file content example: ${JSON.stringify(Object.entries(translations).slice(0, 2))}`);
      } catch (error) {
        _logger.info(`Failed to load ${file}:`, error);
      }
    }

    // Process language files in subdirectories
    for (const dir of subDirs) {
      const langDirPath = path.join(localesDir, dir);
      const langFiles = fs.readdirSync(langDirPath).filter((file: string) => file.endsWith('.json'));

      // Create a translation object for each language directory
      let langTranslations: Record<string, string> = {};

      for (const file of langFiles) {
        const filePath = path.join(langDirPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileTranslations = JSON.parse(content) as Record<string, string>;
          // Merge translations, using filename as namespace prefix
          const namespace = file.replace('.json', '');
          if (namespace === 'common' || namespace === 'main') {
            // For common files, merge directly without namespace
            Object.assign(langTranslations, fileTranslations);
          } else {
            // For other files, use namespace
            Object.entries(fileTranslations).forEach(([key, value]) => {
              langTranslations[`${namespace}.${key}`] = value;
            });
          }
        } catch (error) {
          _logger.info(`Failed to load ${dir}/${file}:`, error);
        }
      }

      if (Object.keys(langTranslations).length > 0) {
        localesCache[dir] = langTranslations;
        _logger.info(`Loaded language directory: ${dir} (${Object.keys(langTranslations).length} entries)`);
      }
    }
  } catch (error) {
    _logger.info(`Failed to load language files:`, error);
  }
}

// Function to get translator
export function getTranslator(lang: string): (key: string, params?: Record<string, string | number>) => string {
  // Ensure language files are loaded
  if (!loaded) {
    _logger.info('Warning: Language files not loaded, will auto-load default configuration');
    loadLocalesFrom(process.cwd(), 'locales', fallbackLang, _logger);
    loaded = true;
  }
  
  return (key: string, params?: Record<string, string | number>) => {


    // Get translations for current and fallback language
    const dict = localesCache[lang] || {};
    const fallbackDict = localesCache[fallbackLang] || {};

    // Helper function to get nested value from object using dot notation
    const getNestedValue = (obj: any, key: string): string | undefined => {
      // First try direct key access for backward compatibility
      if (key in obj) {
        return obj[key];
      }
      
      // Then try nested access using dot notation
      const keys = key.split('.');
      let value = obj;
      
      for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
          value = value[k];
        } else {
          return undefined;
        }
      }
      
      return typeof value === 'string' ? value : undefined;
    };

    // Attempt to get translation text, use fallback language or key itself if not found
    let text = getNestedValue(dict, key);
    if (text === undefined) {
      text = getNestedValue(fallbackDict, key);
      if (text === undefined) {
        // If not found in fallback language either, use the key itself
        throw new Error(`Translation not found: ${key} (Language: ${lang}, Fallback language: ${fallbackLang})`);
        text = key;
      } else {
        // Found translation from fallback language
        _logger.info(`Using fallback language (${fallbackLang}) translation for: ${key}`);
      }
    } else {
      _logger.info(`Translated '${key}' => '${text}'`);
      /*
          // Replace parameters (e.g., {name} will be replaced by params.name)
          if (params) {
            Object.entries(params).forEach(([paramKey, value]) => {
              text = text.replace(new RegExp(`\{${paramKey}\}`, 'g'), String(value));
            });
          } */
    }

    return text;
  };
}

// Helper function: Get all translations for the current language
export function getTranslations(lang: string): Record<string, string> {
  return localesCache[lang] || {};
}

// Helper function: Check if key exists in translations
export function hasTranslation(lang: string, key: string): boolean {
  const checkNestedKey = (obj: any, key: string): boolean => {
    // First try direct key access
    if (key in obj) {
      return true;
    }
    
    // Then try nested access using dot notation
    const keys = key.split('.');
    let value = obj;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return false;
      }
    }
    
    return typeof value === 'string';
  };

  const dict = localesCache[lang] || {};
  const fallbackDict = localesCache[fallbackLang] || {};
  
  return checkNestedKey(dict, key) || checkNestedKey(fallbackDict, key);
}

// Helper function: Get all loaded languages
export function getAvailableLanguages(): string[] {
  // Ensure language files are loaded, this is crucial for getStaticPaths
  if (!loaded) {
    _logger.info('Warning: Language files may not be loaded, attempting to auto-load.');
    loadLocalesFrom(process.cwd(), 'locales', fallbackLang, _logger);
    loaded = true;
  }
  return Object.keys(localesCache);
}

// Helper function: Generate paths for Astro's getStaticPaths
export function getStaticPaths() {
  // Ensure language files are loaded correctly during build
  if (!loaded) {
    const rootDir = process.cwd();
    // Try multiple possible language file paths
    const possiblePaths = [
      'locales',
      './locales',
      'test/locales',
      '../locales'
    ];
    
    for (const localesPath of possiblePaths) {
      const fullPath = path.join(rootDir, localesPath);
      if (fs.existsSync(fullPath)) {
        _logger.info(`Loading language files from: ${fullPath} during build`);
        loadLocalesFrom(rootDir, localesPath, fallbackLang, _logger);
        loaded = true;
        break;
      }
    }
  }
  
  const languages = Object.keys(localesCache);
  _logger.info(`getStaticPaths generating paths: ${languages.join(', ')}`);
  
  return languages.map((lang) => ({
    params: { lang },
  }));
}
