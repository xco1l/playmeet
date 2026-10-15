import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {fixture, run} from './support/fixture.mjs';

function wallFixture() {
  const f = fixture(); run(f.sim, 360);
  const wall = f.sim.addBox('Grip surface', [2, 2, .5], [0, 1, .9], '#7799bb');
  return {...f, wall, c: f.sim.controller};
}
for (const pitchChange of [0, 80]) {
  test('release-to-regrab delay includes pitch change ' + pitchChange, () => {
    const {sim, close} = fixture();
    try {
      run(sim, 360); const c = sim.controller, hand = c.handControl.sides.Left;
      c.input.leftGrab = true; sim.step(); assert.equal(hand.grabEnabled, true);
      c.input.leftGrab = false; sim.step();
      assert.equal(hand.grabTime, 0);
      c.input.pitch = pitchChange; c.input.leftGrab = true;
      const delay = 2 * (.1 + .14 * pitchChange / 80);
      const frames = Math.floor(delay / c.dt);
      for (let i = 0; i < frames - 1; i++) {sim.step(); assert.equal(hand.grabEnabled, false);}
      run(sim, 2); assert.equal(hand.grabEnabled, true);
    } finally {close();}
  });
}
test('grip suspension releases held constraints and blocks immediate reacquisition', () => {
  const {sim, close, wall, c} = wallFixture();
  try {
    c.input.leftGrab = c.input.rightGrab = true; run(sim, 180);
    assert.equal(c.handControl.count, 2);
    wall.transformNode.metadata.interaction.grip.suspended = true; sim.step();
    assert.equal(c.handControl.count, 0);
    assert.equal(c.handControl.sides.Left.lastRelease, 'blocked');
    wall.transformNode.metadata.interaction.grip.suspended = false;
    run(sim, 5); assert.equal(c.handControl.sides.Left.grabEnabled, false);
    run(sim, 180); assert.equal(c.handControl.count, 2);
  } finally {close();}
});
test('knockout releases both constraints immediately', () => {
  const {sim, close, c} = wallFixture();
  try {
    c.input.leftGrab = c.input.rightGrab = true; run(sim, 180);
    assert.equal(c.handControl.count, 2); c.knockOut();
    assert.equal(c.handControl.count, 0);
    sim.step(); assert.equal(c.state, 'Unconscious');
  } finally {close();}
});
test('one hand cannot climb above the other grip on the same body by more than twenty centimetres', () => {
  const {close, c, wall} = wallFixture();
  try {
    const {Left: left, Right: right} = c.handControl.sides;
    left.grabEnabled = right.grabEnabled = true;
    assert.equal(c.handControl.attach(left, wall.body, left.part.position, false), true);
    c.state = 'Climb';
    const tooHigh = right.part.position.clone(); tooHigh.y = left.part.position.y + .201;
    assert.equal(c.handControl.attach(right, wall.body, tooHigh, true), false);
    tooHigh.y = left.part.position.y + .199;
    assert.equal(c.handControl.attach(right, wall.body, tooHigh, true), true);
    assert.equal(c.handControl.attach(right, wall.body, tooHigh, true), false);
  } finally {close();}
});
test('helper attraction is evaluated in the object local coordinate system', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, hand = c.handControl.sides.Left;
    const box = sim.addBox('Helper', [.2, .2, .2], [2, 1, 3], '#7799bb');
    box.transformNode.metadata.interaction.grip.anchor = [.1, 0, 0];
    const point = new Vector3(2.1, 1, 3);
    const candidate = c.handControl.search.helper(hand, point.subtract(new Vector3(0, 0, 1)), point.add(new Vector3(0, 0, 1)));
    assert.equal(candidate.body, box.body); assert.ok(candidate.point.subtract(point).length() < 1e-6);
    box.transformNode.metadata.interaction.grip.disabled = true;
    assert.equal(c.handControl.search.helper(hand, point, point), null);
  } finally {close();}
});
test('transport-disabled objects receive no carrying or aiming impulses', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, hand = c.handControl.sides.Left;
    const box = sim.addBox('No lift', [.2, .2, .2], [0, 2, 1], '#7799bb', 12);
    box.transformNode.metadata.interaction.transport.disabled = true;
    let impulses = 0;
    box.body.applyImpulse = () => impulses++; box.body.applyAngularImpulse = () => impulses++;
    hand.grab = {body: box.body, constraint: {dispose() {}}}; c.ground.bodies.clear();
    c.handControl.liftBody(hand); assert.equal(impulses, 0);
    box.transformNode.metadata.interaction.transport.disabled = false; c.input.pitch = -60;
    c.handControl.liftBody(hand); assert.ok(impulses >= 2);
  } finally {close();}
});
test('ground supports are excluded from carrying assistance', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, hand = c.handControl.sides.Left;
    const box = sim.addBox('Support', [2, .2, 2], [0, 1, 0], '#7799bb', 12);
    let impulses = 0; box.body.applyImpulse = () => impulses++;
    hand.grab = {body: box.body, constraint: {dispose() {}}};
    c.ground.bodies.add(box.body); c.handControl.liftBody(hand);
    assert.equal(impulses, 0);
  } finally {close();}
});
test('free reaching forces have an equal and opposite reaction on the hips', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 600); const c = sim.controller;
    for (const part of Object.values(c.p)) part.force.setAll(0);
    c.handControl.placeHand(c.handControl.sides.Left, c.p.LeftHand.com.add(new Vector3(.1, .2, .3)));
    assert.ok(c.p.LeftHand.force.add(c.p.Hips.force).length() < 1e-8);
    assert.ok(c.p.LeftHand.force.length() > 0);
  } finally {close();}
});
test('held reach distributes force without adding net character force', () => {
  const {sim, close, wall, c} = wallFixture();
  try {
    const hand = c.handControl.sides.Left;
    hand.grab = {body: wall.body, constraint: {dispose() {}}};
    c.target = Vector3.Forward(); c.state = 'Climb'; c.input.pitch = 70;
    for (const part of Object.values(c.p)) part.force.setAll(0);
    c.handControl.placeHand(hand, hand.part.com.add(new Vector3(.2, .5, .1)));
    const total = Object.values(c.p).reduce((sum, part) => sum.add(part.force), Vector3.Zero());
    assert.ok(total.length() < 1e-8);
    assert.ok(Math.abs(c.p.Chest.force.y + c.p.Ball.force.y) <= 600.00001);
  } finally {close();}
});