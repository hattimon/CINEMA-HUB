export const voiceLanguageKey='cinema-hub.voice-language.v1';
export const voiceLanguages=[
  ['en-US','English (US)'],['en-GB','English (UK)'],['pl-PL','Polski'],['de-DE','Deutsch'],['fr-FR','Français'],
  ['es-ES','Español (España)'],['es-MX','Español (México)'],['pt-BR','Português (Brasil)'],['pt-PT','Português (Portugal)'],
  ['it-IT','Italiano'],['nl-NL','Nederlands'],['uk-UA','Українська'],['ru-RU','Русский'],['tr-TR','Türkçe'],
  ['ar-SA','العربية'],['he-IL','עברית'],['hi-IN','हिन्दी'],['bn-BD','বাংলা'],['ur-PK','اردو'],['zh-CN','中文 (简体)'],
  ['zh-TW','中文 (繁體)'],['ja-JP','日本語'],['ko-KR','한국어'],['id-ID','Bahasa Indonesia'],['vi-VN','Tiếng Việt'],
  ['th-TH','ไทย'],['sv-SE','Svenska'],['da-DK','Dansk'],['nb-NO','Norsk'],['fi-FI','Suomi'],['cs-CZ','Čeština'],
  ['sk-SK','Slovenčina'],['hu-HU','Magyar'],['ro-RO','Română'],['el-GR','Ελληνικά']
] as const;
export function normalizeVoiceLanguage(value:string):string|null{
  if(value==='system')return value;
  if(value.length>64||! /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(value))return null;
  try{const language=Intl.getCanonicalLocales(value)[0];return language&&language!=='und'?language:null;}catch{return null;}
}
export function storedVoiceLanguage(){try{return normalizeVoiceLanguage(localStorage.getItem(voiceLanguageKey)||'system')||'system';}catch{return 'system';}}
export function voiceLanguageLabel(language:string){return voiceLanguages.find(([tag])=>tag===language)?.[1]||language;}
