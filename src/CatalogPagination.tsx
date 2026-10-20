import { useEffect,useState } from 'react';
import { ChevronLeft,ChevronRight } from 'lucide-react';

type Props={page:number;totalPages:number;totalKnown:boolean;hasNext:boolean;busy:boolean;onChange:(page:number)=>void};

export default function CatalogPagination({page,totalPages,totalKnown,hasNext,busy,onChange}:Props) {
  const [draft,setDraft]=useState(String(page));
  useEffect(()=>setDraft(String(page)),[page]);
  return <nav className="pagination" aria-label="Nawigacja stron katalogu" aria-busy={busy}>
    <button type="button" className="button secondary" disabled={busy||page<=1} onClick={()=>onChange(page-1)}><ChevronLeft size={17}/>Poprzednia</button>
    <form className="page-jump" onSubmit={event=>{event.preventDefault();const target=Number(draft);if(Number.isInteger(target)&&target>=1&&target<=totalPages)onChange(target);}}>
      <label>Strona <input type="number" inputMode="numeric" min={1} max={totalPages} step={1} required aria-label="Numer strony" value={draft} disabled={busy} onFocus={event=>event.currentTarget.select()} onChange={event=>setDraft(event.target.value)}/></label>
      <span>z {totalPages}{totalKnown?'':'+'}</span>
      <button type="submit" className="button secondary" disabled={busy}>Przejdź</button>
    </form>
    <button type="button" className="button secondary" disabled={busy||!hasNext} onClick={()=>onChange(page+1)}>Następna<ChevronRight size={17}/></button>
  </nav>;
}
