import test from 'node:test';
import assert from 'node:assert/strict';
import {MouseLook} from '../src/mouse-look.js';
import {CameraView} from '../src/camera-view.js';

const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, a + ' != ' + b);
test('cold mouse filter normalizes its available weights', () => {
  const look = new MouseLook(), input = {pitch: 0, yaw: 0};
  look.add(100, 20); look.step(input, 1 / 60);
  close(input.yaw, 15); close(input.pitch, 6);
  look.step(input, 1 / 60); close(input.yaw, 15 + 4.5 / .7);
});
test('mouse events accumulate before a fixed step', () => {
  const a = new MouseLook(), b = new MouseLook(), x = {pitch: 0, yaw: 0}, y = {...x};
  a.add(10, 5); a.add(-2, 7); b.add(8, 12);
  for (let i = 0; i < 8; i++) {a.step(x, 1 / 60); b.step(y, 1 / 60); assert.deepEqual(x, y);}
});
test('mouse reset removes pending events and history', () => {
  const look = new MouseLook(), input = {pitch: 12, yaw: 90};
  look.add(500, -500); look.step(input, 1 / 60); look.add(99, 99);
  look.reset(12, 90); input.pitch = 12;
  for (let i = 0; i < 8; i++) look.step(input, 1 / 60);
  assert.deepEqual(input, {pitch: 12, yaw: 90});
});
test('mouse yaw remains continuous beyond a complete revolution', () => {
  const look = new MouseLook(), input = {pitch: 0, yaw: 0};
  look.reset(0, 359); look.add(100, 0); look.step(input, 1 / 60);
  close(input.yaw, 374);
});
for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
  test('pitch rate limit follows elapsed time ' + dt, () => {
    const look = new MouseLook(), input = {pitch: 0, yaw: 0};
    look.add(0, 10000); look.step(input, dt);
    close(input.pitch, Math.min(80, 1800 * dt));
  });
}
for (const sign of [-1, 1]) {
  test('pitch clamp survives a sustained large input ' + sign, () => {
    const look = new MouseLook(), input = {pitch: 0, yaw: 0};
    for (let i = 0; i < 120; i++) {look.add(0, sign * 1e6); look.step(input, 1 / 60);}
    assert.equal(input.pitch, sign * 80); assert.equal(look.pitch, sign * 80);
  });
}
test('mouse impulse has no residual output after four warm samples', () => {
  const look = new MouseLook(), input = {pitch: 0, yaw: 0};
  for (let i = 0; i < 4; i++) look.step(input, 1 / 60);
  look.add(100, 0);
  const increments = [];
  for (let i = 0; i < 6; i++) {const before = input.yaw; look.step(input, 1 / 60); increments.push(input.yaw - before);}
  increments.forEach((value, i) => close(value, [6, 4.5, 3, 1.5, 0, 0][i]));
});
for (const [pitch, speed, elevation] of [[0, 0, 10], [80, 0, 70], [-80, 0, -50], [80, 1, 30], [-80, 1, -10], [40, 0, 35]]) {
  test('camera settled elevation for pitch/speed ' + pitch + '/' + speed, () => {
    const camera = new CameraView(); let angles;
    for (let i = 0; i < 120; i++) angles = camera.update(pitch, 0, speed, 1 / 60);
    close(90 - angles.beta * 180 / Math.PI, elevation, 1e-8);
  });
}
test('camera standing blend advances at one unit per second', () => {
  const view = new CameraView();
  view.update(80, 0, 0, .1); close(view.standing, .1);
  view.update(80, 0, 0, .2); close(view.standing, .3);
  view.update(80, 0, 1, .05); close(view.standing, .25);
});
test('camera frame partition preserves a constant target', () => {
  const a = new CameraView(), b = new CameraView();
  for (let i = 0; i < 30; i++) a.update(-80, 45, 0, 1 / 60);
  for (let i = 0; i < 60; i++) b.update(-80, 45, 0, 1 / 120);
  close(a.standing, b.standing);
});
test('camera yaw tracks complete revolutions without changing elevation', () => {
  const a = new CameraView().update(0, -90, 1, 1), b = new CameraView().update(0, 270, 1, 1);
  close(a.beta, b.beta); close(a.alpha - b.alpha, 2 * Math.PI);
});