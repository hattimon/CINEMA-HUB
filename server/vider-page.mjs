// Serialized by Playwright: keep this predicate independent of module state.
export function viderPageReady() {
  const visible=element=>!!element&&element.getBoundingClientRect().width>0&&getComputedStyle(element).visibility!=='hidden';
  if(/Verify you are human|Just a moment|captcha/i.test(document.title))return true;
  if([...document.querySelectorAll('.g-recaptcha,iframe[src*="captcha"],#cf-challenge-running')].some(visible))return true;
  const main=document.querySelector('#LoadGeneralContent')||document.body;
  if(!main)return false;
  if(location.pathname.startsWith('/search/')){
    const results=main.querySelector('#search_files_result');
    if(!visible(results))return false;
    return [...results.querySelectorAll('a[href]')].some(anchor=>visible(anchor)&&/^\/vid\/[+a-z0-9_-]+\/?$/i.test(new URL(anchor.href,location.href).pathname))||/brak wyników|nie znaleziono/i.test(results.innerText||'');
  }
  if([...main.querySelectorAll('.video_meta h1,video,iframe[src*="/embed/video/"]')].some(visible))return true;
  if([...main.querySelectorAll('a[href]')].some(anchor=>visible(anchor)&&/^\/(?:vid|dir)\/[+a-z0-9_-]+\/?$/i.test(new URL(anchor.href,location.href).pathname)))return true;
  // An explicitly empty directory or access notice is also a complete response.
  return /(?:katalog|folder) jest pusty|brak (?:plików|materiałów|filmów)|nie znaleziono|zaloguj się.{0,50}(?:dostęp|zobacz|wyświetl)/i.test(main.innerText||'');
}
