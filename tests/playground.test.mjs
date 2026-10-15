import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine,Vector3,FreeCamera} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {STATIONS,SLOPE_TOP,COURSE_MARKERS,FIXTURE_LABELS} from '../src/playground.js';
import {WORLD_MASK} from '../src/physics.js';
import {createStationSigns} from '../src/station-signs.js';
import {PlaygroundChecks} from '../src/playground-checks.js';
const spec=JSON.parse(fs.readFileSync(new URL('../public/data/character.json',import.meta.url)));
const havok=await Havok({wasmBinary:fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
const run=(s,n)=>{for(let i=0;i<n;i++)s.step();};
test('playground checkpoints settle on support and resets do not leak bodies or materials',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const counts=()=>[s.scene.getPhysicsEngine().getBodies().length,s.scene.materials.length,s.world.length];
  const initial=counts();assert.ok(s.world.length>35);
  for(const station of STATIONS){
   s.reset(Vector3.FromArray(station.spawn),'playground');run(s,360);
   assert.ok(s.rig.diagnostics().finite,station.id);assert.ok(s.controller.grounded,station.id+' support');
   assert.ok(s.rig.parts.Head.com.y-s.rig.parts.Ball.position.y>.8,station.id+' upright');
   assert.deepEqual(counts(),initial,station.id+' resources');
  }
  s.reset(Vector3.FromArray(SLOPE_TOP),'playground');Object.assign(s.controller.input,{yaw:180,pitch:35});run(s,240);assert.ok(s.controller.grounded,'slope summit support');assert.ok(s.rig.parts.Ball.position.y>3.8);
 }finally{s.dispose();engine.dispose();}
});
test('playground animates both supports and restores moved props on reset',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const find=name=>s.world.find(a=>a.transformNode.name===name);
  const lift=find('Lift'),shuttle=find('Horizontal platform');
  run(s,120);assert.ok(lift.transformNode.position.y>.8);assert.ok(shuttle.transformNode.position.x>14);
  const crate=find('Crate · 4 kg');crate.body.applyImpulse(new Vector3(20,0,0),crate.transformNode.position);run(s,90);assert.ok(crate.transformNode.position.x>8);
  s.reset();assert.equal(find('Crate · 4 kg').transformNode.position.x,7.5);
  assert.equal(find('Lift').transformNode.position.y,.125);
  assert.equal(find('Red panel · no grab').transformNode.metadata.interaction.grip.disabled,true);
 }finally{s.dispose();engine.dispose();}
});

test('high drop reaches FreeFall and lands without invalid physics',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground',spawn:Vector3.FromArray(STATIONS.find(s=>s.id==='fall').spawn)});
 try{run(s,240);s.controller.input.z=1;run(s,100);s.controller.input.z=0;let freeFall=false;for(let i=0;i<900;i++){s.step();freeFall ||= s.controller.state==='FreeFall';}assert.ok(freeFall);assert.ok(s.controller.grounded);assert.ok(s.rig.diagnostics().finite);}
 finally{s.dispose();engine.dispose();}
});

test('every obstacle checkpoint settles finitely and reset preserves native resources',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const counts=()=>[s.scene.getPhysicsEngine().getBodies().length,s.scene.materials.length,s.world.length];
  const initial=counts();
  for(const station of STATIONS){
   assert.ok(station.checkpoints.length>0,station.id);
   assert.equal(new Set(station.checkpoints.map(c=>c.id)).size,station.checkpoints.length,station.id+' unique checkpoint IDs');
   for(const checkpoint of station.checkpoints){
    s.reset(Vector3.FromArray(checkpoint.spawn),'playground');
    Object.assign(s.controller.input,{yaw:checkpoint.yaw??station.yaw??0,pitch:checkpoint.pitch??station.pitch??0});
    run(s,240);
    assert.ok(s.rig.diagnostics().finite,station.id+'/'+checkpoint.id+' finite');
    assert.ok(s.controller.grounded,station.id+'/'+checkpoint.id+' supported');
    assert.deepEqual(counts(),initial,station.id+'/'+checkpoint.id+' resources');
   }
  }
 }finally{s.dispose();engine.dispose();}
});

