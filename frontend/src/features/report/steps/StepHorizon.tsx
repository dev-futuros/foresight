const HORIZONS = [
  { key: 'H1', label: 'H1 — Corto plazo',  desc: '0–2 años. Lo que ya está ocurriendo o emergiendo.' },
  { key: 'H2', label: 'H2 — Medio plazo',  desc: '2–5 años. Tendencias que están tomando forma.' },
  { key: 'H3', label: 'H3 — Largo plazo',  desc: '5+ años. Señales débiles y transformaciones posibles.' },
] as const;

type HorizonKey = typeof HORIZONS[number]['key'];

export type HorizonData = Record<HorizonKey, string>;

interface Props {
  data: HorizonData;
  companyProfile: string;
  onChange: (data: HorizonData) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export default function StepHorizon({ data, onChange, onSubmit, onBack, isSubmitting }: Props) {
  const hasAny = HORIZONS.some((h) => data[h.key].trim());

  return (
    <div>
      <h1 className="wizard-page-title">Horizon Scan</h1>
      <p className="wizard-page-desc">
        Explora señales de cambio por horizonte temporal. Alimenta los escenarios con
        mayor riqueza. El botón ✦ IA estará disponible cuando conectes tu API key.
      </p>

      {HORIZONS.map((h) => (
        <div key={h.key} className="horizon-section">
          <div className="horizon-label">
            <span className="horizon-badge">{h.key}</span>
            <span className="horizon-desc">{h.desc}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn-ai" type="button" disabled title="Requiere API key de Anthropic">
              ✦ Sugerir con IA
            </button>
          </div>
          <textarea
            className="wtextarea"
            placeholder={`Señales de cambio para ${h.key}...`}
            value={data[h.key]}
            onChange={(e) => onChange({ ...data, [h.key]: e.target.value })}
            rows={3}
          />
        </div>
      ))}

      <div className="wizard-footer">
        <button type="button" className="btn-back" onClick={onBack} disabled={isSubmitting}>
          ← Volver
        </button>
        <button
          type="button"
          className="btn-next"
          onClick={onSubmit}
          disabled={!hasAny || isSubmitting}
        >
          {isSubmitting ? <span className="btn-spinner" /> : 'Generar informe ✦'}
        </button>
      </div>
    </div>
  );
}
