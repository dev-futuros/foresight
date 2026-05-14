import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { suggestHorizon, type SuggestionItem } from '../../../lib/aiClient';
import { extractApiErrorMessage } from '../../../lib/apiError';
import { useMaximizable } from '../../../components/useMaximizable';
import SplitButton from '../../../components/SplitButton';
import '../../../components/splitButton.css';

const HORIZON_KEYS = ['H1', 'H2', 'H3'] as const;

type HorizonKey = (typeof HORIZON_KEYS)[number];

export type HorizonData = Record<HorizonKey, string>;

interface Props {
  data: HorizonData;
  companyProfile: string;
  language: 'es' | 'en' | 'ca';
  onChange: (data: HorizonData) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
  /** Surfaced as a global error box above the action row when the parent's
   *  generate-analysis pipeline (create → analyze → update) fails. */
  error?: string | null;
  /**
   * True when the wizard's report already has analysis output. Swaps
   * the primary action from "Generate" to "Continue" (which jumps
   * straight to the report viewer via {@link Props#onContinueToReport})
   * and exposes "Regenerate" in the dropdown.
   */
  hasReport?: boolean;
  /**
   * Navigates the user to the existing report viewer for this draft.
   * Invoked only when the user picks "Continue" on a draft that's
   * already been analysed.
   */
  onContinueToReport?: () => void;
  /**
   * When true, the Generate action is disabled — used when the wizard
   * is loaded against a global example (read-only content). The
   * Continue action stays enabled so the user can still navigate to
   * the example's viewer.
   */
  disableGenerate?: boolean;
}

/** Cap suggestions defensively — AI is asked for 3–5 but may return more. */
const MAX_SUGGESTIONS = 5;

type SuggestionsByKey = Partial<Record<HorizonKey, SuggestionItem[]>>;
type LoadingByKey = Partial<Record<HorizonKey, boolean>>;
type ErrorByKey = Partial<Record<HorizonKey, string>>;
type UsedByKey = Partial<Record<HorizonKey, boolean>>;

