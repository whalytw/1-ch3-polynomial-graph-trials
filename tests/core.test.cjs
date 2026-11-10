'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js');
function seeded(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const config={degrees:[1,2,3],seconds:{1:30,2:30,3:30}};
const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function compareSign(value,op){return op==='>'?value>0:op==='<'?value<0:value===0;}
function independentFeatureTruth(q,f){
  const condition=q.condition;
  if(q.d===1){const m=condition.match(/m ([><=]) 0/)[1],b=condition.match(/b ([><=]) 0/)[1];return compareSign(f.m,m)&&compareSign(f.b,b);}
  if(q.d===2){const a=condition.match(/a ([><=]) 0/)[1],ab=condition.match(/ab ([><=]) 0/)[1],c=condition.match(/c ([><=]) 0/)[1];return compareSign(f.a,a)&&compareSign(f.a*(-2*f.a*f.h),ab)&&compareSign(f.a*f.h*f.h+f.k,c);}
  const a=condition.match(/a ([><=]) 0/)[1],p=condition.match(/ap ([><=]) 0/),center=condition.match(/對稱中心 \(([^，]+)，([^\)]+)\)/);
  return compareSign(f.a,a)&&(p?compareSign(f.a*f.p,p[1]):f.p===0)&&f.h===Number(center[1].replace('−','-'))&&f.k===Number(center[2].replace('−','-'));
}
test('default configuration, separate timers, and detached snapshots',()=>{
  assert.deepEqual(C.normalizeConfig().degrees,[1,2]);
  assert.deepEqual(C.normalizeConfig().seconds,{1:30,2:30,3:30});
  const input={degrees:[3],seconds:{1:12,2:1000,3:5}};const s=new C.Session(input,()=>0,seeded(2));
  assert.deepEqual(s.config.seconds,{1:10,2:120,3:10});input.degrees.push(1);input.seconds[3]=90;
  assert.deepEqual(s.config.degrees,[3]);assert.equal(s.config.seconds[3],10);
});
test('2,000 randomized runs: every graph question has one mathematically valid answer',()=>{
  for(let seed=1;seed<=2000;seed++){
    const questions=C.createQuestions(config,seeded(seed));assert.equal(questions.length,12);
    for(const d of [1,2,3]){
      const qs=questions.filter(q=>q.d===d);assert.deepEqual(qs.map(q=>q.stage),[0,1,2,3]);assert.equal(qs.at(-1).mode,'match');
      const dir=qs[0],s=dir.condition.includes('&gt;')||dir.condition.includes(' > ')?1:-1;
      const actual=dir.options.map(f=>(d===1?f.m:f.a)*s>0);assert.equal(actual.filter(Boolean).length,1);assert.equal(actual[dir.correct],true);
      const feature=qs[1],truth=feature.options.map(f=>independentFeatureTruth(feature,f));assert.equal(truth.filter(Boolean).length,1);assert.equal(truth[feature.correct],true);
      const width=qs[2],magnitudes=width.curves.map(f=>Math.abs(d===1?f.m:f.a));
      const expected=width.condition.includes('最大')?Math.max(...magnitudes):Math.min(...magnitudes);assert.equal(magnitudes[width.correct],expected);
      if(d>1){assert.equal(new Set(width.curves.map(f=>f.h+','+f.k)).size,1);if(d===3)assert(width.curves.every(f=>f.p===0));}
      const match=qs[3];assert.equal(permutations.filter(p=>C.checkAnswer(match,p)).length,1);
      match.cards.forEach((f,i)=>{for(const x of [-2,-.3,0,.7,2])assert.equal(C.value(f,x),C.value(match.curves[match.correct[i]],x));});
      for(const q of qs)for(const f of q.options||q.curves){
        const coefficients=C.coeffs(f);
        for(const x of [-2,-.4,0,.8,2]){
          const expanded=coefficients.reduce((sum,c,p)=>sum+c*x**p,0);
          assert(Math.abs(expanded-C.value(f,x))<1e-8);assert(Number.isFinite(expanded));
        }
        assert(!C.equationHTML(f,'expanded').includes('NaN'));
      }
    }
  }
});
test('wrong answers subtract ten seconds and lock submission for exactly three seconds',()=>{
  let now=0;const s=new C.Session(config,()=>now,seeded(3));s.start();
  const wrong=(s.question.correct+1)%s.question.options.length;
  now=7000;assert.equal(s.submit(wrong).type,'wrong');assert.equal(s.remainingSeconds(),13);assert.equal(s.lockUntil,10000);assert.equal(s.wrongCount,1);
  now=9999;assert.equal(s.submit(s.question.correct).type,'locked');assert.equal(s.submit(wrong).type,'locked');assert.equal(s.wrongCount,1);
  now=10000;assert.equal(s.submit(s.question.correct).type,'reveal');assert.equal(s.score,20);assert.equal(s.results.length,1);
  assert.equal(s.submit(s.question.correct).type,'ignored');assert.equal(s.score,20);
});
test('penalty timeout bypasses cooldown, reveals answer, awards zero',()=>{
  for(const at of [20000,25000,29999]){
    let now=0;const s=new C.Session(config,()=>now,seeded(4));s.start();now=at;
    const out=s.submit((s.question.correct+1)%s.question.options.length);
    assert.equal(out.type,'reveal');assert.equal(out.outcome.cause,'penalty');assert.equal(s.score,0);assert.equal(s.phase,'reveal');
  }
});
test('deadline wins over a late correct answer; displayed whole seconds and score agree',()=>{
  for(const [at,score]of [[0,40],[7001,33],[29999,11],[30000,0],[31000,0]]){
    let now=0;const s=new C.Session(config,()=>now,seeded(5));s.start();now=at;
    const displayed=s.remainingSeconds();s.submit(s.question.correct);
    assert.equal(s.score,score);if(at<30000)assert.equal(score,displayed+10);
  }
});
test('timer continues through cooldown and background gaps',()=>{
  let now=0;const s=new C.Session(config,()=>now,seeded(6));s.start();now=18500;s.submit((s.question.correct+1)%2);
  assert.equal(s.remainingSeconds(),2);now=20000;s.tick();assert.equal(s.phase,'reveal');assert.equal(s.outcome.correct,false);
  now=90000;s.tick();assert.equal(s.phase,'question');assert.equal(s.index,1);assert.equal(s.remainingSeconds(),30);
});
test('three sessions never share locks, timers, scores, or progress',()=>{
  let now=0;const sessions=[1,2,3].map(seed=>new C.Session(config,()=>now,seeded(seed)));sessions.forEach(s=>s.start());now=1000;
  sessions[0].submit((sessions[0].question.correct+1)%2);sessions[1].submit(sessions[1].question.correct);
  assert.equal(sessions[0].remainingSeconds(),19);assert.equal(sessions[0].lockSeconds(),3);
  assert.equal(sessions[1].score,39);assert.equal(sessions[1].phase,'reveal');assert.equal(sessions[2].phase,'question');assert.equal(sessions[2].remainingSeconds(),29);assert.equal(sessions[2].lockUntil,0);
  now=2500;sessions.forEach(s=>s.tick());assert.equal(sessions[1].index,1);assert.equal(sessions[0].index,0);assert.equal(sessions[2].index,0);
});
test('pairing is scored once as one question; incomplete selections do not penalize',()=>{
  let now=0;const s=new C.Session({degrees:[1],seconds:{1:30}},()=>now,seeded(7));s.start();
  for(let i=0;i<3;i++){s.submit(s.question.correct);now+=1201;s.tick();}
  assert.equal(s.question.mode,'match');const scoreBefore=s.score;
  assert.equal(s.submit([-1,0,1]).type,'incomplete');assert.equal(s.wrongCount,0);
  const wrong=permutations.find(p=>!C.checkAnswer(s.question,p));assert.equal(s.submit(wrong).type,'wrong');assert.equal(s.wrongCount,1);
  now+=3000;s.submit(s.question.correct.slice());assert.equal(s.score-scoreBefore,27);
  now+=1201;s.tick();assert.equal(s.phase,'finished');assert.equal(s.results.length,4);
});
test('three overlapping pointer IDs, rapid alternating taps, and click deduplication',()=>{
  const g=new C.InputGate(),a={},b={},c={};
  assert.equal(g.down(1,a,100),true);assert.equal(g.down(2,b,101),true);assert.equal(g.down(3,c,102),true);assert.equal(g.active.size,3);
  assert.equal(g.down(2,b,103),false);assert.equal(g.acceptClick(b,1,2,104),false);
  g.end(2);assert.equal(g.down(2,b,105),true);g.end(2);assert.equal(g.down(4,a,106),true);
  assert.equal(g.acceptClick(a,1,4,107),false);assert.equal(g.acceptClick(a,0,-1,108),true);
  // A following click retargeted to a newly rendered element must also be consumed.
  assert.equal(g.acceptClick({},1,4,109),false);
  g.end(1);g.end(3);g.end(4);assert.equal(g.active.size,0);
  assert.equal(g.down(3,c,110),true);g.reset();assert.equal(g.active.size,0);assert.equal(g.down(3,c,111),true);
  assert.equal(g.acceptClick({},1,99,112),true);g.end(3);g.prune(3000);assert.equal(g.history.size,0);
});
test('holding submit beyond the three-second cooldown never creates a second submission',()=>{
  const g=new C.InputGate(),submit={};
  assert.equal(g.down(8,submit,0),true);g.prune(5000);assert.equal(g.history.has(8),true);
  g.end(8,5000);assert.equal(g.acceptClick(submit,1,8,5001),false);
  assert.equal(g.down(9,submit,5050),true);g.end(9,5060);assert.equal(g.acceptClick(submit,1,9,5061),false);
});
