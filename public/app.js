(function(){
  var MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  var DEMO=!!(window.Store&&window.Store.demo);
  var DEVICE_TZ=(function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch(e){return '';}})();
  var demo={offset:0,time:null,fast:false};
  var current=null, hintUsed=false, tab='today', draft=null, activePh=0, urge=null, urgeTimer=null, tm=null, tmTimer=null, accOpen={}, sky=false, sceneM=null, sceneRaf=null, sceneBuilt=false;
  try{sky=localStorage.getItem('slovo-sky')==='1';}catch(e){}
  var URGE_SEC=600;

  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function pad(n){return String(n).padStart(2,'0');}
  function toMin(t){var p=t.split(':');return (+p[0])*60+(+p[1]);}
  function fmtMin(m){m=((m%1440)+1440)%1440;return pad(Math.floor(m/60))+':'+pad(m%60);}
  function fmtDur(m){var h=Math.floor(m/60),mm=m%60;return h>0?(h+' ч '+mm+' мин'):(mm+' мин');}
  function keyOf(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  // Время берётся в выбранном часовом поясе (настройка tz, по умолчанию пояс устройства)
  function tzName(){return (typeof S!=='undefined'&&S&&S.settings&&S.settings.tz)||DEVICE_TZ;}
  function nowDate(){
    var tz=tzName(),d;
    if(tz){var p=Schedule.localParts(Date.now(),tz);d=new Date(p.y,p.mo-1,p.d,p.h,p.mi,p.s);}
    else d=new Date();
    d.setDate(d.getDate()+demo.offset);return d;
  }
  function nowMin(){
    if(demo.time)return toMin(demo.time);
    var tz=tzName();
    if(tz)return Schedule.localParts(Date.now(),tz).min;
    var d=new Date();return d.getHours()*60+d.getMinutes();
  }
  function plural(n,f){var a=Math.abs(n)%100,b=a%10;if(a>10&&a<20)return f[2];if(b>1&&b<5)return f[1];if(b===1)return f[0];return f[2];}
  function newId(){return 'h'+Math.random().toString(36).slice(2,8);}

  function norm(s){return String(s).toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');}
  function lev(a,b){
    var m=a.length,n=b.length,i,j,prev=[],cur;
    for(j=0;j<=n;j++)prev[j]=j;
    for(i=1;i<=m;i++){cur=[i];for(j=1;j<=n;j++){cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));}prev=cur;}
    return prev[n];
  }
  function sim(typed,target){
    var a=norm(typed),b=norm(target),L=Math.max(a.length,b.length);
    if(!L)return 0;
    return 1-lev(a,b)/L;
  }
  function wordCount(p){return p.trim().split(/\s+/).filter(Boolean).length;}

  /* ---------- data ---------- */
  function seedHabits(){
    return [
      {id:'h1',kind:'do',name:'Встать в 6:30',start:'06:30',end:'07:00',remind:'06:25',phrases:['Я уважаю свой сон, поэтому встаю вовремя.','Я человек, который держит ритм.'],why:'Чтобы ночь меня восстанавливала, а утро не отнимало.',rule:'Сел и поставил ноги на пол, телефон не в руках.',mode:'memory',strict:0.85},
      {id:'h2',kind:'do',name:'Зарядка',start:'07:00',end:'09:00',remind:'07:05',phrases:['Я двигаюсь, и тело отвечает.'],why:'Чтобы к вечеру оставались силы.',rule:'Десять минут движения.',mode:'memory',strict:0.85},
      {id:'h3',kind:'do',name:'Лечь до 23:00',start:'22:00',end:'23:00',remind:'21:50',phrases:['Я закрываю день и отпускаю дела.','Я человек, который уважает свой сон.'],why:'Чтобы ночь работала на меня.',rule:'Телефон отложен, свет выключен.',mode:'memory',strict:0.85},
      {id:'h4',kind:'avoid',name:'Без ленты',start:'08:00',end:'20:00',remind:'',notify:'normal',phrases:['Я свободен от ленты, вечер мой.'],why:'Чтобы вечера снова были длинными.',rule:'Ни разу не открывал ленту.',mode:'memory',strict:0.85},
      {id:'h6',kind:'count',name:'Duolingo',start:'08:00',end:'22:00',remind:'',goal:3,unit:'урок',phrases:['Я человек, который учится каждый день.'],why:'Чтобы язык стал привычкой, а не планом.',rule:'Три урока за день, в любое время окна.',mode:'memory',strict:0.85},
      {id:'h5',kind:'timer',name:'Медитация',start:'07:30',end:'09:00',remind:'07:25',dur:10,phrases:[],why:'Чтобы голова была ясной, а не шумной.',rule:'',mode:'memory',strict:0.85}
    ];
  }
  function seedData(habits){
    var spec={
      h1:[[1,'06:41','Я уважаю свой сон, поэтому встаю вовремя.',false],[2,'06:34','я уважаю свой сон поэтому встаю вовремя',false],[3,'06:52','я уважаю свой сон поэтому встаю в время',true],[4,'06:38','Я уважаю свой сон, поэтому встаю вовремя!',false],[5,'06:47','я уважаю свой сон поэтому встаюовремя',false],[8,'06:36','Я уважаю свой сон, поэтому встаю вовремя.',false],[9,'06:58','я уважаю свой сон поэтому встаю вовре',true]],
      h2:[[1,'07:20','Я двигаюсь, и тело отвечает.',false],[2,'07:48','я двигаюсь и тело отвечает',true]],
      h3:[[1,'22:41','Я закрываю день и отпускаю дела.',false],[2,'22:35','я закрываю день и отпускаю дела',false],[3,'22:52','я закрываю день отпускаю дела',false]],
      h4:[[1,'08:20','Я свободен от ленты, вечер мой.',false],[2,'08:05','я свободен от ленты вечер мой',false],[3,'09:40','я свободен от ленты вечер мой',true],[5,'08:12','Я свободен от ленты, вечер мой.',false],[6,'08:30','я свободен от ленты вечер мой',false]]
    };
    var logs=[],urges=[];
    habits.forEach(function(h){
      (spec[h.id]||[]).forEach(function(s){
        var d=new Date();d.setDate(d.getDate()-s[0]);
        logs.push({hid:h.id,day:keyOf(d),time:s[1],typed:s[2],hint:s[3],sim:sim(s[2],h.phrases[0]||'')});
      });
    });
    if(byIdIn(habits,'h6')){
      var gp=byIdIn(habits,'h6').phrases[0];
      [[1,['08:30','13:10','19:40'],'19:45'],[2,['09:05','12:50','20:10'],'20:15'],[3,['09:00','18:30'],null],[4,['08:40','14:00','21:00'],'21:05'],[5,['10:00','15:00','18:00'],'18:05']].forEach(function(r){
        var d=new Date();d.setDate(d.getDate()-r[0]);var k=keyOf(d);
        r[1].forEach(function(t){logs.push({hid:'h6',day:k,time:t,part:true});});
        if(r[2])logs.push({hid:'h6',day:k,time:r[2],typed:gp.toLowerCase().replace(/[.,]/g,''),hint:false,count:3,sim:1});
      });
    }
    if(byIdIn(habits,'h5')){
      [[1,'07:40',10],[2,'07:35',10],[3,'08:05',15],[5,'07:50',10]].forEach(function(m){var d=new Date();d.setDate(d.getDate()-m[0]);logs.push({hid:'h5',day:keyOf(d),time:m[1],minutes:m[2],typed:''});});
    }
    if(byIdIn(habits,'h4')){
      var d4=new Date();d4.setDate(d4.getDate()-4);
      logs.push({hid:'h4',day:keyOf(d4),time:'14:10',slip:true});
      [[2,'19:40'],[3,'20:25'],[6,'18:50']].forEach(function(u){var d=new Date();d.setDate(d.getDate()-u[0]);urges.push({hid:'h4',day:keyOf(d),time:u[1]});});
    }
    return {logs:logs,urges:urges};
  }
  function byIdIn(list,id){return list.filter(function(h){return h.id===id;})[0];}
  function load(){
    if(DEMO){
      var habits=seedHabits(),sd=seedData(habits);
      return {habits:habits,logs:sd.logs,urges:sd.urges,sel:habits[0].id,settings:{}};
    }
    var st=Store.state;
    return {habits:st.habits,logs:st.logs,urges:st.urges,sel:st.habits[0]?st.habits[0].id:null,settings:st.settings||{}};
  }
  var S=load();
  if(!DEMO){
    Store.getState=function(){return {habits:S.habits,logs:S.logs,urges:S.urges,settings:S.settings};};
    Store.onSync=function(st){
      S.habits=st.habits;S.logs=st.logs;S.urges=st.urges;S.settings=st.settings||{};
      if(!S.habits.length)return;
      if(!byId(S.sel))S.sel=pickHabit();
      applySettings();
      var ae=document.activeElement;
      if(tab==='today'&&!tm&&!urge&&!(ae&&/^(INPUT|TEXTAREA)$/.test(ae.tagName)))renderToday();
      else if(tab==='log')renderLog();
    };
  }
  function applySettings(){
    if(S.settings&&S.settings.sky!=null){sky=S.settings.sky==='1';try{localStorage.setItem('slovo-sky',sky?'1':'0');}catch(e){}}
  }
  applySettings();
  if(!DEMO&&!S.settings.tz&&DEVICE_TZ){S.settings.tz=DEVICE_TZ;Store.setSetting('tz',DEVICE_TZ);}
  function addLog(l){
    if(!DEMO){l.id=Store.newId();}
    S.logs.unshift(l);
    if(!DEMO){Store.addLog(l);}
  }
  function removeLog(i){
    var l=S.logs.splice(i,1)[0];
    if(!DEMO&&l&&l.id)Store.delLog(l.id);
  }

  function byId(id){return byIdIn(S.habits,id);}
  function cur(){var h=byId(S.sel);if(!h){h=S.habits[0];S.sel=h.id;}return h;}
  function sorted(){return S.habits.slice().sort(function(a,b){return toMin(a.start)-toMin(b.start);});}
  function hasLog(hid,k){return S.logs.some(function(l){return l.hid===hid&&l.day===k&&!l.slip&&!l.part;})&&!S.logs.some(function(l){return l.hid===hid&&l.day===k&&l.slip;});}
  function todayLog(hid){var k=keyOf(nowDate());return S.logs.filter(function(l){return l.hid===hid&&l.day===k&&!l.slip&&!l.part;})[0];}
  function todayParts(hid){var k=keyOf(nowDate());return S.logs.filter(function(l){return l.hid===hid&&l.day===k&&l.part;});}
  function todaySlip(hid){var k=keyOf(nowDate());return S.logs.filter(function(l){return l.hid===hid&&l.day===k&&l.slip;})[0];}
  function streakBefore(hid){
    var n=0,d=nowDate();d.setDate(d.getDate()-1);
    while(hasLog(hid,keyOf(d))){n++;d.setDate(d.getDate()-1);}
    return n;
  }
  function streak(hid){
    if(todaySlip(hid))return 0;
    var hh=byId(hid);if(hh&&hh.kind!=='timer'&&phaseOf(hh)==='after')return 0;
    var n=0,d=nowDate();
    if(!hasLog(hid,keyOf(d)))d.setDate(d.getDate()-1);
    while(hasLog(hid,keyOf(d))){n++;d.setDate(d.getDate()-1);}
    return n;
  }
  function lastDays(hid,n){
    var c=0;
    for(var i=0;i<n;i++){var d=nowDate();d.setDate(d.getDate()-i);if(hasLog(hid,keyOf(d)))c++;}
    return c;
  }
  function phaseOf(h){
    var lg=todayLog(h.id),n=nowMin(),a=toMin(h.start),b=toMin(h.end);
    if(h.kind==='avoid'){
      if(todaySlip(h.id))return 'slip';
      if(lg)return 'done';
      if(n<a)return 'before';
      return n<=b?'hold':'open';
    }else{
      if(lg)return 'done';
      if(todaySlip(h.id))return 'slip';
    }
    if(n<a)return 'before';
    if(n<=b)return 'open';
    return 'after';
  }
  function todayPhrase(h){
    var d=nowDate(),day=Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000);
    return h.phrases[day%h.phrases.length];
  }
  function untilNext(h){
    var n=nowMin(),a=toMin(h.start);
    return n<a?a-n:1440-n+a;
  }
  function pickHabit(){
    var open=null,soon=null,soonV=1e9;
    sorted().forEach(function(h){
      var p=phaseOf(h);
      if(p==='open'&&!open)open=h;
      if(p==='before'){var v=toMin(h.start)-nowMin();if(v<soonV){soonV=v;soon=h;}}
    });
    return (open||soon||sorted()[0]).id;
  }
  if(S.habits.length)S.sel=pickHabit();

  function toast(msg,ms,long){
    var t=document.getElementById('toast');t.textContent=msg;t.classList.toggle('long',!!long);t.classList.remove('hidden');
    clearTimeout(toast.h);toast.h=setTimeout(function(){t.classList.add('hidden');},ms||2000);
  }

  /* ---------- chrome ---------- */
  function renderTop(){
    var el=document.getElementById('top');
    if(!S.habits.length){el.innerHTML='';return;}
    if(tab==='today'){
      var h=cur(),st=streak(h.id);
      var lbl=h.kind==='avoid'?plural(st,['день без срыва','дня без срыва','дней без срыва']):plural(st,['день подряд','дня подряд','дней подряд']);
      el.innerHTML='<span><b>'+st+'</b> '+lbl+'</span>'+
        '<span class="hdr"><button class="ib" data-go="log" type="button" aria-label="Журнал"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h9"/></svg></button><button class="ib" data-go="habit" type="button" aria-label="Настройки"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2"/><circle cx="9" cy="16" r="2"/></svg></button></span>';
    }else{
      el.innerHTML='<button class="ib" data-go="today" type="button" aria-label="Назад"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><span></span>';
    }
    Array.prototype.forEach.call(el.querySelectorAll('[data-go]'),function(b){
      b.addEventListener('click',function(){
        var t=b.dataset.go;
        if(t==='habit')openEdit(cur());else setTab(t);
      });
    });
  }
  /* ---------- SKY SCENE ---------- */
  var NIGHT=[10,16,40,26,36,78,1],DAWN=[62,74,134,244,166,124,.35],DAY=[86,156,232,190,224,250,0],DUSK=[66,62,132,242,140,106,.35];
  function lerp(a,b,t){return a+(b-a)*t;}
  function sunTimes(){
    var d=nowDate(),doy=Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(d.getFullYear(),0,0))/864e5);
    var len=12+4.2*Math.sin(2*Math.PI*(doy-80)/365);
    return [Math.round((12.25-len/2)*60),Math.round((12.25+len/2)*60)];
  }
  function skyAt(m,st){
    var sr=st[0],ss=st[1],K=[[sr-70,NIGHT],[sr,DAWN],[sr+80,DAY],[ss-80,DAY],[ss,DUSK],[ss+70,NIGHT]],i,a,b,t,out=[];
    if(m<=K[0][0]||m>=K[5][0])return NIGHT;
    for(i=1;i<K.length;i++)if(m<=K[i][0]){a=K[i-1];b=K[i];t=(m-a[0])/(b[0]-a[0]);break;}
    for(i=0;i<7;i++)out.push(lerp(a[1][i],b[1][i],t));
    return out;
  }
  function rgb(c,o){return 'rgb('+Math.round(c[o])+','+Math.round(c[o+1])+','+Math.round(c[o+2])+')';}
  function buildScene(){
    var el=document.getElementById('scene'),seed=7,i,stars='',x,y;
    function r(){seed=(seed*16807)%2147483647;return seed/2147483647;}
    for(i=0;i<30;i++){x=5+r()*350;y=5+r()*50;stars+='<circle class="st" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(r()<.2?1.4:.9)+'" style="animation-delay:-'+(r()*4).toFixed(1)+'s;animation-duration:'+(2.6+r()*3).toFixed(1)+'s"/>';}
    function cloud(yy,sc,dur,delay){
      return '<g class="cl" style="animation-duration:'+dur+'s;animation-delay:-'+delay+'s"><g transform="translate(0 '+yy+') scale('+sc+')"><ellipse cx="0" cy="0" rx="26" ry="7"/><ellipse cx="-11" cy="-5" rx="13" ry="8"/><ellipse cx="9" cy="-8" rx="15" ry="10"/></g></g>';
    }
    el.innerHTML='<svg class="scenesvg" viewBox="0 0 360 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'+
      '<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop id="sk1" offset="0" stop-color="#0a1028"/><stop id="sk2" offset="1" stop-color="#1a2448"/></linearGradient>'+
      '<radialGradient id="sunglow"><stop offset="0" stop-color="#FFD98A" stop-opacity=".85"/><stop offset="1" stop-color="#FFB45A" stop-opacity="0"/></radialGradient>'+
      '<mask id="moonm" maskUnits="userSpaceOnUse" x="-14" y="-14" width="28" height="28"><rect x="-14" y="-14" width="28" height="28" fill="#fff"/><circle cx="4.8" cy="-2.8" r="7.4" fill="#000"/></mask></defs>'+
      '<rect width="360" height="100" fill="url(#skyg)"/>'+
      '<g id="stars" opacity="0">'+stars+'</g>'+
      '<g id="sunG" visibility="hidden"><circle class="sunbreath" r="27" fill="url(#sunglow)"/><circle id="suncore" r="9" fill="#FFD27A"/></g>'+
      '<g id="moonG" visibility="hidden"><circle r="19" fill="#DDE6FF" opacity=".12"/><circle r="8.5" fill="#EAF0FF" mask="url(#moonm)"/></g>'+
      '<g id="clouds" opacity=".8">'+cloud(26,1,130,20)+cloud(44,.7,170,95)+cloud(34,1.15,110,60)+'</g>'+
      '<path d="M0 100V90C40 82 74 95 116 89C164 81 204 96 254 89C294 82 332 91 360 87V100Z" fill="#070b1c" opacity=".5"/>'+
      '</svg>';
    sceneBuilt=true;
  }
  function drawScene(m){
    var st=sunTimes(),sr=st[0],ss=st[1],c=skyAt(m,st),g=function(id){return document.getElementById(id);};
    if(!g('sk1'))return;
    g('sk1').setAttribute('stop-color',rgb(c,0));g('sk2').setAttribute('stop-color',rgb(c,3));
    g('stars').setAttribute('opacity',Math.min(1,c[6]*1.05).toFixed(2));
    g('clouds').setAttribute('opacity',(0.82*(1-Math.min(1,c[6]*1.4))).toFixed(2));
    var p=(m-sr)/(ss-sr),L=1440-(ss-sr),q=m<sr?(m+1440-ss)/L:(m-ss)/L;
    function pos(t){return [30+300*t,88-62*Math.sin(Math.PI*t)];}
    var sg=g('sunG'),mg=g('moonG'),pp;
    if(p>-.14&&p<1.14){
      pp=pos(p);sg.setAttribute('transform','translate('+pp[0].toFixed(1)+' '+pp[1].toFixed(1)+')');sg.setAttribute('visibility','visible');
      var alt=Math.max(0,Math.sin(Math.PI*p)),k=Math.min(1,alt*1.8);
      g('suncore').setAttribute('fill','rgb('+Math.round(lerp(255,255,k))+','+Math.round(lerp(150,224,k))+','+Math.round(lerp(92,138,k))+')');
    }else sg.setAttribute('visibility','hidden');
    if(q>-.14&&q<1.14){
      pp=pos(q);mg.setAttribute('transform','translate('+pp[0].toFixed(1)+' '+pp[1].toFixed(1)+')');mg.setAttribute('visibility','visible');
    }else mg.setAttribute('visibility','hidden');
    var ph=c[6]>=.9?'ночь':c[6]<=.05?'день':(m<(sr+ss)/2?'рассвет':'закат');
    document.getElementById('scene').setAttribute('aria-label','Небо: '+ph);
  }
  function moveScene(to){
    if(sceneRaf)cancelAnimationFrame(sceneRaf);
    var first=sceneM===null,from=first?Math.max(0,to-150):sceneM;
    var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduce||Math.abs(to-from)<0.5){sceneM=to;drawScene(to);return;}
    var dur=first?2200:(Math.abs(to-from)>120?1500:700),t0=performance.now();
    drawScene(from);
    (function f(now){
      var k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3),v=from+(to-from)*e;
      sceneM=v;drawScene(v);
      if(k<1)sceneRaf=requestAnimationFrame(f);else sceneM=to;
    })(t0);
  }
  function sceneShow(on){
    var el=document.getElementById('scene');
    if(!on||!sky){el.style.display='none';return;}
    el.style.display='';
    if(!sceneBuilt)buildScene();
    moveScene(nowMin());
  }
  function renderRail(center){
    var el=document.getElementById('rail');
    if(tab!=='today'){el.innerHTML='';el.style.display='none';sceneShow(false);return;}
    el.style.display='';
    sceneShow(true);
    var keep=el.scrollLeft,n=nowMin(),html='',placed=false,mk='<span class="nowmk" aria-hidden="true"></span>';
    sorted().forEach(function(h){
      if(!placed&&toMin(h.start)>n){html+=mk;placed=true;}
      var p=phaseOf(h);
      html+='<button type="button" class="rc'+(h.id===S.sel?' sel':'')+(p==='open'||p==='hold'?' open':'')+'" data-id="'+h.id+'" aria-label="'+esc(h.name)+', '+h.start+(p==='done'?', сделано':'')+'">'+
        '<span class="rt">'+h.start+(h.kind==='count'&&p!=='done'&&todayParts(h.id).length?' · '+todayParts(h.id).length+'/'+h.goal:'')+'</span><span class="rn">'+esc(h.name)+(p==='done'?' <i>✓</i>':'')+'</span></button>';
    });
    if(!placed)html+=mk;
    html+='<button type="button" class="rc add" id="addbtn" aria-label="Новая привычка">+</button>';
    el.innerHTML=html;
    el.scrollLeft=keep;
    Array.prototype.forEach.call(el.querySelectorAll('[data-id]'),function(b){
      b.addEventListener('click',function(){selectHabit(b.dataset.id);});
    });
    document.getElementById('addbtn').addEventListener('click',openNew);
    if(center){
      var s=el.querySelector('.rc.sel');
      if(s)el.scrollLeft=s.offsetLeft-(el.clientWidth-s.offsetWidth)/2;
    }
  }
  function selectHabit(id){
    if(id===S.sel)return;
    S.sel=id;hintUsed=false;renderToday(true);
  }
  function step(d){
    var list=sorted(),i=list.map(function(h){return h.id;}).indexOf(S.sel)+d;
    if(i<0||i>=list.length)return;
    selectHabit(list[i].id);
  }

  /* ---------- cloze ---------- */
  function clozeHtml(){
    return '<div class="cloze" id="cloze"><div class="slots" id="slots" aria-hidden="true"></div>'+
      '<textarea class="cap" id="typed" rows="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="Впиши фразу в пропуски"></textarea></div>';
  }
  /* typed letters fill the blanks in order; spaces and punctuation are not needed */
  function mountCloze(h,target,go,onSubmit){
    var ta=document.getElementById('typed'),box=document.getElementById('cloze'),slots=document.getElementById('slots');
    var words=target.trim().split(/\s+/).map(function(w){return Array.from(w.replace(/[^\p{L}\p{N}]/gu,''));}).filter(function(a){return a.length;});
    var showAll=h.mode!=='memory';
    function draw(){
      var typed=Array.from(ta.value.replace(/[^\p{L}\p{N}]/gu,'')),k=0,html='';
      words.forEach(function(w,wi){
        html+='<span class="w">';
        w.forEach(function(g,i){
          var t=typed[k],cls='c',txt='';
          if(t!==undefined){txt=esc(t);}
          else{
            if(k===typed.length)cls+=' cur';
            if(showAll||(hintUsed&&i===0)){cls+=' ghost';txt=esc(g);}
          }
          html+='<span class="'+cls+'" style="--d:'+(k*18)+'ms">'+txt+'</span>';k++;
        });
        if(wi===words.length-1){for(var e=k;e<typed.length;e++){html+='<span class="c x">'+esc(typed[e])+'</span>';}}
        html+='</span>';
      });
      slots.innerHTML=html;
    }
    function upd(){
      var ok=sim(ta.value,target)>=h.strict&&norm(ta.value).length>0;
      box.classList.toggle('ok',ok);go.disabled=!ok;draw();
    }
    ta.addEventListener('input',upd);
    ta.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();if(!go.disabled)go.click();}});
    go.addEventListener('click',function(){
      if(sim(ta.value,target)<h.strict)return;
      onSubmit(ta.value.trim());
    });
    draw();
    setTimeout(function(){try{ta.focus({preventScroll:true});}catch(e){}},0);
    return {draw:draw,focus:function(){ta.focus();}};
  }

  /* ---------- TODAY ---------- */
  function weekDots(hid){
    var s='';
    for(var i=6;i>=0;i--){
      var d=nowDate();d.setDate(d.getDate()-i);
      s+='<i class="'+(hasLog(hid,keyOf(d))?'on ':'')+(i===0?'today':'')+'"></i>';
    }
    return '<div class="dots7" aria-hidden="true">'+s+'</div>';
  }
  function whyLine(h){return h.why?'<p class="whyline">'+esc(h.why)+'</p>':'';}
  function cdText(h,ph){return 'через '+fmtDur(untilNext(h));}
  /* while waiting, the habit name is the hero; the next time is secondary */
  function nextHero(h,ph){
    var lbl=(ph==='after'?'Завтра':'Сегодня');
    return '<div class="next"><div><h1>'+esc(h.name)+'</h1>'+whyLine(h)+'</div><div class="tm"><div><span class="lbl">'+lbl+'</span><p class="when">'+h.start+'</p></div><p class="cd" id="cd">'+cdText(h,ph)+'</p></div></div>';
  }
  function avoidLinks(ph){
    var s='<div class="acts">';
    if(ph!=='after')s+='<button class="btn2" id="urgebtn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12c2.5-3 4.5-3 6-.5s3.5 2.5 6 0 4-2.5 6 .5"/><path d="M3 17c2.5-3 4.5-3 6-.5s3.5 2.5 6 0 4-2.5 6 .5" opacity=".5"/></svg>Тянет</button>';
    s+='<button class="btn2 danger" id="slipbtn" type="button">Сорвался</button></div>';
    return s;
  }
  function holdInner(h){
    var n=nowMin(),a=toMin(h.start),b=toMin(h.end),held=Math.max(0,n-a),left=Math.max(0,b-n),pct=Math.min(100,Math.round(held/(b-a)*100));
    return '<span class="lbl">Держусь</span><p class="big">'+fmtDur(held)+'</p><div class="bar"><i style="width:'+pct+'%"></i></div><p class="mute">до '+h.end+' · осталось '+fmtDur(left)+'</p>';
  }
  function renderToday(center){
    var h=cur();
    if(tm&&tm.hid===h.id){renderRun(h);return;}
    var ph=phaseOf(h),tl=todayLog(h.id),body='',avoid=h.kind==='avoid',timer=h.kind==='timer',count=h.kind==='count',parts=count?todayParts(h.id).length:0,cnt=count&&ph==='open'&&parts<h.goal;
    current=ph;
    var head='<div><h1>'+esc(h.name)+'</h1><p class="win">'+(avoid?'период ':'')+h.start+' – '+h.end+(timer?' · '+h.dur+' мин':'')+(count?' · цель '+h.goal:'')+'</p>'+whyLine(h)+'</div>';
    if(ph==='done'){
      var said=timer?'<p class="said">'+(tl.minutes||h.dur)+' мин</p>':'<p class="said">'+esc(tl.typed)+'</p>';
      var dtxt=avoid?'Устоял с '+h.start+' до '+h.end:count?(tl.count||h.goal)+' из '+h.goal+' · '+esc(tl.time):esc(tl.time)+(tl.hint?' · с подсказкой':'');
      body=said+
        '<div class="donerow"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="tick" d="M5 12.5l4.5 4.5L19 7.5" pathLength="1"/></svg><span>'+dtxt+'</span></div>'+
        weekDots(h.id);
    }else if(ph==='slip'){
      var n14=lastDays(h.id,14);
      body='<p class="said" style="font-size:24px">Бывает. Записал.</p>'+
        '<p class="mute">Серия началась заново. Но устоял '+n14+' из последних 14 дней, и это тоже твоё. Завтра можно начать снова в '+h.start+'.</p>';
    }else if(ph==='before'||ph==='after'){
      body=nextHero(h,ph)+(avoid?avoidLinks(ph):timer?'<button class="btn2 full" id="tnow" type="button">Начать сейчас</button>':'')+(count&&ph==='after'&&parts?'<p class="mute">Сегодня не добрал: '+parts+' из '+h.goal+'</p>':'');
    }else if(ph==='hold'){
      body='<div class="hold" id="hold">'+holdInner(h)+'</div>'+avoidLinks(ph);
    }else if(cnt){
      var dots='';for(var ci=0;ci<h.goal;ci++)dots+='<i class="'+(ci<parts?'on':'')+'"></i>';
      body=(h.rule?'<p class="mute">Засчитывается: '+esc(h.rule)+'</p>':'')+
        '<div class="hold"><p class="big t">'+parts+' из '+h.goal+'</p><div class="cdots" aria-hidden="true">'+dots+'</div></div>'+
        '<button class="go" id="cgo" type="button">+1 '+esc(h.unit||'раз')+'</button>'+
        (parts?'<button class="btn2 sm" id="cundo" type="button">Отменить последнее</button>':'');
    }else if(timer){
      body=(h.rule?'<p class="mute">Засчитывается: '+esc(h.rule)+'</p>':'')+
        '<div class="hold"><p class="big t">'+fmtClock(h.dur*60)+'</p></div><button class="go" id="tgo" type="button">Начать</button>';
    }else{
      var mem=h.mode==='memory';
      body=(count?'<p class="mute" style="margin-bottom:-12px">Все '+h.goal+' сделаны. Подтверди фразой.</p>':h.rule?'<p class="mute" style="margin-bottom:-12px">Засчитывается: '+esc(h.rule)+'</p>':(avoid?'<p class="mute" style="margin-bottom:-12px">Период закончился. Устоял? Подтверди фразой.</p>':''))+
        clozeHtml()+
        '<div class="hintrow">'+(mem?'<button class="btn2 sm" id="hintbtn" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>Подсказка</button>':'')+'</div>'+
        '<button class="go" id="go" type="button" disabled>'+'Подтвердить'+'</button>'+(avoid?avoidLinks(ph):'');
    }
    document.getElementById('main').className=(ph==='open'&&!timer&&!cnt)?'':'center';
    var app=document.getElementById('app');
    app.style.animation='none';void app.offsetWidth;app.style.animation='';
    app.innerHTML=((ph==='before'||ph==='after')?'':head)+body;
    renderTop();renderRail(center);
    if(ph==='open'&&!timer&&!cnt)bindOpen(h);
    if(cnt){
      document.getElementById('cgo').addEventListener('click',function(){
        addLog({hid:h.id,day:keyOf(nowDate()),time:fmtMin(nowMin()),part:true});
        if(todayParts(h.id).length>=h.goal)toast('Цель набрана');
        renderToday();
      });
      var cu=document.getElementById('cundo');
      if(cu)cu.addEventListener('click',function(){
        var k=keyOf(nowDate()),i=S.logs.findIndex(function(l){return l.hid===h.id&&l.day===k&&l.part;});
        if(i>=0)removeLog(i);
        renderToday();
      });
    }
    if(timer){var tg=document.getElementById('tgo')||document.getElementById('tnow');if(tg)tg.addEventListener('click',function(){startTimer(h);});}
    if(avoid&&ph!=='done'&&ph!=='slip')bindAvoid(h);
  }

  /* ---------- TIMER ---------- */
  function tmLeft(){return tm.sec-(Date.now()-tm.start)/1000*(demo.fast?60:1);}
  function chime(ctx){
    try{
      if(ctx){
        var o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime;
        o.type='sine';o.frequency.value=528;
        g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.25,t+.05);g.gain.exponentialRampToValueAtTime(.0001,t+2.4);
        o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+2.5);
        setTimeout(function(){try{ctx.close();}catch(e){}},3000);
      }
    }catch(e){}
    try{if(navigator.vibrate)navigator.vibrate([200,100,200]);}catch(e){}
  }
  function startTimer(h){
    var ctx=null,x;
    try{var C=window.AudioContext||window.webkitAudioContext;if(C){ctx=new C();if(ctx.resume)ctx.resume();}}catch(e){}
    x={hid:h.id,start:Date.now(),sec:(h.dur||10)*60,ctx:ctx,lock:null};
    tm=x;
    timerSave(x);
    try{if(navigator.wakeLock)navigator.wakeLock.request('screen').then(function(l){if(tm===x)x.lock=l;else l.release();}).catch(function(){});}catch(e){}
    clearInterval(tmTimer);tmTimer=setInterval(tmTick,500);
    S.sel=h.id;
    if(tab!=='today')setTab('today');else renderToday();
  }
  /* таймер переживает закрытие страницы: конец запоминается на сервере (push) и на устройстве */
  function timerSave(x){
    if(DEMO)return;
    Store.timerStart(x.hid,x.start+x.sec*1000);
    try{localStorage.setItem('slovo-timer',JSON.stringify({hid:x.hid,start:x.start,sec:x.sec}));}catch(e){}
  }
  function timerClear(hid){
    if(DEMO)return;
    Store.timerStop(hid);
    try{localStorage.removeItem('slovo-timer');}catch(e){}
  }
  function restoreTimer(){
    if(DEMO)return;
    var o=null;try{o=JSON.parse(localStorage.getItem('slovo-timer'));}catch(e){}
    if(!o||!byId(o.hid)){try{localStorage.removeItem('slovo-timer');}catch(e){}return;}
    var end=o.start+o.sec*1000;
    if(end<=Date.now()){
      // сессия закончилась, пока страница была закрыта: записываем её на момент конца
      var p=Schedule.localParts(end,tzName());
      addLog({hid:o.hid,day:p.day,time:p.hm,minutes:Math.round(o.sec/60),typed:''});
      timerClear(o.hid);
    }else{
      tm={hid:o.hid,start:o.start,sec:o.sec,ctx:null,lock:null};
      tmTimer=setInterval(tmTick,500);
    }
  }
  function releaseTimer(x){clearInterval(tmTimer);tmTimer=null;try{if(x&&x.lock)x.lock.release();}catch(e){}}
  function tmTick(){
    if(!tm)return;
    var left=tmLeft();
    if(left<=0){finishTimer();return;}
    var t=document.getElementById('tmtime');
    if(t){t.textContent=fmtClock(left);document.getElementById('tmbar').style.width=Math.min(100,(1-left/tm.sec)*100)+'%';}
  }
  function finishTimer(){
    var x=tm;if(!x)return;
    releaseTimer(x);chime(x.ctx);tm=null;
    timerClear(x.hid);
    var h=byId(x.hid);
    addLog({hid:x.hid,day:keyOf(nowDate()),time:fmtMin(nowMin()),minutes:Math.round(x.sec/60),typed:''});
    if(tab==='today'&&S.sel===x.hid)renderToday();
    else{toast((h?h.name:'Таймер')+': время вышло',3500);if(tab==='today')renderToday();}
  }
  function renderRun(h){
    current='run';
    var left=tmLeft(),app=document.getElementById('app');
    document.getElementById('main').className='center';
    app.style.animation='none';void app.offsetWidth;app.style.animation='';
    app.innerHTML='<div><h1>'+esc(h.name)+'</h1>'+whyLine(h)+'</div>'+
      '<div class="hold"><p class="big t" id="tmtime">'+fmtClock(left)+'</p><div class="bar"><i id="tmbar" style="width:'+Math.min(100,(1-left/tm.sec)*100)+'%"></i></div></div>'+
      '<button class="btn2 full danger" id="tstop" type="button">Остановить</button>';
    renderTop();renderRail(false);
    var b=document.getElementById('tstop');
    b.addEventListener('click',function(){
      if(!b.dataset.sure){b.dataset.sure='1';b.textContent='Остановить без записи?';b.classList.add('warn');return;}
      releaseTimer(tm);try{if(tm.ctx&&tm.ctx.close)tm.ctx.close();}catch(e){}
      timerClear(tm.hid);
      tm=null;renderToday();toast('Остановлено');
    });
  }
  function bindOpen(h){
    var target=todayPhrase(h),go=document.getElementById('go');
    var cz=mountCloze(h,target,go,function(val){
      if(phaseOf(h)!=='open'){renderToday();return;}
      var lg={hid:h.id,day:keyOf(nowDate()),time:fmtMin(nowMin()),typed:val,hint:hintUsed,sim:sim(val,target)};
      if(h.kind==='count')lg.count=todayParts(h.id).length;
      addLog(lg);
      hintUsed=false;renderToday();
    });
    var hb=document.getElementById('hintbtn');
    if(hb)hb.addEventListener('click',function(){hintUsed=true;hb.remove();cz.draw();cz.focus();});
  }
  function bindAvoid(h){
    var u=document.getElementById('urgebtn');
    if(u)u.addEventListener('click',function(){openUrge(h);});
    var s=document.getElementById('slipbtn');
    s.addEventListener('click',function(){
      if(!s.dataset.sure){s.dataset.sure='1';s.textContent='Записать срыв?';s.classList.add('warn');return;}
      addLog({hid:h.id,day:keyOf(nowDate()),time:fmtMin(nowMin()),slip:true});
      renderToday();
    });
  }
  function tick(){
    if(tab!=='today')return;
    var h=cur();
    if(tm&&tm.hid===h.id)return;
    var ph=phaseOf(h);
    if(ph!==current){var t=document.getElementById('typed');if(!t||!t.value)renderToday();return;}
    var cd=document.getElementById('cd');
    if(cd)cd.textContent=cdText(h,ph);
    var hd=document.getElementById('hold');
    if(hd&&ph==='hold')hd.innerHTML=holdInner(h);
    renderRail(false);
  }
  setInterval(function(){if(!demo.time)tick();},20000);

  /* swipe between habits, in time order */
  (function(){
    var tx=null,ty=null,w=document.querySelector('.wrap');
    w.addEventListener('touchstart',function(e){
      if(tab!=='today'||e.target.closest('.cloze')||e.target.closest('.rail')||e.touches.length!==1){tx=null;return;}
      tx=e.touches[0].clientX;ty=e.touches[0].clientY;
    },{passive:true});
    w.addEventListener('touchend',function(e){
      if(tx===null)return;
      var dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;tx=null;
      if(Math.abs(dx)>60&&Math.abs(dy)<40)step(dx<0?1:-1);
    },{passive:true});
  })();

  /* ---------- URGE ("тянет") ---------- */
  function openUrge(h){urge={hid:h.id,stage:'type',start:0};hintUsed=false;setTab('urge');}
  function fmtClock(s){s=Math.max(0,Math.ceil(s));return Math.floor(s/60)+':'+pad(s%60);}
  function renderUrge(){
    var h=byId(urge.hid),app=document.getElementById('app');
    document.getElementById('main').className=urge.stage==='type'?'':'center';
    if(urge.stage==='type'){
      app.innerHTML='<div><h1>Тянет</h1><p class="win" style="margin-top:6px">Это нормально. Желание обычно спадает минут за 10–15. Впиши фразу и переждём.</p></div>'+
        clozeHtml()+
        '<button class="go" id="go" type="button" disabled>Переждать 10 минут</button>';
      renderTop();renderRail();
      mountCloze(h,todayPhrase(h),document.getElementById('go'),function(){
        urge.stage='wait';urge.start=Date.now();renderUrge();
      });
    }else{
      app.innerHTML='<div><h1>Тянет</h1><p class="win" style="margin-top:6px" id="usub">Просто подожди. Выпей воды, открой окно, сделай пять вдохов.</p></div>'+
        (h.why?'<p class="whyq">'+esc(h.why)+'</p>':'')+
        '<p class="big" id="utime">'+fmtClock(URGE_SEC)+'</p>'+
        '<button class="go" id="ugo" type="button" disabled>Устоял</button>'+
        '<button class="btn2 full" id="uexit" type="button">Выйти</button>';
      renderTop();renderRail();
      var go=document.getElementById('ugo');
      function upd(){
        var left=URGE_SEC-(Date.now()-urge.start)/1000*(demo.fast?60:1);
        document.getElementById('utime').textContent=fmtClock(left);
        if(left<=0){
          clearInterval(urgeTimer);urgeTimer=null;go.disabled=false;
          document.getElementById('usub').textContent='Желание прошло или стало слабее. Ты справился.';
        }
      }
      clearInterval(urgeTimer);urgeTimer=setInterval(upd,500);upd();
      go.addEventListener('click',function(){
        var ug={hid:h.id,day:keyOf(nowDate()),time:fmtMin(nowMin())};S.urges.unshift(ug);if(!DEMO){ug.id=Store.newId();Store.addUrge(ug);}
        urge=null;setTab('today');toast('Устоял в момент тяги');
      });
      document.getElementById('uexit').addEventListener('click',function(){urge=null;setTab('today');});
    }
  }

  /* ---------- SETTINGS ---------- */
  var FORMULAS={
    'do':[
      {n:'Кто я',t:'Я человек, который [действие].',w:'Фраза о том, кто ты, держится лучше, чем фраза о действии. В известном эксперименте призыв «быть избирателем» сработал сильнее, чем «проголосовать». Например: «Я человек, который встаёт вовремя».'},
      {n:'Если — то',t:'Когда [сигнал], я [первое действие].',w:'Привязка к сигналу и к первому движению (план «если — то»). Не нужно решать, с чего начать. Например: «Когда звенит будильник, я сажусь и ставлю ноги на пол».'},
      {n:'По имени',t:'[имя], [действие]. Это одна минута.',w:'Обращение к себе по имени создаёт небольшую дистанцию. Так проще действовать спокойно, чем под давлением «я должен». Например: «Сергей, встаём. Это одна минута».'},
      {n:'Малый шаг',t:'Я [самый маленький шаг].',w:'Конкретное маленькое действие трудно оспорить отговоркой. Цель фразы в том, чтобы начать, а не быть идеальным. Например: «Я встаю и открываю окно».'}
    ],
    'avoid':[
      {n:'Выбор',t:'Я выбираю [своё] вместо [срыва].',w:'Выбор вместо запрета: запрет часто вызывает сопротивление, а выбор возвращает ощущение контроля. Например: «Я выбираю прогулку вместо ленты».'},
      {n:'Если тянет',t:'Когда тянет к [чему], я [замена].',w:'Заготовленная замена на момент тяги (план «если — то»). Например: «Когда тянет к ленте, я пью воду и открываю книгу».'},
      {n:'Кто я',t:'Я человек, который обходится без [чего].',w:'Фраза о том, кто ты, держится лучше, чем запрет. Например: «Я человек, который обходится без ленты».'},
      {n:'Свобода',t:'Я свободен от [чего], вечер мой.',w:'Рамка свободы вместо потери: ты не лишаешь себя, а возвращаешь себе время. Например: «Я свободен от ленты, вечер мой».'}
    ]
  };
  function checkPhrase(p,kind){
    var r=[],t=p.trim(),wc=wordCount(t);
    if(!t){return [{k:'tip',x:'Напиши фразу. Короткую: ты будешь вспоминать её по памяти.'}];}
    if(/\[[^\]]*\]/.test(t))r.push({k:'warn',x:'Замени текст в [скобках] своим.'});
    if(wc<3)r.push({k:'warn',x:'Слишком коротко, фраза превратится в рефлекс. Нужно хотя бы 3 слова.'});
    else if(wc>10)r.push({k:'warn',x:'Длинную фразу трудно вспомнить без подсказки. Лучше до 8 слов.'});
    else r.push({k:'ok',x:wc+' '+plural(wc,['слово','слова','слов'])+': такую фразу реально вспомнить.'});
    if(/(^|[^\p{L}])(должен|должна|обязан|обязана|надо|нужно|придётся|придется)(?![\p{L}])/iu.test(t))r.push({k:'warn',x:'«Должен» и «надо» вызывают сопротивление. Скажи, что ты делаешь.'});
    if(/(никогда|всегда|каждый раз|идеальн|без исключений)/i.test(t))r.push({k:'warn',x:'Абсолютные слова ломаются при первом пропуске. Убери их.'});
    if(/(^|[^\p{L}])(буду|стану|смогу|попробую|постараюсь)(?![\p{L}])/iu.test(t))r.push({k:'warn',x:'«Буду» и «попробую» оставляют лазейку. Пиши в настоящем времени.'});
    if(kind==='avoid'){
      if(/(^|[^\p{L}])(запрещ|нельзя|бросаю|завязываю)/iu.test(t))r.push({k:'tip',x:'Лучше выбор или свобода, чем запрет.'});
    }else if(/(^|[^\p{L}])не(?![\p{L}])/iu.test(t))r.push({k:'tip',x:'Лучше сказать, что ты делаешь, а не чего не делаешь.'});
    if(/(^|[^\p{L}])я(?![\p{L}])/iu.test(t)||/^[А-ЯЁ\[][а-яё\]]+,/.test(t))r.push({k:'ok',x:'От первого лица или по имени.'});
    else r.push({k:'tip',x:'Начни с «Я…» или со своего имени.'});
    return r;
  }
  function checkHtml(p,kind){
    return checkPhrase(p,kind).map(function(i){return '<li class="'+i.k+'"><b>'+(i.k==='ok'?'✓':i.k==='warn'?'!':'·')+'</b><span>'+esc(i.x)+'</span></li>';}).join('');
  }
  function optsHtml(id,list,val){
    return '<div class="seg" role="radiogroup" id="'+id+'">'+list.map(function(o){return '<button type="button" class="opt" role="radio" data-v="'+o[0]+'" aria-checked="'+(String(o[0])===String(val))+'">'+o[1]+'</button>';}).join('')+'</div>';
  }
  var DEF={'do':['07:00','07:30'],'avoid':['08:00','20:00'],'timer':['07:00','09:00'],'count':['08:00','22:00']};
  var KINDS=[['do','Сделать'],['avoid','Устоять'],['timer','Таймер'],['count','Счёт']];
  var KHINT={'do':'Действие в своё окно времени. Подтверждаешь фразой.','avoid':'Период, в который держишься. Идёт сам, а в конце подтверждаешь фразой, что устоял.','timer':'Сессия с таймером: медитация, чтение, фокус. Засчитывается, когда время вышло.','count':'Несколько порций за день: уроки, стаканы воды, подходы. Фраза закрывает день, когда набрал цель.'};
  var NOTE=[['off','Выкл'],['quiet','Тихо'],['normal','Обычно'],['dense','Плотно']];
  var NOTEL={off:'выкл',quiet:'тихо',normal:'обычно',dense:'плотно'};
  var WHYQ=[
    {n:'Что изменится',t:'Если я это делаю, то [что изменится].',q:'Что изменится в твоём дне или жизни, если ты это делаешь?'},
    {n:'Что потеряю',t:'Без этого я теряю [что].',q:'Что ты теряешь, когда пропускаешь?'},
    {n:'Каким стану',t:'Через год я хочу быть [каким].',q:'Каким ты хочешь быть через год?'}
  ];
  function noteText(d){
    var a=toMin(d.start||'00:00'),b=toMin(d.end||'00:00');
    if(b<=a)return '';
    if(d.notify==='off')return 'Без уведомлений. Останется только экран «Тянет».';
    var t=Schedule.avoidTimes(d.start,d.end,d.notify);
    if(d.notify==='dense')return t.length+' '+plural(t.length,['пинг','пинга','пингов'])+': каждый час с '+d.start+' до '+d.end+'. Тексты разные, но если начнёшь смахивать их не читая, сбавь.';
    return 'Придут в '+t.map(fmtMin).join(', ')+'. Первое в начале периода, последнее просит подтвердить.';
  }
  function acc(k,title,val,inner){
    return '<details class="acc" data-k="'+k+'"'+(accOpen[k]?' open':'')+'><summary><span>'+title+'</span><em id="sm-'+k+'">'+val+'</em></summary><div class="accb">'+inner+'</div></details>';
  }
  /* ---------- уведомления на этом устройстве ---------- */
  function isIos(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  function isStandalone(){return !!(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));}
  function pushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
  function tzList(){
    var l=[];try{if(Intl.supportedValuesOf)l=Intl.supportedValuesOf('timeZone');}catch(e){}
    var cur=(S.settings&&S.settings.tz)||DEVICE_TZ;
    if(cur&&l.indexOf(cur)<0)l=[cur].concat(l);
    if(DEVICE_TZ&&l.indexOf(DEVICE_TZ)<0)l=[DEVICE_TZ].concat(l);
    return l;
  }
  function pushHtml(){
    if(DEMO)return '';
    var cur=(S.settings&&S.settings.tz)||DEVICE_TZ;
    return '<div class="sec"><span class="lab">Уведомления на этом устройстве</span><div id="p-box"></div>'+
      '<label class="lab" for="p-tz">Часовой пояс</label><select class="in" id="p-tz">'+tzList().map(function(z){return '<option value="'+esc(z)+'"'+(z===cur?' selected':'')+'>'+esc(z)+'</option>';}).join('')+'</select>'+
      '<p class="why">По этому поясу приходят уведомления'+(DEVICE_TZ&&DEVICE_TZ!==cur?'. Сейчас устройство в поясе '+esc(DEVICE_TZ):'')+'.</p>'+
      '<p class="why" id="p-msg" role="status"></p></div>';
  }
  function urlB64(b){var p='='.repeat((4-b.length%4)%4),r=atob((b+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(r,function(c){return c.charCodeAt(0);});}
  function bindPush(){
    if(DEMO)return;
    var $=function(id){return document.getElementById(id);},msg=function(t){var m=$('p-msg');if(m)m.textContent=t;};
    var tzs=$('p-tz');
    if(tzs)tzs.addEventListener('change',function(){S.settings.tz=tzs.value;Store.setSetting('tz',tzs.value);hintUsed=false;msg('Пояс сохранён. Часы и расписание теперь по нему.');});
    var box=$('p-box');
    if(!box)return;
    function draw(sub){
      if(tab!=='habit'||!$('p-box'))return;
      if(!pushSupported()){
        box.innerHTML='<p class="why">'+(isIos()&&!isStandalone()
          ?'Чтобы получать уведомления на iPhone, добавь приложение на экран «Домой»: в Safari нажми «Поделиться» → «На экран Домой», потом открой его оттуда.'
          :'Этот браузер не поддерживает push-уведомления.')+'</p>';
        return;
      }
      if(Notification.permission==='denied'){
        box.innerHTML='<p class="why">Уведомления запрещены в настройках браузера или телефона. Разреши их для этого сайта и вернись сюда.</p>';
        return;
      }
      if(sub){
        box.innerHTML='<p class="why">Включены на этом устройстве.</p><div class="row"><button class="btn2 sm" id="p-test" type="button">Тестовое уведомление</button><button class="btn2 sm" id="p-off" type="button">Выключить</button></div>';
        $('p-test').addEventListener('click',function(){
          msg('Отправляю…');
          Store.api('POST','/api/push/test',{}).then(function(r){
            if(r.status===503){msg('На сервере не заданы ключи VAPID.');return;}
            return r.json().then(function(j){
              msg(j.total===0?'На сервере нет подписок. Выключи и включи заново.':j.sent>0?'Отправлено. Если не пришло, проверь режимы «Не беспокоить» и «Фокус».':'Сервис уведомлений не принял сообщение. Включи заново.');
            });
          }).catch(function(){msg('Нет связи с сервером.');});
        });
        $('p-off').addEventListener('click',function(){
          navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(sb){
            if(!sb)return;var ep=sb.endpoint;
            return sb.unsubscribe().then(function(){return Store.api('POST','/api/push/unsubscribe',{endpoint:ep});});
          }).then(function(){msg('Выключено.');draw(null);}).catch(function(){msg('Не получилось выключить.');});
        });
      }else{
        box.innerHTML='<p class="why">Выключены. Напоминания придут, когда включишь.</p><div><button class="btn2 sm" id="p-on" type="button">Включить</button></div>';
        $('p-on').addEventListener('click',function(){
          // разрешение просим первым действием в обработчике тапа (требование iOS)
          var perm=Notification.requestPermission();
          Promise.resolve(perm).then(function(res){
            if(res!=='granted'){msg('Разрешение не получено.');draw(null);return;}
            return Store.api('GET','/api/vapid-public-key').then(function(r){
              if(!r.ok)throw new Error('Сервер без ключей VAPID.');return r.json();
            }).then(function(j){
              return navigator.serviceWorker.ready.then(function(reg){
                return reg.pushManager.getSubscription().then(function(old){return old?old.unsubscribe():null;}).then(function(){
                  return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(j.key)});
                });
              });
            }).then(function(sb){
              return Store.api('POST','/api/push/subscribe',{subscription:sb.toJSON(),tz:(S.settings&&S.settings.tz)||DEVICE_TZ}).then(function(r){
                if(!r.ok)throw new Error('Сервер не сохранил подписку.');
                msg('Включено.');draw(sb);
              });
            });
          }).catch(function(e){msg(e&&e.message?e.message:'Не получилось включить.');draw(null);});
        });
      }
    }
    if(!pushSupported()){draw(null);return;}
    navigator.serviceWorker.ready.then(function(reg){return reg.pushManager.getSubscription();}).then(function(sb){
      draw(sb);
      // подписка есть в браузере, но сервер мог её потерять: тихо отправим ещё раз
      if(sb)Store.api('POST','/api/push/subscribe',{subscription:sb.toJSON(),tz:(S.settings&&S.settings.tz)||DEVICE_TZ}).catch(function(){});
    }).catch(function(){draw(null);});
  }
  function dataHtml(){
    if(DEMO)return '';
    var lg=Store.legacyHabits();
    return '<div class="sec"><span class="lab">Данные</span><div class="row"><button class="btn2 sm" id="d-exp" type="button">Экспорт JSON</button><button class="btn2 sm" id="d-imp" type="button">Импорт JSON</button></div>'+
      '<input type="file" id="d-file" accept="application/json,.json" class="hidden">'+
      (lg.length?'<div><button class="btn2 sm" id="d-leg" type="button">Перенести привычки с этого устройства ('+lg.length+')</button></div>':'')+
      '<p class="why" id="d-msg" role="status"></p></div>';
  }
  function bindData(){
    if(DEMO)return;
    var $=function(id){return document.getElementById(id);},msg=function(t){var m=$('d-msg');if(m)m.textContent=t;};
    $('d-exp').addEventListener('click',function(){
      msg('Готовлю файл…');
      Store.exportJson().then(function(text){
        var a=document.createElement('a'),d=new Date();
        a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));
        a.download='slovo-dano-'+keyOf(d)+'.json';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
        msg('Файл сохранён.');
      }).catch(function(){msg('Не получилось: нужна связь с сервером.');});
    });
    var imp=$('d-imp'),file=$('d-file');
    imp.addEventListener('click',function(){
      if(!imp.dataset.sure){imp.dataset.sure='1';imp.textContent='Заменить все данные?';imp.classList.add('warn');return;}
      file.click();
    });
    file.addEventListener('change',function(){
      var f=file.files[0];if(!f)return;
      var r=new FileReader();
      r.onload=function(){
        msg('Импортирую…');
        Store.importJson(String(r.result)).then(function(){
          S.sel=S.habits.length?pickHabit():null;
          if(S.habits.length){setTab('today',true);toast('Данные восстановлены');}else{openNew();}
        }).catch(function(e){msg(e.message||'Не удалось импортировать.');});
      };
      r.readAsText(f);
    });
    var lg=$('d-leg');
    if(lg)lg.addEventListener('click',function(){
      Store.legacyHabits().forEach(function(h){
        if(byId(h.id))return;
        S.habits.push(h);Store.putHabit(h);
      });
      Store.markLegacyDone();lg.remove();msg('Привычки перенесены. Журнал прототипа не хранился.');
    });
  }
  /* ---------- свои тексты уведомлений ---------- */
  function ntRow(t){
    return '<div class="ntrow"><textarea class="in ntext" rows="2" maxlength="140" aria-label="Текст уведомления" placeholder="Например: {название}: держусь уже {держусь}">'+esc(t||'')+'</textarea><button class="ib ntdel" type="button" aria-label="Убрать текст">×</button></div>';
  }
  function textsHtml(d){
    var t=d.notifyTexts||[];
    return '<span class="lab">Свои тексты уведомлений</span>'+
      '<div id="ntexts">'+t.map(ntRow).join('')+'</div>'+
      '<div class="pills" id="phchips" aria-label="Подстановки">'+Schedule.PLACEHOLDERS.map(function(x){return '<button type="button" class="pill" data-ph="'+esc(x)+'">'+esc(x)+'</button>';}).join('')+'</div>'+
      '<div class="row"><button class="btn2 sm'+(t.length>=Schedule.MAX_TEXTS?' hidden':'')+'" id="ntadd" type="button">+ формулировка</button><button class="btn2 sm" id="notetest" type="button">Показать пример</button></div>'+
      '<p class="why">Не больше '+Schedule.MAX_TEXTS+'. Они чередуются, одна и та же не идёт два раза подряд. Если своих нет, берутся стандартные.</p>';
  }
  function openEdit(h){
    draft={id:h.id,kind:h.kind||'do',name:h.name,start:h.start,end:h.end,remind:h.remind||'',dur:h.dur||10,goal:h.goal||3,unit:h.unit||'раз',notify:h.notify||'normal',phrases:h.phrases&&h.phrases.length?h.phrases.slice():[''],why:h.why||'',rule:h.rule||'',mode:h.mode,strict:h.strict,notifyTexts:(h.notifyTexts||[]).slice()};
    activePh=0;accOpen={};setTab('habit');
  }
  function openNew(){
    draft={id:null,kind:'do',name:'',start:DEF['do'][0],end:DEF['do'][1],remind:'',dur:10,goal:3,unit:'раз',notify:'normal',phrases:[''],why:'',rule:'',mode:'memory',strict:0.85,notifyTexts:[]};
    activePh=0;accOpen={ph:true};setTab('habit');
  }
  function syncDraft(){
    var q=function(id){return document.getElementById(id);};
    ['name','start','end','remind','why','rule'].forEach(function(k){var e=q('f-'+k);if(e)draft[k]=e.value;});
    var du=q('f-dur');if(du)draft.dur=Math.max(1,Math.min(180,parseInt(du.value,10)||draft.dur||10));
    var gl=q('f-goal');if(gl)draft.goal=Math.max(1,Math.min(20,parseInt(gl.value,10)||draft.goal||3));
    var un=q('f-unit');if(un)draft.unit=un.value;
    var pl=document.querySelectorAll('.phrase');
    if(pl.length)draft.phrases=Array.prototype.map.call(pl,function(t){return t.value;});
    var nl=document.querySelectorAll('.ntext');
    if(nl.length||document.getElementById('ntexts'))draft.notifyTexts=Array.prototype.map.call(nl,function(t){return t.value;});
    [['f-mode','mode'],['f-strict','strict'],['f-kind','kind'],['f-notify','notify']].forEach(function(x){
      var e=document.querySelector('#'+x[0]+' [aria-checked="true"]');
      if(e)draft[x[1]]=x[1]==='strict'?parseFloat(e.dataset.v):e.dataset.v;
    });
    Array.prototype.forEach.call(document.querySelectorAll('details.acc'),function(dd){accOpen[dd.dataset.k]=dd.open;});
  }
  function renderHabit(){
    var d=draft,isNew=!d.id,n=d.phrases.length,avoid=d.kind==='avoid',timer=d.kind==='timer',count=d.kind==='count',F=FORMULAS[count?'do':d.kind]||[];
    if(activePh>=n)activePh=0;
    var phs=d.phrases.map(function(p,i){
      return '<div class="phrow"><textarea class="in phrase" data-i="'+i+'" rows="2" maxlength="140" placeholder="'+(i===0?(avoid?'Фраза про выбор, а не про запрет':'Фраза, которую ты напишешь по памяти'):'Ещё одна фраза')+'" aria-label="Фраза '+(i+1)+'">'+esc(p)+'</textarea>'+
        (n>1?'<button class="link rm" type="button" data-i="'+i+'">убрать</button>':'')+'</div>';
    }).join('');
    var timeHint=avoid?'«Тянет» и «Сорвался» доступны весь период. Подтвердить можно после конца, до полуночи.':(timer?'Запустить таймер можно и вне окна.':count?'Отмечать порции и подтверждать можно только в окне.':'Подтвердить можно только в окне.');
    var durHtml=timer?'<div class="sec"><label class="lab" for="f-dur">Длительность, мин</label><div class="durrow" id="durchips">'+[5,10,15,20,30].map(function(m){return '<button type="button" class="pill" data-m="'+m+'" aria-pressed="'+(m===d.dur)+'">'+m+'</button>';}).join('')+'<input class="in num" type="number" inputmode="numeric" id="f-dur" min="1" max="180" value="'+d.dur+'" aria-label="Минут"></div></div>':'';
    var goalHtml=count?'<div class="sec"><label class="lab" for="f-goal">Сколько за день</label><div class="durrow" id="goalchips">'+[2,3,4,5,8].map(function(m){return '<button type="button" class="pill" data-m="'+m+'" aria-pressed="'+(m===d.goal)+'">'+m+'</button>';}).join('')+'<input class="in num" type="number" inputmode="numeric" id="f-goal" min="1" max="20" value="'+d.goal+'" aria-label="Сколько"></div>'+
      '<label class="lab" for="f-unit" style="margin-top:6px">Как назвать порцию</label><input class="in" type="text" id="f-unit" maxlength="16" value="'+esc(d.unit||'')+'" placeholder="урок, стакан, подход"></div>':'';
    var phHtml=timer?'':acc('ph','Фразы',n+' '+plural(n,['фраза','фразы','фраз']),
      '<div class="pills" id="chips">'+F.map(function(f,i){return '<button type="button" class="pill" data-i="'+i+'" aria-pressed="false">'+f.n+'</button>';}).join('')+'</div>'+
      '<p class="why" id="why">Выбери формулу, чтобы подставить заготовку. До трёх фраз, меняются по дням.</p>'+
      '<div class="phwrap" id="phwrap">'+phs+'</div>'+
      (n<3?'<div><button class="btn2 sm" id="addph" type="button">+ ещё фраза</button></div>':'')+
      '<ul class="check" id="check">'+checkHtml(d.phrases[activePh]||'',d.kind)+'</ul>');
    var whyHtml=acc('why','Зачем и что считается',(d.why.trim()||d.rule.trim())?'заполнено':'—',
      '<div class="pills" id="whychips">'+WHYQ.map(function(q,i){return '<button type="button" class="pill" data-i="'+i+'" aria-pressed="false">'+q.n+'</button>';}).join('')+'</div>'+
      '<p class="why" id="whyhint">Пиши про то, что даёт привычка, а не про давление. Строка видна на экране привычки.</p>'+
      '<textarea class="in" id="f-why" rows="2" maxlength="120" aria-label="Зачем мне это" placeholder="Зачем мне это, одна строка">'+esc(d.why||'')+'</textarea>'+
      '<input class="in" type="text" id="f-rule" maxlength="100" aria-label="Что считается выполненным" value="'+esc(d.rule||'')+'" placeholder="'+(avoid?'Что считается: ни разу не открывал ленту':timer?'Что считается: без телефона, сидя':'Что считается: сел и поставил ноги на пол')+'">');
    var remHtml=acc('rem','Уведомления',avoid?NOTEL[d.notify]:(d.remind||'выкл'),
      avoid?optsHtml('f-notify',NOTE,d.notify)+'<p class="why" id="notehint">'+esc(noteText(d))+'</p><div><button class="btn2 sm'+(d.notify==='dense'?'':' hidden')+'" id="tonormal" type="button">Слишком часто? Переключить на «Обычно»</button></div>'+textsHtml(d)
           :'<input class="in" type="time" id="f-remind" aria-label="Время напоминания" value="'+d.remind+'"><p class="why">Напоминание приходит, если дело сегодня ещё не сделано.</p>'+textsHtml(d));
    var confHtml=timer?'':acc('conf','Подтверждение',(d.mode==='memory'?'по памяти':'видя фразу')+' · '+Math.round(d.strict*100)+'%',
      '<span class="lab">Как вводить фразу</span>'+optsHtml('f-mode',[['memory','по памяти'],['visible','видя фразу']],d.mode)+
      '<span class="lab">Допуск на опечатки</span>'+optsHtml('f-strict',[[0.8,'80%'],[0.85,'85%'],[0.95,'95%']],d.strict));
    var app=document.getElementById('app');
    document.getElementById('main').className='';
    app.className='page form';
    app.innerHTML=
      '<h1 class="plain">'+(isNew?'Новая привычка':'Настройки')+'</h1>'+
      '<div class="sec">'+optsHtml('f-kind',KINDS,d.kind)+'<p class="why">'+KHINT[d.kind]+'</p></div>'+
      '<div class="sec"><label class="lab" for="f-name">Название</label><input class="in" type="text" id="f-name" value="'+esc(d.name)+'" maxlength="60" placeholder="'+(avoid?'Например: Без ленты':timer?'Например: Медитация':'Например: Встать в 6:30')+'"></div>'+
      '<div class="sec"><div class="two"><div class="sec"><label class="lab" for="f-start">'+(avoid?'Период с':'Окно с')+'</label><input class="in" type="time" id="f-start" value="'+d.start+'"></div>'+
      '<div class="sec"><label class="lab" for="f-end">до</label><input class="in" type="time" id="f-end" value="'+d.end+'"></div></div>'+
      '<p class="why">'+timeHint+'</p></div>'+
      durHtml+goalHtml+
      '<div class="accs">'+phHtml+whyHtml+remHtml+confHtml+'</div>'+
      '<p class="err" id="f-err" role="alert"></p>'+
      '<button class="go" id="f-save" type="button" style="opacity:1;pointer-events:auto">'+(isNew?'Добавить':'Сохранить')+'</button>'+
      '<div class="sec"><span class="lab">Небо наверху</span>'+optsHtml('f-sky',[['1','Вкл'],['0','Выкл']],sky?'1':'0')+'</div>'+
      (!isNew&&S.habits.length>1?'<button class="btn2 danger full" id="del" type="button">Удалить привычку</button>':'')+
      pushHtml()+dataHtml()+(!DEMO?'':'<details><summary>Демо: подвинуть часы</summary><div class="demo">'+
      '<div class="sec"><label class="lab" for="dtime">Время сейчас</label><input class="in" type="time" id="dtime" value="'+fmtMin(nowMin())+'"></div>'+
      '<div class="row"><button class="btn2 sm" id="dreal" type="button">Реальное время</button><button class="btn2 sm" id="dday" type="button">Следующий день</button><button class="btn2 sm" id="dfast" type="button">Таймеры ×60: '+(demo.fast?'вкл':'выкл')+'</button></div></div></details>');
    renderTop();renderRail();
    var $=function(id){return document.getElementById(id);};
    function updCheck(){var c=$('check');if(!c)return;var ph=document.querySelectorAll('.phrase')[activePh];c.innerHTML=checkHtml(ph?ph.value:'',d.kind);}
    function sums(){
      if(tab!=='habit')return;
      syncDraft();
      var set=function(id,t){var e=$(id);if(e)e.textContent=t;};
      var np=draft.phrases.length;
      set('sm-ph',np+' '+plural(np,['фраза','фразы','фраз']));
      set('sm-why',(draft.why.trim()||draft.rule.trim())?'заполнено':'—');
      set('sm-rem',draft.kind==='avoid'?NOTEL[draft.notify]:(draft.remind||'выкл'));
      set('sm-conf',(draft.mode==='memory'?'по памяти':'видя фразу')+' · '+Math.round(draft.strict*100)+'%');
      set('notehint',noteText(draft));
      var du=$('f-dur');
      if(du)Array.prototype.forEach.call(document.querySelectorAll('#durchips .pill'),function(c){c.setAttribute('aria-pressed',String(+c.dataset.m===draft.dur));});
      if($('f-goal'))Array.prototype.forEach.call(document.querySelectorAll('#goalchips .pill'),function(c){c.setAttribute('aria-pressed',String(+c.dataset.m===draft.goal));});
    }
    app.oninput=sums;app.onclick=sums;app.onchange=sums;
    Array.prototype.forEach.call(document.querySelectorAll('.phrase'),function(t){
      t.addEventListener('focus',function(){activePh=+t.dataset.i;updCheck();});
      t.addEventListener('input',function(){activePh=+t.dataset.i;updCheck();});
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rm'),function(b){
      b.addEventListener('click',function(){syncDraft();draft.phrases.splice(+b.dataset.i,1);activePh=0;renderHabit();});
    });
    var ap=$('addph');
    if(ap)ap.addEventListener('click',function(){syncDraft();draft.phrases.push('');activePh=draft.phrases.length-1;accOpen.ph=true;renderHabit();var t=document.querySelectorAll('.phrase')[activePh];if(t)t.focus();});
    var chips=$('chips');
    if(chips)chips.addEventListener('click',function(e){
      var b=e.target.closest('.pill');if(!b)return;
      var f=F[+b.dataset.i],t=document.querySelectorAll('.phrase')[activePh];
      t.value=f.t;updCheck();t.focus();
      $('why').textContent=f.w;
      Array.prototype.forEach.call(document.querySelectorAll('#chips .pill'),function(c){c.setAttribute('aria-pressed',String(c===b));});
    });
    $('whychips').addEventListener('click',function(e){
      var b=e.target.closest('.pill');if(!b)return;
      var q=WHYQ[+b.dataset.i],t=$('f-why');
      if(!t.value.trim())t.value=q.t;
      $('whyhint').textContent=q.q;
      t.focus();
      Array.prototype.forEach.call(document.querySelectorAll('#whychips .pill'),function(c){c.setAttribute('aria-pressed',String(c===b));});
    });
    var dc=$('durchips');
    if(dc)dc.addEventListener('click',function(e){
      var b=e.target.closest('.pill');if(!b)return;
      $('f-dur').value=b.dataset.m;
    });
    var gc=$('goalchips');
    if(gc)gc.addEventListener('click',function(e){
      var b=e.target.closest('.pill');if(!b)return;
      $('f-goal').value=b.dataset.m;
    });
    ['f-mode','f-strict','f-notify'].forEach(function(id){
      var el=$(id);if(!el)return;
      el.addEventListener('click',function(e){
        var b=e.target.closest('button');if(!b)return;
        Array.prototype.forEach.call(this.children,function(c){c.setAttribute('aria-checked',String(c===b));});
      });
    });
    $('f-sky').addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      Array.prototype.forEach.call(this.children,function(c){c.setAttribute('aria-checked',String(c===b));});
      sky=b.dataset.v==='1';
      try{localStorage.setItem('slovo-sky',sky?'1':'0');}catch(er){}
      if(!DEMO){S.settings.sky=sky?'1':'0';Store.setSetting('sky',S.settings.sky);}
    });
    var nt=$('notetest');
    if(nt)nt.addEventListener('click',function(){
      syncDraft();
      var a=toMin(draft.start),b=toMin(draft.end),mid=Math.min(b,a+Math.max(60,Math.round((b-a)/4)));
      var own=(draft.notifyTexts||[]).map(function(x){return x.trim();}).filter(Boolean);
      var foc=document.activeElement&&document.activeElement.classList&&document.activeElement.classList.contains('ntext')?document.activeElement.value.trim():'';
      var tpl=foc||own[0]||Schedule.defaultTemplates(draft.kind)[0];
      var h2={id:draft.id,kind:draft.kind,name:draft.name.trim()||'Привычка',why:draft.why.trim(),start:draft.start,end:draft.end,goal:draft.goal};
      var vars=Schedule.buildVars(h2,mid,{streak:draft.id?streak(draft.id):0,parts:draft.id?todayParts(draft.id).length:0});
      toast(Schedule.fillText(tpl,vars)||'Пустой текст',5000,true);
    });
    var nts=$('ntexts'),lastNt=null;
    if(nts){
      nts.addEventListener('focusin',function(e){if(e.target.classList.contains('ntext'))lastNt=e.target;});
      nts.addEventListener('click',function(e){
        var x=e.target.closest('.ntdel');if(!x)return;
        x.parentNode.remove();$('ntadd').classList.remove('hidden');
      });
      $('ntadd').addEventListener('click',function(){
        if(nts.querySelectorAll('.ntext').length>=Schedule.MAX_TEXTS)return;
        nts.insertAdjacentHTML('beforeend',ntRow(''));
        lastNt=nts.lastElementChild.querySelector('.ntext');lastNt.focus();
        if(nts.querySelectorAll('.ntext').length>=Schedule.MAX_TEXTS)$('ntadd').classList.add('hidden');
      });
      $('phchips').addEventListener('click',function(e){
        var b=e.target.closest('[data-ph]');if(!b)return;
        if(!nts.querySelector('.ntext'))$('ntadd').click();
        var t=(lastNt&&document.body.contains(lastNt))?lastNt:nts.querySelector('.ntext');
        var a=t.selectionStart==null?t.value.length:t.selectionStart,z=t.selectionEnd==null?a:t.selectionEnd;
        t.value=t.value.slice(0,a)+b.dataset.ph+t.value.slice(z);
        var c=a+b.dataset.ph.length;t.focus();t.setSelectionRange(c,c);lastNt=t;
      });
    }
    var tn=$('tonormal'),fnt=$('f-notify');
    if(fnt&&tn){
      fnt.addEventListener('click',function(){var on=fnt.querySelector('[aria-checked="true"]');tn.classList.toggle('hidden',!on||on.dataset.v!=='dense');});
      tn.addEventListener('click',function(){
        Array.prototype.forEach.call(fnt.children,function(c){c.setAttribute('aria-checked',String(c.dataset.v==='normal'));});
        tn.classList.add('hidden');syncDraft();
        var nh=$('notehint');if(nh)nh.textContent=noteText(draft);
        var sm=$('sm-rem');if(sm)sm.textContent=NOTEL[draft.notify];
      });
    }
    $('f-kind').addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b||b.dataset.v===draft.kind)return;
      syncDraft();
      draft.kind=b.dataset.v;
      if(!draft.phrases.length)draft.phrases=[''];
      if(isNew){draft.start=DEF[draft.kind][0];draft.end=DEF[draft.kind][1];accOpen.ph=draft.kind!=='timer';}
      renderHabit();
    });
    var dt=$('dtime');
    if(DEMO){
    dt.addEventListener('change',function(){if(dt.value){demo.time=dt.value;hintUsed=false;toast('Время '+dt.value);}});
    $('dreal').addEventListener('click',function(){demo.time=null;dt.value=fmtMin(nowMin());toast('Реальное время');});
    $('dday').addEventListener('click',function(){demo.offset+=1;hintUsed=false;toast('Следующий день');});
    $('dfast').addEventListener('click',function(){demo.fast=!demo.fast;this.textContent='Таймеры ×60: '+(demo.fast?'вкл':'выкл');});
    }
    bindData();bindPush();
    var del=$('del');
    if(del)del.addEventListener('click',function(){
      if(!del.dataset.sure){del.dataset.sure='1';del.textContent='Точно удалить?';del.classList.add('warn');return;}
      if(tm&&tm.hid===d.id){releaseTimer(tm);timerClear(d.id);tm=null;}
      S.habits=S.habits.filter(function(h){return h.id!==d.id;});
      S.logs=S.logs.filter(function(l){return l.hid!==d.id;});
      S.urges=S.urges.filter(function(u){return u.hid!==d.id;});
      if(!DEMO)Store.delHabit(d.id);S.sel=sorted()[0].id;setTab('today');toast('Удалено');
    });
    $('f-save').addEventListener('click',function(){
      syncDraft();
      var err=$('f-err'),name=draft.name.trim(),tmr=draft.kind==='timer';
      var opn=function(k){var e=document.querySelector('details[data-k="'+k+'"]');if(e)e.open=true;};
      var ph=draft.phrases.map(function(p){return p.trim();}).filter(Boolean);
      if(!name){err.textContent='Назови привычку.';return;}
      if(!draft.start||!draft.end||toMin(draft.end)<=toMin(draft.start)){err.textContent='Окно должно закрываться позже, чем открывается.';return;}
      if(!tmr){
        if(!ph.length){opn('ph');err.textContent='Напиши хотя бы одну фразу.';return;}
        for(var i=0;i<ph.length;i++){if(wordCount(ph[i])<2){opn('ph');err.textContent='Каждая фраза должна быть хотя бы из двух слов.';return;}}
      }
      if(/\[[^\]]*\]/.test(draft.why)||/\[[^\]]*\]/.test(draft.rule)){opn('why');err.textContent='Замени текст в [скобках] в строках «Зачем» и «Что считается».';return;}
      var obj={id:draft.id||newId(),kind:draft.kind,name:name,start:draft.start,end:draft.end,remind:draft.kind==='avoid'?'':draft.remind,phrases:tmr?[]:ph,why:draft.why.trim(),rule:draft.rule.trim(),mode:draft.mode,strict:draft.strict};
      if(tmr)obj.dur=draft.dur;
      if(draft.kind==='count'){obj.goal=draft.goal;obj.unit=(draft.unit||'').trim()||'раз';}
      if(draft.kind==='avoid')obj.notify=draft.notify;
      var nts2=(draft.notifyTexts||[]).map(function(x){return x.trim();}).filter(Boolean).slice(0,Schedule.MAX_TEXTS);
      if(nts2.length)obj.notifyTexts=nts2;
      var wasNew=!draft.id;
      if(!wasNew){S.habits=S.habits.map(function(h){return h.id===obj.id?obj:h;});}
      else{S.habits.push(obj);}
      S.sel=obj.id;if(!DEMO)Store.putHabit(obj);hintUsed=false;setTab('today',true);toast(wasNew?'Привычка добавлена':'Сохранено');
    });
  }

  /* ---------- JOURNAL ---------- */
  function renderLog(){
    var h=cur(),avoid=h.kind==='avoid',timer=h.kind==='timer',count=h.kind==='count';
    var parts=S.logs.filter(function(l){return l.hid===h.id&&l.part;});
    var mine=S.logs.filter(function(l){return l.hid===h.id&&!l.part;}).sort(function(a,b){return a.day<b.day?1:a.day>b.day?-1:0;});
    var ok=mine.filter(function(l){return !l.slip;}),last=ok.slice(0,7),stats='';
    if(count){
      stats='<p class="stats">Закрыто '+lastDays(h.id,14)+' из последних 14 дней · цель '+h.goal+' в день</p>';
    }else if(timer){
      var lim=nowDate();lim.setDate(lim.getDate()-13);var lk=keyOf(lim);
      var recent=ok.filter(function(l){return l.day>=lk;}),mins=recent.reduce(function(a,l){return a+(l.minutes||0);},0);
      stats='<p class="stats">За 14 дней: '+recent.length+' '+plural(recent.length,['сессия','сессии','сессий'])+' · '+mins+' мин</p>';
    }else if(avoid){
      var u=S.urges.filter(function(x){return x.hid===h.id;}).length;
      stats='<p class="stats">Устоял '+lastDays(h.id,14)+' из последних 14 дней · тяг пережито: '+u+'</p>';
    }else if(last.length>=3){
      var nh=last.filter(function(l){return !l.hint;}).length;
      var avg=Math.round(last.reduce(function(s,l){return s+toMin(l.time);},0)/last.length);
      stats='<p class="stats">Последние '+last.length+': без подсказки '+nh+' из '+last.length+', в среднем в '+fmtMin(avg)+'</p>';
    }
    var rows=count?(function(){
      var days={};
      parts.forEach(function(l){(days[l.day]=days[l.day]||{p:[],d:null}).p.push(l.time);});
      mine.forEach(function(l){if(!l.slip)(days[l.day]=days[l.day]||{p:[],d:null}).d=l;});
      return Object.keys(days).sort().reverse().map(function(k){
        var o=days[k],pp=k.split('-'),dd=(+pp[2])+' '+MONTHS[+pp[1]-1].slice(0,3),tt=o.p.slice().sort().join(', ');
        if(o.d)return '<div class="log"><span class="d">'+dd+'</span><span class="t">'+esc(o.d.typed)+'<small>'+(o.d.count||o.p.length)+' из '+h.goal+(tt?' · '+tt:'')+'</small></span></div>';
        return '<div class="log slip"><span class="d">'+dd+'</span><span class="t">Не добрал: '+o.p.length+' из '+h.goal+'<small>'+tt+'</small></span></div>';
      }).join('');
    })():mine.map(function(l){
      var p=l.day.split('-'),dd=(+p[2])+' '+MONTHS[+p[1]-1].slice(0,3);
      if(l.slip)return '<div class="log slip"><span class="d">'+dd+'</span><span class="t">Срыв<small>'+esc(l.time)+'</small></span></div>';
      if(timer)return '<div class="log"><span class="d">'+dd+'</span><span class="t">'+(l.minutes||0)+' мин<small>'+esc(l.time)+'</small></span></div>';
      return '<div class="log"><span class="d">'+dd+'</span><span class="t">'+esc(l.typed)+'<small>'+esc(l.time)+(l.hint?' · с подсказкой':'')+'</small></span></div>';
    }).join('');
    document.getElementById('main').className='';
    document.getElementById('app').innerHTML='<div><h1>'+esc(h.name)+'</h1>'+stats+'</div><div>'+(rows||'<p class="mute">Пока пусто.</p>')+'</div>';
    renderTop();renderRail();
  }

  function setTab(t,center){
    if(t!=='urge'){clearInterval(urgeTimer);urgeTimer=null;}
    tab=t;
    document.getElementById('app').className='page';
    if(t==='today')renderToday(center);
    else if(t==='habit')renderHabit();
    else if(t==='urge')renderUrge();
    else renderLog();
    window.scrollTo(0,0);
  }
  restoreTimer();
  if(S.habits.length)setTab('today',true);else openNew();

  /* ---------- глубокие ссылки: /?habit=ID выбирает привычку, /?urge=ID открывает «Тянет» ---------- */
  function handleLink(href){
    var u;try{u=new URL(href,location.href);}catch(e){return false;}
    var hid=u.searchParams.get('habit'),ug=u.searchParams.get('urge'),id=ug||hid;
    if(!id)return false;
    var h=byId(id);
    if(!h)return true;
    S.sel=h.id;hintUsed=false;
    if(ug)openUrge(h);else setTab('today',true);
    return true;
  }
  if(S.habits.length&&handleLink(location.href)){
    try{history.replaceState(null,'',location.pathname);}catch(e){}
  }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',function(e){
      if(e.data&&e.data.type==='open')handleLink(e.data.url);
    });
  }
  // Для автообновления: страницу можно перезагрузить, только когда пользователь ничего не делает
  window.slovoIdle=function(){
    var ae=document.activeElement;
    return tab==='today'&&!tm&&!urge&&!(ae&&/^(INPUT|TEXTAREA)$/.test(ae.tagName));
  };
})();
