import {Quaternion, Vector3} from '@babylonjs/core';
import {solveAcceleration} from './acceleration-control.js';
import {clamp, clampVector, rotate} from './physics.js';
import {mix, planar} from './control-math.js';

export function interactionProfile(metadata) {
  const {grip = {}, transport = {}, alignment = {}} = metadata?.interaction || {};
  const stiffness = alignment.stiffness ?? 1000;
  const requestedTorque = alignment.maximumTorque ?? stiffness;
  return {
    grip: {
      disabled: !!grip.disabled, suspended: !!grip.suspended,
      anchor: grip.anchor, preferred: grip.preferred,
      contactRadius: Math.max(.5, grip.contactRadius ?? .5),
      reactionScale: grip.reactionScale ?? 1,
    },
    transport: {
      disabled: !!transport.disabled, strength: transport.strength ?? 1,
      decayDistance: transport.decayDistance ?? 1,
      angularResistance: transport.angularResistance ?? 1,
    },
    alignment: {
      axis: alignment.axis, horizontal: !!alignment.horizontal,
      directed: !!alignment.directed, stiffness,
      maximumTorque: Number.isFinite(requestedTorque) ? requestedTorque : stiffness,
      angleExponent: alignment.angleExponent ?? .5,
      distanceExponent: alignment.distanceExponent ?? 1,
    },
  };
}

export function reachForce({offset, relativeVelocity, holding, dynamicMass, pitch, dt}) {
  let effectiveMass = 20, budget = 300;
  if (holding) {
    effectiveMass += dynamicMass === null ? 50 : clamp(dynamicMass / 2, 0, 50);
    budget = mix(450, 800, (pitch - 50) / 30);
  }
  return solveAcceleration(offset, relativeVelocity, budget / effectiveMass, .1, dt)
    .scale(effectiveMass).add(Vector3.Up().scale(100));
}

export function reachReactions({force, offset, heading, holding, climbing, pitch, reactionScale}) {
  if (!holding) return [{recipient: 'hand', force}, {recipient: 'hips', force: force.negate()}];
  const direction = planar(heading).normalizeToNew();
  const backward = direction.scale(Math.min(0, Vector3.Dot(direction, force)));
  const remaining = force.subtract(backward), vertical = Vector3.Up().scale(force.y);
  const channels = [
    {recipient: 'chest', bias: force.scale(-.1).subtract(vertical.scale(.5)).subtract(remaining.scale(.25)), share: -.25},
    {recipient: 'ball', bias: vertical.scale(-.2).subtract(remaining.scale(.4)), share: -.75},
  ];
  const blend = clamp(offset.y + .5);
  const support = climbing ? clamp((pitch - 10) / 60) : 1;
  const reactions = channels.map(channel => ({recipient: channel.recipient,
    force: Vector3.Lerp(channel.bias, force.scale(channel.share * reactionScale), blend).scale(support)}));
  const verticalTotal = Math.abs(reactions[0].force.y + reactions[1].force.y);
  if (verticalTotal > 600) reactions.forEach(reaction => reaction.force.scaleInPlace(600 / verticalTotal));
  return [...reactions, {recipient: 'hand', force: reactions[0].force.add(reactions[1].force).negate()}];
}

export function transportForce({mass, distance, direction, transport}) {
  const half = transport.decayDistance;
  if (!(half > 0)) throw new Error('Interaction transport decayDistance must be positive');
  const attenuation = (.5 + .5 * clamp(mass / 100)) * transport.strength * half / (half + distance);
  return new Vector3(direction.x * 200, Math.max(0, direction.y) * 500, direction.z * 200).scale(attenuation);
}

export function transportDrag(angularVelocity, angularResistance) {
  return angularVelocity.scale(-.1)
    .subtract(angularVelocity.normalizeToNew().scale(angularVelocity.lengthSquared() * .1)).scale(angularResistance);
}

