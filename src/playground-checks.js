const check = (id, title, instruction, automatic = true) => Object.freeze({id, title, instruction, automatic});
export const CHECKS = Object.freeze({
  start: Object.freeze([
    check('walk', 'Walk 3 m', 'Walk on the open floor. Only travel while supported and using movement input counts.'),
    check('turn', 'Turn in place', 'Release movement input and turn the character at least 75° without walking away.'),
    check('floor-grip', 'Grab the floor', 'Look down, reach with either hand, then release the floor.'),
    check('jump-land', 'Jump and land', 'Jump from the floor and land upright. Walking off an edge does not count.'),
    check('recover', 'Recover from limp', 'Hold Y to go limp, release it, and wait until the character stands on support.'),
  ]),
  carry: Object.freeze([
    check('grab-release', 'Grab and release', 'Grab a crate or the beam, then release both hand controls.'),
    check('two-hands', 'Hold with both hands', 'Attach both hands to the same crate or beam.'),
    check('carry-light', 'Carry a light crate', 'Lift the 4 or 12 kg crate and move it at least 1 m while holding it.'),
    check('push-heavy', 'Push the heavy crate', 'Walk into the 24 kg push crate without grabbing it and move it at least 0.75 m.'),
    check('beam-alignment', 'Check beam alignment', 'Hold the long beam and turn. Confirm that its preferred grip and turning resistance are visible.', false),
  ]),
  climb: Object.freeze([
    check('climb-ledge', 'Climb a ledge', 'Grab a ledge from below, pull up, release, and stand on its top.'),
  ]),
  stairs: Object.freeze([
    check('climb-steps', 'Climb the steps', 'Step on a low stair, then stand on the sixth stair.'),
    check('balance-beam', 'Cross the balance beam', 'Travel at least 2 m along the narrow beam while staying supported and upright.'),
    check('uneven-ground', 'Check uneven ground', 'Walk across the staggered blocks and observe foot placement and recovery.', false),
  ]),
  jump: Object.freeze([
    check('cross-gap', 'Jump a platform gap', 'Jump from one raised platform and land upright on a different raised platform.'),
    check('hang', 'Hang from a bar', 'Grab the hanging or traversal bar and stay airborne for half a second.'),
    check('one-hand', 'Hang from one hand', 'Hang from both hands, release one, hold for a moment, then release the other.'),
  ]),
  moving: Object.freeze([
    check('ride-lift', 'Ride the lift', 'Stay upright on the lift while it changes height by at least 0.6 m.'),
    check('ride-shuttle', 'Ride the shuttle', 'Stay upright on the horizontal platform while it travels at least 1.2 m.'),
    check('shuttle-jump', 'Leave the moving support', 'Jump from the shuttle and land on either neighbouring landing.'),
  ]),
  slopes: Object.freeze([
    check('walk-slope', 'Walk uphill', 'Walk uphill on the 20° slope and gain at least 0.7 m of height.'),
    check('slide', 'Slide downhill', 'Choose the 50° slide face checkpoint and release movement to observe Slide. From the summit, creep onto the slope, then release movement.'),
  ]),
  camera: Object.freeze([
    check('camera-clearance', 'Check camera clearance', 'Walk through the corridor, turn at the corner, and pass under the roof. Confirm that the camera recovers after nearby walls.', false),
    check('restricted-grip', 'Check the red panel', 'Reach toward the red panel with each hand. Confirm that neither hand attaches, then grab an ordinary wall.', false),
  ]),
  fall: Object.freeze([
    check('long-fall', 'Fall and land', 'Stand on the high platform, step off, reach FreeFall, and wait for an upright landing on the floor.'),
  ]),
});

