import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine,Vector3} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {solveAcceleration} from '../src/acceleration-control.js';
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
const havok=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const run=(sim,n)=>{for(let i=0;i<n;i++)sim.step();};
function fixture(){const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{obstacles:false});run(sim,360);return {sim,close:()=>{sim.dispose();engine.dispose();}};}

test('bounded acceleration solver brakes, converges and respects force limit',()=>{
  const dt=1/60;
  for(const start of [new Vector3(1,0,0),new Vector3(0,1,1),new Vector3(-2,.5,.3)]){
    let position=start.clone(),velocity=new Vector3(0,.6,0);
    for(let i=0;i<600;i++){
      const a=solveAcceleration(position.negate(),velocity,15,.1,dt);
      assert.ok(a.asArray().every(Number.isFinite));assert.ok(a.length()<=15.00001);
      velocity.addInPlace(a.scale(dt));position.addInPlace(velocity.scale(dt));
    }
    assert.ok(position.length()<.02);assert.ok(velocity.length()<.1);
  }
  const braking=solveAcceleration(Vector3.Zero(),new Vector3(2,0,0),15,.1,dt);
  assert.ok(braking.x<0&&braking.length()<=15);
});

test('hands reach independently without attaching to air or the character',()=>{
  const {sim,close}=fixture();try{
    const left=sim.rig.parts.LeftHand.com.clone(),right=sim.rig.parts.RightHand.com.clone();
    sim.controller.input.leftGrab=true;run(sim,180);
    assert.ok(sim.rig.parts.LeftHand.com.y-left.y>.3);
    assert.ok(sim.rig.parts.LeftHand.com.z-left.z>.25);
    assert.ok(sim.rig.parts.RightHand.com.y-right.y<.25);
    assert.equal(sim.controller.handControl.count,0);assert.equal(sim.rig.diagnostics().finite,true);
  }finally{close();}
});

test('two-hand dynamic grip lifts a crate, one hand can release, final release drops it',()=>{
  const {sim,close}=fixture();try{
    const box=sim.addBox('Crate',[.8,.8,.8],[0,.4,1],'#cc9966',12),c=sim.controller;
    c.input.pitch=35;c.input.leftGrab=c.input.rightGrab=true;run(sim,120);
    assert.equal(c.handControl.count,2);
    c.input.pitch=-45;run(sim,180);
    assert.ok(box.transformNode.position.y>1,'crate must physically lift off floor');assert.equal(c.pullUpForce,0,'carried crate must not trigger ledge assistance');
    for(const m of Object.values(c.handControl.diagnostics()))assert.ok(m.error<.015);
    c.input.leftGrab=false;run(sim,60);
    assert.equal(c.handControl.sides.Left.grab,null);assert.ok(c.handControl.sides.Right.grab?.body===box.body,'right hand must retain the crate');
    c.input.rightGrab=false;run(sim,180);
    assert.equal(c.handControl.count,0);assert.ok(box.transformNode.position.y<.8);
    assert.equal(sim.rig.diagnostics().finite,true);
  }finally{close();}
});

test('static grip supports hanging and looking down pulls the body upward',()=>{
  const {sim,close}=fixture();try{
    sim.addBox('Ledge',[2,1.3,1.2],[0,.65,1.3],'#7799bb');
    const c=sim.controller;c.input.leftGrab=c.input.rightGrab=true;c.input.pitch=-30;
    for(let i=0;i<150;i++){c.input.z=i<120?.3:0;if(i===90)c.input.jump=true;sim.step();}
    assert.equal(c.handControl.count,2);
    const before=sim.rig.parts.Ball.position.y;
    c.input.pitch=70;run(sim,180);
    const after=sim.rig.parts.Ball.position.y;
    console.log('climb heights before/after',before,after);
    assert.equal(c.state,'Climb');assert.ok(after>before+.25,'pull-up must add height after jump impulse has ended');
    assert.ok(after>.8);assert.ok(sim.rig.diagnostics().maxAnchorError<.03);
    c.input.leftGrab=c.input.rightGrab=false;run(sim,180);
    assert.equal(c.handControl.count,0);assert.ok(sim.rig.parts.Ball.position.y<.5);
  }finally{close();}
});

test('no-grab objects are rejected and passive mode releases existing grips',()=>{
  const {sim,close}=fixture();try{
    const wall=sim.addBox('Wall',[2,2,.5],[0,1,.9],'#7799bb');wall.transformNode.metadata.interaction.grip.disabled=true;
    const c=sim.controller;c.input.leftGrab=c.input.rightGrab=true;run(sim,180);
    assert.equal(c.handControl.count,0);
    wall.transformNode.metadata.interaction.grip.disabled=false;run(sim,180);assert.equal(c.handControl.count,2);
    c.active=false;run(sim,1);assert.equal(c.handControl.count,0);
  }finally{close();}
});

test('native impulse reporting breaks an overloaded grip',()=>{
  const {sim,close}=fixture();try{
    sim.addBox('Wall',[2,2,.5],[0,1,.9],'#7799bb');const c=sim.controller;
    c.input.leftGrab=c.input.rightGrab=true;run(sim,180);assert.equal(c.handControl.count,2);
    const left=sim.rig.parts.LeftHand;left.body.applyImpulse(new Vector3(1200,0,0),left.com);
    run(sim,1);
    console.log('overload',c.handControl.diagnostics());
    assert.equal(c.handControl.sides.Left.lastRelease,'overload');
    assert.equal(c.handControl.sides.Left.grab,null);
  }finally{close();}
});

test('reset while holding removes transient joints and does not accumulate bodies or materials',()=>{
  const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{scenario:'box'});
  try{
    const bodies=sim.scene.getPhysicsEngine().getBodies().length,materials=sim.scene.materials.length;
    for(let round=0;round<4;round++){
      run(sim,360);const c=sim.controller;c.input.pitch=35;c.input.leftGrab=c.input.rightGrab=true;run(sim,180);
      assert.ok(c.handControl.count>0);
      sim.reset();assert.equal(sim.controller.handControl.count,0);
      assert.equal(sim.scene.getPhysicsEngine().getBodies().length,bodies);
      assert.equal(sim.scene.materials.length,materials);
    }
    assert.equal(sim.rig.diagnostics().finite,true);
  }finally{sim.dispose();engine.dispose();}
});
