import {useEffect,useRef,useState} from 'react';
import {Languages,Mic,X} from 'lucide-react';
import {Modal} from './components';
import {normalizeVoiceLanguage,storedVoiceLanguage,voiceLanguageKey,voiceLanguageLabel,voiceLanguages} from './voiceLanguages';

declare global {interface Window {CinemaHubVoice?:{start:()=>boolean}}}
const errors:Record<string,string>={
  permission_denied:'Brak zgody na mikrofon. W ustawieniach Androida otwórz Aplikacje → Cinema Hub → Uprawnienia → Mikrofon i zezwól na dostęp podczas używania aplikacji.',
  unavailable:'Brak systemowej usługi rozpoznawania mowy. Włącz lub zaktualizuj usługę rozpoznawania w ustawieniach Androida.',
  audio:'Android nie udostępnił dźwięku z mikrofonu. Sprawdź parowanie i baterie pilota oraz systemowy przełącznik dostępu do mikrofonu. Niektóre urządzenia udostępniają mikrofon Bluetooth wyłącznie Asystentowi.',
  network:'Usługa rozpoznawania zgłosiła błąd sieci. Sprawdź internet lub pobierz pakiet offline wybranego języka w ustawieniach usługi.',
  no_match:'Nie rozpoznano tytułu. Spróbuj ponownie i mów wyraźnie. Jeśli mikrofon działa tylko w Asystencie, sprawdź dostępność mikrofonu pilota dla innych aplikacji.',
  no_speech:'Nie wykryto mowy. Sprawdź, czy mikrofon pilota jest dostępny aplikacjom, i spróbuj ponownie.',
  busy:'Mikrofon lub inna operacja jest zajęta. Zamknij inne okno i spróbuj ponownie.',
  language:'Usługa nie obsługuje teraz wybranego języka. Włącz go lub pobierz odpowiedni pakiet w ustawieniach usługi mowy Androida.',
  invalid_language:'Nieprawidłowy kod języka. Użyj np. en-US, pl-PL lub zh-Hant-TW.',
  timeout:'Przekroczono czas oczekiwania na rozpoznanie. Sprawdź mikrofon pilota i usługę rozpoznawania, a następnie spróbuj ponownie.',
  client:'Systemowa usługa nie rozpoczęła rozpoznawania. Spróbuj usługi w aplikacji lub sprawdź ustawienia rozpoznawania mowy Androida.',
  server:'Usługa rozpoznawania mowy nie odpowiedziała poprawnie. Sprawdź jej ustawienia i spróbuj ponownie.'
};
function requestId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');}

