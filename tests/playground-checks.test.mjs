import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKS, PlaygroundChecks} from '../src/playground-checks.js';
import {fixture} from './support/fixture.mjs';
import {Vector3} from '@babylonjs/core';

const vector = (x = 0, y = 0, z = 0) => ({x, y, z});
function fake() {
  const bodies = new Map();
  const sim = {world: [], lastInput: {x: 0, z: 0}, rig: {parts: {
    Ball: {position: vector(0, .3, 0), velocity: vector()},
    Head: {com: vector(0, 1.65, 0), forward: vector(0, 0, 1)}, Chest: {up: vector(0, 1, 0)},
  }}, controller: {time: 0, grounded: true, state: 'Idle', ground: {bodies: new Set(), velocity: vector()},
    handControl: {sides: {Left: {grab: null}, Right: {grab: null}}}}};
  const add = (id, position = vector()) => {
    const transformNode = {metadata: {fixtureId: id}, position};
    const body = {transformNode}; bodies.set(id, body); sim.world.push({body, transformNode}); return body;
  };
  add('floor'); sim.controller.ground.bodies.add(bodies.get('floor'));
  sim.support = (...ids) => {sim.controller.ground.bodies = new Set(ids.map(id => bodies.get(id) ?? add(id))); sim.controller.grounded = ids.length > 0;};
  sim.hold = (left, right = null) => {for (const [side, id] of [['Left', left], ['Right', right]]) sim.controller.handControl.sides[side].grab = id ? {body: bodies.get(id) ?? add(id)} : null;};
  sim.height = y => {sim.rig.parts.Head.com.y += y - sim.rig.parts.Ball.position.y; sim.rig.parts.Ball.position.y = y;};
  sim.add = add; sim.bodies = bodies;
  return sim;
}
const advance = (checks, sim, seconds = .1) => {
  for (let i = 0; i < Math.round(seconds / .05); i++) {sim.controller.time += .05; checks.sample(sim);}
};
const done = (checks, id) => checks.status.find(item => item.id === id)?.complete;
const selected = station => {const sim = fake(), checks = new PlaygroundChecks(); checks.select(station, sim); return {sim, checks};};

