"use strict";
const ERROR_TRANSLATIONS = [
  [
    "O acompanhamento excede 100.000 notas. Selecione um MIDI menor.",
    "Accompaniment exceeds 100,000 notes. Select a smaller MIDI.",
  ],
  [
    "O metrônomo excede 100.000 pulsos. Recorte o MIDI.",
    "The metronome exceeds 100,000 pulses. Trim the MIDI.",
  ],
  ["Arquivo MIDI truncado ou inválido.", "Truncated or invalid MIDI file."],
  [
    "Número MIDI de tamanho variável inválido.",
    "Invalid MIDI variable-length quantity.",
  ],
  [
    "Este arquivo não é um MIDI padrão (.mid).",
    "This is not a standard MIDI file (.mid).",
  ],
  ["Cabeçalho MIDI inválido.", "Invalid MIDI header."],
  [
    "MIDI tipo 2 não é suportado. Exporte como tipo 0 ou 1.",
    "MIDI type 2 is unsupported. Export as type 0 or 1.",
  ],
  [
    "Tempo SMPTE não é suportado. Exporte o MIDI com divisão PPQ.",
    "SMPTE timing is unsupported. Export with PPQ division.",
  ],
  [
    "MIDI tipo 0 deve conter uma única pista.",
    "MIDI type 0 must contain exactly one track.",
  ],
  [
    "Divisão de tempo ou quantidade de pistas inválida.",
    "Invalid timing division or track count.",
  ],
  ["Bloco de pista MIDI inválido.", "Invalid MIDI track chunk."],
  [
    "MIDI muito grande (mais de 2 milhões de eventos).",
    "MIDI too large (over 2 million events).",
  ],
  ["Running status inválido.", "Invalid running status."],
  ["Evento de andamento MIDI inválido.", "Invalid MIDI tempo event."],
  [
    "Evento de andamento zero ignorado; aplicado o último andamento válido.",
    "Zero tempo event ignored; the last valid tempo is used.",
  ],
  ["Fórmula de compasso inválida ignorada.", "Invalid time signature ignored."],
  ["Fim de pista MIDI inválido.", "Invalid MIDI end-of-track event."],
  ["Dados MIDI inválidos.", "Invalid MIDI data."],
  ["Evento MIDI de sistema não suportado.", "Unsupported MIDI system event."],
  [
    "Uma pista não tem marcador de fim; usada a duração disponível.",
    "A track has no end marker; available duration is used.",
  ],
  [
    "Notas sem note-off foram encerradas no fim do arquivo.",
    "Notes without note-off were closed at the end of the file.",
  ],
  ["Informe de 3 a 8 cordas.", "Enter 3 to 8 strings."],
  ["Afinação inválida: ", "Invalid tuning: "],
  [". Exemplo: E4 B3 G3 D3 A2 E2.", ". Example: E4 B3 G3 D3 A2 E2."],
  ["Falha ao calcular a digitação.", "Fingering calculation failed."],
  [
    "Música longa demais: limite de 4.000 compassos. Recorte a pista antes de importar.",
    "Song too long: limit of 4,000 measures. Trim the track before importing.",
  ],
  ["O MIDI não contém notas.", "The MIDI contains no notes."],
  ["Limite de arquivo: 32 MB.", "File limit: 32 MB."],
  [
    "Use 1–36 casas e transposição de −48 a +48 semitons.",
    "Use 1–36 frets and transposition from −48 to +48 semitones.",
  ],
  [
    "A seleção não contém notas melódicas.",
    "The selection contains no melodic notes.",
  ],
  [
    "Limite de conversão: 20.000 notas por seleção. Recorte a pista.",
    "Conversion limit: 20,000 notes per selection. Trim the track.",
  ],
  [
    "Há notas sustentadas por compassos demais. Recorte a seleção para gerar a tablatura.",
    "Notes span too many measures. Trim the selection to generate tablature.",
  ],
  [
    "A tablatura excede 100 páginas. Use a apresentação compacta ou recorte o MIDI.",
    "Tablature exceeds 100 pages. Use compact spacing or trim the MIDI.",
  ],
  ["Falha ao gerar página ", "Failed to generate page "],
];