export function alignmentTorque({alignment, direction, distance, angularVelocity, policy}) {
  let desired = policy.horizontal ? planar(direction).normalizeToNew() : direction;
  const cosine = Vector3.Dot(alignment, desired);
  let limit = policy.maximumTorque;
  if (policy.directed) limit *= Math.pow(clamp(.5 + cosine / 2), policy.angleExponent);
  else {
    if (cosine < 0) desired = desired.negate();
    limit *= Math.pow(Math.abs(cosine), policy.angleExponent);
  }
  limit *= Math.pow(distance, policy.distanceExponent);
  const speed = angularVelocity.length();
  const prediction = speed > 1e-8 ? Quaternion.RotationAxis(angularVelocity.normalizeToNew(), speed * .1) : Quaternion.Identity();
  const axis = Vector3.Cross(rotate(alignment, prediction), desired);
  return clampVector(axis.normalizeToNew().scale(Math.asin(clamp(axis.length())) * policy.stiffness), limit);
}

export function segmentDistance(start, end, point) {
  const direction = end.subtract(start);
  const fraction = direction.lengthSquared() > 1e-10 ? clamp(Vector3.Dot(point.subtract(start), direction) / direction.lengthSquared()) : 0;
  return Vector3.Distance(point, start.add(direction.scale(fraction)));
}

export function anchorAttraction({point, handPosition, shoulder, desired}) {
  const distance = segmentDistance(shoulder, desired, point);
  if (distance > .5) return null;
  const snap = distance < .3 && Vector3.Distance(handPosition, point) < .3;
  return {point, snap, target: snap ? point : desired.add(point.subtract(desired).scale(clamp((.5 - distance) / .2)))};
}

export function castScore({point, radius, preferred, desired, shoulder, end}) {
  const facing = Vector3.Dot(desired.subtract(shoulder).normalizeToNew(), point.subtract(shoulder).normalizeToNew());
  if (!preferred && (radius > .2 || facing < .7)) return null;
  return (Vector3.Distance(end, point) + radius / 10) / (preferred ? 100 : 1);
}

const attractionPolicies = {
  preferred: {segmentSnap: .2, endpointSnap: .5, outerDistance: .5, transition: .3},
  surface: {segmentSnap: .1, endpointSnap: .1, outerDistance: .2, transition: .1},
};
export function castAttraction({start, end, handPosition, point, preferred}) {
  const separation = segmentDistance(start, end, point), correction = point.subtract(end);
  const policy = preferred ? attractionPolicies.preferred : attractionPolicies.surface;
  const snap = preferred
    ? separation < policy.segmentSnap && Vector3.Distance(handPosition, point) < policy.endpointSnap
    : separation < policy.segmentSnap && correction.length() < policy.endpointSnap;
  const weight = clamp((policy.outerDistance - separation) / policy.transition);
  return {snap, target: snap ? point : end.add(correction.scale(weight))};
}

export function contactAccepted({target, point, normal, handPosition, handCenter, grounded, dynamic, grip}) {
  if (Vector3.Distance(target, point) > grip.contactRadius) return false;
  if (!grounded || grip.preferred) return true;
  // Havok can report the opposite normal when native body ordering changes.
  if (Vector3.Dot(normal, handCenter.subtract(point)) < 0) normal = normal.negate();
  const approach = handPosition.subtract(target);
  return Vector3.Dot(normal, approach.normalizeToNew()) >= (dynamic ? .4 : .7)
    && Vector3.Dot(normal, approach) >= (dynamic ? .05 : .2);
}

export function gripGate(memory, requested, pitch, dt) {
  const delay = .1 + .14 * Math.abs(pitch - memory.grabAngle) / 80;
  const released = !requested && memory.grabEnabled;
  const grabTime = released ? 0 : memory.grabTime + dt;
  return {extend: requested ? 1 : 0, grabTime, grabAngle: released ? pitch : memory.grabAngle,
    grabEnabled: requested && grabTime > 2 * delay && memory.blockTime === 0};
}
