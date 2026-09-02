# Beads: critic's first review (REVISE), and the decision

Decision, per `docs/ACT1.md`: **switched off** for Act I (not imported in
`src/regions/index.js`; its test moved to `tests/optional/`). The code stays.
It is not a rung of the act and it failed the critic on the one thing it had
to do: be a toy on contact.

Findings, in order (fix these before it comes back):

1. The beads do not render: `vertexColors:true` on a geometry with no color
   attribute makes every instance black under additive blending. Drop the
   flag; `setColorAt` alone tints instances.
2. Dents cannot fill: the settle friction radius (eMax > .5, r ≈ 1.65) is
   larger than the counting disc (FILL_R 1.25), so beads freeze on the rim in
   a donut and the counter saturates around 24 of 36.
3. A lit dent absorbs the herd; the three-dent cascade never fires in play.
4. A drag released over the d-pad never ends (no pointer capture, `pointerup`
   bound to the canvas only): the tray stays tilted for the rest of the page.
5. Ripple spam at rest: the densest-cell ripple fires every .25 s with no
   motion gate, evicting the player's own ripples from the six-slot buffer.
6. Poured beads land inside the room's bounds and freeze there after the
   crossing.
7. The test was flaky (reed tap under the d-pad) and wrote screenshots into
   another agent's worktree.
8. iOS orientation: the `{once:true}` hook makes a dismissed prompt
   unrecoverable; calibration is on first event, not on grant; combined tilt
   is not re-clamped.
9. Per-frame allocations: `dents.map`, `dents.filter`, `foldedPoint().clone()`
   per far bead, `instanceColor` re-upload every frame, 80-triangle beads.
10. Cascade misses two brief items (first light pulses harder, the edge
    glows); the dent light is hand-rolled rather than `makeLight()`.
11. Seam/reed arbitration relies on listener order and pointer-capture
    timing; needs an explicit `isDraggingSeam()` from the core.
