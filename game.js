(()=>{
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const W=960,H=540,HORIZON=220,FOCAL=430,CAMERA_HEIGHT=1.48,ROOM_LENGTH=32,CORRIDOR_HALF=4.2;
const roomLabel=document.getElementById('room-label'),roomCtx=roomLabel.getContext('2d');
const statusEl=document.getElementById('status'),healthWrap=document.getElementById('health-wrap'),healthFill=document.getElementById('health-fill');
const overlay=document.getElementById('overlay'),overlayTitle=document.getElementById('overlay-title'),overlayCopy=document.getElementById('overlay-copy'),overlayEyebrow=document.getElementById('overlay-eyebrow'),resumeBtn=document.getElementById('resume'),muteBtn=document.getElementById('mute'),pauseBtn=document.getElementById('pause');
let room=0,health=100,flashlight=true,running=true,paused=false,dead=false,mute=false,last=0,audio=null,shake=0;
let keys=Object.create(null),entity=null,entityCooldown=0,doorHint=false,mouseTurn=0,isHiding=false,hidingCloset=null,hidingType=null;
const player={x:0,z:5,yaw:0,speed:3.25};
let viewPitch=0,rightDragging=false,lastPointerX=0,lastPointerY=0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
function sound(freq=180,duration=.1,wave='sine',volume=.025){
 if(mute)return;
 try{
  audio=audio||new(window.AudioContext||window.webkitAudioContext)();
  const osc=audio.createOscillator(),gain=audio.createGain();
  osc.type=wave;osc.frequency.value=freq;gain.gain.value=volume;
  osc.connect(gain);gain.connect(audio.destination);osc.start();
  gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.stop(audio.currentTime+duration);
 }catch{}
}
function setStatus(value){statusEl.textContent=value}
function pixelMeasure(ctx2,text,spacing){let width=0;for(let i=0;i<text.length;i++)width+=ctx2.measureText(text[i]).width;if(text.length>1)width+=spacing*(text.length-1);return width}
function pixelDrawLine(ctx2,text,x,y,spacing){let cursor=x;for(const char of text){ctx2.fillText(char,cursor,y);cursor+=ctx2.measureText(char).width+spacing}}
function pixelizeElement(el){
 const text=el.textContent.trim();if(!text)return;
 const style=getComputedStyle(el),size=parseFloat(style.fontSize)||12,lineHeight=parseFloat(style.lineHeight)||size*1.25;
 const spacing=style.letterSpacing==='normal'?0:parseFloat(style.letterSpacing)||0,scale=.82;
 const measure=document.createElement('canvas').getContext('2d');measure.font=style.font||style.fontWeight+' '+size+'px '+style.fontFamily;
 const paragraph=el.tagName==='P',maxWidth=paragraph?Math.max(150,el.clientWidth||340):Infinity;
 const words=text.split(/\s+/),lines=[];let line='';
 for(const word of words){const candidate=line?line+' '+word:word;if(paragraph&&line&&pixelMeasure(measure,candidate,spacing)>maxWidth){lines.push(line);line=word}else line=candidate}
 if(line)lines.push(line);
 const measuredWidth=Math.max(...lines.map(value=>pixelMeasure(measure,value,spacing)),1),cssWidth=paragraph?maxWidth:Math.ceil(measuredWidth+4),cssHeight=Math.ceil(lines.length*lineHeight+2);
 const raster=document.createElement('canvas');raster.className='pixel-text-canvas';raster.width=Math.max(1,Math.ceil(cssWidth*scale));raster.height=Math.max(1,Math.ceil(cssHeight*scale));raster.style.width=cssWidth+'px';raster.style.height=cssHeight+'px';
 if(paragraph){raster.style.display='block';raster.style.margin='0 auto'}
 const paint=raster.getContext('2d');paint.scale(scale,scale);paint.font=measure.font;paint.fillStyle=style.color;paint.textBaseline='alphabetic';
 lines.forEach((value,index)=>{const width=pixelMeasure(paint,value,spacing);const x=style.textAlign==='center'?(cssWidth-width)/2:style.textAlign==='right'?cssWidth-width:0;pixelDrawLine(paint,value,x,index*lineHeight+size,spacing)});
 el.setAttribute('aria-label',text);el.replaceChildren(raster);
}
function installPixelText(){
 const targets=[statusEl,muteBtn,pauseBtn,...document.querySelectorAll('.controls span')];
 for(const el of targets){
  pixelizeElement(el);
  const observer=new MutationObserver(()=>{if(el.children.length===1&&el.firstElementChild.classList.contains('pixel-text-canvas'))return;pixelizeElement(el)});
  observer.observe(el,{childList:true,characterData:true,subtree:true});
 }
}
function updateHud(){
 roomCtx.clearRect(0,0,150,23);roomCtx.fillStyle='#c2b88d';roomCtx.font='700 11px Arial,Helvetica,sans-serif';roomCtx.textBaseline='alphabetic';
 const roomText=room===0?'LOBBY':'ROOM A-'+String(room).padStart(3,'0');let x=0;for(const char of roomText){roomCtx.fillText(char,x,14);x+=roomCtx.measureText(char).width+1}
 const percent=Math.round(health);healthWrap.style.display=percent<100?'block':'none';healthFill.style.width=percent+'%';
 healthFill.style.background=percent<=33?'linear-gradient(#ff7777,#b51f1f)':percent<=66?'linear-gradient(#f5d66b,#c28a22)':'linear-gradient(#71e36b,#279c38)';
}
function showOverlay(title,copy,button,eyebrow){
 overlayTitle.textContent=title;overlayCopy.textContent=copy;resumeBtn.textContent=button;overlayEyebrow.textContent=eyebrow||'ROOM A-'+String(room).padStart(3,'0');
 overlay.style.display='grid';
 for(const el of [overlayTitle,overlayCopy,resumeBtn,overlayEyebrow])if(!el.querySelector('.pixel-text-canvas'))pixelizeElement(el);
}
function hideOverlay(){overlay.style.display='none'}
function startNewRun(){
 room=0;health=100;player.x=0;player.z=5;player.yaw=0;viewPitch=0;entity=null;entityCooldown=0;isHiding=false;hidingCloset=null;hidingType=null;dead=false;paused=false;running=true;keys=Object.create(null);
 updateHud();setStatus('LOBBY');hideOverlay();last=performance.now();sound(250,.12);requestAnimationFrame(loop);
}
function togglePause(){
 if(dead)return;
 paused=!paused;
 if(paused){setStatus('PAUSED');showOverlay('PAUSED','The hallway is waiting.','RESUME')}
 else{hideOverlay();setStatus('LISTEN');last=performance.now();requestAnimationFrame(loop)}
}
function hurt(amount=15){
 health=Math.max(0,health-amount);shake=14;sound(70,.32,'sawtooth',.055);updateHud();
 if(health<=0){dead=true;running=false;setStatus('LOST');showOverlay('YOU WERE FOUND','Your run ended in room A-'+String(room).padStart(3,'0')+'.','TRY AGAIN','GAME OVER')}
 else{setStatus('DANGER');player.z=Math.max(room*ROOM_LENGTH+.8,player.z-1.5);entityCooldown=7}
}
function nextRoom(){
 const doorZ=(room+1)*ROOM_LENGTH;
 if(doorZ-player.z>2.35){setStatus('DOOR IS TOO FAR');return}
 room++;player.z=doorZ+1.1;player.x=0;doorHint=false;
 sound(330,.08);setTimeout(()=>sound(220,.14),80);updateHud();setStatus('ROOM ENTERED');
 const spawnRate=getEntitySpawnRate('A-1');
 if(!entity&&entityCooldown<=0&&Math.random()<spawnRate){
  entity={type:'A-1',x:rand(-.22,.22),z:(room+1)*ROOM_LENGTH-1.4,age:0,phase:'stare',stareTime:rand(1.3,2.2),speed:ROOM_LENGTH*.58,damaged:false,damageTimer:1,cloneTimer:.08,clones:[]};
  setStatus('A-1 IS WATCHING');sound(118,.42,'sawtooth',.018);
 }
}
function onKey(e,down){
 const key=e.key.toLowerCase();
 if(key===' ')e.preventDefault();
 keys[key]=down;
 if(!down)return;
 if(key==='escape'){togglePause();return}
 if(key==='e'){interact();return}
 if(key==='f'){flashlight=!flashlight;sound(420,.045);return}
}
window.addEventListener('keydown',e=>onKey(e,true));
window.addEventListener('keyup',e=>onKey(e,false));
resumeBtn.addEventListener('click',()=>{if(dead)startNewRun();else if(paused)togglePause()});
pauseBtn.addEventListener('click',togglePause);
muteBtn.addEventListener('click',()=>{mute=!mute;muteBtn.textContent=mute?'SOUND OFF':'SOUND ON';if(!mute)sound(300,.05)});
canvas.addEventListener('click',()=>{if(!paused&&!dead)canvas.focus()});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.button!==2)return;rightDragging=true;lastPointerX=e.clientX;lastPointerY=e.clientY;canvas.setPointerCapture(e.pointerId);e.preventDefault()});
canvas.addEventListener('pointermove',e=>{if(!rightDragging)return;const dx=e.clientX-lastPointerX,dy=e.clientY-lastPointerY;lastPointerX=e.clientX;lastPointerY=e.clientY;player.yaw+=dx*.0065;viewPitch=clamp(viewPitch-dy*1.05,-185,185)});
const stopRightDrag=()=>{rightDragging=false};
canvas.addEventListener('pointerup',stopRightDrag);canvas.addEventListener('pointercancel',stopRightDrag);
function update(dt){
 if(!isHiding){
  const forward=(keys.w?1:0)-(keys.s?1:0),strafe=(keys.d?1:0)-(keys.a?1:0);
  const speed=player.speed*(keys.shift?1.45:1),length=Math.hypot(forward,strafe)||1;
  const f=forward/length*speed*dt,s=strafe/length*speed*dt;
  player.x+=Math.cos(player.yaw)*s+Math.sin(player.yaw)*f;
  player.z+=Math.cos(player.yaw)*f-Math.sin(player.yaw)*s;
  const half=halfWidthAt(player.z);
  player.x=clamp(player.x,-half+.65,half-.65);
  const doorZ=(room+1)*ROOM_LENGTH;
  player.z=clamp(player.z,room*ROOM_LENGTH+.45,doorZ-.8);
  const nearby=findNearbyCloset(),distance=doorZ-player.z;
  if(nearby){if(statusEl.dataset.state!=='closet'){setStatus('PRESS E TO ENTER STEEL CABINET');statusEl.dataset.state='closet'}}
  else if(findNearbyDesk()){if(statusEl.dataset.state!=='desk'){setStatus('PRESS E TO HIDE UNDER DESK');statusEl.dataset.state='desk'}}
  else if(distance<2.6){if(!doorHint){setStatus('PRESS E TO OPEN DOOR');doorHint=true;statusEl.dataset.state='door'}}
  else if(doorHint||statusEl.dataset.state==='closet'||statusEl.dataset.state==='desk'){setStatus(room===0?'LOBBY':'LISTEN');doorHint=false;delete statusEl.dataset.state}
 }else if(statusEl.dataset.state!=='hidden'){
  setStatus('HIDDEN — PRESS E TO EXIT');statusEl.dataset.state='hidden';
 }
 if(entity){
  entity.age+=dt;
  entity.damageTimer-=dt;
  const auraDistance=Math.hypot(entity.x-player.x,entity.z-player.z);
  if(!isHiding&&auraDistance<=100&&entity.damageTimer<=0){health=Math.max(0,health-10);shake=8;sound(95,.12,'sawtooth',.025);updateHud();entity.damageTimer=1;if(health<=0){dead=true;running=false;setStatus('LOST');showOverlay('YOU WERE FOUND','A-1 drained your health in room A-'+String(room).padStart(3,'0')+'.','TRY AGAIN','GAME OVER');return}}
  if(entity.phase==='stare'){
   if(entity.age>=entity.stareTime){entity.phase='run';entity.age=0;entity.cloneTimer=0;setStatus(isHiding?'HIDDEN — A-1 PASSING':'A-1 IS RUNNING');sound(82,.35,'sawtooth',.028)}
  }else{
   entity.z-=entity.speed*dt;
   entity.cloneTimer-=dt;
   if(entity.cloneTimer<=0){entity.clones.push({x:entity.x+rand(-.14,.14),z:entity.z+rand(.05,.55),age:0,lift:0,scale:rand(.72,.94)});entity.cloneTimer=.13}
   for(const clone of entity.clones){clone.age+=dt;clone.lift=Math.min(2.6,clone.lift+dt*1.8)}
   entity.clones=entity.clones.filter(clone=>clone.age<1.25);
   if(!isHiding&&!entity.damaged&&Math.abs(entity.z-player.z)<.72&&Math.abs(entity.x-player.x)<.95){entity.damaged=true;hurt(15)}
   if(entity.z<player.z-2.4){entity=null;entityCooldown=10;setStatus(isHiding?'HIDDEN':'QUIET')}
  }
 }
 if(entityCooldown>0)entityCooldown-=dt;
}
function project(wx,wz,height){
 const dx=wx-player.x,dz=wz-player.z;
 const forward=dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw);
 const right=dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw);
 if(forward<.28)return null;
 const scale=FOCAL/forward;
 return {x:W/2+right*scale,y:HORIZON+viewPitch+(CAMERA_HEIGHT-height)*scale,scale,forward};
}
function polygon(points,color,stroke){
 if(points.some(p=>!p))return;
 const depth=points.reduce((sum,p)=>sum+p.forward,0)/points.length;
 if(depth>58)return;
 const nearFade=clamp((depth-.32)/1.1,0,1),farFade=clamp((58-depth)/9,0,1),fade=nearFade*farFade;
 if(fade<=.01)return;
 ctx.save();ctx.globalAlpha*=fade;
 ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();
 ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}
 ctx.restore();
}
function halfWidthAt(z){return z<ROOM_LENGTH?8.2:CORRIDOR_HALF}
const ROOM_MATERIAL={
 wall:['#c8cbc5','#b9bfbb','#d2d3cc'],edge:'#e2e2d8',groove:'#858e88',
 floor:['#536d59','#607a64','#49634f','#71846a'],floorSeam:'#263d30',
 ceiling:['#c4c8c2','#b4b9b4'],door:'#765b3e',doorFace:'#9a7952',panel:'#b08c5c',doorEdge:'#d7bf84'
};
const ENTITY_SPAWN_RATES=Object.freeze({'A-1':0.20});
function paletteAt(z){return ROOM_MATERIAL}
function getEntitySpawnRate(entityId){return ENTITY_SPAWN_RATES[entityId]??0}
function drawFloor(){
 const near=Math.max(0,player.z-ROOM_LENGTH*4),far=player.z+48,boardWidth=.85,boardLength=8;
 for(let z=Math.floor(far/boardLength)*boardLength;z>=near;z-=boardLength){
  const half=halfWidthAt(z);
  for(let x=-half;x<half;x+=boardWidth){
   const right=Math.min(half,x+boardWidth),p=[project(x,z,0),project(right,z,0),project(right,z+boardLength,0),project(x,z+boardLength,0)];
   if(p.some(v=>!v))continue;
   const index=(Math.floor((x+half)/boardWidth)+Math.floor(z/boardLength))%ROOM_MATERIAL.floor.length;
   polygon(p,ROOM_MATERIAL.floor[index]);
   const a=project(x+.12,z+1.5,0),b=project(x+.12,z+boardLength-1,0);
   if(a&&b){ctx.strokeStyle='#d4dfcc22';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
   const s1=project(right,z,0),s2=project(right,z+boardLength,0);
   if(s1&&s2){ctx.strokeStyle=ROOM_MATERIAL.floorSeam;ctx.globalAlpha=.65;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s1.x,s1.y);ctx.lineTo(s2.x,s2.y);ctx.stroke();ctx.globalAlpha=1}
  }
 }
}
function drawCeiling(){
 const near=Math.max(0,player.z-ROOM_LENGTH*4),far=player.z+42;
 for(let z=Math.floor(far/3)*3;z>=near;z-=3){
  const half=halfWidthAt(z),p=[project(-half,z,3.55),project(half,z,3.55),project(half,z+3,3.55),project(-half,z+3,3.55)];
  if(p.some(v=>!v))continue;
  polygon(p,ROOM_MATERIAL.ceiling[Math.floor(z/3)%ROOM_MATERIAL.ceiling.length]);
 }
}
function drawSideWalls(){
 const start=Math.max(0,Math.floor((player.z-ROOM_LENGTH*4)/2)*2),far=Math.floor((player.z+42)/2)*2;
 for(let z=far;z>=start;z-=2){
  const half=halfWidthAt(z);
  for(const side of [-1,1]){
   const x=side*half,index=(Math.floor(z/2)+(side===1?1:0))%ROOM_MATERIAL.wall.length;
   const points=[project(x,z,0),project(x,z+2,0),project(x,z+2,3.55),project(x,z,3.55)];
   polygon(points,ROOM_MATERIAL.wall[index],ROOM_MATERIAL.edge);
   for(const level of [.85,1.75,2.65]){const a=project(x-side*.012,z,level),b=project(x-side*.012,z+2,level);if(a&&b){ctx.strokeStyle='#747e783f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}
   const baseA=project(x-side*.02,z,.14),baseB=project(x-side*.02,z+2,.14),capA=project(x-side*.02,z,3.34),capB=project(x-side*.02,z+2,3.34);
   if(baseA&&baseB){ctx.strokeStyle='#77817a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(baseA.x,baseA.y);ctx.lineTo(baseB.x,baseB.y);ctx.stroke()}
   if(capA&&capB){ctx.strokeStyle='#f0eee4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(capA.x,capA.y);ctx.lineTo(capB.x,capB.y);ctx.stroke()}
   if(Math.round(z)%8===0){const p=project(x-side*.035,z+1,1.9);if(p&&p.x>-60&&p.x<W+60){const w=Math.max(2,p.scale*.12),h=Math.max(3,p.scale*.24);ctx.fillStyle='#454c48';ctx.fillRect(p.x-w/2,p.y-h/2,w,h);ctx.fillStyle='#d8c48c';ctx.fillRect(p.x-w*.25,p.y-h*.34,w*.5,h*.68)}}
   if(Math.round(z)%10===0){const zd=z+1,p=[project(x,zd-.43,0),project(x,zd+.43,0),project(x,zd+.43,2.08),project(x,zd-.43,2.08)];polygon(p,ROOM_MATERIAL.door,ROOM_MATERIAL.doorEdge);const inner=[project(x-side*.025,zd-.35,.08),project(x-side*.025,zd+.35,.08),project(x-side*.025,zd+.35,1.98),project(x-side*.025,zd-.35,1.98)];polygon(inner,ROOM_MATERIAL.doorFace,ROOM_MATERIAL.panel)}
  }
 }
}
function drawLobbyDesk(){
 if(room!==0)return;
 const x=-5.35,z=18.5,w=1.55,d=.95,h=.92;
 const front=[project(x-w,z-d,0),project(x+w,z-d,0),project(x+w,z-d,h),project(x-w,z-d,h)];
 const side=[project(x+w,z-d,0),project(x+w,z+d,0),project(x+w,z+d,h),project(x+w,z-d,h)];
 const top=[project(x-w,z-d,h),project(x+w,z-d,h),project(x+w,z+d,h),project(x-w,z+d,h)];
 polygon(side,'#73563b','#c1a077');polygon(front,'#9a7850','#d7bd8d');polygon(top,'#526c57','#c6b38a');
 const plaque=project(x,z-d-.025,1.06);if(plaque){ctx.save();ctx.fillStyle='#dec77e';ctx.font='700 '+clamp(plaque.scale*.07,7,13)+'px Arial';ctx.textAlign='center';ctx.fillText('RECEPTION',plaque.x,plaque.y);ctx.restore()}
}function closetForRoom(roomNumber){
 const z=roomNumber*ROOM_LENGTH+11.5,side=roomNumber%2===0?-1:1,half=halfWidthAt(z);
 return {room:roomNumber,z,x:side*(half-.14),side};
}
function findNearbyCloset(){
 let closest=null,best=Infinity;
 for(let n=Math.max(0,room-1);n<=room+1;n++){
  const closet=closetForRoom(n),distance=Math.hypot(player.x-closet.x,player.z-closet.z);
  if(distance<best){best=distance;closest=closet}
 }
 return best<2.1?closest:null;
}
function findNearbyDesk(){
 if(room!==0)return null;
 const desk={x:-5.35,z:18.5,type:'desk'};
 return Math.hypot(player.x-desk.x,player.z-desk.z)<2.25?desk:null;
}
function drawClosets(){
 for(let n=Math.max(0,room-1);n<=room+2;n++){
  const c=closetForRoom(n),frontX=c.x-c.side*.23,backX=c.x+c.side*.05,z=c.z;
  const frame=[project(frontX,z-.54,0),project(frontX,z+.54,0),project(frontX,z+.54,2.35),project(frontX,z-.54,2.35)];
  const leaf=[project(frontX-c.side*.015,z-.45,.08),project(frontX-c.side*.015,z+.45,.08),project(frontX-c.side*.015,z+.45,2.26),project(frontX-c.side*.015,z-.45,2.26)];
  const sideFace=[project(backX,z-.54,0),project(frontX,z-.54,0),project(frontX,z-.54,2.35),project(backX,z-.54,2.35)];
  const topFace=[project(backX,z-.54,2.35),project(frontX,z-.54,2.35),project(frontX,z+.54,2.35),project(backX,z+.54,2.35)];
  polygon(sideFace,'#343b40','#87949a');polygon(topFace,'#68747b','#aab5b9');polygon(frame,'#30383e','#aeb9bd');polygon(leaf,'#68757c','#c1cbd0');
  const panel=[project(frontX-c.side*.025,z-.34,.22),project(frontX-c.side*.025,z+.34,.22),project(frontX-c.side*.025,z+.34,2.12),project(frontX-c.side*.025,z-.34,2.12)];
  polygon(panel,'#77858c','#aeb9bd');
  for(const ventY of [.42,.5,.58]){const va=project(frontX-c.side*.04,z-.18,ventY*3.2),vb=project(frontX-c.side*.04,z+.18,ventY*3.2);if(va&&vb){ctx.strokeStyle='#354047';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(va.x,va.y);ctx.lineTo(vb.x,vb.y);ctx.stroke()}}
  const handle=project(frontX-c.side*.04,z+.3,1.08);
  if(handle){ctx.fillStyle='#e3cb8d';ctx.beginPath();ctx.arc(handle.x,handle.y,Math.max(1,handle.scale*.023),0,Math.PI*2);ctx.fill()}
  const plate=project(frontX-c.side*.045,z,2.43);
  if(plate){ctx.fillStyle='#c4cdd0';ctx.fillRect(plate.x-7,plate.y-3,14,6);ctx.fillStyle='#283137';ctx.font='bold 5px Arial';ctx.textAlign='center';ctx.fillText('HIDE',plate.x,plate.y+2)}
 }
}
function enterHidingSpot(spot){
 isHiding=true;hidingCloset=spot;hidingType=spot.type==='desk'?'desk':'closet';
 if(hidingType==='desk'){player.x=spot.x;player.z=spot.z+1.25}else{player.x=spot.side*(halfWidthAt(spot.z)-.78);player.z=spot.z}
 keys=Object.create(null);setStatus(hidingType==='desk'?'UNDER DESK — PRESS E TO EXIT':'HIDDEN — PRESS E TO EXIT');sound(95,.22,'triangle',.018);
}
function exitCloset(){isHiding=false;hidingCloset=null;hidingType=null;setStatus('LISTEN');sound(155,.16,'triangle',.018)}
function interact(){
 if(isHiding){exitCloset();return}
 const closet=findNearbyCloset();if(closet){enterHidingSpot(closet);return}
 const desk=findNearbyDesk();if(desk){enterHidingSpot(desk);return}
 nextRoom();
}
function drawHidingView(){
 if(!isHiding)return;
 if(hidingType==='desk'){
  ctx.save();ctx.fillStyle='rgba(18,17,14,.96)';ctx.fillRect(0,0,W,H);
  const top=ctx.createLinearGradient(0,0,0,H*.38);top.addColorStop(0,'#59432e');top.addColorStop(1,'#211a13');ctx.fillStyle=top;ctx.fillRect(0,0,W,H*.34);
  ctx.fillStyle='#17130f';ctx.fillRect(0,H*.34,W,H*.08);ctx.fillStyle='#30261b';ctx.fillRect(0,H*.42,W,H*.58);
  ctx.fillStyle='#090a09';ctx.fillRect(W*.12,H*.48,W*.76,H*.52);ctx.restore();return;
 }
 ctx.save();ctx.fillStyle='rgba(19,14,10,.95)';ctx.fillRect(0,0,W,H);
 const gap=clamp(W*.075,30,74),left=(W-gap)/2;
 ctx.globalCompositeOperation='destination-out';ctx.fillRect(left,0,gap,H);
 ctx.globalCompositeOperation='source-over';
 const wood=ctx.createLinearGradient(left-18,0,left+8,0);wood.addColorStop(0,'#17110c');wood.addColorStop(.5,'#76563a');wood.addColorStop(1,'#21170f');
 ctx.fillStyle=wood;ctx.fillRect(left-9,0,9,H);
 const wood2=ctx.createLinearGradient(left+gap-8,0,left+gap+18,0);wood2.addColorStop(0,'#21170f');wood2.addColorStop(.5,'#76563a');wood2.addColorStop(1,'#17110f');
 ctx.fillStyle=wood2;ctx.fillRect(left+gap,0,9,H);
 ctx.restore();
}

function drawPreviousDoor(){
 if(room<=0)return;
 const z=room*ROOM_LENGTH,half=halfWidthAt(z-.1),p=ROOM_MATERIAL;
 const left=[project(-half,z,0),project(-.66,z,0),project(-.66,z,3.6),project(-half,z,3.6)];
 const right=[project(.66,z,0),project(half,z,0),project(half,z,3.6),project(.66,z,3.6)];
 const lintel=[project(-.66,z,2.28),project(.66,z,2.28),project(.66,z,3.6),project(-.66,z,3.6)];
 polygon(left,p.wall[0],p.edge);polygon(right,p.wall[1],p.edge);polygon(lintel,p.wall[2],p.edge);
 const frame=[project(-.66,z-.015,0),project(.66,z-.015,0),project(.66,z-.015,2.28),project(-.66,z-.015,2.28)];
 polygon(frame,'#51402e',p.doorEdge);
 ctx.save();ctx.globalAlpha=.45;
 polygon([project(-.56,z-.03,.04),project(.56,z-.03,.04),project(.56,z-.03,2.16),project(-.56,z-.03,2.16)],p.doorFace,p.doorEdge);
 polygon([project(-.43,z-.05,.22),project(.43,z-.05,.22),project(.43,z-.05,1.96),project(-.43,z-.05,1.96)],p.panel,'#d1b77b');
 ctx.restore();
 const board=[project(-.53,z-.075,2.28),project(.53,z-.075,2.28),project(.53,z-.075,2.62),project(-.53,z-.075,2.62)];
 polygon(board,'#d4b66c','#6c4e2e');
 const label=project(0,z-.1,2.44);
 if(label){ctx.save();ctx.fillStyle='#49351f';ctx.font='700 '+clamp(label.scale*.105,7,14)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('A-'+String(room).padStart(3,'0'),label.x,label.y);ctx.restore()}
}
function drawEndDoor(){
 const z=(room+1)*ROOM_LENGTH,p=ROOM_MATERIAL,half=halfWidthAt(z-.1);
 polygon([project(-half,z,0),project(half,z,0),project(half,z,3.6),project(-half,z,3.6)],p.wall[0],p.edge);
 polygon([project(-.66,z-.015,0),project(.66,z-.015,0),project(.66,z-.015,2.28),project(-.66,z-.015,2.28)],'#51402e',p.doorEdge);
 polygon([project(-.56,z-.03,.04),project(.56,z-.03,.04),project(.56,z-.03,2.16),project(-.56,z-.03,2.16)],p.doorFace,p.doorEdge);
 polygon([project(-.43,z-.05,.22),project(.43,z-.05,.22),project(.43,z-.05,1.96),project(-.43,z-.05,1.96)],p.panel,'#d1b77b');
 const handle=project(.39,z-.08,1.05);if(handle){ctx.fillStyle='#e4d093';ctx.beginPath();ctx.arc(handle.x,handle.y,Math.max(1.2,handle.scale*.021),0,Math.PI*2);ctx.fill()}
 const board=[project(-.53,z-.075,2.28),project(.53,z-.075,2.28),project(.53,z-.075,2.62),project(-.53,z-.075,2.62)];
 polygon(board,'#d4b66c','#6c4e2e');
 const label=project(0,z-.1,2.44);
 if(label){ctx.save();ctx.fillStyle='#49351f';ctx.font='700 '+clamp(label.scale*.115,7,15)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#f5df9c';ctx.shadowBlur=.6;ctx.fillText('A-'+String(room+1).padStart(3,'0'),label.x,label.y);ctx.restore()}
}
const a1Sprite=new Image();
a1Sprite.decoding='async';
a1Sprite.src='./assets/a1.webp';
function drawA1SpriteAt(worldX,worldZ,height,alpha,baseHeight=0,glow=true){
 if(!a1Sprite.complete||!a1Sprite.naturalWidth)return;
 const base=project(worldX,worldZ,baseHeight),top=project(worldX,worldZ,baseHeight+height);
 if(!base||!top||base.x<-220||base.x>W+220)return;
 const h=base.y-top.y,w=h*(a1Sprite.naturalWidth/a1Sprite.naturalHeight);
 if(h<2)return;
 const centerY=top.y+h*.52;
 if(glow){
  const radius=clamp(w*.85,12,220),light=ctx.createRadialGradient(base.x,centerY,1,base.x,centerY,radius);
  light.addColorStop(0,'rgba(225,235,255,.34)');light.addColorStop(.32,'rgba(195,213,255,.18)');light.addColorStop(1,'rgba(175,205,255,0)');
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha;ctx.fillStyle=light;ctx.beginPath();ctx.arc(base.x,centerY,radius,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 const pulse=entity&&entity.phase==='stare'?1+Math.sin(entity.age*14)*.012:1;
 ctx.save();ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=true;ctx.drawImage(a1Sprite,base.x-w*pulse/2,top.y+(h-h*pulse)/2,w*pulse,h*pulse);ctx.restore();
}
function drawA1(){
 if(!entity)return;
 for(const clone of entity.clones){
  const fade=clamp(1-clone.age/1.25,0,1),size=clone.scale*(1-clone.age*.18);
  drawA1SpriteAt(clone.x,clone.z,3.05*size,fade*.62,clone.lift,true);
 }
 const flicker=.94+Math.sin(entity.age*19)*.06;
 drawA1SpriteAt(entity.x,entity.z,3.05,entity.phase==='stare'?.99:flicker,0,true);
}
function drawPixelCanvasText(text,x,baseline,font,color,align){
 const temp=document.createElement('canvas'),measure=temp.getContext('2d');measure.font=font;
 const size=parseFloat(font.match(/[0-9.]+px/)?.[0]||'13'),width=Math.ceil(measure.measureText(text).width+8),height=Math.ceil(size*1.8),scale=.82;
 temp.width=Math.ceil(width*scale);temp.height=Math.ceil(height*scale);
 const p=temp.getContext('2d');p.scale(scale,scale);p.font=font;p.fillStyle=color;p.textBaseline='alphabetic';p.fillText(text,4,size*1.25);
 const left=align==='center'?x-width/2:x;
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(temp,left,baseline-size*1.25,width,height);ctx.restore();
}
function draw(){
 ctx.save();
 if(shake>0){ctx.translate(rand(-shake,shake),rand(-shake,shake));shake*=.84}
 const ceiling=ctx.createLinearGradient(0,0,0,HORIZON);ceiling.addColorStop(0,'#828783');ceiling.addColorStop(1,'#c0c3bc');
 ctx.fillStyle=ceiling;ctx.fillRect(0,0,W,HORIZON+2);
 const floorShade=ctx.createLinearGradient(0,HORIZON,0,H);floorShade.addColorStop(0,'#435c4a');floorShade.addColorStop(1,'#1f3027');
 ctx.fillStyle=floorShade;ctx.fillRect(0,HORIZON,W,H-HORIZON);
 drawCeiling();drawFloor();drawSideWalls();drawClosets();drawLobbyDesk();drawPreviousDoor();drawEndDoor();drawA1();drawHidingView();
 ctx.restore();
 ctx.save();
 const darkness=ctx.createRadialGradient(W/2,H*.58,35,W/2,H*.58,flashlight?410:225);
 darkness.addColorStop(0,'rgba(0,0,0,0)');darkness.addColorStop(.62,'rgba(0,0,0,.18)');darkness.addColorStop(1,flashlight?'rgba(0,0,0,.68)':'rgba(0,0,0,.94)');
 ctx.fillStyle=darkness;ctx.fillRect(0,0,W,H);ctx.restore();
 if(entity&&entity.phase==='stare')drawPixelCanvasText('A-1',W/2,H-55,'700 13px Arial,Helvetica,sans-serif','#c2b88d','center');
}
function loop(t){
 if(!running||paused||dead)return;
 const dt=Math.min((t-last)/1000,.04);last=t;update(dt);draw();requestAnimationFrame(loop);
}
installPixelText();updateHud();setStatus('');last=performance.now();requestAnimationFrame(loop);
})();
