(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.GraphTrialCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.1';
  const NAMES = {1:'一次多項式',2:'二次多項式',3:'三次多項式'};
  const DEFAULTS = {degrees:[1,2], seconds:{1:30,2:30,3:30}, theme:'dark', sound:false};
  function normalizeConfig(input) {
    input = input || {};
    const degrees = [1,2,3].filter(d => Array.isArray(input.degrees) && input.degrees.includes(d));
    const seconds = {};
    for (const d of [1,2,3]) {
      const raw = input.seconds && Number(input.seconds[d]);
      seconds[d] = Number.isFinite(raw) ? Math.min(120,Math.max(10,Math.round(raw/5)*5)) : 30;
    }
    return {degrees:degrees.length?degrees:[1,2], seconds, theme:input.theme==='light'?'light':'dark', sound:!!input.sound};
  }
  const choose = (a,rng) => a[Math.floor(rng()*a.length)];
  function shuffle(a,rng) {
    const out=a.slice();
    for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
    return out;
  }
  const signText = n => n>0?' > 0':n<0?' < 0':' = 0';
  const signedPlain = n => String(n).replace('-','−');
  function numberHTML(n) {
    const abs=Math.abs(n);
    const known={0.5:[1,2],1.5:[3,2],0.25:[1,4],0.75:[3,4]};
    const frac=known[abs];
    const val=frac?'<span class="fraction"><span>'+frac[0]+'</span><span>'+frac[1]+'</span></span>':String(abs);
    return (n<0?'−':'')+val;
  }
  function polynomialHTML(coeffs) {
    let out='';
    for(let power=coeffs.length-1;power>=0;power--){
      const c=coeffs[power]; if(Math.abs(c)<1e-9)continue;
      const symbol=power?'x'+(power>1?'<sup>'+power+'</sup>':''):'';
      out+=(out?(c<0?' − ':' + '):(c<0?'−':''));
      out+=((Math.abs(c)===1&&power)?'':numberHTML(Math.abs(c)))+symbol;
    }
    return out||'0';
  }
  function groupHTML(h) {
    return h===0?'x':'(x '+(h>0?'− ':'+ ')+numberHTML(Math.abs(h))+')';
  }
  function shiftedHTML(f) {
    const g=groupHTML(f.h), power=g+(f.d>1?'<sup>'+f.d+'</sup>':'');
    let out=(f.a<0?'−':'')+(Math.abs(f.a)===1?'':numberHTML(Math.abs(f.a)))+power;
    if(f.d===3&&f.p)out+=(f.p<0?' − ':' + ')+(Math.abs(f.p)===1?'':numberHTML(Math.abs(f.p)))+g;
    if(f.k)out+=(f.k<0?' − ':' + ')+numberHTML(Math.abs(f.k));
    return out;
  }
  function coeffs(f) {
    if(f.d===1)return [f.b,f.m];
    if(f.d===2)return [f.a*f.h*f.h+f.k,-2*f.a*f.h,f.a];
    return [-f.a*f.h*f.h*f.h-f.p*f.h+f.k,3*f.a*f.h*f.h+f.p,-3*f.a*f.h,f.a];
  }
  function equationHTML(f,form) {return f.d===1||form==='expanded'?polynomialHTML(coeffs(f)):shiftedHTML(f);}
  function value(f,x) {return f.d===1?f.m*x+f.b:f.a*Math.pow(x-f.h,f.d)+(f.d===3?f.p*(x-f.h):0)+f.k;}
  function curve(d,a,h,k,p) {return d===1?{d,m:a,b:k}:{d,a,h,k,p:d===3?(p||0):0};}
  function optionQuestion(d,stage,title,stem,condition,options,target,hint,explanation,extra,rng) {
    const decorated=shuffle(options.map((f,i)=>({curve:f,isCorrect:i===target})),rng);
    return Object.assign({d,stage,title,stem,condition,mode:'options',options:decorated.map(x=>x.curve),correct:decorated.findIndex(x=>x.isCorrect),hint,explanation},extra||{});
  }
  function directionQuestion(d,rng) {
    const s=choose([-1,1],rng), a=s*choose([0.5,1,2],rng);
    const f=curve(d,a,0,0,d===3?choose([-2,0,2],rng):0);
    const wrong=curve(d,-a,0,0,d===3?f.p:0);
    const symbol=d===1?'m':'a';
    const condition='<span class="math">'+symbol+signText(a)+'</span>';
    const titles={1:'辨認直線的方向',2:'辨認拋物線的開口',3:'辨認三次曲線的兩端'};
    const stems={1:'哪一張圖符合斜率的條件？',2:'哪一張圖符合最高次項係數的條件？',3:'觀察最左端與最右端，選出相符圖形。'};
    const hints={1:'看 m：正斜率由左至右上升，負斜率則下降。',2:'看 a：a > 0 開口向上；a < 0 開口向下。',3:'a 決定兩端走向；中間即使有轉折，也不會改變兩端方向。'};
    const explanation=d===1?(s>0?'m > 0，直線由左至右上升。':'m < 0，直線由左至右下降。'):d===2?(s>0?'a > 0，所以拋物線開口向上。':'a < 0，所以拋物線開口向下。'):(s>0?'a > 0：最左端向下，最右端向上。':'a < 0：最左端向上，最右端向下。');
    return optionQuestion(d,0,titles[d],stems[d],condition,[f,wrong],0,hints[d],explanation,{},rng);
  }
  function linearFeatures(rng) {
    const m=choose([-2,-1,-0.5,0.5,1,2],rng),b=choose([-2,0,2],rng),other=b===0?choose([-2,2],rng):-b;
    return optionQuestion(1,1,'方向與截距一起看','哪一張圖同時符合這兩個條件？','<span class="math">m'+signText(m)+'<span class="condition-and">且</span>b'+signText(b)+'</span>',[
      curve(1,m,0,b),curve(1,-m,0,b),curve(1,m,0,other),curve(1,-m,0,other)
    ],0,'先用 m 判斷上升或下降，再看直線穿過 y 軸的位置。','m'+signText(m)+'；b'+signText(b)+'，所以 y 軸截距'+(b>0?'在原點上方。':b<0?'在原點下方。':'就是原點。'),{},rng);
  }
  function quadraticFeatures(rng) {
    const a=choose([-1,1],rng),h=choose([-1,1],rng),c=choose([-2,2],rng);
    const make=(hh,cc)=>curve(2,a,hh,cc-a*hh*hh);
    const b=-2*a*h;
    return optionQuestion(2,1,'找出頂點與截距','觀察開口、頂點左右，以及 y 軸交點。','<span class="math">a'+signText(a)+'，ab'+signText(a*b)+'，c'+signText(c)+'</span>',[make(h,c),make(-h,c),make(h,-c),make(-h,-c)],0,
      '頂點 x = −b／(2a)：ab < 0 在右側，ab > 0 在左側。再用 c 看 y 軸截距。',
      'ab'+signText(a*b)+'，頂點在 y 軸'+(h>0?'右':'左')+'側；c'+signText(c)+'，截距在原點'+(c>0?'上':'下')+'方。',{},rng);
  }
  function cubicFeatures(rng) {
    const a=choose([-1,1],rng),kind=choose([-1,0,1],rng),p=2*a*kind,h=choose([-1,1],rng),k=choose([-1,1],rng);
    const others=[-1,0,1].filter(x=>x!==kind);
    const cond='<span class="math">a'+signText(a)+'，'+(kind===0?'p = 0':'ap'+signText(a*p))+'</span><span class="center-condition">對稱中心 ('+signedPlain(h)+'，'+signedPlain(k)+')</span>';
    const expl=kind<0?'ap < 0，曲線有兩個轉折。':kind>0?'ap > 0，曲線沒有轉折，中心附近有傾斜。':'p = 0，中心附近呈水平趨勢，整體仍是三次曲線。';
    return optionQuestion(3,1,'辨認外形與對稱中心','以 a(x − h)³ + p(x − h) + k 判讀。',cond,[curve(3,a,h,k,p),curve(3,a,h,k,2*a*others[0]),curve(3,a,h,k,2*a*others[1]),curve(3,a,-h,-k,p)],0,
      '先看 ap：負值有兩個轉折；正值沒有轉折；p = 0 時中心呈水平趨勢。再核對中心。',expl+' 對稱中心為 ('+signedPlain(h)+'，'+signedPlain(k)+')。',{showCenters:true},rng);
  }
  function widthQuestion(d,rng) {
    const s=choose([-1,1],rng),h=d===1?0:choose([-1,0,1],rng),k=choose([-1,0,1],rng),largest=choose([true,false],rng);
    const curves=shuffle([0.5,1,2].map(a=>curve(d,s*a,h,k,0)),rng);
    const correct=curves.findIndex(f=>Math.abs(d===1?f.m:f.a)===(largest?2:0.5));
    const measure=d===1?'m':'a';
    const title=d===1?'比較直線的陡緩':'比較曲線的寬窄';
    const request=d===1?(largest?'最陡':'最平緩'):(largest?'最窄':'最寬');
    const subtype=d===1?'三條直線的截距相同。':d===2?'三條拋物線的頂點、開口方向相同。':'三條曲線皆為 a(x − h)³ + k，中心、方向相同。';
    return {d,stage:2,mode:'compare',title,stem:subtype,condition:'找出 <strong>'+request+'</strong> 的圖形<span class="condition-sub">也就是 |'+measure+'| '+(largest?'最大':'最小')+' 的一條</span>',curves,correct,
      hint:d===1?'在同一比例下，|m| 越大，直線越陡。':'固定'+(d===2?'頂點':'中心且 p = 0')+'及方向後，|a| 越大，圖形越窄、離開中心後上升或下降越快。',
      explanation:'三條圖形使用完全相同的坐標比例。|'+measure+'| '+(largest?'最大為 2':'最小為 ½')+'，對應圖形'+request+'。',showCenters:d>1};
  }
  function matchingQuestion(d,rng) {
    const s=choose([-1,1],rng),h=choose([-1,1],rng),k=choose([-1,0,1],rng);
    let source;
    if(d===1)source=[curve(1,0.5*s,0,k),curve(1,2*s,0,k),curve(1,-s,0,-k+(k===0?1:0))];
    else if(d===2)source=[curve(2,0.5*s,h,k),curve(2,2*s,h,k),curve(2,-s,-h,-k)];
    else source=[curve(3,0.5*s,h,k,0),curve(3,2*s,h,k,0),curve(3,-s,-h,-k,2*s)];
    source=source.map((f,i)=>Object.assign({id:'f'+i},f));
    const curves=shuffle(source,rng),cards=shuffle(source,rng);
    const correct=cards.map(card=>curves.findIndex(f=>f.id===card.id));
    return {d,stage:3,mode:'match',title:'三圖配對 · 最終試煉',stem:'為每個函數式選擇 A、B 或 C，三組完成後送出。',condition:'每條圖形只能配對一次',curves,cards,correct,
      hint:d===1?'先用斜率方向、截距分組，再比較同方向直線的陡緩。':d===2?'先看開口和頂點左右；同頂點的兩條，再比較最高次項係數的絕對值。':'先看兩端和有無轉折；同中心的兩條純三次曲線，再比較 |a|。',
      explanation:'先辨認方向和位置，再比較同方向圖形的陡緩或寬窄。',showCenters:d===3};
  }
  function createQuestions(config,rng) {
    config=normalizeConfig(config);rng=rng||Math.random;
    const all=[];
    for(const d of config.degrees){
      const features=d===1?linearFeatures(rng):d===2?quadraticFeatures(rng):cubicFeatures(rng);
      const qs=[directionQuestion(d,rng),features,widthQuestion(d,rng),matchingQuestion(d,rng)];
      qs.forEach((q,i)=>{q.id='d'+d+'q'+i;q.limit=config.seconds[d];all.push(q);});
    }
    return all;
  }
  function isComplete(q,answer) {
    if(q.mode==='match')return Array.isArray(answer)&&answer.length===3&&answer.every(x=>Number.isInteger(x)&&x>=0&&x<3)&&new Set(answer).size===3;
    return Number.isInteger(answer)&&answer>=0&&answer<(q.mode==='options'?q.options.length:3);
  }
  function checkAnswer(q,answer) {return isComplete(q,answer)&&(q.mode==='match'?answer.every((x,i)=>x===q.correct[i]):answer===q.correct);}
  class InputGate {
    constructor(){this.active=new Map();this.history=new Map();this.elements=new WeakMap();}
    down(pointerId,target,now){
      if(this.active.has(pointerId))return false;
      this.active.set(pointerId,target);this.history.set(pointerId,now);this.elements.set(target,now);return true;
    }
    end(pointerId,now){
      const target=this.active.get(pointerId);
      if(target&&Number.isFinite(now)){this.history.set(pointerId,now);this.elements.set(target,now);}
      this.active.delete(pointerId);
    }
    acceptClick(target,detail,pointerId,now){
      if(detail===0)return true;
      const elementTime=this.elements.get(target),pointerTime=this.history.get(pointerId);
      return !((elementTime!==undefined&&now-elementTime<1200)||(pointerTime!==undefined&&now-pointerTime<1200));
    }
    reset(){this.active.clear();}
    prune(now){for(const [id,time]of this.history)if(!this.active.has(id)&&now-time>2000)this.history.delete(id);}
  }
  class Session {
    constructor(config,clock,rng) {
      this.config=normalizeConfig(config);this.clock=clock||(()=>performance.now());this.questions=createQuestions(this.config,rng);
      this.phase='idle';this.index=0;this.score=0;this.results=[];this.lockUntil=0;this.wrongCount=0;this.deadline=0;this.lastHint=false;
    }
    get question(){return this.questions[this.index];}
    start(now=this.clock()){this.startedAt=now;this.phase='question';this.openQuestion(now);}
    openQuestion(now){this.phase='question';this.openedAt=now;this.deadline=now+this.question.limit*1000;this.lockUntil=0;this.wrongCount=0;this.lastHint=false;this.outcome=null;}
    remainingMs(now=this.clock()){return Math.max(0,this.deadline-now);}
    remainingSeconds(now=this.clock()){return Math.ceil(this.remainingMs(now)/1000);}
    lockSeconds(now=this.clock()){return Math.max(0,(this.lockUntil-now)/1000);}
    resolve(correct,now,cause) {
      const remaining=correct?this.remainingSeconds(now):0,earned=correct?remaining+10:0;
      this.score+=earned;this.outcome={correct,earned,remaining,cause};
      this.results.push({d:this.question.d,id:this.question.id,correct,earned,wrong:this.wrongCount,elapsedMs:Math.max(0,now-this.openedAt),limit:this.question.limit});
      this.phase='reveal';this.revealUntil=now+(correct?1200:3200);return {type:'reveal',outcome:this.outcome};
    }
    submit(answer,now=this.clock()) {
      if(this.phase!=='question')return {type:'ignored'};
      if(now>=this.deadline)return this.resolve(false,now,'timeout');
      if(now<this.lockUntil)return {type:'locked'};
      if(!isComplete(this.question,answer))return {type:'incomplete'};
      if(checkAnswer(this.question,answer))return this.resolve(true,now,'correct');
      this.wrongCount++;this.deadline-=10000;this.lastHint=true;
      if(now>=this.deadline)return this.resolve(false,now,'penalty');
      this.lockUntil=now+3000;return {type:'wrong',lockUntil:this.lockUntil};
    }
    tick(now=this.clock()) {
      if(this.phase==='question'&&now>=this.deadline)return this.resolve(false,now,'timeout');
      if(this.phase==='reveal'&&now>=this.revealUntil){
        if(this.index===this.questions.length-1){this.phase='finished';this.finishedAt=now;return {type:'finished'};}
        this.index++;this.openQuestion(now);return {type:'question'};
      }
      return null;
    }
    maxScore(){return this.questions.reduce((sum,q)=>sum+q.limit+10,0);}
  }
  return {VERSION,NAMES,DEFAULTS,normalizeConfig,shuffle,numberHTML,polynomialHTML,shiftedHTML,equationHTML,coeffs,value,curve,createQuestions,isComplete,checkAnswer,InputGate,Session};
});
