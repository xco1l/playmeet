# Third-party notices

Play Meet is an unofficial project informed by Human: Fall Flat. It is not
affiliated with the game's developers or publisher. Development provenance and
the limits of the project's MIT grant are recorded in
[licensing scope](docs/LICENSING.md).

| Dependency | Terms retained with the browser build |
| --- | --- |
| Babylon.js core | Apache-2.0; `public/licenses/babylon-LICENSE.md` and `babylon-NOTICE.md` |
| Babylon.js Havok package | MIT; `public/licenses/havok-LICENSE` |
| Vite core and bundled components | Vite core is MIT; component notices are in `public/licenses/vite-LICENSE.md` |

Upstream texts are preserved verbatim, including Babylon's component notices.
Vite copies these files and the project license into `dist/licenses/`; retain
them when distributing the build. Refresh notices when dependencies change.
Distributing all of `node_modules` requires a separate transitive dependency
inventory.

The included character is procedural primitive geometry. Game binaries, assets,
decompiled source, extracted configuration and local comparison traces are
excluded from the source snapshot.