export default function VoiceSearch({onSearch}:{onSearch:(text:string)=>void}){
  const [supported,setSupported]=useState(false),[listening,setListening]=useState(false),[error,setError]=useState('');
  const [languageSupported,setLanguageSupported]=useState(false),[deviceLanguage,setDeviceLanguage]=useState(navigator.language||'en-US');
  const [language,setLanguage]=useState(storedVoiceLanguage),[languageOpen,setLanguageOpen]=useState(false),[draftLanguage,setDraftLanguage]=useState('system'),[languageError,setLanguageError]=useState('');
  const languagePreference=useRef(language),languageCapability=useRef(false),languageButton=useRef<HTMLButtonElement>(null);
  const active=useRef(''),button=useRef<HTMLButtonElement>(null),submit=useRef(onSearch);
  submit.current=onSearch;
  const restoreFocus=()=>requestAnimationFrame(()=>button.current?.focus({preventScroll:true}));
  const cancel=()=>{
    const id=active.current;active.current='';setListening(false);setError('');
    if(id)window.CinemaNative?.postMessage(JSON.stringify({type:'voice_search_cancel',requestId:id}));
    restoreFocus();
  };
  const start=(direct=false)=>{
    if(!supported||!window.CinemaNative||active.current||document.querySelector('dialog[open],.player-overlay'))return false;
    const id=requestId();active.current=id;setError('');setListening(true);
    try{window.CinemaNative.postMessage(JSON.stringify({type:'voice_search_start',requestId:id,direct,...(languageCapability.current?{language:languagePreference.current}:{})}));}
    catch{active.current='';setListening(false);setError(errors.unavailable);}
    return true;
  };
  useEffect(()=>{
    const bridge=window.CinemaNative;if(!bridge)return;
    const probe=requestId();
    const listener=(event:{data:string})=>{
      let result;try{result=JSON.parse(event.data);}catch{return;}
      if(!result||typeof result!=='object')return;
      if(result.type==='voice_search_capabilities'&&result.requestId===probe){setSupported(result.supported===true);languageCapability.current=result.languageSelection===true;setLanguageSupported(languageCapability.current);setDeviceLanguage(typeof result.defaultLanguage==='string'&&normalizeVoiceLanguage(result.defaultLanguage)||'pl-PL');return;}
      if(!active.current||result.requestId!==active.current||!['voice_search_result','voice_search_error','voice_search_cancelled'].includes(result.type))return;
      active.current='';setListening(false);
      if(result.type==='voice_search_result'){
        const text=typeof result.text==='string'?result.text.replace(/[\u0000-\u001f\u007f\s]+/g,' ').trim():'';
        if(text&&text.length<=500){setError('');submit.current(text);restoreFocus();}else setError(errors.no_match);
      }else if(result.type==='voice_search_error')setError(errors[result.code]||errors.server);
      else{setError('');restoreFocus();}
    };
    bridge.addEventListener('message',listener);
    bridge.postMessage(JSON.stringify({type:'voice_search_capabilities',requestId:probe}));
    return()=>{bridge.removeEventListener('message',listener);const id=active.current;active.current='';if(id)bridge.postMessage(JSON.stringify({type:'voice_search_cancel',requestId:id}));};
  },[]);
  useEffect(()=>{if(!supported)return;const voice={start:()=>start()};window.CinemaHubVoice=voice;return()=>{if(window.CinemaHubVoice===voice)delete window.CinemaHubVoice;};},[supported]);
  useEffect(()=>{if(!listening)return;const timeout=setTimeout(()=>{const id=active.current;active.current='';setListening(false);setError(errors.timeout);if(id)window.CinemaNative?.postMessage(JSON.stringify({type:'voice_search_cancel',requestId:id}));},65000);return()=>clearTimeout(timeout);},[listening]);
  const effectiveLanguage=languageSupported?(language==='system'?deviceLanguage:language):'pl-PL';
  const closeLanguage=()=>{setLanguageOpen(false);setLanguageError('');requestAnimationFrame(()=>languageButton.current?.focus({preventScroll:true}));};
  const saveLanguage=()=>{const next=normalizeVoiceLanguage(draftLanguage.trim());if(!next){setLanguageError(errors.invalid_language);return;}languagePreference.current=next;setLanguage(next);try{localStorage.setItem(voiceLanguageKey,next);}catch{}closeLanguage();};
  if(!supported)return null;
  return <><button ref={button} type="button" className="icon-button voice-search-button" aria-label="Wyszukaj głosowo" title="Wyszukaj głosowo" aria-busy={listening} onClick={()=>start()}><Mic size={19}/></button>
    {languageSupported?<button ref={languageButton} type="button" className="icon-button voice-language-button" aria-label="Język wyszukiwania głosowego" title={'Język: '+voiceLanguageLabel(effectiveLanguage)} onClick={()=>{setDraftLanguage(languagePreference.current);setLanguageError('');setLanguageOpen(true);}}><Languages size={18}/></button>:null}
    {languageOpen?<Modal title="Język wyszukiwania głosowego / Speech language" className="voice-search-modal" portalTarget={document.body} onClose={closeLanguage}>
      <div className="voice-search-content"><label>Język / Language<select aria-label="Język rozpoznawania / Speech language" value={draftLanguage==='system'||voiceLanguages.some(([tag])=>tag===draftLanguage)?draftLanguage:'custom'} onChange={event=>{setDraftLanguage(event.target.value==='custom'?'':event.target.value);setLanguageError('');}}>
        <option value="system">Język urządzenia / Device language ({deviceLanguage})</option>{voiceLanguages.map(([tag,label])=><option key={tag} value={tag}>{label}</option>)}<option value="custom">Inny język / Other language…</option>
      </select></label>
      {draftLanguage!=='system'&&!voiceLanguages.some(([tag])=>tag===draftLanguage)?<label>Kod języka / Language tag<input aria-label="Kod języka / Language tag" value={draftLanguage} maxLength={64} placeholder="en-US, zh-Hant-TW…" onChange={event=>{setDraftLanguage(event.target.value);setLanguageError('');}}/></label>:null}
      {languageError?<p role="alert">{languageError}</p>:null}
      <p className="form-note">Wybierz język wypowiadanego tytułu. Język urządzenia nie oznacza automatycznego wykrywania mowy. Lista jest wyborem języka, a nie gwarancją obsługi: silnik Androida musi mieć odpowiedni język lub pakiet offline.</p>
      <p className="form-note" lang="en">Choose the language you will speak. Device language follows Android settings; it does not detect the spoken language. Your Android speech service must support the selected language.</p>
      <div className="form-actions"><button type="button" className="button secondary" onClick={closeLanguage}>Anuluj / Cancel</button><button type="button" className="button primary" data-modal-autofocus onClick={saveLanguage}>Zapisz / Save</button></div></div>
    </Modal>:null}
    {listening||error?<Modal title="Wyszukiwanie głosowe" className="voice-search-modal" portalTarget={document.body} onClose={cancel}>
      <div className="voice-search-content"><Mic size={32}/><p role={error?'alert':'status'}>{error||'Powiedz tytuł w oknie Androida. Jeśli pojawi się prośba o dostęp do mikrofonu, zatwierdź ją pilotem.'}</p>
        <div className="form-actions"><button type="button" data-modal-autofocus className="button secondary" onClick={cancel}><X size={16}/>{error?'Zamknij':'Anuluj'}</button>
          {error?<button type="button" className="button primary" onClick={()=>{setError('');requestAnimationFrame(()=>start(true));}}>Spróbuj usługi w aplikacji</button>:null}</div>
        <p className="form-note">Język / Language: {voiceLanguageLabel(effectiveLanguage)} ({effectiveLanguage}). Dźwięk przetwarza usługa Androida. Cinema Hub otrzymuje tylko tekst.</p>
      </div></Modal>:null}</>;
}