test('every station has unique checks and manual observations are explicit', () => {
  assert.deepEqual(Object.keys(CHECKS), ['start', 'carry', 'climb', 'stairs', 'jump', 'moving', 'slopes', 'camera', 'fall']);
  const checks = Object.values(CHECKS).flat();
  assert.equal(new Set(checks.map(item => item.id)).size, checks.length);
  assert.ok(checks.every(item => item.title && item.instruction && typeof item.automatic === 'boolean'));
  assert.ok(CHECKS.camera.every(item => !item.automatic));
});
test('manual confirmation cannot bypass automatic evidence or another station', () => {
  const {sim, checks} = selected('start');
  assert.equal(checks.confirm('walk'), false); assert.equal(checks.confirm('camera-clearance'), false);
  checks.select('camera', sim); assert.equal(checks.confirm('camera-clearance'), true);
  assert.equal(done(checks, 'camera-clearance'), true); assert.equal(checks.completed, 1);
});
test('status is detached, progress survives travel, and clear removes it', () => {
  const {sim, checks} = selected('camera'); checks.confirm('camera-clearance');
  checks.status[0].complete = false; assert.equal(done(checks, 'camera-clearance'), true);
  checks.select('carry', sim); checks.select('camera', sim); assert.equal(done(checks, 'camera-clearance'), true);
  checks.clear(); checks.sample(sim); assert.equal(checks.completed, 0);
  assert.throws(() => checks.select('missing', sim), /Unknown playground station/);
});
test('walking requires support, input, and real accumulated movement', () => {
  const {sim, checks} = selected('start');
  sim.lastInput.z = 1; sim.support(); sim.rig.parts.Ball.position.z = 1; advance(checks, sim);
  assert.equal(done(checks, 'walk'), false);
  sim.support('floor');
  for (let i = 0; i < 31; i++) {sim.rig.parts.Ball.position.z += .1; advance(checks, sim, .05);}
  assert.equal(done(checks, 'walk'), true);
});
test('large travel discontinuities do not count as walking', () => {
  const {sim, checks} = selected('start'); sim.lastInput.z = 1;
  sim.rig.parts.Ball.position.z = 30; advance(checks, sim);
  assert.equal(done(checks, 'walk'), false); assert.equal(checks.completed, 0);
});
test('turn requires actual head orientation with neutral movement', () => {
  const {sim, checks} = selected('start'); advance(checks, sim);
  sim.lastInput.yaw = 90; advance(checks, sim); assert.equal(done(checks, 'turn'), false);
  sim.rig.parts.Head.forward = vector(1, 0, 0); advance(checks, sim);
  assert.equal(done(checks, 'turn'), true);
});
test('walking through a turn does not complete an in-place turn', () => {
  const {sim, checks} = selected('start'); advance(checks, sim);
  sim.lastInput.z = 1; sim.rig.parts.Head.forward = vector(1, 0, 0); advance(checks, sim);
  sim.lastInput.z = 0; advance(checks, sim); assert.equal(done(checks, 'turn'), false);
});
test('floor grip requires an actual grip followed by released controls', () => {
  const {sim, checks} = selected('start');
  sim.hold('wall'); advance(checks, sim); sim.hold(null); advance(checks, sim); assert.equal(done(checks, 'floor-grip'), false);
  sim.hold('floor'); sim.lastInput.leftGrab = true; advance(checks, sim);
  sim.hold(null); advance(checks, sim, .2); assert.equal(done(checks, 'floor-grip'), false);
  sim.lastInput.leftGrab = false; advance(checks, sim, .2); assert.equal(done(checks, 'floor-grip'), true);
});
test('jump requires a requested takeoff, rise, and upright stable landing', () => {
  const {sim, checks} = selected('start');
  sim.lastInput.jump = true; sim.controller.state = 'Jump'; advance(checks, sim, .05);
  sim.lastInput.jump = false; sim.support(); sim.rig.parts.Ball.position.y = 1; advance(checks, sim);
  sim.support('floor'); sim.rig.parts.Ball.position.y = .3; sim.rig.parts.Chest.up.y = 0; advance(checks, sim, .5);
  assert.equal(done(checks, 'jump-land'), false);
  sim.rig.parts.Chest.up.y = 1; advance(checks, sim, .4); assert.equal(done(checks, 'jump-land'), true);
});
test('falling and small hops cannot pass the jump check', () => {
  const {sim, checks} = selected('start');
  sim.support(); sim.rig.parts.Ball.position.y = 1; advance(checks, sim); sim.support('floor'); advance(checks, sim, .5);
  assert.equal(done(checks, 'jump-land'), false);
  sim.lastInput.jump = true; sim.controller.state = 'Jump'; advance(checks, sim, .05);
  sim.lastInput.jump = false; sim.support(); advance(checks, sim); sim.support('floor'); advance(checks, sim, .5);
  assert.equal(done(checks, 'jump-land'), false);
});
test('limp recovery requires requested limp before upright support', () => {
  const {sim, checks} = selected('start');
  sim.controller.state = 'Unconscious'; advance(checks, sim); sim.controller.state = 'Idle'; advance(checks, sim, .6);
  assert.equal(done(checks, 'recover'), false);
  sim.lastInput.playDead = true; sim.controller.state = 'Unconscious'; advance(checks, sim);
  sim.lastInput.playDead = false; sim.controller.state = 'Idle'; advance(checks, sim, .6);
  assert.equal(done(checks, 'recover'), true);
});
test('rig replacement discards incomplete attempts and retains completed checks', () => {
  const {sim, checks} = selected('start'); sim.lastInput.playDead = true; sim.controller.state = 'Unconscious'; advance(checks, sim);
  sim.rig = {...sim.rig}; sim.lastInput.playDead = false; sim.controller.state = 'Idle'; advance(checks, sim, .6);
  assert.equal(done(checks, 'recover'), false);
  checks.select('camera', sim); checks.confirm('camera-clearance'); sim.rig = {...sim.rig}; advance(checks, sim);
  assert.equal(done(checks, 'camera-clearance'), true);
});
test('repeated samples without a physics step cannot satisfy hold durations', () => {
  const {sim, checks} = selected('jump'); sim.support(); sim.hold('hanging-bar');
  for (let i = 0; i < 1000; i++) checks.sample(sim);
  assert.equal(done(checks, 'hang'), false); advance(checks, sim, .6); assert.equal(done(checks, 'hang'), true);
});
test('carry checks reject wall grabs and two different props', () => {
  const {sim, checks} = selected('carry'); sim.hold('wall', 'wall'); advance(checks, sim);
  sim.hold(null); advance(checks, sim, .2); assert.equal(done(checks, 'grab-release'), false);
  sim.hold('crate-4', 'crate-12'); advance(checks, sim); assert.equal(done(checks, 'two-hands'), false);
  sim.hold('crate-4', 'crate-4'); advance(checks, sim); assert.equal(done(checks, 'two-hands'), true);
  sim.hold(null); advance(checks, sim, .2); assert.equal(done(checks, 'grab-release'), true);
});
test('light crate movement counts only while the same object is held and lifted', () => {
  const {sim, checks} = selected('carry'); const crate = sim.add('crate-4', vector(0, .325, 0));
  sim.hold('crate-4'); advance(checks, sim); crate.transformNode.position.x = 1.1; advance(checks, sim);
  assert.equal(done(checks, 'carry-light'), false);
  crate.transformNode.position.y += .2; advance(checks, sim); assert.equal(done(checks, 'carry-light'), true);
});
test('pushed crate evidence requires nearby movement and no grips', () => {
  const {sim, checks} = selected('carry'); const crate = sim.add('push-crate'); advance(checks, sim);
  crate.transformNode.position.x = .8; advance(checks, sim); assert.equal(done(checks, 'push-heavy'), false);
  sim.lastInput.x = 1; sim.hold('push-crate'); crate.transformNode.position.x = 1; advance(checks, sim);
  assert.equal(done(checks, 'push-heavy'), false); sim.hold(null);
  for (let i = 0; i < 10; i++) {crate.transformNode.position.x += .08; sim.rig.parts.Ball.position.x += .08; advance(checks, sim, .05);}
  assert.equal(done(checks, 'push-heavy'), true);
});
test('ledge check needs a prior grip below its top and a hands-free supported landing', () => {
  const {sim, checks} = selected('climb'); sim.support('ledge-1.3'); advance(checks, sim, .5);
  assert.equal(done(checks, 'climb-ledge'), false);
  sim.support('floor'); sim.hold('ledge-1.3'); advance(checks, sim);
  sim.support('ledge-1.3'); advance(checks, sim, .5); assert.equal(done(checks, 'climb-ledge'), false);
  sim.hold(null); advance(checks, sim, .5); assert.equal(done(checks, 'climb-ledge'), true);
});
test('stairs need low-step contact before high-step contact', () => {
  const {sim, checks} = selected('stairs'); sim.support('step-6'); advance(checks, sim, .4); assert.equal(done(checks, 'climb-steps'), false);
  sim.support('step-1'); advance(checks, sim); sim.support('step-6'); advance(checks, sim, .4);
  assert.equal(done(checks, 'climb-steps'), true);
});
test('beam crossing rejects an airborne flyover or separate short visits', () => {
  const {sim, checks} = selected('stairs'); sim.support();
  for (let i = 0; i < 25; i++) {sim.rig.parts.Ball.position.z += .1; advance(checks, sim, .05);}
  assert.equal(done(checks, 'balance-beam'), false);
  sim.support('balance-beam'); advance(checks, sim);
  for (let i = 0; i < 21; i++) {sim.rig.parts.Ball.position.z += .1; advance(checks, sim, .05);}
  assert.equal(done(checks, 'balance-beam'), true);
});
test('platform jumps require launch support and destination support', () => {
  const {sim, checks} = selected('jump'); sim.support('jump-platform-1'); advance(checks, sim);
  sim.lastInput.jump = true; sim.controller.state = 'Jump'; advance(checks, sim, .05);
  sim.lastInput.jump = false; sim.support(); advance(checks, sim);
  sim.rig.parts.Ball.position.z += 1; advance(checks, sim); assert.equal(done(checks, 'cross-gap'), false);
  sim.support('jump-platform-2'); advance(checks, sim, .4); assert.equal(done(checks, 'cross-gap'), true);
});
test('floor landing cancels a platform jump attempt', () => {
  const {sim, checks} = selected('jump'); sim.support('jump-platform-1'); advance(checks, sim);
  sim.lastInput.jump = true; sim.controller.state = 'Jump'; advance(checks, sim, .05); sim.lastInput.jump = false;
  sim.support(); advance(checks, sim); sim.support('floor'); advance(checks, sim);
  sim.support('jump-platform-2'); advance(checks, sim, .4); assert.equal(done(checks, 'cross-gap'), false);
});
test('one-hand task requires two hands, airborne one-hand hold, and full release', () => {
  const {sim, checks} = selected('jump'); sim.hold('hanging-bar', 'hanging-bar'); advance(checks, sim, .6);
  assert.equal(done(checks, 'hang'), false); sim.support(); advance(checks, sim, .6); assert.equal(done(checks, 'hang'), true);
  sim.hold('hanging-bar'); advance(checks, sim, .5); assert.equal(done(checks, 'one-hand'), false);
  sim.hold(null); advance(checks, sim); assert.equal(done(checks, 'one-hand'), true);
});
test('one-hand task cannot combine separate hanging attempts', () => {
  const {sim, checks} = selected('jump'); sim.support(); sim.hold('hanging-bar', 'hanging-bar'); advance(checks, sim, .6);
  sim.hold(null); advance(checks, sim);
  sim.hold('hanging-bar'); advance(checks, sim, .5); sim.hold(null); advance(checks, sim);
  assert.equal(done(checks, 'one-hand'), false);
});
test('landing or changing bars cancels the two-hand prerequisite', () => {
  for (const interruption of ['landing', 'different-bar']) {
    const {sim, checks} = selected('jump'); sim.support(); sim.hold('hanging-bar', 'hanging-bar'); advance(checks, sim, .6);
    if (interruption === 'landing') {sim.support('floor'); advance(checks, sim); sim.support(); sim.hold('hanging-bar');}
    else sim.hold('traverse-bar');
    advance(checks, sim, .5); sim.hold(null); advance(checks, sim);
    assert.equal(done(checks, 'one-hand'), false, interruption);
  }
});
test('moving supports require continuous upright support throughout travel', () => {
  const {sim, checks} = selected('moving'); const lift = sim.add('lift'), shuttle = sim.add('shuttle');
  sim.support('floor'); advance(checks, sim); lift.transformNode.position.y = 1; advance(checks, sim);
  assert.equal(done(checks, 'ride-lift'), false); sim.support('lift'); advance(checks, sim);
  lift.transformNode.position.y = 1.7; advance(checks, sim); assert.equal(done(checks, 'ride-lift'), true);
  sim.support('shuttle'); advance(checks, sim); shuttle.transformNode.position.x = 1.3; advance(checks, sim);
  assert.equal(done(checks, 'ride-shuttle'), true);
});
test('moving-support jump requires an adjacent landing rather than floor contact', () => {
  const {sim, checks} = selected('moving'); sim.support('shuttle'); advance(checks, sim);
  sim.lastInput.jump = true; sim.controller.state = 'Jump'; advance(checks, sim, .05); sim.lastInput.jump = false;
  sim.support(); advance(checks, sim); sim.support('shuttle-east'); advance(checks, sim, .4);
  assert.equal(done(checks, 'shuttle-jump'), true);
});
test('slope checks require their named surface and actual uphill or downhill motion', () => {
  const {sim, checks} = selected('slopes'); sim.lastInput.z = 1; sim.support('slope-20'); advance(checks, sim);
  sim.height(sim.rig.parts.Ball.position.y + .8); advance(checks, sim); assert.equal(done(checks, 'walk-slope'), true);
  sim.support('slope-50'); sim.controller.grounded = false; sim.controller.state = 'Slide'; advance(checks, sim);
  sim.height(sim.rig.parts.Ball.position.y - .3); advance(checks, sim, .5); assert.equal(done(checks, 'slide'), true);
});
test('a fall needs the high starting support, FreeFall, and an upright floor landing', () => {
  const {sim, checks} = selected('fall'); sim.height(52.3); sim.support('fall-start'); advance(checks, sim);
  sim.support(); sim.controller.state = 'FreeFall'; sim.height(20); advance(checks, sim);
  sim.support('floor'); sim.height(.3); sim.rig.parts.Chest.up.y = 0; advance(checks, sim, .6);
  assert.equal(done(checks, 'long-fall'), false); sim.rig.parts.Chest.up.y = 1; advance(checks, sim, .6);
  assert.equal(done(checks, 'long-fall'), true);
});
test('landing without a witnessed high-platform departure does not pass long fall', () => {
  const {sim, checks} = selected('fall'); sim.support(); sim.controller.state = 'FreeFall'; advance(checks, sim);
  sim.support('floor'); advance(checks, sim, .6); assert.equal(done(checks, 'long-fall'), false);
});
test('native walking, turning, jumping and limp recovery produce the expected evidence', () => {
  const {sim, close} = fixture({obstacles: true, scenario: 'playground', spawn: new Vector3(0, .55, -6)});
  const checks = new PlaygroundChecks(); checks.select('start', sim);
  const sample = count => {for (let i = 0; i < count; i++) {sim.step(); checks.sample(sim);}};
  try {
    sample(360); sim.controller.input.z = 1; sample(120); sim.controller.input.z = 0; sample(180);
    assert.equal(done(checks, 'walk'), true);
    sim.controller.input.yaw = 90; sample(240); assert.equal(done(checks, 'turn'), true);
    sim.controller.input.jump = true; sample(300); assert.equal(done(checks, 'jump-land'), true);
    sim.controller.input.playDead = true; sample(90); sim.controller.input.playDead = false; sample(600);
    assert.equal(done(checks, 'recover'), true);
  } finally {close();}
});
test('native long-fall observation reaches stable landing without a reset', () => {
  const {sim, close} = fixture({obstacles: true, scenario: 'playground', spawn: new Vector3(19, 52.55, -15)});
  const checks = new PlaygroundChecks(); checks.select('fall', sim);
  const sample = count => {for (let i = 0; i < count; i++) {sim.step(); checks.sample(sim);}};
  try {
    sample(240); sim.controller.input.z = 1; sample(100); sim.controller.input.z = 0; sample(900);
    assert.equal(done(checks, 'long-fall'), true);
    checks.select('fall', sim); assert.equal(done(checks, 'long-fall'), true);
    sim.reset(new Vector3(19, 52.55, -15), 'playground'); checks.clear(); sample(120);
    assert.equal(done(checks, 'long-fall'), false);
  } finally {close();}
});
test('native continuous two-hand to one-hand hang and release completes the task', () => {
  const {sim, close} = fixture({obstacles: true, scenario: 'playground', spawn: new Vector3(3, 1.65, 5.4)});
  const checks = new PlaygroundChecks(); checks.select('jump', sim);
  const sample = count => {for (let i = 0; i < count; i++) {sim.step(); checks.sample(sim);}};
  try {
    sample(180); Object.assign(sim.controller.input, {pitch: -45, leftGrab: true, rightGrab: true}); sample(30);
    Object.assign(sim.controller.input, {z: 1, jump: true}); sample(35); sim.controller.input.z = 0; sample(90);
    assert.equal(done(checks, 'hang'), true); assert.equal(done(checks, 'one-hand'), false);
    sim.controller.input.leftGrab = false; sample(90); assert.equal(done(checks, 'one-hand'), false);
    sim.controller.input.rightGrab = false; sample(30); assert.equal(done(checks, 'one-hand'), true);
  } finally {close();}
});
