import { useMemo, useState } from 'react'
import { explainTerm, health, translatePdf } from './api'
import type { GlossaryEntry, TranslateResponse } from './types'

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
  const re = new RegExp(`\\b(${glossary.map((g) => escapeRegExp(g.term)).join('|')})\\b`, 'gi')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) => {
        const g = i % 2 === 1 ? byTerm.get(part.toLowerCase()) : undefined
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
  const [result, setResult] = useState<TranslateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<GlossaryEntry | null>(null)
  const [explanation, setExplanation] = useState('')

  const paragraphText = useMemo(
    () => new Map(result?.paragraphs.map((p) => [p.id, p.source]) ?? []),
    [result],
  )

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
    saveApiUrl(apiUrl)
    setLoading(true)
    setError('')
    setResult(null)
    setSelected(null)
    try {
      setResult(await translatePdf(apiUrl, file, lang))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function openTerm(g: GlossaryEntry) {
    if (!result) return
    setSelected(g)
    setExplanation('説明を生成中…')
    try {
      const contexts = g.paragraph_ids.map((id) => paragraphText.get(id) ?? '')
      const res = await explainTerm(apiUrl, { term: g.term, target_lang: result.target_lang, contexts })
      setExplanation(res.explanation)
    } catch (e) {
      setExplanation(`説明を取得できませんでした: ${(e as Error).message}`)
    }
  }

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
        <button onClick={run} disabled={!file || loading}>
          {loading ? '翻訳中…' : '翻訳する'}
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {result && (
        <main className="result">
          <section className="summary">
            <h2>要約</h2>
            <p>{result.summary}</p>
          </section>

          <section className="pairs">
            {result.paragraphs.map((p) => (
              <div className="pair" key={p.id}>
                <p className="source">
                  <Highlighted text={p.source} glossary={result.glossary} onClick={openTerm} />
                </p>
                <p className="translation">{p.translation}</p>
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
