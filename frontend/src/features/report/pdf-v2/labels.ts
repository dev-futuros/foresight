import type { LanguageCode } from '../../../i18n/languages';

/**
 * Mono labels and chapter chrome strings for the report layout.
 *
 * <p>The spec is clear: mono labels (`BRIEF`, `ESCENARI`, `OPORTUNITATS`,
 * etc.) follow the language of the body — they're translated together,
 * not left in English. Each language gets its own table; the renderer
 * resolves a key per the report's effective language.
 *
 * <p>Catalan is the spec's reference language. Spanish + English mirror
 * the Catalan terms 1:1, preserving the same uppercase mono treatment.
 */
export interface LabelTable {
  // Cover + chrome
  brand: string; // FUTUROS
  coverEyebrow: string; // INFORME DE FORESIGHT ESTRATÈGIC · 5-ANYS D'HORITZÓ
  foresight: string; // FORESIGHT ESTRATÈGIC
  date: (iso: string) => string; // 19 DE MAIG DEL 2026

  // Cover stats
  scenariosLabel: string; // ESCENARIS
  sourcesLabel: string; // FONTS CITADES

  // TOC
  tocEyebrow: string; // DINS D'AQUEST INFORME
  tocTitle: string; // Continguts
  tocFootnote: string; // LLEGIR EN L'ORDRE MOSTRAT

  // Brief + Exec
  briefLabel: string; // BRIEF
  execLabel: string; // LÍDER
  execTitle: string; // Resum executiu
  briefOrg: string; // ORGANITZACIÓ
  briefSector: string; // SECTOR
  briefHorizon: string; // HORITZÓ
  briefChallenge: string; // REPTE
  briefCapabilities: string; // CAPACITATS
  briefMarginalia: string; // RESUM

  // STEEP
  steepTitle: string; // Anàlisi STEEP
  steepEyebrow: string; // CONTEXT — CINC DIMENSIONS
  steepGlobalCol: string; // GLOBAL
  steepSectorialCol: string; // SECTORIAL
  steepMarginalia: string; // CONTEXT STEEP
  steepDimSocial: string;
  steepDimTech: string;
  steepDimEcon: string;
  steepDimEnv: string;
  steepDimPol: string;

  // Uncertainties
  uncertTitle: string; // Incerteses clau
  uncertEyebrow: string; // PREGUNTES OBERTES
  uncertMarginalia: string; // INCERTESES

  // Scenarios
  scenariosTitle: string; // Escenaris 3P
  scenariosEyebrow: string; // FUTURS
  scenariosIndexMarginalia: string; // ESCENARIS 3P
  scenarioBandProbable: string; // PROBABLE
  scenarioBandPlausible: string; // PLAUSIBLE
  scenarioBandPossible: string; // POSSIBLE
  scenarioLabel: string; // ESCENARI
  scenarioProbability: string; // PROBABILITAT
  scenarioOpportunities: string; // OPORTUNITATS
  scenarioThreats: string; // AMENACES
  scenarioFactors: string; // FACTORS D'ÈXIT
  scenarioFirstMove: string; // PRIMER MOVIMENT

  // Backcasting
  backcastingTitle: string; // Backcasting
  backcastingEyebrow: (start: string, end: string) => string;
  backcastingStartingLabel: (year: string) => string; // PUNT DE PARTIDA · 2026
  backcastingMarginalia: string; // BACKCASTING

  // Strategic map
  strategicTitle: string; // Mapa estratègic
  strategicEyebrow: string; // PRIORITATS PER HORITZÓ
  strategicH1: string; // HORITZÓ 1
  strategicH2: string; // HORITZÓ 2
  strategicH3: string; // HORITZÓ 3
  strategicH1Caption: string; // Present estès (0–2 anys)
  strategicH2Caption: string; // Futur emergent (2–5 anys)
  strategicH3Caption: string; // Futur possible (5+ anys)
  strategicPriorityHigh: string; // ALT
  strategicPriorityMedium: string; // MITJÀ
  strategicPriorityLow: string; // BAIX
  strategicMarginalia: string;

  // Signals + wildcards
  signalsTitle: string; // Senyals i wildcards
  signalsEyebrow: string; // CASOS LÍMIT
  signalsListHeader: string; // SENYALS FEBLES DETECTATS
  wildcardsListHeader: string; // WILDCARDS — ESDEVENIMENTS D'ALT IMPACTE
  signalsMarginalia: string;

