import { toggleTheme, useTheme } from '../theme.js';

/**
 * Minimal sun (light mode) / moon (dark mode) switch.
 * On click the sun's rays fold in and a shadow circle slides over the disc to carve the crescent — and back.
 */
export default function ThemeToggle({ className = '' }) {
  const theme = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle ${dark ? 'is-dark' : ''} ${className}`}
      onClick={toggleTheme}
      aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={dark ? 'Modo claro' : 'Modo escuro'}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <mask id="theme-toggle-cut">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <circle className="tt-cut" cx="16.6" cy="7.6" r="6" fill="#000" />
        </mask>
        <circle className="tt-disc" cx="12" cy="12" r="7.6" mask="url(#theme-toggle-cut)" />
        <g className="tt-rays">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
            <line key={a} x1="12" y1="2.2" x2="12" y2="4.2" transform={`rotate(${a} 12 12)`} />
          ))}
        </g>
      </svg>
    </button>
  );
}
