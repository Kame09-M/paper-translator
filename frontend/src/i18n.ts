// 画面の表示言語（日本語 / English）。翻訳先の言語とは別。
// サーバーから返るエラー文・要約・用語説明は、サーバーが作った言語のまま表示する

export type UiLang = 'ja' | 'en'

const ja = {
  appDescription: '論文を翻訳し、要約と専門用語の解説を表示します',
  uiLanguage: '表示言語',
  // 接続設定
  settings: '接続設定',
  check: '接続確認',
  apiOk: '接続OK',
  apiOkMock: '接続OK（MOCK モード: 翻訳はダミーです）',
  geminiKey: 'Gemini API キー',
  geminiKeyPlaceholder: '要約・用語説明に使います',
  geminiKeyHelp:
    'このブラウザにだけ保存されます。空欄で、サーバーにもキーが無い場合、要約と用語説明はダミーになります。',
  // 入力画面
  tabUrl: 'URLから読み込む',
  tabPdf: 'PDFアップロード',
  urlHelp: '論文のURLを入力してください',
  urlNote:
    'arXiv の論文ページ（/abs/…）か、論文の PDF の URL に対応しています。ログインや購読が必要なサイトや、自動での取得を許可していないサイトからは読み込めません。',
  urlInvalid: 'http:// か https:// で始まる URL を入力してください。',
  dropTitle: 'PDF をここにドラッグ＆ドロップ',
  dropSub: 'または クリックしてファイルを選択',
  dropChange: 'クリックして選び直す',
  notPdf: 'PDF ファイルを選んでください。',
  targetLang: '翻訳先の言語',
  mockWarning: 'サーバーが MOCK モードです。翻訳・要約・用語説明はダミーになります。',
  translate: '翻訳する',
  fetching: 'URL から PDF を取得中…',
  preparing: 'PDF を読み込み中…',
  // エラー
  networkError:
    'サーバーに接続できませんでした。「接続設定」の API URL と、サーバー（Colab）が動いているかを確認してください。',
  fetchFailed: 'URL から PDF を取得できませんでした。',
  fetchNotSupported:
    'このサーバーは URL からの読み込みに対応していません。サーバー（Colab）を最新のコードで起動し直してください。',
  prepareFailed: 'PDF を読み込めませんでした。',
  translateFailed: (n: number) => `${n} 段落目の翻訳でエラーが発生しました。`,
  // 結果画面
  sourceLangName: '英語',
  openOriginal: '元の論文ページを開く',
  translating: (done: number, total: number) => `翻訳中 ${done} / ${total} 段落`,
  translateDone: (total: number) => `翻訳完了（${total} 段落）`,
  translateStopped: (done: number, total: number) => `翻訳を中断（${done} / ${total} 段落）`,
  mockChip: 'MOCK: ダミー翻訳',
  loadAnother: '別の論文を読み込む',
  confirmAbort: '翻訳を中止して、別の論文を読み込みますか？',
  tabSummary: '論文の要約',
  tabSummaryLoading: '論文の要約（生成中）',
  tabFull: '全文翻訳',
  tabTerms: '用語集',
  viewPdf: 'PDF レイアウト',
  viewParallel: '対訳（テキスト）',
  viewLabel: '表示',
  jumpToPage: 'ページへ移動',
  page: (n: number) => `${n} ページ`,
  selectHint: '語を選択すると、その語のこの論文での意味を説明します',
  pdfHint:
    '左が原文、右が段落の位置に訳を重ねたページです。段落にマウスを乗せると、反対側の同じ段落が光ります。',
  explainButton: (term: string) => `「${term}」のこの論文での意味を説明`,
  // 要約
  summaryLoading:
    '要約を生成しています。翻訳と並行して進むので、「全文翻訳」タブを読みながらお待ちください。',
  summaryFailed: '要約を取得できませんでした: ',
  summaryEmpty: '要約は空でした。',
  summaryDummy:
    'これはダミーの要約です（サーバーが MOCK モード、または Gemini API キーが未設定）。本物の要約を出すには「接続設定」で API キーを入力してください。',
  // 対訳
  sourceColumn: (lang: string) => `原文（${lang}）`,
  targetColumn: (lang: string) => `訳文（${lang}）`,
  cellTranslating: '翻訳中…',
  cellWaiting: '翻訳待ち',
  cellNotTranslated: '未翻訳',
  termTitle: 'クリックで説明を表示',
  // 用語の説明パネル・用語集
  termPanel: '用語の説明',
  close: '閉じる',
  explaining: '説明を生成中…',
  explainFailed: '説明を取得できませんでした: ',
  explainDummy: 'ダミーの説明です（MOCK モード、または Gemini API キーが未設定）。',
  evidence: (n: number) => `根拠にした段落（${n}）`,
  panelEmpty1a: '分からない語を原文または訳文の上で',
  panelEmpty1b: 'ドラッグして選択',
  panelEmpty1c: 'し、表示されるボタンを押すと、その語の「この論文での意味」をここに表示します。',
  panelEmpty2: '説明した語は本文中で青くハイライトされ、クリックするといつでも見返せます。',
  termsEmpty:
    'まだ用語がありません。「全文翻訳」で分からない語を選択して説明を表示すると、ここに一覧で残ります。',
  showInText: '本文で表示 →',
  dummy: 'ダミー',
}

