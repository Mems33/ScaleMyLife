'use strict';
var $ = function(s,el){ return (el||document).querySelector(s); };
var A = RPG.actions;
var state = RPG.load(localStorage);
var tab='today', shopTab='market', pendingMood=null, pendingQuality=3;
var pendingNote=null, pendingHours=null; // journal drafts, preserved across re-renders
var editDays=[];                 // weekday picker state inside the edit-quest modal
var focusSpan=7;                 // Stats focus chart: 7 = week, 30 = month
var boardView='global';          // Stats leaderboard: 'global' | 'friends'
var lastBoardRows=[], lastBoardMe=null;   // cached so a board row can open a friend's profile
var SKILL_PALETTE=['#5aa2ff','#f5c542','#3ddc84','#b07bff','#ff7854','#59c2ff','#ff5fa2','#7bd88f','#ffb454','#a78bfa','#4dd0e1','#ffd166'];
function skillColorById(id){
  if(id==='__none') return '#6c6690';
  var idx=state.skills.findIndex(function(s){return s.id===id;});
  return SKILL_PALETTE[(idx>=0?idx:0)%SKILL_PALETTE.length];
}
function skillLabelById(id){
  if(id==='__none') return '· untagged';
  var s=state.skills.find(function(k){return k.id===id;}); return s? s.icon+' '+esc(s.name) : '?';
}
function fmtHm(min){ var h=Math.floor(min/60), m=Math.round(min%60); return (h?h+'h ':'')+m+'m'; }
var focusMode={work:50,brk:10,custom:false};
var navAnim=false, navTimer=null;   // cascade the view only on tab changes, not in-tab updates
var lastTap={x:0,y:0};               // where the user last tapped - anchors the completion burst
try{ lastTap={x:window.innerWidth/2,y:window.innerHeight*0.42}; }catch(e){}
document.addEventListener('pointerdown',function(e){ if(e.clientX||e.clientY){ lastTap={x:e.clientX,y:e.clientY}; } if(typeof unlockAudio==='function') unlockAudio(); },true);
function reduceMotion(){ try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; } }
function popCheck(x,y){
  if(reduceMotion()) return;
  var b=document.createElement('div'); b.className='cburst'; b.style.left=(x||lastTap.x)+'px'; b.style.top=(y||lastTap.y)+'px';
  var html='<span class="cb-ring"></span><span class="cb-core">✓</span>';
  for(var i=0;i<8;i++){ var a=(i/8)*6.2832; html+='<i style="--tx:'+(Math.cos(a)*30).toFixed(1)+'px;--ty:'+(Math.sin(a)*30).toFixed(1)+'px"></i>'; }
  b.innerHTML=html; document.body.appendChild(b);
  setTimeout(function(){ b.remove(); }, 720);
}
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var MON_ORDER=[1,2,3,4,5,6,0];   // display weekdays Monday-first -> letters M T W T F S S
var pendingDays=[];              // weekday ints picked for a new recurring quest
var pickedPath='general';        // onboarding path

var RANK_COLORS={E:'#9a94b8',D:'#5aa2ff',C:'#3ddc84',B:'#b07bff',A:'#ff9d47',S:'#f5c542',SS:'#ff5fa2'};
var THEMES={
  dungeon:  {name:'Dungeon',  bg:'#12101f',panel:'#1b1830',panel2:'#221e3d',line:'#2e2950',accent:'#f5c542'},
  synthwave:{name:'Synthwave',bg:'#170b22',panel:'#221030',panel2:'#2c1440',line:'#45215e',accent:'#ff5fa2'},
  forest:   {name:'Forest',   bg:'#0d1712',panel:'#14231b',panel2:'#1a2f23',line:'#28492f',accent:'#7bd88f'},
  crimson:  {name:'Crimson',  bg:'#1a0d12',panel:'#26141b',panel2:'#321a23',line:'#4a2532',accent:'#ff7854'},
  ocean:    {name:'Ocean',    bg:'#0a1220',panel:'#101c30',panel2:'#15263f',line:'#22395c',accent:'#59c2ff'},
  daylight: {name:'Daylight', bg:'#f1ece1',panel:'#ffffff',panel2:'#f5f0e6',line:'#d9cfba',accent:'#b4740a',
             ink:'#20192b',muted:'#5c5468',light:true}
};
var MUSIC={
  none:{name:'🔇 No music',id:null},
  lofi:{name:'🎧 Lofi Girl radio',id:'jfKfPfyJRdk'},
  synth:{name:'🌆 Synthwave radio',id:'4xDzrJKXOOY'},
  custom:{name:'🔗 Custom YouTube URL',id:null}
};

function applyTheme(){
  var t=THEMES[(state&&state.settings.theme)||'dungeon']||THEMES.dungeon;
  var r=document.documentElement.style;
  r.setProperty('--bg',t.bg); r.setProperty('--panel',t.panel);
  r.setProperty('--panel2',t.panel2); r.setProperty('--line',t.line); r.setProperty('--gold',t.accent);
  r.setProperty('--ink',t.ink||'#e8e4ff'); r.setProperty('--muted',t.muted||'#8f88b8');
  document.body.classList.toggle('light',!!t.light);
  if(window.SMLGradient) window.SMLGradient.setColors();
}
/* Legend mode: at rank S/SS the whole interface shifts to a refined, gilded look */
function applyLegend(){
  var w=$('#wrap'); if(!w||!state) return;
  var code=RPG.rankFor(state.hero.level).code;
  w.classList.toggle('legend', code==='S'||code==='SS');
  w.classList.toggle('ss', code==='SS');
}
function persist(){
  state.updatedAt=new Date().toISOString();
  RPG.save(state, localStorage);
  scheduleCloudPush();
}

/* ---------- cloud sync (Supabase via cloud.js) ---------- */
var cloudPushTimer=null;
function cloudOn(){ return typeof SMLCloud!=='undefined' && SMLCloud.configured() && !!SMLCloud.session(); }
function boardProfile(){
  var w=RPG.weekStats(state), r=RPG.rankFor(state.hero.level);
  return { name:state.hero.name, avatar:state.hero.avatar, level:state.hero.level, rank:r.code,
    weekXp:w.tot.xp, bestStreak:state.hero.bestStreak||0, ascension:state.hero.ascension||0 };
}
function pushCloudNow(){
  if(!cloudOn()) return;
  SMLCloud.push(state);                                                     // full save (private)
  if(state.settings.board || state.settings.friends)                        // tiny profile snapshot
    SMLCloud.pushBoard(boardProfile(), !!state.settings.board);             // on_board only if opted in
}
function scheduleCloudPush(){
  if(!cloudOn()) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer=setTimeout(pushCloudNow, 4000); // debounced; fails soft offline
}
/* flush any pending push immediately (on tab hide / close) so a quick exit
   after levelling up doesn't strand the newest save on this device only */
function flushCloudPush(){
  if(!cloudOn()) return;
  if(cloudPushTimer){ clearTimeout(cloudPushTimer); cloudPushTimer=null; }
  try{ pushCloudNow(); }catch(e){}
}
/* which save is more advanced: +1 cloud, -1 local, 0 tie (then break by time) */
function cloudAheadOf(cloudData){
  var p=RPG.compareProgress(cloudData, state);
  if(p!==0) return p;
  return (cloudData.updatedAt||'') > (state.updatedAt||'') ? 1 : ((cloudData.updatedAt||'') < (state.updatedAt||'') ? -1 : 0);
}
function adoptCloud(data){
  localStorage.setItem(RPG.KEY+'.pre-cloud', JSON.stringify(state)); // safety copy
  state=RPG.migrate(data);
  RPG.save(state, localStorage);   // persist locally WITHOUT re-pushing (it's already the cloud's)
  applyTheme(); render();
}
/* on boot with a live session: adopt the cloud save if it is more advanced */
function cloudBootPull(){
  if(!cloudOn() || !state) return;
  SMLCloud.pull().then(function(r){
    if(!r.ok || !r.exists || !r.data || !r.data.hero) return;
    if(cloudAheadOf(r.data) > 0){
      adoptCloud(r.data);
      toast('☁️ <span class="p">Loaded your more recent cloud save</span>');
    }
  });
}
function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/* ---------- sound ---------- */
var AC=null;
function beep(freq,when,dur,type,vol){
  if(!state || !state.settings.sound) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    if(AC.state==='suspended' && AC.resume) AC.resume();  // browsers suspend it when idle/backgrounded - wake it so alarms actually ring
    var t=AC.currentTime+when, o=AC.createOscillator(), g=AC.createGain();
    o.type=type||'square'; o.frequency.value=freq;
    g.gain.setValueAtTime(vol||0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+dur);
  }catch(e){}
}
/* keep the audio context unlocked: browsers only allow it to run after a user
   gesture, and re-suspend it when idle. Resume on any tap so the break alarm rings. */
function unlockAudio(){ try{ if(!AC && (window.AudioContext||window.webkitAudioContext)) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC&&AC.state==='suspended'&&AC.resume) AC.resume(); }catch(e){} }
function buzz(p){ try{ if(state&&state.settings.sound&&navigator.vibrate) navigator.vibrate(p); }catch(e){} }
var SND={
  earn:function(){ beep(660,0,.09); beep(880,.09,.12); buzz(12); },
  levelup:function(){ [523,659,784,1047].forEach(function(f,i){ beep(f,i*.12,.22,'square',.07); }); buzz([20,40,20,40,90]); },
  rankup:function(){ [392,523,659,784,1047,1319,1568].forEach(function(f,i){ beep(f,i*.13,.3,'square',.08); }); buzz([30,50,30,50,30,50,120]); },
  dmg:function(){ beep(120,0,.28,'sawtooth',.09); beep(90,.1,.25,'sawtooth',.07); buzz([60,40,80]); },
  buy:function(){ beep(880,0,.08,'triangle',.08); beep(1320,.08,.14,'triangle',.08); buzz(15); },
  chest:function(){ [660,880,1174,1568].forEach(function(f,i){ beep(f,i*.09,.14,'triangle',.08); }); buzz([15,25,15,25,40]); },
  ach:function(){ [784,988,1175].forEach(function(f,i){ beep(f,i*.1,.18,'square',.06); }); buzz([10,30,25]); },
  brk:function(){ [880,660,523].forEach(function(f,i){ beep(f,i*.15,.3,'triangle',.07); }); buzz(25); },
  resume:function(){ [523,784,1047].forEach(function(f,i){ beep(f,i*.1,.18,'triangle',.08); }); buzz(25); },
  /* a warm, coherent little ringtone for "break time" - two rising bell arpeggios */
  alarm:function(){
    var seq=[523,659,784,1047,784,1047];
    seq.forEach(function(f,i){ beep(f,i*.16,.28,'triangle',.09); });
    seq.forEach(function(f,i){ beep(f,1.15+i*.16,.28,'triangle',.09); });
    buzz([120,80,120,80,200]);
  }
};

/* ---------- visual fx ---------- */
function toast(parts, cls){
  var t=document.createElement('div'); t.className='toast'+(cls?' '+cls:'');
  t.innerHTML=parts; $('#toasts').appendChild(t);
  setTimeout(function(){ t.remove(); }, 3000);
}
function sparks(ch){
  for(var i=0;i<5;i++){
    var s=document.createElement('div'); s.className='spark'; s.textContent=ch;
    s.style.left=(45+Math.random()*10)+'%'; s.style.top=(30+Math.random()*20)+'%';
    s.style.animationDelay=(i*0.06)+'s';
    document.body.appendChild(s); setTimeout(function(el){return function(){el.remove();}}(s),1300);
  }
}
function confetti(gold){
  var colors=gold?['#f5c542','#ffe08a','#fff2c4','#cf9f22']:['#f5c542','#3ddc84','#8f7bff','#ff5470','#5aa2ff','#ff9d47'];
  for(var i=0;i<(gold?40:28);i++){
    var c=document.createElement('div'); c.className='confetti';
    c.style.left=(15+Math.random()*70)+'%';
    c.style.background=colors[i%colors.length];
    c.style.animationDuration=(1.4+Math.random()*1.4)+'s';
    c.style.animationDelay=(Math.random()*.4)+'s';
    if(i%3===0) c.style.borderRadius='50%';
    document.body.appendChild(c); setTimeout(function(el){return function(){el.remove();}}(c),3400);
  }
}
function flyCoins(n){
  var target=$('#coinCounter'); if(!target) return;
  var r=target.getBoundingClientRect();
  var count=Math.min(6,Math.max(2,Math.round(n/15)));
  for(var i=0;i<count;i++){
    (function(i){
      var c=document.createElement('div'); c.className='flycoin'; c.textContent='💰';
      c.style.left=(window.innerWidth/2-40+Math.random()*80)+'px';
      c.style.top=(window.innerHeight*0.45)+'px';
      document.body.appendChild(c);
      setTimeout(function(){ c.style.left=(r.left+r.width/2)+'px'; c.style.top=r.top+'px'; c.style.opacity='0'; c.style.transform='scale(.5)'; }, 30+i*90);
      setTimeout(function(){ c.remove(); var cc=$('#coinCounter'); if(cc){cc.classList.remove('pop'); void cc.offsetWidth; cc.classList.add('pop');} }, 780+i*90);
    })(i);
  }
}
function shake(){ var w=$('#wrap'); w.classList.remove('shake'); void w.offsetWidth; w.classList.add('shake'); }
function hurtBar(){ var b=$('.bar.hp'); if(b){ b.classList.add('hurt'); setTimeout(function(){ b.classList.remove('hurt'); },600); } }

function fx(res){
  if(!res) return;
  var bits=[];
  if(res.xp>0) bits.push('<span class="p">+'+res.xp+' XP</span>');
  if(res.coins>0) bits.push('<span class="c">+'+res.coins+' 💰</span>');
  if(res.coins<0) bits.push('<span class="c">'+res.coins+' 💰</span>');
  if(res.hp>0) bits.push('<span class="hg">+'+res.hp+' HP</span>');
  if(res.hp<0) bits.push('<span class="h">'+res.hp+' HP</span>');
  if(res.mult>1.001) bits.push('<span style="color:var(--orange)">×'+res.mult.toFixed(2)+' streak</span>');
  if(res.wounded) bits.push('<span class="h">🩸 ×0.5 wounded</span>');
  if(bits.length) toast(bits.join(''), (res.hp<0)?'dmg':'');
  if(res.hp<0){ shake(); hurtBar(); SND.dmg(); sparks('💢'); }
  else if(res.coins<0){ SND.buy(); sparks('🛍️'); }
  else if(res.xp>0){ SND.earn(); sparks('✨'); if(res.coins>0) flyCoins(res.coins); }
  (res.skillUps||[]).forEach(function(u){ toast('<span class="p">'+u.icon+' '+esc(u.name)+' → Lv.'+u.level+'</span>'); });
  if(res.newRank){ rankUp(res.newRank, res.levelUps[res.levelUps.length-1]); }
  else if(res.levelUps && res.levelUps.length){ levelUp(res.levelUps[res.levelUps.length-1]); }
  if(res.ko) defeatScreen(res);
}
function announceAchievements(list){
  (list||[]).forEach(function(a,i){
    setTimeout(function(){ toast('🏆 <span style="color:var(--purple)">'+a.icon+' '+esc(a.name)+'</span> unlocked!','ach'); SND.ach(); }, 400+i*700);
  });
}
function levelUp(lv){
  SND.levelup(); confetti();
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="big">⬆ LEVEL UP!</div>'+
    '<div class="sub">'+esc(state.hero.name)+' reached <b style="color:var(--gold)">Level '+lv+'</b></div>'+
    '<div class="sub" style="color:var(--good)">❤️ HP fully restored</div>'+
    '<button class="btn go" onclick="closeOverlay()">Continue ▶</button></div>';
}
function rankUp(rank, lv){
  SND.rankup(); confetti(true); setTimeout(function(){confetti(true);},600);
  var col=RANK_COLORS[rank.code]||'#f5c542';
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="big">🎖 RANK UP</div>'+
    '<div class="rankbig" style="color:'+col+'">'+rank.code+'</div>'+
    '<div class="rankname" style="color:'+col+'">'+esc(rank.name).toUpperCase()+'</div>'+
    '<div class="sub">'+esc(state.hero.name)+' hit Level '+lv+' and earned a new class.</div>'+
    '<div class="sub" style="color:var(--good)">❤️ HP fully restored · badge added</div>'+
    '<button class="btn go" onclick="closeOverlay()">Rise ▶</button></div>';
}
function defeatScreen(res){
  SND.dmg(); shake(); hurtBar(); if(!reduceMotion()) sparks('💀');
  var o=$('#overlay'); o.className='show defeat';
  var cost=(res&&res.cost)||0;
  o.innerHTML='<div class="levelbox defeatbox"><div class="big" style="color:var(--hp)">💀 DEFEATED</div>'+
    '<div class="sub">The monsters dragged you down. You’re <b style="color:var(--hp)">Downed</b>.</div>'+
    (cost>0?'<div class="sub" style="color:var(--hp)">You lost <b>'+cost+' 💰</b> in the fall.</div>':'')+
    '<div class="sub" style="color:var(--muted)">While downed: <b>half XP</b> and <b>no coins</b> earned. Rest back to <b>full HP</b> - sleep well or heal at the 🛏️ Hotel - to <b>rise</b>.</div>'+
    '<button class="btn go" onclick="closeOverlay();go(\'market\');shopTab=\'hotel\';render()">🛏️ Go rest</button>'+
    '<button class="btn" onclick="closeOverlay()">Get up</button></div>';
}
function riseScreen(cb){
  SND.rankup(); confetti(true); if(!reduceMotion()){ setTimeout(function(){confetti(true);},400); }
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="rankbig" style="color:var(--orange);font-size:60px">🔥</div>'+
    '<div class="big" style="color:var(--orange)">YOU ROSE AGAIN</div>'+
    '<div class="sub">Back to full strength. Comeback #'+(cb&&cb.comebacks||1)+'.</div>'+
    '<div class="sub" style="color:var(--good)">+'+((cb&&cb.xp)||0)+' XP comeback bonus</div>'+
    '<button class="btn go" onclick="closeOverlay()">Rise ▶</button></div>';
}
function maybeRise(){
  if(state.hero.downed && state.hero.hp>=RPG.maxHpOf(state)){
    var cb=RPG.rise(state); persist(); render();
    if(cb && cb.comeback){ riseScreen(cb); }
    return true;
  }
  return false;
}
function chestScreen(res){
  SND.chest(); confetti();
  var loot='';
  if(res.loot){
    confetti(true);
    if(res.loot.type==='jackpot') loot='<div class="lootline gold">💰 <b>COIN JACKPOT</b> - +'+res.loot.coins+' bonus coins!</div>';
    else if(res.loot.type==='potion') loot='<div class="lootline">🧪 Rare drop: <b>Focus Elixir</b> - quaff it any day for ×2 XP.</div>';
    else if(res.loot.type==='frame') loot='<div class="lootline" style="color:'+res.loot.frame.color+'">🖼 Rare drop: <b>'+esc(res.loot.frame.name)+' frame</b> - equip it on your avatar.</div>';
  }
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="big">🎁 DAILY CHEST</div>'+
    '<div class="sub">All dailies cleared. The chest creaks open…</div>'+
    '<div class="sub"><span style="color:var(--xp)">+'+res.xp+' XP</span> &nbsp; <span style="color:var(--gold)">+'+res.coins+' 💰</span></div>'+
    loot+
    '<button class="btn go" onclick="closeOverlay()">Nice ▶</button></div>';
}
function usePotion(){
  var r=RPG.usePotion(state); persist(); render();
  if(r){ SND.chest(); sparks('🧪'); toast('🧪 <span class="p">Focus Elixir - XP ×'+r.mult+' for the rest of today</span>'); }
}
function closeOverlay(){ $('#overlay').className=''; render(); }

