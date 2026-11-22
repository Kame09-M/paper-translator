import { isDummyExplanation, type TermEntry } from './terms'

/** 選んだ語の説明（PC では右側の列、狭い画面では下から出るドロワー） */
export default function TermPanel({ entry, onClose }: { entry: TermEntry | null; onClose: () => void }) {
  return (
    <aside className={`term-panel${entry ? ' open' : ''}`} aria-label="用語の説明">
      {entry ? (
        <>
          <div className="term-panel-head">
            <span className="eyebrow">用語の説明</span>
            <button className="icon-button" onClick={onClose} aria-label="閉じる">
              ×
            </button>
          </div>
          <h3 className="term-title">{entry.term}</h3>
          {entry.status === 'loading' && (
            <p className="muted">
              <span className="spinner" aria-hidden /> 説明を生成中…
            </p>
          )}
          {entry.status === 'error' && <p className="notice error">説明を取得できませんでした: {entry.explanation}</p>}
          {entry.status === 'done' && (
            <>
              {isDummyExplanation(entry.explanation) && (
                <p className="notice warn">ダミーの説明です（MOCK モード、または Gemini API キーが未設定）。</p>
              )}
              <p className="term-body">{entry.explanation}</p>
            </>
          )}
          {entry.contexts.length > 0 && (
            <details className="evidence">
              <summary>根拠にした段落（{entry.contexts.length}）</summary>
              {entry.contexts.map((c, i) => (
                <blockquote key={i}>{c}</blockquote>
              ))}
            </details>
          )}
        </>
      ) : (
        <div className="term-panel-empty">
          <span className="eyebrow">用語の説明</span>
          <p>
            分からない語を原文または訳文の上で<strong>ドラッグして選択</strong>し、
            表示されるボタンを押すと、その語の「この論文での意味」をここに表示します。
          </p>
          <p>説明した語は本文中で青くハイライトされ、クリックするといつでも見返せます。</p>
        </div>
      )}
    </aside>
  )
}
