module.exports = {
    env: {
        node: true,
        es2021: true
    },
    extends: 'eslint:recommended',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'commonjs'
    },
    rules: {
        // Allow console for logging
        'no-console': 'off',

        // Warn on unused variables (except catch errors)
        'no-unused-vars': ['warn', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrors: 'none'
        }],

        // Error on using undefined variables
        'no-undef': 'error',

        // Require semicolons
        'semi': ['warn', 'always'],

        // Use single quotes
        'quotes': ['warn', 'single', { avoidEscape: true }],

        // Consistent indentation (4 spaces)
        'indent': ['warn', 4, { SwitchCase: 1 }],

        // No trailing spaces
        'no-trailing-spaces': 'warn',

        // Prefer const over let when variable is not reassigned
        'prefer-const': 'warn',

        // No duplicate keys in objects
        'no-dupe-keys': 'error',

        // No unreachable code
        'no-unreachable': 'error'
    },
    ignorePatterns: [
        'node_modules/',
        '*.min.js',
        'dist/',
        'build/'
    ]
};
