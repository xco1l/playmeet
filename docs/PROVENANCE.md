# Technical provenance audit

This audit was performed on 2026-10-15 against the locally available decompiled
Human: Fall Flat controller classes, the extracted character configuration, and
the translated prototype in local pre-publication commit `ad14d86`, which is
excluded from the published history. It examines technical
correspondence, not whether a particular similarity is protected under applicable
law. Detailed comparisons and source hashes remain in ignored
`validation/targeted-audit/`; game source and extracted assets are not
distributed.

## Findings and replacements

| Audited material | Finding | Current expression |
| --- | --- | --- |
| State classification, gait and posture | The translated state ladder and concentrated imperative movement choreography remained recognizable. | Ordered transition predicates, gait/arm action plans and lazy posture commands separate the numerical rules from their execution. The command executor preserves recipient, argument and effect order. |
| Reach, carrying and target search | The temporary-vector itinerary and broad optional component schema closely followed the game implementation. | Pure force, reaction, transport, drag, alignment, attraction and gating policies operate on explicit input records. Native queries, casts, constraints and impulses are applied by separate adapters. |
| Object interaction options | The optional fields replicated the game's carrying component and tag concepts. | A project interaction record groups grip eligibility/anchors, transport and alignment capabilities. Scene producers and tests use this record; the old field aliases are absent. The schema change alone is not evidence of independent mathematical ideas. |
| `parametric-rig-v1` | The absolute articulation table was a rounded transcription of extracted data. All origins were within 0.6 mm of the extraction, and shape dimensions and masses matched. Calling the entire design independently authored was unsupported. | `kinematic-rig-v2` constructs torso overlap and mirrored limb chains from project design variables. Joint frames follow the chain directions and bending planes rather than imported Euler triples. Collider centres follow segment geometry. |
| Mouse filter, camera elevation and scalar trajectory roots | Correspondence was limited to small mathematical constructions and required numeric response; no additional source artifact was identified. | Retained without cosmetic rewrites. |
| Ground callbacks, ledge assistance, replay, camera obstruction and test world | The prototype records these as Babylon/Havok adaptations or project fixtures; no matching game subsystem was identified for their implementation. | Retained as project code. Native API and geometric constraints remain documented where necessary. |

The new model changes shoulder, elbow and wrist placement by roughly 27–34 mm
relative to the rounded table, moves arm collider centres by 10 mm, and uses a
15-degree neutral head pitch. These are consequences of its authored construction,
not a claim that numerical difference establishes copyright independence.
The design variables were checked against behavioral requirements, without
optimizing the generated pose back toward extracted coordinates.

## Intentionally retained functional material

The following requirements were obtained with access to the prototype and game
material. They are not presented as independently discovered:

- Controller equations, gains, phase boundaries, thresholds, update dependencies
  and prescribed jump impulse shares.
- Primitive envelopes, 17-body mass allocation, joint travel, local axis
  conventions, self-collision policy, anti-stretch restraints and suspension.
- Body/constraint insertion and force accumulation order, because changing them
  changes the iterative solver's response.

The primitive dimensions and mass requirements remain source-informed physical
parameters. Their retention is deliberate and visible; replacing an absolute
pose table does not erase that provenance. Similarity in a mathematical method,
functional parameter or observable behavior is distinguished from copied program
expression, prose or serialized asset content. The audit does not decide the
legal status of a complete selection or arrangement of such requirements.

No surviving game prose, decompiler temporaries, serialized asset identifiers,
Unity transform chains, game binary or directly imported mesh was identified in
the public source set. That statement is limited to the reviewed material and
does not certify that no nonliteral copyright claim could be made.

## Evidence

On the same frozen physical configuration, 14 native simulation scenarios
matched exactly for positions, quaternions, linear/angular velocities, states
and grip counts. Each ran for 1000 fixed steps, with 1500 steps for the ledge
case. Separately, 10,000 varied action-trace cases matched command arguments,
recipients, returned forces and effect order. Another 2,520 environment/state
combinations matched state, timers, slope history, climbing flags and friction.

The new physical configuration is assessed separately against the public
behavior bands. Full trajectory identity is not claimed after changing the
articulation layout. Tests cover geometric invariants, standing, turning,
movement, jumping, grasping, carrying, recovery and complete ledge climbs.
The tests do not require game files.

The audit found and replaced concrete source-shaped expression and the rounded
asset-pose table. It did not find a further specific nonfunctional game fragment
requiring a mechanical replacement in the reviewed public source. This is a
technical finding, not a legal judgment. See [licensing scope](LICENSING.md) for
the retained provenance and historical distribution boundary.
