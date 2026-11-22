// 翻訳先の候補。code は PLaMo 3 Translate の言語コード（モデルカードの Supported Languages。全53言語）
// backend/app/services/summarize.py の LANG_NAMES と同じ8言語
export const LANGUAGES = [
  { code: 'ja', label: '日本語' },
  { code: 'en', label: '英語' },
  { code: 'zh-hans', label: '中国語（簡体字）' },
  { code: 'zh-hant', label: '中国語（繁体字）' },
  { code: 'ko', label: '韓国語' },
  { code: 'fr', label: 'フランス語' },
  { code: 'de', label: 'ドイツ語' },
  { code: 'es', label: 'スペイン語' },
]

export const langLabel = (code: string) => LANGUAGES.find((l) => l.code === code)?.label ?? code
