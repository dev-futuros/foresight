export interface EmpresaData {
  name: string;
  sector: string;
  horizon: string;
  challenge: string;
}

interface Props {
  data: EmpresaData;
  onChange: (data: EmpresaData) => void;
  onNext: () => void;
}

export default function StepEmpresa({ data, onChange, onNext }: Props) {
  const valid = data.name.trim() && data.sector.trim() && data.challenge.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (valid) onNext();
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1 className="wizard-page-title">Perfil de empresa</h1>
      <p className="wizard-page-desc">
        Define el contexto organizativo. Esta información guiará todo el análisis de foresight.
      </p>

      <div className="wfield">
        <label className="wlabel" htmlFor="name">Nombre de la organización</label>
        <input
          id="name"
          className="winput"
          type="text"
          placeholder="Ej: Acme Mobility"
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
          required
        />
      </div>

      <div className="wfield">
        <label className="wlabel" htmlFor="sector">Sector / industria</label>
        <input
          id="sector"
          className="winput"
          type="text"
          placeholder="Ej: Movilidad urbana eléctrica"
          value={data.sector}
          onChange={(e) => onChange({ ...data, sector: e.target.value })}
          required
        />
      </div>

      <div className="wfield">
        <label className="wlabel" htmlFor="horizon">Horizonte temporal</label>
        <select
          id="horizon"
          className="wselect"
          value={data.horizon}
          onChange={(e) => onChange({ ...data, horizon: e.target.value })}
        >
          <option value="3">3 años</option>
          <option value="5">5 años</option>
          <option value="10">10 años</option>
        </select>
      </div>

      <div className="wfield">
        <label className="wlabel" htmlFor="challenge">Reto estratégico a explorar</label>
        <textarea
          id="challenge"
          className="wtextarea"
          placeholder="Ej: ¿Cómo adaptarnos al cambio regulatorio en movilidad eléctrica en Europa para 2030?"
          value={data.challenge}
          onChange={(e) => onChange({ ...data, challenge: e.target.value })}
          rows={4}
          required
        />
      </div>

      <div className="wizard-footer">
        <span />
        <button type="submit" className="btn-next" disabled={!valid}>
          Continuar — Análisis STEEP →
        </button>
      </div>
    </form>
  );
}
