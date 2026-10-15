import {Quaternion, Vector3} from '@babylonjs/core';
import {clamp, clampVector, RAD, rotate} from './physics.js';

export const planar = v => new Vector3(v.x, 0, v.z);
export const mix = (a, b, t) => a + (b - a) * clamp(t);
export const orientation = (yaw, pitch = 0) => Quaternion.RotationYawPitchRoll(yaw * RAD, pitch * RAD, 0);
export const momentum = parts => Object.values(parts).reduce((sum, part) => sum.add(part.velocity.scale(part.mass)), Vector3.Zero());

export function lookAcceleration(current, desired, velocity, stiffness, damping) {
  let difference = desired.multiply(current.conjugate()).normalize();
  if (difference.w < 0) difference = difference.scale(-1);
  const sine = Math.sqrt(Math.max(0, 1 - difference.w ** 2));
  const direction = sine > 1e-7 ? new Vector3(difference.x / sine, difference.y / sine, difference.z / sine) : Vector3.Zero();
  const angleInDegrees = 2 * Math.acos(clamp(difference.w, -1, 1)) / RAD;
  return direction.scale(angleInDegrees * stiffness).subtract(velocity.scale(damping));
}

export function vectorTorque(alignment, desired, velocity, stiffness, maximum = stiffness) {
  const speed = velocity.length();
  const advance = speed > 1e-8 ? Quaternion.RotationAxis(velocity.scale(1 / speed), speed * .1) : Quaternion.Identity();
  const error = Vector3.Cross(rotate(alignment.normalizeToNew(), advance), desired.normalizeToNew());
  return clampVector(error.normalizeToNew().scale(Math.asin(clamp(error.length())) * stiffness), maximum);
}

export function alignLook(part, desired, stiffness, damping) {
  part.addTorque(lookAcceleration(part.rotation, desired, part.omega, stiffness, damping), true);
}
export function alignToVector(part, alignment, desired, stiffness, maximum = stiffness) {
  part.addTorque(vectorTorque(alignment, desired, part.omega, stiffness, maximum));
}