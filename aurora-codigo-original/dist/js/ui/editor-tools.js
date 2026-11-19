/* Additional UI commands; application state stays in app.js. */
"use strict";
let followPlayhead = false;
$("language").value = I18n.language;
$("language").onchange = (e) => I18n.setLanguage(e.target.value);
function refreshLanguage() {
  $("language").value = I18n.language;
  renderTracks();
  syncTrack();
  $("tempoMap").textContent =
    `${project.signatures[0].numerator} / ${project.signatures[0].denominator}${project.tempos.length > 1 ? T(" · mapa") : ""}`;
  $("audioState").textContent = T(
    playing
      ? "Reproduzindo"
      : playPending
        ? "Preparando instrumentos…"
        : "Áudio pronto",
  );
  document.querySelector(".local-label").textContent = T(
    "◈ Salvamento automático no navegador",
  );
  $("status").textContent = T("Pronto para compor");
  $("toast").style.opacity = "0";
  // Controls created by app.js also need to update without recreating a dialog.
  allBank.textContent = T("Aplicar este banco a todas as pistas");
  $("midiOut").options[0].textContent = T("Saída: sintetizador interno");
  [...scoreButtons.children].forEach(
    (b, i) => (b.textContent = T(i ? "Próxima página" : "Página anterior")),
  );
  resize();
}
document.addEventListener("aurora:language", refreshLanguage);
refreshLanguage();
$("follow").onclick = () => {
  followPlayhead = !followPlayhead;
  $("follow").classList.toggle("active", followPlayhead);
  $("follow").setAttribute("aria-pressed", String(followPlayhead));
};
function followCursor() {
  if (!followPlayhead || scoreMode) return;
  const view = $("rollScroll"),
    px = KEY + position * zoom - view.scrollLeft;
  if (px > view.clientWidth - 40 || px < KEY)
    view.scrollLeft = Math.max(0, position * zoom - 40);
}
function panic() {
  stop(false);
  heldKeys.clear();
  toast(T("Todas as notas foram interrompidas."));
}
$("panic").onclick = panic;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("dialog").open) {
    e.preventDefault();
    panic();
  }
});
function fitNotes() {
  if (scoreMode) switchView(false);
  const ns = track().notes.filter(
    (n) => !selection.size || selection.has(n.id),
  );
  if (!ns.length) return toast(T("Esta pista não contém notas."));
  const bounds = ns.reduce(
    (b, n) => [
      Math.min(b[0], n.start),
      Math.max(b[1], n.start + n.duration),
      Math.min(b[2], n.pitch),
      Math.max(b[3], n.pitch),
    ],
    [Infinity, 0, 127, 0],
  );
  const view = $("rollScroll");
  zoom = clamp(
    (view.clientWidth - KEY - 48) / Math.max(1, bounds[1] - bounds[0]),
    12,
    240,
  );
  row = clamp(
    (view.clientHeight - TOP - 24) / Math.max(3, bounds[3] - bounds[2] + 3),
    8,
    32,
  );
  $("zoom").value = zoom;
  resize();
  view.scrollLeft = Math.max(0, bounds[0] * zoom - 24);
  view.scrollTop = Math.max(
    0,
    TOP + (MAX - (bounds[2] + bounds[3]) / 2) * row - view.clientHeight / 2,
  );
  draw();
}
$("fitNotes").onclick = fitNotes;
$("editorTools").onclick = () => {
  showDialog(
    '<h2>Ferramentas de edição</h2><p>Humanização e limpeza afetam a seleção ou, sem seleção, toda a pista. Todas as operações podem ser desfeitas.</p><div class="exports"><button id="humanize">Humanizar notas</button><button id="deduplicate">Remover notas duplicadas</button><button id="cloneTrack">Duplicar pista</button></div>',
  );
  $("humanize").onclick = () => {
    showDialog(
      '<h2>Humanizar notas</h2><label>Variação de início (tempos)<input id="humanTiming" type="number" min="0" max="0.5" step="0.005" value="0.02"></label><label>Variação de velocity<input id="humanVelocity" type="number" min="0" max="40" step="1" value="6"></label><p>Aplica pequenas variações aleatórias de início e intensidade. Preserva a duração e os limites do projeto.</p><button id="humanApply" class="primary">Aplicar às notas</button>',
    );
    $("humanApply").onclick = () => {
      const timing = +$("humanTiming").value,
        velocity = +$("humanVelocity").value;
      if (
        !Number.isFinite(timing) ||
        !Number.isFinite(velocity) ||
        !$("humanTiming").checkValidity() ||
        !$("humanVelocity").checkValidity()
      )
        return toast(T("Variação inválida."));
      const notes = track().notes.filter(
        (n) => !selection.size || selection.has(n.id),
      );
      if (!notes.length) return toast(T("Esta pista não contém notas."));
      snapshot();
      NoteTools.humanize(notes, length(), { timing, velocity });
      changed();
      closeDialog();
      toast(
        T("Humanização aplicada a {count} nota(s).", { count: notes.length }),
      );
    };
  };
  $("deduplicate").onclick = () => {
    const result = NoteTools.deduplicate(
      track().notes,
      selection.size ? selection : null,
    );
    if (result.removed.size) {
      snapshot();
      track().notes = result.notes;
      for (const id of result.removed) selection.delete(id);
      changed();
    }
    closeDialog();
    toast(
      T("{count} nota(s) duplicada(s) removida(s).", {
        count: result.removed.size,
      }),
    );
  };
  $("cloneTrack").onclick = () => {
    if (project.tracks.length >= 16) return toast(T("Limite de 16 pistas."));
    const used = new Set(project.tracks.map((t) => t.channel));
    const channel = Array.from({ length: 16 }, (_, i) => i).find(
      (i) => !used.has(i),
    );
    const t = NoteTools.cloneTrack(
      track(),
      track().name + T(" (cópia)"),
      channel,
    );
    snapshot();
    project.tracks.push(t);
    active = t.id;
    selection.clear();
    loadUI();
    changed();
    closeDialog();
  };
};
// Files dropped over the editor use the same validated, race-aware import path.
document.addEventListener("dragover", (e) => {
  if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault();
});
document.addEventListener("drop", async (e) => {
  if (!e.dataTransfer?.files.length) return;
  e.preventDefault();
  if (restoring || $("dialog").open) return;
  const file = e.dataTransfer.files[0];
  if (!/\.(mid|midi|rmi|json|aurora|pfm)$/i.test(file.name))
    return toast(T("Arraste um arquivo MIDI ou projeto Aurora."));
  try {
    await importFile(file);
  } catch (err) {
    toast(err.message);
  }
});
