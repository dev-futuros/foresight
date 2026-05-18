// Flat ESLint config. Phase 1 of the refactor (docs/REFACTOR_PROPOSAL.md).
//
// Posture for THIS PR: install the typescript-eslint strict-type-checked +
// stylistic-type-checked presets, but downgrade every rule that fires on
// the current codebase to `warn`. Phase 1 is a no-source-changes config
// drop — the actual cleanup happens in follow-up PRs where each rule
// gets paid down and promoted back to `error`.
//
// What that means in practice:
//   • `npm run lint` reports the backlog as warnings, but exits 0.
//   • CI does not gate on these yet.
//   • Genuinely catastrophic rules (e.g. parsing errors from
//     @eslint/js recommended) still hard-fail — those aren't from
//     the type-checked presets.
//
// Phase 1.5 (next PR): triage the warning backlog, fix it file-by-file,
// promote rules back to `error`, and gate CI.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

// Every typescript-eslint rule that fires on the current codebase (counts
// captured at branch root). All downgraded to `warn` for the Phase 1
// config drop; promoted back to `error` per-rule in Phase 1.5 cleanup PRs.
//
//   no-floating-promises           ~5    un-awaited mutateAsync etc.
//   no-unsafe-{assign,call,         many  third-party types leaking as any
//     member,argument,return}
//   no-explicit-any                       scattered
//   no-unnecessary-condition              defensive checks TS knows are always truthy
//   no-non-null-assertion          15     `foo!`
//   prefer-nullish-coalescing      10     `a || b` where `??` is safer
//   restrict-plus-operands          9     adding non-{number,string}
//   no-deprecated                   9     deprecated APIs
//   no-unused-vars                  5     dead `import type` declarations
//   no-unnecessary-type-parameters  4
//   no-unnecessary-type-conversion  4
//   require-await                   3
//   no-invalid-void-type            3
//   prefer-for-of                   2
//   no-dynamic-delete               2
//   prefer-promise-reject-errors    1
//   prefer-optional-chain           1
//   no-empty-function               1
//   no-unnecessary-type-assertion  30     stylistic — DANGEROUS to autofix
//                                         (its --fix dropped a needed cast
//                                         in exportPdf.ts during this PR)
//   consistent-type-definitions    24     `type X = {...}` → `interface X`
//   array-type                     10     `T[]` vs `Array<T>`
//   prefer-regexp-exec              5     `.match()` → `RegExp.exec()`
//   no-unnecessary-boolean-literal-compare 2
const PHASE_1_BACKLOG_TO_WARN = [
  '@typescript-eslint/no-floating-promises',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/no-unnecessary-condition',
  '@typescript-eslint/no-non-null-assertion',
  '@typescript-eslint/prefer-nullish-coalescing',
  '@typescript-eslint/restrict-plus-operands',
  '@typescript-eslint/no-deprecated',
  '@typescript-eslint/no-unnecessary-type-parameters',
  '@typescript-eslint/no-unnecessary-type-conversion',
  '@typescript-eslint/require-await',
  '@typescript-eslint/no-invalid-void-type',
  '@typescript-eslint/prefer-for-of',
  '@typescript-eslint/no-dynamic-delete',
  '@typescript-eslint/prefer-promise-reject-errors',
  '@typescript-eslint/prefer-optional-chain',
  '@typescript-eslint/no-empty-function',
  '@typescript-eslint/no-unnecessary-type-assertion',
  '@typescript-eslint/consistent-type-definitions',
  '@typescript-eslint/array-type',
  '@typescript-eslint/prefer-regexp-exec',
  '@typescript-eslint/no-unnecessary-boolean-literal-compare',
  '@typescript-eslint/consistent-type-imports',
  '@typescript-eslint/unbound-method',
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
        'warn',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/no-confusing-void-expression': ['warn', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': [
        'warn',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Tests + test utilities — relax the unsafe-* family so mock data and
  // any-typed harnesses don't drown out real signal.
  {
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
