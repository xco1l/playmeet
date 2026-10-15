import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
const h=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
for(const scenario of ['reach','static','dynamic','climb']){
 const engine=new NullEngine(),sim=createSimulation(engine,h,spec,{obstacles:false});
 for(let i=0;i<360;i++)sim.step();
 const initialHand=sim.rig.parts.LeftHand.com.clone();let object;
 if(scenario==='static')object=sim.addBox('Test wall',[2,2,.5],[0,1,.9],'#7799bb');
 if(scenario==='dynamic')object=sim.addBox('Test crate',[.8,.8,.8],[0,.4,1],'#cc9966',12);
 if(scenario==='climb')object=sim.addBox('Test ledge',[2,1.3,1.2],[0,.65,1.3],'#7799bb');
 const c=sim.controller;c.input.leftGrab=true;c.input.rightGrab=true;
 c.input.pitch=scenario==='dynamic'?35:scenario==='climb'?-30:0;
 let acquired=false,maxCount=0,minError=1,maxY=0,startY=0;
 for(let i=0;i<360;i++){
   if(scenario==='climb'&&i<120)c.input.z=.3;
   else c.input.z=0;
   if(scenario==='climb'&&i===90)c.input.jump=true;
   if(c.handControl.count&&!acquired){acquired=true;startY=sim.rig.parts.Ball.position.y;console.log('acquire',scenario,i,c.handControl.diagnostics());}
   if(acquired&&i>150&&(scenario==='climb'||scenario==='dynamic'))c.input.pitch=scenario==='climb'?70:-45;
   sim.step();maxCount=Math.max(maxCount,c.handControl.count);maxY=Math.max(maxY,sim.rig.parts.Ball.position.y);
 }
 console.log(scenario,{handDelta:sim.rig.parts.LeftHand.com.subtract(initialHand).asArray(),maxCount,startY,maxY,ball:sim.rig.parts.Ball.position.asArray(),object:object?.transformNode?.position?.asArray(),state:c.state,hands:c.handControl.diagnostics(),rig:sim.rig.diagnostics()});
 sim.dispose();engine.dispose();
}