  // Sources
  sourcesTitle: string; // Fonts
  sourcesEyebrow: (n: number) => string; // REFERÈNCIES — 191 FONTS PÚBLIQUES
  sourcesDeck: string;
  sourcesGroupGlobal: string;
  sourcesGroupReport: string;
  sourcesGroupSectionA: string;
  sourcesGroupSectionB: string;
  sourcesGroupSectionC: string;
  sourcesGroupSectionD: string;
  sourcesGroupSectionE: string;
  sourcesMarginalia: string;

  // TOC chapter captions (short helper strings)
  briefCaption: string;
  steepCaption: string;
  uncertCaption: string;
  scenariosCaption: string;
  backcastingCaption: string;
  strategicCaption: string;
  signalsCaption: string;
  sourcesCaption: string;

  // Closing
  closingTagline: string; // El futur no es prediu, [es dissenya.]
  closingTaglineEm: string; // es dissenya.
  closingDomain: string; // futuros.io

  // Chapter title prefixes
  chapterPrefix: string; // optional
}

function dateFormatter(locale: string): (iso: string) => string {
  return (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d
      .toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
      .toUpperCase();
  };
}

// ── Catalan (reference) ───────────────────────────────────────────
const CA: LabelTable = {
  brand: 'FUTUROS',
  coverEyebrow: 'INFORME DE FORESIGHT ESTRATÈGIC',
  foresight: 'FORESIGHT ESTRATÈGIC',
  date: dateFormatter('ca-ES'),

  scenariosLabel: 'ESCENARIS',
  sourcesLabel: 'FONTS CITADES',

  tocEyebrow: "DINS D'AQUEST INFORME",
  tocTitle: 'Continguts',
  tocFootnote: "LLEGIR EN L'ORDRE MOSTRAT",

  briefLabel: 'BRIEF',
  execLabel: 'LÍDER',
  execTitle: 'Resum executiu',
  briefOrg: 'ORGANITZACIÓ',
  briefSector: 'SECTOR',
  briefHorizon: 'HORITZÓ',
  briefChallenge: 'REPTE',
  briefCapabilities: 'CAPACITATS',
  briefMarginalia: 'RESUM',

  steepTitle: 'Anàlisi STEEP',
  steepEyebrow: 'CONTEXT — CINC DIMENSIONS',
  steepGlobalCol: 'GLOBAL',
  steepSectorialCol: 'SECTORIAL',
  steepMarginalia: 'CONTEXT STEEP',
  steepDimSocial: 'Social',
  steepDimTech: 'Tecnològic',
  steepDimEcon: 'Econòmic',
  steepDimEnv: 'Mediambiental',
  steepDimPol: 'Polític',

  uncertTitle: 'Incerteses clau',
  uncertEyebrow: 'PREGUNTES OBERTES',
  uncertMarginalia: 'INCERTESES',

  scenariosTitle: 'Escenaris 3P',
  scenariosEyebrow: 'FUTURS',
  scenariosIndexMarginalia: 'ESCENARIS 3P',
  scenarioBandProbable: 'PROBABLE',
  scenarioBandPlausible: 'PLAUSIBLE',
  scenarioBandPossible: 'POSSIBLE',
  scenarioLabel: 'ESCENARI',
  scenarioProbability: 'PROBABILITAT',
  scenarioOpportunities: 'OPORTUNITATS',
  scenarioThreats: 'AMENACES',
  scenarioFactors: "FACTORS D'ÈXIT",
  scenarioFirstMove: 'PRIMER MOVIMENT',

  backcastingTitle: 'Backcasting',
  backcastingEyebrow: (start, end) => `FITES TRAÇADES ENRERE — ${start} → ${end}`,
  backcastingStartingLabel: (year) => `PUNT DE PARTIDA · ${year}`,
  backcastingMarginalia: 'BACKCASTING',

  strategicTitle: 'Mapa estratègic',
  strategicEyebrow: 'PRIORITATS PER HORITZÓ',
  strategicH1: 'HORITZÓ 1',
  strategicH2: 'HORITZÓ 2',
  strategicH3: 'HORITZÓ 3',
  strategicH1Caption: 'Present estès (0–2 anys)',
  strategicH2Caption: 'Futur emergent (2–5 anys)',
  strategicH3Caption: 'Futur possible (5+ anys)',
  strategicPriorityHigh: 'ALT',
  strategicPriorityMedium: 'MITJÀ',
  strategicPriorityLow: 'BAIX',
  strategicMarginalia: 'MAPA ESTRATÈGIC · H1·H2·H3',

  signalsTitle: 'Senyals i wildcards',
  signalsEyebrow: 'CASOS LÍMIT',
  signalsListHeader: 'SENYALS FEBLES DETECTATS',
  wildcardsListHeader: "WILDCARDS — ESDEVENIMENTS D'ALT IMPACTE",
  signalsMarginalia: 'SENYALS I WILDCARDS',

  sourcesTitle: 'Fonts',
  sourcesEyebrow: (n) => `REFERÈNCIES — ${n} FONTS PÚBLIQUES`,
  sourcesDeck: "Fonts públiques consultades per fonamentar l'anàlisi. Agrupades per àrea temàtica.",
  sourcesGroupGlobal: 'Context global',
  sourcesGroupReport: 'Citacions del report',
  sourcesGroupSectionA: 'Secció A · Resum executiu',
  sourcesGroupSectionB: 'Secció B · Escenaris',
  sourcesGroupSectionC: 'Secció C · Planificació',
  sourcesGroupSectionD: 'Secció D · Mapa estratègic',
  sourcesGroupSectionE: 'Secció E · Backcasting',
  sourcesMarginalia: 'FONTS',

  briefCaption: "Organització, repte i narrativa principal d'un cop d'ull.",
  steepCaption: 'Escaneig de les cinc dimensions del context global i sectorial.',
  uncertCaption: 'Preguntes obertes que delimiten els futurs possibles.',
  scenariosCaption: 'La trajectòria més probable, una alternativa plausible i una disrupció.',
  backcastingCaption: 'Fites traçades enrere des de la visió de cada escenari.',
  strategicCaption: 'Prioritats distribuïdes en els horitzons H1 / H2 / H3.',
  signalsCaption: 'Senyals febles i wildcards — els casos límit a vigilar.',
  sourcesCaption: 'Fonts públiques consultades, agrupades per tema.',

  closingTagline: 'El futur no es prediu, es dissenya.',
  closingTaglineEm: 'es dissenya.',
  closingDomain: 'futuros.io',

  chapterPrefix: '',
};

