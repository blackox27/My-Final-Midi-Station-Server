/* Non-destructive editor operations. All random changes are bounded by song edges. */
(function (root) {
  const MIN = 1 / 3840;
  function humanize(
    notes,
    end,
    { timing = 0.02, velocity = 6, random = Math.random } = {},
  ) {
    if (!Number.isFinite(timing) || !Number.isFinite(velocity))
      throw Error("Variação inválida.");
    timing = Core.clamp(timing, 0, 0.5);
    velocity = Core.clamp(Math.round(velocity), 0, 40);
    for (const n of notes) {
      // Preserve duration, including notes against the start/end of the song.
      n.start = Core.clamp(
        n.start + (random() * 2 - 1) * timing,
        0,
        Math.max(0, end - n.duration),
      );
      n.velocity = Core.clamp(
        n.velocity + Math.round((random() * 2 - 1) * velocity),
        1,
        127,
      );
    }
    return notes.length;
  }
  function deduplicate(notes, selected = null) {
    const groups = new Map(),
      removed = new Set();
    // Two notes with different velocities are intentional layers, not duplicates.
    const key = (n) =>
      JSON.stringify([n.pitch, n.start, n.duration, n.velocity]);
    // Prefer unselected originals when only a subset is being cleaned.
    for (const n of notes)
      if (selected && !selected.has(n.id)) groups.set(key(n), n.id);
    for (const n of notes) {
      if (selected && !selected.has(n.id)) continue;
      const k = key(n);
      if (groups.has(k)) removed.add(n.id);
      else groups.set(k, n.id);
    }
    return { notes: notes.filter((n) => !removed.has(n.id)), removed };
  }
  function cloneTrack(source, name, channel) {
    const t = structuredClone(source);
    t.id = Core.uid();
    t.name = name;
    t.channel = channel;
    t.notes = t.notes.map((n) => ({ ...n, id: Core.uid() }));
    t.cc = t.cc.map((c) => ({ ...c, id: Core.uid() }));
    // Assets stay shared by identity and are embedded only once in portable saves.
    t.solo = false;
    return t;
  }
  root.NoteTools = { humanize, deduplicate, cloneTrack, MIN };
  if (typeof module !== "undefined") module.exports = root.NoteTools;
})(globalThis);
