import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel } from '../rules.mjs';
import { createDrag, dragBy } from '../drag.mjs';

const EPS=1e-7;
const block=(id,x,y,w=1,h=1,color='coral',extra={})=>({id,x,y,w,h,color,rank:1,...extra});
function fixture(blocks,mode='classic',extra={}) {
  return {...createLevel(mode,1,123),blocks,queue:[],tray:[],reserve:[],unlocked:[],plan:[],initial:blocks.length,total:blocks.length,removed:0,moves:0,score:0,status:'playing',...extra};
}
function near(actual,expected,message='continuous position') {
  assert.ok(Math.abs(actual-expected)<EPS,`${message}: expected ${expected}, got ${actual}`);
}
function clearOfBlocks(trace,moving,obstacles) {
  for(const b of obstacles) {
    if(b.id===moving.id)continue;
    assert.ok(trace.x+moving.w<=b.x+EPS||trace.x>=b.x+b.w-EPS||trace.y+moving.h<=b.y+EPS||trace.y>=b.y+b.h-EPS,
      `visual block at ${trace.x},${trace.y} overlaps obstacle ${b.id} at ${b.x},${b.y}`);
  }
}
function boundedStep(trace,dx,dy,moving,obstacles) {
  const before={x:trace.x,y:trace.y};assert.equal(dragBy(trace,dx,dy),trace);
  assert.ok(Math.abs(trace.x-before.x)<=Math.abs(dx)+EPS,`x jumped ${trace.x-before.x} for input ${dx}`);
  assert.ok(Math.abs(trace.y-before.y)<=Math.abs(dy)+EPS,`y jumped ${trace.y-before.y} for input ${dy}`);
  clearOfBlocks(trace,moving,obstacles);
}
function pixelPath(trace,path,moving,obstacles) {
  let last=[40,40];
  for(const point of path){boundedStep(trace,(point[0]-last[0])/60,(point[1]-last[1])/60,moving,obstacles);last=point;}
}

test('empty space follows tiny inputs, both axes and immediate reversals one to one',()=>{
  for(const [w,h]of[[1,1],[2,1],[1,2],[2,2]]) {
    const b=block(0,2,2,w,h),s=fixture([b]),before=JSON.stringify(s),trace=createDrag(s,0);
    let x=b.x,y=b.y;
    for(const [dx,dy]of[[.001,0],[0,.002],[.07,.13],[-.04,.03],[.21,-.12],[-.241,-.042]]) {
      boundedStep(trace,dx,dy,b,s.blocks);x+=dx;y+=dy;near(trace.x,x);near(trace.y,y);
    }
    assert.equal(JSON.stringify(s),before,'a drag preview must not mutate the saved board');
  }
});

test('sliding beside a wall never shifts the untouched axis at a half-cell preview boundary',()=>{
  const b=block(0,1,1),obstacle=block(1,2,1),s=fixture([b,obstacle]),trace=createDrag(s,0);
  pixelPath(trace,[[60,40],[60,60],[60,69],[60,70],[60,71],[60,80],[60,90],[61,90]],b,s.blocks);
  near(trace.x,1,'rightward motion remains blocked until the whole block clears the wall');
  near(trace.y,1+50/60,'horizontal input must not snap y from 50px to 60px');
  boundedStep(trace,0,10/60,b,s.blocks);
  boundedStep(trace,1/60,0,b,s.blocks);near(trace.x,1+1/60);near(trace.y,2);
});

test('passing an upper-right obstacle blocks x rather than snapping fractional y back to the grid',()=>{
  const b=block(0,1,1),obstacle=block(1,2,0),s=fixture([b,obstacle]),trace=createDrag(s,0);
  pixelPath(trace,[[40,28],[41,28],[42,28],[43,28]],b,s.blocks);
  near(trace.x,1);near(trace.y,.8,'12px upward displacement survives horizontal collision');
  boundedStep(trace,0,.2,b,s.blocks);near(trace.y,1);
  boundedStep(trace,.01,0,b,s.blocks);near(trace.x,1.01);
});

