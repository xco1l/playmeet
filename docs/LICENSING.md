# Licensing scope and provenance

The root MIT LICENSE grants rights in the current project-authored source,
documentation and generated configuration to the extent the licensor owns those
rights. Dependency licenses remain separate. The grant does not cover Human:
Fall Flat code, assets, trademarks, extracted data or historical translated code.

A [targeted technical audit](PROVENANCE.md) compared the controller and character
configuration with the available game material. It replaced the concentrated
ported control expression, game-shaped object option schema and rounded asset
pose table. The reviewed public source contains no identified game prose,
serialized asset IDs, Unity transform chains, binaries or directly imported
meshes. The character is generated from project kinematic design variables.

The controller's formulas and scheduling, and several physical compatibility
parameters, remain informed by the game and translated prototype. They are
explicitly inventoried in the audit. Development involved access to that source;
it was not a clean-room process. Re-expressed code, procedural generation and
passing tests are evidence about implementation, not a legal determination of
ownership or the status of nonliteral similarities.

[WIPO Copyright Treaty Articles 2 and 4](https://www.wipo.int/wipolex/en/text/295166)
distinguish mathematical concepts and methods from protected program expression.
The [CJEU SAS Institute judgment summary](https://curia.europa.eu/jcms/upload/docs/application/pdf/2012-05/cp120053en.pdf)
also distinguishes functionality from expression under the facts and law of that
case. Neither source is clearance for this project. The MIT text itself requires
neither a clean-room process nor a legal certificate.

No permission from the game's rights holders has been obtained. This technical
audit has not determined the legal status of the retained selection or
arrangement of functional rules, prior source exposure or reverse-engineering
restrictions under a particular jurisdiction. If protected material is identified,
the remedies are a replacement of that material or permission covering the
intended redistribution and licensing. A credit alone supplies no such rights.

## Distribution boundary

The published history starts with the reviewed current source. Commit `ad14d86`
in the local pre-publication history contains the translated prototype and is
excluded from the published history. The current MIT notice does not
retroactively relicense that commit. Do not import the earlier branches, tags or
research archives into the public repository without resolving their rights.

`pnpm export:source` selects current project files, procedural configuration and
licenses without Git history or local research. Excluding history avoids
distributing its contents as part of the snapshot; it does not erase development
provenance or establish a legal conclusion.

Dependency notices are included under `public/licenses/` and copied into browser
builds. Their terms remain in force, including Babylon's Apache-2.0 notices.
See [third-party notices](../THIRD_PARTY_NOTICES.md).
