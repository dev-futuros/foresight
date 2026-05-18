# Foresight Frontend Refactor — Proposal

> Draft for review. Not yet approved. Three sources informed this: Bulletproof
> React, TkDodo's React Query blog series, and Patterns.dev — cross-referenced
> against a structural inventory of the current `frontend/src/` tree.

## TL;DR

1. **Style**: enable `tsconfig` strict mode, adopt `typescript-eslint strict-type-checked + stylistic-type-checked`, add Prettier. ~1 day of fix-up.
2. **Structure**: keep `src/features/<x>/` as the spine, but push API + hooks + types **into** each feature instead of leaving them in global `src/hooks/` and `src/lib/`. Split monoliths: `exportPdf.ts` (4703 LOC), `NewReportPage.tsx` (1320), `ChatAssistant.tsx` (830), `DashboardPage.tsx` (815), `useChat.ts` (464).
3. **Architecture**:
   - Every server fetch goes through a per-feature `api/` + query-key factory + custom hook. No direct `useQuery` in components, no direct `fetch` calls from `lib/aiClient`.
   - Errors handled in three tiers (local UI / global toast via `QueryCache.onError` / route-level `ErrorBoundary`).
   - State by data-shape: server → React Query, URL → `useSearchParams`, low-frequency app → Context, ephemeral UI → `useState`/`useReducer`.
4. **Localization**: kill the per-string `t3(en, es, ca)` helper and the literal `'es' | 'en' | 'ca'` union sprawl. Single language registry + auto-discovered locale files + `i18n.getFixedT(lang)` for exports. Adding a language becomes a 2-line change.
5. **Phased**: 5 phases over ~2–3 weeks, each shippable independently. No "big-bang rewrite."

## What's already good

Don't throw out:

- Feature-based folder spine (`features/report`, `features/chat`, `features/dashboard`, etc.). Bulletproof React would call this "correct."
- TanStack Query for report/example fetching (`useReports.ts`, `useExamples.ts`). Good instinct.
- i18next setup with three first-class languages. The chrome side of i18n is fine — it's the export-prose and type-union sprawl that needs work (see Localization section).
- Single Axios instance with auth interceptor (`lib/api.ts`). Right pattern, just under-used.
- `commandBus.ts` + `useCommands` for chat→app actions. Lightweight, fine.

---

## Style

### tsconfig

Turn on strict mode. The survey confirmed `strict: false`, no `noImplicitAny`, no `strictNullChecks`. That's why we keep finding bugs at `vite build` rather than in the editor.

```jsonc
// tsconfig.app.json — add these to compilerOptions
{
  "strict": true,
  "noUncheckedIndexedAccess": true,        // catches `arr[0]` being undefined
  "exactOptionalPropertyTypes": true,      // catches `{ foo: undefined }` vs `{}`
  "noImplicitOverride": true
}
```

Expect 50–150 new errors. Most will be `Object is possibly undefined` in PDF section renderers (where we already know data is sparse) and `arr[0]` accesses. Triage in one PR with `noUncheckedIndexedAccess` flipped off if the volume is overwhelming, then turn it back on as a follow-up.

### eslint.config.js

Replace today's minimal flat config with `strict-type-checked + stylistic-type-checked` and the React-friendly downgrades. Key items:

