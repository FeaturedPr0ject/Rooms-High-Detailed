(()=>{
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const W=960,H=540,HORIZON=220,FOCAL=430,CAMERA_HEIGHT=1.48,ROOM_LENGTH=32,CORRIDOR_HALF=4.2;
const A1_DAMAGE_RADIUS=4,A1_DAMAGE_PER_TICK=10,A1_DAMAGE_INTERVAL=1,NEAR_CLIP=.48;
const A25_ROOM=25,A25_SPEED=4.8,A25_KILL_DISTANCE=1.35;
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
 if(room===A25_ROOM){
  entity={type:'A-25',x:0,z:room*ROOM_LENGTH+28.5,age:0,phase:'approach',speed:A25_SPEED,clones:[]};
  setStatus('A-25 APPROACHING — HIDE IN A STEEL CABINET');sound(62,.8,'sawtooth',.035);
  return;
 }
 const spawnRate=getEntitySpawnRate('A-1');
 if(!entity&&entityCooldown<=0&&Math.random()<spawnRate){
  entity={type:'A-1',x:rand(-.22,.22),z:(room+1)*ROOM_LENGTH-1.4,age:0,phase:'stare',stareTime:rand(1.3,2.2),speed:ROOM_LENGTH*.58,damaged:false,damageTimer:0,cloneTimer:.08,clones:[]};
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
  if(entity.type==='A-25'){
   entity.z-=entity.speed*dt;
   const passDistance=Math.hypot(entity.x-player.x,entity.z-player.z);
   if(!isHiding&&passDistance<=A25_KILL_DISTANCE){
    dead=true;running=false;health=0;updateHud();setStatus('LOST');
    showOverlay('A-25 FOUND YOU','You must hide inside a steel cabinet to survive room A-025.','TRY AGAIN','GAME OVER');return;
   }
   if(entity.z<player.z-2.4){
    entity=null;entityCooldown=0;setStatus('A-25 PASSED — YOU SURVIVED');
   }
  }else{
   entity.age+=dt;
   const auraDistance=Math.hypot(entity.x-player.x,entity.z-player.z);
   if(!isHiding&&auraDistance<=A1_DAMAGE_RADIUS){
    entity.damageTimer-=dt;
    if(entity.damageTimer<=0){
     health=Math.max(0,health-A1_DAMAGE_PER_TICK);shake=8;sound(95,.12,'sawtooth',.025);updateHud();
     entity.damageTimer=A1_DAMAGE_INTERVAL;
     if(health<=0){dead=true;running=false;setStatus('LOST');showOverlay('YOU WERE FOUND','A-1 drained your health in room A-'+String(room).padStart(3,'0')+'.','TRY AGAIN','GAME OVER');return}
    }
   }else{
    entity.damageTimer=0;
   }
   if(entity.phase==='stare'){
    if(entity.age>=entity.stareTime){entity.phase='run';entity.age=0;entity.cloneTimer=0;setStatus(isHiding?'HIDDEN — A-1 PASSING':'A-1 IS RUNNING');sound(82,.35,'sawtooth',.028)}
   }else{
    entity.z-=entity.speed*dt;
    entity.cloneTimer-=dt;
    if(entity.cloneTimer<=0){
     entity.clones.push({x:entity.x+rand(-.14,.14),z:entity.z+rand(.05,.55),age:0,lift:0,scale:rand(.72,.94)});
     if(entity.clones.length>8)entity.clones.shift();
     entity.cloneTimer=.2;
    }
    for(const clone of entity.clones){clone.age+=dt;clone.lift=Math.min(2.6,clone.lift+dt*1.8)}
    entity.clones=entity.clones.filter(clone=>clone.age<1.25);
    if(entity.z<player.z-2.4){entity=null;entityCooldown=10;setStatus(isHiding?'HIDDEN':'QUIET')}
   }
  }
 }
 if(entityCooldown>0)entityCooldown-=dt;
}
function cameraSpace(wx,wz,height){
 const dx=wx-player.x,dz=wz-player.z;
 return {forward:dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw),right:dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw),height};
}
function projectCameraPoint(point){
 const scale=FOCAL/point.forward;
 return {x:W/2+point.right*scale,y:HORIZON+viewPitch+(CAMERA_HEIGHT-point.height)*scale,scale,forward:point.forward};
}
function project(wx,wz,height){
 const point=cameraSpace(wx,wz,height);
 if(point.forward<NEAR_CLIP)return null;
 return projectCameraPoint(point);
}
function projectWorldPolygon(vertices){
 let points=vertices.map(([x,z,height])=>cameraSpace(x,z,height));
 const clipped=[];
 for(let i=0;i<points.length;i++){
  const current=points[i],previous=points[(i+points.length-1)%points.length];
  const currentInside=current.forward>=NEAR_CLIP,previousInside=previous.forward>=NEAR_CLIP;
  if(currentInside){
   if(!previousInside){
    const t=(NEAR_CLIP-previous.forward)/(current.forward-previous.forward);
    clipped.push({forward:NEAR_CLIP,right:previous.right+(current.right-previous.right)*t,height:previous.height+(current.height-previous.height)*t});
   }
   clipped.push(current);
  }else if(previousInside){
   const t=(NEAR_CLIP-previous.forward)/(current.forward-previous.forward);
   clipped.push({forward:NEAR_CLIP,right:previous.right+(current.right-previous.right)*t,height:previous.height+(current.height-previous.height)*t});
  }
 }
 return clipped.length>=3?clipped.map(projectCameraPoint):[];
}
function worldPolygon(vertices,color,stroke){
 const points=projectWorldPolygon(vertices);
 if(points.length>=3)polygon(points,color,stroke);
}
function worldLine(start,end,color,width=1,alpha=1){
 let a=cameraSpace(start[0],start[1],start[2]),b=cameraSpace(end[0],end[1],end[2]);
 const aInside=a.forward>=NEAR_CLIP,bInside=b.forward>=NEAR_CLIP;
 if(!aInside&&!bInside)return;
 if(aInside!==bInside){
  const t=(NEAR_CLIP-a.forward)/(b.forward-a.forward);
  const clipped={forward:NEAR_CLIP,right:a.right+(b.right-a.right)*t,height:a.height+(b.height-a.height)*t};
  if(aInside)b=clipped;else a=clipped;
 }
 const pa=projectCameraPoint(a),pb=projectCameraPoint(b);
 ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(pa.x,pa.y);ctx.lineTo(pb.x,pb.y);ctx.stroke();ctx.restore();
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
 for(let z=Math.floor(far/boardLength)*boardLength;z>=Math.floor(near/boardLength)*boardLength;z-=boardLength){
  const half=halfWidthAt(z);
  for(let x=-half;x<half;x+=boardWidth){
   const right=Math.min(half,x+boardWidth);
   const vertices=[[x,z,0],[right,z,0],[right,z+boardLength,0],[x,z+boardLength,0]];
   const index=(Math.floor((x+half)/boardWidth)+Math.floor(z/boardLength))%ROOM_MATERIAL.floor.length;
   worldPolygon(vertices,ROOM_MATERIAL.floor[index]);
   worldLine([x+.12,z+1.5,0],[x+.12,z+boardLength-1,0],'#d4dfcc22',1);
   worldLine([right,z,0],[right,z+boardLength,0],ROOM_MATERIAL.floorSeam,1,.65);
  }
 }
}
function drawCeiling(){
 const near=Math.max(0,player.z-ROOM_LENGTH*4),far=player.z+42;
 for(let z=Math.floor(far/3)*3;z>=Math.floor(near/3)*3;z-=3){
  const half=halfWidthAt(z);
  worldPolygon([[-half,z,3.55],[half,z,3.55],[half,z+3,3.55],[-half,z+3,3.55]],ROOM_MATERIAL.ceiling[Math.floor(z/3)%ROOM_MATERIAL.ceiling.length]);
 }
}
function drawSideWalls(){
 const start=Math.max(0,Math.floor((player.z-ROOM_LENGTH*4)/2)*2),far=Math.floor((player.z+42)/2)*2;
 for(let z=far;z>=start;z-=2){
  const half=halfWidthAt(z);
  for(const side of [-1,1]){
   const x=side*half,index=(Math.floor(z/2)+(side===1?1:0))%ROOM_MATERIAL.wall.length;
   worldPolygon([[x,z,0],[x,z+2,0],[x,z+2,3.55],[x,z,3.55]],ROOM_MATERIAL.wall[index],ROOM_MATERIAL.edge);
   for(const level of [.85,1.75,2.65])worldLine([x-side*.012,z,level],[x-side*.012,z+2,level],'#747e783f',1);
   worldLine([x-side*.02,z,.14],[x-side*.02,z+2,.14],'#77817a',2);
   worldLine([x-side*.02,z,3.34],[x-side*.02,z+2,3.34],'#f0eee4',2);
  }
 }
}
function drawLobbyDesk(){
 if(room!==0)return;
 const x=-5.35,z=18.5,w=1.45,d=.85,top=.88;
 worldPolygon([[x-w,z-d,top],[x+w,z-d,top],[x+w,z-d,top+.13],[x-w,z-d,top+.13]],'#9a7850','#d7bd8d');
 worldPolygon([[x+w,z-d,top],[x+w,z+d,top],[x+w,z+d,top+.13],[x+w,z-d,top+.13]],'#73563b','#c1a077');
 worldPolygon([[x-w,z-d,top+.13],[x+w,z-d,top+.13],[x+w,z+d,top+.13],[x-w,z+d,top+.13]],'#526c57','#c6b38a');
 for(const lx of [-1,1])for(const lz of [-1,1]){
  const px=x+lx*(w-.18),pz=z+lz*(d-.16),half=.09;
  worldPolygon([[px-half,pz-half,0],[px+half,pz-half,0],[px+half,pz-half,top],[px-half,pz-half,top]],'#806044','#b18c61');
  worldPolygon([[px+half,pz-half,0],[px+half,pz+half,0],[px+half,pz+half,top],[px+half,pz-half,top]],'#59432f','#a8865d');
 }
}
function closetForRoom(roomNumber){
 const z=roomNumber*ROOM_LENGTH+11.5;
 const side=roomNumber%2===0?-1:1;
 const half=halfWidthAt(z);
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
  worldPolygon([[backX,z-.54,0],[frontX,z-.54,0],[frontX,z-.54,2.35],[backX,z-.54,2.35]],'#343b40','#87949a');
  worldPolygon([[backX,z-.54,2.35],[frontX,z-.54,2.35],[frontX,z+.54,2.35],[backX,z+.54,2.35]],'#68747b','#aab5b9');
  worldPolygon([[frontX,z-.54,0],[frontX,z+.54,0],[frontX,z+.54,2.35],[frontX,z-.54,2.35]],'#30383e','#aeb9bd');
  worldPolygon([[frontX-c.side*.015,z-.45,.08],[frontX-c.side*.015,z+.45,.08],[frontX-c.side*.015,z+.45,2.26],[frontX-c.side*.015,z-.45,2.26]],'#68757c','#c1cbd0');
  worldPolygon([[frontX-c.side*.025,z-.34,.22],[frontX-c.side*.025,z+.34,.22],[frontX-c.side*.025,z+.34,2.12],[frontX-c.side*.025,z-.34,2.12]],'#77858c','#aeb9bd');
  for(const ventY of [.42,.5,.58])worldLine([frontX-c.side*.04,z-.18,ventY*3.2],[frontX-c.side*.04,z+.18,ventY*3.2],'#354047',1.5);
  const handle=project(frontX-c.side*.04,z+.3,1.08);
  if(handle){ctx.fillStyle='#e3cb8d';ctx.beginPath();ctx.arc(handle.x,handle.y,Math.max(1,handle.scale*.023),0,Math.PI*2);ctx.fill()}
  const plate=project(frontX-c.side*.045,z,2.43);
  if(plate){ctx.fillStyle='#c4cdd0';ctx.fillRect(plate.x-7,plate.y-3,14,6);ctx.fillStyle='#283137';ctx.font='bold 5px Arial';ctx.textAlign='center';ctx.fillText('HIDE',plate.x,plate.y+2)}
 }
}
function enterHidingSpot(spot){
 isHiding=true;hidingCloset=spot;hidingType=spot.type==='desk'?'desk':'closet';
 if(hidingType==='desk'){player.x=spot.x;player.z=spot.z-1.25}else{player.x=spot.side*(halfWidthAt(spot.z)-.78);player.z=spot.z}
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
 ctx.save();
 if(hidingType==='desk'){
  ctx.fillStyle='rgba(19,23,22,.82)';ctx.fillRect(0,0,W,H);
  const underside=ctx.createLinearGradient(0,0,0,H*.42);
  underside.addColorStop(0,'rgba(112,83,55,.88)');underside.addColorStop(1,'rgba(55,43,31,.82)');
  ctx.fillStyle=underside;ctx.fillRect(0,0,W,H*.38);
  ctx.fillStyle='rgba(24,20,15,.82)';ctx.fillRect(0,H*.38,W,H*.08);
  ctx.fillStyle='rgba(9,13,13,.56)';ctx.fillRect(W*.12,H*.46,W*.76,H*.54);
  ctx.restore();return;
 }
 const metal=ctx.createLinearGradient(0,0,W,0);
 metal.addColorStop(0,'rgba(26,35,41,.84)');metal.addColorStop(.18,'rgba(77,91,98,.82)');
 metal.addColorStop(.5,'rgba(37,48,54,.78)');metal.addColorStop(.82,'rgba(77,91,98,.82)');metal.addColorStop(1,'rgba(26,35,41,.84)');
 ctx.fillStyle=metal;ctx.fillRect(0,0,W,H);
 ctx.fillStyle='rgba(13,20,24,.40)';ctx.fillRect(W*.10,0,W*.80,H);
 ctx.fillStyle='rgba(177,190,194,.24)';ctx.fillRect(W*.105,0,5,H);ctx.fillRect(W*.895-5,0,5,H);
 const gap=clamp(W*.075,34,78),left=(W-gap)/2;
 ctx.fillStyle='rgba(3,8,11,.18)';ctx.fillRect(left,0,gap,H);
 ctx.fillStyle='rgba(178,191,196,.42)';ctx.fillRect(left-3,0,3,H);ctx.fillRect(left+gap,0,3,H);
 ctx.restore();
}
function drawPreviousDoor(){
 if(room<=0)return;
 const z=room*ROOM_LENGTH,half=halfWidthAt(z-.1),p=ROOM_MATERIAL;
 worldPolygon([[-half,z,0],[-.66,z,0],[-.66,z,3.6],[-half,z,3.6]],p.wall[0],p.edge);
 worldPolygon([[.66,z,0],[half,z,0],[half,z,3.6],[.66,z,3.6]],p.wall[1],p.edge);
 worldPolygon([[-.66,z,2.28],[.66,z,2.28],[.66,z,3.6],[-.66,z,3.6]],p.wall[2],p.edge);
 worldPolygon([[-.66,z-.015,0],[.66,z-.015,0],[.66,z-.015,2.28],[-.66,z-.015,2.28]],'#51402e',p.doorEdge);
 ctx.save();ctx.globalAlpha=.45;
 worldPolygon([[-.56,z-.03,.04],[.56,z-.03,.04],[.56,z-.03,2.16],[-.56,z-.03,2.16]],p.doorFace,p.doorEdge);
 worldPolygon([[-.43,z-.05,.22],[.43,z-.05,.22],[.43,z-.05,1.96],[-.43,z-.05,1.96]],p.panel,'#d1b77b');
 ctx.restore();
 worldPolygon([[-.53,z-.075,2.28],[.53,z-.075,2.28],[.53,z-.075,2.62],[-.53,z-.075,2.62]],'#d4b66c','#6c4e2e');
 const label=project(0,z-.1,2.44);
 if(label){ctx.save();ctx.fillStyle='#49351f';ctx.font='700 '+clamp(label.scale*.105,7,14)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('A-'+String(room).padStart(3,'0'),label.x,label.y);ctx.restore()}
}
function drawEndDoor(){
 const z=(room+1)*ROOM_LENGTH,p=ROOM_MATERIAL,half=halfWidthAt(z-.1);
 worldPolygon([[-half,z,0],[half,z,0],[half,z,3.6],[-half,z,3.6]],p.wall[0],p.edge);
 worldPolygon([[-.66,z-.015,0],[.66,z-.015,0],[.66,z-.015,2.28],[-.66,z-.015,2.28]],'#51402e',p.doorEdge);
 worldPolygon([[-.56,z-.03,.04],[.56,z-.03,.04],[.56,z-.03,2.16],[-.56,z-.03,2.16]],p.doorFace,p.doorEdge);
 worldPolygon([[-.43,z-.05,.22],[.43,z-.05,.22],[.43,z-.05,1.96],[-.43,z-.05,1.96]],p.panel,'#d1b77b');
 const handle=project(.39,z-.08,1.05);if(handle){ctx.fillStyle='#e4d093';ctx.beginPath();ctx.arc(handle.x,handle.y,Math.max(1.2,handle.scale*.021),0,Math.PI*2);ctx.fill()}
 worldPolygon([[-.53,z-.075,2.28],[.53,z-.075,2.28],[.53,z-.075,2.62],[-.53,z-.075,2.62]],'#d4b66c','#6c4e2e');
 const label=project(0,z-.1,2.44);
 if(label){ctx.save();ctx.fillStyle='#49351f';ctx.font='700 '+clamp(label.scale*.115,7,15)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#f5df9c';ctx.shadowBlur=.6;ctx.fillText('A-'+String(room+1).padStart(3,'0'),label.x,label.y);ctx.restore()}
}
const a1Sprite=new Image();
a1Sprite.decoding='async';
a1Sprite.src='./assets/a1.webp';
function drawA1SpriteAt(worldX,worldZ,height,alpha,baseHeight=0,glow=true){
 if(!a1Sprite.complete||!a1Sprite.naturalWidth)return;
 const cameraPoint=cameraSpace(worldX,worldZ,baseHeight);
 if(cameraPoint.forward<1.35||cameraPoint.forward>58)return;
 const base=project(worldX,worldZ,baseHeight),top=project(worldX,worldZ,baseHeight+height);
 if(!base||!top||base.x<-220||base.x>W+220)return;
 const rawHeight=Math.abs(base.y-top.y),h=clamp(rawHeight,0,560),w=clamp(h*(a1Sprite.naturalWidth/a1Sprite.naturalHeight),0,560);
 if(h<2||w<2||!Number.isFinite(h+w))return;
 const centerY=top.y+h*.52;
 if(glow){
  const radius=clamp(w*.85,12,220),light=ctx.createRadialGradient(base.x,centerY,1,base.x,centerY,radius);
  light.addColorStop(0,'rgba(225,235,255,.34)');light.addColorStop(.32,'rgba(195,213,255,.18)');light.addColorStop(1,'rgba(175,205,255,0)');
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha;ctx.fillStyle=light;ctx.beginPath();ctx.arc(base.x,centerY,radius,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 const pulse=entity&&entity.phase==='stare'?1+Math.sin(entity.age*14)*.012:1;
 ctx.save();ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=true;ctx.drawImage(a1Sprite,base.x-w*pulse/2,top.y+(h-h*pulse)/2,w*pulse,h*pulse);ctx.restore();
}
function drawA25(){
 if(!entity||entity.type!=='A-25')return;
 const baseSpace=cameraSpace(entity.x,entity.z,0);
 if(baseSpace.forward<1.5||baseSpace.forward>58)return;
 const base=project(entity.x,entity.z,0),top=project(entity.x,entity.z,3.1);
 if(!base||!top||base.x<-180||base.x>W+180)return;
 const h=clamp(Math.abs(base.y-top.y),0,500),w=clamp(h*.42,12,180);
 if(h<2||!Number.isFinite(h+w))return;
 const headY=top.y+h*.14,bodyTop=top.y+h*.27;
 ctx.save();
 const glow=ctx.createRadialGradient(base.x,headY,1,base.x,headY,clamp(w*1.5,15,170));
 glow.addColorStop(0,'rgba(120,25,25,.36)');glow.addColorStop(1,'rgba(90,0,0,0)');
 ctx.fillStyle=glow;ctx.beginPath();ctx.arc(base.x,headY,clamp(w*1.5,15,170),0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#08090b';
 ctx.beginPath();
 ctx.moveTo(base.x-w*.28,base.y);ctx.lineTo(base.x-w*.48,bodyTop+h*.25);
 ctx.lineTo(base.x-w*.34,bodyTop);ctx.lineTo(base.x-w*.23,headY+h*.08);
 ctx.lineTo(base.x-w*.3,top.y+h*.02);ctx.lineTo(base.x-w*.18,top.y);
 ctx.lineTo(base.x+w*.18,top.y);ctx.lineTo(base.x+w*.3,top.y+h*.02);
 ctx.lineTo(base.x+w*.23,headY+h*.08);ctx.lineTo(base.x+w*.34,bodyTop);
 ctx.lineTo(base.x+w*.48,bodyTop+h*.25);ctx.lineTo(base.x+w*.28,base.y);
 ctx.closePath();ctx.fill();
 ctx.fillStyle='#250d0d';ctx.fillRect(base.x-w*.2,headY,w*.4,h*.12);
 ctx.fillStyle='#d84b42';ctx.shadowColor='#d82d24';ctx.shadowBlur=clamp(w*.18,2,16);
 ctx.fillRect(base.x-w*.16,headY+h*.045,Math.max(2,w*.075),Math.max(2,h*.018));
 ctx.fillRect(base.x+w*.085,headY+h*.045,Math.max(2,w*.075),Math.max(2,h*.018));
 ctx.restore();
}
function drawA1(){
 if(!entity||entity.type!=='A-1')return;
 for(const clone of entity.clones){
  const fade=clamp(1-clone.age/1.25,0,1),size=clone.scale*(1-clone.age*.18);
  drawA1SpriteAt(clone.x,clone.z,3.05*size,fade*.5,clone.lift,false);
 }
 const flicker=.94+Math.sin(entity.age*19)*.06;
 drawA1SpriteAt(entity.x,entity.z,3.05,entity.phase==='stare'?.99:flicker,0,true);
}
function drawEntity(){
 if(!entity)return;
 if(entity.type==='A-25')drawA25();else drawA1();
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
 drawCeiling();drawFloor();drawSideWalls();drawEndDoor();drawPreviousDoor();drawEntity();drawClosets();drawLobbyDesk();drawHidingView();
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
