import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine,Vector3,Quaternion,Scene,HavokPlugin,TransformNode,PhysicsBody,PhysicsMotionType,PhysicsShapeSphere} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {angularImpulseFromAcceleration} from '../src/physics.js';
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
const binary=fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')));
const havok=await Havok({wasmBinary:binary});
test('angular acceleration respects anisotropic inertia and orientation',()=>{
  const impulse=angularImpulseFromAcceleration(new Vector3(1,0,0),Quaternion.RotationAxis(Vector3.Up(),Math.PI/2),{inertia:new Vector3(2,3,4)},.5);
  assert.ok(Vector3.Distance(impulse,new Vector3(2,0,0))<1e-6);
});
test('angular acceleration adapter gives correct delta angular velocity in real Havok',()=>{
  const engine=new NullEngine(),scene=new Scene(engine);scene.enablePhysics(Vector3.Zero(),new HavokPlugin(false,havok));
  const node=new TransformNode('free sphere',scene),body=new PhysicsBody(node,PhysicsMotionType.DYNAMIC,false,scene);
  body.shape=new PhysicsShapeSphere(Vector3.Zero(),.3,scene);body.setMassProperties({mass:20});
  body.setAngularDamping(0);
  body.applyAngularImpulse(angularImpulseFromAcceleration(new Vector3(3,0,0),Quaternion.Identity(),body.getMassProperties(),.02));
  console.log('angular delta',body.getAngularVelocity().asArray());
  // Havok quantizes its inverse inertia: allow 0.2% relative error.
  assert.ok(Math.abs(body.getAngularVelocity().x-.06)<.00012);
  scene.dispose();engine.dispose();
});
test('real 17-body rig survives passive fall without broken anchors',()=>{
  const engine=new NullEngine();const sim=createSimulation(engine,havok,spec,{obstacles:false});
  sim.controller.active=false;
  for(let i=0;i<600;i++)sim.step();
  const d=sim.rig.diagnostics();console.log('passive',d);
  assert.equal(d.finite,true);assert.ok(d.maxAnchorError<.12);assert.ok(d.headHeight>.05);
  sim.dispose();engine.dispose();
});
test('active controller stands for 20 seconds',()=>{
  const engine=new NullEngine();const sim=createSimulation(engine,havok,spec,{obstacles:false});
  for(let i=0;i<1200;i++)sim.step();
  const d=sim.rig.diagnostics();console.log('standing',d);
  assert.equal(d.finite,true);assert.ok(d.maxAnchorError<.02);assert.ok(d.headHeight>1,'head should remain above 1 m');
  assert.ok(d.speed<.2,'standing must not cause sustained travel');
  sim.dispose();engine.dispose();
});
test('looking up/down changes head and chest in the intended direction at equal idle phase',()=>{
  const results=[];
  for(const pitch of [0,-60,60]){
    const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{obstacles:false});
    for(let i=0;i<600;i++)sim.step();
    sim.controller.input.pitch=pitch;
    for(let i=0;i<300;i++)sim.step();
    results.push({head:sim.rig.parts.Head.forward.y,chest:sim.rig.parts.Chest.forward.y});
    assert.equal(sim.rig.diagnostics().finite,true);
    sim.dispose();engine.dispose();
  }
  const [neutral,up,down]=results;
  console.log('pitch responses',results);
  assert.ok(up.head>neutral.head+.05&&up.chest>neutral.chest+.05);
  assert.ok(down.head<neutral.head-.05&&down.chest<neutral.chest-.05);
});
test('walking moves forward and jumping leaves ground and lands',()=>{
  const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{obstacles:false});
  for(let i=0;i<600;i++)sim.step();
  const start=sim.rig.parts.Ball.position.clone();
  sim.controller.input.z=1;
  for(let i=0;i<180;i++)sim.step();
  assert.ok(sim.rig.parts.Ball.position.z-start.z>3);
  assert.ok(sim.rig.diagnostics().maxAnchorError<.03);
  sim.reset();for(let i=0;i<600;i++)sim.step();
  sim.controller.input.jump=true;let peak=0;
  for(let i=0;i<240;i++){sim.step();peak=Math.max(peak,sim.rig.parts.Ball.position.y);}
  console.log('jump peak',peak);
  assert.ok(peak>.7);assert.ok(Math.abs(sim.rig.parts.Ball.position.y-.3)<.03);
  assert.equal(sim.rig.diagnostics().finite,true);
  sim.dispose();engine.dispose();
});
