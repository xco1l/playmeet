# Evidence and limits

Run `pnpm test` for the complete public suite. It uses the installed Havok WASM
binary with Babylon's NullEngine, so the physical tests execute native constraints
and collision queries without requiring a graphics context. Tests run serially in
one Node process to avoid starting a separate WASM runtime for every test file.

The suite distinguishes three kinds of evidence:

- Analytical checks cover trajectory inversion, rotational invariance, torque
  budgets, force reactions, and prescribed jump impulse shares.
- Discrete contracts cover cold and warm mouse filtering, pitch slew, recovery,
  slope hysteresis, contact queues, grab cooldowns, and velocity limiting.
- Physical response bands cover primitive dimensions, standing height, analog
  walking speed, turn rise time and settling, gait excursion, jumping, carrying,
  ledge clearance, and resource counts after reset.

The response bands were fixed against the local Havok prototype before replacing
its controller implementation. The targeted audit checked 14 scenarios on the
same frozen physical configuration for 1000 steps each, with 1500 steps for the
ledge case. Positions, quaternions, linear/angular velocities, states and grip
counts matched exactly. Another 10,000 action-trace cases matched command
arguments, recipients and effect order; 2,520 environment/state combinations
matched state, timers, slope history, climbing flags and friction. These checks isolate controller
calculations; they do not establish identical trajectories with a changed rig.
The local reference copies and comparison inputs are excluded from public source.

A local seeded comparison also checked 10,000 acceleration-solver inputs against
the reference calculation and found zero vector difference. Public mathematical
tests use analytical results and invariants and do not require the reference port.

The included rig passes the same behavioral tests, including the 60/70/80 degree
manual climb and three lateral starting positions for the complete ledge replay.
Its kinematic chain construction replaces the rounded extracted pose table,
while preserving the physical compatibility requirements. New design tests
check endpoint construction, mirrored frames and independent design controls.
Full trajectory identity after that physical change is not claimed.

`pnpm measure` records model envelopes, mass, turn response, analog speed and
jump height in `validation/behavior.json`. `pnpm benchmark` records longer
scenario traces. These are observations of this project, not measurements of
Human: Fall Flat. No matched original-game recording establishes PhysX/Havok
equivalence.

Native allocation and contact history can change a replay after bodies are
destroyed and recreated. Fresh-world replay is checked separately from reset
behavior. Reset tests require stable resource counts and functional recovery,
rather than bit-identical trajectories. Frame rates, browser pointer-lock events,
graphics appearance and other operating systems need separate validation.

The trace comparison utility matches nearby timestamps. It does not align
coordinate systems, poses, inputs or time origins; check those before interpreting
its position errors. Tests and geometric similarity provide no evidence about
copyright ownership or permission to relicense.
