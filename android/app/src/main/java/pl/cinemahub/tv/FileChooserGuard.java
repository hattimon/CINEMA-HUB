package pl.cinemahub.tv;

import org.json.JSONObject;

/** Authorizes a picker only after the matching local-file control was activated. */
final class FileChooserGuard {
    static final String INSTALL="""
        (()=>{
          if(window.CinemaHubFiles)return;
          let requested=false,at=0;
          const isControl=control=>!!control&&(control.matches('[data-cinema-file-picker],.local-open')||
            /^(Otwórz plik|Wybierz pliki|Wybierz lokalny folder|Odtwórz lokalny plik)$/.test(control.textContent.trim()));
          document.addEventListener('click',event=>{
            const target=event.target instanceof Element?event.target:null;
            if(target?.closest('input[type="file"]'))return;
            const control=target?.closest('button,a,[role="button"]');
            requested=isControl(control);
            at=performance.now();
          },true);
          window.CinemaHubFiles={isControl,take(){const allowed=requested&&performance.now()-at<1500;requested=false;return allowed;}};
        })()
        """;
    static final String CONSUME="!!(window.CinemaHubFiles&&window.CinemaHubFiles.take())";
    static String remoteKeyScript(String key){return "(()=>{const key="+JSONObject.quote(key)+";if(window.CinemaHubTV&&window.CinemaHubTV.key(key))return true;const target=document.activeElement;if(key==='Enter'&&target&&target.matches('button,a[href],input[type=checkbox],summary')){if(window.CinemaHubFiles&&window.CinemaHubFiles.isControl(target))return false;target.click();return true;}return false;})()";}
}