test('jump gaps and suspended bar have a lower catch floor instead of a walkable bridge',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const ray=(x,z)=>s.scene.getPhysicsEngine().raycast(new Vector3(x,4,z),new Vector3(x,-1,z),{collideWith:WORLD_MASK});
  for(const z of [2.8,4.6,6.7,9.1]){
   const hit=ray(-1,z);assert.ok(hit.hasHit);assert.ok(Math.abs(hit.hitPointWorld.y-1.2)<1e-4,'jump platform top');
  }
  for(const z of [3.7,5.65,7.9]){
   const hit=ray(-1,z);assert.ok(hit.hasHit);assert.equal(hit.body.transformNode.name,'Floor');assert.ok(Math.abs(hit.hitPointWorld.y)<1e-4,'gap catch floor');
  }
  const belowBar=s.scene.getPhysicsEngine().raycast(new Vector3(3,2.9,7),new Vector3(3,-1,7),{collideWith:WORLD_MASK});
  assert.equal(belowBar.body.transformNode.name,'Floor');
  const first=s.world.find(a=>a.transformNode.metadata.fixtureId==='jump-platform-1');
  s.reset(new Vector3(-1,1.75,2.8),'playground');run(s,180);s.controller.input.z=1;
  let fellIntoGap=false;for(let i=0;i<90;i++){s.step();if(s.rig.parts.Ball.position.y<1.1)fellIntoGap=true;}
  assert.ok(fellIntoGap,'walking off the raised platform loses elevation');
  assert.ok(first.body.isDisposed,'reset rebuilds fixture bodies');
 }finally{s.dispose();engine.dispose();}
});

test('fixtures distinguish mass, carrying assistance, grip prohibition, and suspended grips',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const fixture=id=>s.world.find(a=>a.transformNode.metadata.fixtureId===id);
  const ids=s.world.flatMap(a=>a.transformNode.metadata.fixtureId?[a.transformNode.metadata.fixtureId]:[]);
  assert.equal(new Set(ids).size,ids.length);
  for(const mass of [4,12,60])assert.equal(fixture('crate-'+mass).body.getMassProperties().mass,mass);
  const push=fixture('push-crate');assert.equal(push.body.getMassProperties().mass,24);
  assert.equal(push.transformNode.metadata.interaction.transport.disabled,true);
  assert.notEqual(push.transformNode.metadata.interaction.grip.disabled,true);
  assert.equal(fixture('no-grab-panel').transformNode.metadata.interaction.grip.disabled,true);
  assert.notEqual(fixture('grip-panel').transformNode.metadata.interaction.grip.disabled,true);
  assert.equal(fixture('suspended-grip').transformNode.metadata.interaction.grip.suspended,true);
  push.body.applyImpulse(new Vector3(48,0,0),push.transformNode.position);run(s,15);
  assert.ok(push.transformNode.position.x>14.1,'carrying-disabled fixture still responds to a physical push');
  s.reset();assert.equal(fixture('push-crate').transformNode.position.x,14);
  for(const label of FIXTURE_LABELS)assert.ok(fixture(label.fixture),label.fixture+' label target');
  assert.ok(COURSE_MARKERS.some(marker=>marker.id==='carry-target'));
  assert.ok(COURSE_MARKERS.some(marker=>marker.id==='push-target'));
 }finally{s.dispose();engine.dispose();}
});

test('beam checkpoint acquires both hands with a delayed second grip and lifts without floor anchors',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const station=STATIONS.find(station=>station.id==='carry'),checkpoint=station.checkpoints.find(checkpoint=>checkpoint.id==='beam');
  for(const settle of [0,180]){
   s.reset(Vector3.FromArray(checkpoint.spawn),'playground');run(s,settle);
   Object.assign(s.controller.input,{pitch:checkpoint.pitch??station.pitch??0,yaw:checkpoint.yaw??station.yaw??0,leftGrab:true});
   const advance=frames=>{for(let frame=0;frame<frames;frame++){s.step();for(const hand of Object.values(s.controller.handControl.sides))assert.notEqual(hand.grab?.body.transformNode.name,'Floor','beam reach must not anchor the character to the floor');}};
   advance(30);s.controller.input.rightGrab=true;advance(150);
   for(const hand of Object.values(s.controller.handControl.sides))assert.equal(hand.grab?.body.transformNode.metadata.fixtureId,'carry-beam','both hands hold the beam');
   const beam=s.world.find(aggregate=>aggregate.transformNode.metadata.fixtureId==='carry-beam');
   const startHeight=beam.transformNode.position.y;s.controller.input.pitch=-30;advance(120);
   assert.ok(beam.transformNode.position.y-startHeight>.6,'looking up raises the held beam');
   for(const hand of Object.values(s.controller.handControl.sides))assert.equal(hand.grab?.body.transformNode.metadata.fixtureId,'carry-beam');
   assert.ok(s.rig.diagnostics().finite);
  }
 }finally{s.dispose();engine.dispose();}
});

