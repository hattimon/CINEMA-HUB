// Stop queued work as well as network/video work; do not leave cancelled tasks
// holding the source's Chromium lock until their normal timeout expires.
export function abortable(work,signal) {
  if(!signal)return Promise.resolve(work);
  return new Promise((resolve,reject)=>{
    const aborted=()=>{signal.removeEventListener('abort',aborted);reject(signal.reason||Object.assign(new Error('Sprawdzanie anulowano.'),{status:499}));};
    signal.addEventListener('abort',aborted,{once:true});
    Promise.resolve(work).then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
    if(signal.aborted)aborted();
  });
}