const allChecks = new Map(Object.values(CHECKS).flat().map(item => [item.id, item]));
const point = value => ({x: value?.x ?? 0, y: value?.y ?? 0, z: value?.z ?? 0});
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const fixture = body => body?.transformNode?.metadata?.fixtureId ?? (body?.transformNode?.name === 'Floor' ? 'floor' : null);
const movable = id => /^crate-(4|12|60)$/.test(id ?? '') || id === 'carry-beam';
const bar = id => id === 'hanging-bar' || id === 'traverse-bar';
const platform = id => /^jump-platform-[1-4]$/.test(id ?? '');
const first = (values, predicate) => [...values].find(predicate);

function observe(sim) {
  const c = sim.controller, p = sim.rig.parts;
  const input = sim.lastInput ?? c.input;
  const supports = new Set([...c.ground.bodies].map(fixture).filter(Boolean));
  const held = Object.values(c.handControl.sides).map(hand => fixture(hand.grab?.body)).filter(Boolean);
  const bodies = new Map(sim.world.map(aggregate => [fixture(aggregate.body), point(aggregate.transformNode.position)]).filter(([id]) => id));
  return {time: c.time, position: point(p.Ball.position), velocity: point(p.Ball.velocity),
    yaw: Math.atan2(p.Head.forward.x, p.Head.forward.z) * 180 / Math.PI,
    upright: p.Head.com.y - p.Ball.position.y > .8 && p.Chest.up.y > .5,
    grounded: c.grounded, state: c.state, supports, held, bodies, input,
    supportVelocity: point(c.ground.velocity),
    movement: Math.hypot(input.x ?? 0, input.z ?? 0)};
}

export class PlaygroundChecks {
  #station = 'start';
  #complete = new Map();
  #details = new Map();
  #rig = null;
  #last = null;
  #evidence = {};