test('high bar supports two hands, one hand, and release onto the catch floor using player inputs',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground',spawn:new Vector3(3,1.65,5.4)});
 try{
  run(s,180);Object.assign(s.controller.input,{pitch:-45,leftGrab:true,rightGrab:true});run(s,30);
  Object.assign(s.controller.input,{z:1,jump:true});run(s,35);s.controller.input.z=0;run(s,90);
  const heldBar=()=>Object.values(s.controller.handControl.sides).filter(hand=>hand.grab?.body.transformNode.metadata.fixtureId==='traverse-bar').length;
  assert.equal(heldBar(),2,'both hands suspend from the high bar');assert.equal(s.controller.grounded,false);
  s.controller.input.leftGrab=false;run(s,90);assert.equal(heldBar(),1);assert.equal(s.controller.grounded,false);
  s.controller.input.rightGrab=false;s.controller.input.pitch=0;run(s,360);
  assert.equal(s.controller.handControl.count,0);assert.ok(s.controller.grounded);assert.ok(s.rig.parts.Ball.position.y<1);assert.ok(s.rig.diagnostics().finite);
 }finally{s.dispose();engine.dispose();}
});

test('all three raised gaps can be crossed and landed with movement and jump inputs',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  for(const [i,z] of [2.8,4.6,6.7].entries()){
   s.reset(new Vector3(-1,1.75,z),'playground');run(s,180);
   Object.assign(s.controller.input,{z:1,jump:true});
   let airborne=false,landingFrames=0;
   for(let frame=0;frame<180;frame++){
    if(i===0&&frame===20)s.controller.input.z=-1;
    if(frame===(i===0?30:22))s.controller.input.z=0;
    s.step();airborne ||= !s.controller.grounded;
    if(s.controller.groundBody?.transformNode.metadata.fixtureId==='jump-platform-'+(i+2))landingFrames++;
   }
   assert.ok(airborne,'gap '+i+' leaves support');assert.ok(landingFrames>90,'gap '+i+' stays on destination');
   assert.equal(s.controller.groundBody?.transformNode.metadata.fixtureId,'jump-platform-'+(i+2));
   assert.ok(s.rig.parts.Ball.position.y>1.45);assert.ok(s.rig.diagnostics().finite);
  }
 }finally{s.dispose();engine.dispose();}
});

test('rising lift and horizontal shuttle allow stable jumps to their landing pads',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  for(const route of [
   {spawn:[10,.8,2],yaw:0,ride:180,source:'lift',target:'lift-walkway',height:2.1},
   {spawn:[13,.8,6],yaw:90,ride:150,source:'shuttle',target:'shuttle-east',height:.55},
   {spawn:[13,.8,6],yaw:-90,ride:420,source:'shuttle',target:'shuttle-west',height:.55},
  ]){
   s.reset(Vector3.FromArray(route.spawn),'playground');s.controller.input.yaw=route.yaw;run(s,route.ride);
   assert.equal(s.controller.groundBody?.transformNode.metadata.fixtureId,route.source,'riding '+route.source);
   Object.assign(s.controller.input,{z:1,jump:true});let airborne=false,landingFrames=0;
   for(let frame=0;frame<180;frame++){
    if(frame===30)s.controller.input.z=0;s.step();airborne ||= !s.controller.grounded;
    if(s.controller.groundBody?.transformNode.metadata.fixtureId===route.target)landingFrames++;
   }
   assert.ok(airborne,route.target+' jump');assert.ok(landingFrames>90,route.target+' sustained landing');
   assert.equal(s.controller.groundBody?.transformNode.metadata.fixtureId,route.target);
   assert.ok(Math.abs(s.rig.parts.Ball.position.y-route.height)<.03);assert.ok(s.rig.diagnostics().finite);
  }
 }finally{s.dispose();engine.dispose();}
});

