import {
  Vector3, Quaternion, TransformNode, MeshBuilder, StandardMaterial, Color3,
  PhysicsBody, PhysicsMotionType, PhysicsShapeSphere, PhysicsShapeCapsule,
  Physics6DoFConstraint, PhysicsConstraintAxis as Axis, PhysicsMaterialCombineMode as Combine, PhysicsActivationControl,
} from '@babylonjs/core';

export const V = value => Array.isArray(value) ? Vector3.FromArray(value) : new Vector3(value?.x || 0, value?.y || 0, value?.z || 0);
export const rotate = (vector, rotation) => vector.applyRotationQuaternion(rotation);
export const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
export const clampVector = (vector, maximum) => vector.length() > maximum ? vector.scale(maximum / vector.length()) : vector;
export const RAD = Math.PI / 180;
export const WORLD_MASK = 1 << 20;
const pairKey = (a, b) => [a, b].sort().join('|');
const basis = [Vector3.Right(), Vector3.Up(), Vector3.Forward()];

export function angularImpulseFromAcceleration(acceleration, rotation, properties, dt) {
  const frame = rotation.multiply(properties.inertiaOrientation || Quaternion.Identity());
  const local = rotate(acceleration, frame.conjugate());
  // Havok reports inertia per unit mass, including its principal-axis orientation.
  return rotate(local.multiply(properties.inertia), frame).scale(dt * (properties.mass ?? 1));
}

export function validateCharacter(spec) {
  if (spec?.schema !== 2) throw new Error('Unsupported character schema');
  if (!(spec.fixedDeltaTime > 0 && Number.isFinite(spec.fixedDeltaTime))) throw new Error('Invalid fixed timestep');
  const names = new Set();
  for (const body of spec.bodies) {
    if (names.has(body.name)) throw new Error('Duplicate body: ' + body.name);
    names.add(body.name);
    if (!(body.mass > 0 && Number.isFinite(body.mass))) throw new Error('Invalid mass: ' + body.name);
    if (![...body.position, ...body.euler, ...body.shape.center].every(Number.isFinite)) throw new Error('Invalid pose: ' + body.name);
    if (!(body.shape.radius > 0 && Number.isFinite(body.shape.radius))) throw new Error('Invalid radius: ' + body.name);
    if (body.shape.kind === 'capsule' && (!(body.shape.length >= 2 * body.shape.radius) || ![0, 1, 2].includes(body.shape.axis))) throw new Error('Invalid capsule: ' + body.name);
    if (!['sphere', 'capsule'].includes(body.shape.kind)) throw new Error('Unsupported primitive');
  }
  if (Math.abs(spec.bodies.reduce((sum, body) => sum + body.mass, 0) - spec.totalMass) > 1e-6) throw new Error('Total mass mismatch');
  for (const body of spec.bodies) if (body.joint && !names.has(body.joint.parent)) throw new Error('Unknown joint parent');
}

