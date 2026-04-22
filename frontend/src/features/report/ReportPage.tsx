import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useReport } from '../../hooks/useReports';
import './report.css';

type Tab = 'inputs' | 'resultados';

const STEEP_LABELS: Record<string, string> = {
  social: 'Social',
  technological: 'Tecnológico',
  economic: 'Económico',
  environmental: 'Ambiental',
  political: 'Político',
};

const HORIZON_LABELS: Record<string, string> = {
  H1: 'H1 — Corto plazo (0–2 años)',
  H2: 'H2 — Medio plazo (2–5 años)',
  H3: 'H3 — Largo plazo (5+ años)',
};

export default function ReportPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: report, isLoading, isError } = useReport(id!);
  const [tab, setTab] = useState<Tab>('inputs');

  if (isLoading) return <div className="loading-screen">{t('report.loading')}</div>;
  if (isError || !report) return <div className="loading-screen" style={{ color: '#f87171' }}>{t('report.notFound')}</div>;

  const input = report.inputData as {
    companyProfile: { name: string; sector: string; horizon: string; challenge: string };
    steep: Record<string, string>;
    horizon: Record<string, string>;
  };

  const formattedDate = new Date(report.createdAt).toLocaleDateString(
    i18n.language === 'en' ? 'en-GB' : 'es-ES',
    { day: '2-digit', month: 'short', year: 'numeric' }
  );

  return (
    <div className="report-page">
      <nav className="report-nav">
        <div className="report-nav-left">
          <Link to="/dashboard" className="btn-back-nav">{t('report.backToDashboard')}</Link>
          <span className="report-title-nav">{report.title}</span>
        </div>
        <span className={`status-badge ${report.status}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: '20px' }}>
          {t(`report.status.${report.status}`)}
        </span>
      </nav>

      <div className="report-header">
        <p className="report-eyebrow">{t('report.eyebrow')}</p>
        <h1 className="report-main-title">{report.title}</h1>
        <div className="report-meta">
          <span className="report-meta-item">{t('report.meta.created', { date: formattedDate })}</span>
          {input?.companyProfile?.horizon && (
            <span className="report-meta-item">{t('report.meta.horizon', { value: input.companyProfile.horizon })}</span>
          )}
          {input?.companyProfile?.sector && (
            <span className="report-meta-item">· {input.companyProfile.sector}</span>
          )}
        </div>
      </div>

      <div className="report-tabs">
        <button className={`tab-btn ${tab === 'inputs' ? 'active' : ''}`} onClick={() => setTab('inputs')}>
          {t('report.tabs.inputs')}
        </button>
        <button className={`tab-btn ${tab === 'resultados' ? 'active' : ''}`} onClick={() => setTab('resultados')}>
          {t('report.tabs.results')}
        </button>
      </div>

      <div className="report-content">
        {tab === 'inputs' && (
          <div>
            <div className="input-grid">
              <div className="input-card">
                <div className="input-card-label">{t('report.inputs.organization')}</div>
                <div className="input-card-value">{input?.companyProfile?.name || '—'}</div>
              </div>
              <div className="input-card">
                <div className="input-card-label">{t('report.inputs.sector')}</div>
                <div className="input-card-value">{input?.companyProfile?.sector || '—'}</div>
              </div>
              <div className="input-card full">
                <div className="input-card-label">{t('report.inputs.challenge')}</div>
                <div className="input-card-value">{input?.companyProfile?.challenge || '—'}</div>
              </div>
            </div>

            {input?.steep && (
              <>
                <p className="input-card-label" style={{ marginBottom: '0.75rem' }}>{t('report.inputs.steep')}</p>
                <div className="steep-grid">
                  {Object.entries(input.steep).map(([key, value]) =>
                    value ? (
                      <div key={key} className="input-card">
                        <div className="input-card-label">{STEEP_LABELS[key] || key}</div>
                        <div className="input-card-value">{value}</div>
                      </div>
                    ) : null
                  )}
                </div>
              </>
            )}

            {input?.horizon && (
              <>
                <p className="input-card-label" style={{ marginBottom: '0.75rem' }}>{t('report.inputs.horizon')}</p>
                <div className="horizon-list">
                  {Object.entries(input.horizon).map(([key, value]) =>
                    value ? (
                      <div key={key} className="input-card">
                        <div className="input-card-label">{HORIZON_LABELS[key] || key}</div>
                        <div className="input-card-value">{value}</div>
                      </div>
                    ) : null
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {tab === 'resultados' && !report.resultData && (
          <div className="report-draft-state">
            <div className="report-draft-icon">◈</div>
            <h2 className="report-draft-title">{t('report.results.pendingTitle')}</h2>
            <p className="report-draft-desc">{t('report.results.pendingDesc')}</p>
            <button className="btn-analyze" disabled>
              {t('report.results.generateBtn')}
            </button>
          </div>
        )}

        {tab === 'resultados' && report.resultData && (() => {
          const r = report.resultData as {
            scenarios?: { type: string; title: string; description: string }[];
            weakSignals?: string[];
            wildcards?: string[];
            keyUncertainties?: string[];
          };
          return (
            <div>
              {r.scenarios && r.scenarios.length > 0 && (
                <>
                  <p className="input-card-label" style={{ marginBottom: '0.75rem' }}>{t('report.results.scenarios')}</p>
                  <div className="steep-grid" style={{ marginBottom: '1.5rem' }}>
                    {r.scenarios.map((s) => (
                      <div key={s.type} className="input-card">
                        <div className="input-card-label">{s.type}</div>
                        <div className="input-card-value" style={{ fontWeight: 500, marginBottom: '0.4rem' }}>{s.title}</div>
                        <div className="input-card-value" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{s.description}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {r.keyUncertainties && r.keyUncertainties.length > 0 && (
                <>
                  <p className="input-card-label" style={{ marginBottom: '0.75rem' }}>{t('report.results.uncertainties')}</p>
                  <div className="input-card full" style={{ marginBottom: '1.5rem' }}>
                    <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {r.keyUncertainties.map((u, i) => (
                        <li key={i} className="input-card-value">{u}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {r.weakSignals && r.weakSignals.length > 0 && (
                <>
                  <p className="input-card-label" style={{ marginBottom: '0.75rem' }}>{t('report.results.weakSignals')}</p>
                  <div className="input-card full" style={{ marginBottom: '1.5rem' }}>
                    <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {r.weakSignals.map((s, i) => (
                        <li key={i} className="input-card-value">{s}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {r.wildcards && r.wildcards.length > 0 && (
                <>
                  <p className="input-card-label" style={{ marginBottom: '0.75rem' }}>{t('report.results.wildcards')}</p>
                  <div className="input-card full">
                    <ul style={{ paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {r.wildcards.map((w, i) => (
                        <li key={i} className="input-card-value">{w}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
