import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {InputReplay} from '../src/replay.js';
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
const havok=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const run=(sim,n)=>{for(let i=0;i<n;i++)sim.step();};

test('player inputs complete the ledge climb and remain standing after releasing both hands',()=>{
  for(const x of [-.1,0,.1]){
    const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{scenario:'ledge',spawn:new Vector3(x,.55,0)});
    try{
      const replay=new InputReplay();let held=false,unsupported=false,maxError=0;
      while(!replay.done){
        replay.step(sim);held ||= sim.controller.handControl.count===2;
        unsupported ||= sim.controller.state==='Climb';
        const d=sim.rig.diagnostics();assert.ok(d.finite);maxError=Math.max(maxError,d.maxAnchorError);
      }
      run(sim,600);
      const ball=sim.rig.parts.Ball.position,d=sim.rig.diagnostics();
      console.log('completed climb',x,ball.asArray(),d.speed,maxError);
      assert.ok(held&&unsupported,'must actually hang from both hands');
      assert.equal(sim.controller.handControl.count,0);
      assert.equal(sim.controller.state,'Idle');assert.equal(sim.controller.grounded,true);
      assert.ok(sim.controller.groundBody===sim.world[1].body,'ledge must support the character');
      assert.ok(Math.abs(ball.y-1.6)<.04,'ball must stay on the 1.3 m platform');
      assert.ok(ball.z>.8&&ball.z<1.85&&Math.abs(ball.x)<.8);
      assert.ok(d.headHeight>2.2&&d.speed<.2);
      assert.ok(maxError<.08&&d.maxAnchorError<.03);
    }finally{sim.dispose();engine.dispose();}
  }
});

test('mid-jump directional input accelerates in air without another jump',()=>{
  const outcomes=[];
  for(const x of [0,1,-1]){
    const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{obstacles:false});
    try{
      run(sim,360);const c=sim.controller;c.input.jump=true;run(sim,1);
      c.input.x=x;let airborneFrames=0;
      for(let i=0;i<20;i++){sim.step();if(!c.grounded)airborneFrames++;}
      outcomes.push(sim.rig.parts.Chest.velocity.x);
      assert.ok(airborneFrames>=18);assert.equal(sim.rig.diagnostics().finite,true);
      c.input.x=0;run(sim,240);assert.ok(c.grounded);
    }finally{sim.dispose();engine.dispose();}
  }
  assert.ok(outcomes[1]>outcomes[0]+.5&&outcomes[2]<outcomes[0]-.5);
});

test('manual pull-up clears the ledge at 60/70/80 degrees without replay timing',()=>{
 for(const pitch of [60,70,80]){
  const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{scenario:'ledge'});
  try{
   run(sim,360);const c=sim.controller;c.input.pitch=-30;c.input.leftGrab=c.input.rightGrab=true;
   for(let i=0;i<150;i++){c.input.z=i<120?.3:0;if(i===90)c.input.jump=true;sim.step();}
   c.input.z=1;let reached=false;
   for(let i=0;i<360;i++){
    c.input.pitch=Math.min(pitch,-30+(pitch+30)*i/60);sim.step();
    if(c.pullUpPhase==='On ledge — release hands'){reached=true;break;}
   }
   assert.ok(reached,`must clear ledge at ${pitch} degrees`);
   assert.equal(c.handControl.count,2,'pull-up must never auto-release the hands');
   c.input.leftGrab=c.input.rightGrab=false;run(sim,20);c.input.z=0;c.input.pitch=0;run(sim,600);
   assert.equal(c.handControl.count,0);assert.ok(sim.rig.parts.Ball.position.y>1.55);assert.ok(c.groundBody===sim.world[1].body,'ledge must support the character');
   assert.ok(sim.rig.diagnostics().finite);assert.ok(sim.rig.diagnostics().maxAnchorError<.03);
  }finally{sim.dispose();engine.dispose();}
 }
});
