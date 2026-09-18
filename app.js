'use strict';
var $ = function(s,el){ return (el||document).querySelector(s); };
var A = RPG.actions;
var state = RPG.load(localStorage);
/* bumped every time #overlay is (re)opened; a delayed reveal (chest rattle,
   first-quest celebration) checks its own snapshot against this before
   writing, so a DIFFERENT overlay that opened in the meantime is never
   stomped by a stale timer firing late. */
var overlaySeq=0;
var tab='today', shopTab='market', pendingMood=null, pendingQuality=null;
var pendingNote=null, pendingHours=null; // journal drafts, preserved across re-renders
var focusDraft={label:'',skill:'',goal:''}; // focus form draft - selecting music/mode must never wipe typed text
/* Set by the Focus button on a quest row, read once by renderFocus and then
   cleared. It is a handoff, not state: leave it set and every later visit to
   Focus would silently re-link the same quest. */
var focusPreselect=null;
/* Today's dashboard state. sageLineDay is the day key for which Sage's daily
   line shows under the greeting (set by mascotDailyGreet, compared against
   todayKey at render time, so it goes away by itself at midnight). logOpen is
   whether the "Log your day" card is expanded; logAnim plays the 160ms expand
   once, on the tap that opened it, and not again on every mood re-render.
   None of this is saved: it is screen state, and persisting it would reopen
   the card on every device. */
var sageLineDay=null, logOpen=false, logAnim=false;
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
var pickedPaths=['general'];     // onboarding paths (you can be several things at once)
/* The path cards live on step 2 of the wizard, so every toggle re-renders
   that step. onboarding() with no argument means step 1 (the hero), which is
   why the number is spelled out here. */
function togglePath(id){
  if(id==='general'){ pickedPaths=['general']; onboarding(2); return; }   // Balanced stands alone
  var at=pickedPaths.indexOf(id);
  if(at>=0) pickedPaths.splice(at,1); else pickedPaths.push(id);
  pickedPaths=pickedPaths.filter(function(p){return p!=='general';});
  if(!pickedPaths.length) pickedPaths=['general'];
  onboarding(2);
}

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
  lofi:{name:'🎧 Lofi study mix',id:'lTRiuFIWV54'},
  synth:{name:'🌆 Synthwave radio',id:'4xDzrJKXOOY'},
  epic:{name:'🏮 Epic Chinese',id:'hjQ0q6lz-pY'},
  valhalla:{name:'🪓 Valhalla',id:'x67GelOetvo'},
  craft:{name:'⛏️ Minecraft',id:'vCTRNKPJr40'},
  custom:{name:'🔗 Custom YouTube URL',id:null}
};

var pickedTheme=null;            // onboarding live preview (no state yet)
var avTab='heroes';              // avatar picker tab: 'heroes' (designed) | 'emoji'
function applyTheme(){
  var t=THEMES[(state&&state.settings.theme)||pickedTheme||'dungeon']||THEMES.dungeon;
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
    title:state.hero.title||'', weekXp:w.tot.xp, bestStreak:state.hero.bestStreak||0, ascension:state.hero.ascension||0 };
}
var cloudSyncErr=false;   // true when the last push failed - surfaced as a retry chip
function pushCloudNow(){
  if(!cloudOn()) return;
  SMLCloud.push(state).then(function(r){                                    // full save (private)
    var was=cloudSyncErr; cloudSyncErr=!(r&&r.ok);
    if(cloudSyncErr!==was && state) renderHUD();
  });
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
  // don't resume a focus timer that was running on another device and is long over
  if(state.activeFocus && !state.activeFocus.pausedAt && (Date.now()-state.activeFocus.phaseEnd) > 6*3600000) state.activeFocus=null;
  cloudSyncErr=false;
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
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
  o.innerHTML='<div class="levelbox"><div class="big">⬆ LEVEL UP!</div>'+
    '<div class="sub">'+esc(state.hero.name)+' reached <b style="color:var(--gold)">Level '+lv+'</b></div>'+
    '<div class="sub" style="color:var(--good)">❤️ HP fully restored</div>'+
    '<button class="btn go" onclick="closeOverlay()">Continue ▶</button></div>';
}
function rankUp(rank, lv){
  SND.rankup(); confetti(true); setTimeout(function(){confetti(true);},600);
  var col=RANK_COLORS[rank.code]||'#f5c542';
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
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
    '<button class="btn go" onclick="closeOverlay();goMarket(\'hotel\')">🛏️ Go rest</button>'+
    '<button class="btn" onclick="closeOverlay()">Get up</button></div>';
}
function riseScreen(cb){
  SND.rankup(); confetti(true); if(!reduceMotion()){ setTimeout(function(){confetti(true);},400); }
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
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
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
  o.innerHTML='<div class="levelbox"><div class="big">🎁 DAILY CHEST</div>'+
    '<div class="sub">All dailies cleared. You got:</div>'+
    '<div class="sub" style="font-size:17px"><b style="color:var(--xp)">+'+res.xp+' XP</b> &nbsp; <b style="color:var(--gold)">+'+res.coins+' 💰</b></div>'+
    loot+
    '<button class="btn go" onclick="closeOverlay()">Nice ▶</button></div>';
}
function usePotion(){
  var r=RPG.usePotion(state); persist(); render();
  if(r){ SND.chest(); sparks('🧪'); toast('🧪 <span class="p">Focus Elixir - XP ×'+r.mult+' for the rest of today</span>'); }
}
function closeOverlay(){ $('#overlay').className=''; render(); }

/* ---------- rendering ---------- */
/* Both parts are typed by the user (life-area name and its emoji override) and
   both callers drop the result straight into HTML, so escape here, once. */
function skillName(id){ var s=state.skills.find(function(k){return k.id===id;}); return s? esc(s.icon)+' '+esc(s.name) : null; }

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
/* The compact header: two slim rows on a phone, one line from 860px up.
   Row 1 is identity (avatar, name, rank, level, coins, streak), row 2 is the
   two bars. Anything that is not glanceable every single screen belongs in the
   Hero sheet (openCharacter), not here: the header is what stands between the
   user and the first real card on Today. Every selector below is under test:
   .avatar keeps its aria-label and openCharacter, .rank keeps role/tabindex,
   .bar.hp keeps role/tabindex and openDefeatInfo, #coinCounter is where
   flyCoins() lands, and hurtBar() flashes .bar.hp. */
function renderHUD(){
  var h=state.hero, need=RPG.xpForLevel(h.level), r=RPG.rankFor(h.level);
  var col=RANK_COLORS[r.code]||'var(--gold)';
  var maxHp=RPG.maxHpOf(state);
  var fr=h.frame?RPG.frameById(h.frame):null;
  var avStyle=fr?('border-color:'+fr.color+';box-shadow:0 0 12px '+fr.glow+', inset 0 0 8px '+fr.glow):('border-color:'+col);
  var asc=(h.ascension||0)>0?'<span class="season" title="Season '+h.ascension+' - you have ascended '+h.ascension+' time'+(h.ascension===1?'':'s')+'">✦ S'+h.ascension+'</span>':'';
  var cloudChip=cloudOn()
    ?(cloudSyncErr
      ?'<span class="cloudchip err" title="Last cloud save failed - tap to retry" onclick="event.stopPropagation();cloudSyncNow()">⚠ retry</span>'
      :'<span class="cloudchip on" title="Cloud sync on - tap for status" onclick="event.stopPropagation();openSettings()">☁✓</span>')
    :'';
  var buffM=RPG.buffXpMult(state);
  var buff=buffM>1?'<span class="buffpill" title="Focus Elixir active - XP boosted for the rest of today">🧪 ×'+(+buffM.toFixed(2))+'</span>':'';
  var hpPct=Math.max(0,Math.min(100,h.hp/maxHp*100));
  $('#hud').innerHTML=
    '<div class="hdrow">'+
      '<div class="avatar'+(fr?' framed':'')+(h.downed?' downed':'')+'" style="'+avStyle+'" role="button" tabindex="0" onclick="openCharacter()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openCharacter()}" title="Your hero: rank, title, HP and life areas" aria-label="Customize character">'+avHtml(h.avatar)+'</div>'+
      '<div class="who"><div class="name"><span class="nm">'+esc(h.name)+'</span>'+
        '<span class="rank" role="button" tabindex="0" style="color:'+col+';border-color:'+col+';cursor:pointer" title="Rank '+r.code+', '+esc(r.name)+' - see all ranks & how prestige works" aria-label="Rank '+r.code+', '+esc(r.name)+'. See all ranks and how prestige works" onclick="openRanks()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRanks()}">'+r.code+'</span>'+
        asc+cloudChip+'</div></div>'+
      '<div class="side">'+
        (h.woundedOn===RPG.todayKey()?'<span class="wound" title="Wounded today: you earn half XP until you heal">🩸 wounded</span>':'')+
        buff+
        '<span class="lvl">LV.'+h.level+'</span>'+
        '<span class="coin" id="coinCounter" title="Coins to spend in Rewards">💰 '+h.coins+'</span>'+
        '<span class="flame" title="'+h.streak+' day streak'+((h.shields||0)>0?' - a Streak Shield is held':'')+'">🔥 '+h.streak+((h.shields||0)>0?' <span aria-label="Streak Shield held">🛡</span>':'')+'</span>'+
      '</div>'+
    '</div>'+
    '<div class="bars">'+
      '<div class="bar xp"><i style="width:'+Math.min(100,h.xp/need*100)+'%"></i><b>XP '+h.xp+' / '+need+'</b></div>'+
      '<div class="bar hp'+(h.hp>=maxHp?' full':'')+'" role="button" tabindex="0" style="cursor:pointer" title="Health '+h.hp+' of '+maxHp+' - what happens if my HP hits zero?" aria-label="Health '+h.hp+' of '+maxHp+'. Learn what happens at zero HP." onclick="openDefeatInfo()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openDefeatInfo()}"><i style="width:'+hpPct+'%"></i></div>'+
    '</div>';
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
  if(state.skills.length<RPG.MAX_SKILLS) html += '<button class="addskill" onclick="addSkillPrompt()">+ life area</button>';
  $('#skillsRow').innerHTML = html;
}

/* Tab bar. Column 2 is a sprite icon name, not an emoji: emoji render at a
   different size and hue on every platform, which is exactly what a navigation
   bar cannot afford. Emoji stay everywhere they carry meaning (life areas,
   rewards, avatars, monsters, Sage). A name with no matching <symbol> in
   index.html draws nothing, so keep the two in sync.

   Five destinations, no more. Focus and Journal kept their views and their
   go() ids but left the bar: seven buttons on a 375px phone gave every label
   about 50px, which is why the labels were down at 9px. Focus is reached from
   a quest row or from Today, Journal from Today. The ids here are what go()
   receives, so 'market' and 'stats' stay as written even though the labels
   read Rewards and Progress. Renaming an id silently breaks every saved
   onclick string in the app. */
var TABS=[['today','home','TODAY','pri home'],['quests','scroll-text','QUESTS','pri'],['habits','sprout','HABITS','pri'],['market','gift','REWARDS','sec'],['stats','bar-chart-3','PROGRESS','sec']];
function renderTabs(){
  var chest=A.chestStatus(state);
  $('#tabs').innerHTML = TABS.map(function(t){
    /* A running focus session used to light the Focus tab. That tab is gone,
       and #focuspill already follows the user across every screen, so the
       chest is the only thing left worth a dot. */
    var dot=(t[0]==='quests'||t[0]==='today')&&chest.eligible?'<span class="dot"></span>':'';
    return '<button class="'+t[3]+(tab===t[0]?' on':'')+'" onclick="go(\''+t[0]+'\')"><span class="ti">'+svgIcon(t[1])+'</span><span class="tl">'+t[2]+'</span>'+dot+'</button>';
  }).join('');
}
/* Focus and Journal are off the tab bar, so each one carries its own way back.
   Without this row the only exit on a phone PWA is the browser gesture, which
   an installed app does not have. go('today') and not history.back(): the app
   never pushes history entries. */
function viewBackHead(title){
  return '<div class="vhead"><button class="btn ghost back" title="Back to Today" aria-label="Back to Today" onclick="go(\'today\')">'+svgIcon('chevron-left')+'</button>'+
    '<h2>'+esc(title)+'</h2></div>';
}
function go(t){ tab=t; pendingNote=null; pendingHours=null; pendingDays=[]; logOpen=false; navAnim=true; render(); }
/* Rewards is one scrolling page now (revamp 7), so shopTab no longer picks
   which grid renders - all three (market/hotel/black) are always on the
   page. It still names which section a link should land on: the "Rest"
   buttons on the defeat/wounded banners call this instead of hand-rolling
   go('market');shopTab=...;render(), and it scrolls the matching #shop-*
   panel into view once the page is up. */
function goMarket(section){
  go('market');
  shopTab=section;
  var el=document.getElementById('shop-'+section);
  if(el) el.scrollIntoView({block:'start'});
}

/* One icon from the sprite in index.html. `cls` adds a modifier, 'sm' for the
   14px version used inside meta text. Icons inherit the surrounding text colour
   through currentColor, so they never need a colour of their own. Named
   svgIcon, not icon, because emptyState() already takes an `icon` argument and
   a shadowed name here would be a silent failure. */
function svgIcon(name,cls){
  return '<svg class="i'+(cls?' '+cls:'')+'" aria-hidden="true" focusable="false"><use href="#i-'+name+'"/></svg>';
}
/* Kept for the creation flows (difficulty is a real choice there, and shows its
   payout). List rows use the meta sentence in questRow instead. */
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
  /* market items carry a 6th element, tags: path ids (student/athlete/founder/
     coder/gamer/creative), 'all' for anything universal, or a struggle id
     (phone/procrastination/sleep/junk) the item answers. suggestedRewards()
     in the Rewards screen reads this; hotel/black never needed it so they
     stay 5-wide. Keep the Streak Shield at market[0] - the shield-purchase
     flow (usePreset('shop',0,'market')) and its test depend on that index. */
  shop:{
    market:[['🛡 Streak Shield - auto-saves one missed day',200,0,0,'shield'],
      ['Gaming: 1 hour',60,0,0,null,['gamer','coder']],
      ['Gaming: full evening',150,0,0,null,['gamer']],
      ['1 episode of a series',40,0,0,null,['all']],
      ['Movie night',80,0,0,null,['all']],
      ['Café treat',35,0,0,null,['all']],
      ['Sweet treat',30,0,0,null,['all']],
      ['Takeaway',120,0,0,null,['junk']],
      ['Sleep-in Saturday',100,0,0,null,['sleep','procrastination']],
      ['New game (save up!)',600,0,0,null,['gamer']],
      ['Phone-free evening treat',50,0,0,null,['phone']],
      ['New book',35,0,0,null,['student','creative']],
      ['Post-workout treat',45,0,0,null,['athlete']],
      ['New tool or plugin',90,0,0,null,['coder','founder']],
      ['Night out with friends',150,0,0,null,['founder','student']]],
    hotel:[['Power nap (20 min)',25,15],['Walk outside',15,10],['Long shower / bath',40,20],['Full rest evening',90,40],['Massage / spa',200,60]],
    black:[['Instagram before 1 PM (1h)',120,0,8],['Gaming before work is done (1h)',100,0,8],['Junk food feast',90,0,10],['Netflix past midnight',110,0,12],['Skip-the-gym pass',70,0,6]]
  }
};
/* tabId picks which PRESETS.shop.{market,hotel,black} array a 'shop' kind
   reads; the other kinds (quest/good/bad) ignore it. Rewards now shows all
   three shop forms on one page at once, so each one passes its own tabId
   instead of relying on the single shared shopTab global. Omitting tabId
   (the Quests/Habits call sites below never pass one) falls back to shopTab
   for backward compatibility. */
function presetChips(kind,tabId){
  var arr = kind==='shop' ? PRESETS.shop[tabId||shopTab] : PRESETS[kind];
  var chips = arr.map(function(p,i){
    return '<button onclick="usePreset(\''+kind+'\','+i+(kind==='shop'?',\''+(tabId||shopTab)+'\'':'')+')">+ '+esc(kind==='quest'||kind==='shop'?p[0]:p)+(kind==='shop'?' · '+p[1]+'💰':'')+'</button>';
  }).join('');
  return '<div class="presets"><span class="plabel">quick add:</span>'+chips+'</div>';
}
function usePreset(kind,i,tabId){
  if(kind==='quest'){ var p=PRESETS.quest[i]; if(dupe(state.quests,p[0]))return; A.addQuest(state,{title:p[0],diff:p[1]}); }
  if(kind==='good'){ var t=PRESETS.good[i]; if(dupe(state.habits,t))return; A.addHabit(state,{title:t,type:'good'}); }
  if(kind==='bad'){ var t2=PRESETS.bad[i]; if(dupe(state.habits,t2))return; A.addHabit(state,{title:t2,type:'bad'}); }
  if(kind==='shop'){ var tb=tabId||shopTab; var s=PRESETS.shop[tb][i]; if(dupe(state.shop,s[0]))return; A.addShopItem(state,{title:s[0],price:s[1],tab:tb,hp:s[2]||0,dmg:s[3]||0,special:s[4]||null}); }
  persist(); render();
}
function dupe(list,title){ return list.some(function(x){return x.title===title;}); }

/* "due Fri" reads; "due 2026-09-25" does not. Anything further out than a week
   keeps the raw date, because a weekday name would be ambiguous by then. */
function dueLabel(due,today){
  if(due<today) return 'late';
  if(due===today) return 'due today';
  var d=new Date(due+'T00:00:00'), now=new Date(today+'T00:00:00');
  var days=Math.round((d-now)/86400000);
  if(days===1) return 'due tomorrow';
  if(days<7 && !isNaN(d.getDay())) return 'due '+DOW[d.getDay()];
  return 'due '+due;
}
/* A quest row shows ONE meta sentence ("Hard, Work, every day") and at most one
   state chip. The old row stacked up to five coloured chips, which is five
   things asking for attention on a line whose real job is the title and the
   Clear button. The payout lives in the tooltip and in the toast on completion.
   Do not add a second chip here: pick the more urgent state instead. */
function questRow(q){
  var today=RPG.todayKey(), done=q.doneOn===today || (!q.recurring && q.doneOn);
  var activeToday=RPG.questActiveOn(q,new Date());
  var d=RPG.DIFF[q.diff], bits=[d.label], chip='';
  if(q.skillId&&skillName(q.skillId)) bits.push(skillName(q.skillId));
  if(q.recurring){
    bits.push(q.days&&q.days.length
      ? MON_ORDER.filter(function(n){return q.days.indexOf(n)>=0;}).map(function(n){return DOW[n];}).join(' ')
      : 'every day');
  }
  if(q.due){
    var lbl=dueLabel(q.due,today);
    if(lbl==='late') chip='<span class="chip late">Late</span>';
    else if(lbl==='due today') chip='<span class="chip due">Due today</span>';
    else bits.push(lbl);
  }
  if((q.focusMin||0)>0) bits.push(fmtHm(q.focusMin)+' focused');
  var action = done ? '<span style="color:var(--good);font-weight:700">'+svgIcon('check')+'</span>'
    : (q.recurring && !activeToday) ? '<span class="chip muted" title="Scheduled for another day">not today</span>'
    : '<button class="btn go" onclick="doQuest(\''+q.id+'\')">Clear</button>';
  /* Focus lost its tab, so the way in is from the work itself: anything you
     could clear right now can be focused right now. A dormant daily or a
     finished quest gets no button, because there is nothing to work on. */
  var canFocus = !done && (!q.recurring || activeToday);
  return '<div class="item'+(done?' done':'')+(q.recurring&&!activeToday?' dormant':'')+'"><div class="grow"><div class="title">'+esc(q.title)+'</div>'+
    '<div class="meta" title="'+d.label+': '+d.xp+' XP, '+d.coins+' coins">'+bits.join(', ')+chip+'</div></div>'+
    action+
    (canFocus?'<button class="btn ghost" title="Focus on this quest" aria-label="Focus on this quest" onclick="focusOnQuest(\''+q.id+'\')">'+svgIcon('timer','sm')+'</button>':'')+
    (!q.recurring&&!done?'<button class="btn ghost" style="color:var(--gold)" title="Upgrade to main quest" aria-label="Upgrade to main quest" onclick="promoteQ(\''+q.id+'\')">'+svgIcon('arrow-up-right','sm')+'</button>':'')+
    '<button class="btn ghost" title="Edit" aria-label="Edit quest" onclick="editQuestModal(\''+q.id+'\')">'+svgIcon('pencil','sm')+'</button>'+
    '<button class="btn ghost" title="Delete" aria-label="Delete quest" onclick="delQuest(\''+q.id+'\')">'+svgIcon('trash-2','sm')+'</button></div>';
}

function chestChip(){
  var c=A.chestStatus(state);
  if(c.total===0) return '';
  if(c.claimed) return '<span class="chestchip claimed">🎁 claimed ✓</span>';
  if(c.eligible) return '<button class="chestchip ready" onclick="claimChest()">🎁 OPEN CHEST!</button>';
  return '<button class="chestchip" onclick="openChestPreview()" title="What could be inside?">🎁 '+c.done+'/'+c.total+'</button>';
}
/* A small progress ring, the Focus ring's technique at chip size. Starts at
   12 o'clock (the rotate), which the Focus ring does not need because it
   counts down. No id on the foreground circle on purpose: checkFocus() finds
   the Focus ring by #ringFg, and a second element with that id would make the
   countdown redraw the wrong circle. `w` is the stroke width (3.5 at chip size,
   6 on the Progress rings) and `cls` an extra class on the svg; the Progress
   test counts its three rings by that class, so it goes on the svg itself. */
function miniRing(pct,size,stroke,w,cls){
  w=w||3.5;
  var r=(size-w)/2, c=size/2, C=2*Math.PI*r;
  pct=Math.max(0,Math.min(1,pct||0));
  return '<svg class="ring'+(cls?' '+cls:'')+'" width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" aria-hidden="true" focusable="false">'+
    '<circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="'+w+'"/>'+
    '<circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="none" stroke="'+stroke+'" stroke-width="'+w+'" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+(C*(1-pct))+'" transform="rotate(-90 '+c+' '+c+')"/></svg>';
}
/* The chest on Today: the same three states as chestChip() (counting, ready,
   claimed) drawn as a ring with a label. The label keeps the .chestchip class
   and its .ready / .claimed states because the tests, and the tab-bar dot,
   read the chest through those. The tap does what the chip does: preview
   while counting, claim when ready. */
