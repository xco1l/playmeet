# Play Meet

A browser ragdoll physics playground using Babylon.js and Havok. The distributed
character uses procedural spheres and capsules and needs no game installation,
extracted assets, Python, or decompiler.

## Run

Install Node.js 24 and pnpm 11.25.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the local URL printed by Vite. On Windows, `./start.ps1` also starts Vite
after dependencies have been installed. To serve a production build, run
`pnpm build` followed by `pnpm preview`.

Use WASD to move, Space to jump, Q/E or the hand buttons to reach and grab,
and the arrow keys or pitch/yaw sliders to look around. Clicking the scene enables
mouse look; Escape releases it. R resets the scene and Y holds the character limp.
The ledge scene includes a repeatable climbing demonstration.

The default scene includes nine stations with obstacle checkpoints and a field
guide. Sensor checks require observed movement, contacts or state transitions;
visual checks need manual confirmation. Results last for the current page session
and survive checkpoint restores. Travel and R rebuild every prop and resume play.
The selected station stays active when walking into neighbouring areas, so a
nearby station cannot interrupt an unfinished measurement.
Use [ / ] to change stations and the movement-strength slider to compare partial
input. The test tools include a controlled impact, a one-second grip suspension
(G while holding Q/E), and a grip load pulse (L). The impact probe explicitly sends
the gameplay hit signal; ordinary collisions do not generate that signal.
The grip checkboxes keep either hand reaching while look controls are adjusted.
Escape and checkpoint restoration clear them. H hides the panels so camera and
body motion can be inspected even in a narrow browser window.

## Validation

```sh
pnpm character:check
pnpm test
pnpm build
pnpm measure
pnpm benchmark
```

The tests run the real Havok WASM solver and exercise dimensions, mass, turning,
input filtering, gait, jumping, grips, carrying, slopes, recovery, camera clearance
and complete climbs. Mathematical and timing contracts are checked separately
from physical response bands. Reports from the last two commands go under the
ignored `validation/` directory. See [evidence and limits](docs/VALIDATION.md).

`pnpm character` regenerates the included configuration from
`scripts/create-character.mjs`. Coordinate frames and compatibility constraints
are explained in [the character specification](docs/CHARACTER_SPEC.md).

## Distribution

The current project source has an [MIT license](LICENSE); dependencies retain
their [own notices](THIRD_PARTY_NOTICES.md). A [targeted provenance audit](docs/PROVENANCE.md)
records the replaced port expression and asset-pose table, the new kinematic
construction, and intentionally retained mathematical and physical compatibility
requirements. Development involved access to Human: Fall Flat material; the audit
is a technical comparison, not legal clearance. Read [licensing scope](docs/LICENSING.md)
before publishing.

`pnpm export:source` creates a source snapshot under `validation/releases/`,
including the procedural configuration and licenses, without repository history.
The published history starts with the reviewed current source. Earlier prototype
history and local research are excluded; the MIT grant does not retroactively
cover them. The exporter checks file selection; it cannot resolve copyright
questions.

Keep screenshots, recordings, debug reports and local research under the ignored
`validation/` directory.
