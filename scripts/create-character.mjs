import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Matrix, Quaternion, Vector3} from '@babylonjs/core';

// Native insertion and accumulation order is a retained compatibility requirement.
// Havok's iterative solver does not guarantee order-independent trajectories.
const solverOrder = ['Chest', 'RightThigh', 'LeftArm', 'Hips', 'LeftForearm', 'Head', 'RightArm', 'LeftThigh', 'Ball', 'LeftFoot', 'RightLeg', 'RightHand', 'LeftLeg', 'RightFoot', 'Waist', 'RightForearm', 'LeftHand'];
const sphere = (radius, center = [0, 0, 0]) => ({kind: 'sphere', radius, center});
const capsule = (radius, length, center, axis = 1) => ({kind: 'capsule', radius, length, center, axis});
const degrees = radians => radians === 0 ? 0 : radians * 180 / Math.PI;

export const defaultDesign = Object.freeze({
  footClearance: .005,
  pelvisOverlap: .10,
  waistOverlap: .02,
  neckOverlap: .07,
  pelvisSetback: .02,
  spineSlope: .05,
  shoulderInset: .06,
  shoulderRise: .14,
  shoulderSplay: .18,
  elbowDrop: .12,
  wristSweep: .08,
  upperExtension: .98,
  lowerExtension: .84,
  neckPitch: 15,
  chestPitch: -1,
});

function frame(up, preferredForward) {
  const y = up.normalizeToNew();
  const x = Vector3.Cross(y, preferredForward).normalize();
  const z = Vector3.Cross(x, y).normalize();
  const matrix = Matrix.Identity();
  Matrix.FromXYZAxesToRef(x, y, z, matrix);
  return Quaternion.FromRotationMatrix(matrix).toEulerAngles().asArray().map(degrees);
}

