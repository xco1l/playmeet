import {Vector3} from '@babylonjs/core';
import {clamp, clampVector} from './physics.js';

const unreachable = 10000;
const switchAt = (velocity, acceleration, duration) => duration / 2 - velocity / (2 * acceleration);

export function timeFromAcceleration(velocity, distance, acceleration) {
  if (!acceleration) {
    if (!distance) return 0;
    return distance * velocity > 0 ? distance / velocity : unreachable;
  }
  const discriminant = 2 * velocity ** 2 + 4 * acceleration * distance;
  if (discriminant < 0) return unreachable;
  const candidates = [1, -1].map(sign => (-velocity + sign * Math.sqrt(discriminant)) / acceleration);
  const admissible = candidates.filter(duration => duration >= 0 && switchAt(velocity, acceleration, duration) >= 0);
  return admissible.length ? Math.min(...admissible) : unreachable;
}

export function accelerationFromTime(velocity, distance, duration) {
  if (duration === 0) throw new Error('Time must be nonzero');
  const b = duration * velocity - 2 * distance;
  const discriminant = Math.sqrt(b ** 2 + duration ** 2 * velocity ** 2);
  const candidates = [1, -1].map(sign => (-b + sign * discriminant) / duration ** 2);
  const admissible = candidates.filter(acceleration => switchAt(velocity, acceleration, duration) >= 0);
  if (!admissible.length) return unreachable;
  return admissible.reduce((best, candidate) => Math.abs(candidate) < Math.abs(best) ? candidate : best);
}

export function solveAcceleration(offset, velocity, maximum, deadZone, dt) {
  if (!(maximum > 0 && deadZone > 0 && dt > 0)) throw new Error('Positive controller parameters required');
  if (offset.lengthSquared() < 1e-10) return clampVector(velocity.scale(-1 / dt), maximum);
  const direction = offset.normalizeToNew();
  const distance = offset.length();
  const axialSpeed = Vector3.Dot(direction, velocity);
  const lateral = velocity.subtract(direction.scale(axialSpeed));
  const lateralSpeed = lateral.length();
  const budget = maximum * clamp(distance / deadZone);
  let duration = velocity.length() / budget;
  let axialAcceleration = 0, lateralAcceleration = 0;
  // Five fixed-point iterations are part of the discrete response contract.
  for (let iteration = 0; iteration !== 5; iteration++) {
    let braking = 0;
    if (duration !== 0 && lateralSpeed !== 0) {
      braking = lateralSpeed < budget * duration ? -lateralSpeed / duration : accelerationFromTime(lateralSpeed, 0, duration);
    }
    lateralAcceleration = clamp(braking, -.99 * budget, .99 * budget);
    axialAcceleration = Math.sqrt(Math.max(0, budget ** 2 - lateralAcceleration ** 2));
    const positive = timeFromAcceleration(axialSpeed, distance, axialAcceleration);
    const negative = timeFromAcceleration(axialSpeed, distance, -axialAcceleration);
    if (positive >= 0 && positive < negative) duration = positive;
    else {duration = negative; axialAcceleration *= -1;}
  }
  const fraction = duration < dt ? duration / dt : 1;
  return direction.scale(axialAcceleration * fraction).add(lateral.normalizeToNew().scale(lateralAcceleration * fraction));
}
