import fs from 'node:fs';
import Havok from '@babylonjs/havok';
import {NullEngine, Vector3, Quaternion} from '@babylonjs/core';
import {createSimulation} from '../../src/simulation.js';

export const spec = JSON.parse(fs.readFileSync(new URL('../../public/data/character.json', import.meta.url)));
const havok = await Havok({wasmBinary: fs.readFileSync(new URL(import.meta.resolve('@babylonjs/havok/lib/esm/HavokPhysics.wasm')))});
export function fixture(options = {}) {
  const engine = new NullEngine();
  const sim = createSimulation(engine, havok, spec, {obstacles: false, ...options});
  return {sim, close() {sim.dispose(); engine.dispose();}};
}
export const run = (sim, frames) => {for (let frame = 0; frame < frames; frame++) sim.step();};
export const yaw = part => Math.atan2(part.forward.x, part.forward.z) * 180 / Math.PI;
export const angleDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
export const range = values => Math.max(...values) - Math.min(...values);
export function dimensions(part) {
  const box = part.mesh.getBoundingInfo().boundingBox;
  const points = box.vectors.map(point => point.applyRotationQuaternion(part.mesh.rotationQuaternion ?? Quaternion.Identity()));
  return new Vector3(...[0, 1, 2].map(axis => Math.max(...points.map(p => p.asArray()[axis])) - Math.min(...points.map(p => p.asArray()[axis]))));
}
export function centerVelocity(sim) {
  return Object.values(sim.rig.parts).reduce((sum, part) => sum.add(part.velocity.scale(part.mass / spec.totalMass)), Vector3.Zero());
}
