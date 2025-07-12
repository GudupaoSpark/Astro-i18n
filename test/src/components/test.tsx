import React from 'react';
import { getTranslator } from '../../../src/translator.js';


const TestComponent = ({ t }: { t: (key: string, params?: Record<string, string | number>) => string }) => {
  

  return (
    <div>
      <h1>React Test:{t('hello')}</h1>
    </div>
  );
};

export default TestComponent;