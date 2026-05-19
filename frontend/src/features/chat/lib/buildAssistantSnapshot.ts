import type { LanguageCode } from '../../../i18n/languages';
import type { EmpresaData } from '../../report/steps/StepEmpresa';
import type { GlobalSteepData } from '../../report/steps/StepGlobal';
import type { SteepData } from '../../report/steps/StepSteep';
import type { HorizonData } from '../../report/steps/StepHorizon';
import type {
  Backcasting,
  ExampleSummary,
  KeyUncertainty,
  ReportSummary,
  Scenario,
  ScenarioPlanning,
  StrategicMap,
  WeakSignal,
  Wildcard,
} from '../../../types/api';

/**
 * Loosely-typed projection of a report's {@code resultData} — the same shape
 * {@code ReportContent.ResultData} consumes. Duplicated here (not imported)
 * to avoid pulling a feature module into the snapshot builder.
 */
export interface ReportResultSnapshot {
  executiveSummary?: string;
  scenarios?: Scenario[];
  weakSignals?: WeakSignal[];
  wildcards?: Wildcard[];
  keyUncertainties?: KeyUncertainty[];
  scenarioPlanning?: ScenarioPlanning;
  backcasting?: Backcasting;
  strategicMap?: StrategicMap;
}

/**
 * Inputs that feed the snapshot. Pass whatever's known; missing pieces become
 * {@code (empty)} markers so the assistant always sees the full set of field
 * IDs it can write to.
 */
export interface AssistantSnapshotInput {
  language: LanguageCode;
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
   *  loadReport / editReport / shareReport / exportReport without
   *  the user loading the report first. */
  reports?: ReportSummary[];
  /** Global examples (read-only demo reports every user sees). Surfaced
   *  so the assistant can answer "load the X example" without having to
   *  ask the user for an id. Loaded via {@code loadReport({id})} — the
   *  unified /reports/:id route falls back to /examples/:id on 404, so
   *  one command handles both. */
  examples?: ExampleSummary[];
  /** The report the user currently has open in the viewer, when on a
   *  {@code /reports/:id} route. Tells the assistant that "this report"
   *  / "the open report" / "export this" resolve to a concrete id without
   *  the user having to name it. Absent on every other route. */
  viewingReport?: {
    id: string;
    title: string;
    status: 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    /** ISO-639-1 of the report's primary content language. */
    primaryLanguage: LanguageCode;
    /** Languages the report is materialised in. */
    availableLanguages: string[];
    /** Whether the route is the read-only viewer ({@code /reports/:id})
     *  or the wizard edit mode ({@code /reports/:id/edit}). The latter
     *  publishes wizard state separately; this flag just lets the
     *  snapshot disambiguate when describing what the user sees. */
    mode: 'viewer' | 'edit';
  };
  /** Generated content of the currently-open report, summarised into a
   *  compact prompt block so the assistant can answer "what does this
   *  report say about X?" without the user having to copy-paste. Only
   *  populated when viewingReport is set and the report has resultData. */
  reportResult?: ReportResultSnapshot;
}

/**
 * Builds the localized USER STATE block that gets stitched into the chat
 * system prompt. Mirrors the staging demo's {@code buildChatContextSnapshot}
 * — same anti-hallucination markers, same human-readable layout, same
 * "every field listed even when empty" policy that prevents the assistant
 * from concluding empty fields aren't visible.
 */
