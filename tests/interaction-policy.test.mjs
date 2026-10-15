import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {alignmentTorque, anchorAttraction, castAttraction, castScore, contactAccepted, gripGate,
  interactionProfile, reachReactions, transportDrag, transportForce} from '../src/interaction-policy.js';
import {fixture, run} from './support/fixture.mjs';

const closeTo = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const vectorClose = (actual, expected) => actual.asArray().forEach((value, index) => closeTo(value, expected[index]));

test('interaction defaults separate acquisition, transport and orientation capabilities', () => {
  assert.deepEqual(interactionProfile(), {
    grip: {disabled: false, suspended: false, anchor: undefined, preferred: undefined, contactRadius: .5, reactionScale: 1},
    transport: {disabled: false, strength: 1, decayDistance: 1, angularResistance: 1},
    alignment: {axis: undefined, horizontal: false, directed: false, stiffness: 1000,
      maximumTorque: 1000, angleExponent: .5, distanceExponent: 1},
  });
});

test('profile preserves explicit zero gains and falls back from unbounded torque', () => {
  const profile = interactionProfile({interaction: {
    grip: {reactionScale: 0, contactRadius: .1}, transport: {strength: 0, angularResistance: 0},
    alignment: {stiffness: 0, maximumTorque: Infinity, angleExponent: 0, distanceExponent: 0},
  }});
  assert.equal(profile.grip.reactionScale, 0); assert.equal(profile.grip.contactRadius, .5);
  assert.equal(profile.transport.strength, 0); assert.equal(profile.transport.angularResistance, 0);
  assert.equal(profile.alignment.maximumTorque, 0); assert.equal(profile.alignment.angleExponent, 0);
  assert.equal(profile.alignment.distanceExponent, 0);
});

for (const [mass, distance, expected] of [[0, 0, 100], [50, 0, 150], [100, 0, 200], [200, 1, 100]]) {
  test(`transport calibration for mass ${mass} and distance ${distance}`, () => {
    const force = transportForce({mass, distance, direction: new Vector3(1, 1, 1), transport: interactionProfile().transport});
    vectorClose(force, [expected, expected * 2.5, expected]);
  });
}

test('transport applies no downward assistance and decay distance defines half force', () => {
  const transport = {...interactionProfile().transport, decayDistance: 2, strength: 1.2};
  const force = transportForce({mass: 100, distance: 2, direction: new Vector3(1, -1, 0), transport});
  vectorClose(force, [120, 0, 0]);
  for (const decayDistance of [0, -1, NaN]) assert.throws(() => transportForce({mass: 1, distance: 1,
    direction: Vector3.Forward(), transport: {...transport, decayDistance}}), /decayDistance/);
});

test('transport drag contains linear and quadratic terms and can be disabled', () => {
  vectorClose(transportDrag(new Vector3(0, 2, 0), 3), [0, -1.8, 0]);
  vectorClose(transportDrag(Vector3.Zero(), 1), [0, 0, 0]);
  vectorClose(transportDrag(new Vector3(1, 2, 3), 0), [0, 0, 0]);
});

for (const directed of [false, true]) {
  test(`orientation torque respects ${directed ? 'directed' : 'bidirectional'} angular budget`, () => {
    const policy = {...interactionProfile().alignment, directed, stiffness: 1000, maximumTorque: 100,
      angleExponent: 1, distanceExponent: 0};
    const torque = alignmentTorque({alignment: Vector3.Forward(), direction: new Vector3(Math.sqrt(.75), 0, -.5),
      angularVelocity: Vector3.Zero(), distance: 1, policy});
    vectorClose(torque, [0, directed ? 25 : -50, 0]);
  });
}

test('orientation distance exponent scales the torque cap', () => {
  const policy = {...interactionProfile().alignment, stiffness: 1000, maximumTorque: 100,
    angleExponent: 0, distanceExponent: 2};
  const torque = alignmentTorque({alignment: Vector3.Forward(), direction: Vector3.Right(),
    angularVelocity: Vector3.Zero(), distance: .5, policy});
  vectorClose(torque, [0, 25, 0]);
});