// ── Spanish ───────────────────────────────────────────────────────
const ES: LabelTable = {
  brand: 'FUTUROS',
  coverEyebrow: 'INFORME DE FORESIGHT ESTRATÉGICO',
  foresight: 'FORESIGHT ESTRATÉGICO',
  date: dateFormatter('es-ES'),

  scenariosLabel: 'ESCENARIOS',
  sourcesLabel: 'FUENTES CITADAS',

  tocEyebrow: 'DENTRO DE ESTE INFORME',
  tocTitle: 'Contenidos',
  tocFootnote: 'LEER EN EL ORDEN MOSTRADO',

  briefLabel: 'BRIEF',
  execLabel: 'CABECERA',
  execTitle: 'Resumen ejecutivo',
  briefOrg: 'ORGANIZACIÓN',
  briefSector: 'SECTOR',
  briefHorizon: 'HORIZONTE',
  briefChallenge: 'RETO',
  briefCapabilities: 'CAPACIDADES',
  briefMarginalia: 'RESUMEN',

  steepTitle: 'Análisis STEEP',
  steepEyebrow: 'CONTEXTO — CINCO DIMENSIONES',
  steepGlobalCol: 'GLOBAL',
  steepSectorialCol: 'SECTORIAL',
  steepMarginalia: 'CONTEXTO STEEP',
  steepDimSocial: 'Social',
  steepDimTech: 'Tecnológico',
  steepDimEcon: 'Económico',
  steepDimEnv: 'Medioambiental',
  steepDimPol: 'Político',

  uncertTitle: 'Incertidumbres clave',
  uncertEyebrow: 'PREGUNTAS ABIERTAS',
  uncertMarginalia: 'INCERTIDUMBRES',

  scenariosTitle: 'Escenarios 3P',
  scenariosEyebrow: 'FUTUROS',
  scenariosIndexMarginalia: 'ESCENARIOS 3P',
  scenarioBandProbable: 'PROBABLE',
  scenarioBandPlausible: 'PLAUSIBLE',
  scenarioBandPossible: 'POSIBLE',
  scenarioLabel: 'ESCENARIO',
  scenarioProbability: 'PROBABILIDAD',
  scenarioOpportunities: 'OPORTUNIDADES',
  scenarioThreats: 'AMENAZAS',
  scenarioFactors: 'FACTORES DE ÉXITO',
  scenarioFirstMove: 'PRIMER MOVIMIENTO',

  backcastingTitle: 'Backcasting',
  backcastingEyebrow: (start, end) => `HITOS TRAZADOS HACIA ATRÁS — ${start} → ${end}`,
  backcastingStartingLabel: (year) => `PUNTO DE PARTIDA · ${year}`,
  backcastingMarginalia: 'BACKCASTING',

  strategicTitle: 'Mapa estratégico',
  strategicEyebrow: 'PRIORIDADES POR HORIZONTE',
  strategicH1: 'HORIZONTE 1',
  strategicH2: 'HORIZONTE 2',
  strategicH3: 'HORIZONTE 3',
  strategicH1Caption: 'Presente extendido (0–2 años)',
  strategicH2Caption: 'Futuro emergente (2–5 años)',
  strategicH3Caption: 'Futuro posible (5+ años)',
  strategicPriorityHigh: 'ALTA',
  strategicPriorityMedium: 'MEDIA',
  strategicPriorityLow: 'BAJA',
  strategicMarginalia: 'MAPA ESTRATÉGICO · H1·H2·H3',

  signalsTitle: 'Señales y wildcards',
  signalsEyebrow: 'CASOS LÍMITE',
  signalsListHeader: 'SEÑALES DÉBILES DETECTADAS',
  wildcardsListHeader: 'WILDCARDS — EVENTOS DE ALTO IMPACTO',
  signalsMarginalia: 'SEÑALES Y WILDCARDS',

  sourcesTitle: 'Fuentes',
  sourcesEyebrow: (n) => `REFERENCIAS — ${n} FUENTES PÚBLICAS`,
  sourcesDeck: 'Fuentes públicas consultadas para fundamentar el análisis. Agrupadas por tema.',
  sourcesGroupGlobal: 'Contexto global',
  sourcesGroupReport: 'Citaciones del informe',
  sourcesGroupSectionA: 'Sección A · Resumen ejecutivo',
  sourcesGroupSectionB: 'Sección B · Escenarios',
  sourcesGroupSectionC: 'Sección C · Planificación',
  sourcesGroupSectionD: 'Sección D · Mapa estratégico',
  sourcesGroupSectionE: 'Sección E · Backcasting',
  sourcesMarginalia: 'FUENTES',

  briefCaption: 'Organización, reto y narrativa principal de un vistazo.',
  steepCaption: 'Escaneo de las cinco dimensiones del contexto global y sectorial.',
  uncertCaption: 'Preguntas abiertas que delimitan los futuros posibles.',
  scenariosCaption: 'La trayectoria más probable, una alternativa plausible y una disrupción.',
  backcastingCaption: 'Hitos trazados hacia atrás desde la visión de cada escenario.',
  strategicCaption: 'Prioridades distribuidas en los horizontes H1 / H2 / H3.',
  signalsCaption: 'Señales débiles y wildcards — los casos límite a vigilar.',
  sourcesCaption: 'Fuentes públicas consultadas, agrupadas por tema.',

  closingTagline: 'El futuro no se predice, se diseña.',
  closingTaglineEm: 'se diseña.',
  closingDomain: 'futuros.io',

  chapterPrefix: '',
};