test('small diagonal inputs stay continuous around a corner and cannot cut through it',()=>{
  const b=block(0,1,1),s=fixture([b,block(1,2,2)]),trace=createDrag(s,0);
  for(let i=0;i<120;i++)boundedStep(trace,.01,.01,b,s.blocks);
  for(let i=0;i<80;i++)boundedStep(trace,-.01,-.01,b,s.blocks);
  const blocked=fixture([b,block(1,2,1),block(2,1,2)]),corner=createDrag(blocked,0);
  boundedStep(corner,2,2,b,blocked.blocks);near(corner.x,1);near(corner.y,1);
});

test('large deltas stop every block shape at walls and reversal responds without unwinding overshoot',()=>{
  for(const [w,h]of[[1,1],[2,1],[1,2],[2,2]]) {
    const b=block(0,0,1,w,h),wall=Array.from({length:6},(_,y)=>block(y+1,3,y)),s=fixture([b,...wall]),trace=createDrag(s,0);
    boundedStep(trace,40,0,b,s.blocks);near(trace.x,3-w);near(trace.y,1);
    boundedStep(trace,-.01,0,b,s.blocks);near(trace.x,3-w-.01,'reverse immediately after a blocked push');
    boundedStep(trace,-40,0,b,s.blocks);near(trace.x,0);near(trace.y,1);
  }
});

test('sparse and dense samples of the same path reach the same collision position',()=>{
  const b=block(0,1,1),s=fixture([b,block(1,2,0)]),sparse=createDrag(s,0),dense=createDrag(s,0);
  dragBy(sparse,0,-.2);dragBy(sparse,1,0);
  for(let i=0;i<20;i++)dragBy(dense,0,-.01);
  for(let i=0;i<100;i++)dragBy(dense,.01,0);
  near(sparse.x,dense.x);near(sparse.y,dense.y);clearOfBlocks(sparse,b,s.blocks);clearOfBlocks(dense,b,s.blocks);
});

test('clearing an obstacle restores the blocked axis within the same pointer segment in every orientation',()=>{
  for(const swap of[false,true])for(const sx of[1,-1])for(const sy of[1,-1]) {
    const point=(x,y)=>{
      const [px,py]=swap?[y,x]:[x,y];
      return[sx===1?px:5-px,sy===1?py:5-py];
    };
    const [x,y]=point(1,1),[ox,oy]=point(2,1),[ex,ey]=point(1.5,3);
    const b=block(0,x,y),obstacle=block(1,ox,oy,1,1,'blue'),s=fixture([b,obstacle]);
    const [dx,dy]=swap?[2*sx,sy]:[sx,2*sy];
    for(const samples of[1,2,10,100]) {
      const trace=createDrag(s,0);
      for(let i=0;i<samples;i++)boundedStep(trace,dx/samples,dy/samples,b,s.blocks);
      near(trace.x,ex,`restored x: swap=${swap}, signs=${sx},${sy}, samples=${samples}`);
      near(trace.y,ey,`restored y: swap=${swap}, signs=${sx},${sy}, samples=${samples}`);
    }
  }
});

test('matching gates accept the full block span in every direction',()=>{
  for(const [b,dx,dy]of[
    [block(0,1,0,2,1,'coral'),0,-2],
    [block(0,5,1,1,2,'blue'),2,0],
    [block(0,3,5,2,1,'lime'),0,2],
    [block(0,0,3,1,2,'gold'),-2,0],
  ]) {
    const trace=createDrag(fixture([b]),0);dragBy(trace,dx,dy);
    assert.equal(trace.state.blocks.some(b=>b.id===0),false);assert.equal(trace.state.removed,1);
    assert.ok(trace.events.some(e=>e.type==='exit'));
  }
});

test('wrong-color gates and a block wider than its matching gate remain solid',()=>{
  for(const [b,dx,dy]of[
    [block(0,5,1,1,1,'coral'),2,0],
    [block(0,1,0,1,1,'blue'),0,-2],
    [block(0,0,3,1,1,'lime'),-2,0],
    [block(0,3,5,1,1,'gold'),0,2],
    [block(0,2,0,2,1,'coral'),0,-2],
  ]) {
    const trace=createDrag(fixture([b]),0);dragBy(trace,dx,dy);
    near(trace.x,b.x);near(trace.y,b.y);assert.equal(trace.state.removed,0);assert.ok(trace.state.blocks.some(b=>b.id===0));
  }
});

