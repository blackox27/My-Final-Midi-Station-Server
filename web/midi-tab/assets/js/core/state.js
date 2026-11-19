"use strict";
const $ = (id) => document.getElementById(id),
  names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n) => names[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
let midi = null,
  source = [],
  result = [],
  tuning = [],
  bars = [],
  pages = [],
  hits = [],
  selected = null,
  filename = "tablatura",
  offset = 0,
  audio = null,
  playing = false,
  timer = null,
  audioNodes = [],
  generation = 0;
let conversionToken = 0,
  assignmentWorker = null,
  scoreIndex = [],
  pageCommands = [],
  geometry = [],
  exportInProgress = false;

let pendingAssignReject = null,
  editHistory = [];

// Bytes originais para reencaminhar sem perder controles, programas ou tempo.
let sourceMidiFile = null;
