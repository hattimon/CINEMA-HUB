export function sourceErrorMessage(error,source) {
  const diagnostic=String(error?.code||'')+' '+String(error?.cause?.code||'')+' '+String(error?.message||'');
  if(/ENOTFOUND|EAI_AGAIN|ESERVFAIL|ERR_NAME_NOT_RESOLVED|DNS_PROBE/i.test(diagnostic))return 'Serwer nie może odnaleźć adresu źródła (DNS). Sprawdź DNS hosta lub kontenera.';
  if(source.type==='przystan'&&/ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|Timeout|nie odpowiada/i.test(diagnostic))return 'Serwer Cinema Hub nie może połączyć się z Przystanią. Sprawdź adres, port i połączenie między sieciami serwera i Przystani.';
  if([409,429].includes(error?.status))return String(error.message).replace(/https?:\/\/\S+/g,'[adres źródła]').slice(0,240);
  return 'Nie udało się odczytać katalogu. Sprawdź logowanie, CAPTCHA lub adres źródła.';
}
