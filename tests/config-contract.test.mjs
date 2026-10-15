import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacter} from '../scripts/create-character.mjs';
import {validateCharacter} from '../src/physics.js';
import {fixture, spec} from './support/fixture.mjs';

test('distributed character data is reproducible without external game files', () => {
  assert.deepEqual(createCharacter(), spec);
  assert.doesNotThrow(() => validateCharacter(spec));
  const text = JSON.stringify(spec);
  assert.ok(!/m_PathID|m_GameObject|m_ConnectedBody|transformChain|Unity|HFF|Human_Data/.test(text));
});
for (const [label, corrupt] of [
  ['schema', s => s.schema = 0], ['timestep', s => s.fixedDeltaTime = 0],
  ['duplicate body', s => s.bodies[1].name = s.bodies[0].name],
  ['negative mass', s => s.bodies[0].mass = -1],
  ['total mass', s => s.totalMass = 1], ['nonfinite pose', s => s.bodies[0].position[0] = NaN],
  ['radius', s => s.bodies[0].shape.radius = 0], ['primitive', s => s.bodies[0].shape.kind = 'mesh'],
  ['capsule axis', s => s.bodies[0].shape.axis = 5],
  ['capsule length', s => s.bodies[0].shape.length = .01],
  ['unknown joint', s => s.bodies[0].joint.parent = 'Missing'],
]) {
  test('configuration rejects invalid ' + label, () => {
    const changed = structuredClone(spec); corrupt(changed);
    assert.throws(() => validateCharacter(changed));
  });
}
test('collision filters are reciprocal and isolate the rolling support', () => {
  const {sim, close} = fixture();
  try {
    const parts = Object.values(sim.rig.parts);
    for (const a of parts) for (const b of parts) {
      const ab = !!(a.shape.filterCollideMask & b.shape.filterMembershipMask);
      const ba = !!(b.shape.filterCollideMask & a.shape.filterMembershipMask);
      assert.equal(ab, ba, a.name + '/' + b.name);
      if (a.name === 'Ball') assert.equal(ab, false);
    }
    assert.ok(sim.rig.parts.LeftHand.shape.filterCollideMask & sim.rig.parts.Chest.shape.filterMembershipMask);
    assert.equal(sim.rig.parts.LeftForearm.shape.filterCollideMask & sim.rig.parts.Chest.shape.filterMembershipMask, 0);
  } finally {close();}
});
test('leg axes point down and arm axes remain mirrored in the initial pose', () => {
  const {sim, close} = fixture();
  try {
    for (const side of ['Left', 'Right']) {
      assert.ok(sim.rig.parts[side + 'Thigh'].up.y < -.999);
      assert.ok(sim.rig.parts[side + 'Leg'].up.y < -.999);
    }
    assert.ok(sim.rig.parts.LeftArm.up.x < -.9);
    assert.ok(sim.rig.parts.RightArm.up.x > .9);
  } finally {close();}
});