import {Vector3,Quaternion,PhysicsShapeSphere,ShapeCastResult} from '@babylonjs/core';
import {WORLD_MASK} from './physics.js';

// Casts start at the character's head; including its colliders would collapse
// camera distance even when the surrounding scene is unobstructed.
export class CameraBoom {
  constructor(scene,plugin){
    this.scene=scene;this.plugin=plugin;this.distance=null;this.radius=.25;
    this.shape=new PhysicsShapeSphere(Vector3.Zero(),.25,scene);
    this.shape.filterMembershipMask=WORLD_MASK;this.shape.filterCollideMask=WORLD_MASK;
    this.startHit=new ShapeCastResult();this.hit=new ShapeCastResult();
    scene.onDisposeObservable.add(()=>this.shape.dispose());
  }
  update(target,direction,desired,dt,nearPlaneRadius=.25){
    // Near-plane corners can clip a wall while the camera center stays clear.
    const radius=Math.max(.25,nearPlaneRadius);
    if(Math.abs(radius-this.radius)>.001){
      this.shape.dispose();this.radius=radius;this.shape=new PhysicsShapeSphere(Vector3.Zero(),radius,this.scene);
      this.shape.filterMembershipMask=WORLD_MASK;this.shape.filterCollideMask=WORLD_MASK;
    }
    this.startHit.reset();this.hit.reset();
    this.plugin.shapeCast({shape:this.shape,rotation:Quaternion.Identity(),startPosition:target,endPosition:target.add(direction.scale(desired)),shouldHitTriggers:false},this.startHit,this.hit);
    const limit=this.hit.hasHit?Math.max(.02,desired*this.hit.hitFraction-.03):desired;
    // Slow retraction would let the camera cross a wall before it catches up.
    this.distance=this.distance===null?limit:Math.min(limit,this.distance+Math.max(0,dt)*4);
    return this.distance;
  }
}
