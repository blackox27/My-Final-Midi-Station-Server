"use strict";
window.MidiShareTab = {
  openFile: (file) => load(file, true),
  exportFile() {
    if(!sourceMidiFile)throw Error('Abra um arquivo MIDI antes de enviar.');
    return new File([sourceMidiFile],sourceMidiFile.name,{type:'audio/midi'});
  }
};
