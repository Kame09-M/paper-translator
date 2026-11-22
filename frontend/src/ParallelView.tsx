import { useMemo } from 'react'
import { highlightTerms } from './terms'
import type { SourceParagraph } from './types'

/** 原文（左）と訳（右）を段落ごとに同じ行に並べる。ページの区切りを入れる */
export default function ParallelView({
  paragraphs,
  translations,
  translating,
  pattern,
  activeTerm,
  onOpenTerm,
  sourceLabel,
  targetLabel,
}: {
  paragraphs: SourceParagraph[]
  translations: (string | null)[]
  translating: boolean
  pattern: RegExp | null
  activeTerm: string | null
  onOpenTerm: (term: string) => void
  sourceLabel: string
  targetLabel: string
}) {
  const current = translating ? translations.findIndex((t) => t === null) : -1
  const firstOfPage = useMemo(() => {
    const seen = new Set<number>()
    return paragraphs.map((p) => {
      if (seen.has(p.page)) return false
      seen.add(p.page)
      return true
    })
  }, [paragraphs])

  return (
    <div className="parallel">
      <div className="parallel-head" aria-hidden>
        <div>原文（{sourceLabel}）</div>
        <div>訳文（{targetLabel}）</div>
      </div>
      {paragraphs.map((p, i) => {
        const t = translations[p.id]
        return (
          <div key={p.id}>
            {firstOfPage[i] && (
              <div className="page-divider" id={`page-${p.page}`}>
                {p.page + 1} ページ
              </div>
            )}
            <div className="pair" id={`para-${p.id}`}>
              <p className="cell source" data-paragraph={p.id} lang="en">
                {highlightTerms(p.source, pattern, activeTerm, onOpenTerm)}
              </p>
              <p className={`cell target${t === null ? ' pending' : ''}`} data-paragraph={p.id}>
                {t !== null
                  ? highlightTerms(t, pattern, activeTerm, onOpenTerm)
                  : p.id === current
                    ? '翻訳中…'
                    : translating
                      ? '翻訳待ち'
                      : '未翻訳'}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
