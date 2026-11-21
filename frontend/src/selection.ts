import type { SourceParagraph } from './types'

/** ページ上の点（pt）を含む段落の id */
export function paragraphAt(paragraphs: SourceParagraph[], x: number, y: number): number | null {
  const p = paragraphs.find(({ bbox: [x0, y0, x1, y1] }) => x >= x0 && x <= x1 && y >= y0 && y <= y1)
  return p ? p.id : null
}

/** 選択範囲がある段落の id（ページ上の位置から引く）。ページの外なら null */
export function paragraphAtSelection(range: Range, paragraphs: SourceParagraph[]): number | null {
  const node = range.startContainer
  const el = node instanceof Element ? node : node.parentElement
  const direct = el?.closest('[data-paragraph]')
  if (direct) return Number(direct.getAttribute('data-paragraph'))
  const pageEl = el?.closest<HTMLElement>('[data-page]')
  if (!pageEl) return null
  const pageNo = Number(pageEl.dataset.page)
  const scale = Number(pageEl.dataset.scale)
  const pageRect = pageEl.getBoundingClientRect()
  const r = range.getBoundingClientRect()
  return paragraphAt(
    paragraphs.filter((p) => p.page === pageNo),
    (r.left + r.width / 2 - pageRect.left) / scale,
    (r.top + r.height / 2 - pageRect.top) / scale,
  )
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * 用語説明の根拠にする段落（最大 max 個）。選んだ位置の段落を先頭に、
 * 選んだ語を原文か訳に含む段落を続ける。訳があれば「原文 / 訳」の形で渡す。
 */
export function buildContexts(
  term: string,
  locationId: number | null,
  paragraphs: SourceParagraph[],
  translations: (string | null)[],
  max = 3,
): string[] {
  const t = normalize(term)
  const ids: number[] = locationId === null ? [] : [locationId]
  for (const p of paragraphs) {
    if (ids.length >= max) break
    if (ids.includes(p.id)) continue
    if (normalize(p.source).includes(t) || normalize(translations[p.id] ?? '').includes(t)) {
      ids.push(p.id)
    }
  }
  return ids.map((id) => {
    const tr = translations[id]
    const src = paragraphs[id].source
    return tr ? `原文: ${src}\n訳: ${tr}` : src
  })
}
