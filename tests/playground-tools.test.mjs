import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaygroundTools} from '../src/playground-tools.js';
import {fixture, run} from './support/fixture.mjs';

function heldWall() {
  const f = fixture(); run(f.sim, 360);
  const wall = f.sim.addBox('Tool grip surface', [2, 2, .5], [0, 1, .9], '#7799bb');
  const c = f.sim.controller;
  c.input.leftGrab = c.input.rightGrab = true; run(f.sim, 180);
  assert.equal(c.handControl.count, 2);
  assert.ok(Object.values(c.handControl.sides).every(hand => hand.grab?.body === wall.body));
  return {...f, wall, c, tools: new PlaygroundTools()};
}

function stepWithTools(sim, tools, frames) {
  for (let frame = 0; frame < frames; frame++) {tools.step(sim.rig.spec.fixedDeltaTime); sim.step();}
}

test('temporary suspension releases native wall constraints and held input regrabs after one second', () => {
  const {sim, close, wall, c, tools} = heldWall();
  try {
    const grip = wall.transformNode.metadata.interaction.grip;
    assert.equal(tools.suspendGrips(sim), true);
    stepWithTools(sim, tools, 1);
    assert.equal(c.handControl.count, 0);
    for (const hand of Object.values(c.handControl.sides)) {
      assert.equal(hand.lastRelease, 'blocked'); assert.equal(hand.grabEnabled, false);
    }
    stepWithTools(sim, tools, 57);
    assert.equal(grip.suspended, true); assert.equal(c.handControl.count, 0);
    stepWithTools(sim, tools, 2);
    assert.equal(Object.hasOwn(grip, 'suspended'), false); assert.equal(tools.remaining, 0);
    stepWithTools(sim, tools, 180);
    assert.equal(c.handControl.count, 2);
    assert.ok(Object.values(c.handControl.sides).every(hand => hand.grab?.body === wall.body));
    assert.ok(sim.rig.diagnostics().finite);
  } finally {tools.reset(); close();}
});

for (const original of [undefined, false, true]) {
  test('tool reset restores the original grip suspension property ' + String(original), () => {
    const {sim, close, wall, tools} = heldWall();
    try {
      const grip = wall.transformNode.metadata.interaction.grip;
      if (original === undefined) delete grip.suspended; else grip.suspended = original;
      assert.equal(tools.suspendGrips(sim), true);
      tools.step(.2);
      tools.reset();
      assert.equal(grip.suspended, original);
      assert.equal(Object.hasOwn(grip, 'suspended'), original !== undefined);
      assert.equal(tools.remaining, 0); assert.equal(tools.suspended.size, 0); assert.equal(tools.message, '');
      tools.step(2);
      assert.equal(grip.suspended, original);
    } finally {tools.reset(); close();}
  });
}

test('load pulse breaks at least one real native grip with an overload reason', () => {
  const {sim, close, c, tools} = heldWall();
  try {
    assert.equal(tools.loadGrips(sim), true); sim.step();
    const hands = Object.values(c.handControl.sides);
    assert.ok(hands.some(hand => hand.lastRelease === 'overload' && hand.grab === null));
    assert.ok(c.handControl.count < 2); assert.ok(sim.rig.diagnostics().finite);
  } finally {close();}
});

test('controlled impact releases wall grips, enters recovery, and returns to upright support', () => {
  const {sim, close, c, tools} = heldWall();
  try {
    tools.impact(sim); sim.step();
    assert.equal(c.state, 'Unconscious'); assert.equal(c.handControl.count, 0);
    assert.ok(c.unconsciousTime > 2.9);
    c.input.leftGrab = c.input.rightGrab = false;
    run(sim, 120); assert.equal(c.state, 'Unconscious');
    run(sim, 720);
    assert.equal(c.state, 'Idle'); assert.ok(c.grounded);
    assert.ok(sim.rig.diagnostics().headHeight > 1); assert.ok(sim.rig.diagnostics().finite);
  } finally {close();}
});

test('amber fixture toggle changes native grip eligibility and releases held constraints', () => {
  const {sim, close} = fixture(); const tools = new PlaygroundTools();
  try {
    run(sim, 360);
    const wall = sim.addBox('Amber fixture', [2, 2, .5], [0, 1, .9], '#cca35e');
    wall.transformNode.metadata.fixtureId = 'suspended-grip';
    wall.transformNode.metadata.interaction.grip.suspended = true;
    const c = sim.controller; c.input.leftGrab = c.input.rightGrab = true;
    run(sim, 180); assert.equal(c.handControl.count, 0);
    assert.equal(tools.toggleSuspendedFixture(sim), false);
    run(sim, 180); assert.equal(c.handControl.count, 2);
    assert.equal(tools.toggleSuspendedFixture(sim), true);
    sim.step(); assert.equal(c.handControl.count, 0);
    assert.ok(Object.values(c.handControl.sides).every(hand => hand.lastRelease === 'blocked'));
    assert.ok(sim.rig.diagnostics().finite);
  } finally {tools.reset(); close();}
});

test('playground world reset restores the amber fixture suspension after it is enabled', () => {
  const {sim, close} = fixture({obstacles: true, scenario: 'playground'});
  const tools = new PlaygroundTools();
  const amber = () => sim.world.find(item => item.transformNode.metadata.fixtureId === 'suspended-grip');
  try {
    const old = amber(); assert.ok(old);
    assert.equal(tools.toggleSuspendedFixture(sim), false);
    assert.equal(old.transformNode.metadata.interaction.grip.suspended, false);
    tools.reset(); sim.reset();
    assert.equal(old.body.isDisposed, true);
    const restored = amber(); assert.ok(restored);
    assert.notEqual(restored, old);
    assert.equal(restored.transformNode.metadata.interaction.grip.suspended, true);
    assert.equal(sim.controller.handControl.count, 0); assert.ok(sim.rig.diagnostics().finite);
  } finally {tools.reset(); close();}
});

test('grip tools report missing targets without adding forces or native constraints', () => {
  const {sim, close} = fixture(); const tools = new PlaygroundTools();
  try {
    run(sim, 360); const before = sim.rig.diagnostics();
    assert.equal(tools.suspendGrips(sim), false); assert.equal(tools.remaining, 0);
    assert.equal(tools.suspended.size, 0); assert.match(tools.message, /Grab a surface or prop first/);
    assert.equal(tools.loadGrips(sim), false); assert.match(tools.message, /Grab a surface or prop first/);
    assert.equal(sim.controller.handControl.count, 0);
    assert.equal(tools.toggleSuspendedFixture(sim), undefined);
    assert.equal(sim.rig.diagnostics().speed, before.speed);
  } finally {close();}
});
