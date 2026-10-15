import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, run, yaw, angleDistance} from './support/fixture.mjs';

for (const target of [45, 90, -90, 180]) {
  test(`head turn to ${target} degrees preserves rise time and settling`, () => {
    const {sim, close} = fixture();
    try {
      run(sim, 600); sim.controller.input.yaw = target;
      const errors = [];
      for (let frame = 0; frame < 240; frame++) {sim.step(); errors.push(angleDistance(yaw(sim.rig.parts.Head), target));}
      if (Math.abs(target) !== 180) {
        assert.ok(errors[5] < Math.abs(target) * .6, `100 ms error ${errors[5]}`);
        assert.ok(errors[14] < 9, `250 ms error ${errors[14]}`);
        assert.ok(errors[59] < 3, `1 s error ${errors[59]}`);
      } else {
        assert.ok(errors[29] < 95, `500 ms error ${errors[29]}`);
        assert.ok(errors[59] < 12, `1 s error ${errors[59]}`);
      }
      assert.ok(errors[239] < 2, `settled error ${errors[239]}`);
      assert.ok(sim.rig.diagnostics().finite);
      assert.ok(sim.rig.diagnostics().maxAnchorError < .03);
    } finally {close();}
  });
}
for (const target of [90, -90]) {
  test(`body turn to ${target} degrees retains inertia instead of snapping to the head`, () => {
    const {sim, close} = fixture();
    try {
      run(sim, 600); sim.controller.input.yaw = target; run(sim, 15);
      const head = yaw(sim.rig.parts.Head), hips = yaw(sim.rig.parts.Hips);
      assert.ok(angleDistance(head, target) < 9);
      assert.ok(angleDistance(hips, target) > 25 && angleDistance(hips, target) < 100);
      run(sim, 45);
      assert.ok(angleDistance(yaw(sim.rig.parts.Hips), target) < 65);
      assert.ok(sim.rig.diagnostics().headHeight > 1.3);
    } finally {close();}
  });
}
test('equivalent yaw targets across the angle wrap produce the same head response', () => {
  const headings = [];
  for (const target of [-90, 270]) {
    const {sim, close} = fixture();
    try {run(sim, 600); sim.controller.input.yaw = target; run(sim, 60); headings.push(yaw(sim.rig.parts.Head));} finally {close();}
  }
  assert.ok(angleDistance(...headings) < .05);
});
for (const pitch of [-60, 0, 60]) {
  test(`pitch ${pitch} retains the head and trunk response bands`, () => {
    const {sim, close} = fixture();
    try {
      run(sim, 600); sim.controller.input.pitch = pitch; run(sim, 300);
      const p = sim.rig.parts;
      if (pitch < 0) {assert.ok(p.Head.forward.y > .1 && p.Head.forward.y < .35); assert.ok(p.Chest.forward.y > -.07 && p.Chest.forward.y < .12);}
      if (pitch > 0) {assert.ok(p.Head.forward.y < -.78 && p.Head.forward.y > -.98); assert.ok(p.Chest.forward.y < -.6 && p.Chest.forward.y > -.86);}
      assert.ok(sim.controller.grounded); assert.ok(sim.rig.diagnostics().maxAnchorError < .03);
    } finally {close();}
  });
}
