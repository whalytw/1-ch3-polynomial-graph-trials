(function () {
  'use strict';
  const C=window.GraphTrialCore;
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const letters=['A','B','C','D'];
  const keys={settings:'graph-trials-settings-v1',scores:'graph-trials-scores-v1'};
  function readStorage(key,fallback){try{return JSON.parse(localStorage.getItem(key))||fallback;}catch(_){return fallback;}}
  let storageWarning=false;
  function saveStorage(key,data){try{localStorage.setItem(key,JSON.stringify(data));return true;}catch(_){if(!storageWarning){storageWarning=true;toast('瀏覽器未允許保存資料，本次仍可正常遊玩。');}return false;}}
  let settings=C.normalizeConfig(readStorage(keys.settings,C.DEFAULTS));
  let records=readStorage(keys.scores,[]);if(!Array.isArray(records))records=[];
  records=records.filter(r=>r&&typeof r.name==='string'&&typeof r.score==='number').slice(-120);
  document.body.dataset.theme=settings.theme;
  const towerTitles=['第一試煉塔','第二試煉塔','第三試煉塔'];
  const chapterNames={1:'直線之章',2:'拋物線之章',3:'三次曲線之章'};
  const arena=$('#arena');
  const lanes=[0,1,2].map(id=>({id,session:null,name:'',run:0,answer:null,lockedPairs:[],saved:false}));
  let svgId=0,modal=null,draft=null,toastTimer,hold=null,audioContext=null;
  const touch={counts:[0,0,0],active:new Map(),maximum:0};
  const inputGate=new C.InputGate();
  function toast(message){const box=$('#toast');box.textContent=message;box.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('show'),2400);}
  function towerSVG(id){
    const curves=['M48 148 125 68','M49 80Q87 195 125 80','M47 157C110 157 66 58 129 58'];
    return '<svg class="tower-illustration" viewBox="0 0 180 206" aria-hidden="true"><defs><linearGradient id="arch'+id+'" x2="0" y2="1"><stop stop-color="#d6b67a" stop-opacity=".15"/><stop offset="1" stop-color="#d6b67a" stop-opacity=".01"/></linearGradient></defs><ellipse cx="90" cy="192" rx="66" ry="7" fill="none" stroke="#d6b67a" stroke-opacity=".12"/><path d="m35 176 55-11 55 11-55 17Z" fill="url(#arch'+id+')" stroke="#d6b67a" stroke-opacity=".35"/><path d="M39 173V66Q90-1 141 66v107M48 171V69Q90 12 132 69v102" fill="url(#arch'+id+')" stroke="#d6b67a" stroke-opacity=".53" stroke-width="1.3"/><path d="M35 176h110M48 168h84M43 181h94M28 189h124M36 72h11m86 0h11M38 143h9m86 0h10" stroke="#d6b67a" stroke-opacity=".5"/><path d="M90 41v125M46 130h88" stroke="var(--plot-axis)" stroke-opacity=".35"/><path d="'+curves[id]+'" fill="none" class="tower-curve" stroke-width="2.6" stroke-linecap="round"/><circle cx="90" cy="38" r="4" class="tower-orb"/><path d="m90 4 5 12-5 12-5-12Z" fill="#d6b67a"/><g class="tower-spark" fill="#d6b67a"><path d="m19 76 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/><path d="m155 117 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"/><circle cx="159" cy="57" r="1.5"/><circle cx="22" cy="144" r="1.4"/></g><path d="m70 184 20-4 20 4" fill="none" stroke="#d6b67a" stroke-opacity=".4"/></svg>';
  }
  function laneShell(lane){
    const el=document.createElement('section');el.className='lane';el.dataset.lane=lane.id;el.setAttribute('aria-label','第 '+(lane.id+1)+' 位玩家');
    el.innerHTML='<i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i><div class="lane-head"><span class="seat-medal">'+['I','II','III'][lane.id]+'</span><span class="seat-label">'+towerTitles[lane.id]+'<small>PLAYER 0'+(lane.id+1)+'</small></span><span class="name-label"></span></div><div class="lane-content" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>';
    lane.root=el;lane.content=$('.lane-content',el);arena.appendChild(el);renderStandby(lane);
  }
  function chips(){return [1,2,3].map(d=>'<span class="degree-chip'+(settings.degrees.includes(d)?'':' off')+'">'+['','一次','二次','三次'][d]+(settings.degrees.includes(d)?' · '+settings.seconds[d]+'s':'')+'</span>').join('');}
  function renderStandby(lane){
    $('.name-label',lane.root).textContent='';
    lane.content.innerHTML='<div class="standby">'+towerSVG(lane.id)+'<div class="standby-kicker">YOUR TRIAL AWAITS</div><h2>讓曲線，為你亮起</h2><p class="standby-description">看懂係數的線索，找出正確圖形。<br>完成三圖配對，點亮你的試煉塔。</p><div class="degree-chips">'+chips()+'</div><div class="standby-bottom"><input class="name-input" data-player-name="'+lane.id+'" type="text" maxlength="12" autocomplete="off" aria-label="第 '+(lane.id+1)+' 位玩家姓名或座號" placeholder="姓名／座號（可留空）"><button class="primary-button" data-action="start" data-player="'+lane.id+'">開始闖關<span class="start-arrow">→</span></button><p class="standby-footnote">'+(settings.degrees.length*4)+' 題獨立挑戰 · 每類最後一題為三圖配對<br>答對：剩餘秒數 + 10 分</p></div></div>';
  }
  function chapterTrail(lane){
    const s=lane.session;
    return '<div class="chapter-trail">'+s.config.degrees.map(d=>'<span class="trail-part"><span class="trail-label">'+['','Ⅰ','Ⅱ','Ⅲ'][d]+'</span>'+[0,1,2,3].map(stage=>{
      const i=s.questions.findIndex(q=>q.d===d&&q.stage===stage);
      return '<i class="trail-dot '+(i<s.index?'done':i===s.index?'current':'')+'"></i>';
    }).join('')+'</span>').join('')+'</div>';
  }
  function graphSVG(curves,{multi=false,centers=false,option=false,width=340,height=228}={}){
    const W=Math.max(130,width),H=Math.max(90,height),pad={l:24,r:18,t:19,b:23},bounds={xmin:-3.5,xmax:3.5,ymin:-4.5,ymax:4.5};
    const X=x=>pad.l+(x-bounds.xmin)/(bounds.xmax-bounds.xmin)*(W-pad.l-pad.r),Y=y=>H-pad.b-(y-bounds.ymin)/(bounds.ymax-bounds.ymin)*(H-pad.t-pad.b);
    const clip='clip'+(++svgId),ox=X(0),oy=Y(0);
    let out='<svg class="plot-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+(multi?'三條函數圖形 A、B、C':'候選函數圖形')+'"><defs><clipPath id="'+clip+'"><rect x="'+pad.l+'" y="'+pad.t+'" width="'+(W-pad.l-pad.r)+'" height="'+(H-pad.t-pad.b)+'"/></clipPath></defs>';
    for(let x=-3;x<=3;x++)if(x!==0)out+='<line class="plot-grid" x1="'+X(x)+'" x2="'+X(x)+'" y1="'+pad.t+'" y2="'+(H-pad.b)+'"/>';
    for(let y=-4;y<=4;y++)if(y!==0)out+='<line class="plot-grid" x1="'+pad.l+'" x2="'+(W-pad.r)+'" y1="'+Y(y)+'" y2="'+Y(y)+'"/>';
    out+='<path class="plot-axis" fill="none" d="M'+pad.l+' '+oy+'H'+(W-pad.r)+'m-6-3 6 3-6 3M'+ox+' '+(H-pad.b)+'V'+pad.t+'m-3 6 3-6 3 6"/>';
    for(const x of [-2,2])out+='<text class="plot-tick" text-anchor="middle" x="'+X(x)+'" y="'+(oy+19)+'">'+String(x).replace('-','−')+'</text>';
    for(const y of [-4,-2,2,4])out+='<text class="plot-tick" text-anchor="end" x="'+(ox-6)+'" y="'+(Y(y)+5)+'">'+String(y).replace('-','−')+'</text>';
    out+='<text class="plot-tick" x="'+(ox+6)+'" y="'+(oy+18)+'">O</text><text class="plot-axis-label" x="'+(W-15)+'" y="'+(oy-7)+'">x</text><text class="plot-axis-label" x="'+(ox+8)+'" y="17">y</text>';
    const palette=['var(--curve-a)','var(--curve-b)','var(--curve-c)'],dashes=['','10 5','3 5'];
    curves.forEach((f,i)=>{
      let path='';
      for(let step=0;step<=360;step++){
        const x=bounds.xmin+(bounds.xmax-bounds.xmin)*step/360;
        const yy=Math.max(-1000,Math.min(1000,C.value(f,x)));
        path+=(step?'L':'M')+X(x).toFixed(2)+' '+Y(yy).toFixed(2);
      }
      out+='<path clip-path="url(#'+clip+')" d="'+path+'" fill="none" stroke="'+(multi?palette[i]:'var(--accent)')+'" stroke-width="3.5" stroke-linecap="round"'+(multi&&i?' stroke-dasharray="'+dashes[i]+'"':'')+'/>';
      if(centers&&f.d>1)out+='<circle cx="'+X(f.h)+'" cy="'+Y(f.k)+'" r="4" fill="var(--plot-bg)" stroke="'+(multi?palette[i]:'var(--accent)')+'" stroke-width="2"/>';
    });
    if(multi){
      const used=[];
      curves.forEach((f,i)=>{
        let best=null;
        for(let step=0;step<50;step++){
          const x=-2.85+step*5.7/49,y=C.value(f,x);
          if(y<-3.6||y>3.7||Math.abs(y)<.45)continue;
          const px=X(x),py=Y(y),separation=Math.min(...curves.filter(g=>g!==f).map(g=>Math.abs(Y(Math.max(-8,Math.min(8,C.value(g,x))))-py)));
          const distance=used.length?Math.min(...used.map(p=>Math.hypot(p.x-px,p.y-py))):150;
          const metric=Math.min(separation,55)+Math.min(distance,90)*.55-Math.abs(px-190)*.06;
          if(!best||metric>best.metric)best={x:px,y:py,metric};
        }
        best=best||{x:70+i*90,y:40};
        const xx=Math.min(W-33,Math.max(42,best.x+13)),yy=Math.max(30,Math.min(H-35,best.y-9));used.push({x:xx,y:yy});
        out+='<circle cx="'+xx.toFixed(1)+'" cy="'+yy.toFixed(1)+'" r="12" fill="var(--plot-bg)" stroke="'+palette[i]+'" stroke-width="1.6"/><text x="'+xx.toFixed(1)+'" y="'+(yy+5).toFixed(1)+'" fill="'+palette[i]+'" text-anchor="middle" font-family="Georgia,serif" font-size="16">'+letters[i]+'</text>';
      });
    }
    return out+'</svg>';
  }
  function badge(i){return '<span class="curve-badge" style="color:var(--curve-'+['a','b','c'][i]+')">'+letters[i]+'</span>';}
  function workspaceHTML(lane){
    const q=lane.session.question;
    if(q.mode==='options')return '<div class="graph-options">'+q.options.map((f,i)=>'<button class="graph-option" data-action="choose" data-player="'+lane.id+'" data-value="'+i+'" aria-label="選擇圖形 '+letters[i]+'" aria-pressed="false"><span class="option-label">圖形 '+letters[i]+'<i class="option-circle"></i></span>'+graphSVG([f],{option:true,centers:q.showCenters})+'</button>').join('')+'</div>';
    const plot='<div class="'+(q.mode==='match'?'matching-chart':'comparison-chart')+'"><span class="scale-note">'+(q.mode==='match'?'三條曲線 · 同一坐標平面':'相同比例 · 同位置比較')+'</span>'+graphSVG(q.curves,{multi:true,centers:q.showCenters})+'</div>';
    if(q.mode==='compare')return plot+'<div class="graph-choice-row">'+q.curves.map((f,i)=>'<button class="graph-choice" data-action="choose" data-player="'+lane.id+'" data-value="'+i+'" aria-label="選擇圖形 '+letters[i]+'" aria-pressed="false">'+badge(i)+'<span>圖形 '+letters[i]+'</span></button>').join('')+'</div>';
    return plot+'<div class="match-list">'+q.cards.map((f,row)=>'<div class="match-row" data-row="'+row+'"><span class="math match-equation"><span class="equation-number">'+['①','②','③'][row]+'</span>'+C.equationHTML(f,q.d===2?'expanded':'shifted')+'</span>'+[0,1,2].map(i=>'<button class="match-pick" data-action="pair" data-player="'+lane.id+'" data-row="'+row+'" data-value="'+i+'" aria-label="第 '+(row+1)+' 式配對圖形 '+letters[i]+'" aria-pressed="false">'+letters[i]+'</button>').join('')+'</div>').join('')+'</div>';
  }
  function renderQuestion(lane){
    const s=lane.session,q=s.question;
    lane.answer=q.mode==='match'?[-1,-1,-1]:null;lane.lockedPairs=[false,false,false];
    lane.content.innerHTML=chapterTrail(lane)+'<div class="play-body"><div class="status-bar"><div><div class="chapter-name">'+chapterNames[q.d]+'</div><div class="question-position">第 '+(s.index+1)+' / '+s.questions.length+' 題 · 本章 '+(q.stage+1)+' / 4</div></div><div class="timer-wrap"><span class="timer-clock">'+q.limit+'</span><span class="timer-meta">SECONDS<br>本題倒數</span></div><div class="score-box"><span>'+s.score+'</span><small>POINTS</small></div></div><div class="timer-track"><span></span></div><div class="question-intro"><h2>'+q.title+'</h2><p class="question-stem">'+q.stem+'</p><div class="condition">'+q.condition+'</div></div><div class="question-workspace">'+workspaceHTML(lane)+'</div><div class="feedback" role="status"><span class="feedback-heading">觀察提示</span><span>'+initialTip(q)+'</span></div><div class="action-bar"><button class="primary-button submit-button" data-action="submit" data-player="'+lane.id+'" disabled>請先'+(q.mode==='match'?'完成三組配對':'選擇圖形')+'</button></div></div>';
    fitGraphs(lane);refreshLane(lane,Date.now());
    if(lane.graphObserver)lane.graphObserver.disconnect();
    if(window.ResizeObserver){lane.graphObserver=new ResizeObserver(()=>fitGraphs(lane));lane.graphObserver.observe($('.question-workspace',lane.root));}
  }
  function fitGraphs(lane){
    const s=lane.session;if(!s||!['question','reveal'].includes(s.phase))return;
    const q=s.question,svgs=$$('.question-workspace .plot-svg',lane.root);
    svgs.forEach((svg,index)=>{
      const bounds=svg.getBoundingClientRect(),width=Math.round(bounds.width),height=Math.round(bounds.height);
      if(width<1||height<1||svg.dataset.size===width+'x'+height)return;
      const html=graphSVG(q.mode==='options'?[q.options[index]]:q.curves,{multi:q.mode!=='options',centers:q.showCenters,option:q.mode==='options',width,height});
      const holder=document.createElement('div');holder.innerHTML=html;const replacement=holder.firstElementChild;replacement.dataset.size=width+'x'+height;svg.replaceWith(replacement);
    });
  }
  function initialTip(q){return q.mode==='match'?'直接點選每一列的 A／B／C，可隨時更換。':q.stage===2?'已固定坐標比例，請直接比較圖形。':'先選圖，再按確認；選取本身不扣時間。';}
  function hintMarkup(q){return esc(q.hint).replace('−b／(2a)','<span class="math fraction"><span>−b</span><span>2a</span></span>');}
  function startRun(lane){
    const input=$('[data-player-name="'+lane.id+'"]',lane.root);
    lane.run++;lane.name=(input?input.value:'').trim().slice(0,12)||'玩家 '+(lane.id+1)+'－'+lane.run;
    $('.name-label',lane.root).textContent=lane.name;
    lane.session=new C.Session(settings,()=>Date.now());lane.session.start();lane.saved=false;
    renderQuestion(lane);sound('start',lane.session.config.sound);
  }
  function selectChoice(lane,value){
    if(!lane.session||lane.session.phase!=='question')return;
    lane.answer=value;updateSelections(lane);refreshLane(lane,Date.now());
  }
  function selectPair(lane,row,value){
    if(!lane.session||lane.session.phase!=='question'||lane.lockedPairs[row])return;
    const other=lane.answer.indexOf(value);
    if(other!==-1&&other!==row){if(lane.lockedPairs[other]){toast('這條圖形已與正確答案配對，請選另一條。');return;}lane.answer[other]=-1;}
    lane.answer[row]=value;updateSelections(lane);refreshLane(lane,Date.now());
  }
  function updateSelections(lane){
    const q=lane.session.question;
    if(q.mode==='match'){
      $$('.match-pick',lane.root).forEach(b=>{const row=Number(b.dataset.row),selected=lane.answer[row]===Number(b.dataset.value);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=lane.lockedPairs[row];b.classList.toggle('correct-pair',selected&&lane.lockedPairs[row]);});
      $$('.match-row',lane.root).forEach(row=>row.classList.toggle('correct-pair',!!lane.lockedPairs[Number(row.dataset.row)]));
    }else $$('.graph-option,.graph-choice',lane.root).forEach(b=>{const selected=Number(b.dataset.value)===lane.answer;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
  }
  function submit(lane){
    const s=lane.session;if(!s)return;
    const outcome=s.submit(lane.answer);
    if(outcome.type==='wrong'){
      const feedback=$('.feedback',lane.root);feedback.className='feedback wrong';feedback.innerHTML='<span class="feedback-heading">答錯 −10 秒</span><span>鎖定送出 3 秒，仍可修改選擇。</span><span class="feedback-hint">'+hintMarkup(s.question)+'</span>';
      if(s.question.mode==='match'){lane.lockedPairs=lane.answer.map((v,i)=>v===s.question.correct[i]);updateSelections(lane);}
      sound('wrong',s.config.sound);refreshLane(lane,Date.now());
    }else if(outcome.type==='reveal')renderReveal(lane);
    else if(outcome.type==='incomplete')toast('請先完成這一題的選擇。');
  }
  function renderReveal(lane){
    const s=lane.session,q=s.question,result=s.outcome;
    const feedback=$('.feedback',lane.root);feedback.className='feedback '+(result.correct?'success':'wrong');
    const heading=result.correct?'判讀正確':result.cause==='penalty'?'扣秒後時間歸零':'本題時間到';
    let answerText='';
    if(q.mode==='match')answerText=q.correct.map((x,i)=>['①','②','③'][i]+' → '+letters[x]).join('　');
    else answerText='正確答案：圖形 '+letters[q.correct];
    feedback.innerHTML='<span class="feedback-heading">'+heading+'</span><span>'+answerText+'</span><span class="feedback-hint">'+esc(q.explanation)+'</span>';
    if(q.mode==='match'){
      $$('.match-pick',lane.root).forEach(b=>{const row=+b.dataset.row,value=+b.dataset.value;b.disabled=true;b.classList.remove('selected');b.classList.toggle('correct-pair',q.correct[row]===value);});
      $$('.match-row',lane.root).forEach(r=>r.classList.add('correct-pair'));
    }else $$('.graph-option,.graph-choice',lane.root).forEach(b=>{const i=+b.dataset.value;b.disabled=true;b.classList.toggle('answer-correct',i===q.correct);b.classList.toggle('answer-wrong',lane.answer===i&&i!==q.correct);});
    $('.score-box>span',lane.root).textContent=s.score;
    $('.action-bar',lane.root).innerHTML='<div class="reveal-chip '+(result.correct?'is-correct':'')+'">'+(result.correct?'本題獲得 <strong>+'+result.earned+'</strong> 分':'本題 0 分 · 正解展示後自動下一題')+'</div>';
    lane.root.classList.add('reveal-flash');setTimeout(()=>lane.root.classList.remove('reveal-flash'),650);
    if(result.correct){const pop=document.createElement('span');pop.className='score-pop';pop.textContent='+'+result.earned;lane.root.appendChild(pop);setTimeout(()=>pop.remove(),1150);}
    sound(result.correct?'correct':'timeout',s.config.sound);refreshLane(lane,Date.now());
  }
  function refreshLane(lane,now){
    const s=lane.session;if(!s||!['question','reveal'].includes(s.phase))return;
    const remaining=s.phase==='reveal'?(s.outcome.correct?s.outcome.remaining:0):s.remainingSeconds(now);
    const timer=$('.timer-clock',lane.root);if(timer&&timer.textContent!==String(remaining))timer.textContent=remaining;
    const bar=$('.timer-track>span',lane.root);if(bar)bar.style.transform='scaleX('+Math.min(1,(s.phase==='reveal'?remaining:s.remainingMs(now)/1000)/s.question.limit)+')';
    lane.root.classList.toggle('urgent',s.phase==='question'&&remaining<=10);
    if(s.phase==='question'){
      const b=$('.submit-button',lane.root);if(!b)return;
      const lock=s.lockSeconds(now),complete=C.isComplete(s.question,lane.answer),locked=lock>0;
      b.disabled=locked||!complete;b.classList.toggle('cooldown',locked);
      const text=locked?'冷卻 '+lock.toFixed(1)+' 秒 · 暫停送出':complete?'確認答案 →':'請先'+(s.question.mode==='match'?'完成三組配對':'選擇圖形');
      if(b.textContent!==text)b.textContent=text;
    }
  }
  function finishRun(lane){
    if(lane.graphObserver)lane.graphObserver.disconnect();
    const s=lane.session,correct=s.results.filter(r=>r.correct).length,wrong=s.results.reduce((a,r)=>a+r.wrong,0),elapsed=Math.round((s.finishedAt-s.startedAt)/1000);
    if(!lane.saved){
      lane.saved=true;
      const record={date:new Date().toISOString(),name:lane.name,player:lane.id+1,degrees:s.config.degrees,seconds:s.config.seconds,score:s.score,maxScore:s.maxScore(),correct,total:s.questions.length,wrong,elapsed,chapters:s.config.degrees.map(d=>({d,score:s.results.filter(r=>r.d===d).reduce((a,r)=>a+r.earned,0)}))};
      records.push(record);records=records.slice(-120);saveStorage(keys.scores,records);
    }
    lane.root.classList.remove('urgent');
    lane.content.innerHTML='<div class="results-body"><div class="results-kicker" style="margin-top:16px">TRIAL COMPLETE</div><h2 class="results-title">'+esc(lane.name)+'，試煉完成</h2><input class="name-input" data-player-name="'+lane.id+'" type="text" maxlength="12" autocomplete="off" aria-label="下一位玩家姓名或座號" placeholder="下一位姓名／座號（可留空）"><button class="primary-button" data-action="start" data-player="'+lane.id+'">下一位開始<span class="start-arrow">→</span></button><div class="result-emblem" aria-hidden="true">✧</div><div class="result-score">'+s.score+'<small>/ '+s.maxScore()+' 分</small></div><p class="result-detail">答對 '+correct+' / '+s.questions.length+' 題　·　答錯 '+wrong+' 次<br>本次用時 '+duration(elapsed)+'</p><div class="result-chapters">'+s.config.degrees.map(d=>{const list=s.results.filter(r=>r.d===d);return '<div class="result-chapter"><strong>'+C.NAMES[d]+'</strong><span>'+list.filter(r=>r.correct).length+' / 4 題</span><span class="chapter-points">'+list.reduce((a,r)=>a+r.earned,0)+'<small style="font:10px system-ui;margin-left:4px">分</small></span></div>';}).join('')+'</div><p class="record-notice">成績已記錄，可由教師工具匯出。<br>此區可以直接換人，其他兩區持續進行。</p></div>';
  }
  function duration(seconds){return Math.floor(seconds/60)+' 分 '+String(seconds%60).padStart(2,'0')+' 秒';}
  function sound(kind,enabled){
    if(!enabled)return;
    try{
      audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();
      const now=audioContext.currentTime,notes=kind==='correct'?[660,880]:kind==='start'?[440,660]:[220];
      notes.forEach((f,i)=>{const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(audioContext.destination);g.gain.setValueAtTime(.0001,now+i*.09);g.gain.exponentialRampToValueAtTime(.035,now+i*.09+.015);g.gain.exponentialRampToValueAtTime(.0001,now+i*.09+.2);o.start(now+i*.09);o.stop(now+i*.09+.21);});
    }catch(_){}
  }
  function openTeacher(tab='settings'){
    if(modal)return;draft=C.normalizeConfig(settings);modal={tab};renderModal();
    const close=$('.close-modal');if(close)close.focus({preventScroll:true});
  }
  function closeTeacher(save=false){
    if(save){settings=C.normalizeConfig(draft);saveStorage(keys.settings,settings);lanes.filter(l=>!l.session).forEach(renderStandby);toast('設定已儲存，下一位開始時套用。');}
    document.body.dataset.theme=settings.theme;$('#modal-root').innerHTML='';modal=null;draft=null;resetTouchActive();$('#teacher-trigger').focus({preventScroll:true});
  }
  function renderModal(){
    if(!modal)return;
    $('#modal-root').innerHTML='<div class="modal-backdrop"><section class="teacher-modal" role="dialog" aria-modal="true" aria-labelledby="teacher-title"><header class="modal-header"><div><div class="eyebrow">TEACHER’S DESK</div><h2 id="teacher-title">教師工具</h2></div><button class="close-modal" data-action="close-modal" aria-label="關閉教師工具">×</button></header><nav class="modal-tabs">'+[['settings','題目設定'],['scores','成績紀錄'],['touch','觸控測試'],['rules','玩法說明']].map(([id,label])=>'<button class="modal-tab '+(modal.tab===id?'active':'')+'" data-action="tab" data-tab="'+id+'">'+label+'</button>').join('')+'</nav><div class="modal-content">'+modalContent()+'</div><footer class="modal-footer"><span class="modal-footer-note">設定只套用下一位。<br>正在作答的倒數持續進行。</span><div style="display:flex;gap:8px"><button class="pill-button" data-action="fullscreen">'+(document.fullscreenElement?'離開全螢幕':'進入全螢幕')+'</button><button class="primary-button" data-action="save-settings">儲存並關閉</button></div></footer></section></div>';
  }
  function estimateText(){
    const count=draft.degrees.length*4,secs=draft.degrees.reduce((a,d)=>a+draft.seconds[d]*4,0);
    return '目前共 <strong>'+count+' 題</strong>；作答時間上限 '+duration(secs)+'。<br>含正解展示，最長約 '+duration(secs+count*3)+'；答得快或被扣秒會提前結束。';
  }
  function modalContent(){
    if(modal.tab==='settings')return '<p class="modal-description">勾選本次要複習的多項式，每類固定四題，最後一題為三圖配對。<br>每題秒數可分別設定；答錯扣十秒，並鎖定送出三秒。</p>'+[1,2,3].map(d=>'<div class="settings-row"><button class="degree-toggle '+(draft.degrees.includes(d)?'enabled':'')+'" data-action="degree" data-degree="'+d+'" aria-label="啟用'+C.NAMES[d]+'" aria-pressed="'+draft.degrees.includes(d)+'">'+(draft.degrees.includes(d)?'✓':'')+'</button><div class="setting-label">'+C.NAMES[d]+'<small>'+['','方向／截距／陡緩／配對','開口／頂點／寬窄／配對','兩端／外形與中心／寬窄／配對'][d]+'</small></div><div class="time-stepper '+(draft.degrees.includes(d)?'':'disabled')+'"><button class="step-button" data-action="seconds" data-degree="'+d+'" data-delta="-5" aria-label="'+C.NAMES[d]+'減少五秒" '+(!draft.degrees.includes(d)||draft.seconds[d]<=10?'disabled':'')+'>−</button><span class="step-value" data-seconds="'+d+'">'+draft.seconds[d]+' 秒</span><button class="step-button" data-action="seconds" data-degree="'+d+'" data-delta="5" aria-label="'+C.NAMES[d]+'增加五秒" '+(!draft.degrees.includes(d)||draft.seconds[d]>=120?'disabled':'')+'>+</button></div></div>').join('')+'<div class="settings-options"><span>畫面主題</span><button class="pill-button '+(draft.theme==='dark'?'active':'')+'" data-action="theme" data-theme="dark">午夜藍金</button><button class="pill-button '+(draft.theme==='light'?'active':'')+'" data-action="theme" data-theme="light">象牙白金</button><button class="pill-button '+(draft.sound?'active':'')+'" data-action="sound">音效 '+(draft.sound?'開啟':'關閉')+'</button></div><p class="estimate">'+estimateText()+'</p>';
    if(modal.tab==='scores')return '<div class="score-tools"><span>保留此瀏覽器最近 '+records.length+' 筆成績</span><button class="pill-button" data-action="export-scores" '+(!records.length?'disabled':'')+'>匯出成績 CSV</button></div>'+(records.length?'<div class="scores-table-wrap"><table class="scores-table"><thead><tr><th>時間</th><th>姓名／座號</th><th>題目類別</th><th>得分</th><th>答對</th><th>答錯</th></tr></thead><tbody>'+records.slice().reverse().map(r=>'<tr><td>'+esc(new Date(r.date).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}))+'</td><td>'+esc(r.name)+'</td><td>'+esc((r.degrees||[]).map(d=>['','一','二','三'][d]+'次').join('、'))+'</td><td>'+r.score+' / '+r.maxScore+'</td><td>'+r.correct+' / '+r.total+'</td><td>'+r.wrong+'</td></tr>').join('')+'</tbody></table></div><p class="modal-description" style="margin-top:15px">比較分數時，請使用相同題目類別及秒數設定。</p>':'<div class="empty-scores">完成一次闖關後，成績會記錄在這裡。</div>');
    if(modal.tab==='touch')return '<p class="modal-description">請三位同學同時點按下方三區，也可快速交錯連按。這裡只測試觸點接收，不影響成績。</p><div class="touch-tests">'+[0,1,2].map(i=>'<div class="touch-pad" data-touch-pad="'+i+'"><span>第 '+(i+1)+' 區</span><strong data-touch-count="'+i+'">'+touch.counts[i]+'</strong><span>次接收</span></div>').join('')+'</div><p class="touch-summary">目前同時觸點 <strong data-touch-current>0</strong> 個　／　最多同時 <strong data-touch-maximum>'+touch.maximum+'</strong> 個<br>可比較不同連線方式下，三區是否都有收到觸點。</p>';
    return '<div class="rules-grid"><div class="rule-card"><strong>每人獨立闖關</strong>各區有自己的題目、倒數與成績。完成後，可直接讓下一位開始，不用等另外兩人。</div><div class="rule-card"><strong>答對如何得分</strong>送出當下的剩餘整秒 + 10 分。畫面顯示 23 秒答對，即得 33 分。</div><div class="rule-card"><strong>答錯與冷卻</strong>每次送出答錯扣 10 秒，提示出現後鎖定送出 3 秒。倒數持續；冷卻中可以修改選擇。</div><div class="rule-card"><strong>時間歸零</strong>自然倒數至 0，或扣秒後為 0／負值，都直接展示答案，這題不給分。</div><div class="rule-card"><strong>三圖配對</strong>每列直接選 A、B 或 C，一條曲線只能用一次。三組全部正確才給分；答錯只扣一次 10 秒。</div><div class="rule-card"><strong>看懂寬窄</strong>比較圖都使用相同坐標比例。二次固定頂點，三次寬窄題固定中心且 p = 0，再比較 |a|。</div></div>';
  }
  function exportScores(){
    const quote=value=>{let v=String(value??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
    const rows=[['時間','姓名／座號','區域','題目類別','一次秒數','二次秒數','三次秒數','總分','滿分','答對題數','總題數','答錯次數','用時秒數']];
    records.forEach(r=>rows.push([new Date(r.date).toLocaleString('zh-TW'),r.name,r.player,(r.degrees||[]).map(d=>C.NAMES[d]).join('、'),r.seconds?.[1],r.seconds?.[2],r.seconds?.[3],r.score,r.maxScore,r.correct,r.total,r.wrong,r.elapsed]));
    const blob=new Blob(['\ufeff'+rows.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='函數圖形試煉塔_成績_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();renderModal();}catch(_){toast('請使用瀏覽器的全螢幕按鈕或 F11。');}}
  function handleAction(button){
    if(button.disabled)return;
    const action=button.dataset.action,lane=lanes[+button.dataset.player];
    if(action==='start'){startRun(lane);return;}
    if(action==='choose'){selectChoice(lane,+button.dataset.value);return;}
    if(action==='pair'){selectPair(lane,+button.dataset.row,+button.dataset.value);return;}
    if(action==='submit'){submit(lane);return;}
    if(action==='close-modal'){closeTeacher();return;}
    if(action==='save-settings'){closeTeacher(true);return;}
    if(action==='tab'){modal.tab=button.dataset.tab;resetTouchActive();renderModal();return;}
    if(action==='degree'){
      const d=+button.dataset.degree;
      if(draft.degrees.includes(d)){if(draft.degrees.length===1){toast('至少保留一種多項式。');return;}draft.degrees=draft.degrees.filter(x=>x!==d);}else draft.degrees.push(d);
      draft.degrees.sort();renderModal();return;
    }
    if(action==='seconds'){
      const d=+button.dataset.degree;draft.seconds[d]=Math.min(120,Math.max(10,draft.seconds[d]+(+button.dataset.delta)));
      $('[data-seconds="'+d+'"]').textContent=draft.seconds[d]+' 秒';
      $$('[data-action="seconds"][data-degree="'+d+'"]').forEach(b=>b.disabled=(+b.dataset.delta<0&&draft.seconds[d]<=10)||(+b.dataset.delta>0&&draft.seconds[d]>=120));
      $('.estimate').innerHTML=estimateText();return;
    }
    if(action==='theme'){draft.theme=button.dataset.theme;document.body.dataset.theme=draft.theme;renderModal();return;}
    if(action==='sound'){draft.sound=!draft.sound;sound('correct',draft.sound);renderModal();return;}
    if(action==='export-scores'){exportScores();return;}
    if(action==='fullscreen'){fullscreen();}
  }
  function beginHold(e){
    if(hold||modal)return;e.preventDefault();const b=$('#teacher-trigger');
    hold={pointerId:e.pointerId,x:e.clientX,y:e.clientY,button:b,fired:false};b.classList.add('holding');try{b.setPointerCapture(e.pointerId);}catch(_){}
    hold.timer=setTimeout(()=>{if(hold){hold.fired=true;b.classList.remove('holding');openTeacher();}},1500);
  }
  function cancelHold(){if(hold){clearTimeout(hold.timer);hold.button.classList.remove('holding');hold=null;}}
  function updateTouch(){
    if(!modal||modal.tab!=='touch')return;
    touch.counts.forEach((v,i)=>{const el=$('[data-touch-count="'+i+'"]');if(el)el.textContent=v;const pad=$('[data-touch-pad="'+i+'"]');if(pad)pad.classList.toggle('pressed',Array.from(touch.active.values()).includes(i));});
    const current=$('[data-touch-current]'),maximum=$('[data-touch-maximum]');if(current)current.textContent=touch.active.size;if(maximum)maximum.textContent=touch.maximum;
  }
  function resetTouchActive(){touch.active.clear();updateTouch();}
  function pointerDown(e){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const teacher=e.target.closest('#teacher-trigger');if(teacher){beginHold(e);return;}
    const pad=e.target.closest('[data-touch-pad]');
    if(pad){e.preventDefault();if(!touch.active.has(e.pointerId)){const id=+pad.dataset.touchPad;touch.counts[id]++;touch.active.set(e.pointerId,id);touch.maximum=Math.max(touch.maximum,touch.active.size);try{$('#modal-root').setPointerCapture(e.pointerId);}catch(_){}updateTouch();}return;}
    const button=e.target.closest('button[data-action]');if(!button||button.disabled)return;
    if(!inputGate.down(e.pointerId,button,Date.now()))return;
    e.preventDefault();
    try{(button.closest('.teacher-modal')?$('#modal-root'):arena).setPointerCapture(e.pointerId);}catch(_){}
    handleAction(button);
  }
  function pointerEnd(e){
    inputGate.end(e.pointerId,Date.now());
    if(hold&&hold.pointerId===e.pointerId)cancelHold();
    if(touch.active.delete(e.pointerId))updateTouch();
  }
  document.addEventListener('pointerdown',pointerDown,{passive:false});
  document.addEventListener('pointermove',e=>{if(hold&&hold.pointerId===e.pointerId&&Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>14)cancelHold();},{passive:true});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,pointerEnd);
  document.addEventListener('click',e=>{
    const teacher=e.target.closest('#teacher-trigger');if(teacher){if(e.detail===0)openTeacher();e.preventDefault();return;}
    const button=e.target.closest('button[data-action]');if(!button||button.disabled)return;
    if(!inputGate.acceptClick(button,e.detail,e.pointerId,Date.now())){e.preventDefault();return;}
    e.preventDefault();handleAction(button);
  });
  // Pointer Events are the primary input path; older WebViews retain multi-touch support.
  if(!window.PointerEvent){
    document.addEventListener('touchstart',e=>{
      for(const t of e.changedTouches)pointerDown({target:t.target,pointerId:10000+t.identifier,pointerType:'touch',button:0,clientX:t.clientX,clientY:t.clientY,preventDefault:()=>e.preventDefault()});
    },{passive:false});
    document.addEventListener('touchmove',e=>{for(const t of e.changedTouches)if(hold&&hold.pointerId===10000+t.identifier&&Math.hypot(t.clientX-hold.x,t.clientY-hold.y)>14)cancelHold();},{passive:true});
    for(const type of ['touchend','touchcancel'])document.addEventListener(type,e=>{for(const t of e.changedTouches)pointerEnd({pointerId:10000+t.identifier});},{passive:true});
    document.addEventListener('mousedown',e=>{if(e.target.closest('#teacher-trigger'))beginHold({preventDefault:()=>e.preventDefault(),pointerId:1,clientX:e.clientX,clientY:e.clientY});});
    document.addEventListener('mouseup',cancelHold);
  }
  document.addEventListener('contextmenu',e=>{if(e.target.closest('#arena,#teacher-trigger,.teacher-modal')&&!e.target.closest('input'))e.preventDefault();});
  document.addEventListener('dragstart',e=>{if(e.target.closest('#arena,.teacher-modal'))e.preventDefault();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&modal){e.preventDefault();closeTeacher();return;}
    if(e.key==='Tab'&&modal){const focusable=$$('button:not(:disabled),input', $('.teacher-modal'));if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    if(e.key==='Enter'&&e.target.matches('[data-player-name]')){e.preventDefault();startRun(lanes[+e.target.dataset.playerName]);}
  });
  function releaseAll(){inputGate.reset();cancelHold();resetTouchActive();}
  window.addEventListener('blur',releaseAll);document.addEventListener('visibilitychange',releaseAll);
  lanes.forEach(laneShell);
  let previousFrame=0;
  function frame(timestamp){
    if(timestamp-previousFrame>75){
      previousFrame=timestamp;const now=Date.now();
      for(const lane of lanes){
        const s=lane.session;if(!s||s.phase==='finished')continue;
        const transition=s.tick(now);
        if(transition){if(transition.type==='reveal')renderReveal(lane);else if(transition.type==='question')renderQuestion(lane);else if(transition.type==='finished')finishRun(lane);}
        refreshLane(lane,now);
      }
      inputGate.prune(now);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
