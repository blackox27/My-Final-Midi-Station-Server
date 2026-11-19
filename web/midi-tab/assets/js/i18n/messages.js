"use strict";
const MESSAGES = {
  projectTooLarge: [
    "Este MIDI excede o limite de tamanho do projeto. Recorte o arquivo ou exporte a tablatura em PDF/PNG.",
    "This MIDI exceeds the project size limit. Trim the file or export the tablature as PDF/PNG.",
  ],
  accompaniment: [
    "Tocar música completa com acompanhamento",
    "Play the full song with accompaniment",
  ],
  accompanimentSolo: [
    "Desativado: somente a pista selecionada.",
    "Off: only the selected part.",
  ],
  accompanimentFull: [
    "A pista selecionada usa o som escolhido abaixo; as demais mantêm os programas MIDI. Introdução e final são preservados. Para praticar, você pode zerar o volume da pista selecionada.",
    "The selected part uses the sound chosen below; other parts keep their MIDI programs. Intro and ending are preserved. To practice, you can mute the selected part with its volume slider.",
  ],
  accompanimentAll: [
    "Todas as pistas melódicas estão selecionadas: elas usam o som escolhido abaixo; a percussão continua como acompanhamento.",
    "All melodic tracks are selected: they use the sound chosen below; percussion remains accompaniment.",
  ],
  selectedVolume: ["Volume da pista selecionada", "Selected part volume"],
  backingVolume: ["Volume do acompanhamento", "Accompaniment volume"],
  introWait: [
    "Introdução · a pista entra em {seconds}s",
    "Intro · selected part enters in {seconds}s",
  ],
  backingAfter: [
    "Acompanhamento · pista selecionada concluída",
    "Accompaniment · selected part has ended",
  ],
  brandSub: ["TABLATURAS · PRÁTICA · MIDI", "TABLATURE · PRACTICE · MIDI"],
  language: ["Idioma", "Language"],
  theme: ["Tema", "Theme"],
  dark: ["Escuro", "Dark"],
  light: ["Claro", "Light"],
  offline: ["100% offline", "100% offline"],
  eyebrow: [
    "ESCOLHA AS CORDAS. ENCONTRE SEU SOM.",
    "CHOOSE YOUR STRINGS. FIND YOUR SOUND.",
  ],
  hero: ["Sua música, corda por corda.", "Your music, string by string."],
  heroSub: [
    "Converta, revise e ouça sua tablatura com o timbre que você quer tocar.",
    "Convert, refine and hear your tablature with the instrument you want to play.",
  ],
  stepMusic: ["01 / SUA MÚSICA", "01 / YOUR MUSIC"],
  importTitle: ["Comece com um MIDI", "Start with a MIDI"],
  dragMidi: ["Arraste um MIDI aqui", "Drop a MIDI here"],
  midiOnly: ["Arquivos .mid / .midi", "Files .mid / .midi"],
  chooseMidi: ["Selecionar MIDI", "Choose MIDI"],
  maxFile: ["Até 32 MB", "Up to 32 MB"],
  demo: ["Experimentar demonstração", "Try the demo"],
  track: ["Pista e canal", "Track and channel"],
  importFirst: ["Importe um MIDI para escolher", "Import a MIDI to choose"],
  stepInstrument: ["02 / INSTRUMENTO", "02 / INSTRUMENT"],
  instrument: ["Instrumento e afinação", "Instrument and tuning"],
  tuning: [
    "Da primeira à última corda / ordem",
    "From first to last string / course",
  ],
  tuningHelp: [
    "Use notas com oitava (C4 = dó central) ou números MIDI. A primeira corda aparece no alto.",
    "Use notes with octave (C4 = middle C) or MIDI numbers. The first string is at the top.",
  ],
  frets: ["Casas máximas", "Maximum frets"],
  transpose: ["Transpor (semitons)", "Transpose (semitones)"],
  layoutSettings: ["Ritmo e apresentação", "Rhythm and layout"],
  quantization: ["Quantização", "Quantization"],
  qOriginal: ["Original — preservar tempos", "Original — preserve timing"],
  qQuarter: ["Semínima (1/4)", "Quarter note (1/4)"],
  qEighth: ["Colcheia (1/8)", "Eighth note (1/8)"],
  qSixteenth: ["Semicolcheia (1/16)", "Sixteenth note (1/16)"],
  qThirtySecond: ["Fusa (1/32)", "Thirty-second note (1/32)"],
  qTriplet: ["Tercina de colcheia", "Eighth-note triplet"],
  start: ["Início", "Start"],
  keepSilence: ["Preservar silêncio inicial", "Keep initial silence"],
  trimSilence: ["Começar na primeira nota", "Start at the first note"],
  spacing: ["Espaçamento dos compassos", "Measure spacing"],
  normal: ["Normal", "Normal"],
  wide: ["Mais espaço", "Wider"],
  compact: ["Compacta", "Compact"],
  title: ["Título", "Title"],
  imagePage: ["Página da imagem PNG", "PNG image page"],
  generate: ["Gerar tablatura →", "Generate tablature →"],
  calculating: ["Calculando digitação…", "Calculating fingering…"],
  editHelp: [
    "Clique numa casa para trocar a corda sem alterar a nota. Gerar novamente substitui os ajustes manuais.",
    "Click a fret to move the note to another string. Generating again replaces manual edits.",
  ],
  project: ["Guardar seu trabalho", "Keep your work"],
  saveProject: ["Salvar projeto", "Save project"],
  openProject: ["Abrir projeto", "Open project"],
  projectHelp: [
    "O projeto guarda MIDI, configurações e digitação. Samples WAV importados precisam ser carregados novamente.",
    "Projects store MIDI, settings and fingering. Imported WAV samples must be loaded again.",
  ],
  workspace: ["03 / SEU ESPAÇO DE ENSAIO", "03 / YOUR PRACTICE SPACE"],
  scoreTitle: ["Leia. Ouça. Toque.", "Read. Listen. Play."],
  undo: ["↶ Desfazer", "↶ Undo"],
  notes: ["Notas", "Notes"],
  bars: ["Compassos", "Measures"],
  placed: ["Posicionadas", "Assigned"],
  play: ["▶ Ouvir", "▶ Play"],
  pause: ["Ⅱ Pausar", "Ⅱ Pause"],
  resume: ["▶ Retomar", "▶ Resume"],
  stop: ["■ Parar", "■ Stop"],
  tempoMode: ["Andamento", "Tempo"],
  tempoOriginal: ["Mapa de BPM do MIDI", "MIDI tempo map"],
  tempoFixed: ["BPM fixo", "Fixed BPM"],
  fixedBpm: ["BPM fixo", "Fixed BPM"],
  speed: ["Velocidade de ensaio", "Practice speed"],
  speedHelp: ["Não altera o PDF / PNG.", "Does not change PDF / PNG."],
  volume: ["Volume geral", "Master volume"],
  volumeHelp: ["Comparação de timbres.", "Compare instrument sounds."],
  seek: ["Posição da reprodução", "Playback position"],
  metronome: ["Metrônomo", "Metronome"],
  animation: ["Animações", "Animations"],
  follow: ["Seguir a tablatura", "Follow the score"],
  soundLab: ["OUÇA DE OUTRO JEITO", "HEAR IT DIFFERENTLY"],
  compareSound: [
    "O mesmo MIDI, outro instrumento.",
    "The same MIDI, another instrument.",
  ],
  soundSource: ["Som da pista escolhida", "Sound for the selected track"],
  soundTarget: ["Instrumento da tablatura", "Tablature instrument"],
  soundMidi: ["Instrumento indicado no MIDI", "Instrument indicated in MIDI"],
  soundCustom: ["Meu sample WAV", "My WAV sample"],
  soundSimple: ["Som simples de conferência", "Simple reference tone"],
  chooseSample: ["Carregar WAV", "Load WAV"],
  sampleRoot: ["Nota original do WAV", "WAV original pitch"],
  audition: ["♪ Testar som", "♪ Audition"],
  noSample: ["Nenhum WAV importado.", "No WAV imported."],
  sampleHelp: [
    "{name} · {seconds}s · nota base {root}. Altere a nota base se a afinação estiver errada.",
    "{name} · {seconds}s · root {root}. Adjust the root note if the tuning is wrong.",
  ],
  liveStrings: ["Cordas em movimento", "Strings in motion"],
  alternativePosition: ["Posição alternativa", "Alternative position"],
  apply: ["Aplicar posição", "Apply position"],
  close: ["Fechar", "Close"],
  ready: [
    "Pronto para começar. Importe um MIDI ou abra a demonstração.",
    "Ready to start. Import a MIDI or open the demo.",
  ],
  emptyTitle: [
    "Sua próxima tablatura começa aqui",
    "Your next tablature starts here",
  ],
  emptyText: [
    "Importe uma música e escolha o instrumento.",
    "Import a song and choose an instrument.",
  ],
  scoreHelp: [
    "Traços cinza mostram a duração; “—” indica continuação. Os números no alto marcam os pulsos. Clique numa casa para editar ou num espaço do compasso para posicionar o áudio.",
    "Gray bars show duration; “—” means continuation. Numbers above mark the pulses. Click a fret to edit, or an empty area in a measure to seek.",
  ],
  limitsTitle: ["Fidelidade e limites", "Fidelity and limits"],
  limits: [
    "A corda original normalmente não está no MIDI: a digitação é estimada. Revise acordes difíceis e deslocamentos. Pitch bend é avisado, mas não convertido em bends; slides e hammer-ons não são inferidos. Tipos MIDI 0/1 com PPQ; tipo 2 e SMPTE não são aceitos.",
    "Original string positions are usually absent from MIDI: fingering is estimated. Review difficult chords and shifts. Pitch bend is reported but not converted to bends; slides and hammer-ons are not inferred. MIDI types 0/1 with PPQ; type 2 and SMPTE are unsupported.",
  ],
  soundLimits: [
    "O banco compacto tem gravações de violão, guitarra e ukulele. Outros timbres são sintetizados. O modo MIDI segue os programas das notas, com aproximações para os demais instrumentos, sem emular SoundFonts ou bancos proprietários. Um WAV único é transposto pela nota base e termina com sua gravação, sem loop automático.",
    "The compact bank contains recorded nylon guitar, electric guitar and ukulele samples. Other timbres are synthesized. MIDI mode follows per-note programs, with approximations for other instruments, without emulating SoundFonts or proprietary banks. A single WAV is repitched from its root and ends with the recording, with no automatic loop.",
  ],
  footer: [
    "MIDI Tab Studio 3.1 · Arquivos locais. Sua música permanece no seu navegador.",
    "MIDI Tab Studio 3.1 · Local files. Your music stays in your browser.",
  ],
  custom: ["Personalizada", "Custom"],
  channel: ["canal", "channel"],
  percussion: ["percussão", "percussion"],
  allTracks: [
    "Todas as pistas melódicas (sem percussão)",
    "All melodic tracks (excluding percussion)",
  ],
  nNotes: ["{n} notas", "{n} notes"],
  summary: [
    "{n} notas · {placed} posicionadas · {bars} compassos.",
    "{n} notes · {placed} assigned · {bars} measures.",
  ],
  lost: [
    "{n} nota(s) sem posição: fora do alcance ou cordas ocupadas. Marcadas com “!” e detalhadas no apêndice.",
    "{n} unassigned note(s): out of range or occupied strings. Marked “!” and listed in the appendix.",
  ],
  largeShifts: [
    "Há compassos com grandes deslocamentos no braço. Revise a digitação.",
    "Some measures contain large fretboard shifts. Review the fingering.",
  ],
  bendWarning: [
    "Esta seleção tem pitch bend; são mostradas as alturas base, sem a curva.",
    "This selection contains pitch bend; base pitches are shown without the curve.",
  ],
  drumWarning: [
    "Pista de percussão: números de bateria não são alturas de guitarra.",
    "Percussion track: drum numbers are not guitar pitches.",
  ],
  nStrings: ["{n} cordas / ordens", "{n} strings / courses"],
  finding: [
    "Encontrando posições para {n} notas…",
    "Finding positions for {n} notes…",
  ],
  loading: ["Lendo {name}…", "Reading {name}…"],
  oldAvailable: [
    " O arquivo anterior continua disponível.",
    " The previous file is still available.",
  ],
  page: ["Página {n}", "Page {n}"],
  canvasLabel: ["Tablatura, página {n}", "Tablature, page {n}"],
  canvasTitle: [
    "Clique numa casa para editar; clique no compasso para posicionar o áudio.",
    "Click a fret to edit; click the measure to seek.",
  ],
  paperFooter: [
    "MIDI Tab • Duração: traço cinza • !: sem posição • Pulsos conforme o compasso",
    "MIDI Tab • Duration: gray bar • !: unassigned • Pulses follow the time signature",
  ],
  missingTitle: [
    "Notas sem posição — referência para revisão",
    "Unassigned notes — review reference",
  ],
  missingContinue: [
    "Notas sem posição — continuação",
    "Unassigned notes — continued",
  ],
  missingHelp: [
    "Início e duração em semínimas, contando a partir de zero.",
    "Onset and duration in quarter notes, starting from zero.",
  ],
  measure: ["Compasso", "Measure"],
  onset: ["Início", "Onset"],
  duration: ["Duração", "Duration"],
  string: ["Corda", "String"],
  fret: ["casa", "fret"],
  beat: ["tempo", "beat"],
  unassigned: ["Sem posição (marcar !)", "Unassigned (mark !)"],
  occupied: [
    "Essa corda já está ocupada por uma nota que ainda soa. Escolha outra posição.",
    "This string is occupied by a note that is still sounding. Choose another position.",
  ],
  exporting: ["Exportando…", "Exporting…"],
  bpmInvalid: [
    "Use BPM entre 20 e 400. Mantido o último valor válido.",
    "Use BPM between 20 and 400. The last valid value was kept.",
  ],
  audioFailed: [
    "Não foi possível iniciar o áudio: ",
    "Unable to start audio: ",
  ],
  pdfFailed: ["Falha ao exportar PDF: ", "PDF export failed: "],
  pngFailed: ["Falha ao exportar imagem.", "Image export failed."],
  targetRecorded: [
    "{instrument} · gravações FreePats CC0 · banco compacto.",
    "{instrument} · recorded FreePats CC0 samples · compact bank.",
  ],
  targetSynth: [
    "{instrument} · timbre sintetizado aproximado.",
    "{instrument} · approximate synthesized timbre.",
  ],
  midiSound: [
    "GM: {names}. Programas preservados por nota; timbres fora do banco são aproximados.",
    "GM: {names}. Per-note programs are preserved; sounds outside the bank are approximations.",
  ],
  customSound: [
    "WAV importado, transposto a partir de {root}.",
    "Imported WAV, repitched from {root}.",
  ],
  needSample: [
    "Carregue um WAV de uma nota isolada antes de usar este modo.",
    "Load a single-note WAV before using this mode.",
  ],
  simpleSound: [
    "Onda triangular para conferir alturas e ritmo.",
    "Triangle wave for checking pitch and rhythm.",
  ],
  sampleLoading: ["Carregando sample…", "Loading sample…"],
  sampleInvalid: [
    "Use um WAV válido, com até 16 MB e 15 segundos.",
    "Use a valid WAV, up to 16 MB and 15 seconds.",
  ],
  rootInvalid: [
    "Nota base inválida. Use C4, A3 ou um número MIDI de 0 a 127.",
    "Invalid root note. Use C4, A3 or a MIDI number from 0 to 127.",
  ],
  sampleDecode: [
    "O navegador não conseguiu decodificar este WAV.",
    "The browser could not decode this WAV.",
  ],
  sampleSilent: [
    "Este sample está silencioso. Escolha uma nota audível.",
    "This sample is silent. Choose an audible note.",
  ],
  projectInvalid: [
    "Projeto inválido ou incompatível.",
    "Invalid or incompatible project.",
  ],
  projectSaved: [
    "Projeto salvo com as posições editadas.",
    "Project saved with edited positions.",
  ],
  projectLoaded: [
    "Projeto restaurado. Reimporte seu WAV caso estivesse usando um sample próprio.",
    "Project restored. Reload your WAV if you were using a custom sample.",
  ],
  noProject: [
    "Importe uma música antes de salvar o projeto.",
    "Import a song before saving the project.",
  ],
  sampledHelp: [
    "Gravações incluídas; escolha MIDI ou seu WAV para comparar.",
    "Recorded samples included; choose MIDI or your WAV to compare.",
  ],
  synthHelp: [
    "Afinação pronta para tablatura; timbre sintetizado aproximado.",
    "Tablature tuning preset; approximate synthesized timbre.",
  ],
  coursesHelp: [
    "Uma linha por ordem. Pares em oitavas não são acrescentados automaticamente.",
    "One line per course. Octave pairs are not automatically added.",
  ],
  noSoundLoaded: [
    "Escolha o instrumento e pressione Testar som.",
    "Choose an instrument and press Audition.",
  ],
};
let language = "pt-BR",
  theme = "dark",
  lastStatus = { text: "", error: false };
function prefGet(key, fallback) {
  try {
    return localStorage.getItem("miditab3." + key) || fallback;
  } catch {
    return fallback;
  }
}
function prefSet(key, value) {
  try {
    localStorage.setItem("miditab3." + key, String(value));
  } catch {}
}
function t(key, values = {}) {
  let out = MESSAGES[key]?.[language === "en" ? 1 : 0] ?? key;
  for (const [k, v] of Object.entries(values))
    out = out.replaceAll("{" + k + "}", String(v));
  return out;
}
function localizeError(text) {
  let out = String(text);
  for (const [pt, en] of ERROR_TRANSLATIONS)
    out = out.replaceAll(
      language === "en" ? pt : en,
      language === "en" ? en : pt,
    );
  for (const pair of Object.values(MESSAGES)) {
    const source = pair[language === "en" ? 0 : 1];
    if (out === source && !source.includes("{"))
      return pair[language === "en" ? 1 : 0];
  }
  return out;
}
function applyLabels() {
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
  for (const el of document.querySelectorAll("[data-i18n]"))
    el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-aria]"))
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  $("language").value = language;
  $("theme").value = theme;
}
