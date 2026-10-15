import {Scene,HavokPlugin,Vector3,Quaternion,MeshBuilder,PhysicsAggregate,PhysicsShapeType,StandardMaterial,Color3,PhysicsMaterialCombineMode} from '@babylonjs/core';
import {Ragdoll,WORLD_MASK} from './physics.js';
import {CharacterController} from './controller.js';
import {buildPlayground} from './playground.js';

export function createSimulation(engine,havok,spec,{obstacles=true,spawn=new Vector3(0,.55,0),scenario='lab'}={}) {
  const scene=new Scene(engine);
  const plugin=new HavokPlugin(false,havok);
  scene.enablePhysics(new Vector3(0,-9.81,0),plugin);
  const physics=scene.getPhysicsEngine();physics.setTimeStep(spec.fixedDeltaTime);
  // Babylon normally steps physics during rendering; that would double-step
  // this simulation, whose caller advances physics independently.
  scene.physicsEnabled=false;
  plugin.setVelocityLimits(100,50);
  const world=[];let worldTime=0,platform=null,lastInput=null,moving=[];
  function box(name,size,position,color,mass=0,pitch=0) {
    const mesh=MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},scene);mesh.position.copyFrom(Vector3.FromArray(position));
    mesh.rotationQuaternion=Quaternion.RotationAxis(Vector3.Right(),pitch);
    const mat=new StandardMaterial(name+' mat',scene);mat.diffuseColor=Color3.FromHexString(color);mat.specularColor.setAll(.05);mesh.material=mat;
    mesh.metadata={interaction:{grip:{},transport:{},alignment:{}}};
    const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass,friction:.65,restitution:0},scene);
    aggregate.shape.filterMembershipMask=WORLD_MASK;aggregate.shape.filterCollideMask=0xffffffff;
    aggregate.shape.material={friction:.65,staticFriction:.65,restitution:0,frictionCombine:PhysicsMaterialCombineMode.ARITHMETIC_MEAN};
    world.push(aggregate);return aggregate;
  }
  function buildWorld(){
    box('Floor',[scenario==='playground'?48:36,.2,scenario==='playground'?48:36],[0,-.1,0],'#303F4B');
    if(!obstacles)return;
    if(scenario==='playground')moving=buildPlayground(box);
    else if(scenario==='box')box('Crate · 12 kg',[.8,.8,.8],[0,.4,1],'#C89C65',12);
    else if(scenario==='ledge')box('Ledge · 1,3 m',[2,1.3,1.2],[0,.65,1.3],'#84998A');
    else if(scenario==='carry'){
      const plank=box('Beam · 8 kg',[.3,.3,1.8],[0,.15,1.2],'#C89C65',8);
      plank.transformNode.metadata.interaction={
        grip:{anchor:[0,.15,-.6],preferred:true},
        transport:{strength:1.2,decayDistance:1,angularResistance:2},
        alignment:{axis:'forward',stiffness:80,maximumTorque:40,distanceExponent:0},
      };
    }
    else if(scenario==='slope')box('Slope · 50°',[5,.3,10],[0,3,0],'#748797',0,50*Math.PI/180);
    else if(scenario==='platform'){
      platform=box('Moving platform',[4,.25,4],[0,.125,0],'#84998A');platform.body.setMotionType(1);
    }
    else {
      for(let i=0;i<4;i++)box('Step '+i,[1.8,.15*(i+1),.6],[3,.075*(i+1),1+i*.6],'#748797');
      box('Ledge',[3,1.25,.7],[-3,.625,3],'#84998A');
      box('Crate · 12 kg',[.55,.55,.55],[1.5,.35,2],'#C89C65',12);
    }
  }
  function clearWorld(){for(const aggregate of world){const mesh=aggregate.transformNode,material=mesh.material;aggregate.dispose();mesh.dispose();material?.dispose();}world.length=0;moving=[];platform=null;worldTime=0;}
  buildWorld();
  const startPosition=()=>scenario==='slope'?new Vector3(0,3.8,0):spawn;
  let rig=new Ragdoll(spec,scene,startPosition()),controller=new CharacterController(rig,physics);
  return {scene,plugin,world,addBox:box,get rig(){return rig;},get controller(){return controller;},get lastInput(){return lastInput;},
    step(){lastInput={...controller.input};worldTime+=spec.fixedDeltaTime;if(platform)platform.body.setTargetTransform(new Vector3(0,.125+.6*(1-Math.cos(worldTime)),0),Quaternion.Identity());for(const m of moving)m.body.setTargetTransform(Vector3.FromArray(m.position(worldTime)),Quaternion.Identity());controller.step();plugin.executeStep(spec.fixedDeltaTime,physics.getBodies());controller.handControl.afterStep();controller.afterStep();},
    reset(nextSpawn=spawn,nextScenario=scenario){controller.dispose();rig.dispose();scenario=nextScenario;spawn=nextSpawn;clearWorld();buildWorld();rig=new Ragdoll(spec,scene,startPosition());controller=new CharacterController(rig,physics);},
    dispose(){controller.dispose();scene.dispose();}
  };
}
