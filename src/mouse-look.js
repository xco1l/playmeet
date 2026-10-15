const bound = (value, lo, hi) => Math.max(lo, Math.min(value, hi));

class RecentSamples {
  constructor() {this.values = [];}
  sample(value) {
    this.values = [value, ...this.values].slice(0, 4);
    let weighted = 0, weight = 0;
    this.values.forEach((sample, index) => {
      const coefficient = [.4, .3, .2, .1][index];
      weighted += sample * coefficient; weight += coefficient;
    });
    return weighted / weight;
  }
}

export class MouseLook {
  constructor() {this.reset(0, 0);}
  reset(pitch, yaw) {
    Object.assign(this, {pitch, yaw, dx: 0, dy: 0});
    this.horizontal = new RecentSamples(); this.vertical = new RecentSamples();
  }
  add(dx, dy) {this.dx += dx; this.dy += dy;}
  step(input, dt) {
    this.yaw += this.horizontal.sample(this.dx * .15);
    this.pitch = bound(this.pitch + this.vertical.sample(this.dy * .15 * 2), -80, 80);
    this.dx = this.dy = 0;
    input.yaw = this.yaw;
    input.pitch += bound(this.pitch - input.pitch, -1800 * dt, 1800 * dt);
  }
}