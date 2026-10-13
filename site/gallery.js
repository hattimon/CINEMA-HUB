const viewer=document.querySelector('#viewer');
const picture=document.querySelector('#viewer-image');
const caption=document.querySelector('#viewer-caption');
if(viewer && typeof viewer.showModal==='function'){
  for(const link of document.querySelectorAll('.shot')){
    link.addEventListener('click',event=>{
      event.preventDefault();
      picture.src=link.href;
      picture.alt=link.querySelector('img')?.alt || 'Zrzut ekranu Cinema Hub';
      caption.textContent=link.dataset.caption || picture.alt;
      viewer.showModal();
    });
  }
  viewer.querySelector('button').addEventListener('click',()=>viewer.close());
  viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
}
