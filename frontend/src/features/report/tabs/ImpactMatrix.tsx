import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DrivingForce, UncertaintyAxis } from '../../../lib/aiClient';

/**
 * Renders the 4-quadrant Impact × Uncertainty matrix that lives at the
 * heart of the prototype's Scenario Planning tab.
 *
 * <p>The matrix is purely a client-side projection of the driving forces
 * and uncertainty axes — the backend doesn't return coordinates. We:
 * <ul>
 *   <li>sort the forces by impactScore descending and keep the top 4,</li>
 *   <li>place them in a fixed quadrant pattern (top-right, top-left,
 *       bottom-right, bottom-left) so the visual reading is "rank 1 is in
 *       the high-impact / high-uncertainty corner",</li>
 *   <li>size each node radius by impactScore (14 + impactScore/12),</li>
 *   <li>render axis labels from the first two axes' pole strings, with
 *       smart truncation so long sentences don't overflow the SVG.</li>
 * </ul>
 *
 * <p>Pure SVG keeps it dependency-free and crisp at any zoom level.
 * Hover state is React-managed (no global event listeners).
 */
export default function ImpactMatrix({
  forces,
  axes,
}: {
  forces: DrivingForce[];
  axes: UncertaintyAxis[];
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);

  const nodes = useMemo(() => buildNodes(forces), [forces]);
  if (nodes.length < 2) return null;

  // Render-time constants kept identical to the demo so positions and
  // typography track the prototype 1:1.
  const W = 720;
  const H = 460;
  const PAD = 72;
  const iW = W - PAD * 2;
  const iH = H - PAD * 2;

  const axX = axes[0] ? shortPole(axes[0].label, 42) : 'X';
  const axY = axes[1] ? shortPole(axes[1].label, 42) : 'Y';
  const axXlo = axes[0] ? shortPole(axes[0].poleLow, 22) : '';
  const axXhi = axes[0] ? shortPole(axes[0].poleHigh, 22) : '';
  const axYlo = axes[1] ? shortPole(axes[1].poleLow, 22) : '';
  const axYhi = axes[1] ? shortPole(axes[1].poleHigh, 22) : '';

  const quadLabels = [
    {
      x: W - PAD - 6,
      y: PAD + 22,
      anchor: 'end',
      text: t('report.results.matrix.q1'),
      color: 'rgba(212,168,83,0.55)',
    },
    {
      x: PAD + 6,
      y: PAD + 22,
      anchor: 'start',
      text: t('report.results.matrix.q2'),
      color: 'rgba(96,165,250,0.55)',
    },
    {
      x: W - PAD - 6,
      y: H - PAD - 10,
      anchor: 'end',
      text: t('report.results.matrix.q3'),
      color: 'rgba(74,222,128,0.45)',
    },
    {
      x: PAD + 6,
      y: H - PAD - 10,
      anchor: 'start',
      text: t('report.results.matrix.q4'),
      color: 'rgba(140,140,140,0.4)',
    },
  ] as const;

  const poleY = H - PAD + 18;
  const hovered = hover !== null ? nodes[hover] : null;

  function onNodeMove(e: React.MouseEvent<SVGGElement>, idx: number) {
    const wrap = e.currentTarget.ownerSVGElement?.parentElement as HTMLElement | null;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    setHover(idx);
    setTipPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  }
  function onNodeLeave() {
    setHover(null);
    setTipPos(null);
  }

  return (
    <div className="matrix-wrap">
      <h3 className="matrix-title">{t('report.results.sp.matrix')}</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="matrix-svg">
        {/* Quadrant background tints — same RGB as the prototype's dark mode. */}
        <rect x={PAD} y={PAD} width={iW / 2} height={iH / 2} fill="rgba(96,165,250,0.04)" rx={3} />
        <rect
          x={PAD + iW / 2}
          y={PAD}
          width={iW / 2}
          height={iH / 2}
          fill="rgba(212,168,83,0.05)"
          rx={3}
        />
        <rect
          x={PAD}
          y={PAD + iH / 2}
          width={iW / 2}
          height={iH / 2}
          fill="rgba(120,120,120,0.03)"
          rx={3}
        />
        <rect
          x={PAD + iW / 2}
          y={PAD + iH / 2}
          width={iW / 2}
          height={iH / 2}
          fill="rgba(74,222,128,0.03)"
          rx={3}
        />
        {/* Outer axis lines */}
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={H - PAD}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
        />
        {/* Center cross (dashed) */}
        <line
          x1={PAD + iW / 2}
          y1={PAD}
          x2={PAD + iW / 2}
          y2={H - PAD}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
          strokeDasharray="4 5"
        />
        <line
          x1={PAD}
          y1={PAD + iH / 2}
          x2={W - PAD}
          y2={PAD + iH / 2}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
          strokeDasharray="4 5"
        />
        {/* Axis arrows */}
        <polygon
          points={`${W - PAD + 10},${H - PAD} ${W - PAD + 1},${H - PAD - 5} ${W - PAD + 1},${H - PAD + 5}`}
          fill="rgba(255,255,255,0.18)"
        />
        <polygon
          points={`${PAD},${PAD - 10} ${PAD - 5},${PAD - 1} ${PAD + 5},${PAD - 1}`}
          fill="rgba(255,255,255,0.18)"
        />
        {/* Pole labels under the X axis + rotated next to the Y axis */}
        <text
          x={PAD + 8}
          y={poleY}
          fontFamily="DM Mono,monospace"
          fontSize={10}
          fill="rgba(255,255,255,0.45)"
        >
          − {axXlo}
        </text>
        <text
          x={W - PAD - 8}
          y={poleY}
          textAnchor="end"
          fontFamily="DM Mono,monospace"
          fontSize={10}
          fill="rgba(255,255,255,0.45)"
        >
          {axXhi} +
        </text>
        <text
          x={22}
          y={PAD + 4}
          textAnchor="middle"
          fontFamily="DM Mono,monospace"
          fontSize={10}
          fill="rgba(255,255,255,0.45)"
          transform={`rotate(-90,22,${PAD + 4})`}
        >
          + {axYhi}
        </text>
        <text
          x={22}
          y={H - PAD}
          textAnchor="middle"
          fontFamily="DM Mono,monospace"
          fontSize={10}
          fill="rgba(255,255,255,0.45)"
          transform={`rotate(-90,22,${H - PAD})`}
        >
          − {axYlo}
        </text>
        {/* Axis main labels (gold) */}
        <text
          x={W / 2}
          y={H - 14}
          textAnchor="middle"
          fontFamily="DM Mono,monospace"
          fontSize={11.5}
          fontWeight={500}
          letterSpacing="0.04em"
          fill="rgba(212,168,83,0.85)"
        >
          {axX}
        </text>
        <text
          x={42}
          y={H / 2}
          textAnchor="middle"
          fontFamily="DM Mono,monospace"
          fontSize={11.5}
          fontWeight={500}
          letterSpacing="0.04em"
          fill="rgba(212,168,83,0.85)"
          transform={`rotate(-90,42,${H / 2})`}
        >
          {axY}
        </text>
        {/* Quadrant text labels */}
        {quadLabels.map((q, i) => (
          <text
            key={i}
            x={q.x}
            y={q.y}
            textAnchor={q.anchor}
            fontFamily="DM Mono,monospace"
            fontSize={10.5}
            fontWeight={500}
            letterSpacing="0.04em"
            fill={q.color}
          >
            {q.text}
          </text>
        ))}
        {/* Force nodes — invisible padded halo + filled dot + rank text */}
        {nodes.map((n, i) => {
          const cx = PAD + n.qx * iW;
          const cy = PAD + n.qy * iH;
          return (
            <g
              key={i}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => onNodeMove(e, i)}
              onMouseMove={(e) => onNodeMove(e, i)}
              onMouseLeave={onNodeLeave}
            >
              <circle cx={cx} cy={cy} r={n.r + 6} fill={n.color} opacity={0.1} />
              <circle cx={cx} cy={cy} r={n.r} fill={n.color} opacity={0.88} />
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontFamily="DM Mono,monospace"
                fontSize={11}
                fontWeight={600}
                fill="#09090b"
                pointerEvents="none"
              >
                #{n.force.rank}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="matrix-hint">{t('report.results.matrix.hint')}</p>

      {hovered && tipPos && (
        <div
          className="matrix-tip"
          style={{ left: `${tipPos.x + 14}px`, top: `${tipPos.y - 24}px` }}
        >
          <div className="matrix-tip-head">
            <span className="matrix-tip-dot" style={{ background: hovered.color }} aria-hidden />
            <strong>
              #{hovered.force.rank} {hovered.force.title}
            </strong>
          </div>
          <div className="matrix-tip-score">
            {t('report.results.matrix.tipImpact')}: {hovered.force.impactScore}%
          </div>
        </div>
      )}
    </div>
  );
}

interface MatrixNode {
  force: DrivingForce;
  /** Fractional position in [0,1] within the padded plot area. */
  qx: number;
  qy: number;
  r: number;
  color: string;
}

const NODE_POSITIONS: { qx: number; qy: number }[] = [
  { qx: 0.74, qy: 0.22 }, // Q1 top-right
  { qx: 0.26, qy: 0.24 }, // Q2 top-left
  { qx: 0.72, qy: 0.74 }, // Q3 bottom-right
  { qx: 0.26, qy: 0.72 }, // Q4 bottom-left
];
const NODE_COLORS = ['var(--gold)', 'var(--blue)', 'var(--green)', 'var(--purple)'];

function buildNodes(forces: DrivingForce[]): MatrixNode[] {
  return [...forces]
    .sort((a, b) => (b.impactScore ?? 0) - (a.impactScore ?? 0))
    .slice(0, 4)
    .map((f, i) => ({
      force: f,
      qx: NODE_POSITIONS[i].qx,
      qy: NODE_POSITIONS[i].qy,
      r: 14 + Math.round((f.impactScore ?? 0) / 12),
      color: NODE_COLORS[i],
    }));
}

/**
 * Trim a long pole sentence down to a header phrase that fits inside the
 * SVG legend slots. Matches the demo's heuristic: split on em-dash / colon
 * / sentence boundary, keep the head, cap at `maxLen` with an ellipsis.
 */
function shortPole(s: string | undefined, maxLen: number): string {
  if (!s) return '';
  const trimmed = String(s).trim();
  const m = /^([^—–:]+?)(?:\s*[—–:]\s*|\.\s+|,\s+).+$/.exec(trimmed);
  let head = m ? m[1].trim() : trimmed;
  if (head.length > maxLen) head = head.slice(0, maxLen - 1).replace(/\s+\S*$/, '') + '…';
  return head;
}
