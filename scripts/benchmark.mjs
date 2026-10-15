import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {InputReplay} from '../src/replay.js';
const root=new URL('../',import.meta.url),spec=JSON.parse(fs.readFileSync(new URL('public/data/character.json',root)));
const havok=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const definitions=[
 {name:'standing',frames:1200},
 {name:'look-up',frames:600,input:{pitch:-60}},
 {name:'look-down',frames:600,input:{pitch:60}},
 {name:'walking',frames:180,input:{z:1}},
 {name:'jump',frames:240,jump:true},
 {name:'recovery',frames:900,knockout:true},
 {name:'platform',frames:720,scenario:'platform'},
 {name:'slope',frames:360,scenario:'slope',warmup:0},
 {name:'climb',replay:true,scenario:'ledge',warmup:0},
];
const results=[];
fs.mkdirSync(new URL('validation/',root),{recursive:true});
for(const def of definitions){
 const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{scenario:def.scenario||'lab',obstacles:!!def.scenario});
 try{
  for(let i=0;i<(def.warmup??360);i++)sim.step();
  Object.assign(sim.controller.input,def.input||{});if(def.jump)sim.controller.input.jump=true;if(def.knockout)sim.controller.knockOut();
  const replay=def.replay?new InputReplay():null,frames=[];let peakBall=0,maxAnchorError=0;const states=new Set();
  for(let frame=0;replay?!replay.done:frame<def.frames;frame++){
   if(replay)replay.step(sim);else sim.step();const d=sim.rig.diagnostics();
   if(!d.finite)throw new Error(def.name+': nonfinite state');peakBall=Math.max(peakBall,d.ballHeight);maxAnchorError=Math.max(maxAnchorError,d.maxAnchorError);states.add(sim.controller.state);
   if(frame%6===0||sim.lastInput.jump)frames.push({time:(frame+1)*spec.fixedDeltaTime,input:sim.lastInput,state:sim.controller.state,bodies:Object.values(sim.rig.parts).map(p=>({name:p.name,position:p.position.asArray(),rotation:p.rotation.asArray(),velocity:p.velocity.asArray(),angularVelocity:p.omega.asArray()}))});
  }
  fs.writeFileSync(new URL(`validation/${def.name}.json`,root),JSON.stringify({schema:1,source:'Babylon/Havok prototype',build:spec.build,scenario:def.name,dt:spec.fixedDeltaTime,frames}));
  results.push({scenario:def.name,samples:frames.length,peakBall,maxAnchorError,states:[...states],final:sim.rig.diagnostics()});
 }finally{sim.dispose();engine.dispose();}
}
fs.writeFileSync(new URL('validation/summary.json',root),JSON.stringify({source:'Prototype only; not an original-HFF baseline',originalComparison:'not measured',results},null,2));
console.log(JSON.stringify(results.map(r=>({scenario:r.scenario,peakBall:r.peakBall,maxAnchorError:r.maxAnchorError})),null,2));
