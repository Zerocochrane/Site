/**
 * "Como funciona?" — the explanation at the top of an admin page, collapsible.
 * Open by default on a computer, closed on a phone (where it would push the content down).
 */
const wide = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 701px)').matches;

export default function Help({ children, title = 'Como funciona?' }) {
  return (
    <details className="help" open={wide()}>
      <summary>{title}</summary>
      <div className="help-body">{children}</div>
    </details>
  );
}
