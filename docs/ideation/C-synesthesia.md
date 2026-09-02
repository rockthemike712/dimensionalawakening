# Lens C — SYNESTHESIA

Five ideas where sound, color and geometry are one system. None of them touch the two-gap room.

**Four audio facts that constrain all five (current code, real devices):**

1. `audio()` in index.html never calls `AC.resume()`. On iOS the context starts `suspended` and every one of these ideas is silent until it does. One line, do it first.
2. iOS silences all Web Audio when the ringer switch is off, unless the page has played through an `<audio>` element once, or sets `navigator.audioSession.type='playback'` (Safari 16.4+). A game meant to be held to the ear must do this.
3. Stereo pan on a phone speaker is worth almost nothing. **Never make pan load-bearing** — use it as a bonus for headphone players. Load-bearing information goes in *pitch*, *delay*, *beat rate*, or *presence/absence*, all of which survive a bad mono speaker intact.
4. Anything continuous must use `param.setTargetAtTime(v, ac.currentTime, 0.03)`. Writing `.value=` every frame in `animate()` zippers audibly. The existing `foldGain.gain.value=` line already does this and will get worse the moment there is more to hear.

---

## C1 — Knock

**Verb:** knock (press and release on the ground)

**First 10 seconds:** Black. One glowing point — you. You press a finger anywhere on the sheet: a low 60 Hz thud, and a ring of light leaves you across the grid (the existing `emitRipple` ring, now audible). About a second later, one small blip in the dark, and for 200 ms a faint shape flickers where the blip came from. Nothing else is visible. You knock again.

**The rule they discover:** Hit the ground and things answer. The longer they take to answer, the farther away they are.

**The impossible moment:** Grab the seam with your left thumb and knock with your right while you drag. The returns come back *sooner as you pull* — 1.4 s, then 0.9, then 0.3. You can hear the far side of the world arriving. (One knock-and-drag says the entire thesis of the game with no words.) Then: one object always answers on the **press**, before the thud on the release. It replies before you knock.

**The misunderstanding (later):** Its delay isn't small, it's negative — it is at a negative distance, off the sheet in the direction you cannot point at yet. After the birth of depth, knock at that same spot: the early answerer is gone, and standing where it was, you knock and hear one return with no source. It was your own knock, coming back from a place you had not been yet.

**Hidden math:** Time of flight `t = |d| / c`; the anomaly is the advanced solution of the wave equation instead of the retarded one — a reflection across the plane's normal.

**Composes with:** Fold. Delays are computed from `foldedPoint()`, so folding literally shortens the return times — the fold becomes *audible* before the player understands what folding is. Also with the dimension shift: the same knock in 3D gets a ground return *and* a ceiling return, so depth is something you hear a beat before you see it.

