const DIMENSIONS = [
  { key: 'social',         label: 'Social' },
  { key: 'technological',  label: 'Tecnológico' },
  { key: 'economic',       label: 'Económico' },
  { key: 'environmental',  label: 'Ambiental' },
  { key: 'political',      label: 'Político' },
] as const;

type DimensionKey = typeof DIMENSIONS[number]['key'];

export type SteepData = Record<DimensionKey, string>;

interface Props {
  data: SteepData;
  companyProfile: string;
  onChange: (data: SteepData) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepSteep({ data, onChange, onNext, onBack }: Props) {
  const hasAny = DIMENSIONS.some((d) => data[d.key].trim());

  return (
    <div>
      <h1 className="wizard-page-title">Análisis STEEP</h1>
      <p className="wizard-page-desc">
        Identifica los factores del entorno por dimensión. Puedes escribirlos libremente —
        el botón ✦ IA estará disponible cuando conectes tu API key de Anthropic.
      </p>

      {DIMENSIONS.map((dim) => (
        <div key={dim.key} className="steep-section">
          <div className="steep-header">
            <span className="steep-title">{dim.label}</span>
            <button className="btn-ai" type="button" disabled title="Requiere API key de Anthropic">
              ✦ Sugerir con IA
            </button>
          </div>
          <div className="steep-body">
            <textarea
              className="wtextarea"
              placeholder={`Factores ${dim.label.toLowerCase()}es relevantes para tu organización...`}
              value={data[dim.key]}
              onChange={(e) => onChange({ ...data, [dim.key]: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      ))}

      <div className="wizard-footer">
        <button type="button" className="btn-back" onClick={onBack}>
          ← Volver
        </button>
        <button
          type="button"
          className="btn-next"
          onClick={onNext}
          disabled={!hasAny}
        >
          Continuar — Horizon Scan →
        </button>
      </div>
    </div>
  );
}
