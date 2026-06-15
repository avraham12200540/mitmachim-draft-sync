// Flat ESLint config shared by both workspaces. Type-checking is handled by
// tsc; ESLint here focuses on likely-bug rules without type-aware linting (kept
// fast and dependency-light).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.map',
      '**/build.mjs',
      'server/scripts/**',
      'extension/scripts/**',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['extension/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, chrome: 'readonly' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
);