/* ---------- rendering ---------- */
function skillName(id){ var s=state.skills.find(function(k){return k.id===id;}); return s? s.icon+' '+s.name : null; }

/* today at a glance: xp, coins earned and focus minutes logged since midnight */
function todayGlance(){
  var today=RPG.todayKey(), xp=0, coins=0, min=0;
  state.log.forEach(function(e){ if(e.day!==today) return; xp+=e.xp||0; if(e.coins>0) coins+=e.coins; min+=e.min||0; });
  if(!xp&&!coins&&!min) return '';
  var bits=[];
  if(xp) bits.push('<b style="color:var(--xp)">+'+xp+'xp</b>');
  if(coins) bits.push('<b style="color:var(--gold)">+'+coins+'\ud83d\udcb0</b>');
  if(min) bits.push('<b style="color:var(--blue)">'+fmtHm(min)+' \u23f3</b>');
  return '<div class="nextrank glance" title="Earned today">today '+bits.join(' \u00b7 ')+'</div>';
}
function renderHUD(){
  var h=state.hero, need=RPG.xpForLevel(h.level), r=RPG.rankFor(h.level), nr=RPG.nextRank(h.level);
  var col=RANK_COLORS[r.code]||'var(--gold)';
  var maxHp=RPG.maxHpOf(state);
  var fr=h.frame?RPG.frameById(h.frame):null;
  var avStyle=fr?('border-color:'+fr.color+';box-shadow:0 0 12px '+fr.glow+', inset 0 0 8px '+fr.glow):('border-color:'+col);
  var asc=(h.ascension||0)>0?'<span class="season" title="Season '+h.ascension+' - you have ascended '+h.ascension+' time'+(h.ascension===1?'':'s')+'">✦ S'+h.ascension+'</span>':'';
  var cloudChip=cloudOn()?'<span class="cloudchip on" title="Cloud sync on - tap for status" onclick="event.stopPropagation();openSettings()">☁✓</span>':'';
  var buffM=RPG.buffXpMult(state);
  var buff=buffM>1?'<div class="buffpill" title="Focus Elixir active - XP boosted for the rest of today">🧪 ×'+(+buffM.toFixed(2))+' XP</div>':'';
  $('#hud').innerHTML=
    '<div class="avatar'+(fr?' framed':'')+(h.downed?' downed':'')+'" style="'+avStyle+'" role="button" tabindex="0" onclick="openCharacter()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openCharacter()}" title="Customize character" aria-label="Customize character">'+h.avatar+'</div>'+
    '<div class="who"><div class="name">'+esc(h.name)+' <span class="rank" role="button" tabindex="0" style="color:'+col+';border-color:'+col+';cursor:pointer" title="See all ranks & how prestige works" aria-label="Rank '+r.code+', '+esc(r.name)+'. See all ranks and how prestige works" onclick="openRanks()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRanks()}">'+r.code+' · '+r.name+'</span>'+asc+cloudChip+'</div>'+
    (h.title?'<div class="herotitle">“'+esc(h.title)+'”</div>':'')+
    '<div class="bars">'+
      '<div class="bar xp"><i style="width:'+Math.min(100,h.xp/need*100)+'%"></i><b>XP '+h.xp+' / '+need+'</b></div>'+
      '<div class="bar hp" role="button" tabindex="0" style="cursor:pointer" title="What happens if my HP hits zero?" aria-label="Health '+h.hp+' of '+maxHp+'. Learn what happens at zero HP." onclick="openDefeatInfo()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openDefeatInfo()}"><i style="width:'+(h.hp/maxHp*100)+'%"></i><b>HP '+h.hp+' / '+maxHp+'</b></div>'+
    '</div></div>'+
    '<div class="side"><div class="lvl">LV.'+h.level+'</div>'+
      '<div class="coin" id="coinCounter">💰 '+h.coins+'</div>'+
      '<div class="flame">🔥 '+h.streak+' day'+(h.streak===1?'':'s')+((h.shields||0)>0?' <span title="Streak Shield active">🛡</span>':'')+'</div>'+
      todayGlance()+
      buff+
      (h.woundedOn===RPG.todayKey()?'<div class="nextrank" style="color:var(--hp)">🩸 wounded · ×0.5 XP</div>':'')+
      (nr?'<div class="nextrank" style="cursor:pointer" onclick="openRanks()">▲ rank '+nr.code+' at Lv.'+nr.min+'</div>':'<div class="nextrank" style="color:var(--gold);cursor:pointer" onclick="openAscend()">✦ MAX - Ascend ▶</div>')+'</div>';
}

function renderSkills(){
  var html = state.skills.map(function(s){
    var need=RPG.skillXpForLevel(s.level);
    var tier=RPG.skillTier(s.level);
    var tierChip=tier.name?'<span class="tier" title="'+tier.name+' - +'+Math.round((tier.xp-1)*100)+'% XP'+(tier.coins>1?', +'+Math.round((tier.coins-1)*100)+'% coins':'')+' on this area’s actions">'+tier.name+'</span>':'';
    return '<div class="skillcard"><div class="t"><span>'+s.icon+' '+esc(s.name)+'</span><small>Lv.'+s.level+'</small></div>'+
      '<div class="bar"><i style="width:'+Math.min(100,s.xp/need*100)+'%"></i></div>'+tierChip+
      '<button class="del" aria-label="Remove life area" onclick="delSkill(\''+s.id+'\')">✕</button></div>';
  }).join('');
  html += '<button class="addskill" onclick="addSkillPrompt()">+ life area</button>';
  $('#skillsRow').innerHTML = html;
}

var TABS=[['today','🏠','TODAY','pri home'],['quests','📜','QUESTS','pri'],['habits','🌱','HABITS','pri'],['focus','⏳','FOCUS','sec'],['market','🏪','MARKET','sec'],['journal','📔','JOURNAL','sec'],['stats','📊','STATS','sec']];
function renderTabs(){
  var chest=A.chestStatus(state);
  $('#tabs').innerHTML = TABS.map(function(t){
    var dot=((t[0]==='quests'||t[0]==='today')&&chest.eligible)||(t[0]==='focus'&&state.activeFocus)?'<span class="dot"></span>':'';
    return '<button class="'+t[3]+(tab===t[0]?' on':'')+'" onclick="go(\''+t[0]+'\')"><span class="ti">'+t[1]+'</span><span class="tl">'+t[2]+'</span>'+dot+'</button>';
  }).join('');
}
function go(t){ tab=t; pendingNote=null; pendingHours=null; pendingDays=[]; navAnim=true; render(); }

function diffChip(d){ return '<span class="chip '+d+'">'+RPG.DIFF[d].label+' · '+RPG.DIFF[d].xp+'xp/'+RPG.DIFF[d].coins+'💰</span>'; }
/* illustrated empty state: a friendly scene instead of a bare line of text */
function emptyState(icon,title,hint,cta){
  return '<div class="ebox"><div class="eicon" aria-hidden="true">'+icon+'</div>'+
    '<div class="etitle">'+title+'</div><div class="ehint">'+hint+'</div>'+(cta||'')+'</div>';
}
function skillOptions(sel){
  return '<option value="">- skill -</option>'+state.skills.map(function(s){
    return '<option value="'+s.id+'"'+(sel===s.id?' selected':'')+'>'+s.icon+' '+esc(s.name)+'</option>';}).join('');
}

/* ---------- presets ---------- */
var PRESETS={
  quest:[
    ['Organize photo library','easy'],['Book a dentist appointment','easy'],['Draft the report outline','normal'],
    ['Deep clean the kitchen','normal'],['Reply to overdue emails','easy'],['Fix that one nagging task','hard'],['Plan the week ahead','easy']
  ],
  good:['Read 20 pages','Gym / 30 min walk','Study / practice 20 min','Plan tomorrow (5 min)','In bed by 23:30','Drink 2L water','Batch-cook Sunday'],
  bad:['Instagram before 1 PM','Doomscrolling','Late-night YouTube','Snoozing alarm','Gaming before work is done'],
  shop:{
    market:[['🛡 Streak Shield - auto-saves one missed day',200,0,0,'shield'],['Gaming: 1 hour',60],['Gaming: full evening',150],['1 episode of a series',40],['Movie night',80],['Café treat',35],['Sweet treat',30],['Takeaway',120],['Sleep-in Saturday',100],['New game (save up!)',600]],
    hotel:[['Power nap (20 min)',25,15],['Walk outside',15,10],['Long shower / bath',40,20],['Full rest evening',90,40],['Massage / spa',200,60]],
    black:[['Instagram before 1 PM (1h)',120,0,8],['Gaming before work is done (1h)',100,0,8],['Junk food feast',90,0,10],['Netflix past midnight',110,0,12],['Skip-the-gym pass',70,0,6]]
  }
};
function presetChips(kind){
  var arr = kind==='shop' ? PRESETS.shop[shopTab] : PRESETS[kind];
  var chips = arr.map(function(p,i){
    return '<button onclick="usePreset(\''+kind+'\','+i+')">+ '+esc(kind==='quest'||kind==='shop'?p[0]:p)+(kind==='shop'?' · '+p[1]+'💰':'')+'</button>';
  }).join('');
  return '<div class="presets"><span class="plabel">quick add:</span>'+chips+'</div>';
}
function usePreset(kind,i){
  if(kind==='quest'){ var p=PRESETS.quest[i]; if(dupe(state.quests,p[0]))return; A.addQuest(state,{title:p[0],diff:p[1]}); }
  if(kind==='good'){ var t=PRESETS.good[i]; if(dupe(state.habits,t))return; A.addHabit(state,{title:t,type:'good'}); }
  if(kind==='bad'){ var t2=PRESETS.bad[i]; if(dupe(state.habits,t2))return; A.addHabit(state,{title:t2,type:'bad'}); }
  if(kind==='shop'){ var s=PRESETS.shop[shopTab][i]; if(dupe(state.shop,s[0]))return; A.addShopItem(state,{title:s[0],price:s[1],tab:shopTab,hp:s[2]||0,dmg:s[3]||0,special:s[4]||null}); }
  persist(); render();
}
function dupe(list,title){ return list.some(function(x){return x.title===title;}); }

function questRow(q){
  var today=RPG.todayKey(), done=q.doneOn===today || (!q.recurring && q.doneOn);
  var activeToday=RPG.questActiveOn(q,new Date());
  var meta=[diffChip(q.diff)];
  if(q.skillId&&skillName(q.skillId)) meta.push('<span class="chip skill">'+skillName(q.skillId)+'</span>');
  if(q.recurring&&q.days&&q.days.length) meta.push('<span class="chip sched" title="Repeats on selected days">🗓 '+MON_ORDER.filter(function(n){return q.days.indexOf(n)>=0;}).map(function(n){return DOW[n][0];}).join('')+'</span>');
  if(q.due){ meta.push('<span class="chip '+(q.due<today?'late':'due')+'">'+(q.due<today?'⚠ late ':'due ')+q.due+'</span>'); }
  var action = done ? '<span style="color:var(--good);font-weight:700">✓</span>'
    : (q.recurring && !activeToday) ? '<span class="chip muted" title="Scheduled for another day">not today</span>'
    : '<button class="btn go" onclick="doQuest(\''+q.id+'\')">Clear</button>';
  return '<div class="item'+(done?' done':'')+(q.recurring&&!activeToday?' dormant':'')+'"><div class="grow"><div class="title">'+esc(q.title)+'</div>'+
    '<div class="meta">'+meta.join('')+'</div></div>'+
    action+
    (!q.recurring&&!done?'<button class="btn ghost" style="color:var(--gold)" title="Upgrade to main quest" onclick="promoteQ(\''+q.id+'\')">⬆</button>':'')+
    '<button class="btn ghost" title="Edit" aria-label="Edit quest" onclick="editQuestModal(\''+q.id+'\')">✎</button>'+
    '<button class="btn ghost" aria-label="Delete quest" onclick="delQuest(\''+q.id+'\')">✕</button></div>';
}

function chestChip(){
  var c=A.chestStatus(state);
  if(c.total===0) return '';
  if(c.claimed) return '<span class="chestchip claimed">🎁 claimed ✓</span>';
  if(c.eligible) return '<button class="chestchip ready" onclick="claimChest()">🎁 OPEN CHEST!</button>';
  return '<span class="chestchip">🎁 '+c.done+'/'+c.total+'</span>';
}

/* main quest card with nested steps */
function goalCard(g){
  var p=A.goalProgress(state,g.id), pct=p.total?Math.round(p.done/p.total*100):0;
  var steps=state.quests.filter(function(q){return q.main===g.id && !q.recurring;});
  var stepHtml=steps.map(function(q){
    var done=!!q.doneOn;
    var today=RPG.todayKey();
    var dueChip=q.due?' <span class="chip '+(q.due<today?'late':'due')+'" style="margin-left:4px">'+(q.due<today?'⚠ ':'due ')+q.due+'</span>':'';
    return '<div class="step'+(done?' done':'')+'"><span>'+(done?'✅':'▫️')+'</span>'+
      '<div class="grow">'+esc(q.title)+' <span class="chip '+q.diff+'" style="margin-left:6px">'+RPG.DIFF[q.diff].label+'</span>'+dueChip+'</div>'+
      (done?'':'<button class="btn go small" onclick="doQuest(\''+q.id+'\')">Clear · '+RPG.DIFF[q.diff].xp+'xp</button>')+
      '<button class="btn ghost small" title="Edit" aria-label="Edit step" onclick="editQuestModal(\''+q.id+'\')">✎</button>'+
      '<button class="btn ghost small" aria-label="Delete step" onclick="delQuest(\''+q.id+'\')">✕</button></div>';
  }).join('');
  return '<div class="goal"><div class="t"><div class="title">🏆 '+esc(g.title)+'</div>'+
    '<div><button class="btn go" onclick="doGoal(\''+g.id+'\')">Complete · 300xp/150💰</button>'+
    '<button class="btn ghost" title="Edit" aria-label="Edit main quest" onclick="editGoalModal(\''+g.id+'\')">✎</button>'+
    '<button class="btn ghost" aria-label="Delete main quest" onclick="delGoal(\''+g.id+'\')">✕</button></div></div>'+
    (g.note?'<div class="hint">'+esc(g.note)+'</div>':'')+
    '<div class="bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="pct">'+p.done+' / '+p.total+' steps · '+pct+'%'+((g.focusMin||0)>0?' · <span style="color:var(--blue)">⏳ '+fmtHm(g.focusMin)+' invested</span>':'')+'</div>'+
    '<div class="steps">'+stepHtml+'</div>'+
    '<div class="stepadd"><input id="step_'+g.id+'" placeholder="Add a step to this main quest…">'+
    '<select id="stepd_'+g.id+'"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="epic">Epic</option></select>'+
    '<input type="date" id="stepdue_'+g.id+'" title="Due date (optional)">'+
    '<button class="btn small" onclick="addStep(\''+g.id+'\')">+ Step</button></div></div>';
}

function renderQuests(){
  var today=RPG.todayKey();
  var dailies=state.quests.filter(function(q){return q.recurring;});
  var chest=A.chestStatus(state);
  var sides=state.quests.filter(function(q){return !q.recurring && !q.doneOn && !q.main;});
  var goalsOpen=state.goals.filter(function(g){return !g.doneOn;});
  var goalHtml=goalsOpen.map(goalCard).join('') ||
    emptyState('🏆','No main quest yet','A main quest is a big goal - the exam, the essay, the internship. Add one below and break it into steps.');

  $('#view').innerHTML=bossStrip()+
    '<div class="panel" style="border-color:var(--gold);margin-bottom:14px"><h3 style="color:var(--gold)">🏆 Main quests - the big goals</h3>'+goalHtml+
      '<div class="form"><div class="row"><input id="gTitle" placeholder="New main quest… (e.g. Pass my driving test)">'+
      '<button class="btn" onclick="addGoal()">+ Main quest</button></div>'+
      '<input id="gNote" placeholder="Why it matters (optional)"></div></div>'+
    '<div class="grid two">'+
    '<div><div class="panel"><h3>🔁 Daily quests <span class="cnt">'+chest.done+'/'+chest.total+'</span>'+chestChip()+'</h3>'+
      '<div class="hint" style="margin-bottom:8px">Repeating tasks that reset every morning (e.g. plan tomorrow, revise 20 min). Clearing them all opens the daily chest.</div>'+
      (dailies.map(questRow).join('')||emptyState('🔁','No dailies yet','Add a repeating task below - it resets every morning and feeds the daily chest.'))+
      '<div class="form"><input id="dTitle" placeholder="New daily quest…">'+
      '<div class="row"><select id="dDiff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="epic">Epic</option></select>'+
      '<select id="dSkill">'+skillOptions()+'</select></div>'+
      '<div class="daysrow"><span class="plabel">repeat on:</span>'+MON_ORDER.map(function(i){
        return '<button type="button" class="dow'+(pendingDays.indexOf(i)>=0?' on':'')+'" onclick="toggleDow('+i+')">'+DOW[i][0]+'</button>';
      }).join('')+'<span class="hint">none selected = every day</span></div>'+
      '<button class="btn wide go" onclick="addDaily()">+ Add daily</button></div></div>'+
    '<div class="panel" style="margin-top:14px">'+agendaPanel()+'</div></div>'+
    '<div class="panel"><h3>📌 Side quests <span class="cnt">'+sides.length+'</span>'+
      '<button class="btn small right" onclick="exportICS()" title="Download an .ics file of quests with due dates for Apple/Google Calendar">📅 Export due dates</button></h3>'+
      '<div class="hint" style="margin-bottom:8px">One-off tasks with an optional due date (e.g. organize photo library, book dentist). For something that needs regular practice over time, like learning a dance, make it a 🏆 main quest and add steps, or a 🌱 habit with a weekly target.</div>'+
      (sides.map(questRow).join('')||emptyState('📌','No side quests','Add a one-off task below. The ⬆ button upgrades one into a main quest.'))+
      '<div class="form"><input id="qTitle" placeholder="New side quest…">'+
      '<div class="row"><select id="qDiff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="epic">Epic</option></select>'+
      '<select id="qSkill">'+skillOptions()+'</select>'+
      '<input type="date" id="qDue" title="Due date (optional)"></div>'+
      '<button class="btn wide go" onclick="addQuest()">+ Add side quest</button></div></div></div>';
}
/* toggle a weekday chip in place - must NOT re-render, or it wipes the half-typed quest form */
function toggleDow(n){
  var i=pendingDays.indexOf(n); if(i>=0) pendingDays.splice(i,1); else pendingDays.push(n);
  var btns=document.querySelectorAll('.daysrow .dow');
  for(var k=0;k<btns.length;k++){ var day=MON_ORDER[k]; btns[k].className='dow'+(pendingDays.indexOf(day)>=0?' on':''); }
}

