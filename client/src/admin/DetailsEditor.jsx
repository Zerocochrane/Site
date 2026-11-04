/** Big name field + description. Changes stay in the draft until the page's Save button is used. */
export default function DetailsEditor({ name, description, onChange, descriptionHint, children }) {
  return (
    <>
      <div className="group-head">
        <input
          className="group-name-input"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Nome"
          maxLength={120}
        />
        <div className="group-head-actions">{children}</div>
      </div>
      {!name.trim() && <p className="err">O nome não pode ficar vazio.</p>}
      <label className="desc-label">
        Descrição curta <span className="muted">({descriptionHint})</span>
        <textarea rows={2} value={description} onChange={(e) => onChange({ description: e.target.value })} />
      </label>
    </>
  );
}
