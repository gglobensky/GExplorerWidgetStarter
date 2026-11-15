// eslint.config.mjs: written by GEM Forge (Set up ESLint). The rules are yours to change:
// https://eslint.org/docs/latest/use/configure/
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default tseslint.config(
    { ignores: ['**/dist/**', '**/node_modules/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...vue.configs['flat/recommended'],
    {
        files: ['**/*.vue'],
        languageOptions: { parserOptions: { parser: tseslint.parser } },
    },
    {
        languageOptions: { globals: { ...globals.browser } },
    },
)
