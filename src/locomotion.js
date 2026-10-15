import {Vector3} from '@babylonjs/core';
import {clamp, RAD, rotate} from './physics.js';
import {alignToVector, momentum, orientation, planar} from './control-math.js';
import {armPlan, gaitPlan} from './control-policy.js';

const down = Vector3.Down(), up = Vector3.Up();
const armDirections = {
  behind: ({forward}) => forward.negate(),
  ahead: ({forward}) => forward,
  downOut: ({right}) => down.add(right.scale(.5)),
  halfAheadIn: ({forward, right}) => forward.scale(.5).subtract(right),
  behindOut: ({forward, right}) => forward.negate().add(right.scale(.5)),
  aheadDown: ({forward}) => forward.add(down),
};
const legDirections = {
  advance: direction => direction,
  advanceDown: direction => direction.add(down),
  retreat: direction => direction.negate(),
  retreatDown: direction => direction.negate().add(down),
  down: () => down,
};

export class Locomotion {
  constructor(controller) {this.c = controller;}
  idleArms() {
    const c = this.c;
    for (const side of ['Left', 'Right']) {
      if (c.handControl.sides[side].extend > .2) continue;
      const parts = {upper: c.p[side + 'Arm'], lower: c.p[side + 'Forearm']};
      const walking = c.state === 'Walk';
      let phase, basis, strength;
      if (walking) {
        phase = (c.legPhase + (side === 'Left' ? .5 : 0)) % 1;
        const facing = orientation(c.input.yaw);
        basis = {forward: rotate(Vector3.Forward(), facing),
          right: rotate(Vector3.Right(), facing).scale(side === 'Right' ? 1 : -1)};
        strength = 150 * c.walkSpeed;
      } else {basis = {forward: planar(c.target)}; strength = 20;}
      for (const command of armPlan(walking, phase)) {
        const part = parts[command.part];
        alignToVector(part, part.up, armDirections[command.direction](basis), strength);
      }
    }
  }
  stand(reaction, tone = 1) {
    const {p} = this.c;
    for (const name of ['LeftThigh', 'RightThigh', 'LeftLeg', 'RightLeg']) alignToVector(p[name], p[name].up.negate(), up, 10 * tone);
    p.Ball.addForce(reaction.scale(.2)); p.LeftFoot.addForce(reaction.scale(.4)); p.RightFoot.addForce(reaction.scale(.4));
    p.Ball.body.setAngularVelocity(Vector3.Zero());
  }
  leg(side, cycle, reaction, tone) {
    const c = this.c, parts = {thigh: c.p[side + 'Thigh'], shin: c.p[side + 'Leg']}, foot = c.p[side + 'Foot'];
    const phase = cycle - Math.floor(cycle);
    const plan = gaitPlan(phase);
    let supportedForce;
    for (const command of plan.actions) {
      if (command.kind === 'foot') {
        if (command.source === 'lift') foot.addForce(up.scale(20));
        else {supportedForce = reaction.scale(.2); foot.addForce(supportedForce);}
      } else {
        const target = legDirections[command.direction](c.walkDirection);
        // Both segments use the thigh axis; the shin axis changes the gait.
        alignToVector(parts[command.part], parts.thigh.up, target, command.gain * 20 * tone);
      }
    }
    if (plan.feedback === 'lift') return down.scale(20);
    if (plan.feedback === 'support') return supportedForce.negate();
    return Vector3.Zero();
  }
  walk(reaction, tone = 1) {
    const c = this.c;
    c.legPhase = c.time * 1.5;
    // The right leg receives the reaction remaining after the left leg.
    reaction = reaction.add(this.leg('Left', c.legPhase, reaction, tone));
    reaction = reaction.add(this.leg('Right', c.legPhase + .5, reaction, tone));
    c.p.Ball.addForce(reaction);
    const {x, z} = c.walkDirection;
    c.p.Ball.body.setAngularVelocity(new Vector3(z, 0, -x).scale((c.state === 'Walk' ? 2.5 : 1.2) / c.p.Ball.spec.shape.radius));
    const drive = c.walkDirection.scale(300);
    c.p.Ball.addForce(drive);
    if (c.grounded) c.ground.distribute(drive.negate(), c.p.Ball.position);
    else if (c.handControl.count) c.handControl.distributeForce(drive.scale(-.5));
  }
  launch() {
    const c = this.c, total = momentum(c.p), direction = c.walkDirection.normalizeToNew();
    const supportSpeed = Math.pow(clamp(c.ground.velocity.y, 0, 100), 1.2);
    const anchoredToSupport = [...c.ground.bodies].some(body => Object.values(c.handControl.sides).some(hand => hand.grab?.body === body));
    const scale = anchoredToSupport ? .75 : 1;
    const vertical = Math.max(0, (Math.sqrt(2 * .75 / 9.81) + supportSpeed / 9.81) * c.weight - total.y) * scale;
    const horizontal = Math.max(0, c.walkSpeed * (2 + supportSpeed / 2) * c.rig.spec.totalMass - Math.max(0, Vector3.Dot(direction, total))) * scale;
    for (const part of Object.values(c.p)) {
      const share = ['Head', 'Chest', 'Waist', 'Hips', 'Ball'].includes(part.name) ? .1 : part.name.endsWith('Hand') ? 0 : .05;
      part.body.applyImpulse(up.scale(vertical * share).add(direction.scale(horizontal * share)), part.com);
    }
    c.ground.distribute(down.scale(vertical / c.dt), c.p.Ball.position);
  }
  steer() {
    const c = this.c, direction = c.walkDirection.normalizeToNew();
    const deficit = c.walkSpeed * 3 * c.rig.spec.totalMass - Vector3.Dot(direction, momentum(c.p));
    c.p.Chest.addForce(direction.scale(clamp(deficit / c.dt, 0, 500)));
  }
  solve(reaction, launch) {
    const c = this.c;
    switch (c.state) {
      case 'Idle': {
        c.turnSteps -= c.dt;
        const angleCosine = Vector3.Dot(planar(c.p.Hips.forward).normalizeToNew(), planar(c.target).normalizeToNew());
        if (angleCosine < Math.cos((c.handControl.count ? 75 : 90) * RAD)) c.turnSteps = .5;
        if (c.turnSteps > 0) this.walk(reaction, .5); else this.stand(reaction);
        break;
      }
      case 'Slide': this.stand(reaction); break;
      case 'Walk': this.walk(reaction); break;
      case 'Climb': if (c.walkSpeed > 0) this.walk(reaction, 0); else this.stand(reaction, 0); break;
      default:
        c.p.Hips.addForce(reaction);
        if (launch) this.launch(); else if (c.state === 'Jump') this.steer();
    }
  }
}
