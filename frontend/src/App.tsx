import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ParallelView from './ParallelView'
import PdfPages from './PdfPages'
import SummaryView from './SummaryView'
import TermPanel from './TermPanel'
import { explainTerm, fetchPdf, health, prepare, summarize, translateParagraph } from './api'
import { loadUiLang, MESSAGES, saveUiLang, type Messages, type UiLang } from './i18n'
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

const isNetworkError = (e: unknown) =>
  e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test((e as Error)?.message ?? '')

/** 通信エラーを読み手向けの文にする */
function friendlyError(e: unknown, t: Messages): string {
  if (isNetworkError(e)) return t.networkError
  return (e as Error)?.message ?? String(e)
}

const isHttpUrl = (s: string) => {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

type Stage = 'idle' | 'fetching' | 'preparing' | 'translating' | 'done' | 'error'
type Tab = 'summary' | 'full' | 'terms'
type ApiStatus = { ok: boolean; mock: boolean; error?: string } | null

function UiLangSwitch({ uiLang, setUiLang, t }: { uiLang: UiLang; setUiLang: (l: UiLang) => void; t: Messages }) {
  return (
    <div className="segmented small" role="group" aria-label={t.uiLanguage}>
      {(
        [
          ['ja', '日本語'],
          ['en', 'English'],
        ] as [UiLang, string][]
      ).map(([code, label]) => (
        <button
          key={code}
          className={uiLang === code ? 'active' : ''}
          aria-pressed={uiLang === code}
          onClick={() => setUiLang(code)}
          lang={code}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Settings({
  apiUrl,
  setApiUrl,
  geminiKey,
  setGeminiKey,
  apiStatus,
  onCheck,
  t,
}: {
  apiUrl: string
  setApiUrl: (s: string) => void
  geminiKey: string
  setGeminiKey: (s: string) => void
  apiStatus: ApiStatus
  onCheck: () => void
  t: Messages
}) {
  return (
    <details className="settings">
      <summary>
        {t.settings}
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
              {t.check}
            </button>
          </div>
          {apiStatus && (
            <small className={apiStatus.ok ? 'muted' : 'error-text'}>
              {apiStatus.ok ? (apiStatus.mock ? t.apiOkMock : t.apiOk) : (apiStatus.error ?? t.networkError)}
            </small>
          )}
        </label>
        <label className="field">
          <span>{t.geminiKey}</span>
          <input
            type="password"
            autoComplete="off"
            placeholder={t.geminiKeyPlaceholder}
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value.trim())}
          />
          <small className="muted">{t.geminiKeyHelp}</small>
        </label>
      </div>
    </details>
  )
}

export default function App() {
  const [uiLang, setUiLangState] = useState<UiLang>(loadUiLang)
  const t = MESSAGES[uiLang]
  const [apiUrl, setApiUrl] = useState(loadApiUrl)
  const [apiStatus, setApiStatus] = useState<ApiStatus>(null)
  const [geminiKey, setGeminiKeyState] = useState(loadGeminiKey)

  const [inputMode, setInputMode] = useState<'pdf' | 'url'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [lang, setLang] = useState(LANGUAGES[0].code)

  const [docFile, setDocFile] = useState<File | null>(null) // 表示中の PDF（翻訳開始時のファイル）
  const [docUrl, setDocUrl] = useState('') // URL から読み込んだときの元のページ
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

  const doneCount = translations.filter((tr) => tr !== null).length
  const busy = stage === 'fetching' || stage === 'preparing' || stage === 'translating'

  const setUiLang = (l: UiLang) => {
    setUiLangState(l)
    saveUiLang(l)
  }

  useEffect(() => {
    document.documentElement.lang = uiLang
  }, [uiLang])

  const setGeminiKey = (k: string) => {
    setGeminiKeyState(k)
    saveGeminiKey(k)
  }

  const checkApi = useCallback(async (target: string) => {
    saveApiUrl(target)
    try {
      const h = await health(target)
      setApiStatus({ ok: true, mock: h.mock })
    } catch (e) {
      setApiStatus({ ok: false, mock: false, error: isNetworkError(e) ? undefined : (e as Error).message })
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
      setError(t.notPdf)
      return
    }
    setError('')
    setFile(f)
  }

  async function run() {
    if (busy) return
    if (inputMode === 'pdf' && !file) return
    if (inputMode === 'url' && !isHttpUrl(url)) {
      setError(t.urlInvalid)
      return
    }
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

    // 0. URL のときは、サーバーに PDF を取ってきてもらう
    let pdfFile: File
    if (inputMode === 'url') {
      setStage('fetching')
      try {
        pdfFile = await fetchPdf(apiUrl, url.trim(), controller.signal)
      } catch (e) {
        if (controller.signal.aborted) return
        const status = (e as { status?: number }).status
        const detail =
          status === 404 || status === 405 ? t.fetchNotSupported : friendlyError(e, t)
        setError(detail === t.networkError || detail === t.fetchNotSupported ? detail : `${t.fetchFailed} ${detail}`)
        setStage('idle')
        return
      }
    } else {
      pdfFile = file as File
    }

    // 1. 段落を取り出す（数秒）
    setStage('preparing')
    let prepared: PrepareResponse
    try {
      prepared = await prepare(apiUrl, pdfFile, lang)
    } catch (e) {
      if (controller.signal.aborted) return
      const msg = friendlyError(e, t) // サーバーの応答は「PDF を読めませんでした: …」などすでに文になっている
      setError(msg === t.networkError || msg.startsWith('PDF') ? msg : `${t.prepareFailed} ${msg}`)
      setStage('idle')
      return
    }
    if (controller.signal.aborted) return
    setDocFile(pdfFile)
    setDocUrl(inputMode === 'url' ? url.trim() : '')
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
        setSummaryError(friendlyError(e, t))
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
        setTranslations((ts) => ts.map((tr, j) => (j === i ? res.translation : tr)))
        prev = { source: p.source, translation: res.translation }
      } catch (e) {
        if (controller.signal.aborted) return
        setError(`${t.translateFailed(i + 1)} ${friendlyError(e, t)}`)
        setStage('error')
        return
      }
    }
    setStage('done')
  }

  /** 別の論文を読み込む: 進行中の処理を止めて入力画面に戻る（選んだ言語と入力方法は残す） */
  function reset() {
    if (stage === 'translating' && !window.confirm(t.confirmAbort)) return
    abortRef.current?.abort()
    setDoc(null)
    setDocFile(null)
    setDocUrl('')
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
    const existing = terms.find((x) => normalizeTerm(x.term) === key)
    if (existing && existing.status !== 'error') return // 説明済み（または生成中）ならそれを見せる

    const contexts = buildContexts(term, at, doc.paragraphs, translations)
    const update = (patch: Partial<TermEntry>) =>
      setTerms((ts) => ts.map((x) => (normalizeTerm(x.term) === key ? { ...x, ...patch } : x)))
    setTerms((ts) => [
      ...ts.filter((x) => normalizeTerm(x.term) !== key),
      { term, status: 'loading', explanation: '', contexts },
    ])
    try {
      const res = await explainTerm(apiUrl, { term, target_lang: doc.target_lang, contexts }, geminiKey)
      update({ status: 'done', explanation: res.explanation })
    } catch (e) {
      update({ status: 'error', explanation: friendlyError(e, t) })
    }
  }

  const openTerm = (key: string) => {
    setActiveTerm(key)
    setTab((cur) => (cur === 'terms' ? 'full' : cur))
  }

  const pattern = useMemo(() => termPattern(terms), [terms])
  const activeEntry = terms.find((x) => normalizeTerm(x.term) === activeTerm) ?? null
  const pagesWithText = useMemo(() => [...new Set(doc?.paragraphs.map((p) => p.page) ?? [])], [doc])
  const title = docFile?.name.replace(/\.pdf$/i, '') ?? ''

  const topbar = (
    <header className="topbar">
      <span className="brand">Paper Reader</span>
      <div className="topbar-actions">
        <UiLangSwitch uiLang={uiLang} setUiLang={setUiLang} t={t} />
        <Settings
          apiUrl={apiUrl}
          setApiUrl={setApiUrl}
          geminiKey={geminiKey}
          setGeminiKey={setGeminiKey}
          apiStatus={apiStatus}
          onCheck={() => checkApi(apiUrl)}
          t={t}
        />
      </div>
    </header>
  )

  // ---------- 入力画面 ----------
  if (!doc) {
    const canRun = !busy && (inputMode === 'pdf' ? !!file : url.trim().length > 0)
    return (
      <div className="app">
        {topbar}

        <main className="landing">
          <h1>Paper Reader</h1>
          <p className="lead">{t.appDescription}</p>

          <div className="card input-card">
            <div className="tabs centered" role="tablist">
              {(
                [
                  ['url', t.tabUrl],
                  ['pdf', t.tabPdf],
                ] as ['url' | 'pdf', string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={inputMode === mode}
                  className={inputMode === mode ? 'active' : ''}
                  onClick={() => {
                    setInputMode(mode)
                    setError('')
                  }}
                  disabled={busy}
                >
                  {label}
                </button>
              ))}
            </div>

            {inputMode === 'url' ? (
              <div className="input-pane">
                <input
                  type="url"
                  className="text-input"
                  placeholder="https://arxiv.org/abs/..."
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') run()
                  }}
                  disabled={busy}
                  autoFocus
                />
                <small className="muted">{t.urlHelp}</small>
                <div className="notice info">{t.urlNote}</div>
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
                      <span className="muted">
                        {(file.size / 1024 / 1024).toFixed(1)} MB ・ {t.dropChange}
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>{t.dropTitle}</strong>
                      <span className="muted">{t.dropSub}</span>
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
              <span>{t.targetLang}</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l[uiLang]}
                  </option>
                ))}
              </select>
            </label>

            {error && <div className="notice error">{error}</div>}
            {apiStatus?.ok && apiStatus.mock && <div className="notice warn">{t.mockWarning}</div>}

            <button className="btn primary wide" onClick={run} disabled={!canRun}>
              {busy ? (
                <>
                  <span className="spinner light" aria-hidden /> {stage === 'fetching' ? t.fetching : t.preparing}
                </>
              ) : (
                t.translate
              )}
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ---------- 翻訳結果画面 ----------
  const targetLabel = langLabel(doc.target_lang, uiLang)
  return (
    <div className="app wide">
      {topbar}

      <div className="doc-head">
        <div className="doc-meta">
          <h1 className="doc-title" title={title}>
            {title}
          </h1>
          <div className="meta-row">
            <span className="chip">
              {t.sourceLangName} → {targetLabel}
            </span>
            <span className={`status-pill ${stage}`}>
              {stage === 'translating' && (
                <>
                  <span className="spinner" aria-hidden /> {t.translating(doneCount, translations.length)}
                </>
              )}
              {stage === 'done' && t.translateDone(translations.length)}
              {stage === 'error' && t.translateStopped(doneCount, translations.length)}
            </span>
            {apiStatus?.mock && <span className="chip warn">{t.mockChip}</span>}
            {docUrl && (
              <a className="source-link" href={docUrl} target="_blank" rel="noopener noreferrer">
                {t.openOriginal} ↗
              </a>
            )}
          </div>
          {stage === 'translating' && (
            <div className="progress" aria-hidden>
              <div style={{ width: `${(doneCount / Math.max(1, translations.length)) * 100}%` }} />
            </div>
          )}
        </div>
        <button className="btn secondary" onClick={reset}>
          {t.loadAnother}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}

      <nav className="tabs result-tabs" role="tablist">
        {(
          [
            ['summary', summaryStatus === 'loading' ? t.tabSummaryLoading : t.tabSummary],
            ['full', t.tabFull],
            ['terms', `${t.tabTerms}${terms.length ? ` (${terms.length})` : ''}`],
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
        <SummaryView status={summaryStatus} summary={summary} error={summaryError} t={t} />
      </section>

      <section hidden={tab !== 'full'} className="tab-panel">
        <div className={`reader${view === 'pdf' ? ' full' : ''}`}>
          <div className="reader-main">
            <div className="reader-toolbar">
              <div className="segmented" role="group" aria-label={t.viewLabel}>
                <button className={view === 'pdf' ? 'active' : ''} onClick={() => setView('pdf')}>
                  {t.viewPdf}
                </button>
                <button className={view === 'parallel' ? 'active' : ''} onClick={() => setView('parallel')}>
                  {t.viewParallel}
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
                    {t.jumpToPage}
                  </option>
                  {pagesWithText.map((p) => (
                    <option key={p} value={p}>
                      {t.page(p + 1)}
                    </option>
                  ))}
                </select>
              )}
              <span className="muted hint">{t.selectHint}</span>
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
                  sourceLabel={t.sourceLangName}
                  targetLabel={targetLabel}
                  t={t}
                />
              </div>
              <div hidden={view !== 'pdf'}>
                <p className="muted hint">{t.pdfHint}</p>
                {docFile && (
                  <PdfPages file={docFile} pages={doc.pages} paragraphs={doc.paragraphs} translations={translations} />
                )}
              </div>
            </div>
          </div>
          <TermPanel entry={activeEntry} onClose={() => setActiveTerm(null)} t={t} />
        </div>
        {activeEntry && <div className="drawer-backdrop" onClick={() => setActiveTerm(null)} />}
      </section>

      <section hidden={tab !== 'terms'} className="tab-panel">
        {terms.length === 0 ? (
          <div className="state-box">{t.termsEmpty}</div>
        ) : (
          <ul className="term-list">
            {terms.map((x) => (
              <li key={x.term} className="card">
                <button className="term-list-head" onClick={() => openTerm(normalizeTerm(x.term))}>
                  {x.term}
                  <span className="muted">{t.showInText}</span>
                </button>
                {x.status === 'loading' && <p className="muted">{t.explaining}</p>}
                {x.status === 'error' && (
                  <p className="error-text">
                    {t.explainFailed}
                    {x.explanation}
                  </p>
                )}
                {x.status === 'done' && (
                  <p>
                    {isDummyExplanation(x.explanation) && <span className="chip warn">{t.dummy}</span>}{' '}
                    {x.explanation}
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
          {t.explainButton(selection.term.length > 20 ? `${selection.term.slice(0, 20)}…` : selection.term)}
        </button>
      )}
    </div>
  )
}
