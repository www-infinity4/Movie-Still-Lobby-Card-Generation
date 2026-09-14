(function(){
  'use strict';

  const $ = id => document.getElementById(id);
  const form = $('cardForm');
  const file = $('movieFile');
  const video = $('sourceVideo');
  const scratch = $('analysisCanvas');
  const sctx = scratch.getContext('2d', { willReadFrequently: true });
  const status = $('status');
  const progressPanel = $('progressPanel');
  const progressBar = $('progressBar');
  const progressLabel = $('progressLabel');
  const progressPercent = $('progressPercent');
  const results = $('results');
  const grid = $('cardGrid');
  const walletButton = $('walletButton');
  const receiptNode = $('ownershipReceipt');

  let cardModels = [];
  let objectUrl = '';
  let busy = false;
  let currentSet = null;

  const HISTORY_LIMIT = 180;
  const COLLECTION_KEY = 'infinity:lobby-card-collection:v2';

  function wallet(){
    if(!window.InfinityUnifiedWallet?.UnifiedInfinityWallet) throw new Error('Unified wallet is unavailable.');
    return new window.InfinityUnifiedWallet.UnifiedInfinityWallet();
  }

  function connected(w){
    const id = w.state.currentWalletId;
    return id && w.state.wallets[id] ? w.state.wallets[id] : null;
  }

  function renderWallet(){
    try{
      const w = wallet();
      const active = connected(w);
      walletButton.textContent = active ? `Wallet · ${w.balance(active.walletId,'STAR_COIN').toFixed(1)} ⭐` : 'Connect Wallet';
    }catch(_){
      walletButton.textContent = 'Wallet unavailable';
    }
  }

  walletButton.addEventListener('click', () => {
    try{
      const w = wallet();
      if(!connected(w)){
        w.createWallet({ displayName:'Unified Infinity Wallet' });
        renderWallet();
      }else{
        location.href = 'https://www-infinity4.github.io/Mint-For-Infinity/unified-wallet.html';
      }
    }catch(_){
      status.textContent = 'The unified wallet could not be opened.';
    }
  });

  file.addEventListener('change', () => {
    $('fileName').textContent = file.files[0]?.name || 'MP4, WebM, MOV or M4V';
  });

  function seek(time){
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error('This part of the movie could not be read.')), 12000);
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, { once:true });
      video.currentTime = Math.min(Math.max(time,0), Math.max(0,video.duration-.08));
    });
  }

  function loadVideo(blob){
    return new Promise((resolve,reject) => {
      if(objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      video.addEventListener('loadedmetadata', () => resolve(), { once:true });
      video.addEventListener('error', () => reject(new Error('This movie format could not be opened by the browser.')), { once:true });
      video.src = objectUrl;
      video.load();
    });
  }

  function signature(data){
    let out = '';
    for(let gy=0; gy<6; gy++){
      for(let gx=0; gx<8; gx++){
        const x = Math.floor((gx+.5)*scratch.width/8);
        const y = Math.floor((gy+.5)*scratch.height/6);
        const i = (y*scratch.width+x)*4;
        out += Math.round((data[i]+data[i+1]+data[i+2])/3/32).toString(16);
      }
    }
    return out;
  }

  function distance(a,b){
    let d=0;
    for(let i=0;i<Math.min(a.length,b.length);i++) d += a[i]===b[i] ? 0 : 1;
    return d;
  }

  function frameStats(data){
    let sum=0, sum2=0, edges=0, sat=0, samples=0;
    for(let y=1;y<scratch.height;y+=2){
      for(let x=1;x<scratch.width;x+=2){
        const i=(y*scratch.width+x)*4;
        const l=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
        const j=(y*scratch.width+x-1)*4;
        const k=((y-1)*scratch.width+x)*4;
        const left=.2126*data[j]+.7152*data[j+1]+.0722*data[j+2];
        const up=.2126*data[k]+.7152*data[k+1]+.0722*data[k+2];
        sum+=l;
        sum2+=l*l;
        edges+=Math.abs(l-left)+Math.abs(l-up);
        sat+=Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2]);
        samples++;
      }
    }
    const mean=sum/Math.max(1,samples);
    const variance=Math.max(0,sum2/Math.max(1,samples)-mean*mean);
    const exposure=1-Math.min(1,Math.abs(mean-128)/128);
    return {
      mean,
      contrast:Math.sqrt(variance),
      edge:edges/Math.max(1,samples),
      saturation:sat/Math.max(1,samples),
      score:Math.sqrt(variance)*1.2+(edges/Math.max(1,samples))*.8+(sat/Math.max(1,samples))*.22+exposure*35
    };
  }

  function updateProgress(value,label){
    const v=Math.round(value);
    progressBar.value=v;
    progressPercent.textContent=v+'%';
    progressLabel.textContent=label;
  }

  function readFrameData(){
    sctx.drawImage(video,0,0,scratch.width,scratch.height);
    return sctx.getImageData(0,0,scratch.width,scratch.height).data;
  }

  function pixelDifference(a,b){
    let total=0, samples=0;
    for(let i=0;i<Math.min(a.length,b.length);i+=16){
      total += Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]);
      samples += 3;
    }
    return total/Math.max(1,samples);
  }

  async function faceCount(){
    if(!('FaceDetector' in window)) return null;
    try{
      const detector = new FaceDetector({ fastMode:true, maxDetectedFaces:8 });
      const faces = await detector.detect(scratch);
      return faces.length;
    }catch(_){
      return null;
    }
  }

  async function enrichFrame(frame){
    await seek(frame.time);
    const base = new Uint8ClampedArray(readFrameData());
    const stats = frameStats(base);
    const faces = await faceCount();
    const laterTime = Math.min(video.duration-.1, frame.time+.55);
    await seek(laterTime);
    const later = new Uint8ClampedArray(readFrameData());
    const motion = pixelDifference(base,later);
    return { ...frame, stats, faces, motion };
  }

  function sceneDescription(frame){
    const fraction = frame.time/Math.max(1,video.duration);
    const where = fraction < .18 ? 'Opening sequence' : fraction < .42 ? 'Early-film scene' : fraction < .68 ? 'Mid-film scene' : fraction < .88 ? 'Late-film scene' : 'Final sequence';
    const palette = frame.stats.saturation < 12 ? 'black-and-white' : frame.stats.saturation < 28 ? 'muted-color' : 'color';
    const light = frame.stats.mean < 72 ? 'low-key' : frame.stats.mean > 178 ? 'bright' : 'balanced-light';
    const action = frame.motion > 22 ? 'strong motion' : frame.motion > 11 ? 'moderate movement' : 'a composed still moment';
    const detail = frame.stats.edge > 38 ? 'dense visual detail' : frame.stats.edge > 24 ? 'clear environmental detail' : 'a simple graphic composition';
    const people = frame.faces == null ? '' : frame.faces === 0 ? 'No clear faces detected; ' : frame.faces === 1 ? 'Single-character composition; ' : `${frame.faces}-character composition; `;
    return `${where}. ${people}${light} ${palette} image with ${action} and ${detail}.`;
  }

  async function findFrames(){
    const title=$('movieTitle').value.trim();
    const historyKey='lobby-card-history:v2:'+title.toLowerCase();
    const prior=JSON.parse(localStorage.getItem(historyKey)||'[]');
    const priorSigs=prior.map(p=>typeof p==='string'?p:p.sig).filter(Boolean);
    const priorTimes=prior.map(p=>typeof p==='object'?Number(p.time):-99999).filter(Number.isFinite);
    const count=Math.min(72,Math.max(36,Math.round(video.duration/95)));
    const candidates=[];
    scratch.width=160;
    scratch.height=90;
    const seed=crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;

    for(let i=0;i<count;i++){
      const base=(i+1)/(count+1);
      const wave=(Math.sin((i+1)*(seed*23+4))*0.5)+0.5;
      const jitter=(wave-.5)/count*.9;
      const time=Math.min(video.duration-.1,Math.max(.1,(base+jitter)*video.duration));
      await seek(time);
      const pixels=readFrameData();
      const sig=signature(pixels);
      const stats=frameStats(pixels);
      const oldSig=priorSigs.some(p=>distance(sig,p)<10);
      const oldTime=priorTimes.some(t=>Math.abs(time-t)<Math.max(25,video.duration*.025));
      candidates.push({time,sig,stats,score:stats.score-(oldSig?120:0)-(oldTime?65:0)});
      updateProgress(8+(i+1)/count*50,'Scanning the movie for strong scenes…');
    }

    candidates.sort((a,b)=>b.score-a.score);
    const chosen=[];
    const minGap=Math.max(24,video.duration*.045);
    for(const c of candidates){
      if(chosen.every(x=>Math.abs(x.time-c.time)>minGap && distance(x.sig,c.sig)>11)) chosen.push(c);
      if(chosen.length===5) break;
    }
    if(chosen.length<5){
      for(const c of candidates){
        if(!chosen.includes(c) && chosen.every(x=>Math.abs(x.time-c.time)>Math.max(12,minGap*.45))){
          chosen.push(c);
          if(chosen.length===5) break;
        }
      }
    }
    if(chosen.length<5){
      for(const c of candidates){
        if(!chosen.includes(c)){
          chosen.push(c);
          if(chosen.length===5) break;
        }
      }
    }

    const enriched=[];
    for(let i=0;i<chosen.length;i++){
      enriched.push(await enrichFrame(chosen[i]));
      updateProgress(60+(i+1)*1.4,'Reading the selected scenes…');
    }

    const record=[...prior,...enriched.map(x=>({sig:x.sig,time:Math.round(x.time)}))].slice(-HISTORY_LIMIT);
    localStorage.setItem(historyKey,JSON.stringify(record));
    return enriched.sort((a,b)=>a.time-b.time);
  }

  function formatTime(t){
    const h=Math.floor(t/3600), m=Math.floor(t%3600/60), s=Math.floor(t%60);
    return (h?h+':':'')+String(m).padStart(h?2:1,'0')+':'+String(s).padStart(2,'0');
  }

  function fileSafe(s){
    return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'movie';
  }

  function wrapText(ctx,text,maxWidth,maxLines){
    const words=String(text||'').split(/\s+/).filter(Boolean);
    const lines=[];
    let line='';
    for(const word of words){
      const trial=line?line+' '+word:word;
      if(ctx.measureText(trial).width<=maxWidth || !line){
        line=trial;
      }else{
        lines.push(line);
        line=word;
        if(lines.length===maxLines-1) break;
      }
    }
    if(line && lines.length<maxLines) lines.push(line);
    if(lines.length===maxLines && words.length){
      let last=lines[maxLines-1];
      while(ctx.measureText(last+'…').width>maxWidth && last.length>1) last=last.slice(0,-1);
      lines[maxLines-1]=last.replace(/[ ,;:-]+$/,'')+'…';
    }
    return lines;
  }

  async function drawCard(model){
    const {canvas,frame,index}=model;
    const ctx=canvas.getContext('2d');
    const title=$('movieTitle').value.trim();
    const caption=new FormData(form).get('caption')==='classic';
    const border=140;
    const innerW=2720;
    const imageH=caption?1740:2120;

    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,3000,2400);

    await seek(frame.time);
    const sourceRatio=video.videoWidth/video.videoHeight;
    const targetRatio=innerW/imageH;
    let sx=0,sy=0,sw=video.videoWidth,sh=video.videoHeight;
    if(sourceRatio>targetRatio){
      sw=video.videoHeight*targetRatio;
      sx=(video.videoWidth-sw)/2;
    }else{
      sh=video.videoWidth/targetRatio;
      sy=(video.videoHeight-sh)/2;
    }
    ctx.drawImage(video,sx,sy,sw,sh,border,border,innerW,imageH);

    if(caption){
      ctx.fillStyle='#17110d';
      ctx.fillRect(border,1880,innerW,220);
      ctx.fillStyle='#fff';
      ctx.font='700 76px Georgia';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillText(title.toUpperCase(),1500,1963,2420);

      ctx.font='31px Arial';
      ctx.fillStyle='#dcc8a9';
      ctx.fillText(`LOBBY CARD ${index+1} OF 5  ·  ${formatTime(frame.time)}  ·  ${currentSet?.setId||'UNPURCHASED SET'}`,1500,2042,2460);

      ctx.fillStyle='#fff';
      ctx.fillRect(border,2100,innerW,160);
      ctx.fillStyle='#241b15';
      ctx.font='34px Georgia';
      ctx.textAlign='left';
      ctx.textBaseline='top';
      const lines=wrapText(ctx,model.description,innerW-110,2);
      lines.forEach((line,lineIndex)=>ctx.fillText(line,border+55,2126+lineIndex*43,innerW-110));
    }
  }

  async function renderCards(frames){
    cardModels=[];
    grid.innerHTML='';
    const title=$('movieTitle').value.trim();

    for(let i=0;i<frames.length;i++){
      const canvas=document.createElement('canvas');
      canvas.width=3000;
      canvas.height=2400;
      const model={ canvas, frame:frames[i], index:i, description:sceneDescription(frames[i]) };
      cardModels.push(model);
      await drawCard(model);

      const wrap=document.createElement('article');
      wrap.className='card-item';
      wrap.appendChild(canvas);

      const editor=document.createElement('div');
      editor.className='card-editor';
      editor.innerHTML=`<div class="card-actions"><span>Card ${i+1} · ${formatTime(frames[i].time)}</span><button type="button">Download PNG</button></div><label>Scene description<textarea rows="3" maxlength="180"></textarea></label><small>Automatic visual description — edit it if you want a more exact scene caption before downloading.</small>`;
      const textarea=editor.querySelector('textarea');
      textarea.value=model.description;
      let redrawTimer=0;
      textarea.addEventListener('input',()=>{
        model.description=textarea.value.trim()||sceneDescription(model.frame);
        clearTimeout(redrawTimer);
        redrawTimer=setTimeout(()=>drawCard(model),180);
      });
      editor.querySelector('button').addEventListener('click',()=>download(canvas,fileSafe(title)+'-lobby-card-'+(i+1)+'.png'));
      wrap.appendChild(editor);
      grid.appendChild(wrap);
      updateProgress(68+(i+1)*5,'Finishing lobby card '+(i+1)+' of 5…');
    }
  }

  function download(canvas,name){
    canvas.toBlob(blob=>{
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download=name;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    },'image/png');
  }

  async function sha256(text){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }

  async function createSetIdentity(frames){
    const title=$('movieTitle').value.trim();
    const nonce=Array.from(crypto.getRandomValues(new Uint32Array(4))).map(n=>n.toString(36)).join('');
    const fingerprint=await sha256(JSON.stringify({
      title:title.toLowerCase(),
      file:file.files[0]?.name||'',
      duration:Math.round(video.duration*1000),
      nonce,
      frames:frames.map(f=>({time:Math.round(f.time*1000),sig:f.sig}))
    }));
    return {
      setId:'LC-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+fingerprint.slice(0,10).toUpperCase(),
      fingerprint,
      nonce
    };
  }

  function collection(){
    try{return JSON.parse(localStorage.getItem(COLLECTION_KEY)||'[]')}catch{return[]}
  }

  function saveCollection(receipt){
    const items=collection();
    items.unshift(receipt);
    localStorage.setItem(COLLECTION_KEY,JSON.stringify(items.slice(0,250)));
  }

  async function charge(setMeta){
    const run=async()=>{
      const w=wallet();
      const active=connected(w);
      if(!active) throw new Error('Connect your unified wallet before ordering.');

      const fresh=new window.InfinityUnifiedWallet.UnifiedInfinityWallet();
      const fw=connected(fresh);
      if(!fw || fresh.balance(fw.walletId,'STAR_COIN')<1) throw new Error('This set costs 1 StarCoin. Your wallet needs at least 1.0 ⭐.');

      const eventId='lobby-card-order:'+setMeta.setId.toLowerCase();
      const frames=cardModels.map(m=>({
        card:m.index+1,
        timestampSeconds:Number(m.frame.time.toFixed(3)),
        signature:m.frame.sig,
        description:m.description
      }));

      await fresh.append(eventId,'STAR_COIN_SPENT',{
        walletId:fw.walletId,
        assetCode:'STAR_COIN',
        amount:1,
        sourceSystem:'MOVIE-LOBBY-CARD-GENERATOR',
        item:'FIVE_CARD_SET',
        movieTitle:$('movieTitle').value.trim(),
        setId:setMeta.setId,
        uniquenessFingerprint:setMeta.fingerprint,
        frames
      });

      fresh.state.wallets[fw.walletId].balances.STAR_COIN=Math.round((fresh.balance(fw.walletId,'STAR_COIN')-1)*100)/100;
      fresh.save();

      await fresh.append(eventId+':owned','LOBBY_CARD_SET_OWNED',{
        walletId:fw.walletId,
        setId:setMeta.setId,
        movieTitle:$('movieTitle').value.trim(),
        uniquenessFingerprint:setMeta.fingerprint,
        cardCount:5,
        format:'10x8 landscape PNG 300 DPI',
        frames,
        rightsScope:'Generated lobby-card set ownership record only; underlying movie rights remain with their lawful owner.'
      });

      return {
        walletId:fw.walletId,
        walletName:fw.displayName||'Infinity Wallet',
        balance:fresh.balance(fw.walletId,'STAR_COIN'),
        eventId
      };
    };
    return navigator.locks ? navigator.locks.request('infinity-unified-wallet-rewards',run) : run();
  }

  function renderReceipt(receipt){
    if(!receiptNode) return;
    receiptNode.hidden=false;
    receiptNode.innerHTML=`<strong>Ownership receipt</strong><span>${receipt.setId}</span><span>${receipt.walletName}</span><span>${receipt.movieTitle}</span><small>Fingerprint ${receipt.fingerprint.slice(0,24)}… · 5 unique lobby cards · purchased ${new Date(receipt.createdAt).toLocaleString()}</small>`;
  }

  async function refreshCardsWithSetId(){
    for(const model of cardModels) await drawCard(model);
  }

  async function generate(){
    if(busy) return;
    if(!file.files[0]){status.textContent='Choose a movie file first.';return;}
    busy=true;
    $('generateButton').disabled=true;
    results.hidden=true;
    if(receiptNode) receiptNode.hidden=true;
    progressPanel.hidden=false;
    updateProgress(2,'Opening movie…');

    try{
      await loadVideo(file.files[0]);
      if(!Number.isFinite(video.duration)||video.duration<20) throw new Error('Choose a movie at least 20 seconds long.');

      const frames=await findFrames();
      const setMeta=await createSetIdentity(frames);
      currentSet=setMeta;

      await renderCards(frames);
      updateProgress(95,'Recording ownership and charging 1 StarCoin…');
      const purchase=await charge(setMeta);

      await refreshCardsWithSetId();
      renderWallet();

      const receipt={
        setId:setMeta.setId,
        fingerprint:setMeta.fingerprint,
        movieTitle:$('movieTitle').value.trim(),
        ownerWalletId:purchase.walletId,
        walletName:purchase.walletName,
        createdAt:new Date().toISOString(),
        sourceFile:file.files[0]?.name||'local movie',
        durationSeconds:Number(video.duration.toFixed(3)),
        cards:cardModels.map(m=>({card:m.index+1,timestampSeconds:Number(m.frame.time.toFixed(3)),signature:m.frame.sig,description:m.description}))
      };
      saveCollection(receipt);
      renderReceipt(receipt);

      $('setNumber').textContent=`${receipt.setId} · five unique 3000 × 2400 PNG files · ownership receipt recorded`;
      $('resultTitle').textContent=$('movieTitle').value.trim();
      results.hidden=false;
      updateProgress(100,'Five unique cards ready');
      status.textContent=`Set complete · 1 StarCoin spent · ${receipt.setId} added to your collection.`;
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      status.textContent=error.message||'The set could not be completed.';
      progressPanel.hidden=true;
    }finally{
      busy=false;
      $('generateButton').disabled=false;
    }
  }

  form.addEventListener('submit',e=>{e.preventDefault();generate();});
  $('anotherSet').addEventListener('click',()=>{results.hidden=true;generate();});
  $('downloadAll').addEventListener('click',async()=>{
    for(let i=0;i<cardModels.length;i++){
      await drawCard(cardModels[i]);
      download(cardModels[i].canvas,fileSafe($('movieTitle').value)+'-'+(currentSet?.setId||'set').toLowerCase()+'-lobby-card-'+(i+1)+'.png');
      await new Promise(r=>setTimeout(r,350));
    }
  });

  window.addEventListener('storage',renderWallet);
  window.addEventListener('focus',renderWallet);
  renderWallet();
})();