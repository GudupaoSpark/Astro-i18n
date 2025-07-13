import { Translations } from './types.js';
export const createClientTranslator = (
  translations: Translations
) => {
  const getNestedValue = (obj: Translations, key: string): string | undefined => {
    if (!obj) return undefined;
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

  return (key: string, params?: Record<string, string | number>): string => {
    const text = getNestedValue(translations, key);

    if (text === undefined) {
      // If not found, use the key itself
      return key;
    }

    // The original code has parameter replacement commented out, so I will omit it for now.
    // if (params) {
    //   Object.entries(params).forEach(([paramKey, value]) => {
    //     text = text.replace(new RegExp(`\{${paramKey}\}`, 'g'), String(value));
    //   });
    // }

    return text;
  };
};