(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const form=$('cardForm'), file=$('movieFile'), video=$('sourceVideo'), scratch=$('analysisCanvas'), sctx=scratch.getContext('2d',{willReadFrequently:true});
  const status=$('status'), progressPanel=$('progressPanel'), progressBar=$('progressBar'), progressLabel=$('progressLabel'), progressPercent=$('progressPercent');
  const results=$('results'), grid=$('cardGrid'), walletButton=$('walletButton');
  let cards=[], objectUrl='', busy=false;

  function wallet(){if(!window.InfinityUnifiedWallet?.UnifiedInfinityWallet)throw new Error('Unified wallet is unavailable.');return new window.InfinityUnifiedWallet.UnifiedInfinityWallet()}
  function connected(w){const id=w.state.currentWalletId;return id&&w.state.wallets[id]?w.state.wallets[id]:null}
  function renderWallet(){try{const w=wallet(),active=connected(w);walletButton.textContent=active?`Wallet · ${w.balance(active.walletId,'STAR_COIN').toFixed(1)} ⭐`:'Connect Wallet'}catch(_){walletButton.textContent='Wallet unavailable'}}
  walletButton.addEventListener('click',()=>{try{const w=wallet();if(!connected(w)){w.createWallet({displayName:'Unified Infinity Wallet'});renderWallet()}else location.href='https://www-infinity4.github.io/Mint-For-Infinity/unified-wallet.html'}catch(_){status.textContent='The unified wallet could not be opened.'}});

  file.addEventListener('change',()=>{$('fileName').textContent=file.files[0]?.name||'MP4, WebM, MOV or M4V'});
  function seek(time){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('This part of the movie could not be read.')),12000);video.addEventListener('seeked',()=>{clearTimeout(timer);resolve()},{once:true});video.currentTime=Math.min(Math.max(time,0),Math.max(0,video.duration-.08))})}
  function signature(data){let out='';for(let gy=0;gy<6;gy++)for(let gx=0;gx<8;gx++){const x=Math.floor((gx+.5)*scratch.width/8),y=Math.floor((gy+.5)*scratch.height/6),i=(y*scratch.width+x)*4;out+=Math.round((data[i]+data[i+1]+data[i+2])/3/32).toString(16)}return out}
  function distance(a,b){let d=0;for(let i=0;i<Math.min(a.length,b.length);i++)d+=a[i]===b[i]?0:1;return d}
  function scoreFrame(data){let sum=0,sum2=0,edges=0,sat=0,n=data.length/4;for(let y=1;y<scratch.height;y+=2)for(let x=1;x<scratch.width;x+=2){const i=(y*scratch.width+x)*4,l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2],j=(y*scratch.width+x-1)*4,k=((y-1)*scratch.width+x)*4;sum+=l;sum2+=l*l;edges+=Math.abs(l-(.2126*data[j]+.7152*data[j+1]+.0722*data[j+2]))+Math.abs(l-(.2126*data[k]+.7152*data[k+1]+.0722*data[k+2]));sat+=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])}const samples=Math.ceil((scratch.width-1)/2)*Math.ceil((scratch.height-1)/2),mean=sum/samples,variance=Math.max(0,sum2/samples-mean*mean);const exposure=1-Math.min(1,Math.abs(mean-128)/128);return Math.sqrt(variance)*1.2+edges/samples*.8+sat/samples*.22+exposure*35}
  function updateProgress(value,label){const v=Math.round(value);progressBar.value=v;progressPercent.textContent=v+'%';progressLabel.textContent=label}
  function loadVideo(blob){return new Promise((resolve,reject)=>{if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(blob);video.addEventListener('loadedmetadata',()=>resolve(),{once:true});video.addEventListener('error',()=>reject(new Error('This movie format could not be opened by the browser.')),{once:true});video.src=objectUrl;video.load()})}

  async function findFrames(){
    const title=$('movieTitle').value.trim(), historyKey='lobby-card-history:'+title.toLowerCase(), prior=JSON.parse(localStorage.getItem(historyKey)||'[]');
    const count=Math.min(54,Math.max(30,Math.round(video.duration/120)));let candidates=[];scratch.width=160;scratch.height=90;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
    for(let i=0;i<count;i++){
      const base=(i+1)/(count+1),jitter=((Math.sin((i+1)*(seed*19+3))*0.5)+0.5)/count*.7,time=(base+jitter)*video.duration;
      await seek(time);sctx.drawImage(video,0,0,scratch.width,scratch.height);const pixels=sctx.getImageData(0,0,scratch.width,scratch.height).data,sig=signature(pixels),old=prior.some(p=>distance(sig,p)<9);
      candidates.push({time,sig,score:scoreFrame(pixels)-(old?90:0)});updateProgress(8+(i+1)/count*57,'Finding strong scenes…');
    }
    candidates.sort((a,b)=>b.score-a.score);const chosen=[];
    for(const c of candidates){if(chosen.every(x=>Math.abs(x.time-c.time)>Math.max(20,video.duration*.035)&&distance(x.sig,c.sig)>10))chosen.push(c);if(chosen.length===5)break}
    if(chosen.length<5)for(const c of candidates){if(!chosen.includes(c))chosen.push(c);if(chosen.length===5)break}
    localStorage.setItem(historyKey,JSON.stringify([...prior,...chosen.map(x=>x.sig)].slice(-60)));return chosen.sort((a,b)=>a.time-b.time)
  }
  async function renderCards(frames){
    cards=[];grid.innerHTML='';const title=$('movieTitle').value.trim(),caption=new FormData(form).get('caption')==='classic';
    for(let i=0;i<frames.length;i++){
      await seek(frames[i].time);const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=2400;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,3000,2400);
      const border=135,innerW=2730,innerH=caption?1900:2130,sourceRatio=video.videoWidth/video.videoHeight,targetRatio=innerW/innerH;let sx=0,sy=0,sw=video.videoWidth,sh=video.videoHeight;
      if(sourceRatio>targetRatio){sw=video.videoHeight*targetRatio;sx=(video.videoWidth-sw)/2}else{sh=video.videoWidth/targetRatio;sy=(video.videoHeight-sh)/2}
      ctx.drawImage(video,sx,sy,sw,sh,border,border,innerW,innerH);
      if(caption){ctx.fillStyle='#17110d';ctx.fillRect(border,2035,innerW,230);ctx.fillStyle='#fff';ctx.font='700 76px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(title.toUpperCase(),1500,2125,2450);ctx.font='34px Arial';ctx.fillStyle='#d9c7aa';ctx.fillText(`LOBBY CARD ${i+1} OF 5  ·  ${formatTime(frames[i].time)}`,1500,2202)}
      const wrap=document.createElement('article');wrap.className='card-item';wrap.appendChild(canvas);const actions=document.createElement('div');actions.className='card-actions';actions.innerHTML=`<span>Card ${i+1} · ${formatTime(frames[i].time)}</span><button type="button">Download PNG</button>`;actions.querySelector('button').addEventListener('click',()=>download(canvas,fileSafe(title)+'-lobby-card-'+(i+1)+'.png'));wrap.appendChild(actions);grid.appendChild(wrap);cards.push(canvas);updateProgress(68+(i+1)*6,'Finishing card '+(i+1)+' of 5…')
    }
  }
  function formatTime(t){const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=Math.floor(t%60);return(h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(s).padStart(2,'0')}
  function fileSafe(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'movie'}
  function download(canvas,name){canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000)},'image/png')}
  async function charge(){
    const run=async()=>{const w=wallet(),active=connected(w);if(!active)throw new Error('Connect your unified wallet before ordering.');const fresh=new window.InfinityUnifiedWallet.UnifiedInfinityWallet(),fw=connected(fresh);if(!fw||fresh.balance(fw.walletId,'STAR_COIN')<1)throw new Error('This set costs 1 StarCoin. Your wallet needs at least 1.0 ⭐.');const eventId='lobby-card-order:'+Date.now().toString(36)+':'+crypto.getRandomValues(new Uint32Array(1))[0].toString(36);await fresh.append(eventId,'STAR_COIN_SPENT',{walletId:fw.walletId,assetCode:'STAR_COIN',amount:1,sourceSystem:'MOVIE-LOBBY-CARD-GENERATOR',item:'FIVE_CARD_SET',movieTitle:$('movieTitle').value.trim(),setId:eventId});fresh.state.wallets[fw.walletId].balances.STAR_COIN=Math.round((fresh.balance(fw.walletId,'STAR_COIN')-1)*100)/100;fresh.save()};return navigator.locks?navigator.locks.request('infinity-unified-wallet-rewards',run):run()
  }
  async function generate(){
    if(busy)return;busy=true;$('generateButton').disabled=true;results.hidden=true;progressPanel.hidden=false;updateProgress(2,'Opening movie…');
    try{await loadVideo(file.files[0]);if(!Number.isFinite(video.duration)||video.duration<20)throw new Error('Choose a movie at least 20 seconds long.');const frames=await findFrames();await renderCards(frames);updateProgress(98,'Saving order to wallet…');await charge();renderWallet();const setId=Date.now().toString(36).toUpperCase();$('setNumber').textContent=`Set ${setId} · five unique 3000 × 2400 PNG files`;$('resultTitle').textContent=$('movieTitle').value.trim();results.hidden=false;updateProgress(100,'Five cards ready');status.textContent='Set complete · 1 StarCoin spent.';results.scrollIntoView({behavior:'smooth',block:'start'})}catch(error){status.textContent=error.message||'The set could not be completed.';progressPanel.hidden=true}finally{busy=false;$('generateButton').disabled=false}
  }
  form.addEventListener('submit',e=>{e.preventDefault();generate()});$('anotherSet').addEventListener('click',()=>{results.hidden=true;generate()});$('downloadAll').addEventListener('click',async()=>{for(let i=0;i<cards.length;i++){download(cards[i],fileSafe($('movieTitle').value)+'-lobby-card-'+(i+1)+'.png');await new Promise(r=>setTimeout(r,350))}});
  window.addEventListener('storage',renderWallet);window.addEventListener('focus',renderWallet);renderWallet();
})();
