export type Lang = 'en' | 'zh-TW';

const STORAGE_KEY = 'lang';

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    // Tabs
    'tabs.logbook': 'Logbook',
    'tabs.snapshots': 'Snapshots',
    'tabs.exportPdf': 'Export PDF',
    // Helper subtitles
    'subtitle.logbook': 'Add/edit entries with photos',
    'subtitle.snapshots': 'Your trip at a glance + shareable cards',
    'subtitle.exportPdf': 'Export PDF booklet',
    // Onboarding
    'onboarding.openLogbook': 'Open the logbook',
    'onboarding.whoIsThisFor': 'Who is this logbook for?',
    'onboarding.add': 'Add',
    'onboarding.addName': 'Add a name',
    'onboarding.save': 'Save',
    'onboarding.cancel': 'Cancel',
    // Welcome back
    'welcomeBack.headline': 'Welcome back to Taiwan Logbook!',
    'welcomeBack.continue': 'Continue logbook',
    'welcomeBack.startNew': 'Start a new logbook',
    'welcomeBack.startNewConfirm': 'Start a new logbook?',
    'welcomeBack.startNewDescription': 'This will delete your current logbook and all saved photos. This cannot be undone.',
    'welcomeBack.startNewButton': 'Start new',
    'welcomeBack.yourLogbook': 'Your logbook:',
    // Common
    'common.editLogbook': 'Edit logbook',
    'common.addEntry': 'Add entry',
    'common.newEntryPlaceholder': 'New entry title...',
    'common.sortBy': 'Sort by',
    'common.customOrder': 'Custom Order',
    'common.sameAsLogbookCustomOrder': 'Same as Logbook (Custom Order)',
    'common.dateNewToOld': 'Date (new → old)',
    'common.dateOldToNew': 'Date (old → new)',
    'common.deleteEntryConfirm': 'Delete this entry?',
    'common.delete': 'Delete',
    'common.cancel': 'Cancel',
    // Export PDF
    'export.entryOrder': 'Entry order',
    'export.sameAsLogbookCustomOrder': 'Same as Logbook (Custom Order)',
    'export.useLogbookTitle': 'Use logbook title',
    'export.customTitle': 'Custom title',
    'export.exportPdf': 'Export PDF',
    'export.exportSettings': 'Export settings',
    'export.addOneEntryHint': 'Add at least one entry to export your PDF.',
  },
  'zh-TW': {
    'tabs.logbook': '手札',
    'tabs.snapshots': '小卡',
    'tabs.exportPdf': '匯出 PDF',
    'subtitle.logbook': '新增/編輯記事與照片',
    'subtitle.snapshots': '總覽＋可下載小卡',
    'subtitle.exportPdf': '匯出 PDF 手札',
    'onboarding.openLogbook': '打開手札',
    'onboarding.whoIsThisFor': '這本手札是誰的？',
    'onboarding.add': '新增',
    'onboarding.addName': '新增姓名',
    'onboarding.save': '儲存',
    'onboarding.cancel': '取消',
    'welcomeBack.headline': '歡迎回來 Taiwan Logbook！',
    'welcomeBack.continue': '繼續手札',
    'welcomeBack.startNew': '開新手札',
    'welcomeBack.startNewConfirm': '要開一本新的手札嗎？',
    'welcomeBack.startNewDescription': '目前的手札與所有照片將會被刪除，且無法復原。',
    'welcomeBack.startNewButton': '開新',
    'welcomeBack.yourLogbook': '你的手札：',
    'common.editLogbook': '編輯手札',
    'common.addEntry': '新增記事',
    'common.newEntryPlaceholder': '新增記事標題...',
    'common.sortBy': '排序',
    'common.customOrder': '自訂順序',
    'common.sameAsLogbookCustomOrder': '與手札相同（自訂順序）',
    'common.dateNewToOld': '日期：新到舊',
    'common.dateOldToNew': '日期：舊到新',
    'common.deleteEntryConfirm': '要刪除這篇記事嗎？',
    'common.delete': '刪除',
    'common.cancel': '取消',
    'export.entryOrder': '記事順序',
    'export.sameAsLogbookCustomOrder': '與手札相同（自訂順序）',
    'export.useLogbookTitle': '使用手札標題',
    'export.customTitle': '自訂標題',
    'export.exportPdf': '匯出 PDF',
    'export.exportSettings': '匯出設定',
    'export.addOneEntryHint': '至少新增一則記事才能匯出 PDF。',
  },
};

export function getLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh-TW' || stored === 'en') return stored;
  return 'en';
}

function persistLang(lang: Lang): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

export function setLang(lang: Lang): void {
  persistLang(lang);
}

export function t(key: string, lang: Lang): string {
  return STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
}

// Minimal React integration
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

type LangContextValue = { lang: Lang; setLang: (lang: Lang) => void; t: (key: string) => string };

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  useEffect(() => setLangState(getLang()), []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persistLang(next);
  }, []);

  const value: LangContextValue = {
    lang,
    setLang,
    t: useCallback((key: string) => t(key, lang), [lang]),
  };

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within LangProvider');
  return ctx;
}
