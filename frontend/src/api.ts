import type {
  ExplainRequest,
  ExplainResponse,
  HealthResponse,
  TranslateResponse,
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

export async function health(baseUrl: string): Promise<HealthResponse> {
  return parse(await fetch(join(baseUrl, '/api/health')))
}

export async function translatePdf(
  baseUrl: string,
  file: File,
  targetLang: string,
): Promise<TranslateResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('target_lang', targetLang)
  return parse(await fetch(join(baseUrl, '/api/translate'), { method: 'POST', body: form }))
}

export async function explainTerm(baseUrl: string, req: ExplainRequest): Promise<ExplainResponse> {
  return parse(
    await fetch(join(baseUrl, '/api/explain'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  )
}
