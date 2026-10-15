import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion, Vector3} from '@babylonjs/core';
import {accelerationFromTime, solveAcceleration, timeFromAcceleration} from '../src/acceleration-control.js';
import {lookAcceleration, vectorTorque} from '../src/control-math.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, a + ' != ' + b);
for (const distance of [.01, .1, 1, 10]) {
  test('rest-to-rest acceleration obeys the analytical travel time ' + distance, () => {
    const acceleration = 15, duration = 2 * Math.sqrt(distance / acceleration);
    near(timeFromAcceleration(0, distance, acceleration), duration);
    near(accelerationFromTime(0, distance, duration), acceleration);
  });
}
for (const [velocity, distance, acceleration] of [[2, 3, 8], [-2, 3, 8], [5, 1, -12], [0, -2, -8]]) {
  test('scalar trajectory inversion ' + [velocity, distance, acceleration], () => {
    const time = timeFromAcceleration(velocity, distance, acceleration);
    assert.ok(time >= 0 && time < 10000);
    const solved = accelerationFromTime(velocity, distance, time);
    near(timeFromAcceleration(velocity, distance, solved), time);
  });
}
test('degenerate scalar trajectories have explicit unreachable results', () => {
  assert.equal(timeFromAcceleration(0, 0, 0), 0);
  assert.equal(timeFromAcceleration(2, 4, 0), 2);
  assert.equal(timeFromAcceleration(-2, 4, 0), 10000);
  assert.equal(timeFromAcceleration(0, 1, -1), 10000);
  assert.throws(() => accelerationFromTime(0, 1, 0), /Time/);
});
for (const [maximum, deadZone, dt] of [[0, .1, .02], [15, 0, .02], [15, .1, 0], [-1, .1, .02]]) {
  test('trajectory rejects invalid parameters ' + [maximum, deadZone, dt], () => assert.throws(() => solveAcceleration(Vector3.One(), Vector3.Zero(), maximum, deadZone, dt)));
}
for (const offset of [[1, 0, 0], [0, 2, 1], [-1, .5, 2], [.001, 0, 0]]) {
  test('trajectory response is odd and bounded ' + offset, () => {
    const displacement = Vector3.FromArray(offset), velocity = new Vector3(1, -.5, 2);
    const a = solveAcceleration(displacement, velocity, 15, .1, 1 / 60);
    const b = solveAcceleration(displacement.negate(), velocity.negate(), 15, .1, 1 / 60);
    assert.ok(a.add(b).length() < 1e-9);
    assert.ok(a.length() <= 15.0000001 && a.asArray().every(Number.isFinite));
  });
}
test('trajectory response is invariant under a rigid rotation', () => {
  const q = Quaternion.RotationYawPitchRoll(.8, -.4, .3), x = new Vector3(.2, .4, -.3), v = new Vector3(2, -1, 1);
  const a = solveAcceleration(x, v, 20, .1, .02).applyRotationQuaternion(q);
  const b = solveAcceleration(x.applyRotationQuaternion(q), v.applyRotationQuaternion(q), 20, .1, .02);
  assert.ok(a.subtract(b).length() < 1e-7);
});
test('zero offset cancels a small velocity in one timestep without overshooting', () => {
  const velocity = new Vector3(.01, -.02, .03);
  const acceleration = solveAcceleration(Vector3.Zero(), velocity, 15, .1, .02);
  assert.ok(velocity.add(acceleration.scale(.02)).length() < 1e-10);
});
test('dead zone reduces acceleration continuously near the target', () => {
  const a = solveAcceleration(new Vector3(.05, 0, 0), Vector3.Zero(), 15, .1, .02);
  near(a.length(), 7.5);
});
test('quaternion sign represents the same look acceleration', () => {
  const current = Quaternion.RotationYawPitchRoll(.2, .1, 0), desired = Quaternion.RotationYawPitchRoll(1, -.3, .1), w = new Vector3(.2, .3, .4);
  assert.ok(lookAcceleration(current, desired, w, 4, 20).subtract(lookAcceleration(current, desired.scale(-1), w, 4, 20)).length() < 1e-8);
});
test('look response uses degrees for stiffness and radians per second for damping', () => {
  const acceleration = lookAcceleration(Quaternion.Identity(), Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2), new Vector3(0, 1, 0), 4, 20);
  near(acceleration.y, 340); near(acceleration.x, 0); near(acceleration.z, 0);
});
test('aligned vector controller damps predicted motion and respects the torque budget', () => {
  const torque = vectorTorque(Vector3.Up(), Vector3.Up(), new Vector3(1, 0, 0), 100, 5);
  assert.ok(torque.x < 0 && torque.length() <= 5.00001);
});
test('vector alignment leaves exactly antiparallel directions as a singular equilibrium', () => {
  assert.equal(vectorTorque(Vector3.Up(), Vector3.Down(), Vector3.Zero(), 100).length(), 0);
});