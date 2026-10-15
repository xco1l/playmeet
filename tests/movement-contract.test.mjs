import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {fixture, run, centerVelocity, range} from './support/fixture.mjs';

for (const [input, forward] of [
  [{z: 1}, [0, 0, 1]], [{z: -1}, [0, 0, -1]], [{x: 1}, [1, 0, 0]], [{x: -1}, [-1, 0, 0]],
  [{z: 1, yaw: 90}, [1, 0, 0]], [{z: 1, yaw: -90}, [-1, 0, 0]], [{z: 1, yaw: 180}, [0, 0, -1]],
]) {
  test(`movement direction follows ${JSON.stringify(input)}`, () => {
    const {sim, close} = fixture();
    try {
      run(sim, 600); const start = sim.rig.parts.Ball.position.clone(); Object.assign(sim.controller.input, input); run(sim, 180);
      const direction = Vector3.FromArray(forward), travel = sim.rig.parts.Ball.position.subtract(start);
      assert.ok(Vector3.Dot(travel, direction) > 6.5, `travel ${travel.asArray()}`);
      assert.ok(travel.subtract(direction.scale(Vector3.Dot(travel, direction))).length() < 1.1);
      assert.ok(sim.rig.diagnostics().finite); assert.ok(sim.rig.diagnostics().maxAnchorError < .04);
    } finally {close();}
  });
}
for (const [amount, minimum, maximum] of [[.25, .65, .98], [.5, 1.25, 1.7], [1, 2.7, 3.15]]) {
  test(`analog movement ${amount} retains its speed band`, () => {
    const {sim, close} = fixture();
    try {run(sim, 600); sim.controller.input.z = amount; run(sim, 180); const speed = centerVelocity(sim).z; assert.ok(speed > minimum && speed < maximum, `speed ${speed}`);} finally {close();}
  });
}
test('diagonal input is normalized rather than gaining extra rolling speed', () => {
  const speeds = [];
  for (const input of [{z: 1}, {x: 1, z: 1}]) {
    const {sim, close} = fixture();
    try {run(sim, 600); Object.assign(sim.controller.input, input); run(sim, 180); const v = centerVelocity(sim); speeds.push(Math.hypot(v.x, v.z));} finally {close();}
  }
  assert.ok(speeds[1] / speeds[0] > .85 && speeds[1] / speeds[0] < 1.15);
});
test('walking animates both legs and hands while preserving height', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 600); sim.controller.input.z = 1; run(sim, 60);
    const samples = Object.fromEntries(['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].map(name => [name, []]));
    for (let i = 0; i < 180; i++) {sim.step(); for (const name of Object.keys(samples)) samples[name].push(sim.rig.parts[name].com.z - sim.rig.parts.Hips.com.z);}
    for (const [name, values] of Object.entries(samples)) assert.ok(range(values) > .12, name + ' must move relative to the trunk');
    assert.ok(sim.rig.diagnostics().headHeight > 1.25 && sim.rig.diagnostics().headHeight < 1.5);
  } finally {close();}
});
test('releasing movement input brakes and settles without continuing the walk state', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 600); sim.controller.input.z = 1; run(sim, 120); sim.controller.input.z = 0;
    run(sim, 240); assert.equal(sim.controller.state, 'Idle'); assert.ok(sim.rig.diagnostics().speed < .18);
  } finally {close();}
});