function bossStrip(){
  var b=state.boss;
  if(b && !b.doneOn){
    var days=A.bossDaysLeft(state);
    var when=days<0?'escaped':days===0?'due TODAY':days+' day'+(days===1?'':'s')+' left';
    return '<div class="boss"><span class="ic">🐲</span><div class="grow">'+
      '<div class="t">WEEKLY BOSS: '+esc(b.title)+'</div>'+
      '<div class="sub"><b>'+when+'</b> · slay it for 500xp / 250💰 · escapes after 7 days</div></div>'+
      '<button class="btn slip" onclick="slayBoss()">🗡️ SLAY</button>'+
      '<button class="btn ghost" aria-label="Abandon boss" onclick="abandonBoss()">✕</button></div>';
  }
  return '<div class="boss calm" style="border-color:var(--line)"><span class="ic" style="animation:none;opacity:.5">🐲</span><div class="grow">'+
    '<div class="t" style="color:var(--muted)">No weekly boss named</div>'+
    '<div class="sub">Pick THE task of the week - worth 500xp / 250💰. Ideal during Friday planning.</div></div>'+
    '<input id="bossTitle" placeholder="This week I will slay…" style="max-width:260px">'+
    '<button class="btn" onclick="setBoss()">🐲 Name it</button></div>';
}
function setBoss(){
  var t=$('#bossTitle').value.trim(); if(!t) return;
  A.setBoss(state,{title:t}); persist(); render(); SND.dmg();
  toast('🐲 <span class="h">The weekly boss awaits</span>');
}
function slayBoss(){
  if(!confirm('Slain for real? The dragon knows if you lie.')) return;
  var r=A.slayBoss(state); persist(); render();
  if(r){ bossKillScreen(r); flyCoins(r.coins); } afterAction();
}
function abandonBoss(){
  if(confirm('Let the boss go? No reward, no penalty - just the shame.')){ A.abandonBoss(state); persist(); render(); }
}
function bossKillScreen(r){
  SND.rankup(); confetti(true); shake();
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="rankbig" style="color:var(--hp);font-size:72px">🐲</div>'+
    '<div class="big" style="color:var(--hp)">BOSS SLAIN</div>'+
    '<div class="sub">'+esc(r.title)+'</div>'+
    '<div class="sub"><span style="color:var(--xp)">+'+r.xp+' XP</span> &nbsp; <span style="color:var(--gold)">+'+r.coins+' 💰</span></div>'+
    '<button class="btn go" onclick="closeOverlay()">Glory ▶</button></div>';
}

function agendaPanel(){
  var items=A.agenda(state);
  var names={overdue:'⚠ OVERDUE',today:'🔥 DUE TODAY',week:'📅 THIS WEEK',later:'🌙 LATER'};
  if(!items.length) return '<h3>📅 Deadlines</h3>'+emptyState('🗓️','Nothing scheduled','Give side quests a due date and they line up here by priority.');
  var out='<h3>📅 Deadlines <span class="cnt">'+items.length+'</span></h3>', last='';
  items.forEach(function(it){
    if(it.bucket!==last){ out+='<div class="logday">'+names[it.bucket]+'</div>'; last=it.bucket; }
    var when=it.days<0?(-it.days)+'d late':it.days===0?'today':it.days===1?'tomorrow':'in '+it.days+'d';
    out+='<div class="ag '+it.bucket+'"><div class="grow">'+esc(it.q.title)+'</div>'+
      '<span class="when">'+when+'</span>'+
      '<button class="btn go small" onclick="doQuest(\''+it.q.id+'\')">Clear</button></div>';
  });
  return out;
}

function renderToday(){
  var today=RPG.todayKey();
  var h=new Date().getHours();
  var greet=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  var dailies=state.quests.filter(function(q){return q.recurring && RPG.questActiveOn(q,new Date());});
  var habits=state.habits.filter(function(x){return x.type==='good';});
  var todo=habits.filter(function(x){return x.lastDoneOn!==today;});
  var j=state.journal[today], sl=state.sleep[today];
  var wounded=state.hero.woundedOn===today;
  var due=A.agenda(state).filter(function(it){return it.bucket==='overdue'||it.bucket==='today';});

  $('#view').innerHTML=
    '<div class="todayhead"><span class="hi">'+greet+', '+esc(state.hero.name)+'</span><span class="dt">'+new Date().toDateString()+'</span>'+
    (state.boss&&!state.boss.doneOn?'<span class="bosschip" style="cursor:pointer" onclick="go(\'quests\')">🐲 boss: '+A.bossDaysLeft(state)+'d left</span>':'')+'</div>'+
    (state.hero.downed?'<div class="downbar">💀 <b>Downed</b> - half XP &amp; no coins. Heal to full HP to <b>Rise</b> and earn normally again. <b>HP '+state.hero.hp+'/'+RPG.maxHpOf(state)+'</b>'+
      '<span class="nb"><button class="btn small go" onclick="go(\'market\');shopTab=\'hotel\';render()" title="What happens when you’re defeated?">🛏️ Rest</button><button class="btn small ghost" onclick="openDefeatInfo()" aria-label="How defeat works">ⓘ</button></span></div>'
      :(wounded?'<div class="woundbar">🩸 <b>Wounded</b> - XP halved today. Rest at the Hotel or log good sleep to recover.</div>':''))+
    redemptionBar()+
    (cloudNudgeDue()?'<div class="nudgebar">☁️ <b>Protect your progress</b> - your save lives only in this browser. Free cloud sync keeps it safe on every device.'+
      '<span class="nb"><button class="btn small go" onclick="openSettings()">Set up</button>'+
      '<button class="btn small ghost" onclick="state.settings.cloudNudgeOff=true;persist();render()">Later</button></span></div>':'')+
    (due.length?'<div class="panel" style="border-color:var(--orange);margin-bottom:14px"><h3 style="color:var(--orange)">🔥 Due today</h3>'+
      due.map(function(it){
        var mainG=it.q.main?state.goals.find(function(g){return g.id===it.q.main;}):null;
        var mainTag=mainG?'<div class="submeta">🏆 '+esc(mainG.title)+'</div>':'';
        return '<div class="ag '+it.bucket+'"><div class="grow">'+esc(it.q.title)+mainTag+'</div><span class="when">'+(it.days<0?(-it.days)+'d late':'today')+'</span>'+
        '<button class="btn go small" onclick="doQuest(\''+it.q.id+'\')">Clear</button></div>';
      }).join('')+'</div>':'')+
    '<div class="grid two">'+
    '<div class="panel"><h3>☀️ Daily quests <span class="cnt">'+dailies.filter(function(q){return q.doneOn===today;}).length+'/'+dailies.length+'</span>'+chestChip()+'</h3>'+
      (dailies.map(questRow).join('')||emptyState('🔁','Nothing to clear today','Add repeating quests in the Quests tab and they line up here every morning.','<button class="btn small" onclick="go(\'quests\')">📜 To the Quests tab</button>'))+'</div>'+
    '<div class="panel"><h3>🌱 Habits to check <span class="cnt">'+(habits.length-todo.length)+'/'+habits.length+'</span></h3>'+
      (habits.map(function(hb){
        var done=hb.lastDoneOn===today;
        var wk=hb.target<7?' <span class="wk">'+A.weekCount(hb)+'/'+hb.target+' wk</span>':'';
        return '<div class="item'+(done?' done':'')+'"><div class="grow"><div class="title">'+esc(hb.title)+'</div>'+
          '<div class="meta">'+habitDots(hb)+wk+'</div></div>'+
          (done?'<span style="color:var(--good);font-weight:700">✓</span>'
            :'<button class="btn go small" onclick="doHabit(\''+hb.id+'\')">Done</button>')+'</div>';
      }).join('')||emptyState('🌱','No habits planted','Grow good habits (and name your monsters) in the Habits tab.','<button class="btn small" onclick="go(\'habits\')">🌱 To the Habits tab</button>'))+
    '<div class="quick">'+
      '<button class="'+(j?'done':'')+'" onclick="go(\'journal\')">'+(j?'📔 Journal ✓':'📔 Log mood · +15xp')+'</button>'+
      '<button class="'+(sl?'done':'')+'" onclick="go(\'journal\')">'+(sl?'🌙 Sleep ✓':'🌙 Log sleep · heals ❤️')+'</button>'+
      '<button onclick="go(\'focus\')">⏳ Start a focus run</button>'+
      ((state.inventory.potion||0)>0?'<button class="potion" onclick="usePotion()">🧪 Focus Elixir ×'+state.inventory.potion+' · ×2 XP today</button>':'')+
    '</div></div></div>';
}

function habitDots(h){
  var out='';
  for(var i=6;i>=0;i--){
    var d=new Date(); d.setDate(d.getDate()-i);
    var k=RPG.todayKey(d);
    var hit=(h.history||[]).indexOf(k)>=0;
    out+='<span class="hd'+(hit?' on':'')+(i===0?' today':'')+'" title="'+k+'"></span>';
  }
  return '<span class="hdots">'+out+'</span>';
}
function renderHabits(){
  var today=RPG.todayKey();
  var good=state.habits.filter(function(h){return h.type==='good';});
  var bad=state.habits.filter(function(h){return h.type==='bad';});
  $('#view').innerHTML='<div class="grid two">'+
    '<div class="panel"><h3>🌱 Grow - good habits <span class="hint" style="margin-left:auto">checkable again every morning</span></h3>'+
    (good.map(function(h){
      var done=h.lastDoneOn===today;
      return '<div class="item'+(done?' done':'')+'"><div class="grow"><div class="title">'+esc(h.title)+'</div>'+
        '<div class="meta">'+habitDots(h)+
        (h.target<7?'<span class="wk">'+A.weekCount(h)+'/'+h.target+' this wk</span><span class="streakN">🔥 '+A.weekStreak(h)+' wk'+(A.weekStreak(h)===1?'':'s')+'</span>'
          :'<span class="streakN">🔥 '+h.streak+'</span>')+
        (h.skillId&&skillName(h.skillId)?'<span class="chip skill">'+skillName(h.skillId)+'</span>':'')+
        '<span>+'+(12+Math.min(10,h.streak+1))+'xp/6💰</span></div></div>'+
        (done?'<span style="color:var(--good);font-weight:700">✓ today</span>'
          :'<button class="btn go" onclick="doHabit(\''+h.id+'\')">Done today</button>')+
        '<button class="btn ghost" title="Edit" aria-label="Edit" onclick="editHabitModal(\''+h.id+'\')">✎</button>'+
        '<button class="btn ghost" aria-label="Delete" onclick="delHabit(\''+h.id+'\')">✕</button></div>';
    }).join('')||emptyState('🌱','Plant your first habit','Something small you want to do most days - read 20 pages, a 30-minute walk…'))+
    '<div class="form"><input id="hgTitle" placeholder="New good habit…">'+
    '<div class="row"><select id="hgSkill">'+skillOptions()+'</select>'+
    '<select id="hgTarget" style="max-width:130px"><option value="7">Every day</option><option value="6">6×/week</option><option value="5">5×/week</option><option value="4">4×/week</option><option value="3">3×/week</option><option value="2">2×/week</option><option value="1">1×/week</option></select>'+
    '<button class="btn go" onclick="addHabit(\'good\')">+ Add</button></div>'+presetChips('good')+'</div></div>'+
    '<div class="panel"><h3>👾 Fight - bad habits <button class="btn small right" onclick="openDefeatInfo()" title="What happens if a monster knocks you out?">💀 What if I lose?</button></h3>'+
    (bad.map(function(h){
      var days=A.cleanDays(h);
      var best=Math.max(h.bestClean||0,days);
      var men=RPG.menaceOf(h);
      var damp=Math.max(0.5,1-0.2*RPG.boonCount(state,'warden'));
      var dmg=Math.round(12*men*damp);
      var menPct=Math.round((men-1)/(2.5-1)*100);
      var menClass=men>=2?' hot':men>1.3?' warm':'';
      return '<div class="item monster"><div class="grow"><div class="title">'+esc(h.title)+(men>1?' <span class="menaceTag'+menClass+'">menace ×'+men.toFixed(1)+'</span>':'')+'</div>'+
        '<div class="meta"><span class="clean">🛡 '+days+' day'+(days===1?'':'s')+' clean</span>'+
        '<span style="color:var(--gold)">best: '+best+'</span>'+
        '<span>slips: '+h.slips+'</span><span style="color:var(--hp)">slip = −'+dmg+' ❤️ / −10 💰</span></div>'+
        (men>1?'<div class="menacebar"><i class="'+menClass.trim()+'" style="width:'+menPct+'%"></i></div>':'')+'</div>'+
        '<button class="btn slip" onclick="slip(\''+h.id+'\')">I slipped</button>'+
        '<button class="btn ghost" title="Edit" aria-label="Edit" onclick="editHabitModal(\''+h.id+'\')">✎</button>'+
        '<button class="btn ghost" aria-label="Delete" onclick="delHabit(\''+h.id+'\')">✕</button></div>';
    }).join('')||emptyState('👾','No monsters named','Name the habits you\u2019re fighting. Every slip you log honestly hits your HP - the more you feed a monster, the harder it bites.'))+
    '<div class="form"><input id="hbTitle" placeholder="New monster…">'+
    '<button class="btn wide slip" style="background:var(--panel)" onclick="addHabit(\'bad\')">+ Add monster</button>'+presetChips('bad')+'</div></div></div>';
}

