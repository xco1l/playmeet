import {Matrix, PhysicsShapeSphere, Quaternion, ShapeCastResult, Vector3} from '@babylonjs/core';
import {clampVector, WORLD_MASK} from './physics.js';
import {anchorAttraction, castAttraction, castScore, contactAccepted, interactionProfile} from './interaction-policy.js';
export {segmentDistance} from './interaction-policy.js';

export function bodyFrame(body) {
  const node = body.transformNode;
  node.computeWorldMatrix(true);
  const matrix = node.getWorldMatrix();
  return {position: node.getAbsolutePosition(), rotation: node.absoluteRotationQuaternion,
    local: point => Vector3.TransformCoordinates(point, Matrix.Invert(matrix)),
    world: point => Vector3.TransformCoordinates(point, matrix)};
}
export const bodyCOM = body => bodyFrame(body).world(body.getMassProperties().centerOfMass || Vector3.Zero());
export const unavailable = body => {
  if (body.isDisposed) return true;
  const {grip} = interactionProfile(body.transformNode.metadata);
  return grip.disabled || grip.suspended;
};

export class ReachSearch {
  constructor(controller) {
    this.c = controller;
    this.plugin = controller.engine.getPhysicsPlugin();
    this.probes = [.05, .1, .15, .2, .25, .3, .35, .4, .45, .5].map(radius => {
      const shape = new PhysicsShapeSphere(Vector3.Zero(), radius, controller.rig.scene);
      shape.filterMembershipMask = shape.filterCollideMask = WORLD_MASK;
      return {radius, shape};
    });
  }
  helper(hand, shoulder, desired) {
    for (const body of this.c.engine.getBodies()) {
      const anchor = interactionProfile(body.transformNode.metadata).grip.anchor;
      if (!anchor || unavailable(body)) continue;
      const point = bodyFrame(body).world(Vector3.FromArray(anchor));
      const attraction = anchorAttraction({point, handPosition: hand.part.position, shoulder, desired});
      if (attraction) return {body, ...attraction};
    }
    return null;
  }
  find(hand, desired, shoulder) {
    const helper = this.helper(hand, shoulder, desired);
    if (helper) return helper;
    const end = hand.part.position.add(clampVector(desired.subtract(hand.part.position), .3));
    const start = hand.pos.clone();
    hand.pos = end.clone();
    if (Vector3.DistanceSquared(start, end) < 1e-10) return null;
    let winner = null, minimum = Infinity;
    for (const {radius, shape} of this.probes) {
      const hit = new ShapeCastResult();
      this.plugin.shapeCast({shape, rotation: Quaternion.Identity(), startPosition: start, endPosition: end, shouldHitTriggers: false}, new ShapeCastResult(), hit);
      if (!hit.hasHit || !hit.body || unavailable(hit.body)) continue;
      const tagged = interactionProfile(hit.body.transformNode.metadata).grip.preferred === true;
      const point = hit.hitPoint;
      const score = castScore({point, radius, preferred: tagged, desired, shoulder, end});
      if (score === null) continue;
      if (score < minimum) {minimum = score; winner = {body: hit.body, point: point.clone(), tagged};}
    }
    if (!winner) return null;
    return {...winner, ...castAttraction({start, end, handPosition: hand.part.position, point: winner.point, preferred: winner.tagged})};
  }
  accept(hand, contact) {
    const {body, point, normal} = contact;
    if (unavailable(body)) return false;
    return contactAccepted({target: hand.target, point, normal, handPosition: hand.part.position,
      handCenter: hand.part.com, grounded: this.c.grounded, dynamic: body.getMotionType() === 2,
      grip: interactionProfile(body.transformNode.metadata).grip});
  }
  dispose() {this.probes.forEach(probe => probe.shape.dispose());}
}
