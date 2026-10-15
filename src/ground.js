import {Vector3} from '@babylonjs/core';
import {clamp, clampVector, WORLD_MASK} from './physics.js';

const feet = ['Ball', 'LeftFoot', 'RightFoot'];
export class GroundContacts {
  constructor(controller) {
    Object.assign(this, {c: controller, pending: [], bodies: new Set(), angle: 0, velocity: Vector3.Zero()});
    this.observers = feet.map(name => {
      const part = controller.p[name];
      part.body.setCollisionCallbackEnabled(true);
      const token = part.body.getCollisionObservable().add(event => {
        if (!event.point || !event.normal || !(event.collidedAgainst.shape?.filterMembershipMask & WORLD_MASK)) return;
        let normal = event.normal.clone();
        if (Vector3.Dot(normal, part.com.subtract(event.point)) < 0) normal.negateInPlace();
        if (normal.y > .5 && event.point.y < part.com.y + .02) this.pending.push({body: event.collidedAgainst, normal});
      });
      return {part, token};
    });
  }
  include(body, normal) {
    if (!body || body.isDisposed) return;
    this.bodies.add(body);
    this.angle = Math.min(this.angle, Math.acos(clamp(normal.y, -1, 1)) * 180 / Math.PI);
  }
  sample() {
    this.bodies.clear(); this.angle = 90; this.velocity.setAll(0);
    for (const contact of this.pending) this.include(contact.body, contact.normal);
    this.pending = [];
    for (const name of feet) {
      const part = this.c.p[name], depth = (part.spec.shape.radius || .08) + .045;
      const hit = this.c.engine.raycast(part.com, part.com.subtract(new Vector3(0, depth, 0)), {collideWith: WORLD_MASK});
      if (hit.hasHit && hit.hitNormalWorld.y > .5) this.include(hit.body, hit.hitNormalWorld);
    }
    // Each component comes from the support moving fastest on that axis.
    for (const body of this.bodies) {
      const velocity = body.getLinearVelocity();
      for (const axis of ['x', 'y', 'z']) if (Math.abs(velocity[axis]) > Math.abs(this.velocity[axis])) this.velocity[axis] = velocity[axis];
    }
    return this.bodies.size !== 0;
  }
  distribute(force, point) {
    for (const body of this.bodies) {
      if (body.getMotionType() !== 2) continue;
      const impulse = force.scale(this.c.dt / this.bodies.size);
      body.applyImpulse(clampVector(impulse, body.getMassProperties().mass * 10), point);
    }
  }
  dispose() {this.observers.forEach(({part, token}) => part.body.getCollisionObservable().remove(token));}
}