export class Segment {
  constructor(spec, scene, spawn, color) {
    Object.assign(this, {spec, name: spec.name, mass: spec.mass});
    const [pitch, yaw, roll] = spec.euler.map(angle => angle * RAD);
    this.node = new TransformNode(spec.name, scene);
    this.node.position.copyFrom(V(spec.position).add(spawn));
    this.node.rotationQuaternion = Quaternion.RotationYawPitchRoll(yaw, pitch, roll);
    this.center = V(spec.shape.center);
    const {kind, radius, length, axis} = spec.shape;
    if (kind === 'sphere') {
      this.shape = new PhysicsShapeSphere(this.center, radius, scene);
      this.mesh = MeshBuilder.CreateSphere(spec.name + ' shape', {diameter: 2 * radius, segments: spec.name === 'Ball' ? 6 : 16}, scene);
    } else {
      const extent = basis[axis].scale(Math.max(0, length / 2 - radius));
      this.shape = new PhysicsShapeCapsule(this.center.subtract(extent), this.center.add(extent), radius, scene);
      this.mesh = MeshBuilder.CreateCapsule(spec.name + ' shape', {height: length, radius, tessellation: 12}, scene);
      this.mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(Vector3.Up(), basis[axis], new Quaternion());
    }
    const material = new StandardMaterial(spec.name + ' material', scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.specularColor = new Color3(.15, .15, .15);
    if (spec.name === 'Ball') {material.alpha = .28; material.wireframe = true;}
    Object.assign(this.mesh, {material, parent: this.node});
    this.mesh.position.copyFrom(this.center);
    this.shape.material = {friction: spec.friction, staticFriction: spec.friction, restitution: 0,
      frictionCombine: Combine.ARITHMETIC_MEAN, restitutionCombine: Combine.ARITHMETIC_MEAN};
    this.node.computeWorldMatrix(true);
    this.body = new PhysicsBody(this.node, PhysicsMotionType.DYNAMIC, false, scene);
    this.body.shape = this.shape;
    this.body.setMassProperties({mass: spec.mass});
    scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(this.body, PhysicsActivationControl.ALWAYS_ACTIVE);
    this.body.setLinearDamping(0);
    this.body.setAngularDamping(spec.angularDamping);
    this.force = Vector3.Zero(); this.torque = Vector3.Zero(); this.acceleration = Vector3.Zero();
  }
  get position() {return this.node.position;}
  get rotation() {return this.node.rotationQuaternion;}
  get velocity() {return this.body.getLinearVelocity();}
  get omega() {return this.body.getAngularVelocity();}
  get up() {return rotate(Vector3.Up(), this.rotation);}
  get forward() {return rotate(Vector3.Forward(), this.rotation);}
  get com() {return this.world(this.body.getMassProperties().centerOfMass || this.center);}
  local(point) {return rotate(point.subtract(this.position), this.rotation.conjugate());}
  world(point) {return this.position.add(rotate(point, this.rotation));}
  addForce(force) {
    if (!Number.isFinite(force.lengthSquared())) throw new Error('Nonfinite force');
    this.force.addInPlace(force);
  }
  addTorque(torque, acceleration = false) {(acceleration ? this.acceleration : this.torque).addInPlace(torque);}
  flush(dt) {
    this.body.applyImpulse(this.force.scale(dt), this.com);
    const accelerationImpulse = angularImpulseFromAcceleration(this.acceleration, this.rotation, this.body.getMassProperties(), dt);
    this.body.applyAngularImpulse(this.torque.scale(dt).add(accelerationImpulse));
    for (const accumulator of [this.force, this.torque, this.acceleration]) accumulator.setAll(0);
  }
}

export class Ragdoll {
  constructor(spec, scene, spawn = new Vector3(0, .55, 0)) {
    validateCharacter(spec);
    Object.assign(this, {scene, spec, parts: {}, constraints: [], links: []});
    for (const body of spec.bodies) {
      const color = body.name.startsWith('Left') ? '#57C4D2' : body.name.startsWith('Right') ? '#E6B875' : '#EBE5D9';
      this.parts[body.name] = new Segment(body, scene, spawn, color);
    }
    const names = Object.keys(this.parts);
    const exclusions = new Set(spec.ignoredCollisionPairs.map(([a, b]) => pairKey(a, b)));
    names.forEach((name, index) => {
      const shape = this.parts[name].shape;
      shape.filterMembershipMask = 1 << index;
      shape.filterCollideMask = names.reduce((mask, other, otherIndex) =>
        name === other || exclusions.has(pairKey(name, other)) ? mask : mask | (1 << otherIndex), WORLD_MASK);
    });
    for (const body of spec.bodies) {
      if (!body.joint) continue;
      const child = this.parts[body.name], parent = this.parts[body.joint.parent];
      const pivotA = Vector3.Zero(), pivotB = parent.local(child.position);
      const limits = [0, 1, 2].map(axis => ({axis, minLimit: 0, maxLimit: 0}));
      body.joint.angles.forEach((range, index) => {
        if (range) limits.push({axis: index + 3, minLimit: range[0] * RAD, maxLimit: range[1] * RAD});
      });
      // Interleave each linear and angular axis to keep native solver insertion stable.
      limits.sort((a, b) => (a.axis % 3) * 2 + (a.axis >= 3 ? 1 : 0) - ((b.axis % 3) * 2 + (b.axis >= 3 ? 1 : 0)));
      this.addConstraint(child, parent, pivotA, pivotB, V(body.joint.axis), V(body.joint.perpendicular), limits);
      this.links.push({a: child, b: parent, pivotA, pivotB});
    }
    for (const [aName, bName] of spec.antiStretch) {
      const a = this.parts[aName], b = this.parts[bName];
      this.addConstraint(a, b, Vector3.Zero(), Vector3.Zero(), basis[0], basis[1],
        [{axis: Axis.LINEAR_DISTANCE, minLimit: 0, maxLimit: Vector3.Distance(a.position, b.position)}]);
    }
    const {Ball: ball, Hips: hips, LeftArm: upper, LeftForearm: lower, LeftHand: hand} = this.parts;
    const {travel, stiffness, damping} = spec.suspension;
    const hipPivot = hips.local(spawn.add(new Vector3(0, ball.spec.shape.radius + travel, 0)));
    this.addConstraint(ball, hips, Vector3.Zero(), hipPivot, basis[0], basis[1],
      [{axis: Axis.LINEAR_DISTANCE, minLimit: 0, maxLimit: travel, stiffness, damping}]);
    this.handLength = Vector3.Distance(upper.position, lower.position) + Vector3.Distance(lower.position, hand.position);
  }
  addConstraint(a, b, pivotA, pivotB, axisA, perpAxisA, limits) {
    const relative = b.rotation.conjugate().multiply(a.rotation);
    const constraint = new Physics6DoFConstraint({pivotA, pivotB, axisA, perpAxisA,
      axisB: rotate(axisA, relative), perpAxisB: rotate(perpAxisA, relative), collision: false}, limits, this.scene);
    a.body.addConstraint(b.body, constraint);
    constraint.isCollisionsEnabled = false; this.constraints.push(constraint);
    return constraint;
  }
  flush(dt) {Object.values(this.parts).forEach(part => part.flush(dt));}
  diagnostics() {
    const parts = Object.values(this.parts);
    return {finite: parts.every(part => [...part.position.asArray(), ...part.velocity.asArray()].every(Number.isFinite)),
      maxAnchorError: Math.max(...this.links.map(link => Vector3.Distance(link.a.world(link.pivotA), link.b.world(link.pivotB)))),
      headHeight: this.parts.Head.com.y, ballHeight: this.parts.Ball.position.y,
      speed: parts.reduce((sum, part) => sum.add(part.velocity.scale(part.mass / this.spec.totalMass)), Vector3.Zero()).length()};
  }
  dispose() {
    this.constraints.forEach(constraint => constraint.dispose());
    for (const part of Object.values(this.parts)) {
      part.body.dispose(); part.shape.dispose(); part.mesh.material?.dispose(); part.node.dispose();
    }
  }
}