import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		ignores: ['dist/**'],
	},
	{
		rules: {
			'quotes': ['error', 'single'],
			'indent': ['error', 'tab', { 'SwitchCase': 0 }],
			'linebreak-style': ['error', 'unix'],
			'semi': ['error', 'never'],
			'comma-dangle': ['error', 'always-multiline'],
			'dot-notation': 'error',
			'eqeqeq': ['error', 'smart'],
			'curly': ['error', 'all'],
			'brace-style': ['error'],
			'prefer-arrow-callback': 'warn',
			'object-curly-spacing': ['error', 'always'],
			'no-use-before-define': 'off',
			'@typescript-eslint/no-use-before-define': ['error', { 'classes': false, 'enums': false, 'functions': false }],
			'@typescript-eslint/no-unused-vars': 'off',
		},
	},
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
		},
	},
)
