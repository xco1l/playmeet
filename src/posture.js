import {Vector3} from '@babylonjs/core';
import {clamp, rotate} from './physics.js';
import {alignLook, planar} from './control-math.js';
import {postureActions} from './posture-plan.js';

export class Posture {
  constructor(controller) {this.c = controller;}
  balance(top, base, gain) {
    const {dt} = this.c;
    const predictedError = base.position.add(base.velocity.scale(dt)).subtract(top.position).subtract(top.velocity.scale(3 * dt));
    const force = planar(predictedError).scale(top.mass / dt * gain);
    top.addForce(force); base.addForce(force.negate());
  }
  separateReachingHands() {
    const {p, input} = this.c;
    for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
      if (!input[side.toLowerCase() + 'Grab']) continue;
      const hand = p[side + 'Hand'];
      const offset = rotate(hand.com.subtract(p.Head.com), p.Chest.rotation.conjugate());
      const overlap = clamp(offset.z / -.1) * clamp((.1 - offset.x * sign) / .2) * clamp((offset.y + .3) / .2);
      const force = rotate(Vector3.Right(), p.Chest.rotation).scale(sign * overlap * 200);
      p.Head.addForce(force.negate()); hand.addForce(force);
    }
  }
  solve() {
    const actions = postureActions(this.c), {p} = this.c;
    for (let next = actions.next(); ; next = actions.next()) {
      if (next.done) return next.value;
      const action = next.value;
      switch (action.kind) {
        case 'turn': alignLook(p[action.part], action.target, action.stiffness, action.damping); break;
        case 'force': p[action.part].addForce(action.value); break;
        case 'balance': this.balance(p[action.part], p[action.base], action.gain); break;
        case 'separate': this.separateReachingHands(); break;
      }
    }
  }
}
