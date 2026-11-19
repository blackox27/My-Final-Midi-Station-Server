"use strict";
// Selection is a track+channel, never a pitch match: replace the selected part exactly once.
function createArrangement(
  song,
  selectedNotes,
  selection,
  scoreOffset,
  withBacking,
) {
  const all = selection === "all";
  const [selectedTrack, selectedChannel] = all
    ? [-1, -1]
    : selection.split(":").map(Number);
  const isSelected = (ti, n) =>
    all ? n.ch !== 9 : ti === selectedTrack && n.ch === selectedChannel;
  let count = selectedNotes.length;
  if (withBacking)
    for (let ti = 0; ti < song.tracks.length; ti++)
      for (const n of song.tracks[ti].notes) {
        if (!isSelected(ti, n) && ++count > 100000)
          throw Error(
            "O acompanhamento excede 100.000 notas. Selecione um MIDI menor.",
          );
      }
  const events = selectedNotes.map((n) => ({ ...n, role: "selected" }));
  let endBeat = events.reduce((v, n) => Math.max(v, n.end), 0);
  if (withBacking) {
    for (let ti = 0; ti < song.tracks.length; ti++)
      for (const n of song.tracks[ti].notes) {
        if (isSelected(ti, n)) continue;
        const event = {
          ...n,
          start: n.start / song.ppq - scoreOffset,
          end: n.end / song.ppq - scoreOffset,
          role: "backing",
        };
        events.push(event);
        endBeat = Math.max(endBeat, event.end);
      }
    endBeat = Math.max(endBeat, (song.total || 0) / song.ppq - scoreOffset);
  }
  events.sort(
    (a, b) =>
      a.start - b.start ||
      (a.role === "selected" ? -1 : 1) - (b.role === "selected" ? -1 : 1),
  );
  return { events, startBeat: withBacking ? -scoreOffset : 0, endBeat };
}
