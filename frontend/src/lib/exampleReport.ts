/**
 * Constants shared between the wizard's "Load example" flow and any UI that
 * needs to recognise the auto-created example report (the dashboard badge,
 * for instance). Kept in lib/ so both feature folders can import without
 * cross-feature dependencies.
 *
 * <p>{@link EXAMPLE_REPORT_TITLE} must match the {@code companyProfile.title}
 * field in {@code public/example-report.json}. NewReportPage's
 * {@code handleLoadExample} uses it both as the title on the POST and as
 * the key for the reuse-by-title lookup that avoids creating duplicates.
 */
export const EXAMPLE_REPORT_TITLE = 'Consultor/a independiente — Foresight 2029';
