import {Vector3} from '@babylonjs/core';
import {angularImpulseFromAcceleration, clamp, rotate} from './physics.js';
import {orientation} from './control-math.js';
import {bodyCOM, bodyFrame} from './grip-targets.js';
import {alignmentTorque, interactionProfile, reachForce, reachReactions, transportDrag, transportForce} from './interaction-policy.js';

export class GripForces {
  constructor(controller) {this.c = controller;}
  reach(hand, target) {
    const c = this.c, part = hand.part, offset = target.subtract(part.com);
    const relativeVelocity = part.velocity.subtract(c.p.Ball.velocity);
    const body = hand.grab?.body;
    const force = reachForce({offset, relativeVelocity, holding: !!body,
      dynamicMass: body?.getMotionType() === 2 ? body.getMassProperties().mass : null,
      pitch: c.input.pitch, dt: c.dt});
    const plan = reachReactions({force, offset, heading: c.target, holding: !!body,
      climbing: c.state === 'Climb', pitch: c.input.pitch,
      reactionScale: interactionProfile(body?.transformNode.metadata).grip.reactionScale});
    const recipients = {hand: part, hips: c.p.Hips, chest: c.p.Chest, ball: c.p.Ball};
    for (const effect of plan) recipients[effect.recipient].addForce(effect.force);
  }
  aim(hand, body, policy, direction, distance, angularVelocity) {
    if (!policy.axis || policy.axis === 'none') return;
    const alignment = policy.axis === 'forward' ? rotate(Vector3.Forward(), bodyFrame(body).rotation) : bodyCOM(body).subtract(hand.part.position).normalizeToNew();
    const torque = alignmentTorque({alignment, direction, distance, angularVelocity, policy});
    body.applyAngularImpulse(torque.scale(this.c.dt));
  }
  carry(hand) {
    const c = this.c, body = hand.grab.body;
    const profile = interactionProfile(body.transformNode.metadata);
    if (c.ground.bodies.has(body) || profile.transport.disabled) return;
    const properties = body.getMassProperties(), center = bodyCOM(body);
    const direction = rotate(Vector3.Forward(), orientation(c.input.yaw, clamp(c.input.pitch, -70, 80)));
    const distance = Vector3.Distance(hand.part.position, center);
    const force = transportForce({mass: properties.mass, distance, direction, transport: profile.transport});
    body.applyImpulse(force.scale(c.dt), center);
    hand.part.addForce(force.scale(-.5)); c.p.Chest.addForce(force.scale(-.5));
    const angularVelocity = body.getAngularVelocity();
    const drag = transportDrag(angularVelocity, profile.transport.angularResistance);
    body.applyAngularImpulse(angularImpulseFromAcceleration(drag, bodyFrame(body).rotation, properties, c.dt));
    this.aim(hand, body, profile.alignment, direction, distance, angularVelocity);
  }
}
