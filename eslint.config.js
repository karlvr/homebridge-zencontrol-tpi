import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
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
			/* HomeKit characteristic handlers are conventionally async even when they don't await */
			'@typescript-eslint/require-await': 'off',
			/* Async methods are intentionally passed to void-returning callbacks such as setTimeout;
			   floating promises remain errors via no-floating-promises */
			'@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
			'@typescript-eslint/restrict-template-expressions': ['error', {
				allowAny: true,
				allowBoolean: true,
				allowNullish: true,
				allowNumber: true,
			}],
		},
	},
	{
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['**/*.js'],
		...tseslint.configs.disableTypeChecked,
	},
)
