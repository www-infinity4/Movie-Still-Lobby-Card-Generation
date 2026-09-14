(function(){
  'use strict';
  const GUEST='starquest_guest_profile_v1';
  const SESSION='starquest_session';
  const USERS='starquest_users';

  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));

  function store(){
    const session=read(SESSION,null);
    const users=read(USERS,{});
    if(session&&session.key&&users&&users[session.key]){
      return {key:session.key,profile:users[session.key],save(profile){users[session.key]=profile;write(USERS,users)}};
    }
    const profile=read(GUEST,{key:'__guest__',username:'Guest',tokens:0,shareCount:0,pendingShareCredits:0,shareEvents:[],ledger:[],watchHistory:[],watchPositions:{},unlockedContent:{}});
    return {key:profile.key||'__guest__',profile,save(profile){write(GUEST,profile)}};
  }

  function normalize(profile){
    const p=profile&&typeof profile==='object'?profile:{};
    p.key=p.key||'__guest__';
    p.username=p.username||'Guest';
    p.tokens=Math.max(0,Number(p.tokens)||0);
    p.ledger=Array.isArray(p.ledger)?p.ledger:[];
    p.shareEvents=Array.isArray(p.shareEvents)?p.shareEvents:[];
    p.pendingShareCredits=Math.max(0,Number(p.pendingShareCredits)||0);
    return p;
  }

  class UnifiedInfinityWallet {
    constructor(){
      const s=store(),p=normalize(s.profile);
      this._store=s;
      this._profile=p;
      this.state={
        currentWalletId:s.key,
        wallets:{
          [s.key]:{
            walletId:s.key,
            displayName:p.username,
            balances:{STAR_COIN:p.tokens}
          }
        }
      };
    }
    createWallet(){
      return this.state.wallets[this.state.currentWalletId];
    }
    balance(walletId,assetCode){
      if(String(assetCode||'').toUpperCase()!=='STAR_COIN') return 0;
      return Number(this.state.wallets[walletId]?.balances?.STAR_COIN||0);
    }
    async append(eventId,type,payload,timestamp){
      const when=timestamp?Date.parse(timestamp):Date.now();
      if(this._profile.ledger.some(e=>e.id===eventId)) throw new Error('Duplicate wallet event.');
      const amount=type==='STAR_COIN_SPENT'?-Math.abs(Number(payload?.amount)||0):0;
      this._profile.ledger.push({
        id:eventId,
        type:type==='STAR_COIN_SPENT'?'lobby_card_purchase':'lobby_card_set_owned',
        amount,
        balance:Number(this.state.wallets[this.state.currentWalletId].balances.STAR_COIN||0),
        source:'MOVIE-LOBBY-CARD-GENERATOR',
        setId:payload?.setId||null,
        movieTitle:payload?.movieTitle||null,
        uniquenessFingerprint:payload?.uniquenessFingerprint||null,
        payload,
        createdAt:Number.isFinite(when)?when:Date.now()
      });
      this._profile.ledger=this._profile.ledger.slice(-700);
      this._sync();
      return {eventId,type,payload};
    }
    save(){
      this._sync();
      return this.state;
    }
    _sync(){
      const id=this.state.currentWalletId;
      this._profile.tokens=Math.max(0,Number(this.state.wallets[id]?.balances?.STAR_COIN)||0);
      this._store.save(this._profile);
      window.dispatchEvent(new CustomEvent('controlphi:wallet-change',{detail:{balance:this._profile.tokens,source:'lobby-card-generator'}}));
      if(window.ControlPhi?.refreshWallet) window.ControlPhi.refreshWallet();
    }
  }

  window.InfinityUnifiedWallet={UnifiedInfinityWallet};

  function wireWalletButton(){
    const button=document.getElementById('walletButton');
    if(!button||button.dataset.controlPhiWalletBridge==='1')return;
    button.dataset.controlPhiWalletBridge='1';
    button.addEventListener('click',event=>{
      const shared=document.getElementById('controlPhiWalletButton');
      if(!shared)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      shared.click();
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wireWalletButton,{once:true});
  else wireWalletButton();
})();