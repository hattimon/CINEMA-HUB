export function browserHeaded(type,manual,environment=process.env) {
  return manual||environment.BROWSER_SERIAL==='true'&&!!environment.DISPLAY&&['filman','vider'].includes(type);
}
