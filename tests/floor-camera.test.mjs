import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {CameraBoom} from '../src/camera-boom.js';
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
const havok=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const run=(sim,n)=>{for(let i=0;i<n;i++)sim.step();};
test('both hands can grip the floor and independently release it',()=>{
 const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{obstacles:false});
 try{
  run(sim,360);const c=sim.controller;c.input.pitch=80;c.input.leftGrab=c.input.rightGrab=true;run(sim,360);
  console.log('floor grips',c.handControl.diagnostics());assert.equal(c.pullUpForce,0,'floor grip must not trigger ledge assistance');
  assert.ok(c.handControl.sides.Left.grab?.body===sim.world[0].body,'left hand must grip the floor');
  assert.ok(c.handControl.sides.Right.grab?.body===sim.world[0].body,'right hand must grip the floor');
  c.input.leftGrab=false;run(sim,30);assert.equal(c.handControl.sides.Left.grab,null);assert.ok(c.handControl.sides.Right.grab);
  c.input.rightGrab=false;run(sim,60);assert.equal(c.handControl.count,0);assert.ok(sim.rig.diagnostics().finite);
 }finally{sim.dispose();engine.dispose();}
});
test('camera swept volume stops at floor/wall and extends back after obstruction clears',()=>{
 const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{obstacles:false});
 try{
  const boom=new CameraBoom(sim.scene,sim.plugin),target=new Vector3(0,1.4,0);
  const down=new Vector3(0,-.7,-.7).normalize();
  const distance=boom.update(target,down,8,1/60),position=target.add(down.scale(distance));
  assert.ok(position.y>=.25&&position.y<.35,'camera sphere must stay above floor');
  const wall=sim.addBox('Camera wall',[4,4,.2],[0,2,-2],'#8899aa');
  const back=new Vector3(0,0,-1);
  let d=0;for(let i=0;i<240;i++)d=boom.update(target,back,8,1/60);
  assert.ok(d<1.66&&d>1.5,'wall must block volume before center reaches it');
  wall.body.dispose();wall.transformNode.dispose();
  const first=boom.update(target,back,8,1/60);assert.ok(first>d&&first<d+.07);
  for(let i=0;i<240;i++)d=boom.update(target,back,8,1/60);
  assert.equal(d,8,'original zoom must return after obstruction clears');
 }finally{sim.dispose();engine.dispose();}
});
