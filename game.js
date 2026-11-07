(()=>{
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
const W=960,H=540,HORIZON=220,FOCAL=430,CAMERA_HEIGHT=1.48,ROOM_LENGTH=32,CORRIDOR_HALF=4.2;
const A1_DAMAGE_RADIUS=4,A1_DAMAGE_PER_TICK=10,A1_DAMAGE_INTERVAL=1,NEAR_CLIP=.48;
const A25_ROOM=25,A25_SPEED=24,A25_DAMAGE_RADIUS=10,ROOMS_KEPT_BEHIND=2;
const roomLabel=document.getElementById('room-label'),roomCtx=roomLabel.getContext('2d');
const statusEl=document.getElementById('status'),healthWrap=document.getElementById('health-wrap'),healthFill=document.getElementById('health-fill');
const overlay=document.getElementById('overlay'),overlayTitle=document.getElementById('overlay-title'),overlayCopy=document.getElementById('overlay-copy'),overlayEyebrow=document.getElementById('overlay-eyebrow'),resumeBtn=document.getElementById('resume'),muteBtn=document.getElementById('mute'),pauseBtn=document.getElementById('pause');
const adminToggle=document.getElementById('admin-toggle'),adminPanel=document.getElementById('admin-panel'),adminForm=document.getElementById('admin-form'),adminRoomInput=document.getElementById('admin-room'),adminClose=document.getElementById('admin-close'),adminEntitySelect=document.getElementById('admin-entity'),adminSpawnButton=document.getElementById('admin-spawn'),adminFeedback=document.getElementById('admin-feedback');
let room=0,furthestRoom=0,health=100,flashlight=true,running=true,paused=false,dead=false,mute=false,last=0,audio=null,shake=0;
let keys=Object.create(null),entity=null,entityCooldown=0,doorHint=false,mouseTurn=0,isHiding=false,hidingCloset=null,hidingType=null;
let a25Started=false,a25Completed=false;
const player={x:0,z:5,yaw:0,speed:3.25};
const doorStates=new Map();
function retainedRoomFloor(){return Math.max(0,furthestRoom-ROOMS_KEPT_BEHIND)}
function pruneDoorStates(){const minimum=retainedRoomFloor()*ROOM_LENGTH;for(const boundary of doorStates.keys())if(boundary<minimum)doorStates.delete(boundary)}
function doorIsOpen(boundary){const state=doorStates.get(boundary);return !!state&&state.angle>=1.12}
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
 const targets=[statusEl,muteBtn,pauseBtn,...document.querySelectorAll('.controls span'),...adminPanel.querySelectorAll('[data-pixel]')];
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
 room=0;furthestRoom=0;doorStates.clear();health=100;player.x=0;player.z=5;player.yaw=0;viewPitch=0;entity=null;entityCooldown=0;a25Started=false;a25Completed=false;isHiding=false;hidingCloset=null;hidingType=null;dead=false;paused=false;running=true;keys=Object.create(null);
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
function startA25Encounter(targetRoom){
 a25Started=true;a25Completed=false;entityCooldown=0;
 const targetEnd=(targetRoom+1)*ROOM_LENGTH-.8;
 entity={type:'A-25',x:0,z:1.2,age:0,direction:1,targetRoom,targetZ:targetEnd,rebounds:0,particleTimer:0,particles:[],speed:A25_SPEED};
 setStatus('A-25 SPAWNED IN THE LOBBY — HIDE NOW');
 sound(62,.8,'sawtooth',.035);
}
function teleportToRoom(targetRoom){
 if(!Number.isInteger(targetRoom)||targetRoom<0||targetRoom>999){setStatus('INVALID ROOM NUMBER');return}
 room=targetRoom;furthestRoom=targetRoom;doorStates.clear();player.x=0;player.z=room*ROOM_LENGTH+1.1;player.yaw=0;
 keys=Object.create(null);doorHint=false;isHiding=false;hidingCloset=null;hidingType=null;entityCooldown=0;
 updateHud();setStatus('TELEPORTED TO '+(room===0?'LOBBY':'ROOM A-'+String(room).padStart(3,'0')));
 adminPanel.style.display='none';adminPanel.setAttribute('aria-hidden','true');
}
function spawnAdminEntity(){
 const selected=adminEntitySelect.value;
 entityCooldown=0;
 if(selected==='A-1'){
  entity={type:'A-1',x:player.x,z:player.z+14,age:0,phase:'stare',stareTime:1.5,speed:ROOM_LENGTH*.58,damaged:false,damageTimer:0,cloneTimer:.08,clones:[]};
  setStatus('ADMIN SPAWNED A-1');
  adminFeedback.textContent='A-1 SPAWNED IN FRONT OF PLAYER';
 }else if(selected==='A-25'){
  const spawnRoom=Math.max(1,room),targetZ=(spawnRoom+1)*ROOM_LENGTH-.8;
  startA25Encounter(spawnRoom);
  setStatus('ADMIN SPAWNED A-25');
  adminFeedback.textContent='A-25 SPAWNED — HIDE IN A STEEL CABINET';
 }else{
  adminFeedback.textContent='UNKNOWN ENTITY';
  return;
 }
 if(entity&&entity.type==='A-25')a25Started=true;
 adminPanel.style.display='none';adminPanel.setAttribute('aria-hidden','true');
 sound(selected==='A-25'?62:118,.35,'sawtooth',.028);
}
function openDoor(direction){
 const boundary=direction>0?(room+1)*ROOM_LENGTH:room*ROOM_LENGTH;
 if(direction<0&&room<=retainedRoomFloor()){setStatus('PREVIOUS ROOM IS NO LONGER STORED');return false}
 const distance=direction>0?boundary-player.z:player.z-boundary;
 if(distance>2.8||distance<-.05){setStatus('DOOR IS TOO FAR');return false}
 let state=doorStates.get(boundary);
 if(!state){state={angle:0,swing:direction};doorStates.set(boundary,state)}
 else if(state.angle<.25)state.swing=direction;
 if(state.angle<1.12){setStatus('DOOR OPENING');sound(215,.16,'triangle',.025)}
 else setStatus('DOOR OPEN — WALK THROUGH');
 doorHint=true;
 return true;
}
function nearbyDoor(){
 const candidates=[];
 const frontBoundary=(room+1)*ROOM_LENGTH,frontDistance=frontBoundary-player.z;
 if(frontDistance>=-.05&&frontDistance<=2.8)candidates.push({direction:1,distance:frontDistance});
 const backBoundary=room*ROOM_LENGTH,backDistance=player.z-backBoundary;
 if(room>retainedRoomFloor()&&backDistance>=-.05&&backDistance<=2.8)candidates.push({direction:-1,distance:backDistance});
 candidates.sort((a,b)=>a.distance-b.distance);
 return candidates[0]||null;
}
function handleRoomEntered(nextRoomNumber){
 setStatus('ROOM A-'+String(nextRoomNumber).padStart(3,'0')+' ENTERED');
 if(!entity&&Math.random()<.32){startA25Encounter(nextRoomNumber);return}
 const spawnRate=getEntitySpawnRate('A-1');
 if(!entity&&entityCooldown<=0&&Math.random()<spawnRate){
  entity={type:'A-1',x:rand(-.22,.22),z:(nextRoomNumber+1)*ROOM_LENGTH-1.4,age:0,phase:'stare',stareTime:rand(1.3,2.2),speed:ROOM_LENGTH*.58,damaged:false,damageTimer:0,cloneTimer:.08,clones:[]};
  setStatus('A-1 IS WATCHING');sound(118,.42,'sawtooth',.018);
 }
}
function onKey(e,down){
 if(e.target&&e.target.closest&&e.target.closest('#admin-panel')){
  if(down&&e.key==='Escape'){adminPanel.style.display='none';adminPanel.setAttribute('aria-hidden','true');canvas.focus()}
  return;
 }
 const key=e.key.toLowerCase();
 if(key===' ')e.preventDefault();
 if(key==='e'){
  if(!down||e.repeat)return;
  e.preventDefault();
  interact();
  return;
 }
 keys[key]=down;
 if(!down)return;
 if(key==='escape'){togglePause();return}
 if(key==='f'){flashlight=!flashlight;sound(420,.045);return}
}
window.addEventListener('keydown',e=>onKey(e,true));
window.addEventListener('keyup',e=>onKey(e,false));
resumeBtn.addEventListener('click',()=>{if(dead)startNewRun();else if(paused)togglePause()});
pauseBtn.addEventListener('click',togglePause);
muteBtn.addEventListener('click',()=>{mute=!mute;muteBtn.textContent=mute?'SOUND OFF':'SOUND ON';if(!mute)sound(300,.05)});
adminToggle.addEventListener('click',()=>{const open=adminPanel.style.display!=='block';adminPanel.style.display=open?'block':'none';adminPanel.setAttribute('aria-hidden',String(!open));if(open){adminRoomInput.value=String(room);adminRoomInput.focus();adminRoomInput.select()}});
adminClose.addEventListener('click',()=>{adminPanel.style.display='none';adminPanel.setAttribute('aria-hidden','true')});
adminForm.addEventListener('submit',event=>{
 event.preventDefault();
 if(!adminRoomInput.value.trim()||!adminRoomInput.reportValidity())return;
 const value=Number(adminRoomInput.value);
 if(!Number.isInteger(value)||value<0||value>999){adminRoomInput.setCustomValidity('Enter a room from 0 to 999.');adminRoomInput.reportValidity();return}
 adminRoomInput.setCustomValidity('');teleportToRoom(value);
});
adminSpawnButton.addEventListener('click',spawnAdminEntity);
canvas.addEventListener('click',()=>{if(!paused&&!dead)canvas.focus()});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerdown',e=>{if(e.button!==2)return;rightDragging=true;lastPointerX=e.clientX;lastPointerY=e.clientY;canvas.setPointerCapture(e.pointerId);e.preventDefault()});
canvas.addEventListener('pointermove',e=>{if(!rightDragging)return;const dx=e.clientX-lastPointerX,dy=e.clientY-lastPointerY;lastPointerX=e.clientX;lastPointerY=e.clientY;player.yaw+=dx*.0065;viewPitch=clamp(viewPitch-dy*1.05,-185,185)});
const stopRightDrag=()=>{rightDragging=false};
canvas.addEventListener('pointerup',stopRightDrag);canvas.addEventListener('pointercancel',stopRightDrag);
function update(dt){
 for(const state of doorStates.values())state.angle=Math.min(1.35,state.angle+dt*3.4);
 if(!isHiding){
  const forward=(keys.w?1:0)-(keys.s?1:0),strafe=(keys.d?1:0)-(keys.a?1:0);
  const speed=player.speed*(keys.shift?1.45:1),length=Math.hypot(forward,strafe)||1;
  const f=forward/length*speed*dt,s=strafe/length*speed*dt;
  const nextX=player.x+Math.cos(player.yaw)*s+Math.sin(player.yaw)*f;
  let nextZ=player.z+Math.cos(player.yaw)*f-Math.sin(player.yaw)*s;
  const oldRoom=Math.max(0,Math.floor(player.z/ROOM_LENGTH));
  const targetRoom=Math.max(0,Math.floor(Math.max(0,nextZ)/ROOM_LENGTH));
  if(targetRoom>oldRoom){
   const boundary=(oldRoom+1)*ROOM_LENGTH;
   if(!doorIsOpen(boundary)||Math.abs(nextX)>.70)nextZ=Math.min(nextZ,boundary-.8);
  }else if(targetRoom<oldRoom){
   const boundary=oldRoom*ROOM_LENGTH;
   if(!doorIsOpen(boundary)||Math.abs(nextX)>.70)nextZ=Math.max(nextZ,boundary+.8);
  }
  nextZ=Math.max(nextZ,retainedRoomFloor()*ROOM_LENGTH+.45);
  const half=halfWidthAt(nextZ);
  player.x=clamp(nextX,-half+.65,half-.65);
  player.z=nextZ;
  const nextRoomIndex=Math.max(0,Math.floor(player.z/ROOM_LENGTH));
  if(nextRoomIndex!==room){
   const previousRoom=room;room=nextRoomIndex;updateHud();doorHint=false;delete statusEl.dataset.state;
   if(room>furthestRoom){furthestRoom=room;pruneDoorStates();handleRoomEntered(room)}
   else setStatus('RETURNED TO '+(room===0?'LOBBY':'ROOM A-'+String(room).padStart(3,'0')));
  }
  const nearby=findNearbyCloset(),nearbyDesk=findNearbyDesk(),door=nearbyDoor();
  if(nearby){if(statusEl.dataset.state!=='closet'){setStatus('PRESS E TO ENTER STEEL CABINET');statusEl.dataset.state='closet'}}
  else if(nearbyDesk){if(statusEl.dataset.state!=='desk'){setStatus('PRESS E TO HIDE UNDER DESK');statusEl.dataset.state='desk'}}
  else if(door){if(statusEl.dataset.state!=='door'){setStatus('PRESS E TO OPEN DOOR');doorHint=true;statusEl.dataset.state='door'}}
  else if(doorHint||statusEl.dataset.state==='closet'||statusEl.dataset.state==='desk'||statusEl.dataset.state==='door'){setStatus(room===0?'LOBBY':'LISTEN');doorHint=false;delete statusEl.dataset.state}
 }else if(statusEl.dataset.state!=='hidden'){
  setStatus('HIDDEN — PRESS E TO EXIT');statusEl.dataset.state='hidden';
 }
 if(entity){
  if(entity.type==='A-25'){
   entity.age+=dt;
   entity.particleTimer-=dt;
   if(entity.particleTimer<=0){
    entity.particles.push({x:entity.x+rand(-.55,.55),z:entity.z-entity.direction*rand(.35,1.05),height:rand(.45,2.65),age:0,life:rand(.65,1.25),scale:rand(.45,.95),variant:Math.floor(Math.random()*2)});
    if(entity.particles.length>44)entity.particles.shift();
    entity.particleTimer=.055;
   }
   for(const particle of entity.particles){particle.age+=dt;particle.z-=entity.direction*dt*.75}
   entity.particles=entity.particles.filter(particle=>particle.age<particle.life);
   entity.z+=entity.direction*entity.speed*dt;
   if(entity.direction>0&&entity.z>=entity.targetZ){
    entity.z=entity.targetZ;
    if(entity.rebounds===0){
     entity.rebounds=1;entity.direction=-1;entity.targetZ=.8;
     setStatus('A-25 REBOUNDS — RUNNING BACK TO THE LOBBY');
    }else if(entity.rebounds===2){
     entity=null;a25Completed=true;a25Started=false;setStatus('A-25 PASSED — ROOM CLEARED');
    }
   }else if(entity.direction<0&&entity.z<=entity.targetZ){
    entity.z=entity.targetZ;entity.rebounds=2;
    entity.direction=1;entity.targetZ=(entity.targetRoom+1)*ROOM_LENGTH-.8;
    setStatus('A-25 REBOUNDS AT THE LOBBY — FINAL PASS');
   }
   if(entity&&!isHiding&&Math.hypot(entity.x-player.x,entity.z-player.z)<=A25_DAMAGE_RADIUS){
    dead=true;running=false;health=0;updateHud();setStatus('LOST');
    showOverlay('A-25 FOUND YOU','Stay inside a steel cabinet for both passes.','TRY AGAIN','GAME OVER');return;
   }
   if(entity&&!isHiding){
    const distance=Math.hypot(entity.x-player.x,entity.z-player.z);
    if(distance<=A25_DAMAGE_RADIUS){shake=Math.max(shake,(1-distance/A25_DAMAGE_RADIUS)*17);setStatus('A-25 NEAR — HIDE NOW')}
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
    if(entity.cloneTimer<=0&&entity.z-player.z<48&&entity.z-player.z>1.5){
     if(entity.clones.length<5)entity.clones.push({x:entity.x+rand(-.14,.14),z:entity.z+rand(.05,.55),age:0,lift:0,scale:rand(.72,.94)});
     entity.cloneTimer=.3;
    }
    for(let index=entity.clones.length-1;index>=0;index--){
     const clone=entity.clones[index];
     clone.age+=dt;clone.lift=Math.min(2.1,clone.lift+dt*1.8);
     if(clone.age>=.95)entity.clones.splice(index,1);
    }
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
 const near=retainedRoomFloor()*ROOM_LENGTH,far=player.z+48,boardWidth=.85,boardLength=8;
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
 const near=Math.max(0,(room-ROOMS_KEPT_BEHIND)*ROOM_LENGTH),far=player.z+42;
 for(let z=Math.floor(far/3)*3;z>=Math.floor(near/3)*3;z-=3){
  const half=halfWidthAt(z);
  worldPolygon([[-half,z,3.55],[half,z,3.55],[half,z+3,3.55],[-half,z+3,3.55]],ROOM_MATERIAL.ceiling[Math.floor(z/3)%ROOM_MATERIAL.ceiling.length]);
 }
}
function drawSideWalls(){
 const start=Math.floor(retainedRoomFloor()*ROOM_LENGTH/2)*2,far=Math.floor((player.z+42)/2)*2;
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
function drawDesk(desk){
 const x=desk.x,z=desk.z,w=1.15,d=.68,top=.86;
 worldPolygon([[x-w,z-d,top],[x+w,z-d,top],[x+w,z-d,top+.13],[x-w,z-d,top+.13]],'#9a7850','#d7bd8d');
 worldPolygon([[x+w,z-d,top],[x+w,z+d,top],[x+w,z+d,top+.13],[x+w,z-d,top+.13]],'#73563b','#c1a077');
 worldPolygon([[x-w,z-d,top+.13],[x+w,z-d,top+.13],[x+w,z+d,top+.13],[x-w,z+d,top+.13]],'#526c57','#c6b38a');
 for(const lx of [-1,1])for(const lz of [-1,1]){
  const px=x+lx*(w-.16),pz=z+lz*(d-.12),half=.075;
  worldPolygon([[px-half,pz-half,0],[px+half,pz-half,0],[px+half,pz-half,top],[px-half,pz-half,top]],'#806044','#b18c61');
  worldPolygon([[px+half,pz-half,0],[px+half,pz+half,0],[px+half,pz+half,top],[px+half,pz-half,top]],'#59432f','#a8865d');
 }
}
function drawDesks(){
 for(let n=retainedRoomFloor();n<=room+1;n++){
  for(let slot=0;slot<2;slot++)drawDesk(deskForRoom(n,slot));
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
 for(let n=retainedRoomFloor();n<=room+1;n++){
  const closet=closetForRoom(n),distance=Math.hypot(player.x-closet.x,player.z-closet.z);
  if(distance<best){best=distance;closest=closet}
 }
 return best<3.25?closest:null;
}
function deskForRoom(roomNumber,slot){
 const z=roomNumber*ROOM_LENGTH+(slot===0?18.5:26);
 const side=(roomNumber+slot)%2===0?-1:1;
 const half=halfWidthAt(z);
 return {room:roomNumber,slot,type:'desk',side,x:side*(half-1.25),z};
}
function findNearbyDesk(){
 let closest=null,best=Infinity;
 for(let n=Math.max(0,room-ROOMS_KEPT_BEHIND);n<=room+1;n++){
  for(let slot=0;slot<2;slot++){
   const desk=deskForRoom(n,slot),distance=Math.hypot(player.x-desk.x,player.z-desk.z);
   if(distance<best){best=distance;closest=desk}
  }
 }
 return best<2.5?closest:null;
}
function drawClosets(){
 for(let n=retainedRoomFloor();n<=room+1;n++){
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
  if(plate){ctx.fillStyle='#c4cdd0';ctx.fillRect(plate.x-5,plate.y-2,10,4)}
 }
}
function enterHidingSpot(spot){
 isHiding=true;hidingCloset=spot;hidingType=spot.type==='desk'?'desk':'closet';
 if(hidingType==='desk'){player.x=spot.x-spot.side*.3;player.z=spot.z+.15}else{player.x=spot.side*(halfWidthAt(spot.z)-.78);player.z=spot.z}
 keys=Object.create(null);setStatus(hidingType==='desk'?'UNDER DESK — PRESS E TO EXIT':'HIDDEN — PRESS E TO EXIT');sound(95,.22,'triangle',.018);
}
function exitCloset(){isHiding=false;hidingCloset=null;hidingType=null;setStatus('LISTEN');sound(155,.16,'triangle',.018)}
function interact(){
 if(isHiding){exitCloset();return}
 const closet=findNearbyCloset();if(closet){enterHidingSpot(closet);return}
 const desk=findNearbyDesk();if(desk){enterHidingSpot(desk);return}
 const door=nearbyDoor();
 if(door){openDoor(door.direction);return}
 setStatus('NOTHING TO INTERACT WITH');
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
function drawDoorLeaf(boundary,state){
 const angle=state?state.angle:0,swing=state?state.swing:1,width=1.60,hinge=-.80;
 const point=(offset,height)=>[hinge+Math.cos(angle)*offset,boundary+swing*Math.sin(angle)*offset,height];
 worldPolygon([point(0,0),point(width,0),point(width,2.28),point(0,2.28)],'#9a7952','#d7bf84');
 worldPolygon([point(.12,.2),point(width-.12,.2),point(width-.12,2.08),point(.12,2.08)],'#b08c5c','#d1b77b');
 worldLine(point(.12,.2),point(.12,2.08),'#e2c991',1.2);
 worldLine(point(width-.12,.2),point(width-.12,2.08),'#765735',1.2);
}
function drawDoorSign(boundary,roomNumber,faceSide){
 const z=boundary+faceSide*.035;
 worldPolygon([[-.68,z,2.3],[.68,z,2.3],[.68,z,2.62],[-.68,z,2.62]],'#d4b66c','#6c4e2e');
 const label=project(0,z,2.46);
 if(label){ctx.save();ctx.fillStyle='#49351f';ctx.font='700 '+clamp(label.scale*.105,7,14)+'px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('A-'+String(roomNumber).padStart(3,'0'),label.x,label.y);ctx.restore()}
}
function drawDoorway(boundary,roomNumber,faceSide,forceClosed=false){
 const p=ROOM_MATERIAL,half=halfWidthAt(boundary);
 worldPolygon([[-half,boundary,0],[-.82,boundary,0],[-.82,boundary,3.6],[-half,boundary,3.6]],p.wall[0],p.edge);
 worldPolygon([[.82,boundary,0],[half,boundary,0],[half,boundary,3.6],[.82,boundary,3.6]],p.wall[1],p.edge);
 worldPolygon([[-.82,boundary,2.28],[.82,boundary,2.28],[.82,boundary,3.6],[-.82,boundary,3.6]],p.wall[2],p.edge);
 worldPolygon([[-.82,boundary,0],[-.82,boundary+.18,0],[-.82,boundary+.18,2.28],[-.82,boundary,2.28]],'#806044','#d7bf84');
 worldPolygon([[.82,boundary,0],[.82,boundary,2.28],[.82,boundary+.18,2.28],[.82,boundary+.18,0]],'#806044','#d7bf84');
 worldPolygon([[-.82,boundary,2.28],[.82,boundary,2.28],[.82,boundary+.18,2.28],[-.82,boundary+.18,2.28]],'#806044','#d7bf84');
 worldPolygon([[-.82,boundary,0],[.82,boundary,0],[.82,boundary+.18,0],[-.82,boundary+.18,0]],'#95784e','#d7bf84');
 worldLine([-.82,boundary,0],[-.82,boundary,2.3],p.doorEdge,3);
 worldLine([.82,boundary,0],[.82,boundary,2.3],p.doorEdge,3);
 worldLine([-.82,boundary,2.28],[.82,boundary,2.28],p.doorEdge,3);
 drawDoorLeaf(boundary,forceClosed?null:doorStates.get(boundary));
 drawDoorSign(boundary,roomNumber,faceSide);
}
function drawPreviousDoor(){
 if(room<=0)return;
 const boundary=room*ROOM_LENGTH;
 drawDoorway(boundary,room,1,room<=retainedRoomFloor());
}
function drawEndDoor(){
 const boundary=(room+1)*ROOM_LENGTH;
 drawDoorway(boundary,room+1,-1);
}
let a1LabelCanvas=null;
const a1GlowCanvas=document.createElement('canvas');
a1GlowCanvas.width=128;a1GlowCanvas.height=128;
const a1GlowContext=a1GlowCanvas.getContext('2d');
const a1GlowGradient=a1GlowContext.createRadialGradient(64,64,1,64,64,64);
a1GlowGradient.addColorStop(0,'rgba(225,235,255,.34)');
a1GlowGradient.addColorStop(.32,'rgba(195,213,255,.18)');
a1GlowGradient.addColorStop(1,'rgba(175,205,255,0)');
a1GlowContext.fillStyle=a1GlowGradient;
a1GlowContext.fillRect(0,0,128,128);
const a1Sprite=new Image();
a1Sprite.decoding='async';
a1Sprite.src='./assets/a1.webp';
const a25Sprite=new Image();
a25Sprite.decoding='async';
a25Sprite.src='./assets/a25.webp';
const a25ParticleSprites=[new Image(),new Image()];
a25ParticleSprites[0].src='./assets/parct251.webp';
a25ParticleSprites[1].src='./assets/parct252.webp';
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
  const radius=clamp(w*.85,12,220);
  ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha;
  ctx.drawImage(a1GlowCanvas,base.x-radius,centerY-radius,radius*2,radius*2);
  ctx.restore();
 }
 const pulse=entity&&entity.phase==='stare'?1+Math.sin(entity.age*14)*.012:1;
 ctx.save();ctx.globalAlpha=alpha;ctx.imageSmoothingEnabled=true;ctx.drawImage(a1Sprite,base.x-w*pulse/2,top.y+(h-h*pulse)/2,w*pulse,h*pulse);ctx.restore();
}
function drawA25Particle(particle){
 const sprite=a25ParticleSprites[particle.variant];
 const point=project(particle.x,particle.z,particle.height);
 if(!point||point.forward>58||point.x<-100||point.x>W+100)return;
 const fade=clamp(1-particle.age/particle.life,0,1);
 const size=clamp(point.scale*particle.scale*.9,2,72);
 const aspect=sprite&&sprite.complete&&sprite.naturalWidth?sprite.naturalWidth/sprite.naturalHeight:1;
 const width=size*aspect;
 if(!Number.isFinite(width)||width>120)return;
 const glowRadius=clamp(size*1.15,5,46);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=fade*.58;
 const glow=ctx.createRadialGradient(point.x,point.y,1,point.x,point.y,glowRadius);
 glow.addColorStop(0,'rgba(80,255,115,.52)');glow.addColorStop(1,'rgba(40,220,80,0)');
 ctx.fillStyle=glow;ctx.beginPath();ctx.arc(point.x,point.y,glowRadius,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.save();ctx.globalAlpha=fade*.78;
 if(sprite&&sprite.complete&&sprite.naturalWidth)ctx.drawImage(sprite,point.x-width/2,point.y-size/2,width,size);
 else{ctx.fillStyle='rgba(75,255,110,.9)';ctx.beginPath();ctx.arc(point.x,point.y,size*.34,0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
function drawA25(){
 if(!entity||entity.type!=='A-25')return;
 for(const particle of entity.particles)drawA25Particle(particle);
 const wobble=Math.sin(entity.age*34)*.13+Math.sin(entity.age*57)*.055;
 const drawX=entity.x+wobble;
 const baseSpace=cameraSpace(drawX,entity.z,0);
 if(baseSpace.forward<1.35||baseSpace.forward>58)return;
 const base=project(drawX,entity.z,0),top=project(drawX,entity.z,3.2);
 if(!base||!top||base.x<-200||base.x>W+200)return;
 const h=clamp(Math.abs(base.y-top.y),2,500);
 const spriteAspect=a25Sprite.complete&&a25Sprite.naturalWidth&&a25Sprite.naturalHeight?a25Sprite.naturalWidth/a25Sprite.naturalHeight:.62;
 const w=clamp(h*spriteAspect,2,480);
 if(h<2||w<2||!Number.isFinite(h+w))return;
 const centerY=top.y+h*.5,radius=clamp(w*1.25,24,210);
 ctx.save();ctx.globalCompositeOperation='screen';
 const glow=ctx.createRadialGradient(base.x,centerY,1,base.x,centerY,radius);
 glow.addColorStop(0,'rgba(74,255,105,.48)');
 glow.addColorStop(.38,'rgba(37,225,75,.24)');
 glow.addColorStop(1,'rgba(30,210,65,0)');
 ctx.fillStyle=glow;ctx.beginPath();ctx.arc(base.x,centerY,radius,0,Math.PI*2);ctx.fill();ctx.restore();
 ctx.save();ctx.globalAlpha=.98;ctx.imageSmoothingEnabled=true;
 if(a25Sprite.complete&&a25Sprite.naturalWidth)ctx.drawImage(a25Sprite,base.x-w/2,top.y,w,h);
 else{ctx.fillStyle='rgba(45,245,85,.68)';ctx.fillRect(base.x-w*.18,top.y+h*.12,w*.36,h*.82);ctx.beginPath();ctx.arc(base.x,top.y+h*.1,w*.19,0,Math.PI*2);ctx.fill()}
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
 if(!a1LabelCanvas){
  const measure=document.createElement('canvas').getContext('2d');measure.font=font;
  const size=parseFloat(font.match(/[0-9.]+px/)?.[0]||'13'),width=Math.ceil(measure.measureText(text).width+8),height=Math.ceil(size*1.8),scale=.82;
  const temp=document.createElement('canvas');temp.width=Math.ceil(width*scale);temp.height=Math.ceil(height*scale);
  const p=temp.getContext('2d');p.scale(scale,scale);p.font=font;p.fillStyle=color;p.textBaseline='alphabetic';p.fillText(text,4,size*1.25);
  a1LabelCanvas={canvas:temp,width,height,size};
 }
 const {canvas:temp,width,height,size}=a1LabelCanvas;
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
 drawCeiling();drawFloor();drawSideWalls();drawClosets();drawDesks();drawEntity();drawPreviousDoor();drawEndDoor();drawHidingView();
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
