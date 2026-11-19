"use strict";
// Display order is always first string at the top. A course occupies one TAB line.
const INSTRUMENTS = [
  {
    id: "nylon",
    pt: "Violão clássico — nylon",
    en: "Classical guitar — nylon",
    notes: [64, 59, 55, 50, 45, 40],
    voice: "nylon",
    frets: 19,
  },
  {
    id: "steel",
    pt: "Violão — aço",
    en: "Acoustic guitar — steel",
    notes: [64, 59, 55, 50, 45, 40],
    voice: "steel",
    frets: 22,
  },
  {
    id: "electric",
    pt: "Guitarra elétrica — E padrão",
    en: "Electric guitar — standard E",
    notes: [64, 59, 55, 50, 45, 40],
    voice: "electric",
    frets: 24,
  },
  {
    id: "dropd",
    pt: "Guitarra — Drop D",
    en: "Guitar — Drop D",
    notes: [64, 59, 55, 50, 45, 38],
    voice: "electric",
    frets: 24,
  },
  {
    id: "dadgad",
    pt: "Violão — DADGAD",
    en: "Acoustic guitar — DADGAD",
    notes: [62, 57, 55, 50, 45, 38],
    voice: "steel",
    frets: 22,
  },
  {
    id: "guitar7",
    pt: "Guitarra — 7 cordas",
    en: "Guitar — 7 strings",
    notes: [64, 59, 55, 50, 45, 40, 35],
    voice: "electric",
    frets: 24,
  },
  {
    id: "guitar8",
    pt: "Guitarra — 8 cordas",
    en: "Guitar — 8 strings",
    notes: [64, 59, 55, 50, 45, 40, 35, 30],
    voice: "electric",
    frets: 24,
  },
  {
    id: "bass4",
    pt: "Baixo — 4 cordas",
    en: "Bass — 4 strings",
    notes: [43, 38, 33, 28],
    voice: "bass",
    frets: 24,
  },
  {
    id: "bass5",
    pt: "Baixo — 5 cordas",
    en: "Bass — 5 strings",
    notes: [43, 38, 33, 28, 23],
    voice: "bass",
    frets: 24,
  },
  {
    id: "bass6",
    pt: "Baixo — 6 cordas",
    en: "Bass — 6 strings",
    notes: [48, 43, 38, 33, 28, 23],
    voice: "bass",
    frets: 24,
  },
  {
    id: "uke",
    pt: "Ukulele — GCEA reentrante",
    en: "Ukulele — re-entrant GCEA",
    notes: [69, 64, 60, 67],
    voice: "ukulele",
    frets: 15,
  },
  {
    id: "ukelow",
    pt: "Ukulele — G grave",
    en: "Ukulele — low G",
    notes: [69, 64, 60, 55],
    voice: "ukulele",
    frets: 18,
  },
  {
    id: "ukebari",
    pt: "Ukulele barítono — DGBE",
    en: "Baritone ukulele — DGBE",
    notes: [64, 59, 55, 50],
    voice: "ukulele",
    frets: 19,
  },
  {
    id: "guitalele",
    pt: "Guitalele — ADGCEA",
    en: "Guitalele — ADGCEA",
    notes: [69, 64, 60, 55, 50, 45],
    voice: "nylon",
    frets: 18,
  },
  {
    id: "mandolin",
    pt: "Bandolim — GDAE (4 ordens)",
    en: "Mandolin — GDAE (4 courses)",
    notes: [76, 69, 62, 55],
    voice: "mandolin",
    frets: 20,
    courses: true,
  },
  {
    id: "mandola",
    pt: "Mandola — CGDA (4 ordens)",
    en: "Mandola — CGDA (4 courses)",
    notes: [69, 62, 55, 48],
    voice: "mandolin",
    frets: 20,
    courses: true,
  },
  {
    id: "bouzouki",
    pt: "Bouzouki irlandês — GDAD",
    en: "Irish bouzouki — GDAD",
    notes: [62, 57, 50, 43],
    voice: "mandolin",
    frets: 24,
    courses: true,
  },
  {
    id: "cavaquinho",
    pt: "Cavaquinho brasileiro — DGBD",
    en: "Brazilian cavaquinho — DGBD",
    notes: [74, 71, 67, 62],
    voice: "steel",
    frets: 17,
  },
  {
    id: "banjotenor",
    pt: "Banjo tenor — CGDA",
    en: "Tenor banjo — CGDA",
    notes: [69, 62, 55, 48],
    voice: "banjo",
    frets: 19,
  },
  {
    id: "banjoplec",
    pt: "Banjo plectro — CGBD",
    en: "Plectrum banjo — CGBD",
    notes: [62, 59, 55, 48],
    voice: "banjo",
    frets: 22,
  },
  {
    id: "balalaika",
    pt: "Balalaica prima — EEA",
    en: "Prima balalaika — EEA",
    notes: [69, 64, 64],
    voice: "balalaika",
    frets: 19,
  },
];
let targetVoice = "nylon";
function currentInstrument() {
  return (
    INSTRUMENTS.find((i) => i.id === $("preset").value) || {
      id: "custom",
      pt: "Afinação personalizada",
      en: "Custom tuning",
      voice: targetVoice,
      notes: tuning,
    }
  );
}
function instrumentName(i = currentInstrument()) {
  return language === "en" ? i.en : i.pt;
}
function populateInstruments() {
  const old = $("preset").value || "nylon";
  $("preset").replaceChildren();
  for (const i of INSTRUMENTS) {
    const o = document.createElement("option");
    o.value = i.id;
    o.textContent = instrumentName(i);
    $("preset").append(o);
  }
  const o = document.createElement("option");
  o.value = "custom";
  o.textContent = t("custom");
  $("preset").append(o);
  $("preset").value = old;
  updateInstrumentHint();
}
function updateInstrumentHint() {
  const i = currentInstrument();
  $("instrumentHint").textContent = i.courses
    ? t("coursesHelp")
    : ["nylon", "electric", "ukulele"].includes(i.voice)
      ? t("sampledHelp")
      : t("synthHelp");
}
