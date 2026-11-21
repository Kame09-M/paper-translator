// API の型。変更するときは backend/app/schemas.py も必ず同時に直す。

export interface Paragraph {
  id: number
  source: string
  translation: string
}

export interface GlossaryEntry {
  term: string
  translation: string
  paragraph_ids: number[] // 用語が出現する段落の id（用語説明の根拠に使う）
}

export interface TranslateResponse {
  target_lang: string
  paragraphs: Paragraph[]
  glossary: GlossaryEntry[]
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