test('gate checks use the actual fractional span rather than the rounded preview cell',()=>{
  for(const [b,alongX,alongY,outX,outY]of[
    [block(0,1,0,2,1,'coral'),.4,0,0,-1],
    [block(0,5,1,1,2,'blue'),0,.4,1,0],
    [block(0,3,5,2,1,'lime'),-.4,0,0,1],
    [block(0,0,3,1,2,'gold'),0,-.4,-1,0],
  ]) {
    const trace=createDrag(fixture([b]),0);dragBy(trace,alongX,alongY);
    const x=trace.x,y=trace.y;dragBy(trace,outX,outY);
    near(trace.x,x,'misaligned exit cannot move x');near(trace.y,y,'misaligned exit cannot move y');
    assert.ok(trace.state.blocks.some(b=>b.id===0));assert.equal(trace.state.removed,0);
    dragBy(trace,-alongX,-alongY);dragBy(trace,outX,outY);
    assert.equal(trace.state.blocks.some(b=>b.id===0),false,'realigning the full span restores the exit');
  }
});

test('merging requires contact and half a cell of pressure without drawing overlapping blocks',()=>{
  const b=block(0,1,1),target=block(1,2,1),s=fixture([b,target],'merge'),trace=createDrag(s,0);
  dragBy(trace,.49,0);near(trace.x,1);near(trace.y,1);clearOfBlocks(trace,b,s.blocks);
  assert.equal(trace.state.blocks.find(b=>b.id===1).rank,1);assert.ok(trace.state.blocks.some(b=>b.id===0));
  dragBy(trace,.02,0);assert.equal(trace.state.blocks.some(b=>b.id===0),false);assert.equal(trace.state.blocks.find(b=>b.id===1).rank,2);
  assert.ok(trace.events.some(e=>e.type==='merge'));
});

test('merge contact checks real perpendicular alignment and rejects different colors or ranks',()=>{
  for(const offset of [.21,.4]) {
    const b=block(0,1,1),target=block(1,2,1),s=fixture([b,target],'merge'),trace=createDrag(s,0);
    dragBy(trace,0,offset);dragBy(trace,1,0);near(trace.x,1);near(trace.y,1+offset);
    assert.equal(trace.state.blocks.length,2);clearOfBlocks(trace,b,s.blocks);
  }
  const aligned=createDrag(fixture([block(0,1,1),block(1,2,1)],'merge'),0);
  dragBy(aligned,0,.15);dragBy(aligned,.6,0);assert.equal(aligned.state.blocks.some(b=>b.id===0),false,'small alignment tolerance still allows a deliberate merge');
  for(const target of[block(1,2,1,1,1,'blue'),block(1,2,1,1,1,'coral',{rank:2})]) {
    const b=block(0,1,1),s=fixture([b,target],'merge'),trace=createDrag(s,0);dragBy(trace,2,0);
    near(trace.x,1);near(trace.y,1);assert.equal(trace.state.removed,0);clearOfBlocks(trace,b,s.blocks);
  }
});

test('a diagonal pass beside a merge target has the same result for sparse and dense input',()=>{
  const b=block(0,1,1),target=block(1,2,1),s=fixture([b,target],'merge'),results=[];
  for(const samples of[1,2,100]) {
    const trace=createDrag(s,0);
    for(let i=0;i<samples;i++)dragBy(trace,.6/samples,1/samples);
    assert.ok(trace.state.blocks.some(b=>b.id===0),'passing out of alignment must not spend a full diagonal delta as merge pressure');
    assert.equal(trace.state.removed,0);assert.equal(trace.state.blocks.find(b=>b.id===1).rank,1);clearOfBlocks(trace,b,s.blocks);
    results.push(trace);
  }
  for(const trace of results.slice(1)){near(trace.x,results[0].x);near(trace.y,results[0].y);}
});

