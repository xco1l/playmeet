const transitions = [
  {accepts: facts => facts.sliding, state: 'Slide', grounded: false},
  {accepts: facts => facts.grounded, state: facts => facts.walkSpeed > 0 ? 'Walk' : 'Idle'},
  {accepts: facts => facts.grips > 0, state: 'Climb', fallTime: 0},
  {accepts: facts => facts.fallTime > 3, state: 'FreeFall'},
  {accepts: facts => facts.fallTime > 1 || facts.state === 'Climb', state: 'Fall'},
];

// A retained state is distinct from a transition: the first airborne second can
// preserve Jump, and losing a grip must leave Climb immediately.
export function contactTransition(facts) {
  const rule = transitions.find(candidate => candidate.accepts(facts));
  if (!rule) return {};
  const {accepts, ...effect} = rule;
  return {...effect, state: typeof effect.state === 'function' ? effect.state(facts) : effect.state};
}

const aim = (part, direction, gain) => Object.freeze({kind: 'aim', part, direction, gain});
const foot = source => Object.freeze({kind: 'foot', source});
const segment = (until, actions, feedback = 'none') => Object.freeze({until, actions: Object.freeze(actions), feedback});

const gait = Object.freeze([
  segment(.2, [aim('thigh', 'advanceDown', 3), aim('shin', 'retreatDown', 1), foot('lift')], 'lift'),
  segment(.5, [aim('thigh', 'advance', 2), aim('shin', 'advance', 3)]),
  segment(.7, [foot('support'), aim('thigh', 'advanceDown', 1), aim('shin', 'down', 1)], 'support'),
  segment(.9, [foot('support'), aim('thigh', 'retreatDown', 1), aim('shin', 'retreatDown', 1)], 'support'),
  segment(Infinity, [aim('thigh', 'retreatDown', 1), aim('shin', 'retreat', 1)]),
]);

export function gaitPlan(phase) {
  return gait.find(segment => phase < segment.until) ?? gait.at(-1);
}

const armPoses = Object.freeze({
  rest: Object.freeze([aim('upper', 'behind', 1), aim('lower', 'ahead', 1)]),
  first: Object.freeze([aim('upper', 'downOut', 1), aim('lower', 'halfAheadIn', 1)]),
  second: Object.freeze([aim('upper', 'behindOut', 1), aim('lower', 'aheadDown', 1)]),
});

export function armPlan(walking, phase) {
  return walking ? armPoses[phase < .5 ? 'first' : 'second'] : armPoses.rest;
}
