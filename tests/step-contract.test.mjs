import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {fixture, run} from './support/fixture.mjs';

test('support velocity selects the greatest signed component independently on each axis', () => {
  const {sim, close} = fixture();
  try {
    const ground = sim.controller.ground;
    const a = {isDisposed: false, getLinearVelocity: () => new Vector3(-3, 1, 2)};
    const b = {isDisposed: false, getLinearVelocity: () => new Vector3(2, -4, -1)};
    const saved = sim.controller.engine.raycast;
    sim.controller.engine.raycast = () => ({hasHit: false});
    ground.pending = [a, b].map(body => ({body, normal: Vector3.Up()}));
    assert.equal(ground.sample(), true);
    assert.deepEqual(ground.velocity.asArray(), [-3, -4, 2]);
    assert.equal(ground.pending.length, 0);
    sim.controller.engine.raycast = saved;
  } finally {close();}
});
test('queued contacts from disposed supports are ignored', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, saved = c.engine.raycast;
    c.engine.raycast = () => ({hasHit: false});
    c.ground.pending.push({body: {isDisposed: true}, normal: Vector3.Up()});
    assert.equal(c.ground.sample(), false); assert.equal(c.ground.angle, 90);
    c.engine.raycast = saved;
  } finally {close();}
});
test('support reaction is shared across all supports and limited per dynamic mass', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, impulses = [];
    const dynamic = {getMotionType: () => 2, getMassProperties: () => ({mass: 1}), applyImpulse: v => impulses.push(v)};
    const fixed = {getMotionType: () => 0};
    c.ground.bodies = new Set([dynamic, fixed]);
    c.ground.distribute(new Vector3(120, 0, 0), Vector3.Zero());
    assert.ok(Math.abs(impulses[0].x - 1) < 1e-9);
    c.ground.distribute(new Vector3(1e9, 0, 0), Vector3.Zero());
    assert.ok(Math.abs(impulses[1].length() - 10) < 1e-9);
  } finally {close();}
});
test('velocity-change limit excludes braking while bounding new acceleration', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, part = c.p.Head, bound = 1000 * c.dt;
    c.previousVelocities.set('Head', new Vector3(50, 0, 0));
    part.body.setLinearVelocity(Vector3.Zero()); c.afterStep();
    assert.ok(part.velocity.length() < .001);
    c.previousVelocities.set('Head', Vector3.Zero());
    part.body.setLinearVelocity(new Vector3(50, 0, 0)); c.afterStep();
    assert.ok(Math.abs(part.velocity.x - bound) < .001);
  } finally {close();}
});
test('launch exemption lasts one post-physics update', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, part = c.p.Head;
    c.previousVelocities.set('Head', Vector3.Zero()); c.skipLimiting = true;
    part.body.setLinearVelocity(new Vector3(50, 0, 0)); c.afterStep();
    assert.ok(Math.abs(part.velocity.x - 50) < .001); assert.equal(c.skipLimiting, false);
    c.previousVelocities.set('Head', Vector3.Zero()); c.afterStep();
    assert.ok(part.velocity.x < 17);
  } finally {close();}
});
test('posture force accumulators are cleared after every flush', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 600); sim.controller.input.z = 1; sim.step();
    for (const part of Object.values(sim.rig.parts)) {
      assert.equal(part.force.length(), 0); assert.equal(part.torque.length(), 0); assert.equal(part.acceleration.length(), 0);
      if (part.name !== 'Ball') assert.ok(part.omega.length() < 11);
    }
  } finally {close();}
});
test('reset clears input, slope history, recovery and mouse-independent simulation time', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 60); sim.controller.knockOut(); sim.controller.input.leftGrab = true;
    sim.reset();
    assert.equal(sim.controller.time, 0); assert.equal(sim.controller.unconsciousTime, 0);
    assert.equal(sim.controller.input.leftGrab, false); assert.deepEqual(sim.controller.slideAngles, []);
  } finally {close();}
});
test('identical fixed-step input sequences replay deterministically in fresh worlds', () => {
    const replay = () => {
      const {sim, close} = fixture();
      try {
      run(sim, 360);
      for (let i = 0; i < 180; i++) {
        Object.assign(sim.controller.input, {z: i < 120 ? 1 : 0, yaw: i < 90 ? 0 : 45, jump: i === 60});
        sim.step();
      }
      return Object.values(sim.rig.parts).map(part => part.position.asArray());
      } finally {close();}
    };
    const first = replay(), second = replay();
    for (let i = 0; i < first.length; i++) assert.ok(Vector3.FromArray(first[i]).subtract(Vector3.FromArray(second[i])).length() < .001);
});
