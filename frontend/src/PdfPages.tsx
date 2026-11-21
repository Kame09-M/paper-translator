import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { paragraphAt } from './selection'
import type { PageSize, SourceParagraph } from './types'

GlobalWorkerOptions.workerSrc = workerUrl

const GAP = 16 // 左右のページの間（px）

/** 枠からはみ出さない大きさまで文字を小さくする */
function FittedBlock({ maxFontPx, children }: { maxFontPx: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let size = maxFontPx
    el.style.fontSize = `${size}px`
    while (el.scrollHeight > el.clientHeight + 1 && size > 4) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
  })
  return (
    <div ref={ref} className="fitted">
      {children}
    </div>
  )
}

function PageRow({
  pdf,
  pageNo,
  size,
  width,
  paragraphs,
  translations,
  hovered,
  onHover,
}: {
  pdf: PDFDocumentProxy
  pageNo: number
  size: PageSize
  width: number
  paragraphs: SourceParagraph[]
  translations: (string | null)[]
  hovered: number | null
  onHover: (id: number | null) => void
}) {
  const originalRef = useRef<HTMLCanvasElement>(null)
  const translatedRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const scale = width / size.width
  const height = size.height * scale

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    let textLayer: TextLayer | null = null
    ;(async () => {
      const page = await pdf.getPage(pageNo + 1)
      const original = originalRef.current
      const translated = translatedRef.current
      const textDiv = textLayerRef.current
      if (cancelled || !original || !translated || !textDiv) return

      // 原文の英語を選択できるよう、透明な文字の層を重ねる
      textDiv.replaceChildren()
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textDiv,
        viewport: page.getViewport({ scale }),
      })
      textLayer.render().catch(() => {}) // 描き直しで中断されたときは無視

      const ratio = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: scale * ratio })
      for (const c of [original, translated]) {
        c.width = viewport.width
        c.height = viewport.height
      }
      task = page.render({ canvas: original, viewport })
      try {
        await task.promise
      } catch {
        return // 描き直しで中断された
      }
      if (cancelled) return
      translated.getContext('2d')?.drawImage(original, 0, 0)
    })()
    return () => {
      cancelled = true
      task?.cancel()
      textLayer?.cancel()
    }
  }, [pdf, pageNo, scale])

  const box = (p: SourceParagraph) => {
    const [x0, y0, x1, y1] = p.bbox
    const pad = 1.5 // 原文の文字が端から見えないように少し広げる
    return {
      left: (x0 - pad) * scale,
      top: (y0 - pad) * scale,
      width: (x1 - x0 + pad * 2) * scale,
      height: (y1 - y0 + pad * 2) * scale,
    }
  }

  // 枠の div はテキスト選択の邪魔をしないので、マウスの位置から段落を引く
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    onHover(paragraphAt(paragraphs, (e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale))
  }

  return (
    <div className="page-row" style={{ gap: GAP }}>
      <div
        className="page"
        style={{ width, height }}
        data-page={pageNo}
        data-scale={scale}
        onMouseMove={onMouseMove}
        onMouseLeave={() => onHover(null)}
      >
        <canvas ref={originalRef} style={{ width, height }} />
        {paragraphs.map((p) => (
          <div
            key={p.id}
            className={`block source-block${hovered === p.id ? ' hovered' : ''}`}
            style={box(p)}
          />
        ))}
        <div
          ref={textLayerRef}
          className="textLayer"
          style={{ '--total-scale-factor': scale } as React.CSSProperties}
        />
      </div>
      <div
        className="page"
        style={{ width, height }}
        data-page={pageNo}
        data-scale={scale}
        onMouseMove={onMouseMove}
        onMouseLeave={() => onHover(null)}
      >
        <canvas ref={translatedRef} style={{ width, height }} />
        {paragraphs.map((p) => {
          const t = translations[p.id]
          return (
            <div
              key={p.id}
              data-paragraph={p.id}
              className={`block ${t ? 'translated-block' : 'pending-block'}${hovered === p.id ? ' hovered' : ''}`}
              style={box(p)}
            >
              {t && <FittedBlock maxFontPx={10 * scale}>{t}</FittedBlock>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 原文のページ（左）と、同じページの段落の位置に訳を重ねたもの（右）を並べる */
export default function PdfPages({
  file,
  pages,
  paragraphs,
  translations,
}: {
  file: File
  pages: PageSize[]
  paragraphs: SourceParagraph[]
  translations: (string | null)[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [width, setWidth] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    let task: ReturnType<typeof getDocument> | null = null
    let cancelled = false
    setPdf(null)
    setError('')
    file
      .arrayBuffer()
      .then((data) => {
        if (cancelled) return null
        task = getDocument({ data })
        return task.promise
      })
      .then((d) => {
        if (d && !cancelled) setPdf(d)
      })
      .catch((e) => {
        if (!cancelled) setError(`PDF を表示できませんでした: ${(e as Error).message}`)
      })
    return () => {
      cancelled = true
      task?.destroy()
    }
  }, [file])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor((entry.contentRect.width - GAP) / 2))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="pdf-pages">
      {error && <p className="error">{error}</p>}
      {pdf &&
        width > 0 &&
        pages.map((size, i) => (
          <PageRow
            key={i}
            pdf={pdf}
            pageNo={i}
            size={size}
            width={width}
            paragraphs={paragraphs.filter((p) => p.page === i)}
            translations={translations}
            hovered={hovered}
            onHover={setHovered}
          />
        ))}
    </div>
  )
}