/* ---------- focus tab (pomodoro) ---------- */
function fmtTime(ms){
  var s=Math.max(0,Math.ceil(ms/1000)), m=Math.floor(s/60), r=s%60;
  return (m<10?'0':'')+m+':'+(r<10?'0':'')+r;
}
function musicId(){
  var m=state.settings.music;
  if(m==='custom'){
    var match=(state.settings.musicUrl||'').match(/(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/);
    return match?match[1]:null;
  }
  return (MUSIC[m]||{}).id||null;
}
/* A small in-view note; the actual player is docked and persistent (below) so it
   keeps playing across tab switches instead of reloading and erroring. */
function focusMusicNote(){
  var id=musicId();
  if(!id) return '';
  if(location.protocol==='file:'){
    return '<div class="hint" style="margin-top:12px">Music can’t embed on local files - use the pop-out, which keeps playing while you focus:</div>'+
      '<button class="btn small" style="margin-top:6px" onclick="openMusicWin()">🎵 Pop-out player</button>';
  }
  return '<div class="hint" style="margin-top:12px">🎧 '+esc((MUSIC[state.settings.music]||{}).name||'Music')+' is playing in the docked player (keeps going across tabs). <button class="btn small" onclick="openMusicWin()">Pop out</button></div>';
}
/* Persistent docked music player: created once, only rebuilt when the track
   changes, and living OUTSIDE #view so navigating tabs never reloads it. */
function syncMusicPlayer(){
  var id=state&&state.activeFocus?musicId():null;
  var want=!!(id && location.protocol!=='file:');
  var host=document.getElementById('smlmusic');
  if(!want){ if(host) host.remove(); return; }
  if(!host){ host=document.createElement('div'); host.id='smlmusic'; document.body.appendChild(host); }
  if(host.getAttribute('data-id')!==id){
    host.setAttribute('data-id',id);
    host.innerHTML='<div class="mp-bar"><span class="mp-t">🎧 '+esc((MUSIC[state.settings.music]||{}).name||'Music')+'</span>'+
      '<button aria-label="Pop out" title="Pop out to its own window" onclick="openMusicWin()">⧉</button>'+
      '<button aria-label="Hide music" title="Hide" onclick="hideMusicPlayer()">✕</button></div>'+
      '<iframe src="https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="study music"></iframe>';
  }
}
function hideMusicPlayer(){ var h=document.getElementById('smlmusic'); if(h) h.remove(); }
function openMusicWin(){
  var id=musicId(); if(!id) return;
  window.open('https://www.youtube.com/watch?v='+id,'smlMusic','width=520,height=340,menubar=no,toolbar=no,location=no');
}
function ringSvg(pct,cls,size){
  size=size||190;
  var r=Math.round(size/2-9), c=size/2, C=2*Math.PI*r;
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'">'+
    '<circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="9"/>'+
    '<circle id="ringFg" data-r="'+r+'" cx="'+c+'" cy="'+c+'" r="'+r+'" fill="none" stroke="'+(cls==='brk'?'var(--orange)':'var(--xp)')+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+(C*(1-pct))+'" style="transition:stroke-dashoffset 1s linear"/></svg>';
}
function sessionStats(f){
  var workedMin=Math.floor(A.focusWorkedMs(state)/60000);
  var xp=Math.round(workedMin*1.2), coins=Math.round(workedMin*0.6);
  return '<div class="sesh"><span>worked <b class="g" id="seshMin">'+workedMin+'</b> min</span>'+
    '<span>banked so far <b id="seshPay">'+xp+'xp / '+coins+'💰</b></span>'+
    '<span>cycles <b>'+f.cycles+'</b></span></div>';
}
function renderFocus(){
  var f=state.activeFocus;
  if(f){
    var paused=!!f.pausedAt;
    var refNow=f.pausedAt||Date.now();
    var phaseTotal=(f.phase==='work'?f.work:f.brk)*60000;
    var left=f.phaseEnd-refNow, pct=RPG.clamp(1-left/phaseTotal,0,1);
    if(f.awaitingBreak){
      // work phase finished - wait for the user to start the break (the alarm already rang)
      $('#view').innerHTML='<div class="panel focusbox break">'+
        '<div class="phase brk" style="color:var(--orange)">🔔 TIME FOR A BREAK</div>'+
        '<div class="focusring brk" style="width:150px;height:150px"><div class="bellwrap">🔔</div></div>'+
        '<div class="doing">Nice work. Take '+f.brk+' minutes - the break timer starts when you’re ready.</div>'+
        sessionStats(f)+
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
        '<button class="btn wide go" style="max-width:260px" onclick="startBreakBtn()">▶ Start '+f.brk+'-min break</button></div>'+
        '<div style="margin-top:8px;display:flex;gap:8px;justify-content:center">'+
        '<button class="btn" onclick="skipToWork()">Skip break, keep working</button>'+
        '<button class="btn buy" onclick="stopFocus()">⏹ Stop &amp; collect</button></div></div>';
    } else if(f.phase==='work'){
      $('#view').innerHTML='<div class="panel focusbox'+(paused?' paused':'')+'">'+
        '<div class="phase work">'+(paused?'⏸ PAUSED':'🎯 WORK PHASE'+(f.brk>0?' · break in '+fmtTime(left):''))+'</div>'+
        '<div class="focusring">'+ringSvg(pct,'work')+'<div class="time" id="countdown">'+fmtTime(left)+'</div></div>'+
        (f.label?'<div class="doing">Fighting: <b>'+esc(f.label)+'</b></div>':'')+
        sessionStats(f)+
        '<div class="hint" style="margin-top:8px">'+(paused?'Timer paused - your worked time is safe. Resume when you’re back.':'Runs '+f.work+' min work'+(f.brk>0?' / '+f.brk+' min break':'')+'. You are paid for every worked minute.')+'</div>'+
        focusMusicNote()+
        '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
        (paused?'<button class="btn wide go" style="max-width:220px" onclick="resumeFocusUI()">▶ Resume</button>'
               :'<button class="btn" onclick="pauseFocusUI()">⏸ Pause</button>')+
        '<button class="btn buy" onclick="stopFocus()">⏹ Stop &amp; collect</button></div></div>';
    } else {
      $('#view').innerHTML='<div class="panel focusbox break'+(paused?' paused':'')+'">'+
        '<div class="phase brk">'+(paused?'⏸ PAUSED':'🏕 BREAK - REST AT THE CAMPFIRE')+'</div>'+
        '<div class="campfire"><span class="tent">⛺</span><span class="fire">🔥</span><span class="moon">🌙</span>'+
        '<span class="z">💤</span><span class="z z2">💤</span><span class="sp">✨</span><span class="sp sp2">✨</span><span class="sp sp3">✨</span></div>'+
        '<div class="focusring brk" style="width:130px;height:130px">'+ringSvg(pct,'brk',130)+'<div class="time" id="countdown" style="font-size:20px">'+fmtTime(left)+'</div></div>'+
        '<div class="doing">Stretch. Water. Look out the window. <b style="color:var(--good)">+3 ❤️</b> when the break ends.</div>'+
        sessionStats(f)+focusMusicNote()+
        '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
        (paused?'<button class="btn go" onclick="resumeFocusUI()">▶ Resume</button>':'<button class="btn" onclick="pauseFocusUI()">⏸ Pause</button>')+
        '<button class="btn" onclick="skipBreak()">⏭ Skip break</button>'+
        '<button class="btn buy" onclick="stopFocus()">⏹ Stop &amp; collect</button></div></div>';
    }
  } else {
    var modes=[[25,5,'25 / 5'],[50,10,'50 / 10'],[90,15,'90 / 15'],[50,0,'FREE RUN']];
    $('#view').innerHTML='<div class="panel focusbox">'+
      '<h3 style="justify-content:center">⏳ Focus - get paid for deep work</h3>'+
      '<div class="hint">Pomodoro cycles that loop until you stop. Every worked minute pays 1.2 XP + 0.6 💰 - you collect when you hit stop, whether that is after 20 minutes or 3 hours. Breaks heal +3 ❤️. <b>You need to focus at least 5 minutes before any XP or coins are earned.</b></div>'+
      '<div class="durchips">'+modes.map(function(m){
        var on=!focusMode.custom&&focusMode.work===m[0]&&focusMode.brk===m[1];
        return '<button class="'+(on?'on':'')+'" onclick="focusMode={work:'+m[0]+',brk:'+m[1]+',custom:false};render()">'+m[2]+'</button>';}).join('')+
        '<button class="'+(focusMode.custom?'on':'')+'" onclick="focusMode={work:focusMode.work,brk:focusMode.brk,custom:true};render()">⚙ Custom</button>'+
      '</div>'+
      '<div class="form" style="max-width:460px;margin:0 auto;border:none;padding-top:0">'+
      '<input id="fLabel" placeholder="What are you working on? (e.g. Essay draft)">'+
      '<div class="row"><select id="fSkill">'+skillOptions()+'</select>'+
      (state.goals.some(function(g){return !g.doneOn;})?'<select id="fGoal" title="Bank this deep work on a main quest"><option value="">- main quest -</option>'+state.goals.filter(function(g){return !g.doneOn;}).map(function(g){return '<option value="'+g.id+'">🏆 '+esc(g.title)+'</option>';}).join('')+'</select>':'')+
      '</div>'+
      (focusMode.custom?'<div class="row"><label style="font-size:12px;color:var(--muted)">Work<input id="fWork" type="number" min="5" max="180" value="'+focusMode.work+'" placeholder="work min" style="max-width:90px"></label>'+
        '<label style="font-size:12px;color:var(--muted)">Break<input id="fBrk" type="number" min="0" max="60" value="'+focusMode.brk+'" placeholder="break" style="max-width:80px"></label></div>':'')+
      '<div class="flabel" style="text-align:left">Study music / background</div>'+
      '<div class="row"><select id="fMusic" onchange="state.settings.music=this.value;persist();render()">'+
      Object.keys(MUSIC).map(function(k){return '<option value="'+k+'"'+(state.settings.music===k?' selected':'')+'>'+MUSIC[k].name+'</option>';}).join('')+
      '</select></div>'+
      (state.settings.music==='custom'?'<input id="fUrl" placeholder="Paste a YouTube URL (lofi, Zelda & Chill, Minecraft ambience…)" value="'+esc(state.settings.musicUrl)+'" onchange="state.settings.musicUrl=this.value;persist()">':'')+
      '<button class="btn wide go" onclick="startFocus()">▶ START - '+focusMode.work+' min work'+(focusMode.brk?' / '+focusMode.brk+' min break':' · no breaks')+', loops until stopped</button></div>'+
      '<div class="payline" style="margin-top:14px">Lifetime focus: <b>'+Math.floor(state.counters.focusMin/60)+'h '+(state.counters.focusMin%60)+'m</b></div></div>';
  }
}
function startFocus(){
  var wEl=$('#fWork'), bEl=$('#fBrk');
  var w=wEl?(Number(wEl.value)||focusMode.work):focusMode.work;
  var b=bEl?(bEl.value===''?focusMode.brk:Number(bEl.value)):focusMode.brk;
  A.startFocus(state,{work:w,brk:b,skillId:$('#fSkill').value||null,goalId:($('#fGoal')||{}).value||null,label:$('#fLabel').value});
  persist(); render();
}
function stopFocus(){
  var r=A.stopFocus(state); persist(); render(); updateDocTitle();
  if(!r) return;
  if(r.tooShort){ toast('<span class="h">Stopped at '+r.minutes+' min - under 5, nothing earned</span>','dmg'); return; }
  SND.chest(); confetti(); fx(r);
  toast('⏳ <span class="p">'+r.minutes+' min of real work collected</span>');
  if(r.goalTitle) toast('🏆 <span class="c">'+fmtHm(r.minutes)+' banked on “'+esc(r.goalTitle)+'”</span>');
  afterAction();
}
function startBreakBtn(){ A.startBreak(state); persist(); render(); SND.resume(); }
function skipToWork(){ if(state.activeFocus){ state.activeFocus.awaitingBreak=false; state.activeFocus.cycles++; state.activeFocus.phaseEnd=Date.now()+state.activeFocus.work*60000; persist(); render(); SND.resume(); toast('🎯 <span class="p">Straight back to work</span>'); } }
function pauseFocusUI(){ A.pauseFocus(state); persist(); render(); updateDocTitle(); }
function resumeFocusUI(){ A.resumeFocus(state); persist(); render(); updateDocTitle(); SND.resume(); }
function skipBreak(){ var ev=A.skipBreak(state); persist(); render(); if(ev&&ev.healed) toast('<span class="hg">+'+ev.healed+' HP - rested</span>'); SND.resume(); }
function updateDocTitle(){
  var base='ScaleMyLife', f=state&&state.activeFocus;
  if(!f){ if(document.title!==base) document.title=base; return; }
  var t;
  if(f.awaitingBreak) t='🔔 Break time!';
  else if(f.pausedAt) t='⏸ Paused · Focus';
  else { var left=Math.max(0,f.phaseEnd-Date.now()); t=(f.phase==='work'?'🎯 ':'🏕 ')+fmtTime(left)+(f.phase==='work'?' · Focus':' · Break'); }
  if(document.title!==t) document.title=t;
}
/* a small persistent badge, on every tab, so you never lose track of a running
   focus session (tapping it jumps back to Focus). Hidden while on the Focus tab. */
function syncFocusPill(){
  var host=document.getElementById('focuspill');
  var f=state&&state.activeFocus;
  if(!f || tab==='focus'){ if(host) host.remove(); return; }
  if(!host){
    host=document.createElement('button'); host.id='focuspill';
    host.setAttribute('aria-label','Focus session running - go to Focus');
    host.onclick=function(){ go('focus'); };
    document.body.appendChild(host);
  }
  var txt, cls;
  if(f.awaitingBreak){ txt='🔔 Break time!'; cls='fp-brk'; }
  else if(f.pausedAt){ txt='⏸ Focus paused'; cls='fp-pause'; }
  else { var left=Math.max(0,f.phaseEnd-Date.now()); txt=(f.phase==='work'?'🎯 ':'🏕 ')+fmtTime(left); cls=f.phase==='work'?'fp-work':'fp-brk'; }
  host.className=cls;
  host.innerHTML='<span class="fp-dot"></span>'+txt;
}
function checkFocus(){
  var f=state.activeFocus;
  if(!f){ updateDocTitle(); syncFocusPill(); return; }
  var ev=A.tickFocus(state);
  if(ev){
    persist(); render(); updateDocTitle();
    if(ev.event==='breakReady'){ SND.alarm(); toast('🔔 <span style="color:var(--orange)">Time for a break - start it when you’re ready</span>'); if(document.hidden&&state.settings.reminders) notifyNow('ScaleMyLife','🔔 Break time - tap to start your break.'); }
    else { SND.resume(); if(ev.healed>0){ fx({hp:ev.healed}); } toast('🎯 <span class="p">Back to work - cycle '+state.activeFocus.cycles+'</span>'); if(document.hidden&&state.settings.reminders) notifyNow('ScaleMyLife','🎯 Break over - back to the quest.'); }
    return;
  }
  updateDocTitle(); syncFocusPill();
  if(tab==='focus' && !f.pausedAt && !f.awaitingBreak){
    var left=f.phaseEnd-Date.now();
    var cd=$('#countdown'); if(cd) cd.textContent=fmtTime(left);
    var ring=$('#ringFg');
    if(ring){
      var total=(f.phase==='work'?f.work:f.brk)*60000, pct=RPG.clamp(1-left/total,0,1);
      var C=2*Math.PI*Number(ring.getAttribute('data-r')||86);
      ring.setAttribute('stroke-dashoffset',C*(1-pct));
    }
    var sm=$('#seshMin'), sp=$('#seshPay');
    if(sm){ var wm=Math.floor(A.focusWorkedMs(state)/60000); sm.textContent=wm; if(sp) sp.textContent=Math.round(wm*1.2)+'xp / '+Math.round(wm*0.6)+'💰'; }
  }
}

/* pick a storefront icon from the reward's title (fallback per shop tab) */
var SHOP_ICONS=[[/(gaming|game(?!.*gear)|play)/i,'🎮'],[/(episode|series|netflix|show)/i,'📺'],[/(movie|cinema|film)/i,'🎬'],
  [/(café|cafe|coffee|latte)/i,'☕'],[/(sweet|dessert|cake|chocolate|ice ?cream|treat)/i,'🍰'],[/(nap|sleep|sleep-in)/i,'😴'],
  [/(rest|evening off|weekend|day off)/i,'🛌'],[/(walk|outside|park)/i,'🚶'],[/(shower|bath|spa|massage)/i,'🛁'],
  [/(instagram|scroll|social|tiktok|phone)/i,'📱'],[/(junk|takeaway|fast ?food|feast|pizza|burger|cheat meal)/i,'🍔'],
  [/(dinner|restaurant|meal out|night out|party)/i,'🎉'],[/(book|read)/i,'📚'],[/(gear|buy|save up|new )/i,'🎁'],[/(shield)/i,'🛡️'],[/(music|concert|vinyl)/i,'🎵']];
function shopIcon(title,tab){
  for(var i=0;i<SHOP_ICONS.length;i++){ if(SHOP_ICONS[i][0].test(title)) return SHOP_ICONS[i][1]; }
  return tab==='hotel'?'🛏️':tab==='black'?'🕶️':'🎁';
}
function renderMarket(){
  var tabs=[['market','🛒 Market'],['hotel','🛏️ Hotel'],['black','🕶️ Black Market']];
  var items=state.shop.filter(function(i){return i.tab===shopTab;});
  var escOn=state.settings.escalate!==false;
  var blurb={market:'Everyday treats. Earn them, then enjoy them guilt-free - that is the whole point.'+(escOn?' Repeat the same treat in one day and its price climbs - indulge, don’t binge.':''),
    hotel:'Rest and recovery. Hotel items restore ❤️ HP - no surge, rest all you like.',
    black:'Break your own rules - the deal costs coins AND HP, the price climbs each time, and you can only cave a couple times a day.'}[shopTab];
  $('#view').innerHTML='<div class="panel"><h3>Reward shop · balance <span class="cnt">💰 '+state.hero.coins+'</span>'+
    '<button class="btn small right" onclick="toggleEscalate()" title="Escalating prices stop a coin hoard from buying unlimited indulgences">'+(escOn?'📈 Surge ON':'➖ Surge OFF')+'</button></h3>'+
    '<div class="shoptabs">'+tabs.map(function(t){return '<button class="'+(shopTab===t[0]?'on':'')+'" onclick="shopTab=\''+t[0]+'\';render()">'+t[1]+'</button>';}).join('')+'</div>'+
    '<div class="hint" style="margin-bottom:10px">'+blurb+'</div>'+
    (items.length?'<div class="shopgrid">'+items.map(function(i){
      var isShield=i.special==='shield';
      var info=isShield?{price:i.price,capped:false,limit:0,count:0,surge:0}:A.buyInfo(state,i);
      var haveS=isShield&&(state.hero.shields||0)>=1;
      var can=state.hero.coins>=info.price && !info.capped && !haveS;
      var effects=[];
      if(isShield) effects.push('<span style="color:var(--gold)">auto-saves one missed day</span>');
      if(i.hp) effects.push('<span style="color:var(--good)">+'+i.hp+' ❤️</span>');
      if(i.dmg) effects.push('<span style="color:var(--hp)">−'+i.dmg+' ❤️</span>');
      if(info.limit>0) effects.push('<span class="cap'+(info.capped?' hit':'')+'">'+(info.capped?'daily cap hit':info.count+'/'+info.limit+' today')+'</span>');
      else if(info.count>0 && info.surge>0) effects.push('<span class="cap">'+info.count+'× today</span>');
      var surgedPrice=info.price>i.price;
      // affordability meter: how close your purse is to this price
      var aff=can||haveS?'':'<div class="affbar" title="'+(info.price-state.hero.coins)+' 💰 to go"><i style="width:'+Math.min(100,Math.round(state.hero.coins/info.price*100))+'%"></i></div>';
      return '<div class="scard'+(can?'':' locked')+(shopTab==='black'?' shady':'')+'">'+
        '<button class="del" aria-label="Delete reward" onclick="delShop(\''+i.id+'\')">✕</button>'+
        '<div class="sicon" aria-hidden="true">'+shopIcon(i.title,i.tab)+'</div>'+
        '<div class="stitle">'+esc(i.title)+'</div>'+
        (effects.length?'<div class="sfx">'+effects.join(' · ')+'</div>':'')+
        aff+
        '<div class="srow"><span class="price'+(surgedPrice?' surged':'')+'">💰 '+info.price+(surgedPrice?'<small> ('+i.price+')</small>':'')+'</span>'+
        '<button class="btn buy small" '+(can?'':'disabled')+' onclick="buy(\''+i.id+'\')">'+(haveS?'Held':info.capped?'Capped':'Buy')+'</button></div></div>';
    }).join('')+'</div>'
    :emptyState('🛒','Empty shelf','Stock rewards you actually want - that is what makes coins matter. Add one below.'))+
    '<div class="form"><input id="sTitle" placeholder="New reward… (e.g. Cinema night)">'+
    '<div class="row"><input id="sPrice" type="number" min="1" placeholder="price 💰" style="max-width:110px">'+
    (shopTab==='hotel'?'<input id="sHp" type="number" min="0" placeholder="+HP" style="max-width:90px">':'')+
    (shopTab==='black'?'<input id="sDmg" type="number" min="0" placeholder="−HP" style="max-width:90px">':'')+
    (shopTab!=='hotel'?'<input id="sLimit" type="number" min="0" placeholder="max/day" style="max-width:100px" title="0 = unlimited">':'')+
    '<button class="btn buy" onclick="addShop()">+ Stock it</button></div>'+presetChips('shop')+'</div></div>';
}
function toggleEscalate(){ state.settings.escalate=state.settings.escalate===false; persist(); render(); }

function renderJournal(){
  var today=RPG.todayKey(), entry=state.journal[today], sl=state.sleep[today];
  $('#view').innerHTML='<div class="grid two">'+
    '<div class="panel"><h3>Today\'s mood '+(entry?'<span class="cnt">saved ✓</span>':'· +15xp/5💰')+'</h3>'+
    '<div class="moods">'+RPG.MOODS.map(function(m){
      var on=(pendingMood||((entry||{}).mood))===m.key;
      return '<button class="'+(on?'on':'')+'" title="'+m.label+'" aria-label="Mood: '+m.label+'" aria-pressed="'+(on?'true':'false')+'" onclick="pendingMood=\''+m.key+'\';render()">'+m.emoji+'</button>';
    }).join('')+'</div>'+
    '<textarea id="jNote" rows="3" placeholder="One honest line about today…" oninput="pendingNote=this.value">'+esc(pendingNote!=null?pendingNote:((entry||{}).note||''))+'</textarea>'+
    '<button class="btn wide go" style="margin-top:8px" onclick="saveJournal()">'+(entry?'Update entry':'Log entry')+'</button>'+
    '<h3 style="margin-top:18px">🌙 Sleep '+(sl?'<span class="cnt">logged ✓</span>':'· restores ❤️')+'</h3>'+
    '<div class="row" style="display:flex;gap:8px;align-items:center">'+
    '<input id="slHours" type="number" step="0.5" min="0" max="16" value="'+(pendingHours!=null?esc(pendingHours):((sl||{}).hours||7.5))+'" oninput="pendingHours=this.value" style="max-width:90px"> <span class="hint">hours</span>'+
    '<div class="stars">'+[1,2,3,4,5].map(function(n){
      var on=n<=(sl?sl.quality:pendingQuality);
      return '<button class="'+(on?'on':'')+'" onclick="pendingQuality='+n+';render()">⭐</button>';}).join('')+'</div>'+
    '<button class="btn go" onclick="saveSleep()">'+(sl?'Update':'Log sleep')+'</button></div></div>'+
    '<div class="panel"><h3>📔 Archive <span class="cnt">'+Object.keys(state.journal).length+' entr'+(Object.keys(state.journal).length===1?'y':'ies')+'</span></h3>'+
    journalArchive()+'</div></div>';
}

function insightsPanel(){
  var iv=RPG.insights(state);
  var body;
  if(!iv.enough){
    body='<div class="empty">Log your mood for '+Math.max(0,6-iv.sampleSize)+' more day'+((6-iv.sampleSize)===1?'':'s')+' ('+iv.sampleSize+'/6) and ScaleMyLife starts showing what actually moves your mood - sleep, focus, slips.</div>';
  } else if(!iv.findings.length){
    body='<div class="empty">No strong patterns yet across your good and low days. Keep logging - the signal sharpens with more data.</div>';
  } else {
    body=iv.findings.map(function(f){ return '<div class="insight"><span class="ic">'+f.icon+'</span><span>'+esc(f.text)+'</span></div>'; }).join('');
  }
  return '<div class="panel" style="margin-top:14px"><h3>🔎 Insights - what moves your mood</h3>'+body+'</div>';
}
function focusPanel(){
  var month=focusSpan===30;
  var f=RPG.focusByDay(state,focusSpan);
  var toggle='<span class="spantoggle right"><button class="'+(month?'':'on')+'" onclick="focusSpan=7;render()">Week</button><button class="'+(month?'on':'')+'" onclick="focusSpan=30;render()">Month</button></span>';
  var body;
  if(!f.totalMin){
    body='<div class="empty">No focus sessions in this window. Start a run in ⏳ Focus (tag it with a life area) and your daily breakdown - what you actually worked on - appears here.</div>';
  } else {
    var legend='<div class="focuslegend">'+f.skills.map(function(id){
      return '<span><i style="background:'+skillColorById(id)+'"></i>'+skillLabelById(id)+'</span>';
    }).join('')+'</div>';
    var rows=f.days.map(function(d){
      var day=f.per[d], total=day.total;
      var dt=new Date(d+'T00:00:00');
      var lbl=month?String(dt.getDate()):['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()];
      var segs=f.skills.map(function(id){
        var m=day.bySkill[id]||0; if(!m) return '';
        return '<span class="fseg" style="width:'+(m/f.maxMin*100)+'%;background:'+skillColorById(id)+'" title="'+skillLabelById(id)+': '+fmtHm(m)+'"></span>';
      }).join('');
      return '<div class="frow'+(month?' slim':'')+'"><span class="fdl">'+lbl+'</span><div class="ftrack">'+segs+'</div>'+
        '<span class="ftt">'+(total?fmtHm(total):'')+'</span></div>';
    }).join('');
    body='<div class="hint" style="margin-bottom:8px">Total this '+(month?'month':'week')+': <b style="color:var(--gold)">'+fmtHm(f.totalMin)+'</b></div>'+legend+'<div class="focusbars">'+rows+'</div>';
  }
  return '<div class="panel" style="margin-top:14px"><h3>⏳ Focus by life area - what you worked on'+toggle+'</h3>'+body+'</div>';
}
/* GitHub-style consistency heatmap: 12 weeks of daily XP */
function heatmapPanel(){
  var h=RPG.heatmap(state,12);
  if(!h.total) return '<div class="panel" style="margin-top:14px"><h3>🗓 Consistency - last 12 weeks</h3><div class="empty">Every day you earn XP lights a square. Come back in a few days and watch the wall fill up.</div></div>';
  var cells=h.cells.map(function(c){
    return '<i class="hc l'+c.level+(c.future?' fut':'')+'" title="'+c.day+(c.future?'':' · '+c.xp+' XP')+'"></i>';
  }).join('');
  return '<div class="panel" style="margin-top:14px"><h3>🗓 Consistency - last 12 weeks '+
    '<span class="cnt">'+h.activeDays+' active days · '+h.total+' XP</span></h3>'+
    '<div class="heatwrap"><div class="heatmap">'+cells+'</div></div>'+
    '<div class="heatkey"><span>less</span><i class="hc l0"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i><i class="hc l4"></i><span>more</span></div></div>';
}
/* trophy shelf: every weekly boss slain */
function trophyShelf(){
  var t=RPG.bossTrophies(state);
  if(!t.length) return '';
  return '<div class="panel" style="margin-top:14px"><h3>🐲 Trophy shelf <span class="cnt">'+t.length+' boss'+(t.length===1?'':'es')+' slain</span></h3>'+
    '<div class="trophies">'+t.map(function(x){
      return '<div class="trophy"><span class="ti">🏆</span><div><div class="tt">'+esc(x.title)+'</div><div class="td">'+x.day+'</div></div></div>';
    }).join('')+'</div></div>';
}
/* ---------- leaderboard (Stats) ---------- */
function boardRowsHtml(rows, me){
  lastBoardRows=rows||[]; lastBoardMe=me||null;
  var medals=['🥇','🥈','🥉'];
  return rows.map(function(r,i){
    var mine=me&&r.user_id===me;
    var tap=r.user_id?' role="button" tabindex="0" aria-label="View '+esc(r.name||'hero')+'’s profile" onclick="showProfile(\''+r.user_id+'\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();showProfile(\''+r.user_id+'\')}"':'';
    return '<div class="brow'+(mine?' me':'')+(r.user_id?' tap':'')+'"'+tap+'><span class="bpos">'+(medals[i]||('#'+(i+1)))+'</span>'+
      '<span class="bav">'+esc(r.avatar||'🧙')+'</span>'+
      '<div class="grow"><div class="bname">'+esc(r.name||'Hero')+(mine?' <span class="chip muted">you</span>':'')+'</div>'+
      '<div class="bmeta">'+esc(r.rank_code||'E')+' · Lv.'+(r.level||1)+((r.ascension||0)>0?' · ✦S'+r.ascension:'')+' · 🔥best '+(r.best_streak||0)+'</div></div>'+
      '<span class="bxp">'+(r.week_xp||0)+' <small>xp/wk</small></span></div>';
  }).join('')||'<div class="empty">The board is empty - be the first hero on it.</div>';
}
function renderBoardInto(el, rows, me){ if(el) el.innerHTML=boardRowsHtml(rows, me); }
function boardSkeleton(n){
  var rows=''; n=n||5;
  for(var i=0;i<n;i++){ rows+='<div class="brow skel" aria-hidden="true"><span class="sk sk-pos"></span><span class="sk sk-av"></span>'+
    '<div class="grow"><span class="sk sk-name"></span><span class="sk sk-meta"></span></div><span class="sk sk-xp"></span></div>'; }
  return '<span class="sr-only">Loading…</span>'+rows;
}
function leaderboardPanel(){
  if(typeof SMLCloud==='undefined'||!SMLCloud.configured()) return '';
  var friends=boardView==='friends';
  var toggle='<span class="spantoggle right"><button class="'+(friends?'':'on')+'" onclick="boardView=\'global\';render()">Global</button><button class="'+(friends?'on':'')+'" onclick="boardView=\'friends\';render()">Friends</button></span>';
  var head='<div class="panel" style="margin-top:14px"><h3>🏆 Leaderboard <span class="cnt">weekly XP</span>'+toggle+'</h3>';
  if(!cloudOn()) return head+'<div class="empty">Sign in (⚙️ → Cloud sync) and join to race other heroes on weekly XP.</div></div>';
  if(friends){
    if(!state.settings.friends) return head+'<div class="empty">Enable friends in ⚙️ Settings, share your code, and race your friends here.</div><button class="btn wide" onclick="openSettings()">🤝 Enable friends</button></div>';
    setTimeout(function(){
      SMLCloud.fetchFriendsBoard(boardProfile()).then(function(r){
        var el=document.getElementById('boardBody'); if(!el) return;
        if(!r.ok){ el.innerHTML='<div class="empty">Friends board unavailable right now.</div>'; return; }
        el.innerHTML = r.rows.length>1 ? boardRowsHtml(r.rows, r.me) : '<div class="empty">Just you so far - add friends by code in ⚙️ Settings.</div>';
      });
    },0);
    return head+'<div id="boardBody">'+boardSkeleton(4)+'</div></div>';
  }
  if(!state.settings.board) return head+'<div class="empty">You\u2019re synced but not on the global board. Join from ⚙️ → Cloud sync - only name, avatar, level, rank, weekly XP and best streak are shared.</div>'+
    '<button class="btn wide" onclick="openSettings()">🏆 Join the leaderboard</button></div>';
  setTimeout(function(){
    SMLCloud.fetchBoard(25).then(function(r){
      var el=document.getElementById('boardBody'); if(!el) return;
      if(!r.ok){ el.innerHTML='<div class="empty">Leaderboard unavailable right now - it\u2019ll be back.</div>'; return; }
      renderBoardInto(el, r.rows, r.me);
    });
  },0);
  return head+'<div id="boardBody">'+boardSkeleton(6)+'</div></div>';
}
function reviewBox(){
  var rev=RPG.weeklyReview(state);
  var best=rev.bestDay?new Date(rev.bestDay+'T00:00:00').toLocaleDateString(undefined,{weekday:'long'}):'-';
  return '<div class="review">'+
    '<div class="rv"><span class="k">🏅 Best day</span><span class="v">'+best+' · '+rev.bestXp+' XP</span></div>'+
    (rev.worstMonster?'<div class="rv"><span class="k">👾 Toughest monster</span><span class="v">'+esc(rev.worstMonster)+' · '+rev.worstN+' slip'+(rev.worstN===1?'':'s')+'</span></div>':'')+
    '<div class="rv suggest"><span class="k">🎯 Next week</span><span class="v">'+esc(rev.suggestion)+'</span></div></div>';
}
/* full journal history, grouped by month, filtered in place */
function journalArchive(){
  var all=Object.keys(state.journal).sort().reverse();
  if(!all.length) return '<div class="empty">Your story starts with the first entry.</div>';
  var months=[], by={};
  all.forEach(function(d){ var m=d.slice(0,7); if(!by[m]){ by[m]=[]; months.push(m); } by[m].push(d); });
  var cur=RPG.todayKey().slice(0,7);
  return '<input id="jSearch" placeholder="Search your entries…" oninput="filterJournal(this.value)" style="margin-bottom:8px">'+
    months.map(function(m){
      var label=new Date(m+'-01T00:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'});
      var rows=by[m].map(function(d){
        var e=state.journal[d], mo=RPG.MOODS.find(function(x){return x.key===e.mood;});
        var s=state.sleep[d];
        return '<div class="jrow jarch"><span class="d">'+d.slice(5)+'</span><span>'+(mo?mo.emoji:'')+'</span>'+
          '<span style="flex:1">'+esc(e.note||'-')+'</span>'+
          (s?'<span class="hint">🌙'+s.hours+'h</span>':'')+'</div>';
      }).join('');
      return '<details class="jmonth"'+(m===cur?' open':'')+'><summary>'+label+' <span class="cnt">'+by[m].length+'</span></summary>'+rows+'</details>';
    }).join('');
}
function filterJournal(q){
  q=(q||'').toLowerCase().trim();
  document.querySelectorAll('.jrow.jarch').forEach(function(r){
    r.style.display = !q || r.textContent.toLowerCase().indexOf(q)>=0 ? '' : 'none';
  });
  document.querySelectorAll('details.jmonth').forEach(function(dt){ if(q) dt.open=true; });
}

function renderStats(){
  var w=RPG.weekStats(state);
  var maxXp=Math.max.apply(null,w.days.map(function(d){return w.per[d].xp;}).concat([1]));
  var chart=w.days.map(function(d){
    var v=w.per[d].xp, h=Math.round(v/maxXp*100);
    var lbl=['S','M','T','W','T','F','S'][new Date(d+'T00:00:00').getDay()];
    return '<div class="col"><div class="cl" style="color:var(--xp)">'+(v||'')+'</div><div class="colbar" style="height:'+Math.max(2,h)+'%"></div><div class="cl">'+lbl+'</div></div>';
  }).join('');
  var achHtml=RPG.ACHIEVEMENTS.map(function(a){
    var got=state.achievements.find(function(u){return u.id===a.id;});
    return '<div class="ach '+(got?'unlocked':'locked')+'"><span class="ic">'+a.icon+'</span>'+
      '<div><div class="n">'+a.name+'</div><div class="d">'+a.desc+(got?' · '+got.on:'')+'</div></div></div>';
  }).join('');
  var byDay={};
  state.log.forEach(function(e){ (byDay[e.day]=byDay[e.day]||[]).push(e); });
  var days=Object.keys(byDay).sort().reverse();
  var logHtml=days.map(function(d){
    return '<div class="logday">'+(d===RPG.todayKey()?'TODAY':d)+'</div>'+
      byDay[d].map(function(e){
        var t=new Date(e.t), tm=('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2);
        var dd=[];
        if(e.xp) dd.push('<span class="p">+'+e.xp+'xp</span>');
        if(e.coins>0) dd.push('<span class="c">+'+e.coins+'💰</span>');
        if(e.coins<0) dd.push('<span class="c">'+e.coins+'💰</span>');
        if(e.hp>0) dd.push('<span class="hg">+'+e.hp+'hp</span>');
        if(e.hp<0) dd.push('<span class="h">'+e.hp+'hp</span>');
        return '<div class="logrow"><span class="tm">'+tm+'</span><span>'+e.icon+'</span>'+
          '<span>'+esc(e.text)+'</span><span class="delta">'+dd.join(' ')+'</span></div>';
      }).join('');
  }).join('')||'<div class="empty">Nothing logged yet. Go clear a quest.</div>';

  $('#view').innerHTML='<div class="panel"><h3>📊 Week in review - for your Friday planning'+
    '<button class="btn small right" onclick="shareRecap()" title="Create a shareable image of your week">📸 Share my week</button></h3>'+
    reviewBox()+
    '<div class="statgrid">'+
    '<div class="stat"><div class="v g">'+w.tot.xp+'</div><div class="k">XP earned</div></div>'+
    '<div class="stat"><div class="v">'+w.tot.earned+'</div><div class="k">💰 earned</div></div>'+
    '<div class="stat"><div class="v">'+w.tot.spent+'</div><div class="k">💰 spent</div></div>'+
    '<div class="stat"><div class="v b">'+w.tot.quests+'</div><div class="k">quests cleared</div></div>'+
    '<div class="stat"><div class="v g">'+w.tot.habits+'</div><div class="k">habits kept</div></div>'+
    '<div class="stat"><div class="v r">'+w.tot.slips+'</div><div class="k">monster hits</div></div>'+
    '<div class="stat"><div class="v b">'+Math.floor(w.tot.focusMin/60)+'h'+(w.tot.focusMin%60)+'</div><div class="k">focus time</div></div>'+
    '<div class="stat"><div class="v" style="color:var(--orange)">'+(state.hero.bestStreak||0)+'d</div><div class="k">best streak</div></div>'+
    ((state.counters.deaths||0)>0?'<div class="stat"><div class="v r">'+state.counters.deaths+'</div><div class="k">defeats</div></div>'+
      '<div class="stat"><div class="v" style="color:var(--orange)">'+(state.counters.comebacks||0)+'</div><div class="k">🔥 comebacks</div></div>':'')+
    '</div>'+
    '<div class="chart">'+chart+'</div>'+
    '<div class="hint" style="text-align:center;margin-top:2px">XP per day, last 7 days</div>'+
    '<div class="moodstrip">'+w.moods.map(function(m){return '<span>'+m.emoji+'</span>';}).join('')+'</div>'+
    '<div class="hint" style="text-align:center">mood, last 7 days</div></div>'+
    focusPanel()+
    heatmapPanel()+
    insightsPanel()+
    trophyShelf()+
    leaderboardPanel()+
    '<div class="panel" style="margin-top:14px"><h3>🏆 Achievements <span class="cnt">'+state.achievements.length+'/'+RPG.ACHIEVEMENTS.length+'</span></h3>'+
    '<div class="achgrid">'+achHtml+'</div></div>'+
    '<div class="panel" style="margin-top:14px"><h3>📜 Adventure log</h3>'+logHtml+'</div>';
}

var seenDay = null;
function render(){
  if(RPG.dailyReset(state) && seenDay){ toast('🌅 <span class="p">New day - dailies are fresh</span>'); }
  seenDay = state.lastSeenDay;
  persist();
  applyLegend();
  renderHUD(); renderSkills(); renderTabs();
  ({today:renderToday,quests:renderQuests,habits:renderHabits,focus:renderFocus,market:renderMarket,journal:renderJournal,stats:renderStats}[tab])();
  if(typeof mascotMoodSync==='function') mascotMoodSync();
  if(typeof syncMusicPlayer==='function') syncMusicPlayer();
  if(typeof syncFocusPill==='function') syncFocusPill();
  // Satisfying cascade only when the tab actually changes; in-tab updates stay calm (no flicker).
  var vw=$('#view');
  if(vw && navAnim){ vw.classList.add('view-nav'); clearTimeout(navTimer); navTimer=setTimeout(function(){ vw.classList.remove('view-nav'); }, 520); }
  navAnim=false;
}

function afterAction(){
  if(state.hero.downed && state.hero.hp>=RPG.maxHpOf(state)){ maybeRise(); }
  var fresh=RPG.checkAchievements(state);
  if(fresh.length){ persist(); renderTabs(); announceAchievements(fresh); }
}

/* ---------- action handlers ---------- */
/* ---------- undo (replaces scary confirm() on destructive taps) ---------- */
var undoSnap=null;
function withUndo(label, fn){
  undoSnap=JSON.stringify(state);
  fn(); persist(); render();
  var t=document.createElement('div'); t.className='toast undo';
  t.innerHTML='<span>'+label+'</span><button onclick="doUndo(this)">↩ Undo</button>';
  $('#toasts').appendChild(t);
  setTimeout(function(){ t.remove(); },6000);
}
function doUndo(btn){
  if(!undoSnap) return;
  state=RPG.migrate(JSON.parse(undoSnap)); undoSnap=null;
  persist(); applyTheme(); render();
  if(btn&&btn.parentElement) btn.parentElement.remove();
  toast('<span class="p">↩ Restored</span>');
}

function doQuest(id){ var r=A.completeQuest(state,id); persist(); render(); fx(r); if(r&&r.xp>0) popCheck(); afterAction(); }
function delQuest(id){
  var q=state.quests.find(function(x){return x.id===id;});
  withUndo('🗑 Quest deleted'+(q?': '+esc(q.title):''), function(){ A.deleteQuest(state,id); });
}
function promoteQ(id){
  var g=A.promoteQuest(state,id);
  if(g){ persist(); render(); toast('⬆️ <span class="c">Promoted to MAIN QUEST</span>'); SND.ach(); }
}
function addQuest(){
  var t=$('#qTitle').value.trim(); if(!t) return;
  A.addQuest(state,{title:t,diff:$('#qDiff').value,skillId:$('#qSkill').value||null,
    due:$('#qDue').value||null,recurring:false,days:null,main:null});
  persist(); render();
}
function addDaily(){
  var t=$('#dTitle').value.trim(); if(!t) return;
  A.addQuest(state,{title:t,diff:$('#dDiff').value,skillId:$('#dSkill').value||null,
    due:null,recurring:true,days:pendingDays.slice(),main:null});
  pendingDays=[];
  persist(); render();
}
function addStep(goalId){
  var el=$('#step_'+goalId), t=el?el.value.trim():''; if(!t) return;
  var dueEl=$('#stepdue_'+goalId);
  A.addQuest(state,{title:t,diff:$('#stepd_'+goalId).value,due:(dueEl&&dueEl.value)||null,main:goalId});
  persist(); render();
}
function addGoal(){ var t=$('#gTitle').value.trim(); if(!t) return;
  A.addGoal(state,{title:t,note:$('#gNote').value}); persist(); render(); }
function doGoal(id){
  var p=A.goalProgress(state,id);
  if(p.total>0 && p.done<p.total && !confirm('Steps are at '+p.done+'/'+p.total+'. Complete the main quest anyway?')) return;
  var r=A.completeGoal(state,id); persist(); render(); if(r){ confetti(); fx(r); } afterAction();
}
function delGoal(id){
  var g=state.goals.find(function(x){return x.id===id;});
  withUndo('🗑 Main quest deleted'+(g?': '+esc(g.title):'')+' (steps kept as side quests)', function(){ A.deleteGoal(state,id); });
}
function doHabit(id){ var r=A.doHabit(state,id); persist(); render(); fx(r); if(r&&r.xp>0) popCheck(); afterAction(); }
function slip(id){
  undoSnap=JSON.stringify(state); // misclicks happen - honesty still wins
  var r=A.slipHabit(state,id); persist(); render(); fx(r); afterAction();
  var t=document.createElement('div'); t.className='toast undo';
  t.innerHTML='<span>👾 Slip logged</span><button onclick="doUndo(this)">↩ Misclick? Undo</button>';
  $('#toasts').appendChild(t);
  setTimeout(function(){ t.remove(); },6000);
}
function addHabit(type){
  var el=$(type==='good'?'#hgTitle':'#hbTitle'), t=el.value.trim(); if(!t) return;
  A.addHabit(state,{title:t,type:type,skillId:type==='good'?($('#hgSkill').value||null):null,
    target:type==='good'?Number(($('#hgTarget')||{}).value||7):7});
  persist(); render();
}
function delHabit(id){
  var h=state.habits.find(function(x){return x.id===id;});
  withUndo('🗑 '+(h&&h.type==='bad'?'Monster':'Habit')+' deleted'+(h?': '+esc(h.title):''), function(){ A.deleteHabit(state,id); });
}
function buy(id){
  var r=A.buy(state,id);
  if(r&&r.fail==='coins'){ toast('<span class="h">Not enough coins - go earn them</span>','dmg'); return; }
  if(r&&r.fail==='shield'){ toast('<span class="h">You already carry a Streak Shield</span>','dmg'); return; }
  if(r&&r.fail==='limit'){ toast('<span class="h">Daily cap reached - come back tomorrow</span>','dmg'); return; }
  if(r&&r.shield){ persist(); render(); toast('🛡 <span class="c">Streak Shield equipped - one missed day is covered</span>'); SND.buy(); afterAction(); return; }
  persist(); render(); fx(r); afterAction();
}
function addShop(){
  var t=$('#sTitle').value.trim(), p=Number($('#sPrice').value); if(!t||!p) return;
  var hp=shopTab==='hotel'?Number(($('#sHp')||{}).value||0):0;
  var dmg=shopTab==='black'?Number(($('#sDmg')||{}).value||0):0;
  var limEl=$('#sLimit'), lim=limEl&&limEl.value!==''?Number(limEl.value):undefined;
  A.addShopItem(state,{title:t,price:p,tab:shopTab,hp:hp,dmg:dmg,limit:lim}); persist(); render();
}
function delShop(id){
  var it=state.shop.find(function(x){return x.id===id;});
  withUndo('🗑 Reward removed'+(it?': '+esc(it.title):''), function(){ A.deleteShopItem(state,id); });
}
function claimChest(){ var r=A.claimChest(state); persist(); render(); if(r){ chestScreen(r); flyCoins(r.coins); } afterAction(); }
function saveJournal(){
  var mood=pendingMood||((state.journal[RPG.todayKey()]||{}).mood);
  if(!mood){ toast('<span class="h">Pick a mood first</span>','dmg'); return; }
  var r=A.logJournal(state,mood,$('#jNote').value); pendingMood=null; pendingNote=null; persist(); render(); fx(r); afterAction();
}
function saveSleep(){ var r=A.logSleep(state,$('#slHours').value,pendingQuality); pendingHours=null; persist(); render(); fx(r); afterAction(); }
function addSkillPrompt(){ openSkillModal(); }
function openSkillModal(){
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>✨ NEW LIFE AREA</h2>'+
    '<div class="flabel">Name</div><input id="skName" maxlength="20" placeholder="e.g. French, Driving, Music">'+
    '<div class="flabel">Emoji</div><div class="setrow"><input id="skIcon" maxlength="4" placeholder="type any emoji, e.g. 🇫🇷 🚗 🎸" style="max-width:220px"></div>'+
    '<div class="setrow" style="margin-top:12px"><button class="btn go" onclick="saveSkill()">Create</button>'+
    '<button class="btn" onclick="closeModal()">Cancel</button></div></div>';
  $('#skName').focus();
}
function saveSkill(){
  var n=$('#skName').value.trim(); if(!n){ toast('<span class="h">Give it a name</span>','dmg'); return; }
  var ic=$('#skIcon').value.trim()||'✨';
  A.addSkill(state,n,ic); persist(); closeModal(); render();
}
function delSkill(id){ if(confirm('Delete this life area? Its quests/habits stay but lose the tag.')){ A.deleteSkill(state,id); persist(); render(); } }
function exportICS(){
  var ics=RPG.buildICS(state);
  if(!ics){ toast('<span class="h">No quests with due dates to export</span>','dmg'); return; }
  var blob=new Blob([ics],{type:'text/calendar'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='scalemylife-quests.ics'; a.click();
  toast('<span class="p">📅 Calendar file downloaded - open it to import</span>');
}

/* ---------- character customization ---------- */
var AVATARS=['🧙','🦸','🥷','🤺','🧝','🧑‍🚀','🦊','🐺','🐉','🦁','🛡️','🏹','🧛','🤖','👑','🐯','🦅','🔥','🌟','🎮','🧗','🏋️','📚','🚀',
  '🧚','🧜','🧞','🦄','🐲','🦉','🐢','🦋','🌸','🍀','⚡','💫','🎨','🎸','⚽','🏀','🧑‍🍳','🧑‍⚕️','🧑‍💻','🧑‍🎓','🧑‍🔬','🕵️','🦹','🐼'];
var pickedAv=null;
function openCharacter(){
  pickedAv=pickedAv||state.hero.avatar;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>🧝 CHARACTER</h2>'+
    '<div class="flabel">Name</div><input id="chName" maxlength="24" value="'+esc(state.hero.name)+'">'+
    '<div class="flabel">Title (shown under your name)</div><input id="chTitle" maxlength="34" placeholder="e.g. Essay Slayer · Route Master" value="'+esc(state.hero.title||'')+'">'+
    titleChips()+
    '<div class="flabel">Avatar</div><div class="avpick">'+AVATARS.map(function(a){
      return '<button class="'+(pickedAv===a?'on':'')+'" onclick="pickedAv=\''+a+'\';openCharacter()">'+a+'</button>';}).join('')+'</div>'+
    '<div class="setrow"><input id="chCustomAv" maxlength="4" placeholder="…or type any emoji" style="max-width:180px"><span class="hint">overrides the grid pick</span></div>'+
    '<div class="flabel">Theme</div><div class="themes">'+Object.keys(THEMES).map(function(k){
      var t=THEMES[k];
      return '<button class="'+(state.settings.theme===k?'on':'')+'" title="'+t.name+'" style="background:'+t.panel+'" onclick="setTheme(\''+k+'\')"><i style="background:'+t.accent+'"></i></button>';
    }).join('')+'</div>'+
    frameChips()+
    boonChips()+
    (RPG.ascendReady(state)?'<div class="ascendbox"><b>♻️ Ready to ascend</b><span>You’re Lv.'+state.hero.level+' - start a new season for a permanent boon.</span><button class="btn ascend" onclick="closeModal();openAscend()">Ascend to Season '+((state.hero.ascension||0)+1)+' ▶</button></div>':'')+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="saveCharacter()">Save</button>'+
    '<button class="btn" onclick="closeModal()">Cancel</button></div></div>';
}
function frameChips(){
  var owned=(state.cosmetics&&state.cosmetics.frames)||[];
  if(!owned.length) return '<div class="flabel">Avatar frame</div><div class="hint">Win glowing avatar frames as rare loot from daily chests.</div>';
  return '<div class="flabel">Avatar frame</div><div class="framepick">'+
    '<button class="'+(!state.hero.frame?'on':'')+'" onclick="setFrame(\'\')">none</button>'+
    owned.map(function(id){ var f=RPG.frameById(id); if(!f) return '';
      return '<button class="'+(state.hero.frame===id?'on':'')+'" style="border-color:'+f.color+';box-shadow:0 0 8px '+f.glow+'" onclick="setFrame(\''+id+'\')">'+esc(f.name)+'</button>';
    }).join('')+'</div>';
}
function setFrame(id){ state.hero.frame=id; persist(); renderHUD(); openCharacter(); }
function boonChips(){
  var b=(state.hero.boons)||{}; var keys=Object.keys(b).filter(function(k){return b[k]>0;});
  if(!keys.length) return '';
  return '<div class="flabel">Ascension boons · Season '+(state.hero.ascension||0)+'</div><div class="boonchips">'+
    keys.map(function(k){ var bo=RPG.boonById(k); return bo?'<span class="boonchip" title="'+esc(bo.desc)+'">'+bo.icon+' '+esc(bo.name)+(b[k]>1?' ×'+b[k]:'')+'</span>':''; }).join('')+'</div>';
}
/* ---------- ascension (prestige) ---------- */
function openRanks(){
  var lvl=state.hero.level, cur=RPG.rankFor(lvl).code;
  var rows=RPG.RANKS.map(function(rk,i){
    var next=RPG.RANKS[i+1];
    var span=next?('Lv.'+rk.min+'-'+(next.min-1)):('Lv.'+rk.min+'+');
    var isCur=rk.code===cur;
    var c=RANK_COLORS[rk.code]||'var(--gold)';
    return '<div class="rankrow'+(isCur?' cur':'')+'"><span class="rk" style="color:'+c+';border-color:'+c+'">'+rk.code+'</span>'+
      '<div class="grow"><b>'+esc(rk.name)+'</b>'+(isCur?' <span class="chip muted">you are here</span>':'')+'</div>'+
      '<span class="rl">'+span+'</span></div>';
  }).join('');
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>🎖️ RANKS & PRESTIGE</h2>'+
    '<div class="hint">Every level you gain lifts your rank. Ranks run from <b>E</b> (Novice) up to <b>SS</b> (Legend). Your rank shows on your card and the leaderboard.</div>'+
    '<div class="ranklist">'+rows+'</div>'+
    '<div class="flabel" style="margin-top:14px">♻️ Prestige (Ascension)</div>'+
    '<div class="hint">At <b>Lv.'+RPG.ASCEND_LEVEL+' (rank S)</b> you can <b>Ascend</b> into a new season: your level and rank reset to the bottom for a fresh climb, but you keep everything else - coins, quests, habits, streak, titles and cosmetics. Each ascension grants a <b>permanent boon</b> (like +8% XP forever) that stacks every season. The ✦S badge on your card shows how many times you have ascended.</div>'+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="closeModal()">Got it</button></div></div>';
}
function openDefeatInfo(){
  var hard=state.settings.hardcore;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2 style="color:var(--hp)">💀 IF YOU LOSE</h2>'+
    '<div class="hint">Slips from bad habits chip your ❤️ HP. If it hits zero you’re <b style="color:var(--hp)">Defeated</b> - but never wiped:</div>'+
    '<div class="ranklist" style="margin-top:8px">'+
      '<div class="rankrow"><span class="rk" style="color:var(--good);border-color:var(--good)">✓</span><div class="grow"><b>Progress stays.</b> No lost levels, XP or streak.</div></div>'+
      '<div class="rankrow"><span class="rk" style="color:var(--hp);border-color:var(--hp)">💰</span><div class="grow">You drop <b>'+(hard?'half':'a quarter')+' of your coins.</b></div></div>'+
      '<div class="rankrow"><span class="rk" style="color:var(--hp);border-color:var(--hp)">▼</span><div class="grow"><b>Downed:</b> half XP and no coins earned.</div></div>'+
      '<div class="rankrow"><span class="rk" style="color:var(--orange);border-color:var(--orange)">🔥</span><div class="grow"><b>Comeback:</b> heal back to full HP (sleep or the 🛏️ Hotel) and you instantly <b>Rise</b> - fully healed, a bonus, and earning normally again.</div></div>'+
    '</div>'+
    '<div class="hint" style="margin-top:8px">Once down, more slips can’t re-KO you that day. Want it harder? <b>Hardcore</b> in ⚙️ Settings.</div>'+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="closeModal()">Got it</button></div></div>';
}
function openAscend(){
  if(!RPG.ascendReady(state)){ toast('<span class="h">Reach Lv.'+RPG.ASCEND_LEVEL+' (rank S) to ascend</span>','dmg'); return; }
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>♻️ ASCEND - SEASON '+((state.hero.ascension||0)+1)+'</h2>'+
    '<div class="hint">You’re Lv.'+state.hero.level+'. Ascending resets your level and rank for a fresh climb - but you keep your coins, quests, habits, streak, titles, badges and cosmetics. In return you choose a <b>permanent boon</b> that stacks every season.</div>'+
    '<div class="boonpick">'+RPG.BOONS.map(function(bo){
      var have=(state.hero.boons&&state.hero.boons[bo.id])||0;
      return '<button onclick="doAscend(\''+bo.id+'\')"><span class="bi">'+bo.icon+'</span><b>'+esc(bo.name)+(have?' · owned ×'+have:'')+'</b><small>'+esc(bo.desc)+'</small></button>';
    }).join('')+'</div>'+
    '<div class="setrow"><button class="btn" onclick="closeModal()">Not yet</button></div></div>';
}
function doAscend(boonId){
  if(!confirm('Ascend now? Your level resets to 1, but you keep everything else and gain a permanent boon.')) return;
  var r=RPG.ascend(state,boonId); persist(); closeModal();
  if(r){ ascendScreen(r); }
  render(); afterAction();
}
function ascendScreen(r){
  SND.rankup(); confetti(true); setTimeout(function(){confetti(true);},500); shake();
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="rankbig" style="color:var(--gold);font-size:64px">♻️</div>'+
    '<div class="big" style="color:var(--gold)">ASCENDED</div>'+
    '<div class="rankname" style="color:var(--gold)">SEASON '+r.ascension+'</div>'+
    '<div class="sub">A new climb begins from Lv.1. Permanent boon gained:</div>'+
    '<div class="sub"><b>'+r.boon.icon+' '+esc(r.boon.name)+'</b> - '+esc(r.boon.desc)+'</div>'+
    '<button class="btn go" onclick="closeOverlay()">Begin ▶</button></div>';
}
function titleChips(){
  var unlocked=state.achievements.map(function(u){
    return RPG.ACHIEVEMENTS.find(function(a){return a.id===u.id;});
  }).filter(Boolean);
  var locked=RPG.ACHIEVEMENTS.length-unlocked.length;
  if(!unlocked.length) return '<div class="hint">Earn achievements to unlock wearable titles ('+locked+' locked).</div>';
  return '<div class="hint" style="margin-top:6px">Unlocked titles - tap to wear:</div><div class="titlechips">'+
    unlocked.map(function(a){
      return '<button onclick="wearTitle(\''+a.id+'\')">'+a.icon+' '+esc(a.name)+'</button>';
    }).join('')+'</div>'+(locked?'<div class="hint">'+locked+' more locked in 📊 Stats → Achievements.</div>':'');
}
function wearTitle(id){
  var a=RPG.ACHIEVEMENTS.find(function(x){return x.id===id;});
  if(a && $('#chTitle')) $('#chTitle').value=a.name;
}
function setTheme(k){ state.settings.theme=k; persist(); applyTheme(); openCharacter(); }
function saveCharacter(){
  var n=$('#chName').value.trim(); if(n) state.hero.name=n;
  state.hero.title=$('#chTitle').value.trim();
  var custom=$('#chCustomAv').value.trim();
  state.hero.avatar=custom||pickedAv||state.hero.avatar;
  pickedAv=null;
  persist(); closeModal(); render();
}

/* ---------- settings ---------- */
function openSettings(){
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>⚙️ SETTINGS</h2>'+
    '<div class="setrow"><button class="btn" onclick="closeModal();openCharacter()">🧝 Character & theme</button>'+
    '<button class="btn" onclick="closeModal();startTour()">🎯 Interactive tour</button></div>'+
    '<div class="setrow"><button class="btn" onclick="tut(0)">❓ How it works</button></div>'+
    '<div class="setrow">'+
    '<button class="btn" onclick="toggleSound()">'+(state.settings.sound?'🔊 Sound ON':'🔇 Sound OFF')+'</button>'+
    '<button class="btn" onclick="toggleReminders()">'+(state.settings.reminders?'🔔 Reminders ON':'🔕 Reminders OFF')+'</button>'+
    '<button class="btn" onclick="toggleMascotSetting()">'+(state.settings.mascot!==false?'🦉 Sage ON':'🦉 Sage OFF')+'</button></div>'+
    '<div class="setrow"><button class="btn'+(state.settings.hardcore?' hcon':'')+'" onclick="toggleHardcore()" title="Defeat costs half your coins and revives you at just 10 HP">'+(state.settings.hardcore?'💀 Hardcore ON':'🛡️ Hardcore OFF')+'</button>'+
    '<span class="hint" style="flex:1;align-self:center">Defeat bites harder: bigger coin loss, lower revival HP.</span></div>'+
    cloudSection()+
    '<div class="setrow"><button class="btn" onclick="exportSave()">⬇ Export save (JSON)</button>'+
    '<button class="btn" onclick="$(\'#importFile\').click()">⬆ Import save</button></div>'+
    '<input type="file" id="importFile" accept=".json" style="display:none" onchange="importSave(this)">'+
    (hasPreCloudBackup()?'<div class="setrow"><button class="btn" onclick="restorePreCloud()" title="Bring back the save from just before the last cloud load">↩ Restore save from before last sync</button></div>':'')+
    '<div class="setrow"><button class="btn" style="border-color:var(--hp);color:var(--hp)" onclick="resetAll()">Reset everything</button>'+
    '<button class="btn" onclick="closeModal()">Close</button></div>'+
    '<div class="hint">Data lives in this browser (localStorage). Export a JSON backup from time to time.</div></div>';
  if(state.settings.friends && cloudOn()) setTimeout(loadFriendList,0);
}
function toggleSound(){ state.settings.sound=!state.settings.sound; persist(); openSettings(); if(state.settings.sound) SND.earn(); }
function toggleHardcore(){
  if(!state.settings.hardcore && !confirm('Turn on Hardcore? Being defeated will cost half your coins and revive you at just 10 HP. You can turn it off any time.')) return;
  state.settings.hardcore=!state.settings.hardcore; persist(); openSettings();
  toast(state.settings.hardcore?'💀 <span class="h">Hardcore ON - defeat bites hard now</span>':'🛡️ <span class="p">Hardcore off</span>');
}
function toggleReminders(){
  if(state.settings.reminders){ state.settings.reminders=false; persist(); openSettings(); return; }
  if(typeof Notification==='undefined'){ toast('<span class="h">Notifications not supported in this browser</span>','dmg'); return; }
  Notification.requestPermission().then(function(p){
    if(p==='granted'){ state.settings.reminders=true; persist(); openSettings(); toast('🔔 <span class="p">Reminders on - evening nudge + focus alerts</span>'); }
    else toast('<span class="h">Permission denied - enable notifications in your browser settings</span>','dmg');
  });
}

/* quest of atonement: a freshly broken streak can be mended before midnight */
function redemptionBar(){
  var e=A.redeemEligible(state);
  if(!e.active) return '';
  var progress=e.total>0?('Clear all of today\u2019s dailies ('+e.done+'/'+e.total+')'):'Earn some XP today';
  return '<div class="redeembar">🕯 <b>Quest of Atonement</b> - your '+e.streak+'-day streak lies broken. '+progress+' and mend it before midnight.'+
    '<span class="nb">'+(e.eligible
      ?'<button class="btn small go" onclick="mendStreak()">🕯 Mend the streak</button>'
      :'<span class="chip muted">'+(e.total>0?e.done+'/'+e.total+' done':'no XP yet')+'</span>')+'</span></div>';
}
function mendStreak(){
  var r=A.redeemStreak(state); persist(); render();
  if(!r||r.fail) return;
  SND.rankup(); confetti(true); sparks('🕯');
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="rankbig" style="font-size:64px">🕯</div>'+
    '<div class="big" style="color:var(--orange)">STREAK MENDED</div>'+
    '<div class="sub">The flame burns again - <b style="color:var(--orange)">'+r.streak+' days</b> and counting.</div>'+
    '<button class="btn go" onclick="closeOverlay()">Onward ▶</button></div>';
  afterAction();
}

function cloudNudgeDue(){
  return typeof SMLCloud!=='undefined' && !SMLCloud.session() && !state.settings.cloudNudgeOff &&
    (state.hero.level>=3 || state.hero.streak>=3);
}

/* ---------- reminders (Notification API - fires while the app is open) ---------- */
function notifyNow(title, body){
  try{ if(typeof Notification!=='undefined' && Notification.permission==='granted') new Notification(title,{body:body,icon:'icon-192.png',tag:'sml'}); }catch(e){}
}
function checkReminders(){
  if(!state || !state.settings.reminders) return;
  if(typeof Notification==='undefined' || Notification.permission!=='granted') return;
  var today=RPG.todayKey();
  if(new Date().getHours()>=18 && state.remindedOn!==today){
    state.remindedOn=today;
    var c=A.chestStatus(state), j=state.journal[today];
    if(c.total>0 && c.done<c.total) notifyNow('ScaleMyLife','🎁 '+(c.total-c.done)+' dail'+((c.total-c.done)===1?'y':'ies')+' left before the chest closes for today.');
    else if(!j) notifyNow('ScaleMyLife','📔 One honest line before the day ends? Mood log pays +15xp.');
    var b=state.boss;
    if(b && !b.doneOn && A.bossDaysLeft(state)===1) notifyNow('ScaleMyLife','🐲 The weekly boss escapes tomorrow: '+b.title);
    persist();
  }
}

/* ---------- shareable weekly recap card ---------- */
function shareRecap(){
  var cv=document.createElement('canvas'); cv.width=1080; cv.height=1080;
  var ctx=cv.getContext&&cv.getContext('2d');
  if(!ctx){ toast('<span class="h">Sharing not supported in this browser</span>','dmg'); return; }
  var css=getComputedStyle(document.documentElement);
  var C={bg:css.getPropertyValue('--bg').trim()||'#12101f',panel:css.getPropertyValue('--panel').trim()||'#1b1830',
    gold:css.getPropertyValue('--gold').trim()||'#f5c542',ink:css.getPropertyValue('--ink').trim()||'#e8e4ff',
    muted:css.getPropertyValue('--muted').trim()||'#8f88b8',xp:'#3ddc84',hp:'#ff5470',blue:'#5aa2ff'};
  var w=RPG.weekStats(state), h=state.hero, r=RPG.rankFor(h.level);
  // backdrop
  var grad=ctx.createLinearGradient(0,0,1080,1080);
  grad.addColorStop(0,C.bg); grad.addColorStop(.55,C.panel); grad.addColorStop(1,C.bg);
  ctx.fillStyle=grad; ctx.fillRect(0,0,1080,1080);
  ctx.globalAlpha=.16;
  var rg=ctx.createRadialGradient(880,160,10,880,160,520); rg.addColorStop(0,C.gold); rg.addColorStop(1,'transparent');
  ctx.fillStyle=rg; ctx.fillRect(0,0,1080,1080);
  var rg2=ctx.createRadialGradient(140,940,10,140,940,560); rg2.addColorStop(0,C.blue); rg2.addColorStop(1,'transparent');
  ctx.fillStyle=rg2; ctx.fillRect(0,0,1080,1080);
  ctx.globalAlpha=1;
  // frame
  ctx.strokeStyle=C.gold; ctx.lineWidth=3; ctx.strokeRect(36,36,1008,1008);
  // header
  ctx.textAlign='center'; ctx.fillStyle=C.gold;
  ctx.font='700 44px "IBM Plex Mono", monospace';
  ctx.fillText('S C A L E   M Y   L I F E',540,120);
  ctx.fillStyle=C.muted; ctx.font='500 30px "IBM Plex Mono", monospace';
  var d0=new Date(w.days[0]+'T00:00:00'), d1=new Date(w.days[6]+'T00:00:00');
  ctx.fillText(d0.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' - '+d1.toLocaleDateString(undefined,{month:'short',day:'numeric'}),540,168);
  // avatar + name
  ctx.font='150px serif'; ctx.fillText(h.avatar,540,340);
  ctx.fillStyle=C.ink; ctx.font='700 56px Karla, sans-serif'; ctx.fillText(h.name,540,430);
  ctx.fillStyle=C.gold; ctx.font='700 34px "IBM Plex Mono", monospace';
  ctx.fillText(r.code+' · '+r.name.toUpperCase()+'   LV.'+h.level+((h.ascension||0)>0?'   ✦ S'+h.ascension:''),540,478);
  if(h.title){ ctx.fillStyle=C.muted; ctx.font='italic 30px Karla, sans-serif'; ctx.fillText('“'+h.title+'”',540,522); }
  // stat tiles
  var tiles=[['XP EARNED',w.tot.xp,C.xp],['QUESTS',w.tot.quests,C.blue],['FOCUS',Math.floor(w.tot.focusMin/60)+'h'+(w.tot.focusMin%60?String(w.tot.focusMin%60).padStart(2,'0'):''),C.gold],
             ['HABITS KEPT',w.tot.habits,C.xp],['STREAK',h.streak+'d',C.hp],['COINS',w.tot.earned,C.gold]];
  var tw=300, th=150, gap=24, x0=(1080-3*tw-2*gap)/2, y0=590;
  tiles.forEach(function(t,i){
    var x=x0+(i%3)*(tw+gap), y=y0+Math.floor(i/3)*(th+gap);
    ctx.fillStyle='rgba(255,255,255,0.05)'; ctx.strokeStyle='rgba(255,255,255,0.14)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.roundRect(x,y,tw,th,18); ctx.fill(); ctx.stroke();
    ctx.fillStyle=t[2]; ctx.font='700 58px "IBM Plex Mono", monospace'; ctx.fillText(String(t[1]),x+tw/2,y+82);
    ctx.fillStyle=C.muted; ctx.font='600 24px Karla, sans-serif'; ctx.fillText(t[0],x+tw/2,y+122);
  });
  // mood strip
  ctx.font='44px serif';
  w.moods.forEach(function(m,i){ ctx.fillText(m.emoji,340+i*68,975); });
  ctx.fillStyle=C.muted; ctx.font='500 26px "IBM Plex Mono", monospace';
  ctx.fillText('scale-my-life.vercel.app',540,1032);
  // export
  cv.toBlob(function(blob){
    if(!blob){ toast('<span class="h">Could not create the image</span>','dmg'); return; }
    var file; try{ file=new File([blob],'scalemylife-week.png',{type:'image/png'}); }catch(e){}
    if(file && navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
      navigator.share({files:[file],title:'My week in ScaleMyLife'}).catch(function(){});
    } else {
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='scalemylife-week.png'; a.click();
      toast('📸 <span class="p">Recap image saved - post it anywhere</span>');
    }
    SND.chest();
  },'image/png');
}

/* ---------- cloud sync UI ---------- */
function cloudSection(){
  if(typeof SMLCloud==='undefined') return '';
  if(!SMLCloud.configured()){
    return '<div class="flabel">☁️ Cloud sync</div>'+
      '<div class="hint">One free account = your save on every device. Paste your Supabase <b>publishable key</b> once to enable (Dashboard → Settings → API keys).</div>'+
      '<div class="setrow" style="margin-top:6px"><input id="cKey" placeholder="sb_publishable_… or anon key"><button class="btn" onclick="cloudSaveKey()">Enable</button></div>';
  }
  var sess=SMLCloud.session();
  if(!sess){
    return '<div class="flabel">☁️ Cloud sync</div>'+
      '<div class="hint">Your save currently lives only in this browser. Sign in and it follows you everywhere.</div>'+
      '<input id="cEmail" type="email" placeholder="email" style="margin-top:6px">'+
      '<input id="cPw" type="password" placeholder="password (8+ characters)" style="margin-top:6px">'+
      '<div class="setrow" style="margin-top:8px"><button class="btn go" onclick="cloudSignIn()">Sign in</button>'+
      '<button class="btn" onclick="cloudSignUp()">Create account</button></div>'+
      '<div class="hint" id="cMsg"></div>';
  }
  var ls=SMLCloud.lastSync();
  return '<div class="flabel">☁️ Cloud sync</div>'+
    '<div class="hint">Synced as <b>'+esc(sess.user.email||'')+'</b>'+(ls?' · last sync '+new Date(ls).toLocaleString():'')+'</div>'+
    '<div class="setrow" style="margin-top:6px"><button class="btn go" onclick="cloudSyncNow()">⟳ Sync now</button>'+
    '<button class="btn" onclick="cloudSignOut()">Sign out</button></div>'+
    '<div class="setrow"><button class="btn" onclick="toggleBoard()">'+(state.settings.board?'🏆 Leaderboard: IN':'🏆 Join the leaderboard')+'</button>'+
    '<button class="btn" onclick="toggleFriends()">'+(state.settings.friends?'🤝 Friends: ON':'🤝 Enable friends')+'</button></div>'+
    '<div class="hint">'+(state.settings.board?'On the global board - sharing name, avatar, level, rank, weekly XP, best streak.':'Global board is opt-in. Only ever shares those six fields - never your save.')+'</div>'+
    friendsBox()+
    '<div class="hint" id="cMsg"></div>';
}
function cloudMsg(t,bad){ var el=$('#cMsg'); if(el) el.innerHTML=bad?'<span class="h">'+esc(t)+'</span>':'<span class="p">'+esc(t)+'</span>'; }
function cloudSaveKey(){
  var k=($('#cKey').value||'').trim(); if(!k) return;
  SMLCloud.setKey(k); openSettings();
  toast('☁️ <span class="p">Cloud sync enabled - now create your account</span>');
}
function cloudSignUp(){
  var e=($('#cEmail').value||'').trim(), p=$('#cPw').value||'';
  if(!e||p.length<8){ cloudMsg('Enter an email and a password of at least 8 characters', true); return; }
  cloudMsg('Creating account…');
  SMLCloud.signUp(e,p).then(function(r){
    if(!r.ok){ cloudMsg(r.error,true); return; }
    if(r.needsConfirm){ cloudMsg('Almost there - confirm the email we sent you, then press Sign in.'); return; }
    afterCloudSignIn();
  });
}
function cloudSignIn(){
  var e=($('#cEmail').value||'').trim(), p=$('#cPw').value||'';
  if(!e||!p){ cloudMsg('Enter your email and password', true); return; }
  cloudMsg('Signing in…');
  SMLCloud.signIn(e,p).then(function(r){
    if(!r.ok){ cloudMsg(r.error,true); return; }
    afterCloudSignIn();
  });
}
/* after an explicit sign-in: if a cloud save exists, let the user pick a side.
   The recommended (progress-preserving) choice is spelled out so nobody
   accidentally overwrites a more-advanced save. */
function afterCloudSignIn(){
  SMLCloud.pull().then(function(r){
    if(r.ok && r.exists && r.data && r.data.hero){
      var lv=r.data.hero.level||1, when=(r.data.updatedAt||'').slice(0,10);
      var cloudAhead=cloudAheadOf(r.data)>0;
      var msg=cloudAhead
        ? 'Your cloud account has a MORE ADVANCED save ('+(r.data.hero.name||'Hero')+', Lv.'+lv+(when?', '+when:'')+') than this device.\n\nOK = load it here (recommended)\nCancel = keep THIS device and overwrite the cloud'
        : 'Your cloud account has a save ('+(r.data.hero.name||'Hero')+', Lv.'+lv+(when?', '+when:'')+'), but THIS device looks further along.\n\nOK = load the cloud save anyway\nCancel = keep this device (recommended) - it will update the cloud';
      if(confirm(msg)){ adoptCloud(r.data); openSettings(); toast('☁️ <span class="p">Cloud save loaded</span>'); SND.ach(); return; }
      // keeping this device: push it up so the cloud matches
    }
    persist(); pushCloudNow(); applyTheme(); render(); openSettings();
    toast('☁️ <span class="p">Cloud sync is on</span>'); SND.ach();
  });
}
function cloudSignOut(){ SMLCloud.signOut().then(function(){ openSettings(); toast('☁️ Signed out - save stays on this device'); }); }
function toggleBoard(){
  if(!cloudOn()){ toast('<span class="h">Sign in first to join the leaderboard</span>','dmg'); return; }
  if(state.settings.board){
    state.settings.board=false; persist(); openSettings();
    SMLCloud.leaveBoard().then(function(){ toast('🏆 Left the leaderboard - your row is gone'); });
  } else {
    state.settings.board=true; persist(); openSettings();
    SMLCloud.pushBoard(boardProfile()).then(function(r){
      toast(r.ok?'🏆 <span class="c">You are on the board!</span>':'<span class="h">'+esc(r.error||'Could not join')+'</span>', r.ok?'':'dmg');
    });
  }
}
/* Two-way sync: pull first, adopt the cloud save if it's more advanced,
   otherwise push this device up. (Previously this only pushed - which could
   overwrite a newer save made on another device.) */
function cloudSyncNow(){
  cloudMsg('Syncing…');
  SMLCloud.pull().then(function(r){
    if(r.ok && r.exists && r.data && r.data.hero && cloudAheadOf(r.data)>0){
      adoptCloud(r.data); openSettings();
      cloudMsg('Loaded your more advanced cloud save ✓'); SND.ach(); return;
    }
    SMLCloud.push(state).then(function(p){ openSettings(); cloudMsg(p.ok?'This device is now saved to the cloud ✓':(p.error||'Sync failed'), !p.ok); });
  });
}
function toggleFriends(){
  if(!cloudOn()){ toast('<span class="h">Sign in first to use friends</span>','dmg'); return; }
  state.settings.friends=!state.settings.friends; persist(); openSettings();
  if(state.settings.friends){ SMLCloud.pushBoard(boardProfile(), !!state.settings.board).then(function(){ toast('🤝 <span class="c">Friends on - share your code!</span>'); }); }
}
function friendsBox(){
  if(!state.settings.friends) return '<div class="hint">Enable friends to get a shareable code and add people to a private Friends board.</div>';
  var code=SMLCloud.friendCode();
  return '<div class="friendbox"><div class="flabel">Your friend code</div>'+
    '<div class="codebox"><b id="myCode">'+esc(code)+'</b><button class="btn small" onclick="copyCode()">Copy</button></div>'+
    '<div class="flabel">Add a friend by code</div>'+
    '<div class="setrow"><input id="frCode" maxlength="8" placeholder="e.g. A1B2C3D4" style="text-transform:uppercase"><button class="btn go" onclick="addFriendByCode()">Add</button></div>'+
    '<div class="hint" id="frMsg"></div><div id="frList"></div></div>';
}
function copyCode(){
  var c=SMLCloud.friendCode();
  try{ navigator.clipboard&&navigator.clipboard.writeText(c); }catch(e){}
  toast('📋 <span class="c">Code copied: '+esc(c)+'</span>');
}
function frMsg(t,bad){ var el=$('#frMsg'); if(el) el.innerHTML=bad?'<span class="h">'+esc(t)+'</span>':'<span class="p">'+esc(t)+'</span>'; }
function addFriendByCode(){
  var code=($('#frCode')&&$('#frCode').value||'').toUpperCase().trim();
  if(code.length<4){ frMsg('Enter a friend code',true); return; }
  if(code===SMLCloud.friendCode()){ frMsg('That’s your own code 🙂',true); return; }
  frMsg('Looking up…');
  SMLCloud.findByCode(code).then(function(r){
    if(!r.ok){ frMsg(r.error,true); return; }
    if(!r.found){ frMsg('No hero with that code',true); return; }
    SMLCloud.addFriend(r.profile.user_id).then(function(a){
      if(!a.ok){ frMsg(a.error,true); return; }
      frMsg('Added '+(r.profile.name||'a hero')+' ✓'); SND.ach();
      if($('#frCode')) $('#frCode').value='';
      loadFriendList();
    });
  });
}
function loadFriendList(){
  var host=$('#frList'); if(!host) return;
  SMLCloud.fetchFriendsBoard(boardProfile()).then(function(r){
    if(!r.ok || !host) return;
    var others=r.rows.filter(function(x){return x.user_id!==r.me;});
    host.innerHTML=others.length?('<div class="flabel">Following ('+others.length+')</div>'+others.map(function(x){
      return '<div class="frrow"><span class="bav">'+esc(x.avatar||'🧙')+'</span><span class="grow">'+esc(x.name||'Hero')+' <span class="bmeta">'+esc(x.rank_code||'E')+' · Lv.'+(x.level||1)+'</span></span><button class="btn ghost small" aria-label="Remove friend" onclick="unfriend(\''+x.user_id+'\')">✕</button></div>';
    }).join('')):'<div class="hint">No friends yet - add someone by code above.</div>';
  });
}
function unfriend(id){ SMLCloud.removeFriend(id).then(function(){ loadFriendList(); }); }
/* ---------- friend profile (tap a board row) ---------- */
function h2hRow(label, them, you){
  var lead=them>you?'them':(you>them?'you':'tie');
  return '<div class="hrow"><span class="hlabel">'+label+'</span>'+
    '<span class="hval'+(lead==='them'?' win':'')+'">'+them+'</span>'+
    '<span class="hvs">vs</span>'+
    '<span class="hval'+(lead==='you'?' win':'')+'">'+you+'</span></div>';
}
function showProfile(id){
  var r=null; for(var i=0;i<lastBoardRows.length;i++){ if(lastBoardRows[i].user_id===id){ r=lastBoardRows[i]; break; } }
  if(!r) return;
  var mine=(id===lastBoardMe);
  var canRemove=!mine && boardView==='friends';
  var me=boardProfile();
  var stars=(r.ascension||0)>0?' <span class="asc">✦S'+r.ascension+'</span>':'';
  var head='<div class="pcard"><div class="pav">'+esc(r.avatar||'🧙')+'</div>'+
    '<div class="pname">'+esc(r.name||'Hero')+(mine?' <span class="chip muted">you</span>':'')+'</div>'+
    '<div class="pmeta"><span class="chip">'+esc(r.rank_code||'E')+'</span> Lv.'+(r.level||1)+stars+'</div></div>';
  var body;
  if(mine){
    body='<div class="hint" style="text-align:center">This is your card exactly as friends see it - only these stats are ever shared, never your save.</div>';
  } else {
    body='<div class="h2h"><div class="hrow head"><span class="hlabel"></span><span class="hval">'+esc(r.avatar||'🧙')+'</span><span class="hvs"></span><span class="hval">you</span></div>'+
      h2hRow('Level', r.level||1, me.level)+
      h2hRow('Weekly XP', r.week_xp||0, me.weekXp)+
      h2hRow('Best streak', r.best_streak||0, me.bestStreak)+
      (((r.ascension||0)||me.ascension)?h2hRow('Ascension', r.ascension||0, me.ascension):'')+
      '</div>';
  }
  var foot='<div class="setrow" style="margin-top:14px">'+
    (canRemove?'<button class="btn ghost" onclick="unfriendFrom(\''+id+'\')">Remove friend</button>':'')+
    '<button class="btn go" onclick="closeModal()">Close</button></div>';
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box">'+head+body+foot+'</div>';
}
function unfriendFrom(id){ SMLCloud.removeFriend(id).then(function(){ closeModal(); toast('🤝 <span class="c">Friend removed</span>'); render(); }); }
function closeModal(){ $('#modal').className='modal'; }

/* ---------- edit modals ---------- */
function toggleEditDow(n){
  var i=editDays.indexOf(n); if(i>=0) editDays.splice(i,1); else editDays.push(n);
  var btns=document.querySelectorAll('#editDaysRow .dow');
  for(var k=0;k<btns.length;k++){ btns[k].className='dow'+(editDays.indexOf(k)>=0?' on':''); }
}
function editQuestModal(id){
  var q=state.quests.find(function(x){return x.id===id;}); if(!q) return;
  editDays=(q.recurring&&q.days)?q.days.slice():[];
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>✎ EDIT QUEST</h2>'+
    '<div class="flabel">Title</div><input id="eqTitle" maxlength="80" value="'+esc(q.title)+'">'+
    '<div class="flabel">Difficulty</div><select id="eqDiff">'+['easy','normal','hard','epic'].map(function(dd){return '<option value="'+dd+'"'+(q.diff===dd?' selected':'')+'>'+RPG.DIFF[dd].label+' · '+RPG.DIFF[dd].xp+'xp/'+RPG.DIFF[dd].coins+'💰</option>';}).join('')+'</select>'+
    '<div class="flabel">Life area</div><select id="eqSkill">'+skillOptions(q.skillId)+'</select>'+
    (q.recurring
      ? '<div class="flabel">Repeat on <span class="hint">(none = every day)</span></div><div class="daysrow" id="editDaysRow">'+DOW.map(function(dn,idx){return '<button type="button" class="dow'+(editDays.indexOf(idx)>=0?' on':'')+'" onclick="toggleEditDow('+idx+')">'+dn[0]+'</button>';}).join('')+'</div>'
      : '<div class="flabel">Due date</div><input type="date" id="eqDue" value="'+(q.due||'')+'">')+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="saveEditQuest(\''+id+'\')">Save</button>'+
    '<button class="btn" onclick="closeModal()">Cancel</button></div></div>';
  $('#eqTitle').focus();
}
function saveEditQuest(id){
  var q=state.quests.find(function(x){return x.id===id;}); if(!q) return;
  var o={title:$('#eqTitle').value,diff:$('#eqDiff').value,skillId:$('#eqSkill').value||null};
  if(q.recurring) o.days=editDays.slice(); else if($('#eqDue')) o.due=$('#eqDue').value||null;
  A.editQuest(state,id,o); persist(); closeModal(); render();
  toast('<span class="p">✎ Quest updated</span>');
}
function editGoalModal(id){
  var g=state.goals.find(function(x){return x.id===id;}); if(!g) return;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>✎ EDIT MAIN QUEST</h2>'+
    '<div class="flabel">Title</div><input id="egTitle" maxlength="80" value="'+esc(g.title)+'">'+
    '<div class="flabel">Why it matters</div><input id="egNote" maxlength="120" value="'+esc(g.note||'')+'">'+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="saveEditGoal(\''+id+'\')">Save</button>'+
    '<button class="btn" onclick="closeModal()">Cancel</button></div></div>';
  $('#egTitle').focus();
}
function saveEditGoal(id){
  A.editGoal(state,id,{title:$('#egTitle').value,note:$('#egNote').value});
  persist(); closeModal(); render(); toast('<span class="p">✎ Main quest updated</span>');
}
function editHabitModal(id){
  var h=state.habits.find(function(x){return x.id===id;}); if(!h) return;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>✎ EDIT '+(h.type==='bad'?'MONSTER':'HABIT')+'</h2>'+
    '<div class="flabel">Title</div><input id="ehTitle" maxlength="60" value="'+esc(h.title)+'">'+
    (h.type==='good'
      ? '<div class="flabel">Life area</div><select id="ehSkill">'+skillOptions(h.skillId)+'</select>'+
        '<div class="flabel">Frequency</div><select id="ehTarget">'+[7,6,5,4,3,2,1].map(function(t){return '<option value="'+t+'"'+(h.target===t?' selected':'')+'>'+(t===7?'Every day':t+'×/week')+'</option>';}).join('')+'</select>'
      : '')+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="saveEditHabit(\''+id+'\')">Save</button>'+
    '<button class="btn" onclick="closeModal()">Cancel</button></div></div>';
  $('#ehTitle').focus();
}
function saveEditHabit(id){
  var h=state.habits.find(function(x){return x.id===id;}); if(!h) return;
  var o={title:$('#ehTitle').value};
  if(h.type==='good'){ o.skillId=$('#ehSkill').value||null; o.target=Number(($('#ehTarget')||{}).value||h.target); }
  A.editHabit(state,id,o); persist(); closeModal(); render();
  toast('<span class="p">✎ Updated</span>');
}

/* ---------- interactive spotlight tour ---------- */
var tourStep=0;
var TOUR=[
  {tab:'today', sel:'#hud', title:'Your hero', body:'Your rank, level, XP, HP, coins and streak live here. Tap your avatar any time to rename, re-theme or ascend.'},
  {tab:'today', sel:'#skillsRow', title:'Life areas', body:'Tag quests, habits and focus sessions to these areas. Each one levels up and unlocks mastery bonuses on its own actions.'},
  {tab:'today', sel:'.tabs', title:'Getting around', body:'Today is home base. Quests, Habits, Focus, Market, Journal and Stats each live in their own tab.'},
  {tab:'today', sel:'.quick', title:'Daily rituals', body:'Log your mood and sleep, and start a focus run, right from here. Keeping the streak alive multiplies all your XP.'},
  {tab:'quests', sel:'.boss', title:'The weekly boss', body:'Name THE task of your week and slay it within 7 days for a big reward.'},
  {tab:'quests', sel:'.panel', title:'Quests', body:'Main quests are big goals broken into steps. Daily quests reset each morning and fill the chest. The ✎ button edits anything you added.'},
  {tab:'focus', sel:'.focusbox', title:'Focus = paid deep work', body:'Pomodoro cycles that pay you for every worked minute. Tag a life area so it shows up in your Stats breakdown.'},
  {tab:'market', sel:'.shoptabs', title:'Spend what you earned', body:'Turn coins into real rewards, guilt-free. Prices climb if you binge the same treat in one day.'},
  {tab:'stats', sel:'.review', title:'See your patterns', body:'Your week in review, a focus-by-area breakdown, and insights on what actually moves your mood.'}
];
function startTour(){ closeModal(); tourStep=0; showTourStep(); }
function showTourStep(){
  if(tourStep<0){ tourStep=0; }
  if(tourStep>=TOUR.length){ endTour(true); return; }
  var s=TOUR[tourStep];
  var run=function(){
    var el=null; s.sel.split(',').some(function(sel){ el=document.querySelector(sel.trim()); return !!el; });
    if(el&&el.scrollIntoView){ try{ el.scrollIntoView({block:'center'}); }catch(e){} }
    setTimeout(function(){ positionTour(el); }, 130);
  };
  if(s.tab && tab!==s.tab){ go(s.tab); setTimeout(run, 90); } else run();
}
function positionTour(el){
  var host=document.getElementById('tour');
  if(!host){ host=document.createElement('div'); host.id='tour'; document.body.appendChild(host); }
  host.className='show';
  var s=TOUR[tourStep];
  var vw=window.innerWidth, vh=window.innerHeight, pad=8;
  var r=el&&el.getBoundingClientRect?el.getBoundingClientRect():{top:vh/2-40,left:16,width:vw-32,height:80};
  if(!r.width && !r.height){ r={top:vh/2-40,left:16,width:vw-32,height:80}; }
  var hole='<div class="tourhole" style="top:'+(r.top-pad)+'px;left:'+(r.left-pad)+'px;width:'+(r.width+pad*2)+'px;height:'+(r.height+pad*2)+'px"></div>';
  var below=(r.top+r.height+220)<vh;
  var tipTop=below?(r.top+r.height+pad+12):(r.top-pad-12);
  var tip='<div class="tourtip'+(below?'':' above')+'" style="top:'+tipTop+'px">'+
    '<div class="tt">'+esc(s.title)+'</div><div class="tb">'+esc(s.body)+'</div>'+
    '<div class="tnav"><span class="tprog">'+(tourStep+1)+' / '+TOUR.length+'</span>'+
    '<button class="btn small" onclick="endTour()">Skip</button>'+
    (tourStep>0?'<button class="btn small" onclick="tourPrev()">◀ Back</button>':'')+
    '<button class="btn small go" onclick="tourNext()">'+(tourStep===TOUR.length-1?'Done ✓':'Next ▶')+'</button></div></div>';
  host.innerHTML=hole+tip;
}
function tourNext(){ tourStep++; showTourStep(); }
function tourPrev(){ tourStep--; showTourStep(); }
function endTour(done){
  var h=document.getElementById('tour'); if(h){ h.className=''; h.innerHTML=''; }
  if(done===true){ toast('🎉 <span class="p">You’re all set - go clear a quest!</span>'); go('today'); }
}

function exportSave(){
  var blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='scalemylife-save-'+RPG.todayKey()+'.json'; a.click();
}
function importSave(input){
  var f=input.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){ try{ var s=JSON.parse(r.result);
      if(!s||!s.hero) throw 0;
      state=RPG.migrate(s); persist(); applyTheme(); closeModal(); render(); toast('<span class="p">Save imported</span>');
    }catch(e){ toast('<span class="h">That file is not a valid save</span>','dmg'); } };
  r.readAsText(f);
}
function resetAll(){
  if(confirm('Delete ALL progress and start over?') && confirm('Really? This cannot be undone (unless you exported a backup).')){
    localStorage.removeItem(RPG.KEY); state=null; closeModal(); boot();
  }
}
/* safety net: before any cloud save is adopted we stash the previous one under
   KEY.pre-cloud. This lets the user roll back if a sync loaded the wrong side. */
function hasPreCloudBackup(){ try{ return !!localStorage.getItem(RPG.KEY+'.pre-cloud'); }catch(e){ return false; } }
function restorePreCloud(){
  var raw; try{ raw=localStorage.getItem(RPG.KEY+'.pre-cloud'); }catch(e){}
  if(!raw){ toast('<span class="h">No previous save to restore</span>','dmg'); return; }
  var prev; try{ prev=JSON.parse(raw); }catch(e){}
  if(!prev||!prev.hero){ toast('<span class="h">Backup is unreadable</span>','dmg'); return; }
  if(!confirm('Restore the save from just before your last sync ('+(prev.hero.name||'Hero')+', Lv.'+(prev.hero.level||1)+')? Your current one will be swapped out.')) return;
  localStorage.setItem(RPG.KEY+'.pre-cloud', JSON.stringify(state)); // swap so a mistaken restore is itself undoable
  state=RPG.migrate(prev); persist(); applyTheme(); render(); openSettings();
  toast('↩ <span class="p">Previous save restored</span>');
}

/* ---------- tutorial ---------- */
var TUT=[
  {icon:'🎮',title:'YOUR LIFE IS THE GAME',body:'ScaleMyLife turns real life into a game (an "RPG" - a role-playing game where a character grows stronger over time). Here, that character is you. Doing real things - tasks, habits, focused study - earns points. The more you do, the more your character levels up.'},
  {icon:'⭐',title:'XP, LEVELS & COINS',body:'XP means "experience points" - you earn them for every task you finish, and enough XP bumps you up a level (and a rank, from E all the way to SS). You also earn coins, which you spend on real-world treats you choose yourself - guilt-free, because you earned them.'},
  {icon:'❤️',title:'HABITS & HP',body:'HP means "health points" - your energy bar. Good habits build streaks. Bad habits you want to quit are treated like monsters: each time you slip and log it honestly, they knock down your HP. Rest and good sleep heal it back. If your HP ever hits zero you are Defeated - you lose some coins and earn less until you rest and rise, but you never lose your levels or progress. Being honest is what makes it all work.'},
  {icon:'⏳',title:'FOCUS & THE MARKET',body:'The Focus tab runs a "Pomodoro" timer - a simple technique of working in focused blocks (say 25 minutes) with short breaks between. You get paid in XP and coins for every minute you focus. Spend those coins in the Market on rewards you set yourself.'},
  {icon:'🏠',title:'EVERY DAY',body:'The Today tab is your home base: daily tasks, habit check-ins and quick actions in one place. Log your mood and sleep and keep your daily streak alive - each day in a row multiplies all your XP, up to 1.5 times. That is the whole loop. Ready?'}
];
function tut(i){
  var m=$('#modal'); m.className='modal show';
  var t=TUT[i], last=i===TUT.length-1;
  m.innerHTML='<div class="box" style="text-align:center"><div class="tutbig">'+t.icon+'</div>'+
    '<h2 style="justify-content:center">'+t.title+'</h2>'+
    '<div style="font-size:14.5px;line-height:1.6;color:var(--ink)">'+t.body+'</div>'+
    '<div class="tdots">'+TUT.map(function(_,j){return '<i class="'+(j===i?'on':'')+'"></i>';}).join('')+'</div>'+
    '<div class="setrow" style="margin-top:14px">'+
    '<button class="btn" onclick="tutSkip()">Skip</button>'+
    (i>0?'<button class="btn" onclick="tut('+(i-1)+')">◀ Back</button>':'')+
    '<button class="btn go" onclick="'+(last?'tutSkip()':'tut('+(i+1)+')')+'">'+(last?(state?'Done ✓':'▶ Create my hero'):'Next ▶')+'</button>'+
    '</div></div>';
}
function tutSkip(){ if(state){ closeModal(); } else { onboarding(); } }

/* ---------- onboarding ---------- */
function onboarding(){
  var prev=$('#obName'); var keep=prev?prev.value:'';
  pickedAv=pickedAv||'🧙';
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>🎮 SCALEMYLIFE<br><span style="font-size:10px;color:var(--muted)">CREATE YOUR HERO</span></h2>'+
    '<div class="hint" style="margin-bottom:6px">Your real life is the game. Name your character:</div>'+
    '<input id="obName" placeholder="Hero name (required)" maxlength="24" value="'+esc(keep)+'" oninput="obNameCheck()">'+
    '<div class="hint" id="obNameErr" style="color:var(--hp);display:none;margin-bottom:4px">Give your hero a name to continue.</div>'+
    '<div class="flabel">Pick an avatar</div>'+
    '<div class="avpick scroll">'+AVATARS.map(function(a){
      return '<button class="'+(pickedAv===a?'on':'')+'" onclick="pickedAv=\''+a+'\';onboarding()">'+a+'</button>';}).join('')+'</div>'+
    '<div class="flabel">Choose your path - it tailors your starting quests, habits, life areas and rewards</div>'+
    '<div class="pathpick">'+RPG.PATHS.map(function(p){
      return '<button class="'+(pickedPath===p.id?'on':'')+'" onclick="pickedPath=\''+p.id+'\';onboarding()"><span class="pi">'+p.icon+'</span><b>'+esc(p.name)+'</b><small>'+esc(p.blurb)+'</small></button>';
    }).join('')+'</div>'+
    '<button class="btn wide go" id="obStart" onclick="createHero()">▶ START ADVENTURE</button>'+
    '<div class="hint" style="margin-top:10px">You start with 50 💰 and a starter board matched to your path - edit everything. Full customization lives behind your avatar.</div></div>';
  var inp=$('#obName'); if(inp && !inp.value) inp.focus();
  obNameCheck();
}
function obNameCheck(){
  var inp=$('#obName'), btn=$('#obStart'); if(!inp||!btn) return true;
  var ok=inp.value.trim().length>0;
  btn.disabled=!ok; btn.style.opacity=ok?'':'0.5'; btn.style.cursor=ok?'':'not-allowed';
  return ok;
}
function createHero(){
  var raw=($('#obName')&&$('#obName').value||'').trim();
  if(!raw){ var e=$('#obNameErr'); if(e) e.style.display=''; obNameCheck(); var i=$('#obName'); if(i) i.focus(); return; }
  var n=raw;
  state=RPG.seedPreset(RPG.newState(n,pickedAv||'🧙'), pickedPath||'general');
  pickedAv=null;
  RPG.addLog(state,'🎮','A new adventure begins. Welcome, '+n+'!');
  persist(); applyTheme(); closeModal(); render(); confetti();
  setTimeout(function(){ startTour(); }, 700); // interactive spotlight tour for first-timers
}
/* ---------- Sage the guide (mascot) ----------
   Phase 1: an animated companion that speaks a scripted daily briefing built
   from your save (RPG.briefing) - no network, no LLM. Phase 2 (real chat via a
   Supabase Edge Function) plugs into this same panel later. */
var MASCOT_AURA={happy:'',fired:'🔥',proud:'✨',worried:'💧',urgent:'❗'};
function mascotOn(){ return state && state.settings.mascot!==false; }
function ensureMascot(){
  var host=document.getElementById('mascot');
  if(!mascotOn()){ if(host) host.style.display='none'; return null; }
  if(!host){
    host=document.createElement('div'); host.id='mascot';
    host.innerHTML='<div class="mbubble" id="mBubble" role="region" aria-label="Sage’s daily briefing" hidden></div>'+
      '<button class="mbtn" id="mBtn" aria-label="Talk to Sage, your guide" title="Sage - your guide" onclick="toggleMascot()"><span class="mface">🦉</span><span class="maura" aria-hidden="true"></span></button>';
    document.body.appendChild(host);
  }
  host.style.display='';
  return host;
}
function mascotBriefingHtml(){
  var b=RPG.briefing(state);
  return '<div class="mhead"><b>'+esc(b.greeting)+'</b><button class="btn ghost small" aria-label="Close" onclick="toggleMascot(false)">✕</button></div>'+
    '<div class="mlines">'+b.lines.map(function(l){
      return '<button class="mline" onclick="toggleMascot(false);go(\''+l.tab+'\')"><span>'+l.icon+'</span><span class="grow">'+esc(l.text)+'</span><span class="mgo">▶</span></button>';
    }).join('')+'</div>'+
    '<div class="mfoot">🔥 '+b.streak+' day'+(b.streak===1?'':'s')+' · Lv.'+b.level+' · <span class="hint" style="display:inline">tap a line to jump there</span></div>';
}
function toggleMascot(force){
  var host=ensureMascot(); if(!host) return;
  var bub=document.getElementById('mBubble'), btn=document.getElementById('mBtn');
  var show=typeof force==='boolean'?force:bub.hidden;
  if(show){ bub.innerHTML=mascotBriefingHtml(); bub.hidden=false; btn.classList.add('talking'); setTimeout(function(){ btn.classList.remove('talking'); },900); }
  else bub.hidden=true;
}
function mascotMoodSync(){
  var host=ensureMascot(); if(!host) return;
  var b=RPG.briefing(state);
  host.className='m-'+b.mood;
  var aura=host.querySelector('.maura'); if(aura) aura.textContent=MASCOT_AURA[b.mood]||'';
}
function mascotDailyGreet(){
  if(!mascotOn()) return;
  var k='sml.mascot.day';
  try{
    if(localStorage.getItem(k)===RPG.todayKey()) return;
    localStorage.setItem(k,RPG.todayKey());
  }catch(e){ return; }
  setTimeout(function(){ if(state && !document.querySelector('.modal.show')) toggleMascot(true); }, 1600);
}
function toggleMascotSetting(){
  state.settings.mascot=state.settings.mascot===false?true:false;
  persist();
  var host=document.getElementById('mascot');
  if(host) host.style.display=state.settings.mascot===false?'none':'';
  if(state.settings.mascot!==false) mascotMoodSync();
  openSettings();
}
function boot(){ applyTheme(); if(state){ seenDay=state.lastSeenDay; navAnim=true; render(); checkFocus(); cloudBootPull(); mascotMoodSync(); mascotDailyGreet(); } else { renderHUDShell(); tut(0); } }
function renderHUDShell(){ $('#hud').innerHTML='<div class="avatar">❔</div><div class="who"><div class="name">…</div></div><div></div>'; $('#tabs').innerHTML=''; $('#skillsRow').innerHTML=''; $('#view').innerHTML=''; }

setInterval(function(){ if(state){ checkFocus(); if(state.lastSeenDay!==RPG.todayKey()){ render(); } } }, 1000);
setInterval(function(){ if(state) checkReminders(); }, 30000);
var lastVisPull=0;
document.addEventListener('visibilitychange', function(){
  if(!state) return;
  if(document.hidden){ flushCloudPush(); return; }   // leaving -> save the latest right away
  var now=Date.now();
  if(now-lastVisPull>5*60000){ lastVisPull=now; cloudBootPull(); }
});
window.addEventListener('pagehide', function(){ if(state) flushCloudPush(); });

boot();
if('serviceWorker' in navigator && location.protocol==='https:'){
  navigator.serviceWorker.register('sw.js').catch(function(){});
}
