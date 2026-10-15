import {clamp, RAD} from './physics.js';

export class CameraView {
  constructor() {this.standing = 0;}
  update(pitch, yaw, speed, elapsed) {
    const destination = (.5 + .5 * Math.abs(pitch) / 80) * Math.max(0, 1 - speed / .5);
    this.standing += clamp(destination - this.standing, -elapsed, elapsed);
    const elevation = 10 + pitch / 80 * (20 + 40 * this.standing);
    return {alpha: -Math.PI / 2 - yaw * RAD, beta: Math.PI / 2 - elevation * RAD};
  }
}