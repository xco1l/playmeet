# Discrete control compatibility

The required behavior is a fixed-step mathematical contract. Changing its
equations, update dependencies or units changes input feel even when a high-level
description such as “PD ragdoll” still applies.

The controller classifies contact and state before acquiring new hand constraints.
It then solves reaching and free-arm motion, torso support, locomotion, ledge
clearance and accumulated impulses. Native physics follows; constraint loads and
the velocity-change limiter are read afterward. Free-arm gait uses the preceding
leg phase, and the right leg receives the torso reaction remaining after the left
leg. These dependencies are intentional.

Mouse look uses a four-tap FIR kernel with newest-first weights 0.4, 0.3, 0.2, 0.1.
Available weights are normalized during startup. Zero-input fixed ticks still
enter the filter. Horizontal gain is 0.15 degrees per input unit, vertical gain
twice that; pitch saturates at 80 degrees and approaches its filtered target at
1800 degrees per second.

Look correction uses the shortest quaternion error with stiffness expressed per
degree. Vector alignment predicts orientation 0.1 seconds ahead, then applies an
arcsine cross-product correction. The latter has an antiparallel singularity;
replacing it with an atan2 controller changes the contract.

For one-dimensional bang-bang motion with initial velocity v, displacement x,
acceleration a and duration T, the switching time is T/2 - v/(2a). Travel-time
candidates are (-v ± sqrt(2v² + 4ax))/a. The inverse acceleration candidates use
b = Tv - 2x and a = (-b ± sqrt(b² + T²v²))/T². Only candidates with admissible
switching times are retained. The three-dimensional reach solver separates axial
and lateral velocity and performs five fixed-point iterations within an
acceleration budget. Squared offsets below 1e-10 use direct velocity cancellation.

Jump height calibration uses sqrt(2gh) with g = 9.81 and h = 0.75. The impulse
subtracts existing momentum and accounts for upward support velocity. The main
five bodies each receive ten percent, hands receive none, and the remaining ten
bodies each receive five percent. Replacing these shares with mass-weighted shares
changes the takeoff pose. Ground contact is delayed for 0.2 seconds after launch,
while launch eligibility has a separate 0.5 second cooldown.

Slope history divides by a full 60 samples even while filling. Sliding enters
above 45 degrees and persists at 37 degrees or above. Support velocity chooses
the greatest absolute signed component independently on each axis. Knockout uses
the maximum hit within each frame and sums two adjacent frames, with a strict
threshold above 30.

The post-physics velocity-change cap excludes braking and skips the launch step.
Angular speed is limited before physics, so post-solver angular velocity may
exceed that limit transiently. Contact evidence is queued until the next control
tick because native collision callbacks must not mutate the constraint iterator.