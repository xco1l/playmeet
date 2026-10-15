import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion, Vector3} from '@babylonjs/core';
import {contactTransition} from '../src/control-policy.js';
import {postureActions} from '../src/posture-plan.js';
import {Locomotion} from '../src/locomotion.js';
import {Posture} from '../src/posture.js';
import {orientation, vectorTorque} from '../src/control-math.js';

const stateFacts = {sliding: false, grounded: false, walkSpeed: 0, grips: 0, fallTime: 0, state: 'Jump'};
test('contact policy gives slope and contact precedence over grip and fall transitions', () => {
  const overlapping = {...stateFacts, grounded: true, grips: 2, fallTime: 4};
  assert.deepEqual(contactTransition({...overlapping, sliding: true}), {state: 'Slide', grounded: false});
  assert.deepEqual(contactTransition(overlapping), {state: 'Idle'});
  assert.deepEqual(contactTransition({...overlapping, walkSpeed: .01}), {state: 'Walk'});
  assert.deepEqual(contactTransition({...overlapping, grounded: false}), {state: 'Climb', fallTime: 0});
});
test('contact policy retains airborne states at strict fall boundaries and exits a released climb', () => {
  assert.deepEqual(contactTransition({...stateFacts, fallTime: 1}), {});
  assert.deepEqual(contactTransition({...stateFacts, fallTime: 1 + Number.EPSILON}), {state: 'Fall'});
  assert.deepEqual(contactTransition({...stateFacts, fallTime: 3}), {state: 'Fall'});
  assert.deepEqual(contactTransition({...stateFacts, fallTime: 3.000001}), {state: 'FreeFall'});
  assert.deepEqual(contactTransition({...stateFacts, state: 'Climb'}), {state: 'Fall'});
  assert.deepEqual(contactTransition({...stateFacts, state: 'FreeFall'}), {});
});

