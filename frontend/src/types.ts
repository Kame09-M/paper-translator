// API の型。変更するときは backend/app/schemas.py も必ず同時に直す。

export interface SourceParagraph {
  id: number
  source: string
  page: number // 0 始まりのページ番号
  bbox: [number, number, number, number] // 段落の位置 [x0, y0, x1, y1]。単位は pt、ページの左上が原点
}

export interface PageSize {
  width: number // pt
  height: number
}

export interface GlossaryEntry {
  term: string
  translation: string
  paragraph_ids: number[] // 用語が出現する段落の id（用語説明の根拠に使う）
}

export interface PrepareResponse {
  target_lang: string
  pages: PageSize[] // 全ページ（訳す段落がないページも含む）
  paragraphs: SourceParagraph[]
  glossary: GlossaryEntry[]
}

export interface HistoryPair {
  source: string
  translation: string
}

export interface TranslateParagraphRequest {
  text: string
  target_lang: string
  glossary: GlossaryEntry[]
  history?: HistoryPair[] // 直前の段落の原文と訳（訳語・文体をそろえるため）
}

export interface TranslateParagraphResponse {
  translation: string
}

export interface SummarizeRequest {
  target_lang: string
  paragraphs: string[] // 原文の段落
}

export interface SummarizeResponse {
  summary: string
}

export interface ExplainRequest {
  term: string
  target_lang: string
  contexts: string[] // 用語が出現する段落の原文
}

export interface ExplainResponse {
  term: string
  explanation: string
}

export interface HealthResponse {
  status: string
  mock: boolean
}
