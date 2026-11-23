import type { Messages } from './i18n'
import { isDummySummary } from './terms'

interface Section {
  heading: string
  lines: string[]
}

/**
 * 要約のテキストを [見出し] ごとに分ける（summarize.py の出力形式: [研究背景]〜[結論]、各項目は「- 」の箇条書き）。
 * 見出しが見つからなければ null（そのまま表示する）。内容は書き換えない
 */
function parseSummary(text: string): Section[] | null {
  const sections: Section[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const m = line.match(/^(?:#+\s*)?\**\s*[[［【]([^\]］】]+)[\]］】]\s*\**\s*(.*)$/)
    if (m) {
      sections.push({ heading: m[1].trim(), lines: m[2] ? [m[2]] : [] })
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line)
    } else {
      return null // 見出しの前に文がある＝想定外の形式
    }
  }
  return sections.length > 0 ? sections : null
}

const stripBullet = (s: string) => s.replace(/^[-・*•]\s*/, '')

export default function SummaryView({
  status,
  summary,
  error,
  t,
}: {
  status: 'loading' | 'done' | 'error'
  summary: string
  error: string
  t: Messages
}) {
  if (status === 'loading') {
    return (
      <div className="state-box">
        <span className="spinner" aria-hidden /> {t.summaryLoading}
      </div>
    )
  }
  if (status === 'error') {
    return <div className="notice error">
        {t.summaryFailed}
        {error}
      </div>
  }
  if (!summary.trim()) {
    return <div className="state-box">{t.summaryEmpty}</div>
  }

  const sections = parseSummary(summary)
  return (
    <div className="summary-view">
      {isDummySummary(summary) && (
        <div className="notice warn">{t.summaryDummy}</div>
      )}
      {sections ? (
        <div className="summary-grid">
          {sections.map((s, i) => (
            <section key={i} className="summary-card">
              <h3>{s.heading}</h3>
              <ul>
                {s.lines.map((l, j) => (
                  <li key={j}>{stripBullet(l)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="summary-raw">{summary}</p>
      )}
    </div>
  )
}
