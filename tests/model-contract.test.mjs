import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {fixture, run, dimensions, spec} from './support/fixture.mjs';

// These are metre-based compatibility requirements, not serialized game assets.
const envelopes = {
  Head: [.46, .46, .46], Chest: [.5, .28, .28], Waist: [.52, .34, .34], Hips: [.54, .3, .3],
  Ball: [.6, .6, .6], Arm: [.12, .4, .12], Forearm: [.12, .4, .12],
  Hand: [.14, .14, .14], Thigh: [.16, .3, .16], Leg: [.12, .22, .12], Foot: [.11, .11, .11],
};
for (const [name, expected] of Object.entries(envelopes)) {
  test(`${name} mesh retains its physical envelope`, () => {
    const {sim, close} = fixture();
    try {
      const part = sim.rig.parts[name] ?? sim.rig.parts['Left' + name];
      const measured = dimensions(part).asArray();
      expected.forEach((value, axis) => assert.ok(Math.abs(measured[axis] - value) < .003, `${name} axis ${axis}: ${measured[axis]}`));
    } finally {close();}
  });
}
test('model mass and body count match the locomotion and jump contract', () => {
  const {sim, close} = fixture();
  try {
    assert.equal(Object.keys(sim.rig.parts).length, 17);
    assert.ok(Math.abs(Object.values(sim.rig.parts).reduce((sum, part) => sum + part.mass, 0) - 104) < .001);
    assert.ok(Math.abs(spec.totalMass - 104) < .001);
    assert.ok(Math.abs(sim.rig.parts.Ball.mass - 20) < .001);
    for (const side of ['Left', 'Right']) for (const suffix of ['Arm', 'Forearm', 'Hand', 'Thigh', 'Leg', 'Foot']) {
      assert.ok(Math.abs(sim.rig.parts[side + suffix].mass - 5) < .001, side + suffix);
    }
  } finally {close();}
});
for (const suffix of ['Arm', 'Forearm', 'Hand', 'Thigh', 'Leg', 'Foot']) {
  test(`${suffix} dimensions and neutral placement remain bilateral`, () => {
    const {sim, close} = fixture();
    try {
      const left = sim.rig.parts['Left' + suffix], right = sim.rig.parts['Right' + suffix];
      assert.ok(Vector3.Distance(dimensions(left), dimensions(right)) < .001);
      assert.ok(Math.abs(left.position.x + right.position.x) < .003);
      assert.ok(Math.abs(left.position.y - right.position.y) < .003);
      assert.ok(Math.abs(left.position.z - right.position.z) < .003);
    } finally {close();}
  });
}
for (const frames of [360, 600, 1200, 2400]) {
  test(`standing silhouette and support remain stable after ${frames} ticks`, () => {
    const {sim, close} = fixture();
    try {
      run(sim, frames); const p = sim.rig.parts, d = sim.rig.diagnostics();
      assert.ok(d.finite); assert.ok(d.headHeight > 1.31 && d.headHeight < 1.45, `head height ${d.headHeight}`);
      assert.ok(Math.abs(p.Ball.position.y - .3) < .015);
      assert.ok(d.maxAnchorError < .025); assert.ok(d.speed < .16);
      assert.ok(p.Chest.com.y > p.Waist.com.y && p.Waist.com.y > p.Hips.com.y);
      assert.ok(sim.controller.grounded);
    } finally {close();}
  });
}
test('translated spawns retain the same settled dimensions and ground clearance', () => {
  const outcomes = [];
  for (const spawn of [new Vector3(0, .55, 0), new Vector3(4, .55, -3)]) {
    const {sim, close} = fixture({spawn});
    try {run(sim, 600); outcomes.push(sim.rig.diagnostics());} finally {close();}
  }
  assert.ok(Math.abs(outcomes[0].headHeight - outcomes[1].headHeight) < .03);
  assert.ok(Math.abs(outcomes[0].ballHeight - outcomes[1].ballHeight) < .003);
});