test('reversing into a blocked neighbor still cancels pressure on the previous merge target',()=>{
  const b=block(0,1,1),target=block(1,2,1),other=block(2,0,1,1,1,'blue'),s=fixture([b,target,other],'merge'),trace=createDrag(s,0);
  dragBy(trace,.49,0);assert.ok(trace.state.blocks.some(b=>b.id===0));
  dragBy(trace,-.1,0);near(trace.x,1);near(trace.y,1);
  dragBy(trace,.02,0);assert.ok(trace.state.blocks.some(b=>b.id===0),'the cancelled .49 pressure must not combine with a fresh .02 push');
  clearOfBlocks(trace,b,s.blocks);
  dragBy(trace,.49,0);assert.equal(trace.state.blocks.some(b=>b.id===0),false,'a new half-cell push can still merge normally');
  assert.equal(trace.state.blocks.find(b=>b.id===1).rank,2);
});

test('a blocked perpendicular component does not disable pressure on an aligned merge face',()=>{
  const s=fixture([block(0,1,1),block(1,2,1),block(2,1,2,1,1,'blue')],'merge');
  for(const [startY,dy]of[[0,.1],[-.1,1]])for(const samples of[1,2,100]) {
    const trace=createDrag(s,0);dragBy(trace,0,startY);
    for(let i=0;i<samples;i++)dragBy(trace,.6/samples,dy/samples);
    assert.equal(trace.state.blocks.some(b=>b.id===0),false,`the lower wall keeps y aligned while the right face receives pressure: start ${startY}, ${samples} samples`);
    assert.equal(trace.state.blocks.find(b=>b.id===1).rank,2);assert.equal(trace.state.removed,1);
  }
});

test('merge pressure counts only the part of a path entering and crossing its alignment band',()=>{
  const b=block(0,1,1),target=block(1,2,1),s=fixture([b,target],'merge');
  for(const [dx,dy,merges]of[[.8,-.8,false],[1.2,-.8,true],[1.2,-.4,true]]) {
    const traces=[];
    for(const samples of[1,2,100]) {
      const trace=createDrag(s,0);dragBy(trace,0,.4);
      for(let i=0;i<samples;i++)dragBy(trace,dx/samples,dy/samples);
      assert.equal(trace.state.blocks.some(b=>b.id===0),!merges,`input ${dx},${dy} split into ${samples} samples`);
      assert.equal(trace.state.blocks.find(b=>b.id===1).rank,merges?2:1);
      if(!merges){clearOfBlocks(trace,b,s.blocks);traces.push(trace);}
    }
    for(const trace of traces.slice(1)){near(trace.x,traces[0].x);near(trace.y,traces[0].y);}
  }
});

test('key locks, frost layers and minimum merge rank still restrict continuous exits',()=>{
  for(const [mode,extra,allowed]of[
    ['key',{},false],['key',{key:true},true],['ice',{ice:2},false],['ice',{ice:0},true],['merge',{rank:1},false],['merge',{rank:2},true],
  ]) {
    const b=block(0,5,1,1,1,'blue',extra),trace=createDrag(fixture([b],mode),0);dragBy(trace,2,0);
    assert.equal(trace.state.blocks.some(b=>b.id===0),!allowed,`${mode} ${JSON.stringify(extra)}`);
    if(!allowed){near(trace.x,5);near(trace.y,1);dragBy(trace,-.01,0);near(trace.x,4.99,'locked exits do not freeze movement on the board');}
  }
  const b=block(0,5,1,1,1,'blue'),unlocked=createDrag(fixture([b],'key',{unlocked:['blue']}),0);dragBy(unlocked,2,0);
  assert.equal(unlocked.state.blocks.some(b=>b.id===0),false);
});

test('completed terminal gestures cannot collect or merge twice when more samples arrive',()=>{
  for(const [s,dx,dy]of[
    [fixture([block(0,5,1,1,1,'blue')]),2,0],
    [fixture([block(0,1,1),block(1,2,1)],'merge'),1,0],
  ]) {
    const trace=createDrag(s,0);dragBy(trace,dx,dy);assert.equal(trace.state.blocks.some(b=>b.id===0),false);
    const before=JSON.stringify(trace.state),events=trace.events.length;
    dragBy(trace,-2,2);dragBy(trace,3,-3);
    assert.equal(JSON.stringify(trace.state),before);assert.equal(trace.events.length,events);
  }
});
