import { useEffect, useRef, useState } from 'react'
import PdfPages from './PdfPages'
import { explainTerm, health, prepare, summarize, translateParagraph } from './api'
import { buildContexts, paragraphAtSelection } from './selection'
import type { PrepareResponse } from './types'

// 翻訳先の候補。code は PLaMo 3 Translate の言語コード（モデルカードの Supported Languages。全53言語）
const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: '英語' },
  { code: 'zh-hans', label: '中国語（簡体字）' },
  { code: 'zh-hant', label: '中国語（繁体字）' },
  { code: 'ko', label: '韓国語' },
  { code: 'fr', label: 'フランス語' },
  { code: 'de', label: 'ドイツ語' },
  { code: 'es', label: 'スペイン語' },
]

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

export default function App() {
  const [apiUrl, setApiUrl] = useState(loadApiUrl)
  const [apiStatus, setApiStatus] = useState('')
  const [geminiKey, setGeminiKey] = useState(loadGeminiKey)
  const [file, setFile] = useState<File | null>(null)
  const [docFile, setDocFile] = useState<File | null>(null) // 表示中の PDF（翻訳開始時のファイル）
  const [lang, setLang] = useState(LANGUAGES[0].code)
  const [doc, setDoc] = useState<PrepareResponse | null>(null)
  const [translations, setTranslations] = useState<(string | null)[]>([])
  const [summary, setSummary] = useState('')
  const [stage, setStage] = useState<'idle' | 'preparing' | 'translating' | 'done'>('idle')
  const [error, setError] = useState('')
  // 選択中の語と「説明」ボタンの位置（画面座標）。説明パネルに出している語
  const [selection, setSelection] = useState<{ term: string; at: number | null; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [explanation, setExplanation] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const doneCount = translations.filter((t) => t !== null).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null)
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function checkApi() {
    saveApiUrl(apiUrl)
    try {
      const h = await health(apiUrl)
      setApiStatus(h.mock ? '接続OK（MOCK）' : '接続OK')
    } catch (e) {
      setApiStatus(`接続できません: ${(e as Error).message}`)
    }
  }

  async function run() {
    if (!file) return
    abortRef.current?.abort() // 前回の翻訳が続いていれば止める
    const controller = new AbortController()
    abortRef.current = controller
    saveApiUrl(apiUrl)
    setError('')
    setDoc(null)
    setTranslations([])
    setSummary('')
    setSelected(null)
    setStage('preparing')

    try {
      // 1. 段落と用語集（数秒）
      const prepared = await prepare(apiUrl, file, lang)
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
        .then((res) => setSummary(res.summary))
        .catch((e) => {
          if (!controller.signal.aborted) setSummary(`要約を取得できませんでした: ${e.message}`)
        })

      // 3. 段落を1つずつ訳す。直前の段落の原文と訳を履歴として渡す
      let prev: { source: string; translation: string } | null = null
      for (const [i, p] of prepared.paragraphs.entries()) {
        const res = await translateParagraph(
          apiUrl,
          {
            text: p.source,
            target_lang: prepared.target_lang,
            history: prev ? [prev] : [],
          },
          controller.signal,
        )
        if (controller.signal.aborted) return
        setTranslations((ts) => ts.map((t, j) => (j === i ? res.translation : t)))
        prev = { source: p.source, translation: res.translation }
      }
      setStage('done')
    } catch (e) {
      if (controller.signal.aborted) return
      setError((e as Error).message)
      setStage('idle')
    }
  }

  /** ページ上で文字を選んだら、その近くに「説明」ボタンを出す */
  function onPagesMouseUp() {
    if (!doc) return
    const sel = window.getSelection()
    const term = sel?.toString().replace(/\s+/g, ' ').trim() ?? ''
    if (!sel || sel.rangeCount === 0 || term.length === 0 || term.length > 80) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    const r = range.getBoundingClientRect()
    setSelection({ term, at: paragraphAtSelection(range, doc.paragraphs), x: r.left, y: r.bottom + 6 })
  }

  async function explainSelection() {
    if (!doc || !selection) return
    const { term, at } = selection
    setSelection(null)
    window.getSelection()?.removeAllRanges()
    setSelected(term)
    setExplanation('説明を生成中…')
    try {
      const contexts = buildContexts(term, at, doc.paragraphs, translations)
      const res = await explainTerm(
        apiUrl,
        { term, target_lang: doc.target_lang, contexts },
        geminiKey,
      )
      setExplanation(res.explanation)
    } catch (e) {
      setExplanation(`説明を取得できませんでした: ${(e as Error).message}`)
    }
  }

  const busy = stage === 'preparing' || stage === 'translating'

  return (
    <div className="app">
      <header className="toolbar">
        <label>
          API URL
          <input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} />
        </label>
        <button onClick={checkApi}>接続確認</button>
        <span className="status">{apiStatus}</span>
        <label>
          Gemini API キー
          <input
            type="password"
            autoComplete="off"
            placeholder="要約・用語説明に使う（空ならダミー）"
            value={geminiKey}
            onChange={(e) => {
              setGeminiKey(e.target.value.trim())
              saveGeminiKey(e.target.value.trim())
            }}
          />
        </label>
      </header>

      <section className="controls">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={!file || stage === 'preparing'}>
          {busy ? 'やり直す' : '翻訳する'}
        </button>
        <span className="status">
          {stage === 'preparing' && 'PDF を読み込み中…'}
          {stage === 'translating' && `翻訳中… ${doneCount} / ${translations.length} 段落`}
          {stage === 'done' && `完了（${translations.length} 段落）`}
        </span>
      </section>

      {error && <p className="error">{error}</p>}

      {doc && (
        <main className="result">
          <details className="summary" open>
            <summary>要約{summary ? '' : '（生成中…）'}</summary>
            <p className="summary-text">{summary || '要約を生成中…'}</p>
          </details>

          <p className="hint">
            左が原文、右が訳です。段落にマウスを乗せると、反対側の同じ段落が光ります。
            分からない語を選択すると、その語のこの論文での意味を説明できます。
          </p>

          {docFile && (
            <div onMouseUp={onPagesMouseUp}>
              <PdfPages
                file={docFile}
                pages={doc.pages}
                paragraphs={doc.paragraphs}
                translations={translations}
              />
            </div>
          )}

          {selection && (
            <button
              className="explain-button"
              style={{ left: selection.x, top: selection.y }}
              onMouseDown={(e) => e.preventDefault()} // 押した瞬間に選択が外れないように
              onClick={explainSelection}
            >
              この用語のこの論文での意味を説明
            </button>
          )}

          {selected && (
            <aside className="term-panel">
              <button className="close" onClick={() => setSelected(null)} aria-label="閉じる">
                ×
              </button>
              <h3>{selected}</h3>
              <p>{explanation}</p>
            </aside>
          )}
        </main>
      )}
    </div>
  )
}