  select(stationId, sim) {
    if (!CHECKS[stationId]) throw new Error('Unknown playground station: ' + stationId);
    this.#station = stationId;
    this.#prime(sim);
  }
  #prime(sim) {
    this.#rig = sim.rig;
    this.#last = observe(sim);
    this.#details.clear();
    this.#evidence = {walk: 0, turn: null, timers: {}, gripSeen: false, floorSeen: false,
      carryOrigins: new Map(), push: 0, stepsLow: false, hangBar: null, twoHang: false, oneHang: false,
      fallStart: false, freeFall: false, ledges: new Set()};
  }
  #pass(id, detail) {if (!this.#complete.has(id)) this.#complete.set(id, detail);}
  #timer(id, condition, dt) {
    const timers = this.#evidence.timers;
    return timers[id] = condition ? Math.min(10, (timers[id] ?? 0) + dt) : 0;
  }
  get status() {
    return CHECKS[this.#station].map(item => ({...item, complete: this.#complete.has(item.id),
      detail: this.#complete.get(item.id) ?? this.#details.get(item.id) ?? ''}));
  }
  get completed() {return this.#complete.size;}
  get total() {return allChecks.size;}
  confirm(checkId) {
    const item = CHECKS[this.#station].find(candidate => candidate.id === checkId);
    if (!item || item.automatic) return false;
    this.#pass(checkId, 'Confirmed by you.');
    return true;
  }
  clear() {
    this.#complete.clear(); this.#details.clear(); this.#last = null; this.#rig = null; this.#evidence = {};
  }
  sample(sim) {
    if (this.#rig !== sim.rig || !this.#last) {this.#prime(sim); return;}
    const current = observe(sim), previous = this.#last;
    const dt = current.time - previous.time;
    if (dt === 0) return;
    // Travel and world rebuilds begin a new observation; they cannot complete an attempt.
    if (dt < 0 || dt > .25 || distance(current.position, previous.position) > 2) {this.#prime(sim); return;}
    const e = this.#evidence;
    const stable = current.grounded && current.upright && Math.abs(current.velocity.y - current.supportVelocity.y) < 1;
    const supported = id => stable && current.supports.has(id);
    const totalGrips = current.held.length;
    const released = !totalGrips && !current.input.leftGrab && !current.input.rightGrab;
    const ready = (id, condition, duration = .3) => this.#timer(id, condition, dt) >= duration;

    if (this.#station === 'start') {
      if (supported('floor') && current.movement > .1) e.walk += distance(current.position, previous.position);
      this.#details.set('walk', Math.min(3, e.walk).toFixed(1) + ' / 3.0 m of supported movement.');
      if (e.walk >= 3) this.#pass('walk', 'Travelled 3 m with movement input and floor support.');
      if (supported('floor') && current.movement < .05) {
        e.turn ??= {position: current.position, yaw: current.yaw};
        if (distance(current.position, e.turn.position) > .5) e.turn = {position: current.position, yaw: current.yaw};
        if (angle(current.yaw, e.turn.yaw) >= 75) this.#pass('turn', 'Head turned at least 75° with no movement input.');
      } else e.turn = null;
      if (current.held.includes('floor')) e.floorSeen = true;
      if (e.floorSeen && ready('floorRelease', released, .15)) this.#pass('floor-grip', 'A floor grip was acquired and released.');
      if (previous.grounded && current.input.jump && current.state === 'Jump') e.jump = {start: previous.position.y, peak: current.position.y, airborne: false};
      if (e.jump) {
        e.jump.peak = Math.max(e.jump.peak, current.position.y);
        e.jump.airborne ||= !current.grounded;
        if (ready('jumpLanding', supported('floor') && e.jump.airborne && e.jump.peak - e.jump.start > .35)) {
          this.#pass('jump-land', 'Observed a requested takeoff, airborne rise, and stable floor landing.'); e.jump = null;
        }
      }
      if (current.input.playDead && current.state === 'Unconscious') e.limp = true;
      if (e.limp && ready('recovery', stable && current.state !== 'Unconscious' && !current.input.playDead, .5)) this.#pass('recover', 'Recovered from requested limp into an upright supported posture.');
    }

    if (this.#station === 'carry') {
      const props = current.held.filter(movable);
      if (props.length) e.gripSeen = true;
      if (e.gripSeen && ready('release', released, .15)) this.#pass('grab-release', 'A test prop was held, then both hand controls were released.');
      if (props.length === 2 && props[0] === props[1]) this.#pass('two-hands', 'Both hands attached to the same test prop.');
      for (const id of ['crate-4', 'crate-12']) {
        const position = current.bodies.get(id);
        if (!position || !current.held.includes(id)) {e.carryOrigins.delete(id); continue;}
        const origin = e.carryOrigins.get(id) ?? previous.bodies.get(id) ?? position;
        e.carryOrigins.set(id, origin);
        if (position.y - origin.y > .12 && distance(position, origin) >= 1) this.#pass('carry-light', 'A light crate travelled 1 m while held and raised above its initial height.');
      }
      const heavy = current.bodies.get('push-crate'), previousHeavy = previous.bodies.get('push-crate');
      if (heavy && previousHeavy && stable && current.movement > .1 && !totalGrips && distance(current.position, heavy) < 1.6) e.push += distance(heavy, previousHeavy);
      this.#details.set('push-heavy', Math.min(.75, e.push).toFixed(2) + ' / 0.75 m moved nearby without a grip.');
      if (e.push >= .75) this.#pass('push-heavy', 'The push crate moved 0.75 m near the walking character without a grip.');
    }

    if (this.#station === 'climb') {
      for (const id of current.held) if (id?.startsWith('ledge-') && !current.supports.has(id)) e.ledges.add(id);
      const top = first(current.supports, id => e.ledges.has(id));
      if (ready('ledgeTop', !!top && stable && released, .4)) this.#pass('climb-ledge', 'A previously gripped ledge now supports the upright character with both hands released.');
    }

    if (this.#station === 'stairs') {
      if (supported('step-1') || supported('step-2')) e.stepsLow = true;
      if (ready('topStep', e.stepsLow && supported('step-6'))) this.#pass('climb-steps', 'Observed low-stair support followed by stable support on stair six.');
      if (supported('balance-beam')) {
        e.beam ??= current.position;
        if (distance(current.position, e.beam) >= 2) this.#pass('balance-beam', 'Travelled 2 m while supported and upright on the narrow beam.');
      } else e.beam = null;
    }

    if (this.#station === 'jump' || this.#station === 'moving') {
      const origin = first(previous.supports, id => this.#station === 'jump' ? platform(id) : id === 'shuttle');
      if (previous.grounded && origin && current.input.jump && current.state === 'Jump') e.crossing = {origin, airborne: false};
      if (e.crossing) {
        e.crossing.airborne ||= !current.grounded;
        const destination = first(current.supports, id => this.#station === 'jump' ? platform(id) && id !== e.crossing.origin : id === 'shuttle-west' || id === 'shuttle-east');
        if (ready('crossingLanding', e.crossing.airborne && !!destination && stable)) {
          const id = this.#station === 'jump' ? 'cross-gap' : 'shuttle-jump';
          this.#pass(id, 'Observed a jump from the source support and an upright landing on a different target support.'); e.crossing = null;
        } else if (current.grounded && e.crossing.airborne && !destination && !current.supports.has(e.crossing.origin)) e.crossing = null;
      }
    }

    if (this.#station === 'jump') {
      const bars = current.held.filter(bar), hands = bars.length;
      const hanging = !current.grounded && hands > 0;
      if (ready('hanging', hanging, .5)) this.#pass('hang', 'Held a bar without ground support for half a second.');
      if (e.oneHang && released && !current.grounded) this.#pass('one-hand', 'Observed a continuous two-hand hang, a sustained one-hand hang on the same bar, and full release.');
      const sameBar = hanging && bars.every(id => id === bars[0]);
      if (!sameBar || (e.hangBar && e.hangBar !== bars[0])) {
        e.hangBar = null; e.twoHang = false; e.oneHang = false;
        this.#timer('twoHandHang', false, dt); this.#timer('oneHandHang', false, dt);
      }
      if (sameBar) {
        e.hangBar = bars[0];
        if (ready('twoHandHang', hands === 2, .3)) e.twoHang = true;
        if (e.twoHang && ready('oneHandHang', hands === 1, .4)) e.oneHang = true;
      }
    }

    if (this.#station === 'moving') {
      for (const [id, axis, travel, checkId] of [['lift', 'y', .6, 'ride-lift'], ['shuttle', 'x', 1.2, 'ride-shuttle']]) {
        const body = current.bodies.get(id);
        if (!supported(id) || !body) {e[id] = null; continue;}
        e[id] ??= {minimum: body[axis], maximum: body[axis]};
        e[id].minimum = Math.min(e[id].minimum, body[axis]); e[id].maximum = Math.max(e[id].maximum, body[axis]);
        if (e[id].maximum - e[id].minimum >= travel) this.#pass(checkId, 'Stayed upright on the moving support throughout the required travel.');
      }
    }

    if (this.#station === 'slopes') {
      if (supported('slope-20') && current.movement > .1) {
        e.slopeStart = Math.min(e.slopeStart ?? current.position.y, current.position.y);
        if (current.position.y - e.slopeStart >= .7) this.#pass('walk-slope', 'Gained 0.7 m while walking on the 20° slope.');
      } else e.slopeStart = null;
      const sliding = current.state === 'Slide' && current.supports.has('slope-50');
      if (sliding) {
        e.slideStart ??= current.position.y;
        if (ready('slideDuration', true, .4) && e.slideStart - current.position.y > .2) this.#pass('slide', 'Observed Slide on the 50° surface with at least 0.2 m of descent.');
      } else {e.slideStart = null; this.#timer('slideDuration', false, dt);}
    }

    if (this.#station === 'fall') {
      if (supported('fall-start')) {e.fallStart = true; e.fallHeight = current.position.y;}
      if (e.fallStart && current.state === 'FreeFall' && e.fallHeight - current.position.y > 15) e.freeFall = true;
      if (ready('fallLanding', e.freeFall && supported('floor') && current.position.y < 5, .5)) this.#pass('long-fall', 'Observed departure from the high platform, FreeFall, and an upright floor landing.');
    }
    this.#last = current;
  }
}