test('orientation horizontal projection suppresses vertical alignment torque', () => {
  const policy = {...interactionProfile().alignment, horizontal: true, angleExponent: 0, distanceExponent: 0};
  const torque = alignmentTorque({alignment: Vector3.Forward(), direction: new Vector3(0, 1, 1).normalize(),
    angularVelocity: Vector3.Zero(), distance: 1, policy});
  vectorClose(torque, [0, 0, 0]);
});

test('held reactions conserve force and cap combined vertical support without changing order', () => {
  const plan = reachReactions({force: new Vector3(100, 2000, -50), offset: new Vector3(0, 1, 0),
    heading: Vector3.Forward(), holding: true, climbing: true, pitch: 70, reactionScale: 1});
  assert.deepEqual(plan.map(effect => effect.recipient), ['chest', 'ball', 'hand']);
  vectorClose(plan.reduce((sum, effect) => sum.add(effect.force), Vector3.Zero()), [0, 0, 0]);
  closeTo(Math.abs(plan[0].force.y + plan[1].force.y), 600);
});

test('free reactions apply the complete hand effort and an opposite hip reaction', () => {
  const force = new Vector3(7, -11, 13);
  const plan = reachReactions({force, holding: false});
  assert.deepEqual(plan.map(effect => effect.recipient), ['hand', 'hips']);
  vectorClose(plan[0].force, [7, -11, 13]); vectorClose(plan[1].force, [-7, 11, -13]);
  vectorClose(force, [7, -11, 13]);
});

test('anchor attraction has a strict snap boundary and an inclusive search boundary', () => {
  const shoulder = Vector3.Zero(), desired = new Vector3(0, 0, 1);
  const point = new Vector3(.3, 0, .5);
  const result = anchorAttraction({point, handPosition: point, shoulder, desired});
  assert.equal(result.snap, false);
  assert.equal(anchorAttraction({point: new Vector3(.5, 0, .5), handPosition: point, shoulder, desired}).snap, false);
  assert.equal(anchorAttraction({point: new Vector3(.5001, 0, .5), handPosition: point, shoulder, desired}), null);
});

test('cast ranking permits wide probes only for preferred targets', () => {
  const query = {point: new Vector3(0, 0, 1), end: new Vector3(0, 0, .9),
    desired: new Vector3(0, 0, 2), shoulder: Vector3.Zero(), radius: .25};
  assert.equal(castScore({...query, preferred: false}), null);
  closeTo(castScore({...query, preferred: true}), .00125);
});

test('ordinary cast targets behind the shoulder fail facing acceptance', () => {
  assert.equal(castScore({point: new Vector3(0, 0, -1), end: Vector3.Zero(),
    desired: Vector3.Forward(), shoulder: Vector3.Zero(), radius: .05, preferred: false}), null);
});

test('surface and preferred snap policies retain distinct strict boundaries', () => {
  const query = {start: Vector3.Zero(), end: new Vector3(0, 0, 1), handPosition: new Vector3(0, 0, 1)};
  assert.equal(castAttraction({...query, point: new Vector3(.099, 0, 1), preferred: false}).snap, true);
  assert.equal(castAttraction({...query, point: new Vector3(.1, 0, 1), preferred: false}).snap, false);
  assert.equal(castAttraction({...query, point: new Vector3(.199, 0, 1), preferred: true}).snap, true);
  assert.equal(castAttraction({...query, point: new Vector3(.2, 0, 1), preferred: true}).snap, false);
});

test('contact policy corrects reversed normals and distinguishes dynamic surfaces', () => {
  const query = {target: Vector3.Zero(), point: new Vector3(0, 0, .1), normal: new Vector3(0, 0, -1),
    handPosition: new Vector3(0, 0, .1), handCenter: new Vector3(0, 0, .2),
    grounded: true, grip: interactionProfile().grip};
  assert.equal(contactAccepted({...query, dynamic: true}), true);
  assert.equal(contactAccepted({...query, dynamic: false}), false);
  assert.equal(contactAccepted({...query, dynamic: false, grounded: false}), true);
});