function chestRing(){
  var c=A.chestStatus(state);
  if(c.total===0) return '';
  var pct=c.total?c.done/c.total:0;
  if(c.claimed) return '<span class="chestring claimed" title="Chest claimed today">'+miniRing(1,30,'var(--good)')+'<span class="chestchip claimed">🎁 claimed</span></span>';
  if(c.eligible) return '<button class="chestring ready" onclick="claimChest()" aria-label="All dailies cleared. Open the chest">'+miniRing(1,30,'var(--brand)')+'<span class="chestchip ready">🎁 Open</span></button>';
  return '<button class="chestring" onclick="openChestPreview()" title="What could be inside?" aria-label="Daily chest, '+c.done+' of '+c.total+' dailies cleared. See what is inside">'+miniRing(pct,30,'var(--brand)')+'<span class="chestchip">🎁 '+c.done+'/'+c.total+'</span></button>';
}
/* peek inside: what the chest can drop today, with live odds (Fortune shifts them) */
function openChestPreview(){
  var c=A.chestStatus(state);
  var lucky=RPG.boonCount(state,'fortune')>0;
  var jack=lucky?20:14, pot=lucky?18:12, fr=lucky?12:8;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>🎁 DAILY CHEST</h2>'+
    '<div class="hint">Clear <b>all '+c.total+'</b> of today’s dailies ('+c.done+'/'+c.total+' done) and the chest opens. Inside:</div>'+
    '<div class="ranklist" style="margin-top:10px">'+
      '<div class="rankrow"><span class="rk" style="color:var(--gold);border-color:var(--gold)">💰</span><div class="grow"><b>25 XP + 20-50 coins</b> - every chest, guaranteed</div><span class="rl">100%</span></div>'+
      '<div class="rankrow"><span class="rk" style="color:var(--gold);border-color:var(--gold)">🧞</span><div class="grow"><b>Coin jackpot</b> - an extra 40-100 💰 on top</div><span class="rl">'+jack+'%</span></div>'+
      '<div class="rankrow"><span class="rk" style="color:var(--skill);border-color:var(--skill)">🧪</span><div class="grow"><b>Focus Elixir</b> - ×2 XP for a whole day</div><span class="rl">'+pot+'%</span></div>'+
      '<div class="rankrow"><span class="rk" style="color:var(--hp);border-color:var(--hp)">🖼</span><div class="grow"><b>Glowing avatar frame</b> - rare cosmetic, collect all 6</div><span class="rl">'+fr+'%</span></div>'+
    '</div>'+
    (lucky?'<div class="hint" style="margin-top:8px">🍀 Fortune boon active - the good stuff drops more often.</div>':'')+
    '<div class="setrow" style="margin-top:14px"><button class="btn go" onclick="closeModal()">Back to the grind</button></div></div>';
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
    '<button class="btn go small" style="flex-shrink:0;white-space:nowrap" onclick="addStep(\''+g.id+'\')">Add step</button></div></div>';
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
      '<div class="form"><div class="row"><input id="gTitle" placeholder="New main quest… (e.g. Pass my driving test, Finish my portfolio)">'+
      '<button class="btn go" onclick="addGoal()">🏆 Add main quest</button></div></div></div>'+
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
    '<div class="panel"><h3>📌 Side quests <span class="cnt">'+sides.length+'</span></h3>'+
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
    var dueTxt=new Date(b.due+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
    return '<div class="boss"><span class="ic">🐲</span><div class="grow">'+
      '<div class="t">WEEKLY BOSS: '+esc(b.title)+'</div>'+
      '<div class="sub"><b>'+when+'</b> · slay it for 500xp / 250💰 · due '+dueTxt+'</div></div>'+
      '<button class="btn slip" onclick="slayBoss()">🗡️ SLAY</button>'+
      '<button class="btn ghost" aria-label="Abandon boss" onclick="abandonBoss()">✕</button></div>';
  }
  var s0=RPG.bossSunday(), s1=RPG.bossSunday(null,1);
  function sunTxt(k){ return 'Sunday '+new Date(k+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
  return '<div class="boss calm" style="border-color:var(--line)"><span class="ic" style="animation:none;opacity:.5">🐲</span><div class="grow">'+
    '<div class="t" style="color:var(--muted)">No weekly boss named</div>'+
    '<div class="sub">Pick THE task of the week - worth 500xp / 250💰 · due by the Sunday that closes its week.</div></div>'+
    '<input id="bossTitle" placeholder="This week I will slay…" style="max-width:220px">'+
    '<select id="bossDue" title="Which week does this boss close?" style="max-width:170px">'+
      '<option value="'+s0+'">by '+sunTxt(s0)+'</option>'+
      '<option value="'+s1+'">by '+sunTxt(s1)+'</option></select>'+
    '<button class="btn" onclick="setBoss()">🐲 Name it</button></div>';
}
function setBoss(){
  var t=$('#bossTitle').value.trim(); if(!t) return;
  var dueEl=$('#bossDue');
  A.setBoss(state,{title:t,due:(dueEl&&dueEl.value)||null}); persist(); render(); SND.dmg();
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
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
  o.innerHTML='<div class="levelbox"><div class="rankbig" style="color:var(--hp);font-size:72px">🐲</div>'+
    '<div class="big" style="color:var(--hp)">BOSS SLAIN</div>'+
    '<div class="sub">'+esc(r.title)+'</div>'+
    '<div class="sub"><span style="color:var(--xp)">+'+r.xp+' XP</span> &nbsp; <span style="color:var(--gold)">+'+r.coins+' 💰</span></div>'+
    '<button class="btn go" onclick="closeOverlay()">Glory ▶</button></div>';
}

function agendaPanel(){
  var items=A.agenda(state);
  var names={overdue:'⚠ OVERDUE',today:'🔥 DUE TODAY',week:'📅 THIS WEEK',later:'🌙 LATER'};
  var exportBtn='<button class="btn small right" onclick="exportICS()" title="Download an .ics file of quests with due dates for Apple/Google Calendar">📅 Export due dates</button>';
  if(!items.length) return '<h3>📅 Deadlines'+exportBtn+'</h3>'+emptyState('🗓️','Nothing scheduled','Give side quests a due date and they line up here by priority.');
  var out='<h3>📅 Deadlines <span class="cnt">'+items.length+'</span>'+exportBtn+'</h3>', last='';
  items.forEach(function(it){
    if(it.bucket!==last){ out+='<div class="logday">'+names[it.bucket]+'</div>'; last=it.bucket; }
    var when=it.days<0?(-it.days)+'d late':it.days===0?'today':it.days===1?'tomorrow':'in '+it.days+'d';
    out+='<div class="ag '+it.bucket+'"><div class="grow">'+esc(it.q.title)+'</div>'+
      '<span class="when">'+when+'</span>'+
      '<button class="btn go small" onclick="doQuest(\''+it.q.id+'\')">Clear</button></div>';
  });
  return out;
}

/* ---------- Today: the productivity dashboard ----------
   The order IS the product. Greeting, then only what is on fire (downed,
   wounded, atonement), two slim one-line slots (cloud nudge, Sage's line),
   the quick actions, then Now, Coming up, Habits today and the log card.
   The first row of Now has to be on screen at 375x812 without scrolling;
   anything added above it costs exactly that height, so new banners go
   below Now or into a slot, never above it. Every class the tests read
   (.todayhead, .downbar, .woundbar, .redeembar, .nudgebar, .chestchip,
   .ag.overdue, .quick button.potion, #jNote, .hrbtn, #slHours) still renders
   here; move one and grep test-ui.js first. */
function renderToday(){
  var today=RPG.todayKey();
  var h=new Date().getHours();
  var greet=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  var wounded=state.hero.woundedOn===today;
  var boss=state.boss&&!state.boss.doneOn?state.boss:null;
  $('#view').innerHTML=
    '<div class="todayhead"><span class="hi">'+greet+', '+esc(state.hero.name)+'</span>'+
      '<span class="dt">'+new Date().toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})+'</span>'+
      (boss?'<button class="bosschip" onclick="go(\'quests\')" title="Weekly boss: '+esc(boss.title)+'. Tap to see it">🐲 '+esc(boss.title)+' · '+A.bossDaysLeft(state)+'d</button>':'')+'</div>'+
    (state.hero.downed?'<div class="downbar">💀 <b>Downed</b> - half XP &amp; no coins. Heal to full HP to <b>Rise</b> and earn normally again. <b>HP '+state.hero.hp+'/'+RPG.maxHpOf(state)+'</b>'+
      '<span class="nb"><button class="btn small go" onclick="goMarket(\'hotel\')" title="What happens when you’re defeated?">🛏️ Rest</button><button class="btn small ghost" onclick="openDefeatInfo()" aria-label="How defeat works">ⓘ</button></span></div>'
      :(wounded?'<div class="woundbar">🩸 <b>Wounded</b> - XP halved today. Rest at the Hotel or log good sleep to recover.</div>':''))+
    redemptionBar()+
    /* the nudge is one line now: the text truncates, the two buttons never do.
       The .ghost dismiss and the cloudNudgeOff flag are what the test clicks. */
    (cloudNudgeDue()?'<div class="nudgebar">☁️ <span class="grow"><b>Protect your progress.</b> Your save lives only in this browser; free cloud sync keeps it safe.</span>'+
      '<span class="nb"><button class="btn small go" onclick="openSettings()">Set up</button>'+
      '<button class="btn small ghost" onclick="state.settings.cloudNudgeOff=true;persist();render()">Later</button></span></div>':'')+
    sageLine()+
    quickActions()+
    nowPanel()+
    comingUp()+
    habitsToday()+
    logCard()+
    /* On a phone the quick actions row is fixed above the tab bar, so the
       last card needs this much room to scroll clear of it. Empty on desktop
       (see .qaspace in styles.css). */
    '<div class="qaspace" aria-hidden="true"></div>';
}
/* Sage's daily line: the once-a-day greeting that used to pop the bubble over
   the screen. One line, the first briefing line, and More opens the bubble
   with the rest. sageLineDay is set by mascotDailyGreet() and only ever
   equals today, so the line disappears by itself at midnight. */
function sageLine(){
  if(sageLineDay!==RPG.todayKey() || !mascotOn()) return '';
  var b=RPG.briefing(state), l=b.lines[0];
  if(!l) return '';
  return '<div class="sageline"><span class="sowl" aria-hidden="true">🦉</span>'+
    '<span class="grow" title="'+esc(l.text)+'">'+l.icon+' '+esc(l.text)+'</span>'+
    '<button class="btn ghost small" onclick="toggleMascot(true)" aria-label="More from Sage">More</button></div>';
}
/* Three 44px buttons, plus the Focus Elixir when one is held (a test looks
   for .quick button.potion). Add lands on the Quests form for now; phase 6
   swaps quickAdd() for the smart add sheet and nothing else here changes. */
function quickActions(){
  var potion=state.inventory.potion||0;
  return '<div class="quick qa" role="group" aria-label="Quick actions">'+
    '<button class="qab" onclick="quickAdd()">'+svgIcon('plus')+'<span>Add</span></button>'+
    '<button class="qab" onclick="go(\'focus\')">'+svgIcon('timer')+'<span>Focus</span></button>'+
    '<button class="qab" onclick="askSage()">'+svgIcon('sparkles')+'<span>Ask Sage</span></button>'+
    (potion>0?'<button class="qab potion" onclick="usePotion()" title="Focus Elixir: ×2 XP for the rest of today">🧪<span>Elixir ×'+potion+'</span></button>':'')+
    '</div>';
}
function quickAdd(){
  go('quests');
  var el=$('#qTitle'); if(!el) return;
  /* jsdom has no scrollIntoView, and an old WebView may throw on the options
     object, so both are guarded: focusing the field is the part that matters */
  if(el.scrollIntoView){ try{ el.scrollIntoView({block:'center'}); }catch(e){} }
  el.focus();
}
/* Chat needs the Edge Function, which needs a signed-in user. Signed out, the
   owl still answers with the offline briefing. */
function askSage(){ if(cloudOn()) openSageChat(); else toggleMascot(true); }
/* Now: today's active dailies and the one-offs due today, as full quest rows
   (Clear, Focus, edit, delete all come from questRow). A one-off cleared today
   stays in the list with its check so the count reads 3/3 instead of the row
   vanishing under the user's thumb. */
function nowPanel(){
  var today=RPG.todayKey(), now=new Date();
  var dailies=state.quests.filter(function(q){return q.recurring && RPG.questActiveOn(q,now);});
  var due=state.quests.filter(function(q){return !q.recurring && q.due===today && (!q.doneOn||q.doneOn===today);});
  var rows=dailies.concat(due);
  var done=rows.filter(function(q){return q.doneOn===today;}).length;
  var body=rows.length?rows.map(questRow).join('')
    :emptyState('☀️','Nothing due right now','Add a quest, or bank some deep work.',
      '<div class="erow"><button class="btn go" onclick="quickAdd()">'+svgIcon('plus')+' Add a quest</button>'+
      '<button class="btn" onclick="go(\'focus\')">'+svgIcon('timer')+' Start focus</button></div>');
  return '<div class="panel now"><h3>Now'+(rows.length?' <span class="cnt">'+done+'/'+rows.length+'</span>':'')+chestRing()+'</h3>'+body+'</div>';
}
/* Coming up: Late (only when something is overdue), Tomorrow, This week. The
   Today group the spec lists is deliberately not here: a quest due today is
   already a full row in Now, and the same title twice on one screen makes
   both counts lie. Anything past seven days stays on the Quests tab agenda,
   which has the room for it. .ag and .ag.overdue are what the tests read. */
function comingUp(){
  var items=A.agenda(state).filter(function(it){return it.bucket!=='today' && it.days<=7;});
  var out='', last='';
  items.forEach(function(it){
    var grp=it.days<0?'Late':it.days===1?'Tomorrow':'This week';
    if(grp!==last){ out+='<div class="logday">'+grp+'</div>'; last=grp; }
    var mainG=it.q.main?state.goals.find(function(g){return g.id===it.q.main;}):null;
    var when=it.days<0?(-it.days)+'d late':it.days===1?'tomorrow':it.days<7?DOW[new Date(it.q.due+'T00:00:00').getDay()]:'in '+it.days+'d';
    out+='<div class="ag '+it.bucket+'"><div class="grow">'+esc(it.q.title)+(mainG?'<div class="submeta">🏆 '+esc(mainG.title)+'</div>':'')+'</div>'+
      '<span class="when">'+when+'</span>'+
      '<button class="btn go small" onclick="doQuest(\''+it.q.id+'\')">Clear</button></div>';
  });
  return '<div class="panel comingup"><h3>Coming up'+(items.length?' <span class="cnt">'+items.length+'</span>':'')+'</h3>'+
    (out||'<div class="empty">Nothing due this week. Give a quest a due date and it lines up here.</div>')+'</div>';
}
/* Habits today: the good habits as the same rows the Habits tab draws, then
   the monsters folded behind one "Slipped?" row. slippedOpen survives the
   re-render that follows a logged slip, so two slips in a row do not mean
   reopening the fold in between. */
var slippedOpen=false;
function habitsToday(){
  var today=RPG.todayKey();
  var good=state.habits.filter(function(x){return x.type==='good';});
  var bad=state.habits.filter(function(x){return x.type==='bad';});
  var kept=good.filter(function(x){return x.lastDoneOn===today;}).length;
  return '<div class="panel habits"><h3>Habits today'+(good.length?' <span class="cnt">'+kept+'/'+good.length+'</span>':'')+'</h3>'+
    (good.map(goodHabitRow).join('')||emptyState('🌱','No habits yet','Something small you want to do most days.','<button class="btn" onclick="go(\'habits\')">Plant one</button>'))+
    (bad.length?'<details class="slipped"'+(slippedOpen?' open':'')+' ontoggle="slippedOpen=this.open"><summary>'+svgIcon('chevron-down','sm')+'Slipped? <span class="hint">'+bad.length+' monster'+(bad.length===1?'':'s')+', log it honestly</span></summary>'+
      bad.map(monsterRow).join('')+'</details>':'')+
    '</div>';
}
/* Log your day. Three looks for one card: collapsed to a row while nothing is
   logged, the form while open, a summary with Edit once something is saved.
   The form itself is dailyLogForm(), shared with the Journal view, which is
   why saveDailyLog() can read the same ids from either screen. */
function logCard(){
  var today=RPG.todayKey(), entry=state.journal[today], sl=state.sleep[today];
  var archive='<button class="btn ghost small archivebtn" onclick="openJournalArchive()">Archive</button>';
  var open=logOpen || pendingMood!=null || pendingNote!=null || pendingHours!=null || pendingQuality!=null;
  if(open){
    var anim=logAnim?' anim':''; logAnim=false;
    return '<div class="panel logcard open'+anim+'"><h3>Log your day'+(entry?' <span class="cnt">saved ✓</span>':'')+'<span class="right">'+archive+'</span></h3>'+dailyLogForm()+'</div>';
  }
  if(entry||sl){
    var mo=entry?RPG.MOODS.find(function(m){return m.key===entry.mood;}):null;
    var bits=[];
    if(sl) bits.push(sl.hours+'h sleep'+(sl.quality?' '+Array(sl.quality+1).join('⭐'):''));
    if(entry&&entry.note) bits.push(esc(entry.note));
    return '<div class="panel logcard logged"><div class="logrow"><span class="lmood" aria-hidden="true">'+(mo?mo.emoji:'🌙')+'</span>'+
      '<div class="grow"><div class="title">'+(mo?'Mood: '+esc(mo.label):'Sleep logged')+'</div><div class="meta">'+(bits.join(' · ')||'logged')+'</div></div>'+
      '<button class="btn ghost" title="Edit" aria-label="Edit today\'s log" onclick="openLog()">'+svgIcon('pencil','sm')+'</button>'+archive+'</div></div>';
  }
  return '<div class="panel logcard"><div class="logrow"><button class="logmain" onclick="openLog()"><span class="lmood" aria-hidden="true">📔</span>'+
    '<span class="grow"><span class="title">Log your day</span><span class="meta">Mood, one honest line, sleep · +15 XP</span></span>'+svgIcon('chevron-down')+'</button>'+archive+'</div></div>';
}
function openLog(){ logOpen=true; logAnim=true; render(); }
function openJournalArchive(){
  var n=Object.keys(state.journal).length;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>📔 ARCHIVE</h2><div class="hint" style="margin-bottom:8px">'+n+' entr'+(n===1?'y':'ies')+'</div>'+
    journalArchive()+
    '<div class="setrow" style="margin-top:14px"><button class="btn" onclick="closeModal()">Close</button></div></div>';
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
/* One good-habit row, drawn identically on the Habits tab and on Today. Same
   rule as questRow: the 7-day dots, one meta sentence, one state chip (the
   weekly count, with a small ring once the habit has a weekly target). The
   payout sits in the tooltip. "n/N this wk" is asserted by a test. */
function goodHabitRow(h){
  var today=RPG.todayKey(), done=h.lastDoneOn===today;
  var bits=[];
  if(h.skillId&&skillName(h.skillId)) bits.push(skillName(h.skillId));
  bits.push(h.target>=7?'every day':h.target+'× a week');
  bits.push(h.target<7
    ? '🔥 '+A.weekStreak(h)+' wk'+(A.weekStreak(h)===1?'':'s')
    : '🔥 '+h.streak+' day'+(h.streak===1?'':'s'));
  var wk=h.target<7?'<span class="wkring">'+miniRing(A.weekCount(h)/h.target,20,'var(--info)')+'<span class="wk">'+A.weekCount(h)+'/'+h.target+' this wk</span></span>':'';
  return '<div class="item'+(done?' done':'')+'"><div class="grow"><div class="title">'+esc(h.title)+'</div>'+
    '<div class="meta" title="Keeping it pays +'+(12+Math.min(10,h.streak+1))+' XP and 6 coins">'+habitDots(h)+
    '<span>'+bits.join(', ')+'</span>'+wk+'</div></div>'+
    (done?'<span style="color:var(--good);font-weight:700">'+svgIcon('check')+' today</span>'
      :'<button class="btn go" onclick="doHabit(\''+h.id+'\')">Done today</button>')+
    '<button class="btn ghost" title="Edit" aria-label="Edit" onclick="editHabitModal(\''+h.id+'\')">'+svgIcon('pencil','sm')+'</button>'+
    '<button class="btn ghost" title="Delete" aria-label="Delete" onclick="delHabit(\''+h.id+'\')">'+svgIcon('trash-2','sm')+'</button></div>';
}
/* One monster row: clean days, the honest cost of a slip, the menace meter
   once it has grown, and the I slipped control. Shared by the Habits tab and
   Today's "Slipped?" fold. */
function monsterRow(h){
  var days=A.cleanDays(h);
  var best=Math.max(h.bestClean||0,days);
  var men=RPG.menaceOf(h);
  var damp=Math.max(0.5,1-0.2*RPG.boonCount(state,'warden'));
  var dmg=Math.round(12*men*damp);
  var menPct=Math.round((men-1)/(2.5-1)*100);
  var menClass=men>=2?' hot':men>1.3?' warm':'';
  return '<div class="item monster"><div class="grow"><div class="title">'+esc(h.title)+(men>1?' <span class="menaceTag'+menClass+'">menace ×'+men.toFixed(1)+'</span>':'')+'</div>'+
    '<div class="meta"><span class="clean">🛡 '+days+' day'+(days===1?'':'s')+' clean</span>'+
    '<span>best: '+best+', slips: '+h.slips+'</span>'+
    '<span class="chip late" title="What one honest slip costs you right now">−'+dmg+' ❤️ −10 💰</span></div>'+
    (men>1?'<div class="menacebar"><i class="'+menClass.trim()+'" style="width:'+menPct+'%"></i></div>':'')+'</div>'+
    '<button class="btn slip" onclick="slip(\''+h.id+'\')">I slipped</button>'+
    '<button class="btn ghost" title="Edit" aria-label="Edit" onclick="editHabitModal(\''+h.id+'\')">'+svgIcon('pencil','sm')+'</button>'+
    '<button class="btn ghost" title="Delete" aria-label="Delete" onclick="delHabit(\''+h.id+'\')">'+svgIcon('trash-2','sm')+'</button></div>';
}
function renderHabits(){
  var good=state.habits.filter(function(h){return h.type==='good';});
  var bad=state.habits.filter(function(h){return h.type==='bad';});
  $('#view').innerHTML='<div class="grid two">'+
    '<div class="panel"><h3>🌱 Grow - good habits <span class="hint" style="margin-left:auto">checkable again every morning</span></h3>'+
    (good.map(goodHabitRow).join('')||emptyState('🌱','Plant your first habit','Something small you want to do most days - read 20 pages, a 30-minute walk…'))+
    '<div class="form"><input id="hgTitle" placeholder="New good habit…">'+
    '<div class="row"><select id="hgSkill">'+skillOptions()+'</select>'+
    '<select id="hgTarget" style="max-width:130px"><option value="7">Every day</option><option value="6">6×/week</option><option value="5">5×/week</option><option value="4">4×/week</option><option value="3">3×/week</option><option value="2">2×/week</option><option value="1">1×/week</option></select>'+
    '<button class="btn go" onclick="addHabit(\'good\')">+ Add</button></div>'+presetChips('good')+'</div></div>'+
    '<div class="panel"><h3>👾 Fight - bad habits <button class="btn small right" onclick="openDefeatInfo()" title="What happens if a monster knocks you out?">💀 What if I lose?</button></h3>'+
    (bad.map(monsterRow).join('')||emptyState('👾','No monsters named','Name the habits you\u2019re fighting. Every slip you log honestly hits your HP - the more you feed a monster, the harder it bites.'))+
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
    host.innerHTML='<div class="mp-bar" title="Drag to move"><span class="mp-t">🎧 '+esc((MUSIC[state.settings.music]||{}).name||'Music')+'</span>'+
      '<button aria-label="Pop out" title="Pop out to its own window" onclick="openMusicWin()">⧉</button>'+
      '<button aria-label="Hide music" title="Hide" onclick="hideMusicPlayer()">✕</button></div>'+
      '<iframe src="https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="study music"></iframe>';
    musicDragInit(host);
  }
}
/* drag the docked player anywhere by its title bar (size via the CSS resize
   corner). Position lives on the host element, so track changes keep it. */
