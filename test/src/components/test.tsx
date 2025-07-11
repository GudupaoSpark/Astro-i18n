import React from 'react';
import { getTranslator } from '../../../src/translator.js';

interface TestComponentProps {
  lang?: string;
}

const TestComponent: React.FC<TestComponentProps> = ({ lang = 'en' }) => {
  const t = getTranslator(lang);
  

  return (
    <div>
      <h1>React Test:{t('hello')}</h1>
    </div>
  );
};

export default TestComponent;