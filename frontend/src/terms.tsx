import type { ReactNode } from 'react'

/** 説明を取得した語（この画面を開いている間だけ保持する。用語説明 API の結果そのまま） */
export interface TermEntry {
  term: string
  status: 'loading' | 'done' | 'error'
  explanation: string
  contexts: string[] // 説明の根拠として API に渡した段落
}

export const normalizeTerm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** バックエンドのダミー出力か（services/explain.py, summarize.py のダミーの書き出し） */
export const isDummyExplanation = (s: string) => s.startsWith('（ダミー説明）')
export const isDummySummary = (s: string) => s.includes('- （ダミー）')

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 説明済みの語を本文中から探す正規表現（長い語を優先）。対象が無ければ null */
export function termPattern(terms: TermEntry[]): RegExp | null {
  const words = terms
    .filter((t) => t.status === 'done' && t.term.length >= 2)
    .map((t) => t.term)
    .sort((a, b) => b.length - a.length)
  if (words.length === 0) return null
  return new RegExp(`(${words.map(escape).join('|')})`, 'gi')
}

/** 本文中の説明済みの語をハイライトし、クリックでその説明を開く */
export function highlightTerms(
  text: string,
  pattern: RegExp | null,
  activeTerm: string | null,
  onOpen: (term: string) => void,
  title = '',
): ReactNode {
  if (!pattern) return text
  const parts = text.split(pattern)
  if (parts.length === 1) return text
  return parts.map((part, i) => {
    if (i % 2 === 0) return part
    const key = normalizeTerm(part)
    return (
      <mark
        key={i}
        className={`term${activeTerm === key ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        title={title}
        onClick={() => onOpen(key)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen(key)
          }
        }}
      >
        {part}
      </mark>
    )
  })
}
