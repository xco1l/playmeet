import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import Havok from '@babylonjs/havok';import {NullEngine,Vector3} from '@babylonjs/core';import {createSimulation} from '../src/simulation.js';
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
const havok=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const run=(s,n)=>{for(let i=0;i<n;i++)s.step()};
function fixture(scenario='lab'){const engine=new NullEngine(),sim=createSimulation(engine,havok,spec,{scenario});return {sim,close:()=>{sim.dispose();engine.dispose();}};}
test('play dead releases hands, remains limp for three seconds and gets up',()=>{
 const {sim:s,close}=fixture('box');try{run(s,360);const c=s.controller;c.input.pitch=35;c.input.leftGrab=c.input.rightGrab=true;run(s,180);assert.ok(c.handControl.count);
 c.input.playDead=true;run(s,1);assert.equal(c.state,'Unconscious');assert.equal(c.handControl.count,0);
 c.input.playDead=false;c.input.leftGrab=c.input.rightGrab=false;c.input.pitch=0;run(s,120);assert.equal(c.state,'Unconscious');
 run(s,720);console.log('recovery',s.rig.diagnostics());assert.equal(c.state,'Idle');assert.ok(s.rig.diagnostics().headHeight>1);assert.ok(s.rig.diagnostics().finite);
 }finally{close();}
});
test('platform contributes support velocity and jump leaves moving support',()=>{
 const {sim:s,close}=fixture('platform');try{run(s,360);let supported=0,maxGroundSpeed=0;
 for(let i=0;i<180;i++){s.step();if(s.controller.ground.bodies.has(s.world[1].body)){supported++;maxGroundSpeed=Math.max(maxGroundSpeed,Math.abs(s.controller.ground.velocity.y));}}
 assert.ok(supported>100);assert.ok(maxGroundSpeed>.3);const y=s.rig.parts.Ball.position.y;s.controller.input.jump=true;let peak=y;for(let i=0;i<50;i++){s.step();peak=Math.max(peak,s.rig.parts.Ball.position.y)}assert.ok(peak>y+.35);
 }finally{close();}
});
test('steep slope enters slide and restores original friction on flat support',()=>{
 const {sim:s,close}=fixture('slope');try{let slid=false;
 for(let i=0;i<360;i++){s.step();if(s.controller.state==='Slide'){slid=true;assert.equal(s.rig.parts.Ball.shape.material.friction,0);}}
 console.log('slope',slid,s.controller.state);assert.ok(slid);s.reset(undefined,'lab');run(s,360);assert.equal(s.controller.state,'Idle');assert.ok(s.rig.parts.Ball.shape.material.friction>0);
 }finally{close();}
});
test('release marker prevents regrabbing and target helper supports attachment',()=>{
 const {sim:s,close}=fixture('box');try{run(s,360);const c=s.controller,box=s.world[1];box.transformNode.metadata.interaction.grip.anchor=[0,.4,-.4];c.input.pitch=35;c.input.leftGrab=c.input.rightGrab=true;run(s,180);assert.ok(c.handControl.count);
 box.transformNode.metadata.interaction.grip.suspended=true;run(s,120);assert.equal(c.handControl.count,0);box.transformNode.metadata.interaction.grip.suspended=false;run(s,180);assert.ok(c.handControl.count);
 }finally{close();}
});

test('configured beam can be gripped, lifted, aimed and released',()=>{
 const {sim:s,close}=fixture('carry');try{run(s,360);const c=s.controller,beam=s.world[1];c.input.pitch=60;c.input.leftGrab=c.input.rightGrab=true;run(s,240);
 console.log('beam grips',c.handControl.diagnostics());assert.ok(Object.values(c.handControl.sides).some(m=>m.grab?.body===beam.body));
 c.input.pitch=-60;run(s,240);console.log('beam height',beam.transformNode.position.y);assert.ok(beam.transformNode.position.y>.6);assert.ok(beam.body.getAngularVelocity().asArray().every(Number.isFinite));
 c.input.leftGrab=c.input.rightGrab=false;run(s,180);assert.equal(c.handControl.count,0);beam.transformNode.computeWorldMatrix(true);assert.ok(beam.transformNode.getBoundingInfo().boundingBox.minimumWorld.y<.08,'released beam must reach floor, including when it lands upright');
 }finally{close();}
});

test('two nearby external hits trigger recovery while one does not',()=>{
 const {sim:s,close}=fixture();try{run(s,360);const c=s.controller;c.receiveHit(new Vector3(16,0,0));s.step();assert.notEqual(c.state,'Unconscious');c.receiveHit(new Vector3(16,0,0));s.step();assert.equal(c.state,'Unconscious');
 }finally{close();}
});