export function createCharacter(overrides = {}) {
  const design = {...defaultDesign, ...overrides};
  if (!Object.values(design).every(Number.isFinite) || design.upperExtension <= 0 || design.lowerExtension <= 0 || design.shoulderInset < 0) {
    throw new Error('Invalid character design');
  }
  const bodies = new Map();
  const add = (name, mass, position, euler, shape, parent, angles, axis = [1, 0, 0], perpendicular = [0, 1, 0]) => {
    bodies.set(name, {name, mass, position: position.asArray(), euler, shape,
      angularDamping: name.endsWith('Foot') ? 5 : 1,
      friction: name === 'Ball' ? .9 : name.endsWith('Foot') ? .8 : .4,
      joint: parent ? {parent, angles, axis, perpendicular} : null});
  };
  // Primitive envelopes, mass allocation and joint intervals are measured physical
  // compatibility requirements. The articulation layout is constructed below.
  const sizes = {support: .3, hip: [.15, .54], waist: [.17, .52], chest: [.14, .5], head: .23,
    arm: [.06, .4], thigh: [.08, .3], leg: [.06, .22], hand: .07, foot: .055};
  const travel = .1;
  const hipRoot = new Vector3(0, sizes.support + travel / 2, -design.pelvisSetback);
  const advanceSpine = (root, rise) => root.add(new Vector3(0, rise, -rise * design.spineSlope));
  const waistRoot = advanceSpine(hipRoot, 2 * sizes.hip[0] - design.pelvisOverlap);
  const chestRoot = advanceSpine(waistRoot, 2 * sizes.waist[0] - design.waistOverlap);
  const neckRoot = advanceSpine(chestRoot, 2 * sizes.chest[0] - design.neckOverlap);
  add('Ball', 20, Vector3.Zero(), [0, 0, 0], sphere(sizes.support));
  add('Hips', 7, hipRoot, [0, 0, 0], capsule(...sizes.hip, [0, sizes.hip[0] + travel / 5, 0], 0));
  add('Waist', 7, waistRoot, [0, 0, 0], capsule(...sizes.waist, [0, sizes.waist[0] - design.waistOverlap, 0], 0), 'Hips', [[-20, 20], [-10, 10], [-10, 10]]);
  add('Chest', 5, chestRoot, [design.chestPitch, 0, 0], capsule(...sizes.chest, [0, sizes.chest[0] - 2 * design.waistOverlap, 0], 0), 'Waist', [[-40, 40], [-10, 10], [-10, 10]]);
  add('Head', 5, neckRoot, [design.neckPitch, 0, 0], sphere(sizes.head, [0, sizes.head + design.neckOverlap, sizes.head / 4]), 'Chest', [[-30, 30], [-60, 60], [-10, 10]]);

  for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
    const name = part => side + part;
    const shoulder = chestRoot.add(new Vector3(sign * (sizes.chest[1] / 2 - design.shoulderInset), design.shoulderRise, 0));
    const upperDirection = new Vector3(sign, 0, design.shoulderSplay).normalize();
    const lowerDirection = new Vector3(sign, -design.elbowDrop, design.wristSweep).normalize();
    const elbow = shoulder.add(upperDirection.scale(sizes.arm[1] * design.upperExtension));
    const wrist = elbow.add(lowerDirection.scale(sizes.arm[1] * design.lowerExtension));
    const upperFrame = frame(upperDirection, Vector3.Up()), lowerFrame = frame(lowerDirection, Vector3.Up());
    const armCentre = sizes.arm[1] / 2 - sizes.arm[0];
    add(name('Arm'), 5, shoulder, upperFrame, capsule(...sizes.arm, [0, armCentre, 0]), 'Chest', [[-60, 90], [-90, 90], [-10, 10]], [0, 0, sign], [1, 0, 0]);
    add(name('Forearm'), 5, elbow, lowerFrame, capsule(...sizes.arm, [0, armCentre, 0]), name('Arm'), [sign < 0 ? [-120, -10] : [10, 120], [0, 0], [0, 0]], [0, 0, 1]);
    add(name('Hand'), 5, wrist, lowerFrame, sphere(sizes.hand), name('Forearm'), [null, null, null]);

    const stance = sizes.hip[1] / 2 - sizes.thigh[0] / 2;
    const foot = new Vector3(sign * stance, sizes.foot + design.footClearance, 0);
    const knee = foot.add(new Vector3(0, sizes.leg[1] - sizes.leg[0], 0));
    const thigh = knee.add(new Vector3(0, sizes.thigh[1] - sizes.thigh[0], 0));
    const legFrame = frame(Vector3.Down(), Vector3.Backward());
    add(name('Thigh'), 5, thigh, legFrame, capsule(...sizes.thigh, [0, (sizes.thigh[1] - sizes.thigh[0]) / 2, 0]), 'Hips', [[-90, 90], [-45, 45], [0, 0]], [1, 0, 0], [0, 0, 1]);
    add(name('Leg'), 5, knee, legFrame, capsule(...sizes.leg, [0, (sizes.leg[1] - sizes.leg[0]) / 2, 0]), name('Thigh'), [[-120, 0], [0, 0], [0, 0]]);
    add(name('Foot'), 5, foot, legFrame, sphere(sizes.foot), name('Leg'), [[0, 0], [0, 0], [0, 0]]);
  }
  const ignored = new Set();
  const exclude = (a, b) => ignored.add([a, b].sort().join('|'));
  const group = names => names.forEach((a, i) => names.slice(i + 1).forEach(b => exclude(a, b)));
  for (const name of solverOrder) if (name !== 'Ball') exclude('Ball', name);
  group(['Chest', 'Waist', 'Hips']); exclude('Head', 'Chest');
  for (const side of ['Left', 'Right']) {
    const arm = ['Arm', 'Forearm', 'Hand'].map(name => side + name);
    const leg = ['Thigh', 'Leg', 'Foot'].map(name => side + name);
    group(arm); exclude('Chest', arm[0]); exclude('Chest', arm[1]);
    exclude(leg[0], leg[1]); exclude(leg[1], leg[2]);
    leg.forEach(name => exclude('Hips', name));
  }
  return {schema: 2, build: 'kinematic-rig-v2', fixedDeltaTime: 1 / 60, totalMass: 104,
    bodies: solverOrder.map(name => bodies.get(name)), ignoredCollisionPairs: [...ignored].sort().map(pair => pair.split('|')),
    antiStretch: [['LeftHand', 'Chest'], ['RightHand', 'Chest'], ['LeftFoot', 'Hips'], ['RightFoot', 'Hips']],
    suspension: {travel, stiffness: 100000, damping: 0}};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = new URL('../public/data/character.json', import.meta.url);
  const contents = JSON.stringify(createCharacter(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path, 'utf8') !== contents) throw new Error('Run pnpm character to update the generated configuration');
  } else {fs.mkdirSync(new URL('../public/data/', import.meta.url), {recursive: true}); fs.writeFileSync(path, contents);}
}
