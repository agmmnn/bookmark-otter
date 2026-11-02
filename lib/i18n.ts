import { useState, useEffect } from 'react';

import en from '@/locales/en.json';
import tr from '@/locales/tr.json';

export type Language = 'en' | 'tr';

const messages: Record<Language, typeof en> = { en, tr };

export type TranslationKey = keyof typeof en;

export async function getSavedLanguage(): Promise<Language> {
  const data = await chrome.storage.local.get('language');
  if (data.language === 'en' || data.language === 'tr') {
    return data.language;
  }
  const browserLang = (
    (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.()) ||
    navigator.language ||
    'en'
  ).toLowerCase();
  return browserLang.startsWith('tr') ? 'tr' : 'en';
}

export async function setSavedLanguage(lang: Language): Promise<void> {
  await chrome.storage.local.set({ language: lang });
}

export function useI18n() {
  const [lang, setLangState] = useState<Language>('en');

  useEffect(() => {
    getSavedLanguage().then(setLangState);
  }, []);

  const changeLanguage = async (newLang: Language) => {
    setLangState(newLang);
    await setSavedLanguage(newLang);
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = messages[lang] || en;
    let text = (dict as any)[key] || (en as any)[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };

  return { lang, setLang: changeLanguage, t };
}
