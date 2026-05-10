/**
 * SVG icon sprite — mount once at the app root so any component can render
 * an icon via:  <svg className="ico"><use href="#i-..." /></svg>
 *
 * Symbols ported 1:1 from demo.futuros.io/src/prod/app.html (icon sprite block).
 */
export default function IconSprite() {
  return (
    <svg
      className="icon-sprite"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* S — people / social */}
      <symbol id="i-s" viewBox="0 0 24 24">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </symbol>

      {/* T — chip / tech */}
      <symbol id="i-t" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 2v2M15 2v2M9 20v2M15 20v2M20 9h2M20 15h2M2 9h2M2 15h2" />
      </symbol>

      {/* E — trending up */}
      <symbol id="i-e" viewBox="0 0 24 24">
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="14 7 21 7 21 14" />
      </symbol>

      {/* ENV — leaf */}
      <symbol id="i-env" viewBox="0 0 24 24">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c.5 6.55.5 11.74-3 14.7-2 1.7-3.7 2.34-5.2 2.34z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6" />
      </symbol>

      {/* P — landmark / columns */}
      <symbol id="i-p" viewBox="0 0 24 24">
        <line x1="3" y1="22" x2="21" y2="22" />
        <line x1="6" y1="18" x2="6" y2="11" />
        <line x1="10" y1="18" x2="10" y2="11" />
        <line x1="14" y1="18" x2="14" y2="11" />
        <line x1="18" y1="18" x2="18" y2="11" />
        <polygon points="12 2 20 7 4 7" />
      </symbol>

      {/* globe */}
      <symbol id="i-globe" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </symbol>

      {/* chevron-down (for dropdowns) */}
      <symbol id="i-chev" viewBox="0 0 24 24">
        <polyline points="6 9 12 15 18 9" />
      </symbol>

      {/* download */}
      <symbol id="i-dl" viewBox="0 0 24 24">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </symbol>

      {/* trash */}
      <symbol id="i-trash" viewBox="0 0 24 24">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </symbol>

      {/* pencil / edit */}
      <symbol id="i-edit" viewBox="0 0 24 24">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </symbol>

      {/* arrow-left */}
      <symbol id="i-back" viewBox="0 0 24 24">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </symbol>

      {/* share (paper-plane / arrow-up-right) */}
      <symbol id="i-share" viewBox="0 0 24 24">
        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </symbol>

      {/* link / chain */}
      <symbol id="i-link" viewBox="0 0 24 24">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </symbol>

      {/* check */}
      <symbol id="i-check" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" />
      </symbol>

      {/* maximize: 4 corner brackets pointing outward */}
      <symbol id="i-maximize" viewBox="0 0 24 24">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </symbol>

      {/* minimize: arrows pointing inward */}
      <symbol id="i-minimize" viewBox="0 0 24 24">
        <polyline points="4 14 10 14 10 20" />
        <polyline points="20 10 14 10 14 4" />
        <line x1="14" y1="10" x2="21" y2="3" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </symbol>

      {/* grid (2x2) — dashboard */}
      <symbol id="i-grid" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </symbol>

      {/* hamburger — three horizontal lines */}
      <symbol id="i-menu" viewBox="0 0 24 24">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </symbol>

      {/* user — head + shoulders silhouette */}
      <symbol id="i-user" viewBox="0 0 24 24">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </symbol>

      {/* sign-out — arrow exiting a box */}
      <symbol id="i-signout" viewBox="0 0 24 24">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </symbol>
    </svg>
  );
}
