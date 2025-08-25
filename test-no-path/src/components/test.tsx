import React from 'react';
import { createClientTranslator } from '../../../src/client.js';
import type { Translations } from '../../../src/index.js';

const TestComponent = ({ translations }: { translations: Translations }) => {
  const t = createClientTranslator(translations);
  
  return (
    <div>
      <h1>React Test:{t('hello')} {t('123.a')}</h1>
    </div>
  );
};

export default TestComponent;