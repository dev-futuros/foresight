import type { EmpresaData } from '../features/report/steps/StepEmpresa';
import type { GlobalSteepData } from '../features/report/steps/StepGlobal';
import type { SteepData } from '../features/report/steps/StepSteep';
import type { HorizonData } from '../features/report/steps/StepHorizon';
import type { ReportSummary } from '../types/api';

/**
 * Inputs that feed the snapshot. Pass whatever's known; missing pieces become
 * {@code (empty)} markers so the assistant always sees the full set of field
 * IDs it can write to.
 */
export interface AssistantSnapshotInput {
  language: 'es' | 'en';
  /** Wizard step the user is currently on (1-6). When the user is on a
   *  non-wizard route, pass the closest meaningful step:
   *  - dashboard or account → 1 (the typical first step they'd return to)
   *  - report viewer → 6 (results) */
  currentStep: number;
  /** Whether the dashboard route is the active one. The assistant needs
   *  this so it doesn't tell the user to "open the dashboard" when it's
   *  already open, or vice versa. */
  dashboardOpen: boolean;
  /** Wizard form state. When the user isn't in the wizard, pass the empty
   *  defaults so the snapshot still emits the full field listing — the
   *  {@code (empty)} markers teach the assistant which fields exist. */
  empresa: EmpresaData;
  globalSteep: GlobalSteepData;
  steep: SteepData;
  horizon: HorizonData;
  /** User's saved reports — surfaced so the assistant can pass an `id` to
   *  loadReport / editReport / shareReport / exportPDF / exportPPT without
   *  the user loading the report first. */
  reports?: ReportSummary[];
}

/**
 * Builds the localized USER STATE block that gets stitched into the chat
 * system prompt. Mirrors the staging demo's {@code buildChatContextSnapshot}
 * — same anti-hallucination markers, same human-readable layout, same
 * "every field listed even when empty" policy that prevents the assistant
 * from concluding empty fields aren't visible.
 */