function musicDragInit(host){
  var bar=host.querySelector('.mp-bar'); if(!bar) return;
  bar.style.cursor='move'; bar.style.touchAction='none';
  bar.addEventListener('pointerdown',function(e){
    if(e.target.tagName==='BUTTON') return;
    var r=host.getBoundingClientRect(), ox=e.clientX-r.left, oy=e.clientY-r.top;
    function mv(ev){
      var x=Math.max(4,Math.min(window.innerWidth-r.width-4,ev.clientX-ox));
      var y=Math.max(4,Math.min(window.innerHeight-36,ev.clientY-oy));
      host.style.left=x+'px'; host.style.top=y+'px'; host.style.bottom='auto'; host.style.right='auto';
    }
    function up(){ document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); }
    document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up);
    e.preventDefault();
  });
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
/* The Focus button on a quest row. It cannot touch the form directly, because
   the form does not exist yet: go() re-renders the whole view. So it parks the
   id and lets renderFocus pick it up. */
function focusOnQuest(id){ focusPreselect=id; go('focus'); }
function renderFocus(){
  var f=state.activeFocus;
  /* Turn the parked id into the value focusTaskSelect() already reads. Doing it
     here, before the markup is built, is the only moment the option list and
     the selection are guaranteed to agree. A quest that was deleted in between
     leaves the select on "no link", which is the honest result. */
  if(focusPreselect){
    var pre=state.quests.find(function(q){return q.id===focusPreselect;});
    if(pre) focusDraft.goal='q:'+pre.id;
    focusPreselect=null;
  }
  /* Every branch below writes #view from scratch, so the back row is prefixed
     to each one rather than injected afterwards. Drop it from a branch and that
     state of the timer becomes a dead end. */
  var head=viewBackHead('Focus');
  if(f){
    var paused=!!f.pausedAt;
    var refNow=f.pausedAt||Date.now();
    var phaseTotal=(f.phase==='work'?f.work:f.brk)*60000;
    var left=f.phaseEnd-refNow, pct=RPG.clamp(1-left/phaseTotal,0,1);
    if(f.awaitingBreak){
      // work phase finished - wait for the user to start the break (the alarm already rang)
      $('#view').innerHTML=head+'<div class="panel focusbox break">'+
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
      $('#view').innerHTML=head+'<div class="panel focusbox'+(paused?' paused':'')+'">'+
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
      $('#view').innerHTML=head+'<div class="panel focusbox break'+(paused?' paused':'')+'">'+
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
    $('#view').innerHTML=head+'<div class="panel focusbox">'+
      '<h3 style="justify-content:center">⏳ Focus - get paid for deep work</h3>'+
      '<div class="hint">Pomodoro cycles that loop until you stop. Every worked minute pays 1.2 XP + 0.6 💰 - you collect when you hit stop, whether that is after 20 minutes or 3 hours. Breaks heal +3 ❤️. <b>You need to focus at least 5 minutes before any XP or coins are earned.</b></div>'+
      '<div class="durchips">'+modes.map(function(m){
        var on=!focusMode.custom&&focusMode.work===m[0]&&focusMode.brk===m[1];
        return '<button class="'+(on?'on':'')+'" onclick="focusMode={work:'+m[0]+',brk:'+m[1]+',custom:false};render()">'+m[2]+'</button>';}).join('')+
        '<button class="'+(focusMode.custom?'on':'')+'" onclick="focusMode={work:focusMode.work,brk:focusMode.brk,custom:true};render()">⚙ Custom</button>'+
      '</div>'+
      '<div class="form" style="max-width:460px;margin:0 auto;border:none;padding-top:0">'+
      '<input id="fLabel" placeholder="What are you working on? (e.g. Essay draft)" value="'+esc(focusDraft.label)+'" oninput="focusDraft.label=this.value">'+
      '<div class="row"><select id="fSkill" onchange="focusDraft.skill=this.value">'+skillOptions(focusDraft.skill)+'</select>'+
      focusTaskSelect()+
      '</div>'+
      (focusMode.custom?'<div class="row"><label style="font-size:12px;color:var(--muted)">Work<input id="fWork" type="number" min="5" max="180" value="'+focusMode.work+'" placeholder="work min" style="max-width:90px" oninput="focusMode.work=Number(this.value)||focusMode.work"></label>'+
        '<label style="font-size:12px;color:var(--muted)">Break<input id="fBrk" type="number" min="0" max="60" value="'+focusMode.brk+'" placeholder="break" style="max-width:80px" oninput="focusMode.brk=this.value===\'\'?focusMode.brk:(Number(this.value)||0)"></label></div>':'')+
      '<div class="flabel" style="text-align:left">Study music / background</div>'+
      '<div class="row"><select id="fMusic" onchange="state.settings.music=this.value;persist();render()">'+
      Object.keys(MUSIC).map(function(k){return '<option value="'+k+'"'+(state.settings.music===k?' selected':'')+'>'+MUSIC[k].name+'</option>';}).join('')+
      '</select></div>'+
      (state.settings.music==='custom'?'<input id="fUrl" placeholder="Paste a YouTube URL (lofi, Zelda & Chill, Minecraft ambience…)" value="'+esc(state.settings.musicUrl)+'" onchange="state.settings.musicUrl=this.value;persist()">':'')+
      '<button class="btn wide go" onclick="startFocus()">▶ START - '+focusMode.work+' min work'+(focusMode.brk?' / '+focusMode.brk+' min break':' · no breaks')+', loops until stopped</button></div>'+
      '<div class="payline" style="margin-top:14px">Lifetime focus: <b>'+Math.floor(state.counters.focusMin/60)+'h '+(state.counters.focusMin%60)+'m</b></div></div>';
  }
}
/* one select covering main AND side quests ('g:'/'q:' prefixed) - linking is
   always optional, you can just work on whatever. Today's dailies are listed
   too: the Focus button on a quest row appears on them, and a preselect with
   no matching option would land the user on an empty select. The engine banks
   focus minutes on any quest id, recurring or not, so nothing else changes.
   The optgroup labels are under test (#fTask optgroup[label*="Main"]): keep
   the three groups and their wording. */
function focusTaskSelect(){
  var goals=state.goals.filter(function(g){return !g.doneOn;});
  var sides=state.quests.filter(function(q){return !q.recurring && !q.doneOn && !q.main;});
  var dailies=state.quests.filter(function(q){return q.recurring && q.doneOn!==RPG.todayKey() && RPG.questActiveOn(q,new Date());});
  if(!goals.length && !sides.length && !dailies.length) return '';
  return '<select id="fTask" title="Bank this deep work on a quest (optional)" onchange="focusDraft.goal=this.value">'+
    '<option value="">- link a quest (optional) -</option>'+
    (goals.length?'<optgroup label="🏆 Main quests">'+goals.map(function(g){
      return '<option value="g:'+g.id+'"'+(focusDraft.goal==='g:'+g.id?' selected':'')+'>🏆 '+esc(g.title)+'</option>';}).join('')+'</optgroup>':'')+
    (sides.length?'<optgroup label="📌 Side quests">'+sides.map(function(q){
      return '<option value="q:'+q.id+'"'+(focusDraft.goal==='q:'+q.id?' selected':'')+'>📌 '+esc(q.title)+'</option>';}).join('')+'</optgroup>':'')+
    (dailies.length?'<optgroup label="🔁 Dailies">'+dailies.map(function(q){
      return '<option value="q:'+q.id+'"'+(focusDraft.goal==='q:'+q.id?' selected':'')+'>🔁 '+esc(q.title)+'</option>';}).join('')+'</optgroup>':'')+
    '</select>';
}
function startFocus(){
  var wEl=$('#fWork'), bEl=$('#fBrk');
  var w=wEl?(Number(wEl.value)||focusMode.work):focusMode.work;
  var b=bEl?(bEl.value===''?focusMode.brk:Number(bEl.value)):focusMode.brk;
  var link=($('#fTask')||{}).value||'';
  A.startFocus(state,{work:w,brk:b,skillId:$('#fSkill').value||null,
    goalId:link.slice(0,2)==='g:'?link.slice(2):null,
    questId:link.slice(0,2)==='q:'?link.slice(2):null,
    label:$('#fLabel').value});
  focusDraft={label:'',skill:'',goal:''};
  persist(); render();
}
function stopFocus(){
  var r=A.stopFocus(state); persist(); render(); updateDocTitle();
  if(!r) return;
  if(r.tooShort){ toast('<span class="h">Stopped at '+r.minutes+' min - under 5, nothing earned</span>','dmg'); return; }
  SND.chest(); confetti(); fx(r);
  toast('⏳ <span class="p">'+r.minutes+' min of real work collected</span>');
  if(r.goalTitle) toast('🏆 <span class="c">'+fmtHm(r.minutes)+' banked on “'+esc(r.goalTitle)+'”</span>');
  if(r.questTitle) toast('📌 <span class="c">'+fmtHm(r.minutes)+' banked on “'+esc(r.questTitle)+'”</span>');
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
/* Rewards (revamp 7): one scrolling page of sections instead of a tab
   switcher. market/hotel/black stay as internal ids (shopTab, item.tab,
   PRESETS.shop.*) but every section is always on the page at once now - see
   goMarket() for how a link still lands on one of them. */
function renderMarket(){
  $('#view').innerHTML='<div>'+balanceHero()+suggestedSection()+yourRewardsSection()+protectionSection()+guiltyPleasuresSection()+restSection()+'</div>';
}
function toggleEscalate(){ state.settings.escalate=state.settings.escalate===false; persist(); render(); }

/* Balance hero: the coin total plus what moved today. Both read straight off
   state.log - actions.buy() (core.js) logs every purchase with a negative
   coins field, same log entry type XP/coin grants use with a positive one,
   so earned/spent both fall out of one pass with no extra bookkeeping. Surge
   lives here as a small toggle: it changes prices in every section below, so
   it belongs with the balance, not repeated three times. */
function balanceHero(){
  var today=RPG.todayKey(), earned=0, spent=0;
  state.log.forEach(function(e){
    if(e.day!==today) return;
    if(e.coins>0) earned+=e.coins; else if(e.coins<0) spent+=-e.coins;
  });
  var escOn=state.settings.escalate!==false;
  return '<div class="panel" id="shop-balance"><h3>Reward shop'+
    '<button class="btn small ghost right" onclick="toggleEscalate()">'+(escOn?'📈 Surge ON':'➖ Surge OFF')+'</button></h3>'+
    '<div class="balnum" id="balCoins">💰 '+state.hero.coins+'</div>'+
    '<div class="balrow"><span>Earned today <b style="color:var(--ok)">+'+earned+' 💰</b></span>'+
    '<span>Spent today <b style="color:var(--text-2)">'+spent+' 💰</b></span></div>'+
    '<div class="hint">You earn coins by clearing quests and keeping habits. Spend them here, guilt free.</div>'+
    '<div class="hint">Surge raises the price each time you repeat the same treat in one day, so a coin hoard cannot buy the whole shelf in one sitting. Turn it off any time.</div>'+
    '</div>';
}

/* Suggested for you: PRESETS.shop.market items whose tags overlap the
   user's onboarding picks. state.settings.onboard ({paths,struggle}) is
   written by the onboarding wizard (phase 5); until that phase is merged
   into this branch, or for a save made before it existed, there is no such
   record, so this falls back to guessing which paths are active from the
   life areas already on the board - RPG.PATHS[n].skills lists the names
   each path renames the board to. The Streak Shield is excluded (it lives
   in Protection) and anything already stocked is hidden so the row only
   ever offers something new. Returns indices into PRESETS.shop.market,
   capped at six. */
function suggestedRewards(){
  var ob=state.settings&&state.settings.onboard;
  var paths=ob&&ob.paths?ob.paths:null;
  var struggle=ob&&ob.struggle?ob.struggle:null;
  if(!paths){
    paths=RPG.PATHS.filter(function(p){
      return p.skills && p.skills.some(function(n){ return state.skills.some(function(s){ return s.name===n; }); });
    }).map(function(p){ return p.id; });
  }
  var out=[];
  for(var i=0;i<PRESETS.shop.market.length;i++){
    var it=PRESETS.shop.market[i];
    if(it[4]) continue; // special (Streak Shield) - shown in Protection, not here
    if(dupe(state.shop,it[0])) continue;
    var tags=it[5]||[];
    var match=tags.indexOf('all')>=0 || (struggle&&tags.indexOf(struggle)>=0) || paths.some(function(p){return tags.indexOf(p)>=0;});
    if(match){ out.push(i); if(out.length>=6) break; }
  }
  return out;
}
function suggestedSection(){
  var idxs=suggestedRewards();
  if(!idxs.length) return '';
  return '<div class="panel" id="shop-suggested" style="margin-top:14px"><h3>✨ Suggested for you</h3>'+
    '<div class="hint" style="margin-bottom:10px">Matched to what is already on your board. One tap stocks it below.</div>'+
    '<div class="shopgrid">'+idxs.map(function(i){
      var it=PRESETS.shop.market[i];
      return '<div class="scard sugg"><div class="sicon" aria-hidden="true">'+shopIcon(it[0],'market')+'</div>'+
        '<div class="stitle">'+esc(it[0])+'</div>'+
        '<div class="srow"><span class="price">💰 '+it[1]+'</span>'+
        '<button class="btn buy small" onclick="usePreset(\'shop\','+i+',\'market\')">Stock it</button></div></div>';
    }).join('')+'</div></div>';
}

/* One reward card: shared by Your rewards, Guilty pleasures, Rest and the
   Streak Shield in Protection once it has a real state.shop row. i.tab picks
   the shady tint, so the same function always renders the right look no
   matter which section calls it. */
function shopCard(i){
  var isShield=i.special==='shield';
  var info=isShield?{price:i.price,capped:false,limit:0,count:0,surge:0}:A.buyInfo(state,i);
  var haveS=isShield&&(state.hero.shields||0)>=1;
  var can=state.hero.coins>=info.price && !info.capped && !haveS;
  var effects=[];
  if(isShield) effects.push('<span style="color:var(--brand)">auto-saves one missed day</span>');
  if(i.hp) effects.push('<span style="color:var(--ok)">+'+i.hp+' ❤️</span>');
  if(i.dmg) effects.push('<span style="color:var(--danger)">−'+i.dmg+' ❤️</span>');
  if(info.limit>0) effects.push('<span class="cap'+(info.capped?' hit':'')+'">'+(info.capped?'daily cap hit':info.count+'/'+info.limit+' today')+'</span>');
  else if(info.count>0 && info.surge>0) effects.push('<span class="cap">'+info.count+'× today</span>');
  var surgedPrice=info.price>i.price;
  // affordability meter: how close your purse is to this price
  var aff=can||haveS?'':'<div class="affbar" title="'+(info.price-state.hero.coins)+' 💰 to go"><i style="width:'+Math.min(100,Math.round(state.hero.coins/info.price*100))+'%"></i></div>';
  return '<div class="scard'+(can?'':' locked')+(i.tab==='black'?' shady':'')+'">'+
    '<button class="del" aria-label="Delete reward" onclick="delShop(\''+i.id+'\')">✕</button>'+
    '<div class="sicon" aria-hidden="true">'+shopIcon(i.title,i.tab)+'</div>'+
    '<div class="stitle">'+esc(i.title)+'</div>'+
    (effects.length?'<div class="sfx">'+effects.join(' · ')+'</div>':'')+
    aff+
    '<div class="srow"><span class="price'+(surgedPrice?' surged':'')+'">💰 '+info.price+(surgedPrice?'<small> ('+i.price+')</small>':'')+'</span>'+
    '<button class="btn buy small" '+(can?'':'disabled')+' onclick="buy(\''+i.id+'\')">'+(haveS?'Held':info.capped?'Capped':'Buy')+'</button></div></div>';
}

function yourRewardsSection(){
  var items=state.shop.filter(function(i){return i.tab==='market' && !i.special;});
  return '<div class="panel" id="shop-market" style="margin-top:14px"><h3>🛒 Your rewards</h3>'+
    '<div class="hint" style="margin-bottom:10px">Everyday treats. Earn them, then enjoy them guilt-free, that is the whole point.</div>'+
    (items.length?'<div class="shopgrid">'+items.map(shopCard).join('')+'</div>'
      :emptyState('🛒','Empty shelf','Stock rewards you actually want - that is what makes coins matter. Add one below.'))+
    '<div class="form"><input id="sTitle-market" placeholder="New reward… (e.g. Cinema night)">'+
    '<div class="row"><input id="sPrice-market" type="number" min="1" placeholder="price 💰" style="max-width:110px">'+
    '<input id="sLimit-market" type="number" min="0" placeholder="max/day (optional)" style="max-width:150px" title="0 = unlimited">'+
    '<button class="btn buy" onclick="addShop(\'market\')">+ Stock it</button></div></div>'+
    presetChips('shop','market')+'</div>';
}

/* Protection: the Streak Shield always shows here, even before it has ever
   been stocked - a fresh seed() hero has no state.shop row for it yet (only
   seedPreset() adds one up front), so this falls back to the PRESETS price
   and usePreset() (which calls addShopItem) until a real row exists, then
   switches to the live buy/Held card like any other reward. */
function protectionSection(){
  var shieldItem=state.shop.find(function(i){return i.special==='shield';});
  var shieldCard=shieldItem?shopCard(shieldItem):
    '<div class="scard"><div class="sicon" aria-hidden="true">🛡️</div>'+
    '<div class="stitle">Streak Shield</div>'+
    '<div class="srow"><span class="price">💰 '+PRESETS.shop.market[0][1]+'</span>'+
    '<button class="btn buy small" onclick="usePreset(\'shop\',0,\'market\')">Stock it</button></div></div>';
  var potion=state.inventory.potion||0;
  var elixirCard=potion<=0?'':
    '<div class="scard"><div class="sicon" aria-hidden="true">🧪</div>'+
    '<div class="stitle">Focus Elixir ×'+potion+'</div>'+
    '<div class="sfx">×2 XP for the rest of today</div>'+
    '<div class="srow"><span></span><button class="btn buy small" onclick="usePotion()">Use</button></div></div>';
  return '<div class="panel" id="shop-protection" style="margin-top:14px"><h3>🛡️ Protection</h3>'+
    '<div class="hint" style="margin-bottom:10px">Used automatically the first day you miss, so the streak survives.</div>'+
    '<div class="shopgrid">'+shieldCard+elixirCard+'</div></div>';
}

function guiltyPleasuresSection(){
  var items=state.shop.filter(function(i){return i.tab==='black';});
  return '<div class="panel" id="shop-black" style="margin-top:14px"><h3>🕶️ Guilty pleasures</h3>'+
    '<div class="hint" style="margin-bottom:10px">The treats you would rather not have right now. One costs coins and HP, the price climbs, and you can only cave twice a day. It beats lying to yourself.</div>'+
    (items.length?'<div class="shopgrid">'+items.map(shopCard).join('')+'</div>'
      :emptyState('🕶️','Nothing stocked here','Add the treat you already reach for anyway - naming it is more honest than pretending.'))+
    '<div class="form"><input id="sTitle-black" placeholder="New guilty pleasure…">'+
    '<div class="row"><input id="sPrice-black" type="number" min="1" placeholder="price 💰" style="max-width:110px">'+
    '<input id="sDmg" type="number" min="0" placeholder="−HP" style="max-width:90px">'+
    '<input id="sLimit-black" type="number" min="0" placeholder="max/day (optional)" style="max-width:150px" title="0 = unlimited">'+
    '<button class="btn buy" onclick="addShop(\'black\')">+ Stock it</button></div></div>'+
    presetChips('shop','black')+'</div>';
}

function restSection(){
  var items=state.shop.filter(function(i){return i.tab==='hotel';});
  return '<div class="panel" id="shop-hotel" style="margin-top:14px"><h3>🛏️ Rest</h3>'+
    '<div class="hint" style="margin-bottom:10px">Heals HP, never surges, never capped.</div>'+
    (items.length?'<div class="shopgrid">'+items.map(shopCard).join('')+'</div>'
      :emptyState('🛏️','Nothing stocked here','Add a way to heal up - a nap, a walk, an early night.'))+
    '<div class="form"><input id="sTitle-hotel" placeholder="New way to rest…">'+
    '<div class="row"><input id="sPrice-hotel" type="number" min="1" placeholder="price 💰" style="max-width:110px">'+
    '<input id="sHp" type="number" min="0" placeholder="+HP" style="max-width:90px">'+
    '<button class="btn buy" onclick="addShop(\'hotel\')">+ Stock it</button></div></div>'+
    presetChips('shop','hotel')+'</div>';
}

/* The daily log form: mood faces, the note, the sleep row (quick hours, the
   free field, the stars) and the one Save. Today embeds it inside the log
   card and the Journal view draws it in its panel; saveDailyLog() reads
   #jNote and #slHours by id, which is why only one of the two screens can be
   on the page at a time and why these ids must not change. The pending*
   drafts keep typed text alive across the re-render every mood tap causes. */
function dailyLogForm(){
  var today=RPG.todayKey(), entry=state.journal[today], sl=state.sleep[today];
  var hrs=pendingHours!=null?String(pendingHours):((sl||{}).hours!=null?String(sl.hours):'');
  var q=pendingQuality!=null?pendingQuality:((sl||{}).quality||3);
  return '<div class="logform">'+
    '<div class="flabel">Mood</div>'+
    '<div class="moods">'+RPG.MOODS.map(function(m){
      var on=(pendingMood||((entry||{}).mood))===m.key;
      return '<button class="'+(on?'on':'')+'" title="'+m.label+'" aria-label="Mood: '+m.label+'" aria-pressed="'+(on?'true':'false')+'" onclick="pendingMood=\''+m.key+'\';render()">'+m.emoji+'</button>';
    }).join('')+'</div>'+
    '<textarea id="jNote" rows="3" placeholder="One honest line about today… (optional)" oninput="pendingNote=this.value">'+esc(pendingNote!=null?pendingNote:((entry||{}).note||''))+'</textarea>'+
    '<div class="flabel">🌙 Sleep last night '+(sl?'<span class="cnt" style="font-size:10px">logged ✓</span>':'')+'</div>'+
    '<div class="row sleeprow">'+
    [7,8,9].map(function(n){
      var on=hrs!==''&&Number(hrs)===n;
      return '<button type="button" class="hrbtn'+(on?' on':'')+'" aria-pressed="'+(on?'true':'false')+'" onclick="pendingHours='+n+';render()">'+n+'h</button>';
    }).join('')+
    '<input id="slHours" type="number" step="0.5" min="0" max="16" value="'+esc(hrs)+'" placeholder="other…" oninput="pendingHours=this.value" style="max-width:90px">'+
    '<div class="stars">'+[1,2,3,4,5].map(function(n){
      var on=n<=q;
      return '<button class="'+(on?'on':'')+'" title="Sleep quality '+n+'/5" aria-pressed="'+(on?'true':'false')+'" onclick="pendingQuality='+n+';render()">⭐</button>';}).join('')+'</div></div>'+
    '<div class="hint" style="margin-top:2px">Pick a quick 7-9h button or type your own. Stars = how rested you feel.</div>'+
    '<button class="btn wide go" style="margin-top:10px" onclick="saveDailyLog()">'+((entry||sl)?'Update entry':'Log entry')+'</button></div>';
}
function renderJournal(){
  var entry=state.journal[RPG.todayKey()];
  $('#view').innerHTML=viewBackHead('Journal')+'<div class="grid two">'+
    '<div class="panel"><h3>📔 Daily log '+(entry?'<span class="cnt">saved ✓</span>':'· +15xp/5💰 · sleep heals ❤️')+'</h3>'+
    dailyLogForm()+'</div>'+
    '<div class="panel"><h3>📔 Archive <span class="cnt">'+Object.keys(state.journal).length+' entr'+(Object.keys(state.journal).length===1?'y':'ies')+'</span></h3>'+
    journalArchive()+'</div></div>';
}
/* one button logs the whole day: mood + note, and sleep when hours are set */
function saveDailyLog(){
  var today=RPG.todayKey();
  var mood=pendingMood||((state.journal[today]||{}).mood);
  if(!mood){ toast('<span class="h">Pick a mood first</span>','dmg'); return; }
  var r=A.logJournal(state,mood,$('#jNote').value);
  var hrsEl=$('#slHours'), hrs=hrsEl?hrsEl.value:'';
  var r2=null;
  if(hrs!==''){
    var sl=state.sleep[today];
    var q=pendingQuality!=null?pendingQuality:((sl||{}).quality||3);
    r2=A.logSleep(state,hrs,q);
  }
  pendingMood=null; pendingNote=null; pendingHours=null; pendingQuality=null;
  logOpen=false;   /* Today's card folds back to its summary row after a save */
  persist(); render(); fx(r); if(r2&&r2.hp) fx({hp:r2.hp}); afterAction();
}

/* ---------- Progress (tab id 'stats') ----------
   Every panel below is a plain function returning HTML, and renderStats()
   stacks them. The class names inside (.insight, .frow, .fseg, .heatmap,
   .hc.lN, .trophy, .brow, .review, .rv.suggest, .chart .col, .stat .v,
   .achgrid .ach) are what the tests query; rename one and a test goes red. */
function insightsPanel(){
  var iv=RPG.insights(state);
  var body;
  if(!iv.enough){
    body='<div class="empty">Log your mood for '+Math.max(0,6-iv.sampleSize)+' more day'+((6-iv.sampleSize)===1?'':'s')+' ('+iv.sampleSize+'/6) and Insights starts showing what moves it: sleep, focus, slips.</div>';
  } else if(!iv.findings.length){
    body='<div class="empty">No strong pattern yet across your good and low days. Keep logging, the signal sharpens with more data.</div>';
  } else {
    body=iv.findings.map(function(f){ return '<div class="insight"><span class="ic">'+f.icon+'</span><span>'+esc(f.text)+'</span></div>'; }).join('');
  }
  return '<div class="panel"><h3>Insights <span class="sub">what moves your mood</span></h3>'+body+'</div>';
}
function focusPanel(){
  var month=focusSpan===30;
  var f=RPG.focusByDay(state,focusSpan);
  var toggle='<span class="spantoggle right"><button class="'+(month?'':'on')+'" onclick="focusSpan=7;render()">Week</button><button class="'+(month?'on':'')+'" onclick="focusSpan=30;render()">Month</button></span>';
  var body;
  if(!f.totalMin){
    body='<div class="empty">No focus sessions in this window. Start a run from Today, tag it with a life area, and what you worked on shows up here day by day.</div>';
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
    body=legend+'<div class="focusbars">'+rows+'</div>';
  }
  /* "this week" / "this month" is asserted by a test in month mode */
  var total=f.totalMin?'<span class="cnt">'+fmtHm(f.totalMin)+' this '+(month?'month':'week')+'</span>':'';
  return '<div class="panel"><h3>Focus by life area'+total+toggle+'</h3>'+body+'</div>';
}
/* GitHub-style consistency grid: 12 weeks of days, one square each, lit by XP.
   Returns the grid, its key and a one-line caption; streakPanel() puts the
   streak numbers above it. The grid always draws (an empty wall is the promise
   of a full one), only the caption changes. */
function heatmapPanel(){
  var h=RPG.heatmap(state,12);
  var cells=h.cells.map(function(c){
    return '<i class="hc l'+c.level+(c.future?' fut':'')+'" title="'+c.day+(c.future?'':' · '+c.xp+' XP')+'"></i>';
  }).join('');
  var cap=h.total
    ?'<b>'+h.activeDays+'</b> active day'+(h.activeDays===1?'':'s')+' in the last 12 weeks, <b>'+h.total+'</b> XP'
    :'Every day you earn XP lights a square. Come back in a few days and watch the wall fill.';
  return '<div class="heatwrap"><div class="heatmap">'+cells+'</div></div>'+
    '<div class="heatfoot"><span class="heatcap">'+cap+'</span>'+
    '<span class="heatkey"><span>less</span><i class="hc l0"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i><i class="hc l4"></i><span>more</span></span></div>';
}
/* Streak: the running streak and the best one as big mono numbers, then the
   consistency grid. "best streak" (lower case) is asserted by a test. */
function streakPanel(){
  var h=state.hero, best=Math.max(h.bestStreak||0,h.streak||0);
  var shield=(h.shields||0)>0?'<span class="cnt shieldon" title="Used automatically the first day you miss, so the streak survives">'+svgIcon('shield','sm')+' shield held</span>':'';
  return '<div class="panel streakcard"><h3>Streak'+shield+'</h3>'+
    '<div class="streaknums">'+
      '<div class="sn cur">'+svgIcon('flame')+'<b class="v">'+h.streak+'</b><span class="k">day'+(h.streak===1?'':'s')+' running</span></div>'+
      '<div class="sn"><b class="v">'+best+'</b><span class="k">best streak</span></div>'+
    '</div>'+heatmapPanel()+'</div>';
}
/* trophy shelf: every weekly boss slain */
function trophyShelf(){
  var t=RPG.bossTrophies(state);
  if(!t.length) return '';
  return '<div class="panel"><h3>Trophy shelf <span class="cnt">'+t.length+' boss'+(t.length===1?'':'es')+' slain</span></h3>'+
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
      '<span class="bav">'+avHtml(r.avatar)+'</span>'+
      '<div class="grow"><div class="bname">'+esc(r.name||'Hero')+(mine?' <span class="chip muted">you</span>':'')+'</div>'+
      (r.title?'<div class="bmeta" style="color:var(--gold)">✦ '+esc(r.title)+'</div>':'')+
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
  var head='<div class="panel"><h3>Leaderboard <span class="cnt">weekly XP</span>'+toggle+'</h3>';
  if(!cloudOn()) return head+'<div class="empty">Sign in (⚙️ → Cloud sync) and join to race other heroes on weekly XP.</div></div>';
  if(friends){
    if(!state.settings.friends) return head+'<div class="empty">Enable friends in ⚙️ Settings, share your code, and race your friends here.</div><button class="btn wide" onclick="openSettings()">🤝 Enable friends</button></div>';
    setTimeout(function(){
      SMLCloud.fetchFriendsBoard(boardProfile()).then(function(r){
        var el=document.getElementById('boardBody'); if(!el) return;
        if(!r.ok){ el.innerHTML='<div class="empty">Friends board unavailable right now.</div>'; return; }
        el.innerHTML = r.rows.length>1 ? boardRowsHtml(r.rows, r.me) : '<div class="empty">Just you so far - add friends by code in ⚙️ Settings.</div>';
      });
      SMLCloud.listInvites().then(function(inv){
        var el=document.getElementById('boardInv');
        if(el && inv.ok && inv.rows.length) el.innerHTML='<button class="btn wide" onclick="openSettings()">📨 '+inv.rows.length+' friend invite'+(inv.rows.length===1?'':'s')+' waiting - open Settings</button>';
      });
    },0);
    return head+'<div id="boardInv"></div><div id="boardBody">'+boardSkeleton(4)+'</div></div>';
  }
  if(!state.settings.board) return head+'<div class="empty">You\u2019re synced but not on the global board. Join from ⚙️ → Cloud sync - only name, avatar, title, level, rank, weekly XP and best streak are shared.</div>'+
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
/* The encouraging line under the three rings: the engine's suggestion for next
   week, then the week's two facts in one muted line. .review and .rv.suggest
   are queried by a test and by the tour. */
function reviewBox(){
  var rev=RPG.weeklyReview(state);
  var best=rev.bestDay&&rev.bestXp>0?new Date(rev.bestDay+'T00:00:00').toLocaleDateString('en-US',{weekday:'long'}):null;
  var facts=[];
  if(best) facts.push('Best day '+best+', <b>'+rev.bestXp+' XP</b>');
  if(rev.worstMonster) facts.push('Toughest monster '+esc(rev.worstMonster)+', <b>'+rev.worstN+' slip'+(rev.worstN===1?'':'s')+'</b>');
  return '<div class="review">'+
    '<div class="rv suggest"><span class="k">'+svgIcon('target')+'</span><span class="v">'+esc(rev.suggestion)+'</span></div>'+
    (facts.length?'<div class="rv facts">'+facts.join(' · ')+'</div>':'')+'</div>';
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
      var label=new Date(m+'-01T00:00:00').toLocaleDateString('en-US',{month:'long',year:'numeric'});
      var rows=by[m].map(function(d){
        var e=state.journal[d], mo=RPG.MOODS.find(function(x){return x.key===e.mood;});
        var s=state.sleep[d];
        return '<div class="jrow jarch"><span class="d">'+d.slice(5)+'</span><span>'+(mo?mo.emoji:'')+'</span>'+
          '<span style="flex:1">'+esc(e.note||'-')+'</span>'+
          (s?'<span class="hint">🌙'+s.hours+'h'+(s.quality?' <span style="color:var(--gold)">'+Array((s.quality||0)+1).join('⭐')+'</span>':'')+'</span>':'')+'</div>';
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

/* ---------- the 7-day charts (XP, sleep) ----------
   One bar per day. The value sits above the bar and the weekday letter below,
   both plain HTML; the bar is an SVG rect. The svg has no viewBox, so the
   rect's percentage units follow the svg's own size and the corner radius
   stays 4px whatever the column height. The rect runs 10% past the bottom
   edge on purpose: the svg clips it, which leaves only the top corners
   rounded. Fills point at the gradients in chartDefs(), which has to sit in the
   same panel. A test counts the .col elements (7) and expects an svg in each,
   so keep both, and keep the sleep chart on .chart.sleepchart. */
function dayLetter(d){ return ['S','M','T','W','T','F','S'][new Date(d+'T00:00:00').getDay()]; }
function chartCol(v,pct,lbl,grad){
  var h=v>0?Math.max(4,Math.round(pct*100)):0;
  return '<div class="col"><div class="cl v">'+(v||'')+'</div>'+
    '<svg class="cbar" aria-hidden="true" focusable="false">'+
    (h?'<rect x="0" y="'+(100-h)+'%" width="100%" height="'+(h+10)+'%" rx="4" fill="url(#'+grad+')"/>'
      :'<rect class="nil" x="0" y="97%" width="100%" height="10%" rx="2"/>')+
    '</svg><div class="cl">'+lbl+'</div></div>';
}
/* The two vertical gradients the bars use: brand for XP, info blue for sleep.
   Stops take their colour through CSS variables, so the six themes recolour
   the bars for free. A 0x0 svg, not display:none: browsers ignore gradients
   defined inside a hidden svg. */
function chartDefs(){
  function g(id,c){ return '<linearGradient id="'+id+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:'+c+'"/><stop offset="1" style="stop-color:'+c+';stop-opacity:.35"/></linearGradient>'; }
  return '<svg class="chartdefs" width="0" height="0" aria-hidden="true" focusable="false"><defs>'+g('pgXp','var(--brand)')+g('pgSleep','var(--info)')+'</defs></svg>';
}
/* third chart row: sleep hours per day, weekly total + long-run average */
function sleepChartHtml(w){
  var slMax=9, slWeek=0, logged=false;
  w.days.forEach(function(d){ var s=state.sleep[d]; if(s&&s.hours>slMax) slMax=s.hours; });
  var cols=w.days.map(function(d){
    var s=state.sleep[d], v=s?s.hours:0; slWeek+=v; if(v) logged=true;
    return chartCol(v,v/slMax,dayLetter(d),'pgSleep');
  }).join('');
  var all=Object.keys(state.sleep).map(function(k){ return state.sleep[k].hours; });
  var avg=all.length?Math.round(all.reduce(function(a,b){return a+b;},0)/all.length*10)/10:0;
  if(!logged) return '<div class="chartcap">Log sleep on Today and your sleep chart appears here.</div>';
  return '<div class="chart sleepchart">'+cols+'</div>'+
    '<div class="chartcap">Sleep, last 7 days · <b>'+(Math.round(slWeek*10)/10)+'h</b> this week'+(all.length?' · <b>'+avg+'h</b> long-run average':'')+'</div>';
}
/* ---------- This week: three rings ----------
   XP against last week, habits kept against what the targets asked for, focus
   minutes against a weekly target. Each is a plain number the user can act
   on, which is why the rings do not share a scale. */
/* Minutes that fill the Focus ring: five hour-long blocks a week. A display
   target only, nothing in the engine reads it and the payout is the same
   either way. */
var FOCUS_WEEK_TARGET=300;
/* XP earned in the seven days before the current seven. weekStats() only
   covers the current window, so this walks state.log the same way it does. */
function lastWeekXp(){
  var keys={};
  for(var i=13;i>=7;i--){ var d=new Date(); d.setDate(d.getDate()-i); keys[RPG.todayKey(d)]=true; }
  var xp=0; state.log.forEach(function(e){ if(keys[e.day]) xp+=e.xp||0; });
  return xp;
}
/* Good habits kept in the last seven days against their targets. A daily habit
   can be checked seven times, a 3x-a-week one three; checks past the target do
   not count, so the ring tops out at 100%. Reads each habit's own history, not
   the log, so a deleted habit stops counting on both sides. */
function habitsKeptWeek(){
  var keys={};
  for(var i=6;i>=0;i--){ var d=new Date(); d.setDate(d.getDate()-i); keys[RPG.todayKey(d)]=true; }
  var kept=0, possible=0;
  state.habits.forEach(function(h){
    if(h.type!=='good') return;
    var target=Math.max(1,Math.min(7,h.target||7)), seen={}, hits=0;
    (h.history||[]).forEach(function(k){ if(keys[k]&&!seen[k]){ seen[k]=true; hits++; } });
    possible+=target; kept+=Math.min(target,hits);
  });
  return {kept:kept, possible:possible, pct:possible?kept/possible:0};
}
function ringCard(pct,stroke,num,label,cap,cls){
  return '<div class="wring'+(cls?' '+cls:'')+'">'+miniRing(pct,88,stroke,6,'pring')+
    '<b class="wv">'+num+'</b><span class="wl">'+label+'</span><span class="wd">'+cap+'</span></div>';
}
function weekRings(w){
  var xpNow=w.tot.xp, xpPrev=lastWeekXp(), diff=xpNow-xpPrev;
  var xpPct=xpPrev>0?Math.min(1,xpNow/xpPrev):(xpNow>0?1:0);
  var xpCap=xpPrev>0
    ?(diff===0?'same as last week':(diff>0?'+':'-')+Math.abs(diff)+' vs last week')
    :(xpNow>0?'first week on the board':'nothing earned yet');
  var hk=habitsKeptWeek();
  var fm=w.tot.focusMin;
  return '<div class="rings">'+
    ringCard(xpPct,'var(--brand)',String(xpNow),'XP',xpCap,diff>0&&xpPrev>0?'up':'')+
    ringCard(hk.pct,'var(--ok)',Math.round(hk.pct*100)+'%','habits kept',hk.possible?hk.kept+' of '+hk.possible+' checks':'no good habits yet')+
    ringCard(Math.min(1,fm/FOCUS_WEEK_TARGET),'var(--info)',fmtHm(fm),'focus',fm?'of a '+(FOCUS_WEEK_TARGET%60?fmtHm(FOCUS_WEEK_TARGET):(FOCUS_WEEK_TARGET/60)+'h')+' week':'no focus runs yet')+
    '</div>';
}
/* The Progress screen, top to bottom: header row, hero card, life areas (the
   slot render() fills with #skillsRow), This week, Streak, the compact stat
   tiles, the 7-day charts, then the panels that were already here. Every
   .panel is a sibling inside .progress, which is a grid with the gap between
   them, so no panel carries its own margin. */
function renderStats(){
  var w=RPG.weekStats(state);
  var maxXp=Math.max.apply(null,w.days.map(function(d){return w.per[d].xp;}).concat([1]));
  var chart=w.days.map(function(d){
    var v=w.per[d].xp;
    return chartCol(v,v/maxXp,dayLetter(d),'pgXp');
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
  }).join('')||'<div class="empty">Nothing logged yet. Clear a quest and it lands here.</div>';
  /* the tiles that are not already a ring or a streak number above them;
     "defeats" and "comebacks" appear once there has been a defeat (a test
     looks for both words) */
  var tiles='<div class="statgrid">'+
    '<div class="stat"><div class="v">'+w.tot.earned+'</div><div class="k">coins earned</div></div>'+
    '<div class="stat"><div class="v">'+w.tot.spent+'</div><div class="k">coins spent</div></div>'+
    '<div class="stat"><div class="v b">'+w.tot.quests+'</div><div class="k">quests cleared</div></div>'+
    '<div class="stat"><div class="v r">'+w.tot.slips+'</div><div class="k">monster hits</div></div>'+
    ((state.counters.deaths||0)>0?'<div class="stat"><div class="v r">'+state.counters.deaths+'</div><div class="k">defeats</div></div>'+
      '<div class="stat"><div class="v w">'+(state.counters.comebacks||0)+'</div><div class="k">comebacks</div></div>':'')+
    '</div>';

  $('#view').innerHTML='<div class="progress">'+
    '<div class="proghead"><span class="hi">Progress</span>'+
      '<button class="btn small" onclick="shareRecap()" title="Create a shareable image of your week">'+svgIcon('arrow-up-right','sm')+' Share my week</button></div>'+
    '<div class="panel herocard">'+heroSheetTop('card')+'</div>'+
    /* render() swaps #skillsRow into this slot right after the view is built */
    '<div class="panel lifeareas"><h3>Life areas <span class="cnt">'+state.skills.length+'</span></h3><div id="skillsSlot"></div></div>'+
    '<div class="panel thisweek"><h3>This week <span class="cnt">last 7 days</span></h3>'+weekRings(w)+reviewBox()+'</div>'+
    streakPanel()+
    tiles+
    '<div class="panel xpchart"><h3>XP over 7 days <span class="cnt">'+w.tot.xp+' XP</span></h3>'+
    chartDefs()+
    '<div class="chart">'+chart+'</div>'+
    '<div class="moodstrip">'+w.moods.map(function(m){return '<span>'+m.emoji+'</span>';}).join('')+'</div>'+
    '<div class="chartcap">Mood, last 7 days</div>'+
    sleepChartHtml(w)+'</div>'+
    focusPanel()+
    insightsPanel()+
    trophyShelf()+
    leaderboardPanel()+
    '<div class="panel"><h3>Achievements <span class="cnt">'+state.achievements.length+'/'+RPG.ACHIEVEMENTS.length+'</span></h3>'+
    '<div class="achgrid">'+achHtml+'</div></div>'+
    '<div class="panel"><h3>Adventure log</h3><div class="advlog">'+logHtml+'</div></div>'+
    '</div>';
}

var seenDay = null;
function render(){
  if(RPG.dailyReset(state) && seenDay){ toast('🌅 <span class="p">New day - dailies are fresh</span>'); }
  seenDay = state.lastSeenDay;
  persist();
  applyLegend();
  /* Park #skillsRow back in the shell BEFORE the view is rebuilt. On Progress
     it lives inside #view (see below), and the view render replaces #view's
     innerHTML wholesale, which would destroy the element for good. Moving it
     home first costs nothing and there is no paint in between, so the user
     never sees it flicker. */
  var wrapEl=$('#wrap'), skillsEl=$('#skillsRow'), tabsEl=$('#tabs');
  if(wrapEl && skillsEl && tabsEl && skillsEl.parentNode!==wrapEl) wrapEl.insertBefore(skillsEl, tabsEl);
  renderHUD(); renderSkills(); renderTabs();
  /* Life areas belong to Progress. renderSkills() keeps filling #skillsRow on
     every render so it is ready the instant the class flips; this class is the
     only thing that shows it. Remove it and six cards land back on top of
     Today, which is the first screen the revamp was trying to clear. */
  if(wrapEl) wrapEl.classList.toggle('show-skills', tab==='stats');
  ({today:renderToday,quests:renderQuests,habits:renderHabits,focus:renderFocus,market:renderMarket,journal:renderJournal,stats:renderStats}[tab])();
  /* On Progress the life areas become content, not chrome. Left in the shell
     they sit between the header and the tab bar and push the bar down the
     screen, which on a phone is the one row that must not move. renderStats()
     leaves an empty #skillsSlot inside its Life areas panel and the element
     takes that spot, so the screen order is decided in one place (there). No
     slot means the row goes to the end rather than nowhere. renderSkills()
     writes into the element by id, so it keeps working wherever it lands. */
  if(tab==='stats' && skillsEl){
    var viewEl=$('#view'), slot=viewEl?viewEl.querySelector('#skillsSlot'):null;
    if(slot) slot.parentNode.replaceChild(skillsEl, slot);
    else if(viewEl) viewEl.appendChild(skillsEl);
  }
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

function doQuest(id){
  var wasFirst=(state.counters.quests||0)===0;
  var r=A.completeQuest(state,id); persist(); render(); fx(r); if(r&&r.xp>0) popCheck(); afterAction();
  if(wasFirst && r && state.counters.quests===1 && !state.firstQuestCelebrated){
    state.firstQuestCelebrated=true; persist();
    var mySeq=overlaySeq;   // snapshot: don't interrupt whatever's open now, and don't fire late if something NEW opened meanwhile
    setTimeout(function(){ if(overlaySeq===mySeq && !$('#overlay').classList.contains('show')) firstQuestScreen(); }, 650);
  }
}
function firstQuestScreen(){
  SND.ach(); if(!reduceMotion()) confetti();
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
  o.innerHTML='<div class="levelbox"><div class="rankbig" style="color:var(--xp);font-size:56px">🎉</div>'+
    '<div class="big" style="color:var(--xp)">FIRST QUEST DONE!</div>'+
    '<div class="sub">That just earned you <b style="color:var(--xp)">XP</b> (fills your bar and levels you up) and <b style="color:var(--gold)">coins</b> (spend them on real rewards in the 🏪 Market).</div>'+
    '<div class="sub" style="color:var(--muted)">Clear all of a day’s dailies to pop the 🎁 chest, and keep a daily streak to multiply everything. That’s the whole game.</div>'+
    '<button class="btn go" id="fqGo" disabled style="opacity:.5" onclick="closeOverlay()">Let’s go ▶ <span id="fqCd">3</span></button></div>';
  /* 3-second unlock so the explanation actually gets read */
  var left=3;
  var iv=setInterval(function(){
    left--;
    var cd=$('#fqCd'), btn=$('#fqGo');
    if(!btn){ clearInterval(iv); return; }
    if(left<=0){ clearInterval(iv); btn.disabled=false; btn.style.opacity=''; if(cd) cd.textContent=''; }
    else if(cd) cd.textContent=String(left);
  },1000);
}
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
  A.addGoal(state,{title:t,note:''}); persist(); render(); }
function doGoal(id){
  var p=A.goalProgress(state,id);
  if(p.total>0 && p.done<p.total && !confirm('Steps are at '+p.done+'/'+p.total+'. Complete the main quest anyway?')) return;
  var r=A.completeGoal(state,id); persist(); render(); if(r){ confetti(); fx(r); } afterAction();
}
function delGoal(id){
  var g=state.goals.find(function(x){return x.id===id;});
  withUndo('🗑 Main quest deleted'+(g?': '+esc(g.title):'')+' (steps kept as side quests)', function(){ A.deleteGoal(state,id); });
}
function doHabit(id){
  var r=A.doHabit(state,id); persist(); render(); fx(r); if(r&&r.xp>0) popCheck();
  if(r&&r.allHabits){ confetti(); toast('🌟 <span class="c">Every habit kept today - +'+r.bonusCoins+' bonus 💰</span>'); }
  afterAction();
}
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
/* tabId comes from which of the three add forms was submitted (Rewards now
   shows all three - market/hotel/black - on one page, so there is no single
   ambient "current tab" left to read). #sTitle/#sPrice/#sLimit are suffixed
   per section for that reason; #sHp and #sDmg stay bare since only one
   section (Rest, Guilty pleasures) ever has one on the page. */
function addShop(tabId){
  var t=$('#sTitle-'+tabId).value.trim(), p=Number($('#sPrice-'+tabId).value); if(!t||!p) return;
  var hp=tabId==='hotel'?Number(($('#sHp')||{}).value||0):0;
  var dmg=tabId==='black'?Number(($('#sDmg')||{}).value||0):0;
  var limEl=$('#sLimit-'+tabId), lim=limEl&&limEl.value!==''?Number(limEl.value):undefined;
  A.addShopItem(state,{title:t,price:p,tab:tabId,hp:hp,dmg:dmg,limit:lim}); persist(); render();
}
function delShop(id){
  var it=state.shop.find(function(x){return x.id===id;});
  withUndo('🗑 Reward removed'+(it?': '+esc(it.title):''), function(){ A.deleteShopItem(state,id); });
}
function claimChest(){ var r=A.claimChest(state); persist(); render(); if(r){ chestAnim(r); flyCoins(r.coins); } afterAction(); }
/* the claim itself is instant (state-wise); this is just the shake-then-reveal */
function chestAnim(r){
  if(reduceMotion()){ chestScreen(r); return; }
  var o=$('#overlay'); o.className='show'; var mySeq=(o.dataset.seq=++overlaySeq);
  o.innerHTML='<div class="levelbox"><div class="chestshake" aria-hidden="true">🎁</div>'+
    '<div class="sub">The chest rattles…</div></div>';
  /* only reveal if THIS rattle is still the overlay showing - a different
     overlay opening in the meantime (achievement, level-up, first-quest...)
     must never get overwritten by a stale reveal firing 1.7s late */
  setTimeout(function(){ var live=$('#overlay'); if(live.classList.contains('show') && live.dataset.seq===String(mySeq)) chestScreen(r); },1700);
}
function saveJournal(){
  var mood=pendingMood||((state.journal[RPG.todayKey()]||{}).mood);
  if(!mood){ toast('<span class="h">Pick a mood first</span>','dmg'); return; }
  var r=A.logJournal(state,mood,$('#jNote').value); pendingMood=null; pendingNote=null; persist(); render(); fx(r); afterAction();
}
function saveSleep(){
  var sl=state.sleep[RPG.todayKey()];
  var q=pendingQuality!=null?pendingQuality:((sl||{}).quality||3);
  var r=A.logSleep(state,$('#slHours').value,q); pendingHours=null; pendingQuality=null; persist(); render(); fx(r); afterAction(); }
function addSkillPrompt(){
  if(state.skills.length>=RPG.MAX_SKILLS){ toast('<span class="h">Life-area limit reached ('+RPG.MAX_SKILLS+') - remove one first</span>','dmg'); return; }
  openSkillModal();
}
/* curated emoji grid so creating an area never needs a copy-paste trip */
var SKILL_EMOJIS=['🧠','💪','📚','💼','🤝','💎','🎨','🎸','🎹','🎬','📷','✍️','💻','🔬','📈','🛠️','🎯','⚽','🏀','🏊','🏃','🧘','⛰️','🚴','🍳','🥗','🌱','🌍','✈️','🚗','🏠','🐶','♟️','🗣️','🇫🇷','🇪🇸','🇩🇪','🇮🇹','🇯🇵','🇰🇷'];
var skIconSel=null;
function skPickEmoji(btn,e){
  skIconSel=e;
  var all=document.querySelectorAll('#skEmojiGrid button');
  for(var i=0;i<all.length;i++) all[i].className=all[i]===btn?'on':'';
}
function openSkillModal(){
  skIconSel=null;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>✨ NEW LIFE AREA</h2>'+
    '<div class="flabel">Name</div><input id="skName" maxlength="20" placeholder="e.g. French, Driving, Music">'+
    '<div class="flabel">Pick an emoji</div><div class="avpick" id="skEmojiGrid">'+SKILL_EMOJIS.map(function(e){
      return '<button type="button" onclick="skPickEmoji(this,\''+e+'\')">'+e+'</button>';}).join('')+'</div>'+
    '<div class="setrow"><input id="skIcon" maxlength="4" placeholder="…or type any emoji" style="max-width:200px"><span class="hint">overrides the grid pick</span></div>'+
    '<div class="setrow" style="margin-top:12px"><button class="btn go" onclick="saveSkill()">Create</button>'+
    '<button class="btn" onclick="closeModal()">Cancel</button></div></div>';
  $('#skName').focus();
}
function saveSkill(){
  var n=$('#skName').value.trim(); if(!n){ toast('<span class="h">Give it a name</span>','dmg'); return; }
  var ic=$('#skIcon').value.trim()||skIconSel||'✨';
  var s=A.addSkill(state,n,ic);
  if(!s){ toast('<span class="h">Life-area limit reached ('+RPG.MAX_SKILLS+')</span>','dmg'); return; }
  persist(); closeModal(); render();
}
function delSkill(id){
  var sk=state.skills.find(function(k){return k.id===id;});
  var n=state.quests.filter(function(q){return q.skillId===id;}).length + state.habits.filter(function(h){return h.skillId===id;}).length;
  var msg=n>0
    ? 'Delete '+(sk?sk.icon+' '+sk.name:'this life area')+'? '+n+' quest'+(n===1?'':'s')+'/habit'+(n===1?'':'s') +' will keep working but lose this tag (and its mastery bonus). This can’t be undone.'
    : 'Delete '+(sk?sk.icon+' '+sk.name:'this life area')+'?';
  if(confirm(msg)){ A.deleteSkill(state,id); persist(); render(); toast('🗑 <span class="c">Life area removed</span>'); }
}
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
/* hand-drawn vector portraits: stored as short tokens (fit the 8-char avatar
   column, so they sync and show on friends' devices too) */
var SVG_AVATARS={
  '@knight':{name:'Knight',emoji:'🛡️',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#34455e"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#8ea3bd"/><path d="M9 46a15 11 0 0 1 30 0h-6a9 7 0 0 0-18 0z" fill="#5c748f"/><circle cx="24" cy="20" r="10.5" fill="#c7d2de"/><path d="M13.5 20a10.5 10.5 0 0 1 21 0l-1.5 3h-18z" fill="#93a7ba"/><rect x="15" y="19" width="18" height="4.6" rx="2.3" fill="#22304a"/><path d="M24 5.5l2.8 5.5h-5.6z" fill="#e2574c"/><circle cx="24" cy="10.4" r="1.6" fill="#f0b429"/></svg>'},
  '@mage':{name:'Mage',emoji:'🧙',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#4b3a78"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#7c64b8"/><circle cx="24" cy="24" r="8" fill="#f2c9a2"/><path d="M16 30q8 8 16 0v6q-8 5-16 0z" fill="#e8e4f2"/><path d="M24 4l7 15h-14z" fill="#8f76cc"/><path d="M12 19h24l-2.5 3h-19z" fill="#6b52a8"/><circle cx="30" cy="9" r="1.7" fill="#f5c542"/><circle cx="21" cy="24" r="1.2" fill="#3a2d55"/><circle cx="27" cy="24" r="1.2" fill="#3a2d55"/></svg>'},
  '@rogue':{name:'Rogue',emoji:'🥷',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#232936"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#3d4657"/><path d="M24 7c8 0 12 6.5 12 14l-2 6h-20l-2-6c0-7.5 4-14 12-14z" fill="#4b5568"/><path d="M16 20a8 8 0 0 1 16 0l-1 5h-14z" fill="#141821"/><path d="M17.5 21.5h4.5l-.7 2.6h-3.1z" fill="#66e0b8"/><path d="M26 21.5h4.5l-.7 2.6h-3.1z" fill="#66e0b8"/><path d="M13 27h22l-2 3h-18z" fill="#333c4d"/></svg>'},
  '@ranger':{name:'Ranger',emoji:'🏹',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#274232"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#4e7a54"/><path d="M9 46a15 11 0 0 1 30 0h-5a10 8 0 0 0-20 0z" fill="#3b5f42"/><circle cx="24" cy="23" r="8" fill="#e9bd93"/><path d="M24 6c7.5 0 11.5 5.5 11.5 12l-3.5 4 .5-6h-17l.5 6-3.5-4c0-6.5 4-12 11.5-12z" fill="#5c8a4e"/><path d="M31 8l6-3-2 7z" fill="#d8c46a"/><circle cx="21" cy="23" r="1.2" fill="#2c3a26"/><circle cx="27" cy="23" r="1.2" fill="#2c3a26"/></svg>'},
  '@paladin':{name:'Paladin',emoji:'✨',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#6d5a24"/><path d="M12 8a12 5 0 0 0 24 0" fill="none" stroke="#ffe08a" stroke-width="2.4"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#e5c860"/><path d="M9 46a15 11 0 0 1 30 0h-6a9 7 0 0 0-18 0z" fill="#c2a63e"/><circle cx="24" cy="22" r="10" fill="#f5e3ae"/><path d="M14 22a10 10 0 0 1 20 0l-1.5 3h-17z" fill="#dcbe62"/><rect x="16" y="21" width="16" height="4.4" rx="2.2" fill="#57430f"/><path d="M23 10h2v6h-2zM20.5 12.5h7v2h-7z" fill="#8a6d1d"/></svg>'},
  '@witch':{name:'Witch',emoji:'🪄',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#3d2b52"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#6a4a8c"/><circle cx="24" cy="25" r="8" fill="#efc39b"/><path d="M15 30q9 6 18 0v6q-9 5-18 0z" fill="#4e3a68"/><path d="M24 4l6 13h-12z" fill="#7b5aa6"/><path d="M10 17h28l-3 3.4h-22z" fill="#5d4383"/><circle cx="35" cy="8" r="1.6" fill="#8be0c8"/><circle cx="21" cy="25" r="1.2" fill="#432e21"/><circle cx="27" cy="25" r="1.2" fill="#432e21"/><path d="M21.5 29.5q2.5 2 5 0" fill="none" stroke="#432e21" stroke-width="1.2" stroke-linecap="round"/></svg>'},
  '@monk':{name:'Monk',emoji:'🧘',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#7a4a22"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#d98c3f"/><path d="M9 46a15 11 0 0 1 30 0l-8-1-3-6h-8l-3 6z" fill="#b56f28"/><circle cx="24" cy="20" r="9.5" fill="#eab88b"/><path d="M14.5 20a9.5 9.5 0 0 1 19 0" fill="none" stroke="#d8a271" stroke-width="1.4"/><circle cx="21" cy="21" r="1.2" fill="#4a3018"/><circle cx="27" cy="21" r="1.2" fill="#4a3018"/><path d="M21 26q3 2.2 6 0" fill="none" stroke="#4a3018" stroke-width="1.3" stroke-linecap="round"/><circle cx="24" cy="13.6" r="1" fill="#c98f5f"/></svg>'},
  '@bard':{name:'Bard',emoji:'🎸',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1f4a4a"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#3f8a80"/><circle cx="24" cy="23" r="8.5" fill="#edbf98"/><path d="M14 17q10-9 21-1l-3.5 5q-7-6-14.5-1z" fill="#c8486b"/><circle cx="33.5" cy="13.5" r="3" fill="#c8486b"/><path d="M35 10l5-4-1.5 6z" fill="#f0d264"/><circle cx="21" cy="23" r="1.2" fill="#3c2a1c"/><circle cx="27" cy="23" r="1.2" fill="#3c2a1c"/><path d="M20.5 27.5q3.5 2.8 7 0" fill="none" stroke="#3c2a1c" stroke-width="1.3" stroke-linecap="round"/></svg>'},
  '@samurai':{name:'Samurai',emoji:'🥋',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#4a1f24"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#8c3a42"/><path d="M9 46a15 11 0 0 1 30 0h-6a9 7 0 0 0-18 0z" fill="#6b2b32"/><circle cx="24" cy="21" r="10" fill="#d9535e"/><path d="M14 21a10 10 0 0 1 20 0l-1.5 3.5h-17z" fill="#a63a44"/><rect x="15.5" y="20" width="17" height="4.4" rx="2.2" fill="#2b1216"/><path d="M13 12l-4-5 7 2zM35 12l4-5-7 2z" fill="#e5b04c"/><circle cx="24" cy="12" r="2" fill="#e5b04c"/></svg>'},
  '@viking':{name:'Viking',emoji:'🪓',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#2e3b46"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#7a6a4f"/><circle cx="24" cy="22" r="8.5" fill="#e9bd93"/><path d="M15 30q9 7 18 0v7q-9 5-18 0z" fill="#c9822e"/><path d="M15 21a9 9 0 0 1 18 0l-1 2h-16z" fill="#9aa7b3"/><path d="M12 16l-5-8 8 4zM36 16l5-8-8 4z" fill="#d8d3c8"/><circle cx="21" cy="23" r="1.2" fill="#3a2a1a"/><circle cx="27" cy="23" r="1.2" fill="#3a2a1a"/><path d="M18 27q6 5 12 0l-1 4q-5 3-10 0z" fill="#c9822e"/></svg>'},
  '@druid':{name:'Druid',emoji:'🌿',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#1f3a26"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#4e7a54"/><circle cx="24" cy="23" r="8" fill="#dfb08c"/><path d="M24 6c8 0 12 6 11 13l-4 3 1-7h-16l1 7-4-3c-1-7 3-13 11-13z" fill="#3e6b45"/><path d="M11 14q4-6 9-4-5 4-3 8-5 0-6-4z" fill="#7bd88f"/><path d="M37 14q-4-6-9-4 5 4 3 8 5 0 6-4z" fill="#7bd88f"/><circle cx="21" cy="23" r="1.2" fill="#33241a"/><circle cx="27" cy="23" r="1.2" fill="#33241a"/><path d="M21 27.5q3 2.4 6 0" fill="none" stroke="#33241a" stroke-width="1.2" stroke-linecap="round"/></svg>'},
  '@pirate':{name:'Pirate',emoji:'🏴‍☠️',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#20303e"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#7a3b32"/><circle cx="24" cy="23" r="8.5" fill="#e2ac80"/><path d="M12 18q12-11 24 0l-2 4q-10-8-20 0z" fill="#c03a30"/><circle cx="36" cy="20" r="1.5" fill="#f0d264"/><path d="M17.5 21.5h6.5v3.4h-6.5z" fill="#20242c"/><path d="M15 20l16-3" stroke="#20242c" stroke-width="1.4"/><circle cx="28" cy="23.5" r="1.3" fill="#33241a"/><path d="M20.5 29q4 2.6 7.5.4" fill="none" stroke="#33241a" stroke-width="1.3" stroke-linecap="round"/><circle cx="16" cy="27" r="1.3" fill="#f0d264"/></svg>'},
  '@valkyr':{name:'Valkyrie',emoji:'🕊️',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#3a3550"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#8f9fc9"/><path d="M9 46a15 11 0 0 1 30 0h-6a9 7 0 0 0-18 0z" fill="#6b7aa8"/><circle cx="24" cy="22" r="8.5" fill="#f0c8a0"/><path d="M15 30q9 6 18 0v6q-9 5-18 0z" fill="#e5c860"/><path d="M15 21a9 9 0 0 1 18 0l-1 2.4h-16z" fill="#c3cede"/><path d="M12 17q-6-2-7-9 7 1 9 6zM36 17q6-2 7-9-7 1-9 6z" fill="#e8ecf5"/><circle cx="21" cy="23" r="1.2" fill="#3a2d20"/><circle cx="27" cy="23" r="1.2" fill="#3a2d20"/></svg>'},
  '@alchem':{name:'Alchemist',emoji:'🧪',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#233a3a"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#4a6b5f"/><circle cx="24" cy="23" r="8.5" fill="#ecc3a0"/><path d="M13 15h22l-2 4h-18z" fill="#396056"/><path d="M16 9h16l2 6h-20z" fill="#2b4a42"/><circle cx="20" cy="23.5" r="2.6" fill="none" stroke="#d8b545" stroke-width="1.5"/><circle cx="28" cy="23.5" r="2.6" fill="none" stroke="#d8b545" stroke-width="1.5"/><path d="M22.6 23.5h2.8" stroke="#d8b545" stroke-width="1.5"/><circle cx="20" cy="23.5" r="1" fill="#66e0b8"/><circle cx="28" cy="23.5" r="1" fill="#66e0b8"/><path d="M21 28.5q3 2.2 6 0" fill="none" stroke="#4a3322" stroke-width="1.2" stroke-linecap="round"/></svg>'},
  '@robot':{name:'Automaton',emoji:'🤖',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#25303c"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#5c748f"/><rect x="14" y="13" width="20" height="17" rx="5" fill="#9fb2c6"/><rect x="17" y="18" width="14" height="7" rx="3.5" fill="#1a232e"/><circle cx="21" cy="21.5" r="1.8" fill="#59c2ff"/><circle cx="27" cy="21.5" r="1.8" fill="#59c2ff"/><rect x="20" y="27" width="8" height="1.8" rx="0.9" fill="#3d4c5e"/><path d="M24 7v4" stroke="#9fb2c6" stroke-width="2"/><circle cx="24" cy="6" r="2" fill="#f5c542"/></svg>'},
  '@kitsune':{name:'Kitsune',emoji:'🦊',svg:'<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#4a2a1a"/><path d="M9 46a15 11 0 0 1 30 0z" fill="#a8562a"/><path d="M13 10l3 10 6-6zM35 10l-3 10-6-6z" fill="#d97b3f"/><path d="M15 12l1.6 6 3.4-3.4zM33 12l-1.6 6-3.4-3.4z" fill="#f5e0d0"/><path d="M24 14c6.5 0 10 4.5 10 9 0 5.5-4.5 9-10 9s-10-3.5-10-9c0-4.5 3.5-9 10-9z" fill="#e08a4a"/><path d="M24 24q-5 6-2 8h4q3-2-2-8z" fill="#f5e0d0"/><circle cx="19.5" cy="22.5" r="1.4" fill="#2b1810"/><circle cx="28.5" cy="22.5" r="1.4" fill="#2b1810"/><path d="M23 28.6h2l-1 1.4z" fill="#2b1810"/></svg>'}
};
/* "design your own" hero: 5 layers encoded as a sync-safe token like #03214
   (fits the 8-char avatar column, renders identically on friends' devices) */
var AVB={
  skin:['#f6d7b8','#eebe98','#d9a066','#b07b4f','#8a5a3b','#6b4630'],
  hairC:['#2d2622','#5b3a24','#a5652a','#d9a441','#c9483c','#8a8f98','#7b5aa6','#3f8a80'],
  outfit:['#5c748f','#7b5aa6','#3f8a80','#c8486b','#c2a63e','#5c8a4e','#4b5568','#b56f28'],
  hairNames:['Short','Long','Spiky','Bun','Hood','Bald'],
  accNames:['None','Glasses','Headband','Crown','Earring','Warpaint']
};
function isCustomAv(av){ return /^#[0-9a-z]{5}$/i.test(String(av||'')); }
function customAvSvg(t){
  var v=String(t).slice(1).split('').map(function(c){ return parseInt(c,36)||0; });
  var skin=AVB.skin[v[0]%AVB.skin.length], hs=v[1]%6, hc=AVB.hairC[v[2]%AVB.hairC.length],
      oc=AVB.outfit[v[3]%AVB.outfit.length], ac=v[4]%6;
  var hair='';
  if(hs===0) hair='<path d="M15 21a9 9 0 0 1 18 0l-2 1.6q-7-6.5-14 0z" fill="'+hc+'"/>';
  else if(hs===1) hair='<path d="M15 21a9 9 0 0 1 18 0l1.5 12h-4.5l-.5-8q-5.5-5-11 0l-.5 8h-4.5z" fill="'+hc+'"/>';
  else if(hs===2) hair='<path d="M15 22l-1.5-7.5 4.5 3 2-5.5 4 4.5 4-4.5 2 5.5 4.5-3-1.5 7.5q-9-6.5-18 0z" fill="'+hc+'"/>';
  else if(hs===3) hair='<path d="M15 21a9 9 0 0 1 18 0l-2 1.4q-7-6-14 0z" fill="'+hc+'"/><circle cx="24" cy="10.5" r="3.4" fill="'+hc+'"/>';
  else if(hs===4) hair='<path d="M24 8c8 0 12 6.5 12 14l-2 5h-2.5l.5-6h-16l.5 6H14l-2-5c0-7.5 4-14 12-14z" fill="'+oc+'"/>';
  var acc='';
  if(ac===1) acc='<circle cx="20.5" cy="23" r="2.7" fill="none" stroke="#20242c" stroke-width="1.4"/><circle cx="27.5" cy="23" r="2.7" fill="none" stroke="#20242c" stroke-width="1.4"/><path d="M23.2 23h1.6" stroke="#20242c" stroke-width="1.4"/>';
  else if(ac===2) acc='<rect x="15.5" y="17.4" width="17" height="3" rx="1.5" fill="'+oc+'"/>';
  else if(ac===3) acc='<path d="M17.5 13.5l3 2.8 3.5-4.3 3.5 4.3 3-2.8-1 5h-11z" fill="#f0c33c"/>';
  else if(ac===4) acc='<circle cx="15.6" cy="26" r="1.3" fill="#f0c33c"/>';
  else if(ac===5) acc='<path d="M27 19.5l3.6 4.4M30.6 19.5L27 23.9" stroke="#c94f4f" stroke-width="1.4" stroke-linecap="round"/>';
  return '<svg viewBox="0 0 48 48" aria-hidden="true">'+
    '<circle cx="24" cy="24" r="22" fill="#20242e"/>'+
    '<circle cx="24" cy="24" r="22" fill="'+oc+'" opacity="0.3"/>'+
    '<path d="M9 46a15 11 0 0 1 30 0z" fill="'+oc+'"/>'+
    '<circle cx="24" cy="22" r="8.5" fill="'+skin+'"/>'+
    hair+
    '<circle cx="21" cy="23" r="1.2" fill="#3a2b1e"/><circle cx="27" cy="23" r="1.2" fill="#3a2b1e"/>'+
    '<path d="M21 27.4q3 2.3 6 0" fill="none" stroke="#3a2b1e" stroke-width="1.2" stroke-linecap="round"/>'+
    acc+'</svg>';
}
/* avatar -> safe HTML (vector portrait for tokens, escaped text for emojis) */
function avHtml(av){
  var d=SVG_AVATARS[av]; if(d) return '<span class="svgav">'+d.svg+'</span>';
  if(isCustomAv(av)) return '<span class="svgav">'+customAvSvg(String(av).toLowerCase())+'</span>';
  return esc(av||'🧙');
}
function avPlain(av){ var d=SVG_AVATARS[av]; if(d) return d.emoji; if(isCustomAv(av)) return '🧑'; return av||'🧙'; }  // canvas + notifications

/* ----- the builder itself ----- */
var builderSel=null, builderReturn=null;
function builderToken(){ return '#'+builderSel.map(function(n){ return n.toString(36); }).join(''); }
function openAvatarBuilder(from){
  builderReturn=from||'character';
  var cur=pickedAv||(state&&state.hero.avatar)||'';
  if(isCustomAv(cur)) builderSel=String(cur).toLowerCase().slice(1).split('').map(function(c){ return parseInt(c,36)||0; });
  else if(!builderSel) builderSel=[0,0,0,0,0];
  renderBuilder();
}
function bSet(i,v){ builderSel[i]=v; renderBuilder(); }
function bRandom(){
  builderSel=[AVB.skin.length,6,AVB.hairC.length,AVB.outfit.length,6].map(function(n){ return Math.floor(Math.random()*n); });
  renderBuilder();
}
function renderBuilder(){
  var m=$('#modal'); m.className='modal show';
  function row(label,i,n,swatches){
    var out='<div class="flabel">'+label+'</div><div class="bldrow">';
    for(var j=0;j<n;j++){
      var on=builderSel[i]===j;
      out+='<button type="button" class="bld'+(on?' on':'')+(swatches?' sw':'')+'"'+(swatches?' style="background:'+swatches[j]+'"':'')+
        ' aria-pressed="'+on+'" onclick="bSet('+i+','+j+')">'+(swatches?'':esc((i===1?AVB.hairNames:AVB.accNames)[j]))+'</button>';
    }
    return out+'</div>';
  }
  m.innerHTML='<div class="box"><h2>🎨 DESIGN YOUR HERO</h2>'+
    '<div class="bldprev">'+avHtml(builderToken())+'</div>'+
    row('Skin',0,AVB.skin.length,AVB.skin)+
    row('Hair',1,6,null)+
    row('Hair color',2,AVB.hairC.length,AVB.hairC)+
    row('Outfit',3,AVB.outfit.length,AVB.outfit)+
    row('Extra',4,6,null)+
    '<div class="setrow" style="margin-top:12px"><button class="btn" onclick="bRandom()">🎲 Surprise me</button>'+
    '<button class="btn go" onclick="bDone()">✓ Use this hero</button>'+
    '<button class="btn" onclick="bCancel()">Cancel</button></div></div>';
}
function bDone(){ pickedAv=builderToken(); bCancel(); }
function bCancel(){ if(builderReturn==='onboarding'||!state) onboarding(); else openCharacter(); }
var pickedAv=null;
/* avatar picker with two small tabs (designed heroes / emoji) + a distinct
   Customize button - everything at once was too much on one screen */
function avPickerHtml(from){
  var bReturn=from==='onboarding'?'onboarding':'character';
  return '<div class="avtabs">'+
    '<button type="button" class="'+(avTab==='heroes'?'on':'')+'" aria-pressed="'+(avTab==='heroes')+'" onclick="avTab=\'heroes\';'+from+'()">🛡️ Heroes</button>'+
    '<button type="button" class="'+(avTab==='emoji'?'on':'')+'" aria-pressed="'+(avTab==='emoji')+'" onclick="avTab=\'emoji\';'+from+'()">😀 Emoji</button>'+
    '<button type="button" class="customize" title="Design your own hero" aria-label="Design your own hero" onclick="openAvatarBuilder(\''+bReturn+'\')">🎨 Customize</button></div>'+
    (avTab==='heroes'
      ?'<div class="avpick svgrow">'+Object.keys(SVG_AVATARS).map(function(k){
          return '<button class="'+(pickedAv===k?'on':'')+'" title="'+SVG_AVATARS[k].name+'" aria-label="'+SVG_AVATARS[k].name+'" onclick="pickedAv=\''+k+'\';'+from+'()">'+avHtml(k)+'</button>';}).join('')+
        (isCustomAv(pickedAv)?'<button class="on" title="Your design" onclick="openAvatarBuilder(\''+bReturn+'\')">'+avHtml(pickedAv)+'</button>':'')+'</div>'
      :'<div class="avpick scroll">'+AVATARS.map(function(a){
          return '<button class="'+(pickedAv===a?'on':'')+'" onclick="pickedAv=\''+a+'\';'+from+'()">'+a+'</button>';}).join('')+'</div>');
}
/* The top of the Hero sheet, and since Revamp 8 the hero card on Progress too.
   This is where everything the compact header stopped showing now lives: the
   worn title (and the picker behind it), the level in pixel type, the rank
   chip, XP to the next level, how far the next rank is, HP with the defeat
   explainer, and what today has paid so far. If you ever want one of these
   back in the header, weigh it against the first card on Today being visible
   without scrolling on a phone.
   `where` is 'sheet' (the default, inside openCharacter) or 'card' (Progress).
   The only difference is the Customize button: the sheet IS the customize
   screen, so there it would just reopen itself. */
function heroSheetTop(where){
  var card=where==='card';
  var h=state.hero, r=RPG.rankFor(h.level), nr=RPG.nextRank(h.level), maxHp=RPG.maxHpOf(state);
  var col=RANK_COLORS[r.code]||'var(--gold)';
  var need=RPG.xpForLevel(h.level), left=Math.max(0,need-h.xp);
  var asc=(h.ascension||0)>0?' · Season '+h.ascension:'';
  return '<div class="herotop'+(card?' card':'')+'">'+
    '<div class="heroid"><div class="heroav">'+avHtml(h.avatar)+'</div>'+
      '<div class="grow"><div class="heroname">'+esc(h.name)+'</div>'+
      /* the pixel font is allowed here because the number is 14px or larger;
         the same chip as the header, so it opens the same ranks sheet */
      '<div class="herometa"><span class="lvbig">LV.'+h.level+'</span>'+
        '<span class="rank" role="button" tabindex="0" style="color:'+col+';border-color:'+col+';cursor:pointer" title="Rank '+r.code+', '+esc(r.name)+' - see all ranks & how prestige works" aria-label="Rank '+r.code+', '+esc(r.name)+'. See all ranks and how prestige works" onclick="openRanks()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openRanks()}">'+r.code+'</span>'+
        '<span class="hint">'+esc(r.name)+asc+'</span></div>'+
      (h.title
        ?'<div><span class="herotitle" role="button" tabindex="0" title="Change your title" aria-label="Title: '+esc(h.title)+'. Change it." onclick="openTitlePicker()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openTitlePicker()}">✦ '+esc(h.title)+' ✦</span></div>'
        :'<div><span class="herotitle empty" role="button" tabindex="0" title="Pick a title to wear" aria-label="Pick a title to wear" onclick="openTitlePicker()" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();openTitlePicker()}">☆ pick a title</span></div>')+
      '</div></div>'+
    '<div class="heroxp"><div class="bar xp" title="XP '+h.xp+' of '+need+'"><i style="width:'+Math.min(100,h.xp/need*100)+'%"></i></div>'+
      '<div class="xpline"><span>'+h.xp+' / '+need+' XP</span><span>'+left+' to Lv.'+(h.level+1)+'</span></div></div>'+
    /* the rank progress line is a button: the ranks sheet explains what the
       next rank is, and at max rank the same tap starts the ascension flow */
    (nr
      ?'<button class="btn ghost small ranknext" aria-label="Next rank '+nr.code+' at level '+nr.min+'. See all ranks" onclick="openRanks()">▲ Rank '+nr.code+' at Lv.'+nr.min+' '+svgIcon('chevron-right','sm')+'</button>'
      :'<button class="btn ghost small ranknext" aria-label="Max rank reached. Ascend into a new season" onclick="openAscend()">✦ Max rank. Ascend into a new season '+svgIcon('chevron-right','sm')+'</button>')+
    '<div class="hpline"><span>❤️ HP '+h.hp+' / '+maxHp+'</span>'+
      '<button class="btn small" onclick="openDefeatInfo()">What happens at zero HP?</button>'+
      (card?'<button class="btn small" onclick="openCharacter()" title="Name, title, avatar, theme">'+svgIcon('pencil','sm')+' Customize</button>':'')+
    '</div>'+
    todayGlance()+
    '</div>';
}
function openCharacter(){
  pickedAv=pickedAv||state.hero.avatar;
  /* preserve half-typed name/title across in-modal re-renders (avatar taps etc.) */
  var keepN=$('#chName')?$('#chName').value:state.hero.name;
  var keepT=$('#chTitle')?$('#chTitle').value:(state.hero.title||'');
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>🧝 CHARACTER</h2>'+
    heroSheetTop()+
    '<div class="flabel">Name</div><input id="chName" maxlength="24" value="'+esc(keepN)+'">'+
    '<div class="flabel">Title (shown under your name)</div><input id="chTitle" maxlength="34" placeholder="e.g. Essay Slayer · Route Master" value="'+esc(keepT)+'">'+
    titleChips()+
    '<div class="flabel">Avatar</div>'+avPickerHtml('openCharacter')+
    (avTab==='emoji'?'<div class="setrow"><input id="chCustomAv" maxlength="4" placeholder="…or type any emoji" style="max-width:180px"><span class="hint">overrides the grid pick</span></div>':'')+
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
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
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
/* one-tap title picker straight from the hero bar */
function openTitlePicker(){
  var unlocked=state.achievements.map(function(u){
    return RPG.ACHIEVEMENTS.find(function(a){return a.id===u.id;});
  }).filter(Boolean);
  var locked=RPG.ACHIEVEMENTS.length-unlocked.length;
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>✦ WEAR A TITLE</h2>'+
    '<div class="hint">Your title glows under your name'+(state.settings.board||state.settings.friends?' - friends and the leaderboard see it too':'')+'. Earn achievements to unlock more.</div>'+
    (unlocked.length?'<div class="titlechips" style="margin-top:10px">'+unlocked.map(function(a){
      var worn=state.hero.title===a.name;
      return '<button style="'+(worn?'border-color:var(--gold);color:var(--gold)':'')+'" onclick="wearTitleNow(\''+a.id+'\')">'+a.icon+' '+esc(a.name)+(worn?' ✓':'')+'</button>';
    }).join('')+'</div>':'<div class="hint" style="margin-top:8px">Nothing unlocked yet - your first quest unlocks <b>First Blood</b>.</div>')+
    '<div class="flabel">…or write your own</div>'+
    '<div class="setrow"><input id="tpCustom" maxlength="34" placeholder="e.g. Essay Slayer" value="'+esc(state.hero.title||'')+'">'+
    '<button class="btn go" onclick="wearCustomTitle()">Wear it</button></div>'+
    '<div class="setrow" style="margin-top:10px">'+(state.hero.title?'<button class="btn" onclick="wearTitleNow(null)">✕ No title</button>':'')+
    '<button class="btn" onclick="closeModal()">Close</button></div>'+
    (locked?'<div class="hint" style="margin-top:8px">'+locked+' more titles locked in 📊 Stats → Achievements.</div>':'')+'</div>';
}
function wearTitleNow(id){
  if(id===null){ state.hero.title=''; }
  else{ var a=RPG.ACHIEVEMENTS.find(function(x){return x.id===id;}); if(a) state.hero.title=a.name; }
  persist(); closeModal(); render();
  if(state.hero.title){ SND.ach(); toast('✦ <span class="c">Now wearing “'+esc(state.hero.title)+'”</span>'); }
}
function wearCustomTitle(){
  var t=($('#tpCustom')?$('#tpCustom').value:'').trim();
  state.hero.title=t; persist(); closeModal(); render();
  if(t){ SND.ach(); toast('✦ <span class="c">Now wearing “'+esc(t)+'”</span>'); }
}
function setTheme(k){ state.settings.theme=k; persist(); applyTheme(); openCharacter(); }
function saveCharacter(){
  var n=$('#chName').value.trim(); if(n) state.hero.name=n;
  state.hero.title=$('#chTitle').value.trim();
  var customEl=$('#chCustomAv');
  var custom=customEl?customEl.value.trim():'';
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
    (state.settings.reminders?'<div class="setrow" style="align-items:center"><label class="hint" style="margin:0" for="remHour">🕕 Daily nudge at</label>'+
      '<select id="remHour" style="max-width:120px" onchange="setReminderHour(this.value)">'+[16,17,18,19,20,21,22].map(function(h){
        return '<option value="'+h+'"'+((state.settings.reminderHour==null?18:state.settings.reminderHour)===h?' selected':'')+'>'+(h%12||12)+':00 '+(h<12?'AM':'PM')+'</option>';
      }).join('')+'</select></div>'+
      '<div class="hint" style="margin-top:2px;margin-bottom:8px">Today’s unfinished dailies get a friendly reminder at this time.</div>':'')+
    '<div class="setrow"><button class="btn'+(state.settings.hardcore?' hcon':'')+'" onclick="toggleHardcore()" title="Defeat costs half your coins and revives you at just 10 HP">'+(state.settings.hardcore?'💀 Hardcore ON':'🛡️ Hardcore OFF')+'</button>'+
    '<span class="hint" style="flex:1;align-self:center">Defeat bites harder: bigger coin loss, lower revival HP.</span></div>'+
    '<div class="flabel">🌙 Rest days <span class="hint" style="display:inline">- your streak won’t break on these</span></div>'+
    '<div class="daysrow">'+MON_ORDER.map(function(i){
      return '<button type="button" class="dow'+((state.settings.restDays||[]).indexOf(i)>=0?' on':'')+'" onclick="toggleRestDay('+i+')">'+DOW[i][0]+'</button>';
    }).join('')+'</div>'+
    cloudSection()+
    '<div class="setrow"><button class="btn" onclick="exportSave()">⬇ Export save (JSON)</button>'+
    '<button class="btn" onclick="$(\'#importFile\').click()">⬆ Import save</button>'+
    (clientErrors().length?'<button class="btn" onclick="closeModal();openDiagnostics()">🩺 Diagnostics ('+clientErrors().length+')</button>':'')+'</div>'+
    '<input type="file" id="importFile" accept=".json" style="display:none" onchange="importSave(this)">'+
    (hasPreCloudBackup()?'<div class="setrow"><button class="btn" onclick="restorePreCloud()" title="Bring back the save from just before the last cloud load">↩ Restore save from before last sync</button></div>':'')+
    '<div class="setrow"><button class="btn" style="border-color:var(--hp);color:var(--hp)" onclick="resetAll()">Reset everything</button>'+
    '<button class="btn" onclick="closeModal()">Close</button></div>'+
    '<div class="hint">'+(cloudOn()
      ?'Your save lives in this browser AND in your cloud account (synced automatically). The JSON export is an extra offline backup.'
      :'Your save lives only in this browser right now. Sign in above to keep a cloud copy, or export a JSON backup from time to time.')+
    ' &nbsp;·&nbsp; <a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms</a></div></div>';
  if(state.settings.friends && cloudOn()) setTimeout(loadFriendList,0);
}
function toggleSound(){ state.settings.sound=!state.settings.sound; persist(); openSettings(); if(state.settings.sound) SND.earn(); }
function toggleHardcore(){
  if(!state.settings.hardcore && !confirm('Turn on Hardcore? Being defeated will cost half your coins and revive you at just 10 HP. You can turn it off any time.')) return;
  state.settings.hardcore=!state.settings.hardcore; persist(); openSettings();
  toast(state.settings.hardcore?'💀 <span class="h">Hardcore ON - defeat bites hard now</span>':'🛡️ <span class="p">Hardcore off</span>');
}
function toggleRestDay(i){
  var rd=state.settings.restDays=state.settings.restDays||[];
  var at=rd.indexOf(i); if(at>=0) rd.splice(at,1); else rd.push(i);
  persist();
  var btns=document.querySelectorAll('.modal .daysrow .dow');   // update in place (don't rebuild the modal)
  for(var k=0;k<btns.length;k++){ var day=MON_ORDER[k]; btns[k].className='dow'+(rd.indexOf(day)>=0?' on':''); }
}
function setReminderHour(v){
  var h=parseInt(v,10); if(isNaN(h)||h<0||h>23) return;
  state.settings.reminderHour=h;
  state.remindedOn=null; // let the new time fire today if it has already passed
  persist();
  toast('🕕 <span class="p">Evening nudge set to '+(h%12||12)+':00 '+(h<12?'AM':'PM')+'</span>');
}
function toggleReminders(){
  if(state.settings.reminders){ state.settings.reminders=false; persist(); openSettings(); return; }
  if(typeof Notification==='undefined'){
    // iPhone/iPad Safari only exposes notifications to apps installed on the Home Screen
    var ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
    if(ios && !navigator.standalone) toast('📲 <span class="h">On iPhone: first add ScaleMyLife to your Home Screen (Share button → Add to Home Screen), open it from there, then turn on reminders.</span>','dmg');
    else toast('<span class="h">This browser does not support notifications</span>','dmg');
    return;
  }
  if(Notification.permission==='denied'){ toast('<span class="h">Notifications are blocked for this site - allow them in your browser settings, then try again</span>','dmg'); return; }
  var done=false;
  var after=function(p){
    if(done) return; done=true;
    if(p==='granted'){
      state.settings.reminders=true; persist(); openSettings();
      toast('🔔 <span class="p">Reminders on - evening nudge + focus alerts</span>');
      setTimeout(function(){ notifyNow('ScaleMyLife','🔔 Reminders are working! You’ll get your daily nudge at '+((state.settings.reminderHour||18)%12||12)+'pm.'); },400);
    }
    else toast('<span class="h">Permission not granted - reminders stay off</span>','dmg');
  };
  try{
    var ret=Notification.requestPermission(after);        // old Safari: callback form
    if(ret && ret.then) ret.then(after);                  // modern browsers: promise form
  }catch(e){ toast('<span class="h">Could not request permission ('+esc(String(e.message||e))+')</span>','dmg'); }
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
  var o=$('#overlay'); o.className='show'; o.dataset.seq=++overlaySeq;
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
  try{
    if(typeof Notification==='undefined' || Notification.permission!=='granted') return;
    var opts={body:body,icon:'icon-192.png',badge:'icon-192.png',tag:'sml'};
    // Prefer the service worker's notification (required on Android/Chrome and more
    // reliable on mobile); fall back to a page Notification where that's allowed.
    if(navigator.serviceWorker && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(function(reg){ if(reg&&reg.showNotification) reg.showNotification(title,opts); else new Notification(title,opts); }).catch(function(){ try{ new Notification(title,opts); }catch(e){} });
    } else { new Notification(title,opts); }
  }catch(e){}
}
function checkReminders(){
  if(!state || !state.settings.reminders) return;
  if(typeof Notification==='undefined' || Notification.permission!=='granted') return;
  var today=RPG.todayKey();
  var hr=(state.settings.reminderHour==null?18:state.settings.reminderHour);
  if(new Date().getHours()>=hr && state.remindedOn!==today){
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
  ctx.font='150px serif'; ctx.fillText(avPlain(h.avatar),540,340);
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
      '<button class="btn" onclick="cloudSignUp()">Create account</button>'+
      '<button class="btn ghost" onclick="cloudForgot()">Forgot password?</button></div>'+
      '<div class="hint" id="cMsg"></div>';
  }
  var ls=SMLCloud.lastSync();
  return '<div class="flabel">☁️ Cloud sync</div>'+
    '<div class="hint">Synced as <b>'+esc(sess.user.email||'')+'</b>'+(ls?' · last sync '+new Date(ls).toLocaleString():'')+'</div>'+
    '<div class="setrow" style="margin-top:6px"><button class="btn go" onclick="cloudSyncNow()">⟳ Sync now</button>'+
    '<button class="btn" onclick="cloudSignOut()">Sign out</button></div>'+
    '<div class="setrow"><button class="btn" onclick="toggleBoard()">'+(state.settings.board?'🏆 Leaderboard: IN':'🏆 Join the leaderboard')+'</button>'+
    '<button class="btn" onclick="toggleFriends()">'+(state.settings.friends?'🤝 Friends: ON':'🤝 Enable friends')+'</button></div>'+
    '<div class="hint">'+(state.settings.board?'On the global board - sharing name, avatar, title, level, rank, weekly XP, best streak.':'Global board is opt-in. Only ever shares those seven small fields - never your save.')+'</div>'+
    friendsBox()+
    '<div class="hint" id="cMsg"></div>';
}
function cloudMsg(t,bad){ var el=$('#cMsg'); if(el) el.innerHTML=bad?'<span class="h">'+esc(t)+'</span>':'<span class="p">'+esc(t)+'</span>'; }
function cloudSaveKey(){
  var k=($('#cKey').value||'').trim(); if(!k) return;
  SMLCloud.setKey(k); openSettings();
  toast('☁️ <span class="p">Cloud sync enabled - now create your account</span>');
}
function cloudForgot(){
  var e=($('#cEmail').value||'').trim();
  if(!e){ cloudMsg('Type your email above first, then press Forgot password', true); return; }
  cloudMsg('Sending reset link…');
  SMLCloud.resetPassword(e, location.origin+location.pathname).then(function(r){
    cloudMsg(r.ok?'Reset link sent - check your inbox, open the link on THIS device, and you’ll be asked for a new password.':(r.error||'Could not send the reset email'), !r.ok);
  });
}
/* arriving from a reset-password email: the URL hash holds a recovery session */
function handleRecoveryHash(){
  if(typeof SMLCloud==='undefined' || !SMLCloud.configured()) return false;
  var r=SMLCloud.recoverFromHash(location.hash);
  if(!r.signedIn) return false;
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){ location.hash=''; }
  SMLCloud.whoAmI().then(function(){
    var p1=prompt('Welcome back! Choose a new password (8+ characters):')||'';
    if(p1.length<8){ toast('<span class="h">Password not changed - it needs 8+ characters. Use Forgot password to try again.</span>','dmg'); return; }
    SMLCloud.updatePassword(p1).then(function(u){
      if(!u.ok){ toast('<span class="h">'+esc(u.error||'Could not update the password')+'</span>','dmg'); return; }
      toast('🔑 <span class="p">Password updated - you’re signed in</span>'); SND.ach();
      if(state){ afterCloudSignIn(); return; }
      SMLCloud.pull().then(function(r){   // fresh device: just take the cloud save
        if(r.ok && r.exists && r.data && r.data.hero){ state=RPG.migrate(r.data); RPG.save(state,localStorage); applyTheme(); render(); toast('☁️ <span class="p">Cloud save loaded</span>'); }
        else onboarding();   // no save anywhere: same first run as boot()
      });
    });
  });
  return true;
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
    SMLCloud.push(state).then(function(p){ cloudSyncErr=!(p&&p.ok); openSettings(); if(state) renderHUD(); cloudMsg(p.ok?'This device is now saved to the cloud ✓':(p.error||'Sync failed'), !p.ok); });
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
    '<div class="hint" id="frMsg"></div><div id="frInvites"></div><div id="frList"></div></div>';
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
      frMsg('Added '+(r.profile.name||'a hero')+' ✓ - they’ll see your invite and can add you back with one tap'); SND.ach();
      if($('#frCode')) $('#frCode').value='';
      loadFriendList();
    });
  });
}
function loadInvites(){
  var host=$('#frInvites'); if(!host) return;
  SMLCloud.listInvites().then(function(r){
    if(!r.ok || !host || !r.rows.length){ if(host) host.innerHTML=''; return; }
    host.innerHTML='<div class="flabel">📨 Invites - these heroes added you ('+r.rows.length+')</div>'+r.rows.map(function(x){
      return '<div class="frrow inv"><span class="bav">'+avHtml(x.avatar)+'</span><span class="grow">'+esc(x.name||'Hero')+' <span class="bmeta">'+esc(x.rank_code||'E')+' · Lv.'+(x.level||1)+'</span></span>'+
        '<button class="btn small go" onclick="acceptInvite(\''+x.user_id+'\')">✓ Add back</button>'+
        '<button class="btn ghost small" aria-label="Decline invite" onclick="declineInvite(\''+x.user_id+'\')">✕</button></div>';
    }).join('');
  });
}
function acceptInvite(id){
  SMLCloud.addFriend(id).then(function(a){
    if(!a.ok){ frMsg(a.error,true); return; }
    frMsg('Friend added ✓'); SND.ach(); loadInvites(); loadFriendList();
  });
}
function declineInvite(id){
  SMLCloud.declineInvite(id).then(function(){ loadInvites(); });
}
function loadFriendList(){
  var host=$('#frList'); if(!host) return;
  loadInvites();
  SMLCloud.fetchFriendsBoard(boardProfile()).then(function(r){
    if(!r.ok || !host) return;
    var others=r.rows.filter(function(x){return x.user_id!==r.me;});
    host.innerHTML=others.length?('<div class="flabel">Following ('+others.length+')</div>'+others.map(function(x){
      return '<div class="frrow"><span class="bav">'+avHtml(x.avatar)+'</span><span class="grow">'+esc(x.name||'Hero')+' <span class="bmeta">'+esc(x.rank_code||'E')+' · Lv.'+(x.level||1)+'</span></span><button class="btn ghost small" aria-label="Remove friend" onclick="unfriend(\''+x.user_id+'\')">✕</button></div>';
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
  var head='<div class="pcard"><div class="pav">'+avHtml(r.avatar)+'</div>'+
    '<div class="pname">'+esc(r.name||'Hero')+(mine?' <span class="chip muted">you</span>':'')+'</div>'+
    (r.title?'<div class="herotitle" style="cursor:default;animation:none">✦ '+esc(r.title)+' ✦</div>':'')+
    '<div class="pmeta"><span class="chip">'+esc(r.rank_code||'E')+'</span> Lv.'+(r.level||1)+stars+'</div></div>';
  var body;
  if(mine){
    body='<div class="hint" style="text-align:center">This is your card exactly as friends see it - only these stats are ever shared, never your save.</div>';
  } else {
    body='<div class="h2h"><div class="hrow head"><span class="hlabel"></span><span class="hval">'+avHtml(r.avatar)+'</span><span class="hvs"></span><span class="hval">you</span></div>'+
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
/* modal accessibility: Escape closes, Tab stays trapped inside, and focus moves
   into the dialog when it opens */
function modalFocusables(m){
  var f=m.querySelectorAll('button,[href],input:not([type=file]),select,textarea,[tabindex]:not([tabindex="-1"])');
  return Array.prototype.filter.call(f, function(el){ return !el.disabled && (el.offsetParent!==null || !('offsetParent' in el)); });
}
document.addEventListener('keydown', function(e){
  var m=document.getElementById('modal');
  if(!m || !m.classList.contains('show')) return;
  if(e.key==='Escape'){ e.preventDefault(); closeModal(); return; }
  if(e.key!=='Tab') return;
  var f=modalFocusables(m); if(!f.length) return;
  var first=f[0], last=f[f.length-1];
  if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
});
(function(){
  var m=document.getElementById('modal');
  if(!m || typeof MutationObserver==='undefined') return;
  new MutationObserver(function(){
    if(!m.classList.contains('show')) return;
    setTimeout(function(){
      if(m.contains(document.activeElement)) return;   // an opener already focused an input
      var f=modalFocusables(m); if(f.length) try{ f[0].focus(); }catch(e){}
    }, 30);
  }).observe(m, { attributes:true, attributeFilter:['class'] });
})();

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
/* Seven steps, one line each. The old ten-step version narrated features; this
   one only shows where things are, because the app teaches the rest in place.
   Two rules hold it together. Every `sel` must match something that is on
   screen once `tab` has rendered, or the tooltip floats in the middle of the
   viewport pointing at nothing (a test walks the list and checks each one).
   And nothing here targets #skillsRow any more: that element moves between the
   shell and #view depending on the tab, so it is the one selector that cannot
   be trusted to sit still. */
var tourStep=0;
var TOUR=[
  {tab:'today', sel:'#hud', title:'Your hero', body:'Your hero, level, XP, coins and streak live here'},
  {tab:'today', sel:'#tabs', title:'Getting around', body:'Five places: Today, Quests, Habits, Rewards, Progress'},
  {tab:'today', sel:'#view .panel', title:'Today', body:'Today shows what to do now'},
  {tab:'quests', sel:'#view .panel', title:'Quests', body:'Big goals with steps, side quests and dailies'},
  {tab:'market', sel:'#view .panel', title:'Rewards', body:'Earn coins by doing real things, spend them here'},
  {tab:'stats', sel:'.review,#view .panel', title:'Progress', body:'Your week, streak and life areas'},
  {tab:'stats', sel:'#mascot', title:'Sage', body:'Ask Sage when you are stuck'}
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

/* ---------- onboarding: the six-step wizard ----------
   boot() opens this when there is no save. Steps: 1 hero, 2 path, 3 day,
   4 habits, 5 quests, 6 rewards, then a Ready screen whose Start button is
   createHero(). Each tap re-renders the current step (onboarding(obStep)),
   so every pick lives in the module-level `ob` object, not in the DOM: a
   re-render that read its values back from the DOM would lose them.

   Three picks are still owned by older variables because the controls that
   write them are shared with the Character sheet: pickedAv (the avatar
   picker and the hero builder), pickedTheme (previewTheme, also read by
   applyTheme before a save exists) and pickedPaths (togglePath, which the
   tests read directly). obSync() copies those three into `ob` before every
   render and inside createHero, so createHero reads one object. If you add a
   pick, add it to obFresh() as well or it will leak into the next hero after
   a reset. */
var OB_STEPS=6;
var OB_MINUTES=[[15,'15 min'],[30,'30 min'],[60,'60 min or more']];
var OB_STRUGGLES=[['phone','Phone'],['procrastination','Procrastination'],['sleep','Sleep'],['junk','Junk food'],['none','None']];
/* the monster a struggle adds on step 4. The ids are stored on
   state.settings.onboard.struggle and the Rewards screen matches on them, so
   renaming an id here means renaming it there too. */
var OB_MONSTERS={phone:'Doomscrolling',procrastination:'Putting off the hard task',sleep:'Late-night scrolling',junk:'Junk food binge'};
function obFresh(){ return {name:'',avatar:null,paths:['general'],theme:null,minutes:30,struggle:'none',habitsOff:{},questsOff:{},rewardsOff:{},targets:{},custom:''}; }
var ob=obFresh(), obStep=1, obSug=null;
function obSync(){
  ob.avatar=pickedAv||ob.avatar||'🧙';
  ob.paths=(pickedPaths&&pickedPaths.length?pickedPaths:['general']).slice();
  ob.theme=pickedTheme;
}
/* how many dailies start switched on for a time budget: 15 min two, 30 min
   three, 60 min all of them. Infinity is deliberate: "all" must stay true
   however many quests a blend of paths seeds. */
function obBudget(min){ return min===15?2:(min===30?3:Infinity); }
/* The suggestions ARE the board the picked paths would seed, read off a
   throwaway state. Running the real seeder keeps steps 4 to 6 in step with
   PATHS in core.js without a second copy of the presets. createHero runs the
   same function over the real state, so the row order shown is the row order
   kept: change the filter here and the two go out of sync. */
function obLists(st){
  var habits=[], quests=[], rewards=[], di=0;
  st.habits.forEach(function(h){ if(h.type==='good') habits.push({id:h.id,title:h.title,target:h.target}); });
  st.quests.forEach(function(q){ quests.push({id:q.id,title:q.title,recurring:!!q.recurring,di:q.recurring?di++:-1}); });
  /* market items only, minus the protection items (Streak Shield): those are
     not "rewards you picked", the Rewards screen shows them under Protection */
  st.shop.forEach(function(s){ if(s.tab==='market'&&!s.special) rewards.push({id:s.id,title:s.title,price:s.price}); });
  return {habits:habits,quests:quests,rewards:rewards};
}
function obSuggest(){ return obLists(RPG.seedPreset(RPG.newState('preview', ob.avatar||'🧙'), ob.paths)); }
/* Is a suggested item switched on? ob.<kind>Off[title] true means the user
   turned it off, false means turned it back on; absent means the default:
   habits on, dailies inside the time budget on, the first three rewards on. */
function obOn(kind,it,i){
  var off=ob[kind+'Off'], t=it.title;
  if(Object.prototype.hasOwnProperty.call(off,t)) return !off[t];
  if(kind==='quests') return it.di<0 || it.di<obBudget(ob.minutes);
  if(kind==='rewards') return i<3;
  return true;
}
/* the toggles pass an index into obSug rather than the title, so no title
   ever lands inside an onclick attribute (an apostrophe would break it) */
function obToggle(kind,i){ var it=obSug&&obSug[kind]&&obSug[kind][i]; if(!it) return; ob[kind+'Off'][it.title]=obOn(kind,it,i); onboarding(obStep); }
function obToggleMonster(){ var t=OB_MONSTERS[ob.struggle]; if(!t) return; ob.habitsOff[t]=!ob.habitsOff[t]; onboarding(obStep); }
function obTarget(i,n){ var it=obSug&&obSug.habits[i]; if(!it) return; ob.targets[it.title]=n; onboarding(obStep); }
function obPick(key,val){ ob[key]=val; onboarding(obStep); }
function obNext(){
  if(obStep===1){
    if(!obNameCheck()){ var e=$('#obNameErr'); if(e) e.style.display=''; var i=$('#obName'); if(i) i.focus(); return; }
    ob.name=$('#obName').value.trim();
  }
  if(obStep===5){ var c=$('#obCustom'); if(c) ob.custom=c.value; }
  onboarding(obStep+1);
}
function obBack(){ onboarding(Math.max(1,obStep-1)); }
function obSkip(){ onboarding(OB_STEPS+1); }   // straight to Ready; picks not yet made keep their defaults
function obDots(step){
  var h='';
  for(var j=1;j<=OB_STEPS;j++) h+='<i class="'+(j<step?'done':(j===step?'on':''))+'"></i>';
  return '<div class="tdots" role="img" aria-label="'+(step>OB_STEPS?'All steps done':'Step '+step+' of '+OB_STEPS)+'">'+h+'</div>';
}
function obChips(key,opts){
  return '<div class="obchips" role="group">'+opts.map(function(o){ var on=ob[key]===o[0], v=typeof o[0]==='number'?o[0]:'\''+o[0]+'\'';
    return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="obPick(\''+key+'\','+v+')">'+o[1]+'</button>'; }).join('')+'</div>';
}
/* weekly target chips under a habit: 3x, 5x, daily, plus the preset's own
   value when it is none of those (Meal prep starts at 2x), so what is shown
   is always what the engine will use */
function obTargets(i,it){
  var cur=ob.targets[it.title]||it.target||7, vals=[3,5,7];
  if(vals.indexOf(cur)<0) vals.push(cur);
  vals.sort(function(a,b){ return a-b; });
  return '<div class="obchips targets" role="group" aria-label="Times per week">'+vals.map(function(n){ var on=n===cur;
    return '<button type="button" class="chip'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="obTarget('+i+','+n+')">'+(n===7?'daily':n+'x')+'</button>'; }).join('')+'</div>';
}
function obRow(kind,i,it,on,meta){
  return '<div class="obitem'+(on?' on':'')+'">'+
    '<button type="button" class="obtog" aria-pressed="'+on+'" onclick="obToggle(\''+kind+'\','+i+')">'+
      '<span class="obbox">'+svgIcon('check','sm')+'</span><span class="obname">'+esc(it.title)+'</span>'+(meta?'<span class="obmeta">'+meta+'</span>':'')+'</button>'+
    (kind==='habits'&&on?obTargets(i,it):'')+'</div>';
}
function obThemesHtml(){
  return '<div class="obthemes">'+Object.keys(THEMES).map(function(k){ var t=THEMES[k];
    return '<button type="button" class="obtheme'+((pickedTheme||'dungeon')===k?' on':'')+'" onclick="previewTheme(\''+k+'\')" aria-pressed="'+((pickedTheme||'dungeon')===k)+'">'+
      '<span class="sw" style="background:'+t.bg+'"><i style="background:'+t.panel+'"></i><i style="background:'+t.accent+'"></i></span>'+esc(t.name)+'</button>';
  }).join('')+'</div>';
}
function onboarding(step){
  obStep=step||1; obSync();
  pickedAv=pickedAv||'🧙';
  var s=obStep, title='', copy='', body='', nav='', mon=OB_MONSTERS[ob.struggle];
  if(s===1){
    title='Your hero'; copy='Name your character and pick a look.';
    body='<input id="obName" placeholder="Hero name" maxlength="24" autocomplete="off" value="'+esc(ob.name)+'" oninput="obNameCheck()">'+
      '<div class="hint" id="obNameErr" style="color:var(--danger);display:none">Give your hero a name to continue.</div>'+
      '<div class="flabel">Avatar</div>'+avPickerHtml('onboarding')+
      '<div class="flabel">Look</div>'+obThemesHtml();
  } else if(s===2){
    title='Your path'; copy='Pick ALL that fit, the board blends them.';
    body='<div class="pathpick">'+RPG.PATHS.map(function(p){ var on=ob.paths.indexOf(p.id)>=0;
      return '<button type="button" class="'+(on?'on':'')+'" aria-pressed="'+on+'" onclick="togglePath(\''+p.id+'\')"><span class="pi">'+p.icon+'</span><b>'+esc(p.name)+'</b><small>'+esc(p.blurb)+'</small></button>';
    }).join('')+'</div>';
  } else if(s===3){
    title='Your day'; copy='How much time, and what gets in the way.';
    body='<div class="flabel">Time per day</div>'+obChips('minutes',OB_MINUTES)+
      '<div class="flabel">Biggest struggle</div>'+obChips('struggle',OB_STRUGGLES);
  } else if(s===4){
    obSug=obSuggest();
    title='Habits to start'; copy='Turn off any you do not want, set how often.';
    body='<div class="oblist">'+obSug.habits.map(function(it,i){ return obRow('habits',i,it,obOn('habits',it,i)); }).join('')+'</div>'+
      (mon?'<div class="flabel">Monster to fight</div><div class="oblist"><div class="obitem'+(ob.habitsOff[mon]?'':' on')+'">'+
        '<button type="button" class="obtog" aria-pressed="'+!ob.habitsOff[mon]+'" onclick="obToggleMonster()">'+
        '<span class="obbox">'+svgIcon('check','sm')+'</span><span class="obname">'+esc(mon)+'</span><span class="obmeta">costs HP when you slip</span></button></div></div>':'');
  } else if(s===5){
    obSug=obSuggest();
    title='First quests'; copy='Dailies that fit your time are on. Toggle any.';
    body='<div class="oblist">'+obSug.quests.map(function(it,i){ return obRow('quests',i,it,obOn('quests',it,i),it.recurring?'daily':''); }).join('')+'</div>'+
      '<div class="flabel">Your own (optional)</div>'+
      '<input id="obCustom" placeholder="Add one of your own" maxlength="60" autocomplete="off" value="'+esc(ob.custom)+'" oninput="ob.custom=this.value">';
  } else if(s===6){
    obSug=obSuggest();
    title='Rewards'; copy='What your coins will buy. Add more later.';
    body='<div class="oblist">'+obSug.rewards.map(function(it,i){ var on=obOn('rewards',it,i);
      return '<button type="button" class="obcard'+(on?' on':'')+'" aria-pressed="'+on+'" onclick="obToggle(\'rewards\','+i+')">'+
        '<span class="obbox">'+svgIcon('check','sm')+'</span><span class="obname">'+esc(it.title)+'</span><span class="obprice">💰 '+it.price+'</span></button>'; }).join('')+'</div>';
  } else {
    title='Ready when you are';
    body='<div class="obready"><div class="obav">'+avHtml(ob.avatar)+'</div><div class="obheroname">'+esc(ob.name||'Hero')+'</div></div>'+
      '<div class="oblines">'+
      '<div class="obline">'+svgIcon('coins')+'<span>Clear quests and keep habits to earn XP and coins</span></div>'+
      '<div class="obline">'+svgIcon('flame')+'<span>Keep the streak, Sage will help</span></div>'+
      '<div class="obline">'+svgIcon('gift')+'<span>Spend coins on the rewards you picked</span></div></div>';
  }
  if(s>OB_STEPS){
    nav='<button class="btn go wide" id="obStart" onclick="createHero()">Start</button>'+
      '<div class="obnav"><button type="button" class="btn ghost" onclick="obBack()">'+svgIcon('chevron-left','sm')+' Back</button></div>';
  } else {
    nav='<button class="btn go wide" id="obNext" onclick="obNext()">Continue</button>'+
      (s>1?'<div class="obnav"><button type="button" class="btn ghost" onclick="obBack()">'+svgIcon('chevron-left','sm')+' Back</button>'+
        (s>=3?'<button type="button" class="btn ghost" onclick="obSkip()">Skip</button>':'')+'</div>':'');
  }
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box obwiz">'+obDots(s)+'<h2>'+title+'</h2>'+(copy?'<p class="obcopy">'+copy+'</p>':'')+body+nav+'</div>';
  if(s===1){ var inp=$('#obName'); if(inp && !inp.value) inp.focus(); obNameCheck(); }
}
function previewTheme(k){
  if(!THEMES[k]) return;
  pickedTheme=k; ob.theme=k; applyTheme();
  var btns=document.querySelectorAll('.modal .obthemes .obtheme'), keys=Object.keys(THEMES);
  for(var i=0;i<btns.length;i++){ var on=keys[i]===k; btns[i].className='obtheme'+(on?' on':''); btns[i].setAttribute('aria-pressed',on); }
}
/* Continue on step 1 waits for a non-blank name. Returns true when there is
   no name field on screen (later steps), so callers can use it as a plain
   "is the name fine" check. */
function obNameCheck(){
  var inp=$('#obName'), btn=$('#obNext'); if(!inp||!btn) return true;
  var ok=inp.value.trim().length>0; ob.name=inp.value;
  btn.disabled=!ok; btn.style.opacity=ok?'':'0.5'; btn.style.cursor=ok?'':'not-allowed';
  if(ok){ var e=$('#obNameErr'); if(e) e.style.display='none'; }
  return ok;
}
/* Turns `ob` into the real save. The board is seeded exactly as before and
   the picks are then applied through the engine's own actions (delete, edit,
   add): editing the arrays here directly would skip the bookkeeping those
   actions do. */
function createHero(){
  obSync();
  var inp=$('#obName');
  var raw=((inp?inp.value:ob.name)||'').trim();
  if(!raw){
    /* the name lives on step 1: if we are elsewhere, go back there so the
       error has an input to point at (inline error plus focus, as before) */
    if(!inp){ onboarding(1); inp=$('#obName'); }
    var e=$('#obNameErr'); if(e) e.style.display=''; obNameCheck(); if(inp) inp.focus(); return;
  }
  var n=raw, paths=ob.paths;
  state=RPG.seedPreset(RPG.newState(n,ob.avatar||'🧙'), paths);
  var L=obLists(state);
  L.habits.forEach(function(it,i){
    if(!obOn('habits',it,i)) A.deleteHabit(state,it.id);
    else if(ob.targets[it.title]) A.editHabit(state,it.id,{target:ob.targets[it.title]});
  });
  L.quests.forEach(function(it,i){ if(!obOn('quests',it,i)) A.deleteQuest(state,it.id); });
  L.rewards.forEach(function(it,i){ if(!obOn('rewards',it,i)) A.deleteShopItem(state,it.id); });
  var mon=OB_MONSTERS[ob.struggle];
  if(mon){
    /* a path may already seed the same monster (Doomscrolling): keep that one
       rather than adding a twin, and drop it if the user switched the row off */
    var twins=state.habits.filter(function(h){ return h.type==='bad'&&h.title.toLowerCase()===mon.toLowerCase(); });
    if(ob.habitsOff[mon]) twins.forEach(function(h){ A.deleteHabit(state,h.id); });
    else if(!twins.length) A.addHabit(state,{title:mon,type:'bad'});
  }
  if(ob.custom&&ob.custom.trim()) A.addQuest(state,{title:ob.custom.trim(),diff:'normal'});
  /* the Rewards screen reads this to suggest rewards; keep exactly this shape */
  state.settings.onboard={paths:paths.slice(),struggle:ob.struggle,minutes:ob.minutes};
  if(ob.theme&&THEMES[ob.theme]) state.settings.theme=ob.theme;
  pickedAv=null; pickedTheme=null; pickedPaths=['general']; ob=obFresh(); obStep=1; obSug=null;
  RPG.addLog(state,'🎮','A new adventure begins. Welcome, '+n+'!');
  persist(); applyTheme(); closeModal(); render(); confetti();
  setTimeout(function(){ startTour(); }, 700); // interactive spotlight tour for first-timers
}
/* ---------- Sage the guide (mascot) ----------
   Phase 1: an animated companion that speaks a scripted daily briefing built
   from your save (RPG.briefing) - no network, no LLM.
   Phase 2 (below): real chat via the sage-chat Supabase Edge Function, shown
   only when cloud sync is on (needs a signed-in session to authorize the
   call and rate-limit per user). The Anthropic key lives server-side only. */
var MASCOT_AURA={happy:'',fired:'🔥',proud:'✨',worried:'💧',urgent:'❗'};
function mascotOn(){ return state && state.settings.mascot!==false; }
function ensureMascot(){
  var host=document.getElementById('mascot');
  if(!mascotOn()){ if(host) host.style.display='none'; return null; }
  if(!host){
    host=document.createElement('div'); host.id='mascot';
    host.innerHTML='<div class="mbubble" id="mBubble" role="region" aria-label="Sage’s daily briefing" hidden></div>'+
      '<button class="mbtn" id="mBtn" aria-label="Talk to Sage, your guide" title="Sage - your guide" onclick="toggleMascot()"><span class="mface">🦉</span><span class="maura" aria-hidden="true"></span><span class="mcue" id="mCue" aria-hidden="true" hidden>💬</span></button>';
    document.body.appendChild(host);
  }
  host.style.display='';
  updateSageCue();
  return host;
}
/* the little 💬 badge that tells first-time users the owl is chattable - shown
   only when cloud chat is available and they haven't opened the chat yet */
function sageChatAvailable(){ return typeof SMLCloud!=='undefined' && SMLCloud.configured() && cloudOn(); }
function updateSageCue(){
  var cue=document.getElementById('mCue'); if(!cue) return;
  var seen=false; try{ seen=localStorage.getItem('sml.sage.chatseen')==='1'; }catch(e){}
  cue.hidden=!(sageChatAvailable() && !seen);
}
function mascotBriefingHtml(){
  var b=RPG.briefing(state);
  var chatEntry=(typeof SMLCloud!=='undefined'&&SMLCloud.configured()&&cloudOn())
    ?'<button class="mline mchat-entry" onclick="openSageChat()"><span>💬</span><span class="grow">Ask me anything</span><span class="mgo">▶</span></button>'
    :'';
  return '<div class="mhead"><b>'+esc(b.greeting)+'</b><button class="btn ghost small" aria-label="Close" onclick="toggleMascot(false)">✕</button></div>'+
    '<div class="mlines">'+b.lines.map(function(l){
      return '<button class="mline" onclick="toggleMascot(false);go(\''+l.tab+'\')"><span>'+l.icon+'</span><span class="grow">'+esc(l.text)+'</span><span class="mgo">▶</span></button>';
    }).join('')+chatEntry+'</div>'+
    '<div class="mfoot">🔥 '+b.streak+' day'+(b.streak===1?'':'s')+' · Lv.'+b.level+' · <span class="hint" style="display:inline">tap a line to jump there</span></div>';
}
function toggleMascot(force){
  var host=ensureMascot(); if(!host) return;
  var bub=document.getElementById('mBubble'), btn=document.getElementById('mBtn');
  var show=typeof force==='boolean'?force:bub.hidden;
  if(show){ mascotView='brief'; bub.innerHTML=mascotBriefingHtml(); bub.hidden=false; btn.classList.add('talking'); setTimeout(function(){ btn.classList.remove('talking'); },900); }
  else bub.hidden=true;
}

/* ---------- Sage Phase 2: real chat via the sage-chat Edge Function ----------
   In-memory only (mascotChatLog) - conversations are not saved to the state
   or synced; each app open starts fresh. The Anthropic key never reaches the
   client, only short replies do (see supabase/functions/sage-chat). */
var mascotView='brief', mascotChatLog=[], mascotChatBusy=false;
function sageBrief(){
  var h=state.hero, today=RPG.todayKey();
  var chest=A.chestStatus(state);
  var bits=['name '+h.name,'level '+h.level,'streak '+h.streak+'d',
    'HP '+h.hp+'/'+RPG.maxHpOf(state),'coins '+h.coins,
    'dailies '+chest.done+'/'+chest.total+' today'];
  if(state.boss&&!state.boss.doneOn) bits.push('weekly boss "'+state.boss.title+'" active');
  if(state.hero.downed) bits.push('currently downed');
  return bits.join(', ');
}
function sageToday(state){
  var today=RPG.todayKey();
  var qs=(state.quests||[]).filter(function(q){ return !q.doneOn || q.doneOn===today; }).slice(-15)
    .map(function(q){ return 'quest '+q.id+': '+String(q.title||'').replace(/[":;]/g,' '); });
  var hs=(state.habits||[]).filter(function(h){ return h.type==='good'; }).slice(-15)
    .map(function(h){ return 'habit '+h.id+': '+String(h.title||'').replace(/[":;]/g,' '); });
  var gs=(state.goals||[]).filter(function(g){ return !g.doneOn; }).slice(-10)
    .map(function(g){ return 'main-quest '+g.id+': '+String(g.title||'').replace(/[":;]/g,' '); });
  return qs.concat(hs).concat(gs).join('; ').slice(0,1600);
}
var SAGE_ACTION_TIERS={complete_quest:'auto',complete_habit:'auto',log_mood:'auto',add_quest:'confirm',add_habit:'confirm'};
function sageApplyAction(type, params){
  params=params||{};
  if(type==='complete_quest'){
    if(!state.quests.some(function(q){ return q.id===params.quest_id; })) return false;
    doQuest(params.quest_id); return true;
  }
  if(type==='complete_habit'){
    if(!state.habits.some(function(h){ return h.id===params.habit_id; })) return false;
    doHabit(params.habit_id); return true;
  }
  if(type==='log_mood'){
    if(!RPG.MOODS.some(function(m){ return m.key===params.mood; })) return false;
    var r=A.logJournal(state, params.mood, (state.journal[RPG.todayKey()]||{}).note || ''); persist(); render(); fx(r); return true;
  }
  if(type==='add_quest'){
    var t=String(params.title||'').trim(); if(!t) return false;
    var diff=['easy','normal','hard','epic'].indexOf(params.difficulty)>=0?params.difficulty:'normal';
    var mainId=(params.main_quest_id && (state.goals||[]).some(function(g){ return g.id===params.main_quest_id; }))?params.main_quest_id:null;
    A.addQuest(state,{title:t,diff:diff,skillId:null,due:params.due||null,recurring:false,days:null,main:mainId});
    persist(); render(); return true;
  }
  if(type==='add_habit'){
    var t2=String(params.title||'').trim(); if(!t2) return false;
    A.addHabit(state,{title:t2,type:'good',skillId:null,target:Number(params.target)||7});
    persist(); render(); return true;
  }
  return false;
}
function openSageChat(){
  mascotView='chat';
  try{ localStorage.setItem('sml.sage.chatseen','1'); }catch(e){}
  updateSageCue();
  var host=ensureMascot(); if(!host) return;
  var bub=document.getElementById('mBubble');
  bub.innerHTML=mascotChatHtml(); bub.hidden=false;
  var log=document.getElementById('mChatLog'); if(log) log.scrollTop=log.scrollHeight;
  var inp=document.getElementById('mChatInput'); if(inp) inp.focus();
}
function mascotChatHtml(){
  var rows=mascotChatLog.map(function(m,i){
    var body=m.text?esc(m.text):'';
    if(m.pendingAction){
      var p=m.pendingAction, label=(p.type==='add_quest'?'Add quest: "':'Add habit: "')+esc(String(p.params.title||''))+'"';
      body+='<div class="mchat-action"><div>'+label+'</div>'+
        '<button class="btn go small" onclick="sageConfirmAction('+i+')">Yes, add it</button>'+
        '<button class="btn ghost small" onclick="sageCancelAction('+i+')">Cancel</button></div>';
    }
    return '<div class="mchat-row '+m.who+'">'+body+'</div>';
  }).join('') || '<div class="hint" style="text-align:center;margin-top:10px">Ask Sage about your quests, habits, or how to catch up today.</div>';
  return '<div class="mhead"><button class="btn ghost small" aria-label="Back" onclick="toggleMascot(true)">◀</button><b>🦉 Sage</b><button class="btn ghost small" aria-label="Close" onclick="toggleMascot(false)">✕</button></div>'+
    '<div class="mchat-log" id="mChatLog">'+rows+(mascotChatBusy?'<div class="mchat-row sage typing">…</div>':'')+'</div>'+
    '<div class="mchat-input"><input id="mChatInput" maxlength="500" placeholder="Ask Sage…" '+(mascotChatBusy?'disabled':'')+' onkeydown="if(event.key===\'Enter\')sageSend()">'+
    '<button class="btn go small" '+(mascotChatBusy?'disabled':'')+' onclick="sageSend()">Send</button></div>';
}
function sageConfirmAction(i){
  var m=mascotChatLog[i]; if(!m||!m.pendingAction) return;
  var applied=sageApplyAction(m.pendingAction.type, m.pendingAction.params);
  m.pendingAction=null;
  m.text=(m.text?m.text+'\n\n':'')+(applied?'Done!':'Could not add that.');
  var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
}
function sageCancelAction(i){
  var m=mascotChatLog[i]; if(!m||!m.pendingAction) return;
  m.pendingAction=null;
  m.text=(m.text?m.text+'\n\n':'')+'Cancelled.';
  var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
}
/* Prior turns as Anthropic-style {role,content} for Sage's conversational
   memory. Built from the in-memory chat log before the current message is
   pushed. Skips empties, keeps user/assistant alternation, caps to recent
   turns; a pending-action bubble (empty text) is described so history stays
   coherent. */
function sageHistory(){
  var out=[];
  for(var i=0;i<mascotChatLog.length;i++){
    var m=mascotChatLog[i], role=(m.who==='you')?'user':'assistant';
    var content=(m.text||'').trim();
    if(!content && m.pendingAction){
      var p=m.pendingAction;
      content=(p.type==='add_quest'?'Proposed adding a quest: ':'Proposed adding a habit: ')+String((p.params&&p.params.title)||'');
    }
    if(!content) continue;
    if(out.length && out[out.length-1].role===role){          // coalesce consecutive same-role (a turn can add several sage bubbles)
      out[out.length-1].content=(out[out.length-1].content+'\n'+content).slice(0,1000);
    } else {
      out.push({role:role, content:content.slice(0,500)});
    }
  }
  return out.slice(-20);
}
function sageAutoNote(type, applied){
  if(!applied) return "Hmm, I couldn't find that one on your list - what's the exact name?";
  if(type==='complete_quest') return 'Done - marked that quest complete. ✓';
  if(type==='complete_habit') return 'Nice - checked that habit off for today. ✓';
  if(type==='log_mood') return 'Logged your mood for today. ✓';
  return 'Done. ✓';
}
function sageSend(){
  var inp=document.getElementById('mChatInput'); if(!inp||mascotChatBusy) return;
  var text=inp.value.trim(); if(!text) return;
  var history=sageHistory();   // prior turns, before this message joins the log
  mascotChatLog.push({who:'you',text:text});
  mascotChatBusy=true;
  var bub=document.getElementById('mBubble'); if(bub) bub.innerHTML=mascotChatHtml();
  var log=document.getElementById('mChatLog'); if(log) log.scrollTop=log.scrollHeight;
  SMLCloud.chatSage(text, sageBrief(), sageToday(state), history).then(function(r){
    mascotChatBusy=false;
    if(r.ok){
      /* the model may return several actions in one turn - apply every auto
         action, queue a confirm card per confirm action */
      var actions=Array.isArray(r.actions)?r.actions:(r.action?[r.action]:[]);
      var autoNotes=[], confirms=[];
      actions.forEach(function(a){
        var tier=SAGE_ACTION_TIERS[a.type];
        if(tier==='auto') autoNotes.push(sageAutoNote(a.type, sageApplyAction(a.type, a.params)));
        else if(tier==='confirm') confirms.push(a);
      });
      if(r.reply) mascotChatLog.push({who:'sage',text:r.reply});
      if(autoNotes.length) mascotChatLog.push({who:'sage',text:autoNotes.join('\n')});
      confirms.forEach(function(a){ mascotChatLog.push({who:'sage',text:'',pendingAction:{type:a.type,params:a.params}}); });
    } else {
      mascotChatLog.push({who:'sage',text:r.error||'Sage could not reply just now.'});
    }
    if(mascotView==='chat'){
      var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
      var l=document.getElementById('mChatLog'); if(l) l.scrollTop=l.scrollHeight;
      var i=document.getElementById('mChatInput'); if(i) i.focus();
    }
  });
}
function mascotMoodSync(){
  var host=ensureMascot(); if(!host) return;
  var b=RPG.briefing(state);
  host.className='m-'+b.mood;
  var aura=host.querySelector('.maura'); if(aura) aura.textContent=MASCOT_AURA[b.mood]||'';
  updateSageCue();
}
/* Once a day, on the first open: Sage's line appears under Today's greeting
   (sageLine()) instead of the bubble popping over the screen. The bubble is
   one tap away through the line's More control. The sml.mascot.day key is the
   once-per-day rule; clear it in devtools to see the line again today. */
function mascotDailyGreet(){
  if(!mascotOn()) return;
  var k='sml.mascot.day';
  try{
    if(localStorage.getItem(k)===RPG.todayKey()) return;
    localStorage.setItem(k,RPG.todayKey());
  }catch(e){ return; }
  sageLineDay=RPG.todayKey();
  if(state && tab==='today') render();
}
function toggleMascotSetting(){
  state.settings.mascot=state.settings.mascot===false?true:false;
  persist();
  var host=document.getElementById('mascot');
  if(host) host.style.display=state.settings.mascot===false?'none':'';
  if(state.settings.mascot!==false) mascotMoodSync();
  openSettings();
}
/* No save means a first run: the empty shell goes up behind the onboarding
   wizard. The five "How it works" slides (tut) are no longer the front door;
   they stay in Settings and, with no hero, still hand over to the wizard. */
function boot(){ applyTheme(); var rec=handleRecoveryHash(); if(state){ seenDay=state.lastSeenDay; navAnim=true; render(); checkFocus(); if(!rec) cloudBootPull(); mascotMoodSync(); mascotDailyGreet(); } else { renderHUDShell(); if(!rec) onboarding(); } }
function renderHUDShell(){ $('#hud').innerHTML='<div class="avatar">❔</div><div class="who"><div class="name">…</div></div><div></div>'; $('#tabs').innerHTML=''; $('#skillsRow').innerHTML=''; $('#view').innerHTML=''; }

setInterval(function(){ if(state){ checkFocus(); if(state.lastSeenDay!==RPG.todayKey()){ render(); } } }, 1000);
setInterval(function(){ if(state) checkReminders(); }, 30000);
var lastVisPull=0;
document.addEventListener('visibilitychange', function(){
  if(!state) return;
  if(document.hidden){ flushCloudPush(); return; }   // leaving -> save the latest right away
  /* Returning to the foreground - including a backgrounded PWA resume or a
     bfcache restore, neither of which re-runs boot(). Catch up on a missed
     day rollover right away instead of waiting on the 1s poll interval, which
     can be suspended for hours while the app is backgrounded. Without this,
     a cloud pull below can also silently no-op (the pulled save isn't "ahead"
     if nothing changed overnight), leaving yesterday's completed dailies on
     screen until something else happens to trigger a render. */
  if(state.lastSeenDay!==RPG.todayKey()) render();
  var now=Date.now();
  if(now-lastVisPull>5*60000){ lastVisPull=now; cloudBootPull(); }
});
window.addEventListener('pagehide', function(){ if(state) flushCloudPush(); });

/* ---------- diagnostics: keep the last runtime errors so problems are visible ---------- */
var ERRLOG_KEY='sml.errlog.v1';
function logClientError(msg){
  try{
    var log=JSON.parse(localStorage.getItem(ERRLOG_KEY)||'[]');
    log.unshift({t:new Date().toISOString(),m:String(msg).slice(0,300)});
    if(log.length>20) log.length=20;
    localStorage.setItem(ERRLOG_KEY,JSON.stringify(log));
  }catch(e){}
}
function clientErrors(){ try{ return JSON.parse(localStorage.getItem(ERRLOG_KEY)||'[]'); }catch(e){ return []; } }
window.addEventListener('error',function(ev){
  logClientError((ev.message||'error')+' @ '+String(ev.filename||'').split('/').pop()+':'+(ev.lineno||0));
});
window.addEventListener('unhandledrejection',function(ev){
  logClientError('unhandled promise: '+((ev.reason&&ev.reason.message)||ev.reason));
});
function openDiagnostics(){
  var log=clientErrors();
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>🩺 DIAGNOSTICS</h2>'+
    (log.length?'<div class="hint">The app hit '+log.length+' error'+(log.length===1?'':'s')+' recently. Copy this when reporting a bug.</div>'+
      '<div class="errlog">'+log.map(function(e){ return '<div class="errrow"><span class="et">'+esc(e.t.slice(5,16).replace('T',' '))+'</span>'+esc(e.m)+'</div>'; }).join('')+'</div>'+
      '<div class="setrow"><button class="btn" onclick="copyErrLog()">📋 Copy</button>'+
      '<button class="btn" onclick="localStorage.removeItem(ERRLOG_KEY);openDiagnostics()">🧹 Clear</button>'+
      '<button class="btn" onclick="closeModal()">Close</button></div>'
     :'<div class="hint">No errors recorded. If something ever glitches, the details land here.</div>'+
      '<div class="setrow"><button class="btn" onclick="closeModal()">Close</button></div>')+
    '</div>';
}
function copyErrLog(){
  var txt=clientErrors().map(function(e){ return e.t+' '+e.m; }).join('\n');
  try{ navigator.clipboard&&navigator.clipboard.writeText(txt); }catch(e){}
  toast('📋 <span class="p">Error log copied</span>');
}

boot();
if('serviceWorker' in navigator && location.protocol==='https:'){
  /* mobile PWAs rarely do a hard reload, so old versions used to stick around:
     re-check for updates whenever the app returns to the foreground, and when a
     new service worker takes over, refresh once so the fresh code actually runs */
  var hadSW=!!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(function(reg){
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden){ try{ reg.update(); }catch(e){} }
    });
  }).catch(function(){});
  var swReloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(!hadSW || swReloaded) return;   // first-ever install: nothing old to replace
    swReloaded=true;
    toast('✨ <span class="p">Updating to the latest version…</span>');
    setTimeout(function(){ location.reload(); }, 700);
  });
}
