import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion, Vector3} from '@babylonjs/core';
import {createCharacter, defaultDesign} from '../scripts/create-character.mjs';

const parts = design => Object.fromEntries(createCharacter(design).bodies.map(body => [body.name, body]));
const point = body => Vector3.FromArray(body.position);
const rotation = body => {
  const [pitch, yaw, roll] = body.euler.map(value => value * Math.PI / 180);
  return Quaternion.RotationYawPitchRoll(yaw, pitch, roll);
};
// Babylon's intermediate rotation matrices use single-precision storage.
const close = (a, b, message) => assert.ok(Vector3.Distance(a, b) < 1e-6, message);

test('arm frames follow the constructed chain and preserve their bending planes', () => {
  const p = parts();
  for (const side of ['Left', 'Right']) for (const [segment, endpoint] of [['Arm', 'Forearm'], ['Forearm', 'Hand']]) {
    const body = p[side + segment], q = rotation(body);
    const direction = point(p[side + endpoint]).subtract(point(body)).normalize();
    const up = Vector3.Up().applyRotationQuaternion(q);
    const forward = Vector3.Forward().applyRotationQuaternion(q);
    close(up, direction, side + segment);
    assert.ok(Math.abs(Vector3.Dot(up, forward)) < 1e-10);
    assert.ok(forward.y > .98);
  }
});

test('arm extension changes only downstream joints without changing primitive envelopes or mass', () => {
  const base = parts(), extended = parts({upperExtension: defaultDesign.upperExtension + .1});
  for (const side of ['Left', 'Right']) {
    close(point(base[side + 'Arm']), point(extended[side + 'Arm']));
    const elbowShift = point(extended[side + 'Forearm']).subtract(point(base[side + 'Forearm']));
    const wristShift = point(extended[side + 'Hand']).subtract(point(base[side + 'Hand']));
    assert.ok(Math.abs(elbowShift.length() - .04) < 1e-10);
    close(elbowShift, wristShift);
  }
  for (const name of Object.keys(base)) {
    assert.deepEqual(base[name].shape, extended[name].shape);
    assert.equal(base[name].mass, extended[name].mass);
  }
});

test('wrist extension preserves the elbow and shoulder articulation', () => {
  const base = parts(), extended = parts({lowerExtension: defaultDesign.lowerExtension + .1});
  for (const side of ['Left', 'Right']) {
    for (const suffix of ['Arm', 'Forearm']) close(point(base[side + suffix]), point(extended[side + suffix]));
    assert.ok(Math.abs(Vector3.Distance(point(base[side + 'Hand']), point(extended[side + 'Hand'])) - .04) < 1e-10);
  }
});

test('ground clearance moves each leg chain as a unit and leaves trunk anchors unchanged', () => {
  const base = parts(), lifted = parts({footClearance: defaultDesign.footClearance + .02});
  for (const side of ['Left', 'Right']) for (const suffix of ['Thigh', 'Leg', 'Foot']) {
    close(point(lifted[side + suffix]).subtract(point(base[side + suffix])), new Vector3(0, .02, 0));
  }
  for (const suffix of ['Hips', 'Waist', 'Chest', 'Head']) close(point(lifted[suffix]), point(base[suffix]));
});

test('torso overlap propagates through attached upper-body chains', () => {
  const base = parts(), compressed = parts({pelvisOverlap: defaultDesign.pelvisOverlap + .02});
  close(point(base.Hips), point(compressed.Hips));
  for (const name of ['Waist', 'Chest', 'Head', ...['Left', 'Right'].flatMap(side => ['Arm', 'Forearm', 'Hand'].map(part => side + part))]) {
    close(point(compressed[name]).subtract(point(base[name])), new Vector3(0, -.02, .02 * defaultDesign.spineSlope), name);
  }
});

test('both chains remain reflected under new splay and extension choices', () => {
  const p = parts({shoulderSplay: .3, wristSweep: .2, upperExtension: .9, lowerExtension: .8});
  for (const suffix of ['Arm', 'Forearm', 'Hand', 'Thigh', 'Leg', 'Foot']) {
    const left = p['Left' + suffix], right = p['Right' + suffix];
    const reflect = vector => new Vector3(-vector.x, vector.y, vector.z);
    close(reflect(point(left)), point(right));
    for (const direction of [Vector3.Up(), Vector3.Forward()]) {
      close(reflect(direction.applyRotationQuaternion(rotation(left))), direction.applyRotationQuaternion(rotation(right)));
    }
  }
});

test('hand joints remain rotationally free and elbow axes use one local convention', () => {
  const p = parts();
  for (const side of ['Left', 'Right']) {
    assert.deepEqual(p[side + 'Hand'].joint.angles, [null, null, null]);
    assert.deepEqual(p[side + 'Forearm'].joint.axis, [0, 0, 1]);
  }
});

test('design generation returns finite JSON-stable values without shared mutable body data', () => {
  const first = createCharacter(), second = createCharacter();
  assert.deepEqual(first, JSON.parse(JSON.stringify(first)));
  first.bodies[0].shape.center[0] = 10;
  assert.equal(second.bodies[0].shape.center[0], 0);
  assert.throws(() => createCharacter({shoulderSplay: NaN}));
  assert.throws(() => createCharacter({upperExtension: 0}));
  assert.throws(() => createCharacter({lowerExtension: -1}));
});