- `no-floating-promises` (will catch every un-awaited `mutation.mutateAsync()` and `i18n.changeLanguage()` — these are real bugs we're shipping today).
- `no-misused-promises` configured to allow `onClick={async () => ...}` (event handlers commonly need async).
- `consistent-type-imports` (free, auto-fixable, cleans up `import type` everywhere).
- `import/no-restricted-paths` to enforce feature isolation — see Structure section.

Ready-to-paste flat config:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'build', 'coverage', '*.config.{js,ts}'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.browser },
    },
    settings: { react: { version: '19.0' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      import: importPlugin,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // React-friendly overrides
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
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',

      // Enforce Bulletproof React boundaries
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            { target: './src/features', from: './src/app' },
            { target: './src/components', from: './src/features' },
            { target: './src/hooks', from: './src/features' },
            { target: './src/lib', from: './src/features' },
            { target: './src/types', from: './src/features' },
            { target: './src/utils', from: './src/features' },
            // No cross-feature imports — add one entry per feature.
            { target: './src/features/report', from: './src/features', except: ['./report'] },
            { target: './src/features/chat', from: './src/features', except: ['./chat'] },
            { target: './src/features/dashboard', from: './src/features', except: ['./dashboard'] },
            // (continue for each feature)
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/testing/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
```

Rollout: run `eslint . --fix` once for auto-fixes (~30% of violations), then downgrade `no-floating-promises` and `no-unsafe-*` to `warn` for the first PR, fix file-by-file over 2–3 PRs, then promote to `error` and gate CI.

### Prettier

Add it. Today there's nothing enforcing format and merges fight whitespace.

```json
// .prettierrc
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100, "semi": true }
```

---

## Structure

### Target layout

```
src/
├── app/                          # NEW: app shell
│   ├── routes/                   # one file per route (lazy-loaded)
│   ├── providers.tsx             # QueryClientProvider, I18n, ErrorBoundary, Clerk
│   └── router.tsx
├── components/                   # ONLY true shared primitives
│   ├── Modal, ConfirmDialog, SplitButton, InfoTooltip, IconSprite, LineClamp, LoadingOverlay, LoadingPanel, LanguageToggle
│   └── (move AuthBridge → features/auth/, ExportModal & ShareModal → features/report/)
├── features/
│   ├── auth/        api/ components/ hooks/  (incl. AuthBridge, ProtectedRoute, clerkAppearance, clerkLocalization)
│   ├── report/      api/ components/ hooks/ types/ pdf/  (incl. ExportModal, ShareModal, exportPdf split)
│   ├── chat/        api/ components/ hooks/
│   ├── dashboard/   api/ components/ hooks/
│   ├── publicShare/ api/ components/ hooks/
│   ├── account/     ...
│   ├── shell/       ...
│   ├── translations/...
│   └── examples/    NEW: split out of useReports (currently both there)
├── lib/                          # third-party wrappers only
│   ├── apiClient.ts              # the Axios instance + interceptor
│   ├── queryClient.ts
│   ├── posthog.ts
│   └── commandBus.ts
├── hooks/                        # ONLY cross-feature hooks
│   ├── useStopwatch.ts
│   └── useLanguageSync.ts
├── types/                        # ONLY cross-feature types (api.ts stays here)
├── i18n/
└── test/
```

### The big moves

- `lib/exportPdf.ts` (4703 LOC) → `features/report/pdf/{theme,fonts,layout,sections/*,index}.ts`. The 8 `const en = isEnLang()` cleanups in the previous session already prove the file is too dense to navigate.
- `lib/aiClient.ts` (1001 LOC) → split per-endpoint into the feature that owns it: `features/report/api/analyze.ts`, `features/chat/api/chat.ts`, etc. Keep generic SSE-parsing utilities in `lib/sse.ts`.
- `lib/buildAssistantSnapshot.ts` + step data types currently in `features/report/steps/*.tsx` → `features/report/types.ts`. Kills the inverted dependency where `lib/` imports from `features/`.
- `useReports.ts` (286 LOC) → `features/report/api/{getReport,listReports,createReport,updateReport,translateReport}.ts` + `features/examples/api/...`. Each file exports a fetcher, a `queryOptions()` (v5), and the hook.

### Enforce boundaries with lint

`eslint-plugin-import`'s `no-restricted-paths` (snippet above) blocks at lint time:

- No imports from `app/` into `features/` or `lib/`.
- No imports from `features/` into `components/`, `hooks/`, `lib/`, `utils/`, `types/`.
- No cross-feature imports (`features/report` cannot import `features/chat`). Today `features/chat/ChatAssistant.tsx` imports step types from `features/report/steps/`, which only "works" because lint isn't checking — once types move to `features/report/types.ts` and the lint rule is on, the dependency is explicit (chat depends on report's public types).

### Query keys

Per-feature factory, colocated, exported as a const. TkDodo's pattern:

```ts
// features/report/api/queryKeys.ts
export const reportKeys = {
  all: ['reports'] as const,
  lists: () => [...reportKeys.all, 'list'] as const,
  list: (filters: ReportFilters) => [...reportKeys.lists(), filters] as const,
  details: () => [...reportKeys.all, 'detail'] as const,
  detail: (id: string) => [...reportKeys.details(), id] as const,
  translation: (id: string, lang: string) => [...reportKeys.detail(id), 'translation', lang] as const,
};
```

Then every `invalidateQueries({ queryKey: reportKeys.detail(id) })` becomes typed and refactor-safe.

---

## Architecture

### Data layer rules

- Every `useQuery` lives inside a custom hook (`useReport(id)`, `useReportList(filters)`). Components never call `useQuery` directly.
- Every fetcher is its own function (`getReport(id): Promise<Report>`) with a typed return. Generics on `useQuery` are inferred — never pass them manually.
- Mutations: prefer `mutate` over `mutateAsync`. Put cache invalidation in `onSuccess`, UI side-effects (toast, navigate) in the `mutate(...)` callback at the call site (so they're skipped if the component unmounts mid-flight).
- Return the `invalidateQueries` promise from `onSuccess` so `isPending` stays true until refetched data lands.
- `staleTime` set globally to ~20s in `queryClient.ts` (today it's the default 0, which means every i18n-driven remount refetches).
- `select` over transforming in `queryFn` — for example, the PDF export pulls just `report.resultData.scenarios`; let `select` handle that so only that slice triggers re-renders.

### State by data-shape

| Where | What goes here | Foresight examples |
|-------|----------------|---------------------|
| `useState` / `useReducer` | One-component, one-tree state | Modal open/closed, current wizard step, draft text |
| URL state | Anything shareable / back-button-correct | Selected report id, active tab, language code, dashboard page |
| TanStack Query | All server data | Reports, examples, share tokens, user profile |
| Context | Tree-wide, low-frequency | Theme, current Clerk user, i18n instance, QueryClient |
| Zustand (if needed) | True client global, high-frequency | Streaming-token state, toast queue. NOT introducing today — defer until we hit it. |

Today `NewReportPage` holds wizard state in 9 `useState` calls. The right answer is `useReducer` (or `react-hook-form` with the Zod schema shared with the API layer). The right answer for the active-tab on the report viewer is `?tab=summary` in the URL, not a component-local `useState`. Both are good early targets in Phase 2.

### Error handling tiers

1. **Local UI**: query returns `error`, component renders inline message (form-style for 4xx).
2. **Global toast**: register `queryCache.onError` once in `queryClient.ts` for 5xx and network errors. Today, every component reimplements toast-on-error.
3. **Route-level boundary**: `react-error-boundary` per route in `app/routes/`. Currently we have no error boundaries — a PDF crash blanks the app.

### Splitting monoliths — what each becomes

| Today | Target |
|-------|--------|
| `lib/exportPdf.ts` (4703) | `features/report/pdf/{theme,fonts,layout,index}.ts` + `features/report/pdf/sections/{cover,toc,brief,steep,scenarios,scenarioPlanning,backcasting,strategicMap,backCover}.ts` — one file per section, all using the shared theme/fonts modules. Each section file <500 LOC. |
| `features/report/NewReportPage.tsx` (1320) | Slim shell (~300 LOC routing + composition) + `useWizardForm` hook (form state, persistence) + `useAnalysisOrchestrator` hook (the 5-call AI pipeline) + `WizardOnboarding` component. |
| `features/chat/ChatAssistant.tsx` (830) | `ChatAssistant` shell + `ChatMessageList`, `ChatComposer`, `ChatCommandChip` components + `useMessageParsing` hook split out of `useChat`. |
| `features/dashboard/DashboardPage.tsx` (815) | `DashboardPage` shell + `ReportCard`, `DashboardFilters`, `DashboardStats` components + `useDashboardFilters` hook (URL-backed). |
| `hooks/useChat.ts` (464) | `features/chat/hooks/useChat.ts` (message I/O only, ~250 LOC) + `features/chat/hooks/usePendingCommands.ts` (command parsing state machine). |

### Patterns to adopt explicitly

- **Compound components** for the wizard step nav and the export/share menus: `<ReportWizard><ReportWizard.Step .../></ReportWizard>`. Today the stepper passes a step index around as props, which is fine but rigid.
- **Code-split per route** with `createBrowserRouter({ routes: [{ path, lazy: () => import(...) }] })`. The PDF export pipeline should also be `await import(...)` — it's heavy and only used on demand.
- **Don't** introduce HOCs. **Don't** introduce Render Props. **Don't** introduce Zustand yet (defer).

---

## Localization (Addendum)

### The problem, named precisely

Three distinct kinds of language coupling are tangled together today, and only the first is actually i18n:

1. **Chrome strings** (UI labels, error messages, button text). These already go through `t('account.preferences.title')`. **This part is fine** — adding a language is one file (`locales/<code>.ts`) plus one resource registration. No change needed to call sites.

2. **Hardcoded prose in exports**. `lib/exportPdf.ts` has ~35 call sites of `t3('Brief', 'Resumen', 'Resum')`. Same pattern in `exportHtml.tsx` and `exportPpt.ts`. **This is the real sprawl.** Adding Italian means converting every `t3()` to a `t4()`. Adding a fifth language means a `t5()`. This is exactly the abstraction failure described in the review.

3. **The literal language union** `'es' | 'en' | 'ca'`. Repeated in ~20 files (`types/api.ts`, every hook, every modal that has a language picker, every fetcher). Adding a language means touching all of them. The type system is being used as a string-union cache rather than as a derived value.

The fix is three layers, all frontend-only, all mechanical:

### Layer 1: Single source of truth for languages

```ts
// src/i18n/languages.ts — the ONLY file that knows what languages exist
export const LANGUAGES = {
  es: { code: 'es', label: 'Español',  dateLocale: 'es-ES' },
  en: { code: 'en', label: 'English',  dateLocale: 'en-GB' },
  ca: { code: 'ca', label: 'Català',   dateLocale: 'ca-ES' },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type LanguageSpec = (typeof LANGUAGES)[LanguageCode];

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGES) as readonly LanguageCode[];
export const DEFAULT_LANGUAGE: LanguageCode = 'es';

export function isLanguageCode(x: unknown): x is LanguageCode {
  return typeof x === 'string' && x in LANGUAGES;
}
```

What this kills:

- `types/api.ts`: every `'es' | 'en' | 'ca'` becomes `LanguageCode`. (Only the type needs updating — the runtime string values are unchanged, so backend contracts are untouched.)
- `DashboardPage.tsx`: the `SUPPORTED_LANGUAGES` constant we keep fixing by hand is now `import { SUPPORTED_LANGUAGES } from '../../i18n/languages'`.
- `ExportModal.tsx`, `AccountModal.tsx`, `ClerkPreferencesPage.tsx`: every `LANGUAGE_OPTIONS` array is now `Object.values(LANGUAGES)`.
- `exportPdf.ts`: `'en-GB' / 'es-ES' / 'ca-ES'` ternary becomes `LANGUAGES[lang].dateLocale`. `isCaLang()` and `isEnLang()` helpers are deleted.

### Layer 2: Auto-discover locale files

Vite's `import.meta.glob` makes the registration step disappear:

```ts
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type LanguageCode } from './languages';

// Eagerly import every locale file. Vite resolves this at build time —
// the registry is statically known, but the source list isn't hardcoded.
const localeModules = import.meta.glob<{ default: Record<string, unknown> }>(
  './locales/*.ts',
  { eager: true },
);

const resources = Object.fromEntries(
  Object.entries(localeModules).map(([path, mod]) => {
    const match = /\/locales\/([a-z]{2})\.ts$/.exec(path);
    if (!match) throw new Error(`Locale filename doesn't match /locales/<code>.ts: ${path}`);
    const code = match[1] as LanguageCode;
    return [code, { translation: mod.default }];
  }),
);

// Sanity check: every code in LANGUAGES has a file, and vice versa.
// Fails loudly at startup rather than silently falling back to es.
for (const code of SUPPORTED_LANGUAGES) {
  if (!resources[code]) throw new Error(`Missing locale file: src/i18n/locales/${code}.ts`);
}

i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
});

export default i18n;
```

Adding Italian is now exactly two changes:

1. Drop `src/i18n/locales/it.ts` (with translations).
2. Add `it: { code: 'it', label: 'Italiano', dateLocale: 'it-IT' }` to `LANGUAGES`.

Everything else — picker dropdowns, validators, type unions, dashboard badges, share modals — picks it up.

### Layer 3: Kill `t3()` — move export prose into i18n

This is the biggest mechanical change but it's pure search-and-replace. Today:

```ts
// exportPdf.ts (current)
doc.text(t3('Brief', 'Resumen', 'Resum'), ...);
doc.text(t3('Scenarios', 'Escenarios', 'Escenaris'), ...);
doc.text(t3('Driving forces', 'Fuerzas motrices', 'Forces motrius'), ...);
```

Target:

```ts
// exportPdf.ts (proposed)
const tx = i18n.getFixedT(exportLang, null, 'export.pdf');
doc.text(tx('brief'), ...);
doc.text(tx('scenarios'), ...);
doc.text(tx('drivingForces'), ...);
```

```ts
// locales/es.ts
export default {
  // ...existing keys...
  export: {
    pdf: {
      brief: 'Resumen',
      scenarios: 'Escenarios',
      drivingForces: 'Fuerzas motrices',
      // ...
    },
  },
};
```

Key mechanics:

- **`i18n.getFixedT(lang, ns, keyPrefix)`** returns a `t` function bound to a specific language **without changing the user's chrome language**. This is what makes export-in-Catalan possible while the UI stays in Spanish — the bug encountered in the previous session.
- The `tx()` function created at the top of the export run replaces `t3()` everywhere in the file. The diff is mechanical: each `t3('X','Y','Z')` becomes `tx('someKey')`, with the three strings moving into `en.ts`/`es.ts`/`ca.ts` under matching keys.
- For interpolations like `` `${n} preguntas abiertas` ``, use i18next's interpolation: `tx('openQuestionsCount', { count: n })` → `'{{count}} preguntas abiertas'`.
- Same treatment for `exportHtml.tsx` and `exportPpt.ts`.

This is the biggest single payoff of the localization refactor. After this lands, **adding a language touches zero export-pipeline code**.

### What's left after these three layers

You'll still have a few language-aware places that are inherently per-language and can't be abstracted:

- **The `<html lang>` attribute** — derived from `i18n.language`, one place.
- **Date formatting** — `LANGUAGES[lang].dateLocale` passed to `toLocaleDateString`. One pattern, used wherever dates appear.
- **The backend `langInstruction()`** — the per-language AI prompt prefix ("Idioma de salida: ESPAÑOL..."). This is genuinely per-language content and lives on the backend.

The backend has its own version of the same sprawl problem (`AssistantTools` enum, `SUPPORTED_LANGUAGES` `Set.of(...)`, `@Pattern(regexp = "^(es|en|ca)$")`, `langInstruction()` if/else chain). The mirror solution — a `LanguageRegistry` bean reading from `src/main/resources/languages.yaml` with `code`, `displayName`, `aiInstruction`, `translatePromptPrefix` — is the right answer but it's a backend refactor, out of scope for this addendum. Worth flagging as a parallel workstream.

### Adoption cost

| Layer | Effort | Notes |
|-------|--------|-------|
| 1 — Single registry | S (3–4 hrs) | Create `languages.ts`, replace `'es' \| 'en' \| 'ca'` with `LanguageCode` across ~20 files (mostly find-and-replace), replace 3 `LANGUAGE_OPTIONS` arrays with `Object.values(LANGUAGES)`. |
| 2 — Auto-discover | XS (1 hr) | One-file change to `i18n/index.ts`. |
| 3 — Kill `t3()` | M (1–2 days) | Extract ~35 strings from `exportPdf.ts`, ~10 from `exportHtml.tsx`, ~10 from `exportPpt.ts`. Each needs an i18n key + entries in 3 locale files. Mechanical but tedious. Best done as one PR per export module. |

### Acceptance test

After all three layers land, adding Italian is verifiably trivial:

```bash
# 1. Drop the locale file (copy ca.ts as starting point, translate values)
cp src/i18n/locales/ca.ts src/i18n/locales/it.ts

# 2. Register in the language registry — ONE line addition
# (edit src/i18n/languages.ts: add `it: { code: 'it', label: 'Italiano', dateLocale: 'it-IT' }`)

# 3. Done.
npm run build && npm test
```

Italian should appear in:

- The language picker on every modal (`ExportModal`, `ShareModal`, `AccountModal`/`ClerkPreferencesPage`)
- The dashboard "available languages" badges
- The export modal's per-language toggle
- The backend `@Pattern` validator (after the backend mirror lands)
- The PDF, HTML, and PPT exports (translating the prose, the date locale, the language label everywhere it appears)

If any of those still requires a code change, the abstraction has leaked and the offending spot is the bug.

---

## Phased rollout

**Phase 1 — Lint & types (1–2 days, blocking PR)**
Adds Prettier + new `eslint.config.js` + `tsconfig` strict flags. Lots of file changes but mechanical. Ship in one PR with `no-floating-promises` and `no-unsafe-*` at `warn`, fix in follow-ups, then promote to `error`.

**Phase 2 — Move data layer into features (3–5 days)**
For each feature: create `features/<x>/api/{queryKeys,fetchers,hooks}.ts`, port over what's in `src/hooks/useReports.ts` etc., update call sites. End state: nothing in `src/hooks/` except genuinely cross-cutting things. Add `staleTime` default. Add the 3-tier error handling. Add route-level error boundaries.

**Phase 2.5 — Localization plumbing (1–2 days)**
Layers 1 & 2 of the Localization addendum: ship the language registry + auto-discover. Touches type unions across the codebase but each individual edit is trivial. Unblocks the `t3()` removal in Phase 3.

**Phase 3 — Split the monoliths + kill `t3()` (1 week)**
One PR per file. Order by ROI: `exportPdf.ts` first (largest, most-isolated), then `NewReportPage`, then `ChatAssistant`, then `DashboardPage`. Each PR also moves the relevant types into `features/<x>/types.ts`. While splitting `exportPdf.ts` into `features/report/pdf/sections/*.ts`, do the `t3()` → `tx()` extraction at the same time (two-for-one).

**Phase 4 — Folder polish (1–2 days)**
Create `src/app/`. Move `AuthBridge` → `features/auth`, `ExportModal`/`ShareModal` → `features/report/components/`. Turn on `import/no-restricted-paths`. Add route lazy loading. Add `select` to high-traffic queries.

---

## Out of scope (deliberately)

- Zustand introduction. React Query + URL state + Context covers everything we have today.
- Replacing react-hook-form (we don't use it; introducing it is a Phase 2 sub-task, not a goal).
- CSS / styling refactor. Tailwind vs CSS modules vs current CSS is a separate conversation.
- Testing strategy beyond what's already there. The research recommends MSW + Vitest + Playwright but that's its own multi-week effort.
- React Compiler. Not stable enough yet to depend on; revisit Q3 2026.
- **Backend language registry** — the parallel workstream for `AssistantTools`, `langInstruction()`, `@Pattern` validators. Acknowledged in the Localization addendum, deferred to its own proposal.

---

## Sources

- **Bulletproof React** — https://github.com/alan2207/bulletproof-react
- **typescript-eslint configs** — https://typescript-eslint.io/users/configs/
- **TkDodo's React Query blog series** — https://tkdodo.eu/blog/practical-react-query
- **Patterns.dev — React section** — https://www.patterns.dev/react
