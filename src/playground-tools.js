import {Vector3} from '@babylonjs/core';

export class PlaygroundTools {
  constructor() {this.suspended = new Map(); this.remaining = 0; this.message = '';}
  impact(sim) {
    const impulse = new Vector3(35, 0, 0), chest = sim.rig.parts.Chest;
    chest.body.applyImpulse(impulse, chest.com);
    // Native collision callbacks do not emit the controller's gameplay hit signal.
    sim.controller.receiveHit(impulse);
    this.message = 'Controlled impact applied. Wait for balance to return.';
  }
  suspendGrips(sim) {
    const bodies = new Set(Object.values(sim.controller.handControl.sides).flatMap(hand => hand.grab ? [hand.grab.body] : []));
    if (!bodies.size) {this.message = 'Grab a surface or prop first, then press G while holding Q or E.'; return false;}
    for (const body of bodies) {
      const grip = body.transformNode.metadata.interaction.grip;
      if (!this.suspended.has(grip)) this.suspended.set(grip, grip.suspended);
      grip.suspended = true;
    }
    this.remaining = 1;
    this.message = 'Held surfaces reject grips for one second. Keep reaching to re-grab.';
    return true;
  }
  loadGrips(sim) {
    const held = Object.values(sim.controller.handControl.sides).filter(hand => hand.grab);
    if (!held.length) {this.message = 'Grab a surface or prop first, then press L to stress the grip.'; return false;}
    for (const hand of held) hand.part.body.applyImpulse(new Vector3(1000, 0, 0), hand.part.com);
    this.message = 'Grip load pulse applied. Check the release reason in the hand readout.';
    return true;
  }
  toggleSuspendedFixture(sim) {
    const fixture = sim.world.find(item => item.transformNode.metadata.fixtureId === 'suspended-grip');
    if (!fixture) return;
    const grip = fixture.transformNode.metadata.interaction.grip;
    grip.suspended = !grip.suspended;
    this.message = grip.suspended ? 'Amber block grips are suspended.' : 'Amber block can now be grabbed.';
    return grip.suspended;
  }
  step(dt) {
    if (this.remaining <= 0) return;
    this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining <= 1e-9) {this.restoreGrips(); this.message = 'Grip eligibility restored.';}
  }
  restoreGrips() {
    for (const [grip, suspended] of this.suspended) {
      if (suspended === undefined) delete grip.suspended;
      else grip.suspended = suspended;
    }
    this.suspended.clear(); this.remaining = 0;
  }
  reset() {this.restoreGrips(); this.message = '';}
}
