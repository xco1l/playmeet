import {Vector3} from '@babylonjs/core';
import {clamp, clampVector, rotate} from './physics.js';
import {orientation} from './control-math.js';
import {HandController} from './hands.js';
import {GroundContacts} from './ground.js';
import {Posture} from './posture.js';
import {Locomotion} from './locomotion.js';
import {pullUp} from './pull-up.js';
import {contactTransition} from './control-policy.js';
export {alignLook, alignToVector} from './control-math.js';

export class CharacterController {
  constructor(rig, engine) {
    Object.assign(this, {rig, engine, p: rig.parts, dt: rig.spec.fixedDeltaTime, weight: rig.spec.totalMass * 9.81});
    this.input = {x: 0, z: 0, pitch: 0, yaw: 0, jump: false, leftGrab: false, rightGrab: false};
    for (const name of ['time', 'awake', 'groundedTime', 'jumpCooldown', 'groundDelay', 'fallTime', 'legPhase', 'grabStartHeight', 'unconsciousTime', 'turnSteps', 'thisFrameHit', 'lastFrameHit']) this[name] = 0;
    Object.assign(this, {active: true, state: 'Idle', grounded: false, walkDirection: Vector3.Zero(), walkSpeed: 0,
      groundBody: null, isClimbing: false, slideAngles: [], sliding: false, skipLimiting: false});
    this.handControl = new HandController(this);
    this.ground = new GroundContacts(this);
    this.posture = new Posture(this); this.locomotion = new Locomotion(this);
    this.previousVelocities = new Map(Object.values(this.p).map(part => [part.name, part.velocity]));
    this.footMaterials = Object.fromEntries(['Ball', 'LeftFoot', 'RightFoot'].map(name => [name, {...this.p[name].shape.material}]));
  }
  suspend(state) {
    this.state = state; this.pullUpPhase = ''; this.pullUpForce = 0; this.ground.pending = [];
    this.handControl.releaseAll();
    for (const hand of Object.values(this.handControl.sides)) {hand.contacts = []; hand.extend = 0;}
  }
  recover() {
    if (this.thisFrameHit + this.lastFrameHit > 30) this.knockOut();
    this.lastFrameHit = this.thisFrameHit; this.thisFrameHit = 0;
    if (this.input.playDead) this.knockOut();
    if (this.unconsciousTime <= 0) return true;
    this.unconsciousTime = Math.max(0, this.unconsciousTime - this.dt);
    this.awake = 0; this.input.jump = false; this.suspend('Unconscious');
    return false;
  }
  checkGround() {
    const found = this.ground.sample();
    this.groundBody = this.ground.bodies.values().next().value || null;
    return found;
  }
  readEnvironment() {
    const contact = this.checkGround();
    this.grounded = this.groundDelay <= 0 && contact;
    if (contact) {
      this.slideAngles.push(this.ground.angle);
      if (this.slideAngles.length > 60) this.slideAngles.shift();
    } else if (!this.handControl.count) this.slideAngles = [];
    // Empty history slots contribute zero, preserving the one-second slope ramp.
    const slope = this.slideAngles.reduce((sum, angle) => sum + angle, 0) / 60;
    const sliding = contact && (slope > 45 || (this.state === 'Slide' && slope >= 37));
    if (sliding !== this.sliding) {
      for (const [name, material] of Object.entries(this.footMaterials)) this.p[name].shape.material = sliding ? {...material, friction: 0, staticFriction: 0} : material;
      this.sliding = sliding;
    }
    this.groundedTime = this.grounded ? this.groundedTime + this.dt : 0;
    this.fallTime = this.grounded ? 0 : this.fallTime + this.dt;
    Object.assign(this, contactTransition({sliding, grounded: this.grounded, walkSpeed: this.walkSpeed,
      grips: this.handControl.count, fallTime: this.fallTime, state: this.state}));
    if (this.handControl.count) this.grabStartHeight = Math.min(this.grabStartHeight, this.p.Ball.position.y);
    this.isClimbing = this.handControl.count > 0 && this.p.Ball.position.y - this.grabStartHeight > .5;
  }
  step() {
    this.time += this.dt;
    if (!this.active) {this.suspend('Passive'); return;}
    if (!this.recover()) return;
    this.awake += this.dt; this.jumpCooldown -= this.dt; this.groundDelay -= this.dt;
    const movement = new Vector3(this.input.x, 0, this.input.z);
    this.walkSpeed = Math.min(1, movement.length());
    this.walkDirection = rotate(clampVector(movement, 1), orientation(this.input.yaw));
    this.look = orientation(this.input.yaw, this.input.pitch);
    this.target = rotate(Vector3.Forward(), this.look);
    this.readEnvironment();
    const launch = !!this.input.jump && this.grounded && this.jumpCooldown <= 0;
    if (launch) {
      this.state = 'Jump'; this.jumpCooldown = .5; this.groundDelay = .2; this.skipLimiting = true;
    }
    this.input.jump = false;
    // Grip acquisition precedes posture, but state classification uses the previous grip set.
    this.handControl.step();
    this.locomotion.idleArms();
    const reaction = this.posture.solve();
    this.locomotion.solve(reaction, launch);
    pullUp(this);
    this.rig.flush(this.dt);
    for (const part of Object.values(this.p)) if (part.name !== 'Ball') part.body.setAngularVelocity(clampVector(part.omega, 10));
  }
  knockOut(seconds = 3) {
    this.unconsciousTime = Math.max(this.unconsciousTime, seconds);
    this.handControl.releaseAll();
  }
  receiveHit(impulse) {this.thisFrameHit = Math.max(this.thisFrameHit, impulse.length());}
  afterStep() {
    const maximum = 1000 * this.dt;
    for (const part of Object.values(this.p)) {
      let velocity = part.velocity;
      const previous = this.previousVelocities.get(part.name);
      const change = velocity.subtract(previous);
      if (this.active && !this.skipLimiting) {
        if (Vector3.Dot(previous, change) < 0) {
          const axis = previous.normalizeToNew();
          change.addInPlace(axis.scale(clamp(-Vector3.Dot(axis, change), 0, previous.length())));
        }
        if (change.length() > maximum) {
          velocity = velocity.subtract(change.subtract(clampVector(change, maximum)));
          part.body.setLinearVelocity(velocity);
        }
      }
      this.previousVelocities.set(part.name, velocity);
    }
    this.skipLimiting = false;
  }
  dispose() {this.handControl.dispose(); this.ground.dispose();}
}
