import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

const recommendedRules = js.configs.recommended.rules
const reactRules = {
  ...reactHooks.configs.recommended.rules,
  'react-refresh/only-export-components': ['warn', {
    allowConstantExport: true,
    allowExportNames: ['publishGenerationUsage', 'useAuth', 'useGenerationUsage'],
  }],
}

export default defineConfig([
  {
    name: 'recall/ignores',
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.vercel/**', '.supabase/**'],
  },
  {
    name: 'recall/browser-javascript',
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { ecmaVersion: 'latest', ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...recommendedRules,
      ...reactRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    name: 'recall/node-javascript',
    files: [
      'api/**/*.js',
      'server/**/*.js',
      'scripts/**/*.{js,mjs}',
      'test/**/*.js',
      '*.config.js',
      'server.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      ...recommendedRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    name: 'recall/environment-neutral-javascript',
    files: ['shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.es2021,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      ...recommendedRules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    name: 'recall/browser-typescript',
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactRules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
])