export function buildAssistantSnapshot(input: AssistantSnapshotInput): string {
  const {
    language,
    currentStep,
    dashboardOpen,
    empresa,
    globalSteep,
    steep,
    horizon,
    reports,
    examples,
    viewingReport,
    reportResult,
  } = input;
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
    : {
        H1: 'H1 (0-2 años, ya visibles)',
        H2: 'H2 (2-5 años, emergentes)',
        H3: 'H3 (5+ años, sistémicos)',
      };

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
  lines.push(
    stepKeyL + (stepLabels[currentStep as 1 | 2 | 3 | 4 | 5 | 6] || `Step ${currentStep}`),
  );
  const dashLineL = isEn
    ? dashboardOpen
      ? 'DASHBOARD: open (user is looking at the saved-reports panel, NOT the step view above)'
      : 'DASHBOARD: closed (user is looking at the step view, the dashboard panel is hidden)'
    : dashboardOpen
      ? 'PANEL: abierto (el usuario está mirando el panel de informes guardados, NO la vista del paso de arriba)'
      : 'PANEL: cerrado (el usuario está mirando la vista del paso, el panel está oculto)';
  lines.push(dashLineL);

  // ── Currently-open report (viewer or edit mode) ──
  // When the user is on /reports/:id (viewer) or /reports/:id/edit (wizard
  // edit), this block tells the assistant which report "this report" / "the
  // open report" / "export this" resolves to. Drives the share/export
  // commands' implicit id behaviour: if the user says "export this" while
  // viewing, the assistant can emit exportReport with no id arg and
  // the page-scoped handler picks it up from the URL — but the snapshot
  // text needs to make clear that there IS an open report, otherwise the
  // model defaults to "no report is open".
  if (viewingReport) {
    const modeLabel = isEn
      ? viewingReport.mode === 'viewer'
        ? 'viewing the read-only report (Step 6 — Results)'
        : 'editing the report inputs (wizard edit mode)'
      : viewingReport.mode === 'viewer'
        ? 'viendo el informe en modo lectura (Paso 6 — Resultados)'
        : 'editando los inputs del informe (modo edición del asistente)';
    const langList = viewingReport.availableLanguages.join(', ') || viewingReport.primaryLanguage;
    if (isEn) {
      lines.push('');
      lines.push(
        `CURRENTLY OPEN REPORT: id="${viewingReport.id}" — "${viewingReport.title}" (${viewingReport.status}, primary ${viewingReport.primaryLanguage}, available: ${langList})`,
      );
      lines.push(
        `The user is ${modeLabel}. References like "this report", "the open report", "the current report", "this one", "export this", "share this" all resolve to id="${viewingReport.id}". For shareReport / exportReport, you can omit the id arg — the page reads the open report from the URL automatically.`,
      );
    } else {
      lines.push('');
      lines.push(
        `INFORME ABIERTO ACTUALMENTE: id="${viewingReport.id}" — "${viewingReport.title}" (${viewingReport.status}, primario ${viewingReport.primaryLanguage}, disponibles: ${langList})`,
      );
      lines.push(
        `El usuario está ${modeLabel}. Referencias como "este informe", "el informe abierto", "el informe actual", "este", "exporta esto", "compártelo" se resuelven a id="${viewingReport.id}". Para shareReport / exportReport puedes omitir el arg id — la página lo lee de la URL automáticamente.`,
      );
    }
  }

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
    'f-name': empresa.name,
    'f-sector': empresa.sector,
    'f-size': empresa.size,
    'f-horizon': empresa.horizon,
    'f-market': empresa.market,
    'f-challenge': empresa.challenge,
    'f-strengths': empresa.strengths,
    'gs-s': globalSteep.S,
    'gs-t': globalSteep.T,
    'gs-e': globalSteep.E,
    'gs-env': globalSteep.ENV,
    'gs-p': globalSteep.P,
    'steep-s': steep.social,
    'steep-t': steep.technological,
    'steep-e': steep.economic,
    'steep-env': steep.environmental,
    'steep-p': steep.political,
    'hs-h1': horizon.H1,
    'hs-h2': horizon.H2,
    'hs-h3': horizon.H3,
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
  lines.push(
    `- f-market (${fieldLabelsCompany['f-market']}): ${cell(empresa.market)}${opt('f-market')}`,
  );
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
  const stMap: [keyof SteepData, string, keyof GlobalSteepData][] = [
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
  // shareReport / exportReport without the user loading first.
  if (reports?.length) {
    const tSaved = isEn
      ? 'SAVED REPORTS (use these exact ids when calling loadReport, editReport, deleteReport, exportReport, or shareReport — for export/share commands, passing an id targets that saved report directly without the user having to load it first):'
      : 'INFORMES GUARDADOS (usa estos ids exactos cuando llames a loadReport, editReport, deleteReport, exportReport, o shareReport — para los comandos de exportación/compartir, pasar un id apunta a ese informe guardado directamente sin que el usuario tenga que cargarlo primero):';
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

  // ── Examples ──
  // Global demo reports (read-only for non-DEV users) — anyone can load
  // one to explore the methodology. Surfaced here so the assistant can
  // resolve "load the bakery example" / "show me a demo" without asking
  // the user for an id. Examples load via loadReport({id}) — the unified
  // /reports/:id route falls back to /examples/:id automatically, so a
  // single command handles both kinds.
  if (examples?.length) {
    const tEx = isEn
      ? 'EXAMPLES (global demo reports — load any with loadReport({id}). These are read-only; useful for showing the user what a finished report looks like, or for the user to explore the methodology before building their own):'
      : 'EJEMPLOS (informes de demostración globales — cárgalos con loadReport({id}). Son de solo lectura; útiles para enseñarle al usuario cómo se ve un informe terminado, o para que el usuario explore la metodología antes de construir el suyo):';
    lines.push('');
    lines.push(tEx);
    examples.slice(0, 20).forEach((e) => {
      const descPart = e.description ? ` — ${e.description}` : '';
      lines.push(`- id="${e.id}" — ${e.title}${descPart}`);
    });
  }

  // ── Generated report contents ──
  // When the user has a report open, surface the model's actual output so
  // the assistant can answer questions about "this report" without the
  // user pasting sections back in. We summarise rather than dumping the
  // full payload to keep the prompt size bounded — long prose fields get
  // truncated to a soft limit, lists cap at their natural counts (3
  // scenarios, ~5 signals/wildcards, etc.).
  if (viewingReport && reportResult) {
    const r = reportResult;
    const trunc = (s: string | undefined, n: number) => {
      if (!s) return '';
      const t = s.trim();
      return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
    };

    const tHdr = isEn
      ? '\nREPORT CONTENTS (generated output for the open report — quote / summarise from this when the user asks "what does this report say about X?" / "summarise scenario 2" / similar):'
      : '\nCONTENIDOS DEL INFORME (output generado del informe abierto — cita o resume de aquí cuando el usuario pregunte "qué dice el informe sobre X" / "resúmeme el escenario 2" / similar):';
    lines.push(tHdr);

    if (r.executiveSummary) {
      lines.push(isEn ? '\nExecutive summary:' : '\nResumen ejecutivo:');
      lines.push(trunc(r.executiveSummary, 1200));
    }

    if (r.scenarios?.length) {
      lines.push(isEn ? '\nScenarios (3P):' : '\nEscenarios (3P):');
      r.scenarios.forEach((s, i) => {
        const name = s.name || s.title || `#${i + 1}`;
        const prob = s.probability ? ` — ${s.probability}` : '';
        const typ = s.type ? ` [${s.type}]` : '';
        lines.push(`- ${name}${typ}${prob}: ${trunc(s.description, 400)}`);
        if (s.opportunities?.length) {
          lines.push(
            `  ${isEn ? 'opportunities' : 'oportunidades'}: ${s.opportunities.map((o) => trunc(o, 120)).join(' | ')}`,
          );
        }
        if (s.threats?.length) {
          lines.push(
            `  ${isEn ? 'threats' : 'amenazas'}: ${s.threats.map((o) => trunc(o, 120)).join(' | ')}`,
          );
        }
      });
    }

    if (r.keyUncertainties?.length) {
      lines.push(isEn ? '\nKey uncertainties:' : '\nIncertidumbres clave:');
      r.keyUncertainties.forEach((u) => lines.push(`- ${u.name}: ${trunc(u.description, 220)}`));
    }

    if (r.weakSignals?.length) {
      lines.push(isEn ? '\nWeak signals:' : '\nSeñales débiles:');
      r.weakSignals.forEach((s) =>
        lines.push(`- [${s.dimension}] ${s.title}: ${trunc(s.description, 220)}`),
      );
    }

    if (r.wildcards?.length) {
      lines.push(isEn ? '\nWildcards:' : '\nWildcards:');
      r.wildcards.forEach((w) => lines.push(`- ${w.title}: ${trunc(w.description, 220)}`));
    }

    const sp = r.scenarioPlanning;
    if (
      sp &&
      (sp.intro || sp.drivingForces?.length || sp.axes?.length || sp.scenarioLogics?.length)
    ) {
      lines.push(isEn ? '\nScenario planning:' : '\nPlanificación de escenarios:');
      if (sp.intro) lines.push(trunc(sp.intro, 400));
      if (sp.drivingForces?.length) {
        lines.push(isEn ? 'Driving forces (ranked):' : 'Fuerzas motrices (ranked):');
        sp.drivingForces.forEach((d) =>
          lines.push(
            `  ${d.rank}. ${d.title} (impact ${d.impactScore}): ${trunc(d.description, 180)}`,
          ),
        );
      }
      if (sp.axes?.length) {
        lines.push(isEn ? 'Uncertainty axes:' : 'Ejes de incertidumbre:');
        sp.axes.forEach((a) =>
          lines.push(`  - ${a.label}: ${a.poleLow} ↔ ${a.poleHigh}. ${trunc(a.rationale, 180)}`),
        );
      }
      if (sp.scenarioLogics?.length) {
        lines.push(isEn ? 'Scenario logics:' : 'Lógicas de escenario:');
        sp.scenarioLogics.forEach((l) => lines.push(`  - ${l.name}: ${trunc(l.logic, 220)}`));
      }
    }

    if (r.backcasting?.length) {
      lines.push(isEn ? '\nBackcasting trajectories:' : '\nTrayectorias de backcasting:');
      r.backcasting.forEach((b) => {
        lines.push(`- ${b.scenarioName} [${b.scenarioType}]: ${trunc(b.visionStatement, 240)}`);
        if (b.startingPoint)
          lines.push(`  ${isEn ? 'start' : 'inicio'}: ${trunc(b.startingPoint, 180)}`);
        if (b.milestones?.length) {
          b.milestones.forEach((m) =>
            lines.push(`  · ${m.year} — ${m.title}: ${trunc(m.description, 160)}`),
          );
        }
      });
    }

    if (r.strategicMap?.length) {
      lines.push(isEn ? '\nStrategic priorities:' : '\nPrioridades estratégicas:');
      r.strategicMap.forEach((p) => {
        lines.push(`- [${p.horizon} · ${p.timeframe}] ${p.title} (impact: ${p.impact})`);
        if (p.actions?.length) {
          lines.push(
            `  ${isEn ? 'actions' : 'acciones'}: ${p.actions.map((a) => trunc(a, 120)).join(' | ')}`,
          );
        }
      });
    }
  }

  // ── RIGHT NOW tail ──
  // Restated at the bottom because models pay more attention to text near
  // the most recent user turn. CURRENT STEP appears twice (top of snapshot
  // + here) on purpose — by the time the model has read 200 lines of
  // role/rules/examples, the original step header is far up the context
  // window and easy to lose track of.
  const stepLabel = stepLabels[currentStep as 1 | 2 | 3 | 4 | 5 | 6] || `Step ${currentStep}`;
  const viewingLabel = viewingReport
    ? isEn
      ? viewingReport.mode === 'viewer'
        ? `, viewing report "${viewingReport.title}" (id ${viewingReport.id})`
        : `, editing report "${viewingReport.title}" (id ${viewingReport.id})`
      : viewingReport.mode === 'viewer'
        ? `, viendo el informe "${viewingReport.title}" (id ${viewingReport.id})`
        : `, editando el informe "${viewingReport.title}" (id ${viewingReport.id})`
    : '';
  lines.push('');
  if (isEn) {
    lines.push('--- WHERE THE USER IS RIGHT NOW ---');
    lines.push(`The user is currently on ${stepLabel}${viewingLabel}.`);
    lines.push(
      'This block is the SOURCE OF TRUTH for the user\'s current location, every turn. The user can navigate at any time using the stepper, the URL bar, or the back/forward buttons — none of those go through the assistant, but they ALL change this block. When the user asks "what step am I on?", "where am I?", or refers to "this step" / "this page" / "this section" / "this report", anchor to the values above. NEVER answer "you\'re on step 1" or "no report is open" by guessing from earlier turns — re-read this block first.',
    );
    lines.push('--- END ---');
  } else {
    lines.push('--- DÓNDE ESTÁ EL USUARIO AHORA MISMO ---');
    lines.push(`El usuario está actualmente en ${stepLabel}${viewingLabel}.`);
    lines.push(
      'Este bloque es la FUENTE DE VERDAD sobre dónde está el usuario, en cada turno. El usuario puede navegar en cualquier momento usando el stepper, la barra de URL, o los botones de atrás/adelante — ninguno pasa por el asistente, pero TODOS cambian este bloque. Cuando el usuario pregunte "¿en qué paso estoy?", "¿dónde estoy?", o se refiera a "este paso" / "esta página" / "esta sección" / "este informe", ánclate a los valores de arriba. NUNCA respondas "estás en el paso 1" o "no hay informe abierto" adivinando por turnos anteriores — relee este bloque primero.',
    );
    lines.push('--- FIN ---');
  }

  return lines.join('\n');
}
