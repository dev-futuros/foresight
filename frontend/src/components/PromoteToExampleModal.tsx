import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useReport } from '../hooks/useReports';
import { usePromoteToExample } from '../hooks/useExamples';
import { extractApiErrorMessage } from '../lib/apiError';

interface Props {
  open: boolean;
  reportId: string;
  onClose: () => void;
}

/** kebab-case validator matching the backend's regex on PromoteToExampleRequest.slug. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Derive a sensible default slug from a free-form title — lowercase,
 * strip accents/diacritics, replace non-alphanumeric runs with single
 * hyphens, trim leading/trailing hyphens, and cap at 60 chars so the
 * suggestion always passes the backend's 120-char limit with headroom.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * DEV-only modal that promotes the report at {@code reportId} into a
 * global example. Asks for a stable {@code slug} (the upsert key —
 * re-promoting with the same slug overwrites the existing example) plus
 * optional title / description overrides.
 *
 * <p>Closes itself on success after invalidating the examples list cache
 * so the dashboard reflects the new row immediately. Error message
 * surfaces inline so the dev can fix the slug and retry without losing
 * their typing.
 */
export default function PromoteToExampleModal({ open, reportId, onClose }: Props) {
  const { t } = useTranslation();
  const reportQuery = useReport(reportId);
  const promote = usePromoteToExample();

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Track whether the user has hand-edited the slug so we don't overwrite
  // their input on every re-render of the source report's title.
  const [slugDirty, setSlugDirty] = useState(false);

  const defaultSlug = useMemo(
    () => (reportQuery.data?.title ? slugify(reportQuery.data.title) : ''),
    [reportQuery.data],
  );

  // Reset the form whenever the modal opens against a different report.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-on-open: the form must snap back to defaults for each new report
      setSlug(defaultSlug);
      setTitle('');
      setDescription('');
      setSlugDirty(false);
      promote.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reportId]);

  // Keep slug in sync with the suggested default until the user starts
  // editing it — once they touch the field, we stop overwriting.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror defaultSlug into slug until the user takes ownership of the field
    if (open && !slugDirty) setSlug(defaultSlug);
  }, [open, slugDirty, defaultSlug]);

  const slugValid = SLUG_RE.test(slug);
  const canSubmit = slugValid && !promote.isPending && !!reportQuery.data;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await promote.mutateAsync({
        reportId,
        body: {
          slug,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
        },
      });
      onClose();
    } catch {
      // mutation error surfaced via promote.error below
    }
  }

  const errorMessage = promote.error
    ? extractApiErrorMessage(
        promote.error,
        t('promoteExample.errorDefault', { defaultValue: 'Could not promote this report.' }),
      )
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={t('promoteExample.title', { defaultValue: 'Promote to example' })}
      dialogClassName="modal-dialog--share"
    >
      <form onSubmit={handleSubmit}>
        <div className="share-eyebrow">
          {t('promoteExample.eyebrow', { defaultValue: 'Examples' })}
        </div>
        <h2 className="modal-title">
          {t('promoteExample.title', { defaultValue: 'Promote to example' })}
        </h2>
        <p className="share-meta" style={{ marginBottom: 14 }}>
          {t('promoteExample.desc', {
            defaultValue:
              'Snapshots this report as a global example visible to every user. Re-promote with the same slug to overwrite.',
          })}
        </p>

        <div className="share-lang-row">
          <label htmlFor="promote-slug" className="share-lang-label">
            {t('promoteExample.slug', { defaultValue: 'Slug' })}
          </label>
          <input
            id="promote-slug"
            type="text"
            className="share-lang-select"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugDirty(true);
            }}
            placeholder="example-slug"
            disabled={promote.isPending}
            aria-invalid={!slugValid}
          />
        </div>
        {!slugValid && slug.length > 0 && (
          <p className="share-meta" style={{ color: 'var(--red)', marginBottom: 14 }}>
            {t('promoteExample.slugInvalid', {
              defaultValue: 'Use lowercase letters, digits and single hyphens (kebab-case).',
            })}
          </p>
        )}

        <div className="share-lang-row">
          <label htmlFor="promote-title" className="share-lang-label">
            {t('promoteExample.titleOverride', { defaultValue: 'Title' })}
          </label>
          <input
            id="promote-title"
            type="text"
            className="share-lang-select"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={reportQuery.data?.title ?? ''}
            disabled={promote.isPending}
          />
        </div>

        <div className="share-lang-row">
          <label htmlFor="promote-description" className="share-lang-label">
            {t('promoteExample.description', { defaultValue: 'Description' })}
          </label>
          <input
            id="promote-description"
            type="text"
            className="share-lang-select"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('promoteExample.descriptionPlaceholder', {
              defaultValue: 'Optional one-liner shown under the title',
            })}
            disabled={promote.isPending}
          />
        </div>

        {errorMessage && (
          <div className="err-box" role="alert">
            {errorMessage}
          </div>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn"
            onClick={onClose}
            disabled={promote.isPending}
          >
            {t('common.close')}
          </button>
          <button
            type="submit"
            className="modal-btn modal-btn--primary"
            disabled={!canSubmit}
          >
            {promote.isPending
              ? t('promoteExample.submitting', { defaultValue: 'Promoting…' })
              : t('promoteExample.submit', { defaultValue: 'Promote' })}
          </button>
        </div>
      </form>
    </Modal>
  );
}
