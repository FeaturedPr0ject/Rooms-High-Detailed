(()=>{
 const toggle=document.getElementById('settings-toggle');
 const panel=document.getElementById('settings-panel');
 const close=document.getElementById('settings-close');
 const selector=document.getElementById('game-mode');
 const switchButton=document.getElementById('game-switch');
 if(!toggle||!panel||!close||!selector||!switchButton)return;
 const rootPath=document.body.dataset.rootPath||'.';
 const currentGame=document.body.dataset.currentGame||'rooms';
 selector.value=currentGame;
 const setOpen=open=>{
  panel.style.display=open?'block':'none';
  panel.setAttribute('aria-hidden',String(!open));
 };
 toggle.addEventListener('click',()=>setOpen(panel.style.display!=='block'));
 close.addEventListener('click',()=>setOpen(false));
 switchButton.addEventListener('click',()=>{
  const target=selector.value==='doors'?rootPath+'/Doors/index.html':rootPath+'/index.html';
  window.location.href=target;
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&panel.style.display==='block')setOpen(false);
 });
})();
