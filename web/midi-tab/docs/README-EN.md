# MIDI Tab Studio 3.1

Open `index.html` with the `assets` folder next to it. No server, installation, CDN or internet connection is required. Scripts use classic local loading so the app works through `file://`.

Import a Standard MIDI File (type 0 or 1 with PPQ timing), select a track/channel and choose an instrument tuning. The app estimates string/fret positions while preserving notes, onsets and durations. Optional quantization and transposition change the selected part only when requested. Unplayable notes remain in the data, are marked “!” and appear in an appendix; they are still audible during comparison.

Choose Portuguese or English and a light or dark theme. Track and song names are file metadata and are not translated. Playback has tempo-map or fixed-BPM modes, practice speed from 0.25× to 2×, pause/resume, seeking, a metronome, optional note highlights, illustrated vibrating strings and score following. The string panel is an illustration, not an audio oscilloscope. Reduced-motion preferences are respected.

There are 21 instrument/tuning presets, including guitar, bass, ukulele, guitalele, mandolin, mandola, Irish bouzouki, cavaquinho, four-string tenor/plectrum banjo and balalaika. Course-based instruments use one TAB line per course. Octave pairs and short fifth banjo strings are not modeled automatically.

The sound selector offers the tablature instrument, the per-note GM program, your own WAV, or a simple reference tone. The compact bank contains 12 recorded FreePats samples: four nylon guitar, four electric guitar and four ukulele samples. Other instruments use approximate additive synthesis. This does not reproduce a complete SoundFont, proprietary instrument bank, MIDI expression or the original playback device. SF2/SFZ files are not loaded. A custom single-note WAV is repitched from the root note you specify. WAV filenames such as `Note_C4.wav` can supply a suggested root; always check it. There is no automatic audio pitch detection or loop creation. Internal recordings are at most four seconds; a long MIDI note may outlast its sample.

Click a fret to change its string without changing pitch. Undo restores up to 100 manual changes. Language, theme, title, spacing and tempo changes preserve manual positions. Changing track, tuning, fret range, transposition, quantization or start offset recalculates them.

Save a `.miditab` project before closing. It stores MIDI notes, tempo/time-signature maps, per-note programs, settings and fingering. Imported WAV audio is not embedded and must be reloaded. Incoming projects are validated. Language/theme/animation preferences are remembered when browser storage is available; the composition is not autosaved.

PDF exports all pages as A4 raster pages; text is not selectable. PNG exports one selected page at 1240 × 1754 pixels. Choose the image page under Rhythm and layout. Screen previews use adaptive resolution; export redraws full-size pages and excludes playback overlays.

Limits: 32 MB per MIDI, 20,000 selected notes, 4,000 measures, 100 pages and 150,000 sustained-note measure entries. WAV: 16 MB and 15 seconds. Projects: 16 MB. Synthesized-sample cache: 64 entries. Playback: 128 concurrent voices. Fingering is heuristic, not guaranteed optimal. Pitch-bend curves and techniques such as slides/hammer-ons are not transcribed. MIDI type 2 and SMPTE timing are unsupported.

Source folders separate core MIDI/fingering logic, data, translations, audio, UI, export and samples. Core tests: `node --test tests/core.test.cjs`. Browser integration tests require Playwright/Chromium: `node tests/browser.test.cjs`; `CHROMIUM_PATH` can point to a compatible browser executable. These tools are only for development, not normal use. `python tools/build.py` creates the optional single-HTML edition in the parent directory.

See the Portuguese revision/research notes and sample credits in this folder for implementation details and source links.

## Full-song accompaniment — version 3.1

Enable “Play the full song with accompaniment”. The selected part switches to the tablature instrument while other parts keep their per-note MIDI programs. You may then choose a WAV or another sound mode for the selected part. The original selected track/channel is removed from backing to avoid doubling; matching pitches in other tracks remain intact.

Separate master, selected-part and accompaniment volumes are saved in the project. Set the selected part to zero to practice your own instrument against the backing; note highlights remain active. One tempo map and audio clock schedule all parts, preserving the original intro and ending even if the tablature trims its initial silence. Transposition and quantization affect only the selected part. MIDI channel 10 backing uses approximate synthesized drums. “All melodic tracks” applies the selected sound to all melodic parts, leaving percussion as backing.

The existing compact bank and synthesis approximations still apply; this is not an exact reproduction of an original SoundFont or proprietary bank. Full-song mode is limited to 100,000 note events, 4,000 measures and 100,000 metronome pulses. Playback has a 128-voice limit and prioritizes the selected part. Projects retain schema version 3; legacy 3.0 projects default to accompaniment off.