export type Messages = typeof ja

const en: Messages = {
  appDescription: 'Translate papers, with a summary and explanations of technical terms',
  uiLanguage: 'Language',
  settings: 'Settings',
  check: 'Test',
  apiOk: 'Connected',
  apiOkMock: 'Connected (MOCK mode: translations are dummies)',
  geminiKey: 'Gemini API key',
  geminiKeyPlaceholder: 'Used for summaries and term explanations',
  geminiKeyHelp:
    'Saved only in this browser. If empty and the server has no key, summaries and explanations are dummies.',
  tabUrl: 'From URL',
  tabPdf: 'Upload PDF',
  urlHelp: 'Enter the URL of the paper',
  urlNote:
    'Supports arXiv paper pages (/abs/…) and direct PDF URLs. Sites that need a login or subscription, or that block automated downloads, cannot be loaded.',
  urlInvalid: 'Enter a URL that starts with http:// or https://.',
  dropTitle: 'Drag and drop a PDF here',
  dropSub: 'or click to choose a file',
  dropChange: 'Click to choose another',
  notPdf: 'Please choose a PDF file.',
  targetLang: 'Translate into',
  mockWarning: 'The server is in MOCK mode. Translations, summaries and explanations are dummies.',
  translate: 'Translate',
  fetching: 'Downloading the PDF…',
  preparing: 'Reading the PDF…',
  networkError:
    'Could not connect to the server. Check the API URL in Settings and that the server (Colab) is running.',
  fetchFailed: 'Could not download the PDF from this URL.',
  fetchNotSupported:
    'This server does not support loading from a URL. Restart the server (Colab) with the latest code.',
  prepareFailed: 'Could not read the PDF.',
  translateFailed: (n: number) => `Translation failed at paragraph ${n}.`,
  sourceLangName: 'English',
  openOriginal: 'Open the original page',
  translating: (done: number, total: number) => `Translating ${done} / ${total} paragraphs`,
  translateDone: (total: number) => `Done (${total} paragraphs)`,
  translateStopped: (done: number, total: number) => `Stopped (${done} / ${total} paragraphs)`,
  mockChip: 'MOCK: dummy translation',
  loadAnother: 'Load another paper',
  confirmAbort: 'Stop translating and load another paper?',
  tabSummary: 'Summary',
  tabSummaryLoading: 'Summary (generating)',
  tabFull: 'Full translation',
  tabTerms: 'Glossary',
  viewPdf: 'PDF layout',
  viewParallel: 'Side by side (text)',
  viewLabel: 'View',
  jumpToPage: 'Go to page',
  page: (n: number) => `Page ${n}`,
  selectHint: 'Select a word to see what it means in this paper',
  pdfHint:
    'Left: original page. Right: the same page with translations over each paragraph. Hover a paragraph to highlight its counterpart.',
  explainButton: (term: string) => `Explain “${term}” in this paper`,
  summaryLoading:
    'Generating the summary. It runs alongside the translation, so you can read the Full translation tab meanwhile.',
  summaryFailed: 'Could not get the summary: ',
  summaryEmpty: 'The summary was empty.',
  summaryDummy:
    'This is a dummy summary (the server is in MOCK mode, or no Gemini API key is set). Enter an API key in Settings to get a real summary.',
  sourceColumn: (lang: string) => `Original (${lang})`,
  targetColumn: (lang: string) => `Translation (${lang})`,
  cellTranslating: 'Translating…',
  cellWaiting: 'Waiting',
  cellNotTranslated: 'Not translated',
  termTitle: 'Click to show the explanation',
  termPanel: 'Term explanation',
  close: 'Close',
  explaining: 'Generating the explanation…',
  explainFailed: 'Could not get the explanation: ',
  explainDummy: 'Dummy explanation (MOCK mode, or no Gemini API key is set).',
  evidence: (n: number) => `Paragraphs used as evidence (${n})`,
  panelEmpty1a: '',
  panelEmpty1b: 'Select a word',
  panelEmpty1c:
    ' in the original or the translation and press the button that appears to see what it means in this paper.',
  panelEmpty2: 'Explained words are highlighted in blue; click one to see its explanation again.',
  termsEmpty:
    'No terms yet. Select a word in Full translation and ask for an explanation; it will be listed here.',
  showInText: 'Show in text →',
  dummy: 'Dummy',
}

export const MESSAGES: Record<UiLang, Messages> = { ja, en }

export function loadUiLang(): UiLang {
  try {
    const saved = localStorage.getItem('uiLang')
    if (saved === 'ja' || saved === 'en') return saved
  } catch {
    // 読めなければ既定
  }
  return 'ja'
}

export function saveUiLang(lang: UiLang) {
  try {
    localStorage.setItem('uiLang', lang)
  } catch {
    // 保存できなくても、この画面を開いている間は使える
  }
}