function instrumentedController() {
  const events = [], p = {};
  for (const name of ['Head', 'Chest', 'Waist', 'Hips', 'Ball', 'LeftArm', 'RightArm', 'LeftForearm', 'RightForearm',
    'LeftHand', 'RightHand', 'LeftThigh', 'RightThigh', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) {
    p[name] = {name, up: new Vector3(.1, -.95, .2).normalize(), omega: new Vector3(.1, -.3, .2),
      rotation: Quaternion.Identity(), com: new Vector3(-.05, .1, -.15), position: new Vector3(.1, .2, .3),
      velocity: new Vector3(.05, -.1, .03), mass: 5, spec: {shape: {radius: .3}},
      addTorque(value, acceleration) {events.push({kind: 'torque', name, value: value.asArray(), acceleration});},
      addForce(value) {events.push({kind: 'force', name, value: value.asArray()});},
      body: {setAngularVelocity(value) {events.push({kind: 'rolling', name, value: value.asArray()});}},
    };
  }
  const c = {p, state: 'Walk', dt: 1 / 60, time: .4, weight: 104 * 9.81, awake: 3, groundedTime: 4,
    legPhase: 0, walkSpeed: .8, walkDirection: new Vector3(.6, 0, .8), grounded: true,
    target: new Vector3(.1, -.2, .8).normalize(), look: Quaternion.Identity(),
    input: {yaw: 0, pitch: 20, leftGrab: false, rightGrab: false},
    handControl: {count: 0, sides: {Left: {extend: 0}, Right: {extend: 0}}},
    ground: {distribute() {}},
  };
  return {c, events};
}

const gaitCases = [
  {phase: 0, order: ['torque:LeftThigh', 'torque:LeftLeg', 'force:LeftFoot'], foot: [0, 20, 0], feedback: [0, -20, 0]},
  {phase: .199999, order: ['torque:LeftThigh', 'torque:LeftLeg', 'force:LeftFoot'], foot: [0, 20, 0], feedback: [0, -20, 0]},
  {phase: .2, order: ['torque:LeftThigh', 'torque:LeftLeg'], feedback: [0, 0, 0]},
  {phase: .499999, order: ['torque:LeftThigh', 'torque:LeftLeg'], feedback: [0, 0, 0]},
  {phase: .5, order: ['force:LeftFoot', 'torque:LeftThigh', 'torque:LeftLeg'], foot: [4, -60, 8], feedback: [-4, 60, -8]},
  {phase: .699999, order: ['force:LeftFoot', 'torque:LeftThigh', 'torque:LeftLeg'], foot: [4, -60, 8], feedback: [-4, 60, -8]},
  {phase: .7, order: ['force:LeftFoot', 'torque:LeftThigh', 'torque:LeftLeg'], foot: [4, -60, 8], feedback: [-4, 60, -8]},
  {phase: .899999, order: ['force:LeftFoot', 'torque:LeftThigh', 'torque:LeftLeg'], foot: [4, -60, 8], feedback: [-4, 60, -8]},
  {phase: .9, order: ['torque:LeftThigh', 'torque:LeftLeg'], feedback: [0, 0, 0]},
];
for (const entry of gaitCases) test('gait preserves native effect order and reaction at phase ' + entry.phase, () => {
  const {c, events} = instrumentedController();
  const result = new Locomotion(c).leg('Left', entry.phase, new Vector3(20, -300, 40), .6);
  assert.deepEqual(events.map(event => event.kind + ':' + event.name), entry.order);
  assert.deepEqual(result.asArray(), entry.feedback);
  if (entry.foot) assert.deepEqual(events.find(event => event.kind === 'force').value, entry.foot);
});
test('gait uses the thigh reference axis for the shin even when their axes differ', () => {
  const {c, events} = instrumentedController();
  c.p.LeftLeg.up = Vector3.Right();
  new Locomotion(c).leg('Left', .3, Vector3.Zero(), .6);
  const shin = events.find(event => event.name === 'LeftLeg');
  const expected = vectorTorque(c.p.LeftThigh.up, c.walkDirection, c.p.LeftLeg.omega, 3 * 20 * .6);
  assert.deepEqual(shin.value, expected.asArray());
});
test('right leg consumes the reaction remaining after the left leg', () => {
  const {c, events} = instrumentedController(), locomotion = new Locomotion(c), calls = [];
  locomotion.leg = (side, phase, reaction, tone) => {
    calls.push({side, phase, reaction: reaction.asArray(), tone});
    return side === 'Left' ? new Vector3(2, 3, 4) : new Vector3(5, 6, 7);
  };
  locomotion.walk(new Vector3(10, 20, 30), .4);
  assert.deepEqual(calls, [
    {side: 'Left', phase: c.time * 1.5, reaction: [10, 20, 30], tone: .4},
    {side: 'Right', phase: c.time * 1.5 + .5, reaction: [12, 23, 34], tone: .4},
  ]);
  assert.deepEqual(events[0], {kind: 'force', name: 'Ball', value: [17, 29, 41]});
});
test('free arms read the previous leg phase and keep left-to-right effect order', () => {
  const {c, events} = instrumentedController();
  c.legPhase = 0; c.time = .8;
  new Locomotion(c).idleArms();
  assert.deepEqual(events.map(event => event.name), ['LeftArm', 'LeftForearm', 'RightArm', 'RightForearm']);
  const leftTarget = new Vector3(0, 0, -1).add(new Vector3(-.5, 0, 0));
  const rightTarget = new Vector3(.5, -1, 0);
  for (const [name, target] of [['LeftArm', leftTarget], ['RightArm', rightTarget]]) {
    const expected = vectorTorque(c.p[name].up, target, c.p[name].omega, 150 * c.walkSpeed);
    assert.deepEqual(events.find(event => event.name === name).value, expected.asArray());
  }
  assert.equal(c.legPhase, 0);
});
test('extended arms produce no automatic arm animation effects', () => {
  const {c, events} = instrumentedController();
  c.handControl.sides.Left.extend = .200001; c.handControl.sides.Right.extend = .200001;
  new Locomotion(c).idleArms(); assert.deepEqual(events, []);
});

function consume(iterator) {
  const commands = [];
  for (;;) {const next = iterator.next(); if (next.done) return {commands, feedback: next.value}; commands.push(next.value);}
}
test('posture plans preserve turn, separation, support and balance dependencies', () => {
  const {c} = instrumentedController();
  const {commands, feedback} = consume(postureActions(c));
  assert.deepEqual(commands.map(command => command.kind + ':' + (command.part ?? 'hands')), [
    'turn:Head', 'turn:Chest', 'turn:Waist', 'turn:Hips', 'separate:hands',
    'force:Head', 'force:Chest', 'force:Waist', 'force:Hips', 'balance:Hips', 'balance:Head',
  ]);
  const vertical = commands.filter(command => command.kind === 'force').reduce((sum, command) => sum + command.value.y, 0);
  assert.equal(feedback.y, -vertical);
});
test('free-fall posture emits only an opposing torso pair and no support reaction', () => {
  const {c} = instrumentedController(); c.state = 'FreeFall';
  const {commands, feedback} = consume(postureActions(c));
  assert.deepEqual(commands.map(command => command.kind + ':' + command.part), ['force:Hips', 'force:Chest']);
  assert.equal(commands[0].value.y, -commands[1].value.y);
  assert.equal(feedback.length(), 0);
});
test('single-arm climbing drops trunk tone while retaining gaze and head support', () => {
  const {c} = instrumentedController(); c.state = 'Climb'; c.grounded = false;
  c.handControl.count = 1; c.handControl.sides.Left.grab = {};
  const {commands} = consume(postureActions(c));
  const head = commands.find(command => command.kind === 'turn' && command.part === 'Head');
  assert.deepEqual(head.target.asArray(), orientation(c.input.yaw, (c.input.pitch + 80) * .5 - 80).asArray());
  for (const command of commands.filter(command => command.kind === 'turn' && command.part !== 'Head')) {
    assert.equal(command.stiffness, 0); assert.equal(command.damping, 0);
  }
  assert.ok(commands.find(command => command.kind === 'force' && command.part === 'Head').value.y > 0);
  for (const command of commands.filter(command => command.kind === 'force' && command.part !== 'Head')) assert.equal(command.value.length(), 0);
});
test('posture executor applies arm separation before the planned torso lift', () => {
  const {c, events} = instrumentedController(); c.input.leftGrab = true;
  c.p.LeftHand.com = new Vector3(-.02, .1, -.25);
  new Posture(c).solve();
  assert.deepEqual(events.map(event => event.kind + ':' + event.name), [
    'torque:Head', 'torque:Chest', 'torque:Waist', 'torque:Hips',
    'force:Head', 'force:LeftHand', 'force:Head', 'force:Chest', 'force:Waist', 'force:Hips',
    'force:Hips', 'force:Ball', 'force:Head', 'force:Ball',
  ]);
});