**Phone controls:** `pointerdown` on the canvas (existing handler, in the branch where the seam wasn't hit) = charge; `pointerup` = knock. d-pad = move. Nothing new on screen.

**Build cost:** S. Hardest parts: (a) timing — do not use `setTimeout` for the returns; at knock time create each return oscillator and call `o.start(ac.currentTime + d/c)` so the audio clock owns it, then drive the matching visual flash by comparing `AC.currentTime` in `animate()`, not `clock.elapsedTime` (the two clocks drift by tens of ms and the mismatch is exactly what kills the illusion). (b) c ≈ 6 world-units/sec gives 0.3–3.5 s returns across the 24-unit sheet — long enough to feel like distance, short enough not to be a wait; returns need a 60 ms attack and a lowpass at `1800 - 200*d` Hz so distant things are also *dull*, which is the second distance cue and the one that works on a bad speaker.

**Risk:** In a noisy room with the phone in a pocket-speaker, the returns are inaudible and it degenerates into "tap to reveal the map," which is boring. Mitigation: keep the return flash tiny and 200 ms; an object only becomes solid when you *walk to where you heard it*, so hearing is the only way to find it and looking never is.

---

## C2 — Shut

**Verb:** listen (hold the existing eye button)

**First 10 seconds:** A room with a solid wall in front of you, no door, nothing to collect. You hold the eye button — the screen goes black as it already does. But in the black there is a wide breathy hiss, and off to your left, a **hole in the hiss**. You walk toward the quiet part with your eyes shut. You pass through the wall. You let go. You are on the other side, and behind you the wall has no door in it.

**The rule they discover:** What you hear is a different room from what you see. You can only walk through the room you are in.

**The impossible moment:** The first wall-pass. Then the compounding one: with your eyes shut, walk a full loop around a pillar and open them — you are on the far side of the room, because the heard room's loop is not the seen room's loop.

**The misunderstanding (later):** You assume you are switching between two rooms. Then you find a spot where the two rooms disagree about *you*: eyes shut, your own footsteps come from ten units away, and the veil shows your ring drifting away from the center of the screen. You are not swapping rooms — you are swapping which of the two shadows is you. There is a third one, and you have already heard it.

**Hidden math:** Two parallel slices, w=0 and w=1, of one 4D cell complex. A wall in one slice is a door in the other because they are orthogonal cross-sections of the same face; the eye button is a translation along w.

**Composes with:** Observe (it *is* the observe button, given a second job — the eye stops being a slit-room utility and becomes the game's second movement verb) and Fold. Fold with your eyes shut and you fold the **heard** room only — so you can drag a heard door next to a seen door and step through both at once. That composition is the level.

**Phone controls:** Eye button hold = swap geometry (veil already exists at .87 opacity). d-pad = move, unchanged. Drag = fold, unchanged. Zero new UI.

**Build cost:** M–L. Hardest parts: (a) collision has to swap sets on the eye state, and the ugly case is releasing the button while standing inside a seen-wall. Do not teleport them — make the **eye stick shut**: the button refuses to release, the veil pulses red-shifted, and they have to walk until it lets go. That is a better mechanic than the bug it fixes. (b) The hiss must not be one node per wall — 12+ panners with gain nodes crackles on iOS. Mix in JS instead: one white-noise `AudioBufferSourceNode` (2 s buffer, looping) into three fixed gains (left / ahead / right); each frame, sum every heard-wall's contribution `1/(1+d²)` into those three buckets by its angle in camera space and `setTargetAtTime` them. Three nodes total, and the doorway is a real hole in the sum. Humans are *extremely* good at hearing a gap in broadband noise — this is the actual mechanism blind echolocators use, and it needs no training.

**Risk:** A player in a loud room is simply blind and lost, and quits. Mitigation: the veil is not pure black — render the same three gain values as a faint brightness gradient around the screen edge, so the mechanic degrades gracefully to "walk toward the dark part of the frame" without becoming a second, easier way to play with the sound on.

---

## C3 — Where the Wobble Stops

**Verb:** move

**First 10 seconds:** Two of the existing tall pillars are humming, one low, one slightly lower. Between them the hum is not steady — it pulses, *wa-wa-wa*, about six times a second. You take a step and the pulsing speeds up. You step the other way and it slows: wa — wa — wa —. You keep going. It stops. The two hums become one clean note, and a beam of light snaps into existence between the two pillars, solid enough to stand on.

**The rule they discover:** Walk until the wobble stops and a bridge appears.

**The impossible moment:** Add a third humming pillar. There is exactly one place where all three wobbles stop at once, and when you stand on it the three pillars *visibly merge into one object* — same screen position, same silhouette, one note. Step once in any direction and they split back into three. From that point, they are the same thing.

**The misunderstanding (later):** "Equidistant" is the wrong rule. The wobble also stops when one hum is exactly double the other, because an octave fuses too. So there is a second silent path that no symmetry explains, curving away outside the triangle, and a third at 3:2 beyond that, and each one carries a bridge to somewhere the bisector never reaches. The real rule was never "the same distance." It was "a simple ratio."

**Hidden math:** `f = 200 + 5·d`, so the beat frequency `|f_A − f_B| = 5·|d_A − d_B|`. Zero beat = the perpendicular bisector (a line). Ratio-locking instead of difference-locking gives Apollonius circles. Three pillars → the circumcenter. A field of them → a Voronoi diagram you walk with your feet.

**Composes with:** Fold (folding changes `d`, so the silent line **slides under your feet** — you can drag the bridge to you instead of walking to it, and pulling the seam past a point makes two pillars coincide) and Observe (holding the eye button kills the visuals and makes the wobble twice as easy to hear, which teaches the eye button as an *instrument* rather than a puzzle key).

**Phone controls:** d-pad = move, and that is all. Eye = optional listening aid. Drag = fold. This idea is 100% playable with the screen face-down.

**Build cost:** S–M. Hardest parts: (a) The beat must be real — two sine oscillators summed at the destination, never one oscillator with an LFO on its gain. Real summation is what makes octave-fusion and the 3:2 work for free later, and it is what makes it feel physical. `osc.frequency.setTargetAtTime(f, ac.currentTime, 0.03)` per frame. (b) Tuning the gate so the game's idea of "stopped" matches the ear's: below about 1.5 Hz a beat reads as *stopped*, so gate at `|f_A − f_B| < 1.5`, which with 5 Hz/unit is a 0.3-unit-wide band — comfortable to stand in and about a third of the player's radius. Three simultaneous pairs = 3 gates, all `< 1.5`.

**Risk:** It is interference-adjacent and a critic will say "the slit room again." The honest defenses: it is beating in *time*, not fringes in *space*; the output is a solid bridge, not a picture; and beats are the one acoustic phenomenon that survives a tinny mono phone speaker perfectly intact, because they are amplitude modulation. Second risk: if the pillars are far apart the gradient is too gentle to steer by — keep humming pairs within about 12 units.

---

## C4 — Tune

**Verb:** turn (vertical drag on the world)

**First 10 seconds:** A field of pillars in many colors. Only the cyan ones are solid — you walk straight through the magenta one like fog, and it makes no sound as you pass. There is a quiet drone. You drag your thumb up the screen: every color in the world rotates at once and the drone slides up in pitch. As the magenta pillar comes around to cyan it **thuds** into solidity, and the cyan one behind you bleaches to grey and goes silent.

**The rule they discover:** Only the things that match your color are really here.

**The impossible moment:** Two objects sit in exactly the same spot in different colors. Stand there and tune: a room closes around you where a moment ago there was open floor. Or walk a straight line across a gap, tuning as you go — you cross on a bridge that only exists in the middle of the turn. You had to change color mid-stride.

**The misunderstanding (later):** Color wraps. Keep tuning away from cyan and after one full turn you come back to cyan — but not to the same world. The pillars have rotated about the origin. The hidden axis is a circle, and going all the way around it twists the plane. Color was never a separate place to visit; it was a twist in the place you were already standing.

**Hidden math:** Hue is the fiber coordinate of an S¹ bundle over the plane, with non-trivial holonomy — one loop in the fiber applies a rotation to the base. Pitch and hue are the *same number*: both are circular, and octave equivalence is the hue wheel. Solidity = `cos(Δhue) > 0.7`.

**Composes with:** Observe. Hold the eye button and the color is gone but the pitch remains — which is the only way to reach the object whose hue renders as black. You cannot see that one at any setting. You can only tune to it by matching a note.

**Phone controls:** Vertical drag on the world = tune (`hue += dy/300`), deliberately orthogonal to the horizontal drag that already folds — an orthogonal gesture for an orthogonal axis, and the two compose in one thumb-swipe diagonally. d-pad = move. Eye = drop color, keep pitch.

**Build cost:** M. Hardest parts: (a) Do not loop over objects in JS to set opacity. Put a per-instance `aHue` attribute on one shared `ShaderMaterial` with a `uHue` uniform — one uniform write per frame for the whole field — and keep collision as a cheap JS `cos(h_obj − h_player) > 0.7` test. The existing 22 `landmarks` cylinders are already a scattered field with `{m,x,z,h}` records; give each a hue and this is mostly done. (b) The audio bed: 6–8 oscillators (one per hue class), started once at load and never stopped, with per-frame `gain.setTargetAtTime(cos²(Δhue) * 0.06, ac.currentTime, 0.05)`. Starting and stopping oscillators as things fade in and out will click on every step.

**Risk:** Colorblind players, and a phone screen in daylight, kill hue as the sole channel — so pitch has to be genuinely redundant with it, and the solid/ghost distinction has to be readable in pure luminance. Bigger risk: if the off-hue world is empty, tuning is just a filter switch and it is boring. Every hue setting must have something in it worth walking to.

---

## C5 — Eight Steps

**Verb:** step (tap the d-pad in time)

**First 10 seconds:** A dark corridor. The floor ahead is a wireframe grid you can see through. A soft pulse, twice a second. You tap the d-pad: the tile under you flashes, a note plays, and the tile stays solid and lit. You tap again slightly late: the note comes out flat and sour, the tile stays a ghost, and you sink a few centimetres into it. You start tapping with the pulse. A path of solid lit tiles grows behind you.

**The rule they discover:** Step on the beat and the floor is there.

**The impossible moment:** After eight good steps, you slow down — and the world slows with you. The pulse, the drone pitch, the breathing of the fog, all follow your feet. You are the metronome. Then stop moving completely: the pulse keeps going, and eight ghost footfalls walk your last eight steps again, lighting the same tiles in the same order. Your rhythm has become an object in the room.

**The misunderstanding (later):** The loop is not a recording, it is transport — step into your own ghost footprint while it is playing and you are carried to where the ghost is. And the pulse you obediently matched at the start was never the world's: the corridor opened mid-loop, playing back eight steps you had already taken. The world was never keeping time. You were, before you noticed.

**Hidden math:** Step times are a point process quantized to a grid (sampling; off-beat is aliasing). The loop is a Z/8 action on the corridor, and walking into your own past orbit is a deck transformation — which means the corridor is really a circle.

**Composes with:** Fold. The corridor's fold seam brings the loop's end next to its start, so one step at the seam moves you a whole loop forward — folding space folds *time*. And the existing fold drone (`foldOsc`, 52 → 92 Hz) becomes the tempo multiplier: pull the seam halfway and the loop halves from eight beats to four, and four of your solid tiles go back to ghosts. Also: the hold-to-move behaviour of the d-pad is *always* off-beat, so holding is quietly punished and rhythmic tapping is rewarded — which finally gives the tap-vs-hold control from the handoff's input postmortem a reason to exist.

**Phone controls:** d-pad tap = one step, graded on timing (the existing `bindPad` press handler already fires a blip and a ripple — the grading hooks straight onto it). d-pad hold = continuous walk, never on-beat. Eye button = tiles go invisible but the note-per-tile stays, so the whole corridor is walkable by ear.

**Build cost:** M. Hardest parts: (a) The clock. Never `setInterval`. Use the standard lookahead scheduler — a 25 ms `setTimeout` loop that schedules every note due in the next 100 ms at `ac.currentTime + n*spb` — and grade a step by comparing `e.timeStamp` mapped into audio time against the nearest beat, with a ±90 ms window. Grading against `clock.elapsedTime` will feel randomly unfair. (b) Bluetooth headphones add 150–300 ms of output latency and will destroy any fixed window. Do not ask the player to calibrate: **fit the tempo and phase to their first eight steps** instead of fitting them to yours. The calibration and the reveal are the same piece of code.

**Risk:** This is the one most likely to be simply *unfair* — a laggy browser frame, a mis-registered tap, and the player believes they hit it and the game says no. If the ±90 ms window cannot be made to feel honest on a real iPhone in Safari, widen it to ±140 ms and let the phase error only *detune the note* (up to ±70 cents) rather than fail the tile. There is no failure state worth having here; the tile should always eventually solidify, just sour and dim if you are sloppy.
