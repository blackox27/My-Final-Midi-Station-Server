AURORA MIDI STUDIO 2.3.0 — USER MANUAL

OPENING THE APPLICATION
Extract the ZIP and open index.html in Chrome or Edge. The main HTML contains
all scripts, styles, synthesis engines and the demo SoundFont. No installation,
server, build command, account or network connection is needed for normal use.
Click Play to enable browser audio. Your projects and audio assets stay local.
The codigo-fonte folder contains the maintained sources and development tools.

LANGUAGE
Use PT-BR / English in the header. The selection is stored in the browser.
Controls, dialogs, tooltips, editor labels, notifications and application errors
follow the chosen language. Project, track, SoundFont, sample and preset names
remain exactly as entered or imported. Native browser errors may use its language.

EDITING
Click to create notes; drag to move; drag the right edge to resize.
B = draw, V = select, E = erase, C = split, Q = quantize.
Shift+click toggles selection. With V, drag empty space to select a group.
Right-click deletes notes or automation points. Ctrl/Cmd+A selects all.
Ctrl/Cmd+C/X/V copies/cuts/pastes; D duplicates; Z undoes; Shift+Z or Y redoes;
Ctrl/Cmd+S downloads a portable project. Delete removes the selection.
Click the ruler to place the paste/playback cursor. Ctrl+wheel zooms horizontally;
Alt+wheel changes note height; Shift+wheel scrolls through time.
Fit notes adjusts the horizontal view and pitch height/center; with a selection,
it uses only selected notes. Very wide ranges remain constrained by zoom limits.
Follow scrolls the piano roll with the playback cursor. Panic or Escape stops
playback and held notes. Escape closes an open dialog first.

Tools > Humanize notes varies starts and velocity. Amounts are in quarter-note
beats and MIDI velocity steps. Durations and song boundaries are preserved.
Humanization is random each time; use Undo to recover the original performance.
Tools > Remove duplicate notes removes exact duplicates with matching pitch,
start, duration and velocity. Different velocity layers and tiny timing changes
are preserved. Both tools use selected notes, or the whole track if none selected.
Tools > Duplicate track copies its notes, controls, automation and sound choices
with independent IDs and a free MIDI output channel; referenced audio is shared.
Every editing operation can be undone. Maximum: 16 tracks and 16 sound banks.
Double-click a track name to rename it. M/S control mute/solo.

SOUNDS, RECORDING AND AUTOMATION
Add SF2 / SF3 / DLS accepts several sound banks. Choose the bank and preset for
each track. Different tracks can play different files at the same time. Importing
a bank changes only the selected track. The synthetic demo has four instruments,
not a full General MIDI set. Load sample accepts audio supported by your browser;
root note sets the sample's original pitch. Track controls include volume, pan,
glide and echo. CC1/7/10/11/64 and pitch bend can be drawn in the automation lane.
Quantization offers strength, swing and optional note-end quantization.
The tempo/signature button opens maps; positions are quarter-note beats from 0.
A W S X D F T G Y H U J K plays C4 through C5 (X = D-sharp).
Arm recording, press Play and play the computer or connected MIDI keyboard.

FILES AND EXPORT
Open accepts SMF .mid/.midi format 0/1, RIFF MIDI .rmi, legacy Aurora JSON,
portable .aurora and PulseForge .pfm. MIDI/Aurora project files can also be dropped
onto the editor. Unsupported or malformed files report an error. A slow import
cannot overwrite changes made after opening the file.
RIFF import extracts only the SMF data, not any embedded sound banks or extra
container metadata. SMPTE time division and independent format-2 sequences are
not supported. SysEx, lyrics and non-musical MIDI metadata are not preserved.
MIDI files are limited to 40 MB and songs to 4096 quarter-note beats.
Save project embeds samples and all loaded banks in a portable .aurora file.
Keep portable copies: moving the HTML or clearing browser data may change or
remove browser autosave storage. A bank may be up to 128 MB; a sample 50 MB;
portable projects contain up to 180 MB of audio. Large files use substantial RAM.
MIDI exports all tracks as data, without embedding SoundFonts or audio samples.
WAV (stereo PCM16, 44.1 kHz) and MP3 (192 kbps) respect mute/solo and internal
instruments, SoundFonts and automation, with a four-second tail. Maximum export
is ten minutes including that tail. Cancel stops worker/encoding work where
possible; a running OfflineAudioContext may finish before cancellation returns.

COMPATIBILITY AND LIMITATIONS
Tested using automated Chromium 153 on Linux, including file:// with external
network requests blocked, real AudioWorklets, Workers and non-silent audio output.
No listening evaluation, physical MIDI hardware, native plugin host, Safari,
Firefox or mobile hardware validation was performed. SF2 was exercised; third-
party SF3/DLS files were not separately validated. Web MIDI needs browser support
and permission. VST/VST3/AU require an external host over virtual MIDI; the host's
audio is not included in WAV/MP3. Basic score notation is not professional music
engraving; printing covers the current page.
See TESTES.md, docs/PESQUISA.md and THIRD-PARTY-NOTICES.txt for validation,
research and licensing. Runtime dependencies remain the bundled versions.
