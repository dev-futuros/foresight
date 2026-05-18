/**
 * Circular user avatar. Three rendering tiers, in order of preference:
 *
 *   1. {@code src} present (e.g. Kinde's `picture` URL) → render `<img>`. Falls
 *      back to tier 2 if the image fails to load (404, network).
 *   2. {@code name} present → derive initials (first letter of first word + first
 *      letter of last word; "Roger Henares" → "RH", "Roger" → "R") and paint
 *      them centered on a muted background.
 *   3. Neither → render the generic `#i-user` glyph from {@code IconSprite}.
 *
 * <p>Used in two places: the topbar's {@code AccountMenu} trigger (small, 32px)
 * and the {@code AccountModal} header (large, 64px). Size is controlled via the
 * `--avatar-size` CSS custom property set inline on the root element — keeps
 * the single stylesheet from needing per-size modifiers.
 */
import { useState } from 'react';
import './avatar.css';

type Props = {
  /** Picture URL (e.g. Kinde's `picture` claim). Null/empty falls through to initials. */
  src: string | null | undefined;
  /** Display name; used to derive initials and as the `<img>` alt text. */
  name: string | null | undefined;
  /** Render size in pixels (square). Defaults to 32 (topbar trigger size). */
  size?: number;
  /** Optional extra class for one-off positional tweaks. */
  className?: string;
};

/** First letter of first whitespace-separated word + first letter of last word. */
function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);
  return (first + last).toUpperCase();
}

export default function Avatar({ src, name, size = 32, className }: Readonly<Props>) {
  // Track <img> load failure so we degrade to initials/icon instead of leaving
  // a broken-image glyph. Reset implicitly when `src` changes (component re-
  // renders fresh state when the key/prop changes — for our use the avatar is
  // mounted once per modal/menu open, so this is enough).
  const [imgFailed, setImgFailed] = useState(false);

  const initials = name ? initialsFrom(name) : '';
  const showImg = !!src && !imgFailed;
  const showInitials = !showImg && initials.length > 0;

  const style = { '--avatar-size': `${size}px` } as React.CSSProperties;
  const rootClass = `avatar${className ? ` ${className}` : ''}`;

  if (showImg) {
    return (
      <span className={rootClass} style={style}>
        <img
          src={src ?? undefined}
          alt={name ?? ''}
          onError={() => setImgFailed(true)}
          className="avatar-img"
        />
      </span>
    );
  }

  if (showInitials) {
    return (
      <span
        className={`${rootClass} avatar--initials`}
        style={style}
        aria-label={name ?? undefined}
      >
        <span className="avatar-initials">{initials}</span>
      </span>
    );
  }

  return (
    <span className={`${rootClass} avatar--fallback`} style={style} aria-hidden>
      <svg viewBox="0 0 24 24" className="avatar-fallback-ico">
        <use href="#i-user" />
      </svg>
    </span>
  );
}
