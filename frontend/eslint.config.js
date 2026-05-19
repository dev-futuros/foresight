// Flat ESLint config. Adopts typescript-eslint strict-type-checked +
// stylistic-type-checked. The 18 rules below remain at `warn` because
// real violations still exist in the codebase — they'll get paid down
// in follow-up cleanup PRs and then promoted to `error`. Everything
// else from those presets runs at the default `error` level so any
// future regression fails CI.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

// Rules that still have at least one violation in the codebase. Counts
// captured immediately after the Phase 1.5 autofix landed. As each
// number drops to 0, promote the rule out of this list and let it run
// at the default `error` level.
//
//   no-unnecessary-condition       108   defensive checks TS knows are always truthy
//   no-floating-promises            36   un-awaited mutateAsync, queryClient.invalidateQueries, etc.
//   no-non-null-assertion           12   `foo!`
//   no-unsafe-assignment             9   third-party libs (Kinde, jsPDF) leaking as any
//   no-deprecated                    9   deprecated APIs
//   prefer-nullish-coalescing        6   `a || b` where `??` is safer
//   no-unsafe-return                 4
//   no-unnecessary-type-parameters   4
//   no-unnecessary-type-conversion   4
//   require-await                    3   async fns with no `await`
//   no-invalid-void-type             3
//   prefer-for-of                    2
//   no-unnecessary-type-assertion    2   (DANGEROUS to --fix — would drop
//                                         needed casts on sanitizeTree<T>;
//                                         remaining ones may be genuine)
//   no-dynamic-delete                2
//   restrict-plus-operands           1
//   prefer-promise-reject-errors     1
//   prefer-optional-chain            1
//   no-empty-function                1
const PHASE_1_BACKLOG_TO_WARN = [
  '@typescript-eslint/no-unnecessary-condition',
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-non-null-assertion',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-deprecated',
  '@typescript-eslint/prefer-nullish-coalescing',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/no-unnecessary-type-parameters',
  '@typescript-eslint/no-unnecessary-type-conversion',
  '@typescript-eslint/require-await',
  '@typescript-eslint/no-invalid-void-type',
  '@typescript-eslint/prefer-for-of',
  '@typescript-eslint/no-unnecessary-type-assertion',
  '@typescript-eslint/no-dynamic-delete',
  '@typescript-eslint/restrict-plus-operands',
  '@typescript-eslint/prefer-promise-reject-errors',
  '@typescript-eslint/prefer-optional-chain',
  '@typescript-eslint/no-empty-function',
];

const warnAll = Object.fromEntries(PHASE_1_BACKLOG_TO_WARN.map((rule) => [rule, 'warn']));

export default tseslint.config(
  { ignores: ['dist', 'build', 'coverage', 'node_modules'] },
  // Plain JS/config files in the repo root — don't run type-aware rules on them.
  {
    files: ['*.{js,cjs,mjs}', '*.config.{js,ts}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  // The app source — full type-checked lint, with the backlog downgraded.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...warnAll,

      // ── React-friendly tweaks to keep the strict configs usable.
      //    Defaults of these rules fight common React idioms.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // ── Folder-layer boundaries (Bulletproof React).
      //    Dependency direction is: app > features > shared. Shared
      //    layers (components, hooks, lib, types, utils) must NOT
      //    reach down into features/ — that creates feature → shared
      //    → feature cycles and makes the shared layer "private to
      //    one feature in disguise". Features can import freely from
      //    shared layers.
      //
      //    Cross-feature imports are NOT yet enforced here; several
      //    legitimate pairs exist (chat → report for context
      //    snapshots, report → billing for quota invalidation,
      //    examples ↔ report for promote/demote/getReport-fallback,
      //    auth → account for LOGOUT_IN_PROGRESS_KEY) and each needs
      //    a targeted `except` carve-out. Wiring the strict per-
      //    feature isolation lands as its own follow-up once each
      //    dependency has been audited.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/features', from: './src/app' },
            { target: './src/components', from: './src/features' },
            { target: './src/hooks', from: './src/features' },
            { target: './src/lib', from: './src/features' },
            { target: './src/types', from: './src/features' },
          ],
        },
      ],
    },
  },
  // Tests + test utilities — relax the unsafe-* family so mock data and
  // any-typed harnesses don't drown out real signal. unbound-method is
  // off here because Vitest spy/mock patterns (`expect(spy).toHaveBeenCalled()`)
  // routinely trip it with false positives.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
