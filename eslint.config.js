const js = require('@eslint/js');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  {
    ignores: ['**/node_modules/**', 'db/**', 'logs/**', '**/coverage/**', 'tmp-*.json'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
  js.configs.recommended,
  {
    rules: {
      // Let leading underscores represent intentionally unused parameters.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // The bot uses process.exit for lifecycle / crash handling.
      'no-process-exit': 'off',
    },
  },
  eslintConfigPrettier,
];