export default function StepHorizon({
  data,
  companyProfile,
  language,
  onChange,
  onSubmit,
  onBack,
  isSubmitting,
  error,
  hasReport,
  onContinueToReport,
  disableGenerate = false,
}: Props) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<SuggestionsByKey>({});
  const [loading, setLoading] = useState<LoadingByKey>({});
  const [errors, setErrors] = useState<ErrorByKey>({});
  /** Mirror of StepSteep: one shot per horizon, no re-runs. */
  const [used, setUsed] = useState<UsedByKey>({});
  const max = useMaximizable<HorizonKey>();

  const hasAny = HORIZON_KEYS.some((k) => data[k].trim());
  const canSuggest = companyProfile.trim().length > 0;

  async function requestSuggestions(horizon: HorizonKey) {
    if (!canSuggest || used[horizon]) return;
    setLoading((prev) => ({ ...prev, [horizon]: true }));
    setErrors((prev) => ({ ...prev, [horizon]: undefined }));
    try {
      const items = await suggestHorizon({ horizon, companyProfile, language });
      setSuggestions((prev) => ({ ...prev, [horizon]: items.slice(0, MAX_SUGGESTIONS) }));
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        [horizon]: extractApiErrorMessage(e, t('wizard.horizon.errorDefault')),
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [horizon]: false }));
      // One-shot: mark used regardless of outcome so the user can't spam the
      // AI on errors. They can still type signals manually.
      setUsed((prev) => ({ ...prev, [horizon]: true }));
    }
  }

  function appendSuggestion(horizon: HorizonKey, item: SuggestionItem) {
    const current = data[horizon].trimEnd();
    const next = current ? `${current}\n${item.title}` : item.title;
    onChange({ ...data, [horizon]: next });
  }

  return (
    <div>
      {max.activeKey && (
        <div className="maximize-backdrop" onClick={max.minimize} aria-hidden />
      )}
      <div className="eyebrow">{t('wizard.horizon.eyebrow')}</div>
      <h1 className="page-title">{t('wizard.horizon.title')}</h1>
      <p className="page-desc">{t('wizard.horizon.description')}</p>

      <div className="horizon-stack">
        {HORIZON_KEYS.map((key) => {
          const k = key.toLowerCase(); // 'h1' | 'h2' | 'h3' — both class modifier and dim-icon variant
          const isMax = max.isMaximized(key);
          const bandSuggestions = suggestions[key] ?? [];
          const bandLoading = loading[key] ?? false;
          const bandUsed = used[key] ?? false;
          const bandError = errors[key];
          return (
            <div key={key} className={`h-card ${k}${isMax ? ' maximized' : ''}`}>
              <div className="h-card-head">
                <div className="h-card-head-left">
                  <div className={`dim-icon ${k}`}>{key}</div>
                  <div>
                    <div className={`h-label ${k}`}>
                      {t(`wizard.horizon.bands.${key}.label`)}
                    </div>
                    <div className="h-sub">{t(`wizard.horizon.bands.${key}.desc`)}</div>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className={`btn btn-ai${bandUsed && !bandLoading ? ' used' : ''}`}
                    type="button"
                    onClick={() => requestSuggestions(key)}
                    disabled={bandLoading || bandUsed || !canSuggest}
                    title={
                      canSuggest
                        ? t('wizard.horizon.aiTooltip')
                        : t('wizard.horizon.aiTooltipDisabled')
                    }
                  >
                    {bandLoading ? <span className="btn-ai-spinner" /> : '✦'}{' '}
                    {t('wizard.horizon.aiSuggest')}
                  </button>
                  <button
                    type="button"
                    className="maximize-btn"
                    onClick={() => max.toggle(key)}
                    aria-label={isMax ? t('wizard.minimize') : t('wizard.maximize')}
                    title={isMax ? t('wizard.minimize') : t('wizard.maximize')}
                  >
                    <svg className="ico" aria-hidden>
                      <use href={`#${isMax ? 'i-minimize' : 'i-maximize'}`} />
                    </svg>
                  </button>
                </div>
              </div>

              <textarea
                /* id matches the setField target (hs-h1 / hs-h2 / hs-h3)
                   so the gold flash in NewReportPage's setField handler
                   can find this textarea. */
                id={`hs-${key.toLowerCase()}`}
                placeholder={t(`wizard.horizon.placeholders.${key}`)}
                value={data[key]}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              />

              {bandSuggestions.length > 0 && (
                <div className="tags-wrap">
                  {bandSuggestions.map((s, j) => (
                    <button
                      key={j}
                      type="button"
                      className="sug-tag"
                      title={s.description}
                      onClick={() => appendSuggestion(key, s)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}

              {bandError && (
                <div className="err-box" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
                  {bandError}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="err-box">{error}</div>}

      <div className="btn-row">
        <button type="button" className="btn" onClick={onBack} disabled={isSubmitting}>
          {t('wizard.back')}
        </button>
        {/* Both options are always passed in. Primary defaults to
            Continue when a report already exists, Generate otherwise.
            When there's no report yet, Continue stays in the dropdown
            but is disabled — the user sees it's an option for once the
            report is built rather than getting a magic-appearing menu. */}
        {(() => {
          const continueOption = {
            key: 'continue' as const,
            label: t('wizard.horizon.submitContinue'),
            onClick: onContinueToReport,
            disabled: !hasReport,
          };
          const generateOption = {
            key: 'generate' as const,
            label: isSubmitting ? (
              <span className="btn-spinner" />
            ) : (
              t('wizard.horizon.submit')
            ),
            onClick: onSubmit,
            // Defence in depth — examples normally end up with Generate
            // omitted from the options list (see below), so this only
            // fires in the rare theoretical case where Generate is the
            // primary action AND disableGenerate is true (an example
            // without resultData, which the promote flow refuses).
            disabled: disableGenerate,
          };
          // Example mode: Generate is omitted entirely (no dropdown when
          // there's nothing else to pick) so the user can only Continue
          // back to the viewer. Spending AI budget against read-only
          // content would only produce throwaway results, and hiding is
          // a cleaner affordance than a disabled menu item the user has
          // to discover.
          const primaryAction = hasReport ? continueOption : generateOption;
          const altActions = disableGenerate
              ? (hasReport ? [] : [continueOption])
              : [hasReport ? generateOption : continueOption];
          return (
            <SplitButton
              disabled={!hasAny || isSubmitting}
              menuAriaLabel={t('wizard.horizon.submitMenuAria')}
              primary={primaryAction}
              options={altActions}
            />
          );
        })()}
      </div>
    </div>
  );
}
