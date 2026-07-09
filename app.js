'use strict';
var $ = function(s,el){ return (el||document).querySelector(s); };
var A = RPG.actions;
var state = RPG.load(localStorage);
var tab='today', shopTab='market', pendingMood=null, pendingQuality=3;
var focusMode={work:50,brk:10};
var DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var pendingDays=[];              // weekday ints picked for a new recurring quest
var pickedPath='general';        // onboarding path

var RANK_COLORS={E:'#9a94b8',D:'#5aa2ff',C:'#3ddc84',B:'#b07bff',A:'#ff9d47',S:'#f5c542',SS:'#ff5fa2'};
var THEMES={
  dungeon:  {name:'Dungeon',  bg:'#12101f',panel:'#1b1830',panel2:'#221e3d',line:'#2e2950',accent:'#f5c542'},
  synthwave:{name:'Synthwave',bg:'#170b22',panel:'#221030',panel2:'#2c1440',line:'#45215e',accent:'#ff5fa2'},
  forest:   {name:'Forest',   bg:'#0d1712',panel:'#14231b',panel2:'#1a2f23',line:'#28492f',accent:'#7bd88f'},
  crimson:  {name:'Crimson',  bg:'#1a0d12',panel:'#26141b',panel2:'#321a23',line:'#4a2532',accent:'#ff7854'},
  ocean:    {name:'Ocean',    bg:'#0a1220',panel:'#101c30',panel2:'#15263f',line:'#22395c',accent:'#59c2ff'}
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
}
/* Legend mode: at rank S/SS the whole interface shifts to a refined, gilded look */
function applyLegend(){
  var w=$('#wrap'); if(!w||!state) return;
  var code=RPG.rankFor(state.hero.level).code;
  w.classList.toggle('legend', code==='S'||code==='SS');
  w.classList.toggle('ss', code==='SS');
}
function persist(){ RPG.save(state, localStorage); }
function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/* ---------- sound ---------- */
var AC=null;
function beep(freq,when,dur,type,vol){
  if(!state || !state.settings.sound) return;
  try{
    AC = AC || new (window.AudioContext||window.webkitAudioContext)();
    var t=AC.currentTime+when, o=AC.createOscillator(), g=AC.createGain();
    o.type=type||'square'; o.frequency.value=freq;
    g.gain.setValueAtTime(vol||0.06,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+dur);
  }catch(e){}
}
var SND={
  earn:function(){ beep(660,0,.09); beep(880,.09,.12); },
  levelup:function(){ [523,659,784,1047].forEach(function(f,i){ beep(f,i*.12,.22,'square',.07); }); },
  rankup:function(){ [392,523,659,784,1047,1319,1568].forEach(function(f,i){ beep(f,i*.13,.3,'square',.08); }); },
  dmg:function(){ beep(120,0,.28,'sawtooth',.09); beep(90,.1,.25,'sawtooth',.07); },
  buy:function(){ beep(880,0,.08,'triangle',.08); beep(1320,.08,.14,'triangle',.08); },
  chest:function(){ [660,880,1174,1568].forEach(function(f,i){ beep(f,i*.09,.14,'triangle',.08); }); },
  ach:function(){ [784,988,1175].forEach(function(f,i){ beep(f,i*.1,.18,'square',.06); }); },
  brk:function(){ [880,660,523].forEach(function(f,i){ beep(f,i*.15,.3,'triangle',.07); }); },
  resume:function(){ [523,784,1047].forEach(function(f,i){ beep(f,i*.1,.18,'triangle',.08); }); }
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
  if(res.ko) koScreen();
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
function koScreen(){
  var o=$('#overlay'); o.className='show';
  o.innerHTML='<div class="levelbox"><div class="big" style="color:var(--hp)">💀 KNOCKED OUT</div>'+
    '<div class="sub">The monsters got you. You wake up at the inn with 25 HP.</div>'+
    '<div class="sub" style="color:var(--muted)">Rest up: sleep well or visit the 🛏️ Hotel.</div>'+
    '<button class="btn" onclick="closeOverlay()">Get up</button></div>';
}
function chestScreen(res){
  SND.chest(); confetti();
  var loot='';
  if(res.loot){
    confetti(true);
    if(res.loot.type==='jackpot') loot='<div class="lootline gold">💰 <b>COIN JACKPOT</b> — +'+res.loot.coins+' bonus coins!</div>';
    else if(res.loot.type==='potion') loot='<div class="lootline">🧪 Rare drop: <b>Focus Elixir</b> — quaff it any day for ×2 XP.</div>';
    else if(res.loot.type==='frame') loot='<div class="lootline" style="color:'+res.loot.frame.color+'">🖼 Rare drop: <b>'+esc(res.loot.frame.name)+' frame</b> — equip it on your avatar.</div>';
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
  if(r){ SND.chest(); sparks('🧪'); toast('🧪 <span class="p">Focus Elixir — XP ×'+r.mult+' for the rest of today</span>'); }
}
function closeOverlay(){ $('#overlay').className=''; render(); }

/* ---------- rendering ---------- */
function skillName(id){ var s=state.skills.find(function(k){return k.id===id;}); return s? s.icon+' '+s.name : null; }

function renderHUD(){
  var h=state.hero, need=RPG.xpForLevel(h.level), r=RPG.rankFor(h.level), nr=RPG.nextRank(h.level);
  var col=RANK_COLORS[r.code]||'var(--gold)';
  var maxHp=RPG.maxHpOf(state);
  var fr=h.frame?RPG.frameById(h.frame):null;
  var avStyle=fr?('border-color:'+fr.color+';box-shadow:0 0 12px '+fr.glow+', inset 0 0 8px '+fr.glow):('border-color:'+col);
  var asc=(h.ascension||0)>0?'<span class="season" title="Season '+h.ascension+' — you have ascended '+h.ascension+' time'+(h.ascension===1?'':'s')+'">✦ S'+h.ascension+'</span>':'';
  var buffM=RPG.buffXpMult(state);
  var buff=buffM>1?'<div class="buffpill" title="Focus Elixir active — XP boosted for the rest of today">🧪 ×'+(+buffM.toFixed(2))+' XP</div>':'';
  $('#hud').innerHTML=
    '<div class="avatar'+(fr?' framed':'')+'" style="'+avStyle+'" onclick="openCharacter()" title="Customize character">'+h.avatar+'</div>'+
    '<div class="who"><div class="name">'+esc(h.name)+' <span class="rank" style="color:'+col+';border-color:'+col+'">'+r.code+' · '+r.name+'</span>'+asc+'</div>'+
    (h.title?'<div class="herotitle">“'+esc(h.title)+'”</div>':'')+
    '<div class="bars">'+
      '<div class="bar xp"><i style="width:'+Math.min(100,h.xp/need*100)+'%"></i><b>XP '+h.xp+' / '+need+'</b></div>'+
      '<div class="bar hp"><i style="width:'+(h.hp/maxHp*100)+'%"></i><b>HP '+h.hp+' / '+maxHp+'</b></div>'+
    '</div></div>'+
    '<div class="side"><div class="lvl">LV.'+h.level+'</div>'+
      '<div class="coin" id="coinCounter">💰 '+h.coins+'</div>'+
      '<div class="flame">🔥 '+h.streak+' day'+(h.streak===1?'':'s')+((h.shields||0)>0?' <span title="Streak Shield active">🛡</span>':'')+'</div>'+
      buff+
      (h.woundedOn===RPG.todayKey()?'<div class="nextrank" style="color:var(--hp)">🩸 wounded · ×0.5 XP</div>':'')+
      (nr?'<div class="nextrank">▲ rank '+nr.code+' at Lv.'+nr.min+'</div>':'<div class="nextrank" style="color:var(--gold);cursor:pointer" onclick="openAscend()">✦ MAX — Ascend ▶</div>')+'</div>';
}

function renderSkills(){
  var html = state.skills.map(function(s){
    var need=RPG.skillXpForLevel(s.level);
    var tier=RPG.skillTier(s.level);
    var tierChip=tier.name?'<span class="tier" title="'+tier.name+' — +'+Math.round((tier.xp-1)*100)+'% XP'+(tier.coins>1?', +'+Math.round((tier.coins-1)*100)+'% coins':'')+' on this area’s actions">'+tier.name+'</span>':'';
    return '<div class="skillcard"><div class="t"><span>'+s.icon+' '+esc(s.name)+'</span><small>Lv.'+s.level+'</small></div>'+
      '<div class="bar"><i style="width:'+Math.min(100,s.xp/need*100)+'%"></i></div>'+tierChip+
      '<button class="del" onclick="delSkill(\''+s.id+'\')">✕</button></div>';
  }).join('');
  html += '<button class="addskill" onclick="addSkillPrompt()">+ life area</button>';
  $('#skillsRow').innerHTML = html;
}

var TABS=[['today','☀','TODAY','pri'],['quests','⚔','QUESTS','pri'],['habits','🌱','HABITS','pri'],['focus','⏳','FOCUS','sec'],['market','🏪','MARKET','sec'],['journal','📔','JOURNAL','sec'],['stats','📊','STATS','sec']];
function renderTabs(){
  var chest=A.chestStatus(state);
  $('#tabs').innerHTML = TABS.map(function(t){
    var dot=((t[0]==='quests'||t[0]==='today')&&chest.eligible)||(t[0]==='focus'&&state.activeFocus)?'<span class="dot"></span>':'';
    return '<button class="'+t[3]+(tab===t[0]?' on':'')+'" onclick="go(\''+t[0]+'\')"><span class="ti">'+t[1]+'</span><span class="tl">'+t[2]+'</span>'+dot+'</button>';
  }).join('');
}
function go(t){ tab=t; render(); }

function diffChip(d){ return '<span class="chip '+d+'">'+RPG.DIFF[d].label+' · '+RPG.DIFF[d].xp+'xp/'+RPG.DIFF[d].coins+'💰</span>'; }
function skillOptions(sel){
  return '<option value="">— skill —</option>'+state.skills.map(function(s){
    return '<option value="'+s.id+'"'+(sel===s.id?' selected':'')+'>'+s.icon+' '+esc(s.name)+'</option>';}).join('');
}

/* ---------- presets ---------- */
var PRESETS={
  quest:[
    ['Série de tests code de la route','normal'],['Essay: outline & thesis','easy'],['Essay: draft one section','hard'],
    ['Essay: final edit & submit','epic'],['Apply to 1 internship','hard'],['Inbox zero + admin','easy'],['Clean room / desk','easy']
  ],
  good:['20 min code de la route','Read 20 pages','Gym / 30 min walk','French flashcards','Plan tomorrow (5 min)','In bed by 23:30','Batch-cook Sunday'],
  bad:['Instagram before 1 PM','Doomscrolling','Late-night YouTube','Snoozing alarm','Gaming before work is done'],
  shop:{
    market:[['🛡 Streak Shield — auto-saves one missed day',200,0,0,'shield'],['Gaming: 1 hour',60],['Gaming: full evening',150],['1 episode of a series',40],['Movie night',80],['Café treat',35],['Sweet treat',30],['Takeaway',120],['Sleep-in Saturday',100],['New game (save up!)',600]],
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
  if(q.recurring&&q.days&&q.days.length) meta.push('<span class="chip sched" title="Repeats on selected days">🗓 '+q.days.slice().sort().map(function(n){return DOW[n][0];}).join('')+'</span>');
  if(q.due){ meta.push('<span class="chip '+(q.due<today?'late':'due')+'">'+(q.due<today?'⚠ late ':'due ')+q.due+'</span>'); }
  var action = done ? '<span style="color:var(--good);font-weight:700">✓</span>'
    : (q.recurring && !activeToday) ? '<span class="chip muted" title="Scheduled for another day">not today</span>'
    : '<button class="btn go" onclick="doQuest(\''+q.id+'\')">Clear</button>';
  return '<div class="item'+(done?' done':'')+(q.recurring&&!activeToday?' dormant':'')+'"><div class="grow"><div class="title">'+esc(q.title)+'</div>'+
    '<div class="meta">'+meta.join('')+'</div></div>'+
    action+
    (!q.recurring&&!done?'<button class="btn ghost" style="color:var(--gold)" title="Upgrade to main quest" onclick="promoteQ(\''+q.id+'\')">⬆</button>':'')+
    '<button class="btn ghost" onclick="delQuest(\''+q.id+'\')">✕</button></div>';
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
    return '<div class="step'+(done?' done':'')+'"><span>'+(done?'✅':'▫️')+'</span>'+
      '<div class="grow">'+esc(q.title)+' <span class="chip '+q.diff+'" style="margin-left:6px">'+RPG.DIFF[q.diff].label+'</span></div>'+
      (done?'':'<button class="btn go small" onclick="doQuest(\''+q.id+'\')">Clear · '+RPG.DIFF[q.diff].xp+'xp</button>')+
      '<button class="btn ghost small" onclick="delQuest(\''+q.id+'\')">✕</button></div>';
  }).join('');
  return '<div class="goal"><div class="t"><div class="title">🏆 '+esc(g.title)+'</div>'+
    '<div><button class="btn go" onclick="doGoal(\''+g.id+'\')">Complete · 300xp/150💰</button>'+
    '<button class="btn ghost" onclick="delGoal(\''+g.id+'\')">✕</button></div></div>'+
    (g.note?'<div class="hint">'+esc(g.note)+'</div>':'')+
    '<div class="bar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="pct">'+p.done+' / '+p.total+' steps · '+pct+'%</div>'+
    '<div class="steps">'+stepHtml+'</div>'+
    '<div class="stepadd"><input id="step_'+g.id+'" placeholder="Add a step to this main quest…">'+
    '<select id="stepd_'+g.id+'"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="epic">Epic</option></select>'+
    '<button class="btn small" onclick="addStep(\''+g.id+'\')">+ Step</button></div></div>';
}

function renderQuests(){
  var today=RPG.todayKey();
  var dailies=state.quests.filter(function(q){return q.recurring;});
  var chest=A.chestStatus(state);
  var sides=state.quests.filter(function(q){return !q.recurring && !q.doneOn && !q.main;});
  var goalsOpen=state.goals.filter(function(g){return !g.doneOn;});
  var goalHtml=goalsOpen.map(goalCard).join('') ||
    '<div class="empty">A main quest is a big goal — the code exam, an essay, an internship offer. Add one below and break it into steps.</div>';

  $('#view').innerHTML=bossStrip()+
    '<div class="panel" style="border-color:var(--gold);margin-bottom:14px"><h3 style="color:var(--gold)">🏆 Main quests — the big goals</h3>'+goalHtml+
      '<div class="form"><div class="row"><input id="gTitle" placeholder="New main quest… (e.g. Pass code de la route)">'+
      '<button class="btn" onclick="addGoal()">+ Main quest</button></div>'+
      '<input id="gNote" placeholder="Why it matters (optional)"></div></div>'+
    '<div class="grid two">'+
    '<div><div class="panel"><h3>☀️ Daily quests <span class="cnt">'+chest.done+'/'+chest.total+'</span>'+chestChip()+'</h3>'+
      (dailies.map(questRow).join('')||'<div class="empty">No dailies. Add a recurring quest — it resets every morning and feeds the chest.</div>')+'</div>'+
    '<div class="panel" style="margin-top:14px">'+agendaPanel()+'</div></div>'+
    '<div class="panel"><h3>🗡 Side quests <span class="cnt">'+sides.length+'</span>'+
      '<button class="btn small right" onclick="exportICS()" title="Download an .ics file of quests with due dates for Apple/Google Calendar">📅 Export due dates</button></h3>'+
      (sides.map(questRow).join('')||'<div class="empty">One-off tasks live here. The ⬆ button upgrades one into a main quest.</div>')+
      '<div class="form"><input id="qTitle" placeholder="New side quest…">'+
      '<div class="row"><select id="qDiff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="epic">Epic</option></select>'+
      '<select id="qSkill">'+skillOptions()+'</select></div>'+
      '<div class="row"><input type="date" id="qDue"><label><input type="checkbox" id="qRec"> repeat</label></div>'+
      '<div class="daysrow"><span class="plabel">repeat on:</span>'+DOW.map(function(d,i){
        return '<button type="button" class="dow'+(pendingDays.indexOf(i)>=0?' on':'')+'" onclick="toggleDow('+i+')">'+d[0]+'</button>';
      }).join('')+'<span class="hint">none selected = every day (needs “repeat” ticked)</span></div>'+
      '<button class="btn wide go" onclick="addQuest()">+ Add quest</button>'+presetChips('quest')+'</div></div></div>';
}
function toggleDow(n){ var i=pendingDays.indexOf(n); if(i>=0) pendingDays.splice(i,1); else pendingDays.push(n); render(); }

function bossStrip(){
  var b=state.boss;
  if(b && !b.doneOn){
    var days=A.bossDaysLeft(state);
    var when=days<0?'escaped':days===0?'due TODAY':days+' day'+(days===1?'':'s')+' left';
    return '<div class="boss"><span class="ic">🐲</span><div class="grow">'+
      '<div class="t">WEEKLY BOSS: '+esc(b.title)+'</div>'+
      '<div class="sub"><b>'+when+'</b> · slay it for 500xp / 250💰 · escapes after 7 days</div></div>'+
      '<button class="btn slip" onclick="slayBoss()">⚔ SLAY</button>'+
      '<button class="btn ghost" onclick="abandonBoss()">✕</button></div>';
  }
  return '<div class="boss" style="border-color:var(--line);background:none"><span class="ic" style="animation:none;opacity:.5">🐲</span><div class="grow">'+
    '<div class="t" style="color:var(--muted)">No weekly boss named</div>'+
    '<div class="sub">Pick THE task of the week — worth 500xp / 250💰. Ideal during Friday planning.</div></div>'+
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
  if(confirm('Let the boss go? No reward, no penalty — just the shame.')){ A.abandonBoss(state); persist(); render(); }
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
  if(!items.length) return '<h3>📅 Deadlines</h3><div class="empty">Give side quests a due date and they line up here by priority.</div>';
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
    (wounded?'<div class="woundbar">🩸 <b>Wounded</b> — XP halved today. Rest at the Hotel or log good sleep to recover.</div>':'')+
    (due.length?'<div class="panel" style="border-color:var(--orange);margin-bottom:14px"><h3 style="color:var(--orange)">🔥 Due now</h3>'+
      due.map(function(it){
        return '<div class="ag '+it.bucket+'"><div class="grow">'+esc(it.q.title)+'</div><span class="when">'+(it.days<0?(-it.days)+'d late':'today')+'</span>'+
        '<button class="btn go small" onclick="doQuest(\''+it.q.id+'\')">Clear</button></div>';
      }).join('')+'</div>':'')+
    '<div class="grid two">'+
    '<div class="panel"><h3>☀️ Daily quests <span class="cnt">'+dailies.filter(function(q){return q.doneOn===today;}).length+'/'+dailies.length+'</span>'+chestChip()+'</h3>'+
      (dailies.map(questRow).join('')||'<div class="empty">No dailies yet — add recurring quests in the Quests tab.</div>')+'</div>'+
    '<div class="panel"><h3>🌱 Habits to check <span class="cnt">'+(habits.length-todo.length)+'/'+habits.length+'</span></h3>'+
      (habits.map(function(hb){
        var done=hb.lastDoneOn===today;
        var wk=hb.target<7?' <span class="wk">'+A.weekCount(hb)+'/'+hb.target+' wk</span>':'';
        return '<div class="item'+(done?' done':'')+'"><div class="grow"><div class="title">'+esc(hb.title)+'</div>'+
          '<div class="meta">'+habitDots(hb)+wk+'</div></div>'+
          (done?'<span style="color:var(--good);font-weight:700">✓</span>'
            :'<button class="btn go small" onclick="doHabit(\''+hb.id+'\')">Done</button>')+'</div>';
      }).join('')||'<div class="empty">No habits yet — plant some in the Habits tab.</div>')+
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
    '<div class="panel"><h3>🌱 Grow — good habits <span class="hint" style="margin-left:auto">checkable again every morning</span></h3>'+
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
        '<button class="btn ghost" onclick="delHabit(\''+h.id+'\')">✕</button></div>';
    }).join('')||'<div class="empty">Add a habit you want to grow.</div>')+
    '<div class="form"><input id="hgTitle" placeholder="New good habit…">'+
    '<div class="row"><select id="hgSkill">'+skillOptions()+'</select>'+
    '<select id="hgTarget" style="max-width:130px"><option value="7">Every day</option><option value="6">6×/week</option><option value="5">5×/week</option><option value="4">4×/week</option><option value="3">3×/week</option><option value="2">2×/week</option><option value="1">1×/week</option></select>'+
    '<button class="btn go" onclick="addHabit(\'good\')">+ Add</button></div>'+presetChips('good')+'</div></div>'+
    '<div class="panel"><h3>👾 Fight — bad habits</h3>'+
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
        '<button class="btn ghost" onclick="delHabit(\''+h.id+'\')">✕</button></div>';
    }).join('')||'<div class="empty">Name your monsters. Every slip you log hits your HP — the more you feed a monster, the harder it hits back.</div>')+
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
function ytEmbed(){
  var id=musicId();
  if(!id) return '';
  if(location.protocol==='file:'){
    return '<div class="hint" style="margin-top:14px">YouTube blocks embedded players on local files (error 153) — use the pop-out player instead:</div>'+
      '<button class="btn" style="margin-top:8px" onclick="openMusicWin()">🎵 Open music player window</button>';
  }
  return '<div class="yt"><iframe src="https://www.youtube.com/embed/'+id+'?autoplay=1&playsinline=1" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="study music"></iframe></div>'+
    '<div class="hint">needs internet — pick another stream or paste any YouTube URL in setup</div>';
}
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
    var phaseTotal=(f.phase==='work'?f.work:f.brk)*60000;
    var left=f.phaseEnd-Date.now(), pct=RPG.clamp(1-left/phaseTotal,0,1);
    if(f.phase==='work'){
      $('#view').innerHTML='<div class="panel focusbox">'+
        '<div class="phase work">⚔ WORK PHASE'+(f.brk>0?' · break in '+fmtTime(left):'')+'</div>'+
        '<div class="focusring">'+ringSvg(pct,'work')+'<div class="time" id="countdown">'+fmtTime(left)+'</div></div>'+
        (f.label?'<div class="doing">Fighting: <b>'+esc(f.label)+'</b></div>':'')+
        sessionStats(f)+
        '<div class="hint" style="margin-top:8px">Runs '+f.work+' min work'+(f.brk>0?' / '+f.brk+' min break':'')+' on repeat until you stop. You are paid for every worked minute.</div>'+
        ytEmbed()+
        '<button class="btn buy" style="margin-top:14px" onclick="stopFocus()">⏹ Stop & collect</button></div>';
    } else {
      $('#view').innerHTML='<div class="panel focusbox break">'+
        '<div class="phase brk">🏕 BREAK — REST AT THE CAMPFIRE</div>'+
        '<div class="campfire"><span class="tent">⛺</span><span class="fire">🔥</span><span class="moon">🌙</span>'+
        '<span class="z">💤</span><span class="z z2">💤</span><span class="sp">✨</span><span class="sp sp2">✨</span><span class="sp sp3">✨</span></div>'+
        '<div class="focusring brk" style="width:130px;height:130px">'+ringSvg(pct,'brk',130)+'<div class="time" id="countdown" style="font-size:20px">'+fmtTime(left)+'</div></div>'+
        '<div class="doing">Stretch. Water. Look out the window. <b style="color:var(--good)">+3 ❤️</b> when the break ends.</div>'+
        sessionStats(f)+ytEmbed()+
        '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center">'+
        '<button class="btn" onclick="skipBreak()">⏭ Skip break</button>'+
        '<button class="btn buy" onclick="stopFocus()">⏹ Stop & collect</button></div></div>';
    }
  } else {
    var modes=[[25,5,'25 / 5'],[50,10,'50 / 10'],[90,15,'90 / 15'],[50,0,'FREE RUN']];
    $('#view').innerHTML='<div class="panel focusbox">'+
      '<h3 style="justify-content:center">⏳ Focus — get paid for deep work</h3>'+
      '<div class="hint">Pomodoro cycles that loop until you stop. Every worked minute pays 1.2 XP + 0.6 💰 — you collect when you hit stop, whether that is after 20 minutes or 3 hours. Breaks heal +3 ❤️.</div>'+
      '<div class="durchips">'+modes.map(function(m){
        var on=focusMode.work===m[0]&&focusMode.brk===m[1];
        return '<button class="'+(on?'on':'')+'" onclick="focusMode={work:'+m[0]+',brk:'+m[1]+'};render()">'+m[2]+'</button>';}).join('')+
      '</div>'+
      '<div class="form" style="max-width:460px;margin:0 auto;border:none;padding-top:0">'+
      '<input id="fLabel" placeholder="What are you working on? (e.g. Essay draft)">'+
      '<div class="row"><select id="fSkill">'+skillOptions()+'</select>'+
      '<input id="fWork" type="number" min="5" max="180" placeholder="work min" style="max-width:100px">'+
      '<input id="fBrk" type="number" min="0" max="60" placeholder="break" style="max-width:80px"></div>'+
      '<div class="flabel" style="text-align:left">Study music / background</div>'+
      '<div class="row"><select id="fMusic" onchange="state.settings.music=this.value;persist();render()">'+
      Object.keys(MUSIC).map(function(k){return '<option value="'+k+'"'+(state.settings.music===k?' selected':'')+'>'+MUSIC[k].name+'</option>';}).join('')+
      '</select></div>'+
      (state.settings.music==='custom'?'<input id="fUrl" placeholder="Paste a YouTube URL (lofi, Zelda & Chill, Minecraft ambience…)" value="'+esc(state.settings.musicUrl)+'" onchange="state.settings.musicUrl=this.value;persist()">':'')+
      '<button class="btn wide go" onclick="startFocus()">▶ START — '+focusMode.work+' min work'+(focusMode.brk?' / '+focusMode.brk+' min break':' · no breaks')+', loops until stopped</button></div>'+
      '<div class="payline" style="margin-top:14px">Lifetime focus: <b>'+Math.floor(state.counters.focusMin/60)+'h '+(state.counters.focusMin%60)+'m</b></div></div>';
  }
}
function startFocus(){
  var w=Number($('#fWork').value)||focusMode.work;
  var b=$('#fBrk').value===''?focusMode.brk:Number($('#fBrk').value);
  A.startFocus(state,{work:w,brk:b,skillId:$('#fSkill').value||null,label:$('#fLabel').value});
  persist(); render();
}
function stopFocus(){
  var r=A.stopFocus(state); persist(); render();
  if(!r) return;
  if(r.tooShort){ toast('<span class="h">Stopped at '+r.minutes+' min — under 5, nothing earned</span>','dmg'); return; }
  SND.chest(); confetti(); fx(r);
  toast('⏳ <span class="p">'+r.minutes+' min of real work collected</span>');
  afterAction();
}
function skipBreak(){ var ev=A.skipBreak(state); persist(); render(); if(ev&&ev.healed) toast('<span class="hg">+'+ev.healed+' HP — rested</span>'); SND.resume(); }
function checkFocus(){
  var f=state.activeFocus;
  if(!f) return;
  var ev=A.tickFocus(state);
  if(ev){
    persist(); render();
    if(ev.event==='break'){ SND.brk(); toast('🏕 <span style="color:var(--orange)">Break time — rest at the campfire</span>'); }
    else { SND.resume(); if(ev.healed>0){ fx({hp:ev.healed}); } toast('⚔ <span class="p">Back to work — cycle '+state.activeFocus.cycles+'</span>'); }
    return;
  }
  if(tab==='focus'){
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

function renderMarket(){
  var tabs=[['market','🛒 Market'],['hotel','🛏️ Hotel'],['black','🕶️ Black Market']];
  var items=state.shop.filter(function(i){return i.tab===shopTab;});
  var escOn=state.settings.escalate!==false;
  var blurb={market:'Everyday treats. Earn them, then enjoy them guilt-free — that is the whole point.'+(escOn?' Repeat the same treat in one day and its price climbs — indulge, don’t binge.':''),
    hotel:'Rest and recovery. Hotel items restore ❤️ HP — no surge, rest all you like.',
    black:'Break your own rules — the deal costs coins AND HP, the price climbs each time, and you can only cave a couple times a day.'}[shopTab];
  $('#view').innerHTML='<div class="panel"><h3>Reward shop · balance <span class="cnt">💰 '+state.hero.coins+'</span>'+
    '<button class="btn small right" onclick="toggleEscalate()" title="Escalating prices stop a coin hoard from buying unlimited indulgences">'+(escOn?'📈 Surge ON':'➖ Surge OFF')+'</button></h3>'+
    '<div class="shoptabs">'+tabs.map(function(t){return '<button class="'+(shopTab===t[0]?'on':'')+'" onclick="shopTab=\''+t[0]+'\';render()">'+t[1]+'</button>';}).join('')+'</div>'+
    '<div class="hint" style="margin-bottom:10px">'+blurb+'</div>'+
    (items.map(function(i){
      if(i.special==='shield'){
        var canS=state.hero.coins>=i.price, haveS=(state.hero.shields||0)>=1;
        return '<div class="item"><div class="grow"><div class="title">'+esc(i.title)+'</div>'+
          '<div class="meta"><span style="color:var(--gold);font-family:var(--mono);font-size:12px">auto-saves one missed day · hold one at a time</span></div>'+
          (canS||haveS?'':'<div class="afford">'+(i.price-state.hero.coins)+' 💰 to go</div>')+'</div>'+
          '<span class="price">💰 '+i.price+'</span>'+
          '<button class="btn buy" '+((canS&&!haveS)?'':'disabled')+' onclick="buy(\''+i.id+'\')">'+(haveS?'Held':'Buy')+'</button>'+
          '<button class="btn ghost" onclick="delShop(\''+i.id+'\')">✕</button></div>';
      }
      var info=A.buyInfo(state,i);
      var can=state.hero.coins>=info.price && !info.capped;
      var gap=info.capped?'':(can?'':'<div class="afford">'+(info.price-state.hero.coins)+' 💰 to go</div>');
      var effects=[];
      if(i.hp) effects.push('<span style="color:var(--good);font-family:var(--mono);font-size:12px">restores +'+i.hp+' ❤️</span>');
      if(i.dmg) effects.push('<span style="color:var(--hp);font-family:var(--mono);font-size:12px">costs −'+i.dmg+' ❤️</span>');
      if(info.limit>0) effects.push('<span class="cap'+(info.capped?' hit':'')+'">'+(info.capped?'daily cap reached':info.count+'/'+info.limit+' today')+'</span>');
      else if(info.count>0 && info.surge>0) effects.push('<span class="cap">bought '+info.count+'× today</span>');
      var surgedPrice=info.price>i.price;
      return '<div class="item"><div class="grow"><div class="title">'+esc(i.title)+'</div>'+
        (effects.length?'<div class="meta">'+effects.join('')+'</div>':'')+gap+'</div>'+
        '<span class="price'+(surgedPrice?' surged':'')+'">💰 '+info.price+(surgedPrice?'<small> ('+i.price+')</small>':'')+'</span>'+
        '<button class="btn buy" '+(can?'':'disabled')+' onclick="buy(\''+i.id+'\')">'+(info.capped?'Capped':'Buy')+'</button>'+
        '<button class="btn ghost" onclick="delShop(\''+i.id+'\')">✕</button></div>';
    }).join('')||'<div class="empty">Empty shelf. Stock rewards you actually want — that is what makes coins matter.</div>')+
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
  var days=Object.keys(state.journal).sort().reverse().slice(0,7);
  $('#view').innerHTML='<div class="grid two">'+
    '<div class="panel"><h3>Today\'s mood '+(entry?'<span class="cnt">saved ✓</span>':'· +15xp/5💰')+'</h3>'+
    '<div class="moods">'+RPG.MOODS.map(function(m){
      var on=(pendingMood||((entry||{}).mood))===m.key;
      return '<button class="'+(on?'on':'')+'" title="'+m.label+'" onclick="pendingMood=\''+m.key+'\';render()">'+m.emoji+'</button>';
    }).join('')+'</div>'+
    '<textarea id="jNote" rows="3" placeholder="One honest line about today…">'+esc((entry||{}).note||'')+'</textarea>'+
    '<button class="btn wide go" style="margin-top:8px" onclick="saveJournal()">'+(entry?'Update entry':'Log entry')+'</button>'+
    '<h3 style="margin-top:18px">🌙 Sleep '+(sl?'<span class="cnt">logged ✓</span>':'· restores ❤️')+'</h3>'+
    '<div class="row" style="display:flex;gap:8px;align-items:center">'+
    '<input id="slHours" type="number" step="0.5" min="0" max="16" value="'+((sl||{}).hours||7.5)+'" style="max-width:90px"> <span class="hint">hours</span>'+
    '<div class="stars">'+[1,2,3,4,5].map(function(n){
      var on=n<=(sl?sl.quality:pendingQuality);
      return '<button class="'+(on?'on':'')+'" onclick="pendingQuality='+n+';render()">⭐</button>';}).join('')+'</div>'+
    '<button class="btn go" onclick="saveSleep()">'+(sl?'Update':'Log sleep')+'</button></div></div>'+
    '<div class="panel"><h3>Last entries</h3>'+
    (days.map(function(d){
      var e=state.journal[d], m=RPG.MOODS.find(function(x){return x.key===e.mood;});
      var s=state.sleep[d];
      return '<div class="jrow"><span class="d">'+d+'</span><span>'+(m?m.emoji:'')+'</span>'+
        '<span style="flex:1">'+esc(e.note||'—')+'</span>'+
        (s?'<span class="hint">🌙'+s.hours+'h</span>':'')+'</div>';
    }).join('')||'<div class="empty">Your story starts with the first entry.</div>')+'</div></div>';
}

function insightsPanel(){
  var iv=RPG.insights(state);
  var body;
  if(!iv.enough){
    body='<div class="empty">Log your mood for '+Math.max(0,6-iv.sampleSize)+' more day'+((6-iv.sampleSize)===1?'':'s')+' ('+iv.sampleSize+'/6) and ScaleMyLife starts showing what actually moves your mood — sleep, focus, slips.</div>';
  } else if(!iv.findings.length){
    body='<div class="empty">No strong patterns yet across your good and low days. Keep logging — the signal sharpens with more data.</div>';
  } else {
    body=iv.findings.map(function(f){ return '<div class="insight"><span class="ic">'+f.icon+'</span><span>'+esc(f.text)+'</span></div>'; }).join('');
  }
  return '<div class="panel" style="margin-top:14px"><h3>🔎 Insights — what moves your mood</h3>'+body+'</div>';
}
function reviewBox(){
  var rev=RPG.weeklyReview(state);
  var best=rev.bestDay?new Date(rev.bestDay+'T00:00:00').toLocaleDateString(undefined,{weekday:'long'}):'—';
  return '<div class="review">'+
    '<div class="rv"><span class="k">🏅 Best day</span><span class="v">'+best+' · '+rev.bestXp+' XP</span></div>'+
    (rev.worstMonster?'<div class="rv"><span class="k">👾 Toughest monster</span><span class="v">'+esc(rev.worstMonster)+' · '+rev.worstN+' slip'+(rev.worstN===1?'':'s')+'</span></div>':'')+
    '<div class="rv suggest"><span class="k">🎯 Next week</span><span class="v">'+esc(rev.suggestion)+'</span></div></div>';
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

  $('#view').innerHTML='<div class="panel"><h3>📊 Week in review — for your Friday planning</h3>'+
    reviewBox()+
    '<div class="statgrid">'+
    '<div class="stat"><div class="v g">'+w.tot.xp+'</div><div class="k">XP earned</div></div>'+
    '<div class="stat"><div class="v">'+w.tot.earned+'</div><div class="k">💰 earned</div></div>'+
    '<div class="stat"><div class="v">'+w.tot.spent+'</div><div class="k">💰 spent</div></div>'+
    '<div class="stat"><div class="v b">'+w.tot.quests+'</div><div class="k">quests cleared</div></div>'+
    '<div class="stat"><div class="v g">'+w.tot.habits+'</div><div class="k">habits kept</div></div>'+
    '<div class="stat"><div class="v r">'+w.tot.slips+'</div><div class="k">monster hits</div></div>'+
    '<div class="stat"><div class="v b">'+Math.floor(w.tot.focusMin/60)+'h'+(w.tot.focusMin%60)+'</div><div class="k">focus time</div></div>'+
    '</div>'+
    '<div class="chart">'+chart+'</div>'+
    '<div class="hint" style="text-align:center;margin-top:2px">XP per day, last 7 days</div>'+
    '<div class="moodstrip">'+w.moods.map(function(m){return '<span>'+m.emoji+'</span>';}).join('')+'</div>'+
    '<div class="hint" style="text-align:center">mood, last 7 days</div></div>'+
    insightsPanel()+
    '<div class="panel" style="margin-top:14px"><h3>🏆 Achievements <span class="cnt">'+state.achievements.length+'/'+RPG.ACHIEVEMENTS.length+'</span></h3>'+
    '<div class="achgrid">'+achHtml+'</div></div>'+
    '<div class="panel" style="margin-top:14px"><h3>📜 Adventure log</h3>'+logHtml+'</div>';
}

var seenDay = null;
function render(){
  if(RPG.dailyReset(state) && seenDay){ toast('🌅 <span class="p">New day — dailies are fresh</span>'); }
  seenDay = state.lastSeenDay;
  persist();
  applyLegend();
  renderHUD(); renderSkills(); renderTabs();
  ({today:renderToday,quests:renderQuests,habits:renderHabits,focus:renderFocus,market:renderMarket,journal:renderJournal,stats:renderStats}[tab])();
}

function afterAction(){
  var fresh=RPG.checkAchievements(state);
  if(fresh.length){ persist(); renderTabs(); announceAchievements(fresh); }
}

/* ---------- action handlers ---------- */
function doQuest(id){ var r=A.completeQuest(state,id); persist(); render(); fx(r); afterAction(); }
function delQuest(id){ if(confirm('Delete this quest?')){ A.deleteQuest(state,id); persist(); render(); } }
function promoteQ(id){
  var g=A.promoteQuest(state,id);
  if(g){ persist(); render(); toast('⬆️ <span class="c">Promoted to MAIN QUEST</span>'); SND.ach(); }
}
function addQuest(){
  var t=$('#qTitle').value.trim(); if(!t) return;
  var rec=$('#qRec').checked;
  A.addQuest(state,{title:t,diff:$('#qDiff').value,skillId:$('#qSkill').value||null,
    due:$('#qDue').value||null,recurring:rec,days:rec?pendingDays.slice():null,main:null});
  pendingDays=[];
  persist(); render();
}
function addStep(goalId){
  var el=$('#step_'+goalId), t=el?el.value.trim():''; if(!t) return;
  A.addQuest(state,{title:t,diff:$('#stepd_'+goalId).value,main:goalId});
  persist(); render();
}
function addGoal(){ var t=$('#gTitle').value.trim(); if(!t) return;
  A.addGoal(state,{title:t,note:$('#gNote').value}); persist(); render(); }
function doGoal(id){
  var p=A.goalProgress(state,id);
  if(p.total>0 && p.done<p.total && !confirm('Steps are at '+p.done+'/'+p.total+'. Complete the main quest anyway?')) return;
  var r=A.completeGoal(state,id); persist(); render(); if(r){ confetti(); fx(r); } afterAction();
}
function delGoal(id){ if(confirm('Delete this main quest? Its steps become loose side quests.')){ A.deleteGoal(state,id); persist(); render(); } }
function doHabit(id){ var r=A.doHabit(state,id); persist(); render(); fx(r); afterAction(); }
function slip(id){ var r=A.slipHabit(state,id); persist(); render(); fx(r); afterAction(); }
function addHabit(type){
  var el=$(type==='good'?'#hgTitle':'#hbTitle'), t=el.value.trim(); if(!t) return;
  A.addHabit(state,{title:t,type:type,skillId:type==='good'?($('#hgSkill').value||null):null,
    target:type==='good'?Number(($('#hgTarget')||{}).value||7):7});
  persist(); render();
}
function delHabit(id){ if(confirm('Delete this habit?')){ A.deleteHabit(state,id); persist(); render(); } }
function buy(id){
  var r=A.buy(state,id);
  if(r&&r.fail==='coins'){ toast('<span class="h">Not enough coins — go earn them</span>','dmg'); return; }
  if(r&&r.fail==='shield'){ toast('<span class="h">You already carry a Streak Shield</span>','dmg'); return; }
  if(r&&r.fail==='limit'){ toast('<span class="h">Daily cap reached — come back tomorrow</span>','dmg'); return; }
  if(r&&r.shield){ persist(); render(); toast('🛡 <span class="c">Streak Shield equipped — one missed day is covered</span>'); SND.buy(); afterAction(); return; }
  persist(); render(); fx(r); afterAction();
}
function addShop(){
  var t=$('#sTitle').value.trim(), p=Number($('#sPrice').value); if(!t||!p) return;
  var hp=shopTab==='hotel'?Number(($('#sHp')||{}).value||0):0;
  var dmg=shopTab==='black'?Number(($('#sDmg')||{}).value||0):0;
  var limEl=$('#sLimit'), lim=limEl&&limEl.value!==''?Number(limEl.value):undefined;
  A.addShopItem(state,{title:t,price:p,tab:shopTab,hp:hp,dmg:dmg,limit:lim}); persist(); render();
}
function delShop(id){ if(confirm('Remove this reward?')){ A.deleteShopItem(state,id); persist(); render(); } }
function claimChest(){ var r=A.claimChest(state); persist(); render(); if(r){ chestScreen(r); flyCoins(r.coins); } afterAction(); }
function saveJournal(){
  var mood=pendingMood||((state.journal[RPG.todayKey()]||{}).mood);
  if(!mood){ toast('<span class="h">Pick a mood first</span>','dmg'); return; }
  var r=A.logJournal(state,mood,$('#jNote').value); pendingMood=null; persist(); render(); fx(r); afterAction();
}
function saveSleep(){ var r=A.logSleep(state,$('#slHours').value,pendingQuality); persist(); render(); fx(r); afterAction(); }
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
  toast('<span class="p">📅 Calendar file downloaded — open it to import</span>');
}

/* ---------- character customization ---------- */
var AVATARS=['🧙','🦸','🥷','🤺','🧝','🧑‍🚀','🦊','🐺','🐉','⚔️','🛡️','🏹','🧛','🤖','👑','🐯','🦅','🔥','🌟','🎮','🧗','🏋️','📚','🚀'];
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
    (RPG.ascendReady(state)?'<div class="ascendbox"><b>♻️ Ready to ascend</b><span>You’re Lv.'+state.hero.level+' — start a new season for a permanent boon.</span><button class="btn ascend" onclick="closeModal();openAscend()">Ascend to Season '+((state.hero.ascension||0)+1)+' ▶</button></div>':'')+
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
function openAscend(){
  if(!RPG.ascendReady(state)){ toast('<span class="h">Reach Lv.'+RPG.ASCEND_LEVEL+' (rank S) to ascend</span>','dmg'); return; }
  var m=$('#modal'); m.className='modal show';
  m.innerHTML='<div class="box"><h2>♻️ ASCEND — SEASON '+((state.hero.ascension||0)+1)+'</h2>'+
    '<div class="hint">You’re Lv.'+state.hero.level+'. Ascending resets your level and rank for a fresh climb — but you keep your coins, quests, habits, streak, titles, badges and cosmetics. In return you choose a <b>permanent boon</b> that stacks every season.</div>'+
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
    '<div class="sub"><b>'+r.boon.icon+' '+esc(r.boon.name)+'</b> — '+esc(r.boon.desc)+'</div>'+
    '<button class="btn go" onclick="closeOverlay()">Begin ▶</button></div>';
}
function titleChips(){
  var unlocked=state.achievements.map(function(u){
    return RPG.ACHIEVEMENTS.find(function(a){return a.id===u.id;});
  }).filter(Boolean);
  var locked=RPG.ACHIEVEMENTS.length-unlocked.length;
  if(!unlocked.length) return '<div class="hint">Earn achievements to unlock wearable titles ('+locked+' locked).</div>';
  return '<div class="hint" style="margin-top:6px">Unlocked titles — tap to wear:</div><div class="titlechips">'+
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
    '<button class="btn" onclick="tut(0)">❓ Tutorial</button></div>'+
    '<div class="setrow">'+
    '<button class="btn" onclick="toggleSound()">'+(state.settings.sound?'🔊 Sound ON':'🔇 Sound OFF')+'</button></div>'+
    '<div class="setrow"><button class="btn" onclick="exportSave()">⬇ Export save (JSON)</button>'+
    '<button class="btn" onclick="$(\'#importFile\').click()">⬆ Import save</button></div>'+
    '<input type="file" id="importFile" accept=".json" style="display:none" onchange="importSave(this)">'+
    '<div class="setrow"><button class="btn" style="border-color:var(--hp);color:var(--hp)" onclick="resetAll()">Reset everything</button>'+
    '<button class="btn" onclick="closeModal()">Close</button></div>'+
    '<div class="hint">Data lives in this browser (localStorage). Export a JSON backup from time to time.</div></div>';
}
function toggleSound(){ state.settings.sound=!state.settings.sound; persist(); openSettings(); if(state.settings.sound) SND.earn(); }
function closeModal(){ $('#modal').className='modal'; }
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

/* ---------- tutorial ---------- */
var TUT=[
  {icon:'⚔',title:'YOUR LIFE IS THE GAME',body:'ScaleMyLife turns real life into an RPG. Doing real work — tasks, habits, focused study — earns XP and coins. XP levels you up through ranks E to SS. Coins buy real pleasures, guilt-free, because you earned them.'},
  {icon:'🏆',title:'QUESTS & HABITS',body:'Main quests are your big goals, broken into steps. Daily quests reset every morning — clear them all and a bonus chest opens. Good habits build streaks; bad habits are monsters that hit your HP when you slip. Honesty is part of the game.'},
  {icon:'⏳',title:'FOCUS & THE MARKET',body:'The Focus tab runs pomodoro cycles and pays you for every worked minute. Spend your coins in the Market on rewards YOU define — gaming, series, treats. The Hotel restores HP. The Black Market sells breaking your own rules… for coins AND HP.'},
  {icon:'☀️',title:'EVERY DAY',body:'The Today tab is your home base: dailies, habit checks, deadlines and quick actions in one place. Log your mood and sleep, keep the streak alive — each consecutive day multiplies all XP up to ×1.5. That is the whole loop. Ready?'}
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
  m.innerHTML='<div class="box"><h2>⚔ SCALEMYLIFE<br><span style="font-size:10px;color:var(--muted)">CREATE YOUR HERO</span></h2>'+
    '<div class="hint" style="margin-bottom:6px">Your real life is the game. Name your character:</div>'+
    '<input id="obName" placeholder="Hero name" maxlength="24" value="'+esc(keep)+'">'+
    '<div class="avpick">'+AVATARS.slice(0,12).map(function(a){
      return '<button class="'+(pickedAv===a?'on':'')+'" onclick="pickedAv=\''+a+'\';onboarding()">'+a+'</button>';}).join('')+'</div>'+
    '<div class="flabel">Choose your path — it tailors your starting quests, habits, life areas and rewards</div>'+
    '<div class="pathpick">'+RPG.PATHS.map(function(p){
      return '<button class="'+(pickedPath===p.id?'on':'')+'" onclick="pickedPath=\''+p.id+'\';onboarding()"><span class="pi">'+p.icon+'</span><b>'+esc(p.name)+'</b><small>'+esc(p.blurb)+'</small></button>';
    }).join('')+'</div>'+
    '<button class="btn wide go" onclick="createHero()">▶ START ADVENTURE</button>'+
    '<div class="hint" style="margin-top:10px">You start with 50 💰 and a starter board matched to your path — edit everything. Full customization lives behind your avatar.</div></div>';
  var inp=$('#obName'); if(inp && !inp.value) inp.focus();
}
function createHero(){
  var n=$('#obName').value.trim()||'Hero';
  state=RPG.seedPreset(RPG.newState(n,pickedAv||'🧙'), pickedPath||'general');
  pickedAv=null;
  RPG.addLog(state,'🎮','A new adventure begins. Welcome, '+n+'!');
  persist(); applyTheme(); closeModal(); render(); confetti();
}
function boot(){ applyTheme(); if(state){ seenDay=state.lastSeenDay; render(); checkFocus(); } else { renderHUDShell(); tut(0); } }
function renderHUDShell(){ $('#hud').innerHTML='<div class="avatar">❔</div><div class="who"><div class="name">…</div></div><div></div>'; $('#tabs').innerHTML=''; $('#skillsRow').innerHTML=''; $('#view').innerHTML=''; }

setInterval(function(){ if(state){ checkFocus(); if(state.lastSeenDay!==RPG.todayKey()){ render(); } } }, 1000);

boot();
if('serviceWorker' in navigator && location.protocol==='https:'){
  navigator.serviceWorker.register('sw.js').catch(function(){});
}
