import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ParallelView from './ParallelView'
import PdfPages from './PdfPages'
import SummaryView from './SummaryView'
import TermPanel from './TermPanel'
import { explainTerm, health, prepare, summarize, translateParagraph } from './api'
import { LANGUAGES, langLabel } from './languages'
import { buildContexts, paragraphAtSelection } from './selection'
import { isDummyExplanation, normalizeTerm, termPattern, type TermEntry } from './terms'
import type { PrepareResponse } from './types'

// 開発中（Vite の dev サーバー）は手元の API。ビルドして Colab から配信したときは、
// 画面を配信しているサーバー自身が API なので、そのオリジンを使う（URL を手で入れなくてよい）
const DEFAULT_API = import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin

function loadApiUrl(): string {
  try {
    return localStorage.getItem('apiUrl') || DEFAULT_API
  } catch {
    return DEFAULT_API
  }
}

function loadGeminiKey(): string {
  try {
    return localStorage.getItem('geminiApiKey') ?? ''
  } catch {
    return ''
  }
}

/** Gemini のキーはこのブラウザにだけ保存する（リポジトリやサーバーには保存しない） */
function saveGeminiKey(key: string) {
  try {
    if (key) localStorage.setItem('geminiApiKey', key)
    else localStorage.removeItem('geminiApiKey')
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}

function saveApiUrl(url: string) {
  try {
    localStorage.setItem('apiUrl', url)
  } catch {
    // 保存できなくても動作には影響しない
  }
}

/** 通信エラーを読み手向けの文にする */
function friendlyError(e: unknown): string {
  const msg = (e as Error)?.message ?? String(e)
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'サーバーに接続できませんでした。「接続設定」の API URL と、サーバー（Colab）が動いているかを確認してください。'
  }
  return msg
}

type Stage = 'idle' | 'preparing' | 'translating' | 'done' | 'error'
type Tab = 'summary' | 'full' | 'terms'

