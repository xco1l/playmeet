import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {fixture, run} from './support/fixture.mjs';

test('jump consumes one input edge, delays ground contact and lands in the expected height band', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 600); const c = sim.controller;
    c.input.jump = true; sim.step();
    assert.equal(c.input.jump, false); assert.equal(c.state, 'Jump');
    assert.ok(Math.abs(c.jumpCooldown - .5) < 1e-9); assert.ok(Math.abs(c.groundDelay - .2) < 1e-9);
    sim.step(); assert.equal(c.grounded, false); assert.equal(c.state, 'Jump');
    let peak = 0;
    for (let i = 0; i < 239; i++) {sim.step(); peak = Math.max(peak, sim.rig.parts.Ball.position.y);}
    assert.ok(peak > 1.02 && peak < 1.18, 'peak ' + peak);
    assert.equal(c.grounded, true); assert.ok(Math.abs(sim.rig.parts.Ball.position.y - .3) < .015);
  } finally {close();}
});
test('jump impulse conserves its prescribed total and leaves hands unforced', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, impulses = {};
    for (const part of Object.values(c.p)) {
      part.body.setLinearVelocity(Vector3.Zero());
      part.body.applyImpulse = impulse => impulses[part.name] = impulse;
    }
    c.walkSpeed = 0; c.walkDirection = Vector3.Zero(); c.ground.velocity = Vector3.Zero(); c.ground.bodies.clear();
    c.locomotion.launch();
    const total = Object.values(impulses).reduce((sum, v) => sum.add(v), Vector3.Zero());
    assert.ok(Math.abs(total.y - 104 * Math.sqrt(2 * .75 * 9.81)) < 1e-7);
    assert.equal(impulses.LeftHand.length(), 0); assert.equal(impulses.RightHand.length(), 0);
    assert.ok(impulses.Head.subtract(impulses.LeftFoot.scale(2)).length() < 1e-8);
  } finally {close();}
});
test('airborne jump requests are consumed without another launch', () => {
  const {sim, close} = fixture({spawn: new Vector3(0, 8, 0)});
  try {
    const c = sim.controller; c.input.jump = true; sim.step();
    assert.equal(c.input.jump, false); assert.ok(c.jumpCooldown <= 0); assert.equal(c.grounded, false);
  } finally {close();}
});
test('fall transitions retain their one and three second thresholds', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller; c.checkGround = () => false;
    for (let i = 0; i < 59; i++) c.readEnvironment();
    assert.equal(c.state, 'Idle');
    for (let i = 0; i < 3; i++) c.readEnvironment();
    assert.equal(c.state, 'Fall');
    for (let i = 0; i < 120; i++) c.readEnvironment();
    assert.equal(c.state, 'FreeFall');
    c.checkGround = () => true; c.readEnvironment();
    assert.equal(c.state, 'Idle'); assert.equal(c.fallTime, 0);
  } finally {close();}
});
test('steep-slope history fills over a second and uses exit hysteresis', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller; c.checkGround = () => true; c.ground.angle = 50;
    for (let i = 0; i < 54; i++) c.readEnvironment();
    assert.equal(c.state, 'Idle');
    c.readEnvironment(); assert.equal(c.state, 'Slide'); assert.equal(c.grounded, false);
    assert.equal(c.p.Ball.shape.material.friction, 0);
    c.slideAngles = Array(59).fill(38); c.ground.angle = 38; c.readEnvironment();
    assert.equal(c.state, 'Slide');
    c.slideAngles = Array(59).fill(36); c.ground.angle = 36; c.readEnvironment();
    assert.equal(c.state, 'Idle'); assert.equal(c.p.Ball.shape.material.friction, .9);
  } finally {close();}
});
test('hit threshold uses maxima within a frame and sums adjacent frames', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller;
    c.receiveHit(new Vector3(16, 0, 0)); c.receiveHit(new Vector3(16, 0, 0)); sim.step();
    assert.notEqual(c.state, 'Unconscious');
    c.receiveHit(new Vector3(15, 0, 0)); sim.step();
    assert.equal(c.state, 'Unconscious'); assert.equal(c.awake, 0);
    assert.ok(c.unconsciousTime > 2.9);
  } finally {close();}
});
test('exactly thirty hit units do not cross the strict knockout threshold', () => {
  const {sim, close} = fixture();
  try {
    sim.controller.receiveHit(new Vector3(30, 0, 0)); sim.step();
    assert.notEqual(sim.controller.state, 'Unconscious');
  } finally {close();}
});
test('passive control freezes recovery and discards queued contacts', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller; c.knockOut(2); c.active = false;
    c.ground.pending.push({}); c.handControl.sides.Left.contacts.push({});
    run(sim, 30);
    assert.equal(c.unconsciousTime, 2); assert.equal(c.state, 'Passive');
    assert.equal(c.handControl.sides.Left.contacts.length, 0);
    assert.equal(c.handControl.sides.Left.extend, 0);
    c.active = true; run(sim, 122);
    assert.notEqual(c.state, 'Unconscious'); assert.ok(c.awake > 0);
  } finally {close();}
});
test('recovery discards jump requests instead of launching when consciousness returns', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 600); const c = sim.controller;
    c.knockOut(.1); c.input.jump = true; sim.step();
    assert.equal(c.input.jump, false); run(sim, 120);
    assert.notEqual(c.state, 'Jump'); assert.equal(c.handControl.count, 0);
  } finally {close();}
});
test('play-dead input extends unconsciousness until released', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller; c.input.playDead = true; run(sim, 240);
    assert.equal(c.state, 'Unconscious'); assert.ok(c.unconsciousTime > 2.9);
    c.input.playDead = false; run(sim, 185);
    assert.notEqual(c.state, 'Unconscious');
  } finally {close();}
});