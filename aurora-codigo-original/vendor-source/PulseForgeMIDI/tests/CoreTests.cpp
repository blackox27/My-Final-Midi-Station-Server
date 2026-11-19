#include "MidiDocument.h"
#include "Quantizer.h"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>

namespace
{
int failures = 0;

void expect (bool condition, const std::string& message)
{
    if (! condition)
    {
        std::cerr << "FALHOU: " << message << '\n';
        ++failures;
    }
}

bool closeTo (double a, double b, double tolerance = 1.0e-9)
{
    return std::abs (a - b) <= tolerance;
}
}

int main()
{
    using namespace pulseforge;

    expect (closeTo (Quantizer::snap (1.12, 0.25), 1.0), "snap para grade 1/16");
    expect (closeTo (Quantizer::snap (0.26, 0.5, 0.5), 0.625), "swing em passo impar");
    Note loose;
    loose.id = 1;
    loose.startBeats = 0.18;
    loose.lengthBeats = 0.41;
    loose.pitch = 64;
    loose.velocity = 90;
    const auto half = Quantizer::quantized (loose, { 0.25, 0.5, 0.0, true });
    expect (closeTo (half.startBeats, 0.215), "quantizacao parcial do inicio");
    expect (half.lengthBeats > 0.0, "duracao permanece positiva");

    MidiDocument document;
    document.beginTransaction ("Adicionar");
    auto note = document.addNote (0.13, 0.62, 60, 91);
    document.selectOnly (note.id);
    document.commitTransaction();
    expect (document.snapshot().tracks[0].notes.size() == 1, "nota adicionada");
    expect (document.canUndo(), "historico de desfazer criado");

    document.beginTransaction ("Quantizar");
    document.quantizeSelected ({ 0.25, 1.0, 0.0, false });
    document.commitTransaction();
    expect (closeTo (document.snapshot().tracks[0].notes[0].startBeats, 0.25), "nota quantizada");

    document.undo();
    expect (closeTo (document.snapshot().tracks[0].notes[0].startBeats, 0.13), "desfazer quantizacao");
    document.redo();
    expect (closeTo (document.snapshot().tracks[0].notes[0].startBeats, 0.25), "refazer quantizacao");

    document.copySelected();
    document.beginTransaction ("Colar");
    document.pasteAt (2.0);
    document.commitTransaction();
    auto state = document.snapshot();
    expect (state.tracks[0].notes.size() == 2, "copiar e colar nota");
    expect (closeTo (state.tracks[0].notes[1].startBeats, 2.0), "colar na posicao escolhida");
    expect (state.tracks[0].notes[1].id != state.tracks[0].notes[0].id, "ID novo ao colar");

    document.beginTransaction ("Glide");
    document.setGlide (2, 0.5);
    document.commitTransaction();
    state = document.snapshot();
    expect (state.tracks[0].notes[1].glideSemitones == 2, "glide na nota selecionada");

    const auto point = document.addAutomationPoint (LaneKind::sustain, 1.0, 0.99);
    state = document.snapshot();
    expect (state.tracks[0].automation.size() == 1, "ponto de automacao CC");
    expect (state.tracks[0].automation[0].id == point.id, "ID do ponto de automacao");

    document.beginTransaction ("Nova pista");
    document.addTrack ("Baixo");
    document.commitTransaction();
    state = document.snapshot();
    expect (state.tracks.size() == 2 && state.activeTrack == 1, "pista multipla");
    expect (state.tracks[1].channel == 2, "canal MIDI automatico");

    document.beginTransaction ("Limites");
    auto bounded = document.addNote (-3.0, -1.0, 300, -4);
    document.commitTransaction();
    expect (bounded.startBeats == 0.0 && bounded.pitch == 127 && bounded.velocity == 0,
            "valores MIDI e tempo limitados");

    if (failures == 0)
        std::cout << "Todos os testes do nucleo passaram.\n";
    return failures == 0 ? EXIT_SUCCESS : EXIT_FAILURE;
}