test('long steep face produces sustained descending Slide after many checkpoint resets',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  for(const station of STATIONS)for(const checkpoint of station.checkpoints){
   s.reset(Vector3.FromArray(checkpoint.spawn),'playground');
   Object.assign(s.controller.input,{yaw:checkpoint.yaw??0,pitch:checkpoint.pitch??station.pitch??0});run(s,240);
  }
  const station=STATIONS.find(station=>station.id==='slopes'),checkpoint=station.checkpoints.find(checkpoint=>checkpoint.id==='slide-face');
  s.reset(Vector3.FromArray(checkpoint.spawn),'playground');Object.assign(s.controller.input,{yaw:checkpoint.yaw,pitch:checkpoint.pitch});
  const fixture=id=>s.world.find(aggregate=>aggregate.transformNode.metadata.fixtureId===id);
  assert.equal(fixture('slope-20').transformNode.metadata.fixtureSize[2],5);
  assert.equal(fixture('slope-35').transformNode.metadata.fixtureSize[2],5);
  assert.equal(fixture('slope-50').transformNode.metadata.fixtureSize[2],10);
  const checks=new PlaygroundChecks();checks.select('slopes',s);
  let consecutive=0,longest=0,startHeight=null,descent=0;
  for(let frame=0;frame<600;frame++){
   s.step();checks.sample(s);
   if(s.controller.state==='Slide'&&s.controller.ground.bodies.has(fixture('slope-50').body)){
    startHeight??=s.rig.parts.Ball.position.y;consecutive++;longest=Math.max(longest,consecutive);descent=Math.max(descent,startHeight-s.rig.parts.Ball.position.y);
   }else{consecutive=0;startHeight=null;}
  }
  assert.ok(longest*spec.fixedDeltaTime>=.4,'sustained Slide contact');assert.ok(descent>.2,'height decreased on the steep face');
  assert.equal(checks.status.find(check=>check.id==='slide').complete,true);assert.ok(s.rig.diagnostics().finite);
 }finally{s.dispose();engine.dispose();}
});

test('corridor has a clear right turn beyond the low passage',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const physics=s.scene.getPhysicsEngine();
  assert.equal(physics.raycast(new Vector3(7,1,15.5),new Vector3(10,1,15.5),{collideWith:WORLD_MASK}).hasHit,false);
  assert.equal(physics.raycast(new Vector3(7,1,13.2),new Vector3(10,1,13.2),{collideWith:WORLD_MASK}).hasHit,true);
 }finally{s.dispose();engine.dispose();}
});

test('panel grips and suspended fixture respond differently to the same reach inputs',()=>{
 const engine=new NullEngine(),s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const held=id=>Object.values(s.controller.handControl.sides).filter(hand=>hand.grab?.body.transformNode.metadata.fixtureId===id).length;
  for(const [x,id,pitch,expected] of [[11,'no-grab-panel',-15,0],[14,'grip-panel',-15,2],[17,'suspended-grip',35,0]]){
   s.reset(new Vector3(x,.55,12.3),'playground');run(s,180);
   Object.assign(s.controller.input,{pitch,z:.3,leftGrab:true,rightGrab:true});run(s,240);assert.equal(held(id),expected,id);
  }
  const amber=s.world.find(a=>a.transformNode.metadata.fixtureId==='suspended-grip');
  amber.transformNode.metadata.interaction.grip.suspended=false;s.controller.input.z=0;run(s,240);assert.equal(held('suspended-grip'),2,'resuming allows acquisition');
  amber.transformNode.metadata.interaction.grip.suspended=true;run(s,1);assert.equal(held('suspended-grip'),0,'suspending releases held constraints');
  run(s,90);assert.equal(held('suspended-grip'),0,'suspended grips cannot reacquire');
 }finally{s.dispose();engine.dispose();}
});

test('wayfinding signs remain visual and are hidden through the returned mesh list',()=>{
 const engine=new NullEngine();
 engine.createCanvas=(width,height)=>({width,height,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})});
 const s=createSimulation(engine,havok,spec,{scenario:'playground'});
 try{
  const bodyCount=s.scene.getPhysicsEngine().getBodies().length;
  const signs=createStationSigns(s.scene,STATIONS);
  assert.ok(signs.length>STATIONS.length*3,'course markers, fixture labels, and route arrows');
  assert.equal(s.scene.getPhysicsEngine().getBodies().length,bodyCount);
  for(const sign of signs){assert.equal(sign.isPickable,false);assert.equal(sign.metadata.decorative,true);assert.equal(sign.physicsBody,undefined);sign.setEnabled(false);assert.equal(sign.isEnabled(),false);}
  const billboard=signs.find(sign=>sign.billboardMode!==0),floor=signs.find(sign=>sign.name.startsWith('Floor marker:'));
  const camera=new FreeCamera('Sign clearance camera',billboard.position.clone(),s.scene);s.scene.activeCamera=camera;
  s.scene.onBeforeRenderObservable.notifyObservers(s.scene);assert.equal(billboard.visibility,0);assert.equal(floor.visibility,1);
  camera.position.addInPlace(new Vector3(6.5,0,0));camera.getViewMatrix(true);s.scene.onBeforeRenderObservable.notifyObservers(s.scene);assert.ok(Math.abs(billboard.visibility-.5)<1e-6);
  camera.position.addInPlace(new Vector3(4,0,0));camera.getViewMatrix(true);s.scene.onBeforeRenderObservable.notifyObservers(s.scene);assert.equal(billboard.visibility,1);assert.equal(billboard.isEnabled(),false);
 }finally{s.dispose();engine.dispose();}
});
