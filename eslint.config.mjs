import aiGuardrails from 'eslint-plugin-ai-guardrails'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'auth/**'] },
  ...tseslint.configs.recommended,
  aiGuardrails.flatConfigs.recommended,
]
