import type {
  ExplainRequest,
  ExplainResponse,
  HealthResponse,
  PrepareResponse,
  SummarizeRequest,
  SummarizeResponse,
  TranslateParagraphRequest,
  TranslateParagraphResponse,
} from './types'

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      // JSON でないエラー応答はそのまま
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

const join = (base: string, path: string) => base.replace(/\/+$/, '') + path

function postJson<T>(baseUrl: string, path: string, body: unknown, signal?: AbortSignal) {
  return fetch(join(baseUrl, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }).then((res) => parse<T>(res))
}

export async function health(baseUrl: string): Promise<HealthResponse> {
  return parse(await fetch(join(baseUrl, '/api/health')))
}

/** PDF を段落と用語集にする（数秒） */
export async function prepare(
  baseUrl: string,
  file: File,
  targetLang: string,
): Promise<PrepareResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('target_lang', targetLang)
  return parse(await fetch(join(baseUrl, '/api/prepare'), { method: 'POST', body: form }))
}

/** 1段落を訳す（本番で約10秒） */
export function translateParagraph(
  baseUrl: string,
  req: TranslateParagraphRequest,
  signal?: AbortSignal,
): Promise<TranslateParagraphResponse> {
  return postJson(baseUrl, '/api/translate-paragraph', req, signal)
}

export function summarize(
  baseUrl: string,
  req: SummarizeRequest,
  signal?: AbortSignal,
): Promise<SummarizeResponse> {
  return postJson(baseUrl, '/api/summarize', req, signal)
}

export function explainTerm(baseUrl: string, req: ExplainRequest): Promise<ExplainResponse> {
  return postJson(baseUrl, '/api/explain', req)
}
