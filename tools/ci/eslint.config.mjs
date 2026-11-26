import tseslint from 'typescript-eslint';
import next from '@next/eslint-plugin-next';
import hooks from 'eslint-plugin-react-hooks';

// Corrección del código existente; TypeScript strict comprueba tipos y referencias.
export default [{
  ignores: ['**/node_modules/**', '**/generated.ts', '**/dist/**', '**/.next/**'],
}, {
  files: ['**/*.{ts,tsx,mjs}'],
  linterOptions: { reportUnusedDisableDirectives: 'off' },
  plugins: { '@next/next': next, 'react-hooks': hooks },
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'constructor-super': 'error',
    'for-direction': 'error',
    'getter-return': 'error',
    'no-async-promise-executor': 'error',
    'no-compare-neg-zero': 'error',
    'no-cond-assign': 'error',
    'no-debugger': 'error',
    'no-dupe-args': 'error',
    'no-dupe-else-if': 'error',
    'no-dupe-keys': 'error',
    'no-duplicate-case': 'error',
    'no-loss-of-precision': 'error',
    'no-self-assign': 'error',
    'no-this-before-super': 'error',
    'no-unexpected-multiline': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-optional-chaining': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error'
  }
}];
