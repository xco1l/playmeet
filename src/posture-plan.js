import {Vector3} from '@babylonjs/core';
import {clamp} from './physics.js';
import {mix, orientation} from './control-math.js';

const upright = {tone: 1, support: 1};
const modes = {
  Idle: {...upright, breathing: true},
  Fall: {tone: .5, support: .3},
  Climb: {gripTone: true, reachSupport: true},
};
const turns = [
  {part: 'Chest', pitch: (pitch, bend) => pitch + bend, stiffness: 2, damping: 10},
  {part: 'Waist', pitch: (pitch, bend) => pitch + bend / 2, stiffness: 1, damping: 15},
  {part: 'Hips', pitch: pitch => pitch, stiffness: .5, damping: 20},
];
const supportShares = [
  {part: 'Head', start: .2, end: 0, head: true},
  {part: 'Chest', start: .6, end: 0},
  {part: 'Waist', start: .2, end: .5},
  {part: 'Hips', start: 0, end: .5},
];

// Commands are yielded lazily so each native effect stays between the same
// calculations. Eagerly preparing a complete frame would obscure that boundary.
export function* postureActions(c) {
  const {input} = c;
  if (c.state === 'FreeFall') {
    const oscillation = Math.sin(c.time * 3) * .1 * c.weight;
    yield {kind: 'force', part: 'Hips', value: Vector3.Down().scale(oscillation)};
    yield {kind: 'force', part: 'Chest', value: Vector3.Up().scale(oscillation)};
    return Vector3.Zero();
  }

  const mode = modes[c.state] ?? upright;
  const hands = c.handControl.sides;
  const twoArms = (hands.Left.grab || input.leftGrab) && (hands.Right.grab || input.rightGrab);
  const tone = (mode.gripTone ? (twoArms ? 1 : 0) : mode.tone) * clamp(c.awake) * 2;
  const support = (mode.reachSupport ? mix(.2, 1, (input.pitch - 10) / 60) : mode.support) *
    clamp(c.awake / 3) * clamp(c.groundedTime * .2 + .8);
  const load = c.weight * .8 * support;
  const breathing = mode.breathing ? mix(1, -.5, Math.sin(c.time / 3 * Math.PI * 2) / 2 + .5) * 40 : 0;
  const gaze = c.handControl.count ? orientation(input.yaw, (input.pitch + 80) * .5 - 80) : c.look;
  yield {kind: 'turn', part: 'Head', target: gaze, stiffness: 4, damping: 20};
  if (c.grounded || mode.gripTone) {
    const targets = turns.map(row => ({...row, pitch: row.pitch(input.pitch, breathing)}));
    for (const row of targets) yield {kind: 'turn', part: row.part,
      target: orientation(input.yaw, row.pitch), stiffness: row.stiffness * tone, damping: row.damping * tone};
  }

  let lean = c.target.y > 0 ? c.target.y * .25 : -c.target.y;
  if (c.target.y > 0 && c.grounded) {
    for (const hand of Object.values(hands)) if (hand.grab?.body.getMotionType() === 2) lean *= 1.5;
  }
  yield {kind: 'separate'};
  const loads = supportShares.map(row => ({part: row.part, force: mix(row.start, row.end, lean) * load * (row.head ? 2 : tone)}));
  for (const row of loads) yield {kind: 'force', part: row.part, value: Vector3.Up().scale(row.force)};
  yield {kind: 'balance', part: 'Hips', base: 'Ball', gain: support * mix(1, .25, Math.abs(lean))};
  yield {kind: 'balance', part: 'Head', base: 'Ball', gain: .2 * support * mix(1, 0, Math.abs(lean))};
  return Vector3.Down().scale(loads.reduce((total, row) => total + row.force, 0));
}