function Settings({
  apiUrl,
  setApiUrl,
  geminiKey,
  setGeminiKey,
  apiStatus,
  onCheck,
}: {
  apiUrl: string
  setApiUrl: (s: string) => void
  geminiKey: string
  setGeminiKey: (s: string) => void
  apiStatus: { ok: boolean; mock: boolean; message: string } | null
  onCheck: () => void
}) {
  return (
    <details className="settings">
      <summary>
        接続設定
        {apiStatus && (
          <span className={`dot ${apiStatus.ok ? (apiStatus.mock ? 'warn' : 'ok') : 'ng'}`} aria-hidden />
        )}
      </summary>
      <div className="settings-body">
        <label className="field">
          <span>API URL</span>
          <div className="row">
            <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} onBlur={onCheck} />
            <button className="btn secondary" onClick={onCheck}>
              接続確認
            </button>
          </div>
          {apiStatus && <small className={apiStatus.ok ? 'muted' : 'error-text'}>{apiStatus.message}</small>}
        </label>
        <label className="field">
          <span>Gemini API キー</span>
          <input
            type="password"
            autoComplete="off"
            placeholder="要約・用語説明に使います"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value.trim())}
          />
          <small className="muted">
            このブラウザにだけ保存されます。空欄で、サーバーにもキーが無い場合、要約と用語説明はダミーになります。
          </small>
        </label>
      </div>
    </details>
  )
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(loadApiUrl)
  const [apiStatus, setApiStatus] = useState<{ ok: boolean; mock: boolean; message: string } | null>(null)
  const [geminiKey, setGeminiKeyState] = useState(loadGeminiKey)

  const [inputMode, setInputMode] = useState<'pdf' | 'url'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [lang, setLang] = useState(LANGUAGES[0].code)

  const [docFile, setDocFile] = useState<File | null>(null) // 表示中の PDF（翻訳開始時のファイル）
  const [doc, setDoc] = useState<PrepareResponse | null>(null)
  const [translations, setTranslations] = useState<(string | null)[]>([])
  const [summary, setSummary] = useState('')
  const [summaryStatus, setSummaryStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [summaryError, setSummaryError] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')

  const [tab, setTab] = useState<Tab>('full')
  const [view, setView] = useState<'parallel' | 'pdf'>('pdf')

  // 選択中の語と「説明」ボタンの位置（画面座標）
  const [selection, setSelection] = useState<{ term: string; at: number | null; x: number; y: number } | null>(null)
  const [terms, setTerms] = useState<TermEntry[]>([])
  const [activeTerm, setActiveTerm] = useState<string | null>(null) // normalizeTerm した語
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const doneCount = translations.filter((t) => t !== null).length
  const busy = stage === 'preparing' || stage === 'translating'

  const setGeminiKey = (k: string) => {
    setGeminiKeyState(k)
    saveGeminiKey(k)
  }

  const checkApi = useCallback(async (target: string) => {
    saveApiUrl(target)
    try {
      const h = await health(target)
      setApiStatus({
        ok: true,
        mock: h.mock,
        message: h.mock ? '接続OK（MOCK モード: 翻訳はダミーです）' : '接続OK',
      })
    } catch (e) {
      setApiStatus({ ok: false, mock: false, message: friendlyError(e) })
    }
  }, [])

  useEffect(() => {
    checkApi(loadApiUrl())
  }, [checkApi])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTerm(null)
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('PDF ファイルを選んでください。')
      return
    }
    setError('')
    setFile(f)
  }

  async function run() {
    if (!file || busy) return
    abortRef.current?.abort() // 前回の翻訳が続いていれば止める
    const controller = new AbortController()
    abortRef.current = controller
    saveApiUrl(apiUrl)
    setError('')
    setDoc(null)
    setTranslations([])
    setSummary('')
    setSummaryError('')
    setSummaryStatus('loading')
    setTerms([])
    setActiveTerm(null)
    setTab('full')
    setStage('preparing')

    // 1. 段落を取り出す（数秒）
    let prepared: PrepareResponse
    try {
      prepared = await prepare(apiUrl, file, lang)
    } catch (e) {
      if (controller.signal.aborted) return
      const msg = friendlyError(e) // サーバーの応答は「PDF を読めませんでした: …」などすでに文になっている
      setError(msg.startsWith('PDF') ? msg : `PDF を読み込めませんでした。${msg}`)
      setStage('idle')
      return
    }
    if (controller.signal.aborted) return
    setDocFile(file)
    setDoc(prepared)
    setTranslations(prepared.paragraphs.map(() => null))
    setStage('translating')

    // 2. 要約は翻訳と並行して取る
    summarize(
      apiUrl,
      { target_lang: prepared.target_lang, paragraphs: prepared.paragraphs.map((p) => p.source) },
      geminiKey,
      controller.signal,
    )
      .then((res) => {
        setSummary(res.summary)
        setSummaryStatus('done')
      })
      .catch((e) => {
        if (controller.signal.aborted) return
        setSummaryError(friendlyError(e))
        setSummaryStatus('error')
      })

    // 3. 段落を1つずつ訳す。直前の段落の原文と訳を履歴として渡す
    let prev: { source: string; translation: string } | null = null
    for (const [i, p] of prepared.paragraphs.entries()) {
      try {
        const res = await translateParagraph(
          apiUrl,
          { text: p.source, target_lang: prepared.target_lang, history: prev ? [prev] : [] },
          controller.signal,
        )
        if (controller.signal.aborted) return
        setTranslations((ts) => ts.map((t, j) => (j === i ? res.translation : t)))
        prev = { source: p.source, translation: res.translation }
      } catch (e) {
        if (controller.signal.aborted) return
        setError(`${i + 1} 段落目の翻訳でエラーが発生しました。${friendlyError(e)}`)
        setStage('error')
        return
      }
    }
    setStage('done')
  }

  /** 別の論文を読み込む: 進行中の処理を止めて入力画面に戻る（選んだ言語は残す） */
  function reset() {
    if (busy && !window.confirm('翻訳を中止して、別の論文を読み込みますか？')) return
    abortRef.current?.abort()
    setDoc(null)
    setDocFile(null)
    setFile(null)
    setTranslations([])
    setSummary('')
    setTerms([])
    setActiveTerm(null)
    setSelection(null)
    setError('')
    setStage('idle')
  }

  /** 本文で文字を選んだら、その近くに「説明」ボタンを出す */
  function onTextMouseUp() {
    if (!doc) return
    const sel = window.getSelection()
    const term = sel?.toString().replace(/\s+/g, ' ').trim() ?? ''
    if (!sel || sel.rangeCount === 0 || term.length === 0 || term.length > 80) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    const r = range.getBoundingClientRect()
    const x = Math.min(r.left, window.innerWidth - 300)
    setSelection({ term, at: paragraphAtSelection(range, doc.paragraphs), x: Math.max(8, x), y: r.bottom + 6 })
  }

  async function explainSelection() {
    if (!doc || !selection) return
    const { term, at } = selection
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    const key = normalizeTerm(term)
    setActiveTerm(key)
    const existing = terms.find((t) => normalizeTerm(t.term) === key)
    if (existing && existing.status !== 'error') return // 説明済み（または生成中）ならそれを見せる

    const contexts = buildContexts(term, at, doc.paragraphs, translations)
    const update = (patch: Partial<TermEntry>) =>
      setTerms((ts) => ts.map((t) => (normalizeTerm(t.term) === key ? { ...t, ...patch } : t)))
    setTerms((ts) => [
      ...ts.filter((t) => normalizeTerm(t.term) !== key),
      { term, status: 'loading', explanation: '', contexts },
    ])
    try {
      const res = await explainTerm(apiUrl, { term, target_lang: doc.target_lang, contexts }, geminiKey)
      update({ status: 'done', explanation: res.explanation })
    } catch (e) {
      update({ status: 'error', explanation: friendlyError(e) })
    }
  }

  const openTerm = (key: string) => {
    setActiveTerm(key)
    setTab((t) => (t === 'terms' ? 'full' : t))
  }

  const pattern = useMemo(() => termPattern(terms), [terms])
  const activeEntry = terms.find((t) => normalizeTerm(t.term) === activeTerm) ?? null
  const pagesWithText = useMemo(() => [...new Set(doc?.paragraphs.map((p) => p.page) ?? [])], [doc])
  const title = docFile?.name.replace(/\.pdf$/i, '') ?? ''

  const settings = (
    <Settings
      apiUrl={apiUrl}
      setApiUrl={setApiUrl}
      geminiKey={geminiKey}
      setGeminiKey={setGeminiKey}
      apiStatus={apiStatus}
      onCheck={() => checkApi(apiUrl)}
    />
  )

  // ---------- 入力画面 ----------
  if (!doc) {
    const canRun = inputMode === 'pdf' && !!file && !busy
    return (
      <div className="app">
        <header className="topbar">
          <span className="brand">Paper Reader</span>
          {settings}
        </header>

        <main className="landing">
          <h1>Paper Reader</h1>
          <p className="lead">論文を翻訳し、要約と専門用語の解説を表示します</p>

          <div className="card input-card">
            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={inputMode === 'url'}
                className={inputMode === 'url' ? 'active' : ''}
                onClick={() => setInputMode('url')}
              >
                URLから読み込む
              </button>
              <button
                role="tab"
                aria-selected={inputMode === 'pdf'}
                className={inputMode === 'pdf' ? 'active' : ''}
                onClick={() => setInputMode('pdf')}
              >
                PDFアップロード
              </button>
            </div>

            {inputMode === 'url' ? (
              <div className="input-pane">
                <input
                  type="url"
                  className="text-input"
                  placeholder="https://arxiv.org/abs/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled
                />
                <small className="muted">論文のURLを入力してください</small>
                <div className="notice info">
                  URLからの読み込みは、現在のサーバー（API）が対応していないため使えません。
                  論文の PDF をダウンロードして「PDFアップロード」から読み込んでください。
                </div>
              </div>
            ) : (
              <div className="input-pane">
                <div
                  className={`dropzone${dragOver ? ' over' : ''}${file ? ' has-file' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    pickFile(e.dataTransfer.files?.[0])
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
                  }}
                >
                  {file ? (
                    <>
                      <strong>{file.name}</strong>
                      <span className="muted">{(file.size / 1024 / 1024).toFixed(1)} MB ・ クリックして選び直す</span>
                    </>
                  ) : (
                    <>
                      <strong>PDF をここにドラッグ＆ドロップ</strong>
                      <span className="muted">または クリックしてファイルを選択</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={(e) => {
                      pickFile(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>
            )}

            <label className="field">
              <span>翻訳先の言語</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>

            {error && <div className="notice error">{error}</div>}
            {apiStatus?.ok && apiStatus.mock && (
              <div className="notice warn">サーバーが MOCK モードです。翻訳・要約・用語説明はダミーになります。</div>
            )}

            <button className="btn primary wide" onClick={run} disabled={!canRun}>
              {stage === 'preparing' ? (
                <>
                  <span className="spinner light" aria-hidden /> PDF を読み込み中…
                </>
              ) : (
                '翻訳する'
              )}
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ---------- 翻訳結果画面 ----------
  return (
    <div className="app wide">
      <header className="topbar">
        <span className="brand">Paper Reader</span>
        {settings}
      </header>

      <div className="doc-head">
        <div className="doc-meta">
          <h1 className="doc-title" title={title}>
            {title}
          </h1>
          <div className="meta-row">
            <span className="chip">英語 → {langLabel(doc.target_lang)}</span>
            <span className={`status-pill ${stage}`}>
              {stage === 'translating' && (
                <>
                  <span className="spinner" aria-hidden /> 翻訳中 {doneCount} / {translations.length} 段落
                </>
              )}
              {stage === 'done' && `翻訳完了（${translations.length} 段落）`}
              {stage === 'error' && `翻訳を中断（${doneCount} / ${translations.length} 段落）`}
            </span>
            {apiStatus?.mock && <span className="chip warn">MOCK: ダミー翻訳</span>}
          </div>
          {stage === 'translating' && (
            <div className="progress" aria-hidden>
              <div style={{ width: `${(doneCount / Math.max(1, translations.length)) * 100}%` }} />
            </div>
          )}
        </div>
        <button className="btn secondary" onClick={reset}>
          別の論文を読み込む
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <nav className="tabs result-tabs" role="tablist">
        {(
          [
            ['summary', `論文の要約${summaryStatus === 'loading' ? '（生成中）' : ''}`],
            ['full', '全文翻訳'],
            ['terms', `用語集${terms.length ? `（${terms.length}）` : ''}`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* タブは hidden で隠すだけにして、切り替えても表示中の状態（PDF の描画・スクロール）を保つ */}
      <section hidden={tab !== 'summary'} className="tab-panel">
        <SummaryView status={summaryStatus} summary={summary} error={summaryError} />
      </section>

      <section hidden={tab !== 'full'} className="tab-panel">
        <div className={`reader${view === 'pdf' ? ' full' : ''}`}>
          <div className="reader-main">
            <div className="reader-toolbar">
              <div className="segmented" role="group" aria-label="表示">
                <button className={view === 'pdf' ? 'active' : ''} onClick={() => setView('pdf')}>
                  PDF レイアウト
                </button>
                <button className={view === 'parallel' ? 'active' : ''} onClick={() => setView('parallel')}>
                  対訳（テキスト）
                </button>
              </div>
              {view === 'parallel' && pagesWithText.length > 1 && (
                <select
                  className="page-jump"
                  value=""
                  onChange={(e) =>
                    document.getElementById(`page-${e.target.value}`)?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  <option value="" disabled>
                    ページへ移動
                  </option>
                  {pagesWithText.map((p) => (
                    <option key={p} value={p}>
                      {p + 1} ページ
                    </option>
                  ))}
                </select>
              )}
              <span className="muted hint">語を選択すると、その語のこの論文での意味を説明します</span>
            </div>

            <div onMouseUp={onTextMouseUp}>
              <div hidden={view !== 'parallel'}>
                <ParallelView
                  paragraphs={doc.paragraphs}
                  translations={translations}
                  translating={stage === 'translating'}
                  pattern={pattern}
                  activeTerm={activeTerm}
                  onOpenTerm={openTerm}
                  sourceLabel="英語"
                  targetLabel={langLabel(doc.target_lang)}
                />
              </div>
              <div hidden={view !== 'pdf'}>
                <p className="muted hint">
                  左が原文、右が段落の位置に訳を重ねたページです。段落にマウスを乗せると、反対側の同じ段落が光ります。
                </p>
                {docFile && (
                  <PdfPages file={docFile} pages={doc.pages} paragraphs={doc.paragraphs} translations={translations} />
                )}
              </div>
            </div>
          </div>
          <TermPanel entry={activeEntry} onClose={() => setActiveTerm(null)} />
        </div>
        {activeEntry && <div className="drawer-backdrop" onClick={() => setActiveTerm(null)} />}
      </section>

      <section hidden={tab !== 'terms'} className="tab-panel">
        {terms.length === 0 ? (
          <div className="state-box">
            まだ用語がありません。「全文翻訳」で分からない語を選択して説明を表示すると、ここに一覧で残ります。
          </div>
        ) : (
          <ul className="term-list">
            {terms.map((t) => (
              <li key={t.term} className="card">
                <button className="term-list-head" onClick={() => openTerm(normalizeTerm(t.term))}>
                  {t.term}
                  <span className="muted">本文で表示 →</span>
                </button>
                {t.status === 'loading' && <p className="muted">説明を生成中…</p>}
                {t.status === 'error' && <p className="error-text">説明を取得できませんでした: {t.explanation}</p>}
                {t.status === 'done' && (
                  <p>
                    {isDummyExplanation(t.explanation) && <span className="chip warn">ダミー</span>}{' '}
                    {t.explanation}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {selection && (
        <button
          className="explain-button"
          style={{ left: selection.x, top: selection.y }}
          onMouseDown={(e) => e.preventDefault()} // 押した瞬間に選択が外れないように
          onClick={explainSelection}
        >
          「{selection.term.length > 20 ? `${selection.term.slice(0, 20)}…` : selection.term}」のこの論文での意味を説明
        </button>
      )}
    </div>
  )
}
