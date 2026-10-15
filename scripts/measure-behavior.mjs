import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine, Quaternion, Vector3} from '@babylonjs/core';
import {createSimulation} from '../src/simulation.js';
import {MouseLook} from '../src/mouse-look.js';

const spec = JSON.parse(fs.readFileSync(new URL('../public/data/character.json', import.meta.url)));
const wasmBinary = fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')));
const havok = await Havok({wasmBinary});
const run = (sim, frames) => {for (let frame = 0; frame < frames; frame++) sim.step();};
function measure(operation) {
  const engine = new NullEngine(), sim = createSimulation(engine, havok, spec, {obstacles: false});
  try {return operation(sim);} finally {sim.dispose(); engine.dispose();}
}
const geometry = measure(sim => Object.values(sim.rig.parts).map(part => {
  const points = part.mesh.getBoundingInfo().boundingBox.vectors.map(point => point.applyRotationQuaternion(part.mesh.rotationQuaternion ?? Quaternion.Identity()));
  const dimensions = ['x', 'y', 'z'].map(axis => Math.max(...points.map(point => point[axis])) - Math.min(...points.map(point => point[axis])));
  return {name: part.name, massKg: part.mass, dimensionsMeters: dimensions};
}));
const turns = [45, 90, -90, 180].map(target => measure(sim => {
  run(sim, 600); sim.controller.input.yaw = target;
  const samples = [];
  for (let frame = 1; frame <= 240; frame++) {
    sim.step();
    if ([1, 6, 15, 30, 60, 120, 240].includes(frame)) {
      const heading = part => Math.atan2(part.forward.x, part.forward.z) * 180 / Math.PI;
      samples.push({seconds: frame * spec.fixedDeltaTime, headDegrees: heading(sim.rig.parts.Head), hipsDegrees: heading(sim.rig.parts.Hips)});
    }
  }
  return {targetDegrees: target, samples};
}));
const movement = [.25, .5, 1].map(input => measure(sim => {
  run(sim, 600); const start = sim.rig.parts.Ball.position.clone();
  sim.controller.input.z = input; run(sim, 180);
  const velocity = Object.values(sim.rig.parts).reduce((sum, part) => sum.add(part.velocity.scale(part.mass / spec.totalMass)), Vector3.Zero());
  return {input, travelMeters: sim.rig.parts.Ball.position.subtract(start).asArray(), velocityMetersPerSecond: velocity.asArray(), headHeightMeters: sim.rig.parts.Head.com.y};
}));
const jump = measure(sim => {
  run(sim, 600); sim.controller.input.jump = true; let peak = 0, airborneFrames = 0;
  for (let frame = 0; frame < 240; frame++) {
    sim.step(); peak = Math.max(peak, sim.rig.parts.Ball.position.y);
    if (!sim.controller.grounded) airborneFrames++;
  }
  return {peakSupportHeightMeters: peak, airborneSeconds: airborneFrames * spec.fixedDeltaTime, final: sim.rig.diagnostics()};
});
const look = new MouseLook(), input = {pitch: 0, yaw: 0}, mouseImpulse = [];
look.add(100, 100);
for (let frame = 0; frame < 8; frame++) {look.step(input, spec.fixedDeltaTime); mouseImpulse.push({...input});}
const result = {schema: 1, runtime: {node: process.version, babylon: '9.29.0', havok: '1.3.14'}, rig: spec.build,
  fixedDeltaTime: spec.fixedDeltaTime, geometry, turns, movement, jump, coldMouseImpulse: mouseImpulse};
const directory = new URL('../validation/', import.meta.url);
fs.mkdirSync(directory, {recursive: true});
fs.writeFileSync(new URL('behavior.json', directory), JSON.stringify(result, null, 2) + '\n');
console.log('Measurements saved to validation/behavior.json');