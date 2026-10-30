# Universe audio

Open Skies supplies the background music. Interface and camera effects are imported from the supplied ARK Starmap sound collection; they are third-party recordings, not HackUniverse-authored or newly generated effects. [Asset credits](ASSET-CREDITS.md) records their source. [generation.json](../assets/audio/generation.json) and [manifest.json](../assets/audio/manifest.json) distinguish music generation, imported recordings, processing and file checksums.

## Music and effect assets

Open Skies retains its original ElevenLabs-generated recording, processed FLAC and runtime MP3 unchanged. Its prompt requests a sparse, hopeful synthetic space ambience without vocals, beats or a prominent melody. The 96-second source uses a six-second equal-power wrap crossfade to produce a 90-second loop. The runtime is stereo 44.1 kHz/96 kbps, 1,080,961 bytes, measured at -22.44 LUFS and -10.55 dBTP. Numerical boundary checks do not establish that the seam is perceptually inaudible.

The imported sound catalog contains 45 WAV recordings recursively, excluding AmbientMusic and Unity metadata. Canonical WAVs under [imported/starmap](../assets/audio/imported/starmap) retain identical decoded PCM with metadata removed. The corresponding MP3 catalog under `web/public/audio/catalog/starmap` is available lazily; the audio module does not fetch that entire catalog. Digitally silent Unused recordings remain documented catalog entries rather than being assigned to invented product actions.

Only these nine aliases are preloaded for real interactions:

| Runtime alias under `/audio/sfx/` | Interaction |
| --- | --- |
| `menu-open.mp3` | Open the universe menu |
| `menu-close.mp3` | Close the universe menu |
| `ui-select.mp3` | Activate an ordinary enabled interface control |
| `camera-orbit.mp3` | Rotate the camera with a real single-pointer drag |
| `zoom-in.mp3`, `zoom-out.mp3` | Approach or move away manually |
| `toggle-on.mp3`, `toggle-off.mp3` | Commit an enabled switch or toggle change |
| `destination-hover.mp3` | Physically move the pointer onto a new destination |

Camera rotation uses the complete approximately 2.333-second CAMRotate recording, and both zoom aliases use the complete approximately 5.333-second CAMZoom recording. These quiet continuous source recordings are normalized with constant gain, not treated as silent padding. The processed MP3 durations include frame padding; the manifest records the measured values and levels. The active aliases total 159,971 bytes. Other SystemAmbient and Unused recordings have no runtime action or eager loading assignment.

Earlier generated and user-supplied effect candidates remain archived under `assets/audio/drafts`, including the complete pre-Starmap set. They are no longer active browser effects. None of these replacements changes Open Skies or imports the excluded AmbientMusic recording.

## Playback and preferences

The global [audio module](../web/src/modules/audio/index.ts) exports `AudioProvider`, `AudioControls`, `useAudio` and public types. The application mounts the provider once. Universe adapters supply optional semantic callbacks; the renderer owns no audio provider or asset URL.

Settings contains independent Music and Sound effects switches and volumes. With no valid saved preference, both switches default to On, at 35% music and 50% effects volume. Existing version-1 preferences preserve their exact On/Off choices and volumes, including Off after refresh. The provider reads `hackuniverse.audio.v1` before allocating resources, using the shared lazy storage transport. An unreadable preference leaves both channels Off with an honest warning instead of guessing a possibly saved opt-out. These preferences are separate from Local universe exports.

Enabled channels attempt playback only while the document is visible. Browser autoplay policy remains authoritative. A waiting or blocked channel retries on the first trusted activation-producing interaction: mouse press, touch/pen release or an ordinary non-repeating key press. Both gesture-sensitive calls start synchronously. Where available, the browser's user-activation state is checked as well. Audio controls, disabled/inert targets, modifier-only keys and synthetic events do not unlock playback; clicking Off cannot first start a blocked channel. Pending gesture attempts and a 750 ms gate prevent retry storms. No extra Resume button is required per visit. Actual load/unavailable errors use one Retry action. See the browser [activation contract](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation) and [autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

Music is streamed through a looping media element and Web Audio gain; the full track is not decoded into a memory buffer. Each active effect is fetched and decoded with a 512 KiB, eight-second and two-channel cap. Music play, effect loading and context activation each have a 15-second deadline. A suspended activation timeout is waiting for interaction; an already running context with stalled media remains a load error.

## Interaction feedback

Ordinary UI effects retain a 100 ms global cooldown, 180 ms per-cue cooldown and a three-voice budget. Toggle feedback reads committed checked/pressed semantics, including controls that close their dialog. Selected destination labels retain selection semantics rather than being mistaken for toggles. Sound settings remain silent controls, so muting does not itself emit an effect.

Manual zoom emits at gesture start, after an idle gap, on a direction change and about every 500 ms while wheel, pinch or zoom-button input continues. A 100 ms floor absorbs jitter. Manual destination navigation also reports its approach/retreat direction; tour navigation remains silent. Zoom bypasses ordinary UI cooldowns so a recent click cannot hide navigation sound.

Manual orbit requires actual azimuth/polar travel from a trusted single-pointer drag. Pointer-down without movement, a stationary held pointer, two-finger pinch, zoom-only input, auto-orbit, tours, camera tweens and flight emit no orbit cue. Small flicks are checked after input dispatch as well as on frames. Its bounded repeat cadence follows ongoing real drag movement; reduced motion does not disable deliberate user input or its audio.

Zoom and orbit each own one replaceable layer. Accepted replacements fade the old voice for eight milliseconds and start after that handoff, without simultaneous layers or a playback queue. They coexist within the three-voice budget; at capacity, movement replaces the oldest ordinary UI voice rather than the other movement layer. Hover feedback only follows real mouse/pen motion onto a new label or core. A planet moving beneath a stationary pointer can update its visual highlight without emitting audio. Dragging, tours and touch input suppress hover intent.

Hiding the page pauses music, aborts pending effects, suspends contexts and clears active, fading and scheduled voices. Returning may resume enabled channels that were playing or loading, subject to browser permission. A document mounted hidden waits until visible. Off, zero volume, hidden state and disposal never queue old gestures for later playback. Failures leave the visual explorer usable.

## Validation boundaries

The manifest owns exact durations, source identity, processing levels and hashes. Automated checks cover opt-out restoration, activation gating, simultaneous channel startup, cancellation, stale callbacks, bounded voices, movement feedback and disposal. Listen to the loop and interaction transitions in desktop/mobile browsers; browser emulation and numeric checks do not establish physical-device playback quality or performance. Publication state is tracked separately from technical provenance.
