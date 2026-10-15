import {Physics6DoFConstraint, Vector3} from '@babylonjs/core';
import {rotate, WORLD_MASK} from './physics.js';
import {orientation} from './control-math.js';
import {bodyCOM, bodyFrame, ReachSearch, unavailable} from './grip-targets.js';
import {GripForces} from './grip-forces.js';
import {gripGate, interactionProfile} from './interaction-policy.js';

const sides = ['Left', 'Right'];
export class HandController {
  constructor(controller) {
    Object.assign(this, {c: controller, rig: controller.rig, p: controller.p, plugin: controller.engine.getPhysicsPlugin(), sides: {}, serial: 0});
    this.search = new ReachSearch(controller); this.forces = new GripForces(controller);
    for (const side of sides) {
      const part = this.p[side + 'Hand'];
      const hand = {side, part, extend: 0, grabTime: 1, grabAngle: 0, grabEnabled: false, blockTime: 0,
        pos: part.position.clone(), target: part.com.clone(), grab: null, contacts: [], lastRelease: null};
      part.body.setCollisionCallbackEnabled(true);
      // Mutating constraints inside Havok's event iterator is unsafe; acquire next tick.
      hand.observer = part.body.getCollisionObservable().add(event => {
        if (event.point && event.normal && (event.collidedAgainst.shape?.filterMembershipMask & WORLD_MASK)) {
          hand.contacts.push({body: event.collidedAgainst, point: event.point.clone(), normal: event.normal.clone()});
        }
      });
      this.sides[side] = hand;
    }
  }
  get count() {return Object.values(this.sides).filter(hand => hand.grab).length;}
  desiredTarget(hand) {
    const c = this.c;
    const reach = rotate(new Vector3(0, 0, this.rig.handLength), c.look);
    if (!hand.grab) return this.p[hand.side + 'Arm'].position.add(reach);
    const offset = new Vector3(hand.side === 'Left' ? -.2 : .2, .7 + Math.min(0, -.2 * c.input.pitch / 90), c.isClimbing ? -.2 : 0);
    return this.p.Ball.position.add(rotate(offset, orientation(c.input.yaw))).add(reach);
  }
  step() {
    for (const hand of Object.values(this.sides)) this.updateHand(hand);
  }
  updateHand(hand) {
    const c = this.c;
    hand.blockTime = Math.max(0, hand.blockTime - c.dt);
    const requested = !!c.input[hand.side.toLowerCase() + 'Grab'];
    const held = hand.grab?.body;
    if (held?.isDisposed || interactionProfile(held?.transformNode.metadata).grip.suspended) {
      this.release(hand.side, .25, 'blocked'); hand.contacts = [];
    }
    Object.assign(hand, gripGate(hand, requested, c.input.pitch, c.dt));
    if (!requested) {this.release(hand.side); hand.contacts = []; return;}
    if (Vector3.DistanceSquared(hand.part.position, this.p.Chest.position) > 6) {
      this.release(hand.side, .25, 'overstretch'); hand.contacts = []; return;
    }
    // Contact checks retain the unassisted target when a search attracts the hand.
    hand.target = this.desiredTarget(hand);
    const target = hand.grab ? hand.target : this.acquire(hand, hand.target);
    hand.contacts = [];
    this.placeHand(hand, target);
    if (hand.grab?.body.getMotionType() === 2) this.liftBody(hand);
  }
  acquire(hand, desired) {
    const candidate = this.findTarget(hand, desired, this.p[hand.side + 'Arm'].position);
    const target = candidate ? candidate.target : desired;
    if (candidate?.snap && hand.grabEnabled) this.attach(hand, candidate.body, candidate.point, true);
    if (!hand.grab && hand.grabEnabled) {
      for (const contact of hand.contacts) if (this.acceptContact(hand, contact)) {
        this.attach(hand, contact.body, contact.point, false); break;
      }
    }
    return target;
  }
  findTarget(hand, target, shoulder) {return this.search.find(hand, target, shoulder);}
  acceptContact(hand, contact) {return this.search.accept(hand, contact);}
  placeHand(hand, target) {this.forces.reach(hand, target);}
  liftBody(hand) {this.forces.carry(hand);}
  attach(hand, body, point, snap) {
    if (hand.grab || !hand.grabEnabled || unavailable(body)) return false;
    const other = this.sides[hand.side === 'Left' ? 'Right' : 'Left'];
    if (this.c.state === 'Climb' && other.grab?.body === body && point.y > other.part.position.y + .2) return false;
    const part = hand.part, frame = bodyFrame(body);
    const pivotA = snap ? part.local(part.position.add(point.subtract(part.position).normalizeToNew().scale(part.spec.shape.radius))) : Vector3.Zero();
    const pivotB = frame.local(snap ? point : part.position);
    const relative = frame.rotation.conjugate().multiply(part.rotation);
    const axis = Vector3.Right(), perpendicular = Vector3.Up();
    const limits = Array.from({length: 6}, (_, axis) => ({axis, minLimit: 0, maxLimit: 0}));
    const constraint = new Physics6DoFConstraint({pivotA, pivotB, axisA: axis, axisB: rotate(axis, relative),
      perpAxisA: perpendicular, perpAxisB: rotate(perpendicular, relative), collision: false}, limits, this.rig.scene);
    part.body.addConstraint(body, constraint);
    hand.grab = {constraint, body, pivotA, pivotB, serial: ++this.serial, force: 0, torque: 0};
    hand.lastRelease = null;
    if (this.count === 1) this.c.grabStartHeight = this.p.Ball.position.y;
    return true;
  }
  release(side, blockTime = 0, reason = 'released') {
    const hand = this.sides[side];
    if (!hand) return;
    if (hand.grab) {hand.grab.constraint.dispose(); hand.grab = null; hand.lastRelease = reason;}
    hand.blockTime = Math.max(hand.blockTime, blockTime);
    if (blockTime > 0) hand.grabEnabled = false;
  }
  releaseAll() {sides.forEach(side => this.release(side));}
  distributeForce(force) {
    const held = Object.values(this.sides).filter(hand => hand.grab);
    for (const hand of held) if (hand.grab.body.getMotionType() === 2) hand.grab.body.applyImpulse(force.scale(this.c.dt / held.length), bodyCOM(hand.grab.body));
  }
  afterStep() {
    for (const hand of Object.values(this.sides)) {
      if (!hand.grab) continue;
      // Babylon 9.29 has no public applied-impulse query. This bridge is version-specific.
      const native = hand.grab.constraint._pluginData?.[0];
      const api = this.plugin._hknp;
      const load = native && api.HP_Constraint_GetAppliedImpulses(native);
      if (!load || load[0] !== api.Result.RESULT_OK) continue;
      hand.grab.force = Vector3.FromArray(load[1]).length() / this.c.dt;
      hand.grab.torque = Vector3.FromArray(load[2]).length() / this.c.dt;
      if (hand.grab.force > 20000 || hand.grab.torque > 20000) this.release(hand.side, .2, 'overload');
    }
  }
  diagnostics() {
    return Object.fromEntries(Object.values(this.sides).map(hand => [hand.side, {
      reaching: hand.extend > 0, holding: hand.grab?.body.transformNode.name || null, force: hand.grab?.force || 0,
      error: hand.grab ? Vector3.Distance(hand.part.world(hand.grab.pivotA), bodyFrame(hand.grab.body).world(hand.grab.pivotB)) : 0,
      lastRelease: hand.lastRelease,
    }]));
  }
  dispose() {
    this.releaseAll();
    for (const hand of Object.values(this.sides)) hand.part.body.getCollisionObservable().remove(hand.observer);
    this.search.dispose();
  }
}