test('grip gate waits strictly beyond the release delay and preserves release pitch', () => {
  const memory = {grabTime: .1, grabAngle: 0, grabEnabled: false, blockTime: 0};
  assert.equal(gripGate(memory, true, 0, .1).grabEnabled, false);
  assert.equal(gripGate(memory, true, 0, .10001).grabEnabled, true);
  assert.deepEqual(gripGate({...memory, grabEnabled: true}, false, 35, .1),
    {extend: 0, grabTime: 0, grabAngle: 35, grabEnabled: false});
  assert.equal(gripGate({...memory, grabTime: 1, blockTime: .01}, true, 0, .1).grabEnabled, false);
});

test('native reach adapter applies free and held reaction plans in the required order', () => {
  const {sim, close} = fixture();
  try {
    run(sim, 360); const c = sim.controller, hand = c.handControl.sides.Left, effects = [];
    for (const [name, part] of Object.entries({hand: hand.part, hips: c.p.Hips, chest: c.p.Chest, ball: c.p.Ball})) {
      part.addForce = () => effects.push(name);
    }
    c.handControl.placeHand(hand, hand.part.com.add(Vector3.Forward()));
    assert.deepEqual(effects, ['hand', 'hips']); effects.length = 0;
    hand.grab = {body: sim.world[0].body, constraint: {dispose() {}}};
    c.handControl.placeHand(hand, hand.part.com.add(Vector3.Forward()));
    assert.deepEqual(effects, ['chest', 'ball', 'hand']);
  } finally {close();}
});

test('native transport applies translation, two reactions, drag and orientation in order', () => {
  const {sim, close} = fixture();
  try {
    const c = sim.controller, hand = c.handControl.sides.Left;
    const box = sim.addBox('Transport order', [.2, .2, .2], [0, 2, 1], '#7799bb', 12);
    box.transformNode.metadata.interaction.alignment = {axis: 'forward'};
    hand.grab = {body: box.body, constraint: {dispose() {}}}; c.ground.bodies.clear();
    const effects = [];
    box.body.applyImpulse = () => effects.push('object translation');
    hand.part.addForce = () => effects.push('hand reaction'); c.p.Chest.addForce = () => effects.push('chest reaction');
    box.body.applyAngularImpulse = () => effects.push('object angular impulse');
    c.handControl.liftBody(hand);
    assert.deepEqual(effects, ['object translation', 'hand reaction', 'chest reaction', 'object angular impulse', 'object angular impulse']);
  } finally {close();}
});

test('native target search probes all radii in ascending order', () => {
  const {sim, close} = fixture();
  try {
    const search = sim.controller.handControl.search, hand = sim.controller.handControl.sides.Left;
    const radii = new Map(search.probes.map(probe => [probe.shape, probe.radius])), visited = [];
    search.plugin.shapeCast = ({shape}) => visited.push(radii.get(shape));
    hand.pos = hand.part.position.subtract(Vector3.Forward());
    search.find(hand, hand.part.position.add(Vector3.Forward()), sim.rig.parts.LeftArm.position);
    assert.deepEqual(visited, [.05, .1, .15, .2, .25, .3, .35, .4, .45, .5]);
  } finally {close();}
});

test('native anchor search retains the first available body in engine order', () => {
  const {sim, close} = fixture();
  try {
    const search = sim.controller.handControl.search, hand = sim.controller.handControl.sides.Left;
    const first = sim.addBox('First anchor', [.2, .2, .2], [2, 1, 3], '#7799bb');
    const second = sim.addBox('Second anchor', [.2, .2, .2], [2, 1, 3], '#7799bb');
    first.transformNode.metadata.interaction.grip.anchor = second.transformNode.metadata.interaction.grip.anchor = [0, 0, 0];
    const point = new Vector3(2, 1, 3);
    assert.equal(search.helper(hand, point.subtract(Vector3.Forward()), point.add(Vector3.Forward())).body, first.body);
    first.transformNode.metadata.interaction.grip.disabled = true;
    assert.equal(search.helper(hand, point.subtract(Vector3.Forward()), point.add(Vector3.Forward())).body, second.body);
  } finally {close();}
});
