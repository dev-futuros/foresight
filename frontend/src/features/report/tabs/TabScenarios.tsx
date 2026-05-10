import type { ResultData } from '../ReportContent';

/** Escenarios 3P tab — same scenario cards as the summary, but on its own
 *  surface so the user can focus on them without the surrounding context. */
export default function TabScenarios({ result }: { result: ResultData }) {
  if (!result.scenarios || result.scenarios.length === 0) return null;
  return (
    <div className="scenarios-grid scenarios-grid--full">
      {result.scenarios.map((s) => (
        <article key={s.type} className="scen-card">
          <div className="scen-stripe" aria-hidden />
          <div className="scen-type-badge">{s.type}</div>
          <h3 className="scen-name">{s.title}</h3>
          <p className="scen-desc">{s.description}</p>
        </article>
      ))}
    </div>
  );
}
