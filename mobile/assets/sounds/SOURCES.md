# Bundled sound assets

Provenance + license notes for any audio file shipped inside `mobile/assets/sounds/`.

## chef-bell.mp3

**Purpose**: One-shot completion chime fired by the Vibe Cooking timer when a step countdown hits zero. Plays alongside the existing success haptic so the cook hears it even when the phone is face-down on the counter.

**Character target**: Soft warm bell, ~1 second total, single ding (no two-tone decay), pleasant but unmistakeable. Hotel-counter / dinner-bell feel. **Not** a digital kitchen-timer beep.

**Status**: Placeholder file shipped with the initial Cook Mode commit. Replace with a real bell asset before the next release — the `useTimerChime` hook is failure-tolerant (try/catch absorbs the load error) so the placeholder is safe to ship without crashing the cooking flow, but no audible chime will play until the real file is dropped in.

**Suggested CC0 sources**:
- https://freesound.org/ (search "bell ding" CC0 license)
- https://pixabay.com/sound-effects/search/bell/

Whichever file is chosen, log the URL + license here when swapping in.
