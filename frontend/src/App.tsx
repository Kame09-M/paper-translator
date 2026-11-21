import { useMemo, useRef, useState } from 'react'
import { explainTerm, health, prepare, summarize, translateParagraph } from './api'
import type { GlossaryEntry, PrepareResponse } from './types'

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

const DEFAULT_API = 'http://localhost:8000'

function loadApiUrl(): string {
  try {
    return localStorage.getItem('apiUrl') || DEFAULT_API
  } catch {
    return DEFAULT_API
  }
}

function saveApiUrl(url: string) {
  try {
    localStorage.setItem('apiUrl', url)
  } catch {
    // 保存できなくても動作には影響しない
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 本文中の語から用語集の項目を引く（複数形 -s / -es も同じ用語として扱う。バックエンドと同じ規則） */
function lookupTerm(word: string, byTerm: Map<string, GlossaryEntry>) {
  const w = word.toLowerCase()
  return byTerm.get(w) ?? byTerm.get(w.replace(/es$/, '')) ?? byTerm.get(w.replace(/s$/, ''))
}

/** 原文中の用語をクリック可能にする */
function Highlighted({
  text,
  glossary,
  onClick,
}: {
  text: string
  glossary: GlossaryEntry[]
  onClick: (g: GlossaryEntry) => void
}) {
  if (glossary.length === 0) return <>{text}</>
  const byTerm = new Map(glossary.map((g) => [g.term.toLowerCase(), g]))
  const alternatives = glossary.map((g) => escapeRegExp(g.term)).join('|')
  const re = new RegExp(`\\b((?:${alternatives})(?:e?s)?)\\b`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) => {
        const g = i % 2 === 1 ? lookupTerm(part, byTerm) : undefined
        return g ? (
          <button key={i} className="term" onClick={() => onClick(g)}>
            {part}
          </button>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(loadApiUrl)
  const [apiStatus, setApiStatus] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [lang, setLang] = useState(LANGUAGES[0].code)
  const [doc, setDoc] = useState<PrepareResponse | null>(null)
  const [translations, setTranslations] = useState<(string | null)[]>([])
  const [summary, setSummary] = useState('')
  const [stage, setStage] = useState<'idle' | 'preparing' | 'translating' | 'done'>('idle')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<GlossaryEntry | null>(null)
  const [explanation, setExplanation] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const paragraphText = useMemo(
    () => new Map(doc?.paragraphs.map((p) => [p.id, p.source]) ?? []),
    [doc],
  )
  const doneCount = translations.filter((t) => t !== null).length

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
      setDoc(prepared)
      setTranslations(prepared.paragraphs.map(() => null))
      setStage('translating')

      // 2. 要約は翻訳と並行して取る
      summarize(
        apiUrl,
        { target_lang: prepared.target_lang, paragraphs: prepared.paragraphs.map((p) => p.source) },
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
            glossary: prepared.glossary,
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

  async function openTerm(g: GlossaryEntry) {
    if (!doc) return
    setSelected(g)
    setExplanation('説明を生成中…')
    try {
      const contexts = g.paragraph_ids.map((id) => paragraphText.get(id) ?? '')
      const res = await explainTerm(apiUrl, { term: g.term, target_lang: doc.target_lang, contexts })
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
          <section className="summary">
            <h2>要約</h2>
            <p>{summary || '要約を生成中…'}</p>
          </section>

          <section className="pairs">
            {doc.paragraphs.map((p, i) => (
              <div className="pair" key={p.id}>
                <p className="source">
                  <Highlighted text={p.source} glossary={doc.glossary} onClick={openTerm} />
                </p>
                <p className="translation">
                  {translations[i] ?? <span className="pending">翻訳待ち…</span>}
                </p>
              </div>
            ))}
          </section>

          {selected && (
            <aside className="term-panel">
              <button className="close" onClick={() => setSelected(null)} aria-label="閉じる">
                ×
              </button>
              <h3>{selected.term}</h3>
              <p className="term-translation">訳語: {selected.translation}</p>
              <p>{explanation}</p>
            </aside>
          )}
        </main>
      )}
    </div>
  )
}