// ── English ───────────────────────────────────────────────────────
const EN: LabelTable = {
  brand: 'FUTUROS',
  coverEyebrow: 'STRATEGIC FORESIGHT REPORT',
  foresight: 'STRATEGIC FORESIGHT',
  date: dateFormatter('en-GB'),

  scenariosLabel: 'SCENARIOS',
  sourcesLabel: 'SOURCES CITED',

  tocEyebrow: 'INSIDE THIS REPORT',
  tocTitle: 'Contents',
  tocFootnote: 'READ IN THE ORDER SHOWN',

  briefLabel: 'BRIEF',
  execLabel: 'LEAD',
  execTitle: 'Executive summary',
  briefOrg: 'ORGANISATION',
  briefSector: 'SECTOR',
  briefHorizon: 'HORIZON',
  briefChallenge: 'CHALLENGE',
  briefCapabilities: 'CAPABILITIES',
  briefMarginalia: 'SUMMARY',

  steepTitle: 'STEEP analysis',
  steepEyebrow: 'CONTEXT — FIVE DIMENSIONS',
  steepGlobalCol: 'GLOBAL',
  steepSectorialCol: 'SECTORAL',
  steepMarginalia: 'STEEP CONTEXT',
  steepDimSocial: 'Social',
  steepDimTech: 'Technological',
  steepDimEcon: 'Economic',
  steepDimEnv: 'Environmental',
  steepDimPol: 'Political',

  uncertTitle: 'Key uncertainties',
  uncertEyebrow: 'OPEN QUESTIONS',
  uncertMarginalia: 'UNCERTAINTIES',

  scenariosTitle: '3P scenarios',
  scenariosEyebrow: 'FUTURES',
  scenariosIndexMarginalia: '3P SCENARIOS',
  scenarioBandProbable: 'PROBABLE',
  scenarioBandPlausible: 'PLAUSIBLE',
  scenarioBandPossible: 'POSSIBLE',
  scenarioLabel: 'SCENARIO',
  scenarioProbability: 'PROBABILITY',
  scenarioOpportunities: 'OPPORTUNITIES',
  scenarioThreats: 'THREATS',
  scenarioFactors: 'SUCCESS FACTORS',
  scenarioFirstMove: 'FIRST MOVE',

  backcastingTitle: 'Backcasting',
  backcastingEyebrow: (start, end) => `MILESTONES TRACED BACK — ${start} → ${end}`,
  backcastingStartingLabel: (year) => `STARTING POINT · ${year}`,
  backcastingMarginalia: 'BACKCASTING',

  strategicTitle: 'Strategic map',
  strategicEyebrow: 'PRIORITIES BY HORIZON',
  strategicH1: 'HORIZON 1',
  strategicH2: 'HORIZON 2',
  strategicH3: 'HORIZON 3',
  strategicH1Caption: 'Extended present (0–2 years)',
  strategicH2Caption: 'Emerging future (2–5 years)',
  strategicH3Caption: 'Possible future (5+ years)',
  strategicPriorityHigh: 'HIGH',
  strategicPriorityMedium: 'MEDIUM',
  strategicPriorityLow: 'LOW',
  strategicMarginalia: 'STRATEGIC MAP · H1·H2·H3',

  signalsTitle: 'Signals & wildcards',
  signalsEyebrow: 'EDGE CASES',
  signalsListHeader: 'WEAK SIGNALS DETECTED',
  wildcardsListHeader: 'WILDCARDS — HIGH-IMPACT EVENTS',
  signalsMarginalia: 'SIGNALS & WILDCARDS',

  sourcesTitle: 'Sources',
  sourcesEyebrow: (n) => `REFERENCES — ${n} PUBLIC SOURCES`,
  sourcesDeck: 'Public sources consulted to ground the analysis. Grouped by topic.',
  sourcesGroupGlobal: 'Global context',
  sourcesGroupReport: 'Report citations',
  sourcesGroupSectionA: 'Section A · Executive summary',
  sourcesGroupSectionB: 'Section B · Scenarios',
  sourcesGroupSectionC: 'Section C · Planning',
  sourcesGroupSectionD: 'Section D · Strategic map',
  sourcesGroupSectionE: 'Section E · Backcasting',
  sourcesMarginalia: 'SOURCES',

  briefCaption: 'Organisation, challenge and main narrative at a glance.',
  steepCaption: 'Scan of the five dimensions of global and sectoral context.',
  uncertCaption: 'Open questions that bound the possible futures.',
  scenariosCaption: 'The most-likely trajectory, a plausible alternative, and a disruption.',
  backcastingCaption: "Milestones traced back from each scenario's vision.",
  strategicCaption: 'Priorities distributed across H1 / H2 / H3 horizons.',
  signalsCaption: 'Weak signals and wildcards — the edge cases to watch.',
  sourcesCaption: 'Public sources consulted, grouped by topic.',

  closingTagline: "The future isn't predicted, it's designed.",
  closingTaglineEm: "it's designed.",
  closingDomain: 'futuros.io',

  chapterPrefix: '',
};

export function labelsFor(language: LanguageCode): LabelTable {
  if (language === 'ca') return CA;
  if (language === 'en') return EN;
  return ES;
}
