import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    rules: { 'no-restricted-syntax': ['error', { selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]', message: 'Prohibido.' }] },
  },
  { files: ['*.ts', '*.js'], languageOptions: { globals: globals.node } },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
  { files: ['public/theme.js'], languageOptions: { globals: globals.browser } },
);
