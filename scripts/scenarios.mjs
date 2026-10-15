import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
const h=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
for(const scenario of ['neutral','up','down','walk','jump']){
 const engine=new NullEngine(),sim=createSimulation(engine,h,spec,{obstacles:false});
 for(let i=0;i<600;i++)sim.step();
 const start=sim.rig.parts.Ball.position.clone();let peak=0;
 if(scenario==='up')sim.controller.input.pitch=-60;
 if(scenario==='down')sim.controller.input.pitch=60;
 if(scenario==='walk')sim.controller.input.z=1;
 if(scenario==='jump')sim.controller.input.jump=true;
 for(let i=0;i<300;i++){sim.step();peak=Math.max(peak,sim.rig.parts.Ball.position.y);}
 console.log(scenario,{...sim.rig.diagnostics(),head:sim.rig.parts.Head.forward.y,chest:sim.rig.parts.Chest.forward.y,distance:sim.rig.parts.Ball.position.subtract(start).length(),peak});
 sim.dispose();engine.dispose();
}
