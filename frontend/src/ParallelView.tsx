import { useMemo } from 'react'
import type { Messages } from './i18n'
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
  t,
}: {
  paragraphs: SourceParagraph[]
  translations: (string | null)[]
  translating: boolean
  pattern: RegExp | null
  activeTerm: string | null
  onOpenTerm: (term: string) => void
  sourceLabel: string
  targetLabel: string
  t: Messages
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
        <div>{t.sourceColumn(sourceLabel)}</div>
        <div>{t.targetColumn(targetLabel)}</div>
      </div>
      {paragraphs.map((p, i) => {
        const tr = translations[p.id]
        return (
          <div key={p.id}>
            {firstOfPage[i] && (
              <div className="page-divider" id={`page-${p.page}`}>
                {t.page(p.page + 1)}
              </div>
            )}
            <div className="pair" id={`para-${p.id}`}>
              <p className="cell source" data-paragraph={p.id} lang="en">
                {highlightTerms(p.source, pattern, activeTerm, onOpenTerm, t.termTitle)}
              </p>
              <p className={`cell target${tr === null ? ' pending' : ''}`} data-paragraph={p.id}>
                {tr !== null
                  ? highlightTerms(tr, pattern, activeTerm, onOpenTerm, t.termTitle)
                  : p.id === current
                    ? t.cellTranslating
                    : translating
                      ? t.cellWaiting
                      : t.cellNotTranslated}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
