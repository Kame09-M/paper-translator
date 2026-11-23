import type { Messages } from './i18n'
import { isDummyExplanation, type TermEntry } from './terms'

/** 選んだ語の説明（PC では右側の列、狭い画面では下から出るドロワー） */
export default function TermPanel({
  entry,
  onClose,
  t,
}: {
  entry: TermEntry | null
  onClose: () => void
  t: Messages
}) {
  return (
    <aside className={`term-panel${entry ? ' open' : ''}`} aria-label={t.termPanel}>
      {entry ? (
        <>
          <div className="term-panel-head">
            <span className="eyebrow">{t.termPanel}</span>
            <button className="icon-button" onClick={onClose} aria-label={t.close}>
              ×
            </button>
          </div>
          <h3 className="term-title">{entry.term}</h3>
          {entry.status === 'loading' && (
            <p className="muted">
              <span className="spinner" aria-hidden /> {t.explaining}
            </p>
          )}
          {entry.status === 'error' && <p className="notice error">
              {t.explainFailed}
              {entry.explanation}
            </p>}
          {entry.status === 'done' && (
            <>
              {isDummyExplanation(entry.explanation) && (
                <p className="notice warn">{t.explainDummy}</p>
              )}
              <p className="term-body">{entry.explanation}</p>
            </>
          )}
          {entry.contexts.length > 0 && (
            <details className="evidence">
              <summary>{t.evidence(entry.contexts.length)}</summary>
              {entry.contexts.map((c, i) => (
                <blockquote key={i}>{c}</blockquote>
              ))}
            </details>
          )}
        </>
      ) : (
        <div className="term-panel-empty">
          <span className="eyebrow">{t.termPanel}</span>
          <p>
            {t.panelEmpty1a}
            <strong>{t.panelEmpty1b}</strong>
            {t.panelEmpty1c}
          </p>
          <p>{t.panelEmpty2}</p>
        </div>
      )}
    </aside>
  )
}