export function buildAssistantSnapshot(input: AssistantSnapshotInput): string {
  const { language, currentStep, dashboardOpen, empresa, globalSteep, steep, horizon, reports } = input;
  const isEn = language === 'en';
  const lines: string[] = [];

  const stepLabels = isEn
    ? {
        1: 'Step 1 — Company information',
        2: 'Step 2 — Global STEEP context',
        3: 'Step 3 — Sectorial analysis',
        4: 'Step 4 — Horizon scan',
        5: 'Step 5 — Generating analysis',
        6: 'Step 6 — Report results',
      }
    : {
        1: 'Paso 1 — Información de empresa',
        2: 'Paso 2 — Contexto STEEP Global',
        3: 'Paso 3 — Análisis Sectorial',
        4: 'Paso 4 — Horizon scan',
        5: 'Paso 5 — Generando análisis',
        6: 'Paso 6 — Resultados del informe',
      };

  const fieldLabelsCompany: Record<string, string> = isEn
    ? {
        'f-name': 'Name',
        'f-sector': 'Sector',
        'f-size': 'Size',
        'f-horizon': 'Horizon',
        'f-market': 'Market',
        'f-challenge': 'Strategic challenge',
        'f-strengths': 'Capabilities/strengths',
      }
    : {
        'f-name': 'Nombre',
        'f-sector': 'Sector',
        'f-size': 'Tamaño',
        'f-horizon': 'Horizonte',
        'f-market': 'Mercado',
        'f-challenge': 'Reto estratégico',
        'f-strengths': 'Capacidades',
      };

  const steepDimLabels: Record<keyof GlobalSteepData, string> = isEn
    ? { S: 'Social', T: 'Technological', E: 'Economic', ENV: 'Environmental', P: 'Political' }
    : { S: 'Social', T: 'Tecnológico', E: 'Económico', ENV: 'Medioambiental', P: 'Político' };

  const horizonLabels: Record<keyof HorizonData, string> = isEn
    ? { H1: 'H1 (0-2y, already visible)', H2: 'H2 (2-5y, emerging)', H3: 'H3 (5+y, systemic)' }
    : { H1: 'H1 (0-2 años, ya visibles)', H2: 'H2 (2-5 años, emergentes)', H3: 'H3 (5+ años, sistémicos)' };

  const stepKeyL = isEn ? 'CURRENT STEP: ' : 'PASO ACTUAL: ';
  const visKeyL = isEn
    ? 'USER IS LOOKING AT (these field IDs resolve any unqualified reference like "these fields", "this section", "this page", "current step"): '
    : 'EL USUARIO ESTÁ MIRANDO (estos IDs de campos resuelven cualquier referencia sin nombrar específicamente como "estos campos", "esta sección", "esta página", "el paso actual"): ';
  const emptyKeyL = isEn
    ? 'USER IS LOOKING AT (currently empty — same dereferencing rule as above): '
    : 'EL USUARIO ESTÁ MIRANDO (actualmente vacíos — misma regla de dereferencia que arriba): ';
  const allWritableNote = isEn
    ? 'NOTE: every form field listed below is writable via setField from ANY step — there is no concept of "fields on this step are accessible, fields on other steps aren\'t." If a field appears below (even marked "(empty)"), you can write to it right now, regardless of which step the user is on.'
    : 'NOTA: todo campo del formulario listado abajo es escribible vía setField desde CUALQUIER paso — no existe el concepto de "los campos de este paso son accesibles, los de otros pasos no". Si un campo aparece abajo (incluso marcado como "(vacío)"), puedes escribir en él ahora mismo, independientemente del paso en el que esté el usuario.';

  const yearsWord = isEn ? ' years' : ' años';
  const tCompany = isEn ? '\nCOMPANY (Step 1 inputs):' : '\nEMPRESA (inputs del Paso 1):';
  const tGS = isEn
    ? '\nGLOBAL STEEP (Step 2 — current text in each dimension):'
    : '\nSTEEP GLOBAL (Paso 2 — texto actual en cada dimensión):';
  const tST = isEn
    ? '\nSECTORIAL (Step 3 — current text in each STEEP dimension):'
    : '\nSECTORIAL (Paso 3 — texto actual en cada dimensión STEEP):';
  const tHS = isEn
    ? '\nHORIZON SCAN (Step 4 — current signals):'
    : '\nHORIZON SCAN (Paso 4 — señales actuales):';

  // ── Header: current step + dashboard state ──
  lines.push(stepKeyL + (stepLabels[currentStep as 1 | 2 | 3 | 4 | 5 | 6] || `Step ${currentStep}`));
  const dashLineL = isEn
    ? dashboardOpen
      ? 'DASHBOARD: open (user is looking at the saved-reports panel, NOT the step view above)'
      : 'DASHBOARD: closed (user is looking at the step view, the dashboard panel is hidden)'
    : dashboardOpen
      ? 'PANEL: abierto (el usuario está mirando el panel de informes guardados, NO la vista del paso de arriba)'
      : 'PANEL: cerrado (el usuario está mirando la vista del paso, el panel está oculto)';
  lines.push(dashLineL);

  // Map step → list of field IDs that are visually adjacent to the user
  // right now. Used for resolving "these fields" / "this section" /
  // "current step" without naming a specific dimension.
  const fieldsByStep: Record<number, string[]> = {
    1: ['f-name', 'f-sector', 'f-size', 'f-horizon', 'f-market', 'f-challenge', 'f-strengths'],
    2: ['gs-s', 'gs-t', 'gs-e', 'gs-env', 'gs-p'],
    3: ['steep-s', 'steep-t', 'steep-e', 'steep-env', 'steep-p'],
    4: ['hs-h1', 'hs-h2', 'hs-h3'],
    5: [],
    6: [],
  };
  const stepFields = fieldsByStep[currentStep] ?? [];
  const fieldValueById: Record<string, string> = {
    'f-name': empresa.name, 'f-sector': empresa.sector, 'f-size': empresa.size,
    'f-horizon': empresa.horizon, 'f-market': empresa.market,
    'f-challenge': empresa.challenge, 'f-strengths': empresa.strengths,
    'gs-s': globalSteep.S, 'gs-t': globalSteep.T, 'gs-e': globalSteep.E,
    'gs-env': globalSteep.ENV, 'gs-p': globalSteep.P,
    'steep-s': steep.social, 'steep-t': steep.technological, 'steep-e': steep.economic,
    'steep-env': steep.environmental, 'steep-p': steep.political,
    'hs-h1': horizon.H1, 'hs-h2': horizon.H2, 'hs-h3': horizon.H3,
  };
  const visible = stepFields.filter((id) => (fieldValueById[id] ?? '').trim().length > 0);
  if (visible.length) {
    lines.push(visKeyL + visible.join(', '));
  } else if (stepFields.length) {
    lines.push(emptyKeyL + stepFields.join(', '));
  }
  lines.push(allWritableNote);

  // ── Step 1: company info ──
  // Always emit every field, even when empty. Hiding empty fields caused a
  // real bug in the demo: the assistant saw only populated dropdowns and
  // concluded the others "weren't visible," telling the user to scroll.
  // The (empty) marker keeps the cost small (~6 extra lines when fully
  // blank) and gives the assistant a complete mental model of the form.
  const dropdownOpts: Record<string, string[]> = {
    'f-size': ['startup', 'pyme', 'mediana', 'grande'],
    'f-horizon': ['3', '5', '10'],
    'f-market': ['local', 'european', 'global'],
  };
  const opt = (id: string) => ` [valid values: ${dropdownOpts[id].join(' | ')}]`;
  const emptyMark = isEn ? '(empty)' : '(vacío)';
  const cell = (raw: string) => (raw && raw.trim() ? raw : emptyMark);

  lines.push(tCompany);
  lines.push(`- f-name (${fieldLabelsCompany['f-name']}): ${cell(empresa.name)}`);
  lines.push(`- f-sector (${fieldLabelsCompany['f-sector']}): ${cell(empresa.sector)}`);
  lines.push(`- f-size (${fieldLabelsCompany['f-size']}): ${cell(empresa.size)}${opt('f-size')}`);
  // f-horizon shows the years suffix when populated (e.g. "5 years"); empty
  // stays as the marker.
  lines.push(
    `- f-horizon (${fieldLabelsCompany['f-horizon']}): ${
      empresa.horizon.trim() ? empresa.horizon + yearsWord : emptyMark
    }${opt('f-horizon')}`,
  );
  lines.push(`- f-market (${fieldLabelsCompany['f-market']}): ${cell(empresa.market)}${opt('f-market')}`);
  lines.push(`- f-challenge (${fieldLabelsCompany['f-challenge']}): ${cell(empresa.challenge)}`);
  lines.push(`- f-strengths (${fieldLabelsCompany['f-strengths']}): ${cell(empresa.strengths)}`);

  // ── Step 2: global STEEP ──
  lines.push(tGS);
  (['S', 'T', 'E', 'ENV', 'P'] as const).forEach((k) => {
    const id = k === 'ENV' ? 'gs-env' : `gs-${k.toLowerCase()}`;
    lines.push(`- ${id} (${steepDimLabels[k]}): ${cell(globalSteep[k])}`);
  });

  // ── Step 3: sectorial STEEP ──
  lines.push(tST);
  const stMap: Array<[keyof SteepData, string, keyof GlobalSteepData]> = [
    ['social', 'steep-s', 'S'],
    ['technological', 'steep-t', 'T'],
    ['economic', 'steep-e', 'E'],
    ['environmental', 'steep-env', 'ENV'],
    ['political', 'steep-p', 'P'],
  ];
  stMap.forEach(([key, id, dim]) => {
    lines.push(`- ${id} (${steepDimLabels[dim]}): ${cell(steep[key])}`);
  });

  // ── Step 4: horizon scan ──
  lines.push(tHS);
  (['H1', 'H2', 'H3'] as const).forEach((k) => {
    lines.push(`- hs-${k.toLowerCase()} (${horizonLabels[k]}): ${cell(horizon[k])}`);
  });

  // ── Saved reports ──
  // Surface so the assistant can pass an `id` to loadReport / editReport /
  // shareReport / exportPDF / exportPPT without the user loading first.
  if (reports && reports.length) {
    const tSaved = isEn
      ? 'SAVED REPORTS (use these exact ids when calling loadReport, editReport, deleteReport, exportPDF, exportPPT, or shareReport — for export/share commands, passing an id targets that saved report directly without the user having to load it first):'
      : 'INFORMES GUARDADOS (usa estos ids exactos cuando llames a loadReport, editReport, deleteReport, exportPDF, exportPPT, o shareReport — para los comandos de exportación/compartir, pasar un id apunta a ese informe guardado directamente sin que el usuario tenga que cargarlo primero):';
    lines.push('');
    lines.push(tSaved);
    // Cap at 20 most recent so the prompt size stays bounded.
    reports.slice(0, 20).forEach((r) => {
      const dateStr = r.createdAt ? r.createdAt.slice(0, 10) : '';
      const datePart = dateStr ? ` [${dateStr}]` : '';
      const statusPart = ` (${r.status})`;
      lines.push(`- id="${r.id}" — ${r.title}${datePart}${statusPart}`);
    });
  }

  // ── RIGHT NOW tail ──
  // Restated at the bottom because models pay more attention to text near
  // the most recent user turn. CURRENT STEP appears twice (top of snapshot
  // + here) on purpose — by the time the model has read 200 lines of
  // role/rules/examples, the original step header is far up the context
  // window and easy to lose track of.
  const stepLabel = stepLabels[currentStep as 1 | 2 | 3 | 4 | 5 | 6] || `Step ${currentStep}`;
  lines.push('');
  if (isEn) {
    lines.push('--- WHERE THE USER IS RIGHT NOW ---');
    lines.push(`The user is currently on ${stepLabel}.`);
    lines.push(
      'Trust this over anything you said in earlier turns — the user has navigated since then. When the user asks "what step am I on?" or refers to "this step" / "this page", anchor to this current step.',
    );
    lines.push('--- END ---');
  } else {
    lines.push('--- DÓNDE ESTÁ EL USUARIO AHORA MISMO ---');
    lines.push(`El usuario está actualmente en ${stepLabel}.`);
    lines.push(
      'Confía en ESTE valor por encima de cualquier cosa que dijeras en turnos anteriores — el usuario ha navegado desde entonces. Cuando el usuario pregunta "¿en qué paso estoy?" o se refiere a "este paso" / "esta página", ánclate a este paso actual.',
    );
    lines.push('--- FIN ---');
  }

  return lines.join('\n');
}
