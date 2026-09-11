import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Flat config. Type-aware rules are on: the cheap ones catch little that `strict` does
 * not already catch, and the expensive ones (floating promises, unsafe any) are the
 * reason spec 16.1 asks for strict typing in the first place.
 */
export default defineConfig([
  globalIgnores([
    'node_modules',
    'dist',
    'coverage',
    '**/.next/**',
    '**/next-env.d.ts',
    '**/postcss.config.mjs',
    '**/src/generated/**',
    'test/fixtures/**',
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // This config file is itself JavaScript and belongs to no tsconfig, so it needs
        // the default project or linting the repository root fails on the linter's own
        // configuration.
        projectService: {
          allowDefaultProject: ['eslint.config.js', '.dependency-cruiser.cjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` is allowed only with a comment naming the reason (spec 16.1), which a
      // linter cannot check. Keep it an error and let the reason ride on the
      // eslint-disable line, so the reason is attached to the escape hatch itself.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value=/(^|\\/)utils(\\/|$)/]',
          message:
            'There is no utils module and there will not be one. Shared code goes in modules/shared (spec 16.2).',
        },
      ],
    },
  },
  {
    // dependency-cruiser reads a CommonJS config, so this one file is CommonJS and
    // needs its globals declared. It is the only one.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  prettier,
]);
