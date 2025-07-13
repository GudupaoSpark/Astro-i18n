import React from 'react';
import { createClientTranslator, Translations } from '../../../src/client.js';

const TestComponent = ({ translations }: { translations: Translations }) => {
  const t = createClientTranslator(translations);
  
  return (
    <div>
      <h1>React Test:{t('hello')} {t('123.a')}</h1>
    </div>
  );
};

export default TestComponent;