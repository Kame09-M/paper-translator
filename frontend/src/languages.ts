import type { UiLang } from './i18n'

// 翻訳先の候補。code は PLaMo 3 Translate の言語コード（モデルカードの Supported Languages。全53言語）
// backend/app/services/summarize.py の LANG_NAMES と同じ8言語。表示名は画面の表示言語で切り替える
export const LANGUAGES = [
  { code: 'ja', ja: '日本語', en: 'Japanese' },
  { code: 'en', ja: '英語', en: 'English' },
  { code: 'zh-hans', ja: '中国語（簡体字）', en: 'Chinese (Simplified)' },
  { code: 'zh-hant', ja: '中国語（繁体字）', en: 'Chinese (Traditional)' },
  { code: 'ko', ja: '韓国語', en: 'Korean' },
  { code: 'fr', ja: 'フランス語', en: 'French' },
  { code: 'de', ja: 'ドイツ語', en: 'German' },
  { code: 'es', ja: 'スペイン語', en: 'Spanish' },
]

export const langLabel = (code: string, ui: UiLang = 'ja') =>
  LANGUAGES.find((l) => l.code === code)?.[ui] ?? code
