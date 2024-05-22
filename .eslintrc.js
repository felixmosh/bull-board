module.exports = {
  parser: '@typescript-eslint/parser',
  root: true,
  extends: ['plugin:react/recommended', 'prettier'],
  plugins: ['@typescript-eslint', 'no-only-tests', 'react'],
  parserOptions: {
    ecmaVersion: 2019, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
    ecmaFeatures: {
      modules: true,
    },
  },
  env: {
    node: true,
    es6: true,
    jest: true,
    browser: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // Routes
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-only-tests/no-only-tests': 'error',

    // UI
    'react/prop-types': 'off',
    'react/display-name': 'off',
  },
  overrides: [
    {
      // enable the rule specifically for TypeScript files
      files: ['*.{ts,tsx}'],
      extends: ['plugin:@typescript-eslint/recommended'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-empty-interface': 'off',
      },
    },
  ],
};
