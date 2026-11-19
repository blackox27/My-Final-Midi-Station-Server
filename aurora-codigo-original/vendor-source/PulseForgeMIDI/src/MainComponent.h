#pragma once

#include "AudioEngine.h"
#include "MidiDocument.h"
#include "PianoRollComponent.h"
#include "PluginWindow.h"
#include "ScoreComponent.h"

#include <juce_gui_extra/juce_gui_extra.h>

namespace pulseforge
{
class MainComponent final : public juce::Component,
                            private juce::Timer
{
public:
    MainComponent();
    ~MainComponent() override;
    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void configureControls();
    void bindActions();
    void documentChanged();
    void refreshTrackList();
    void selectTool (Tool);
    void showResult (const juce::Result&, const juce::String& successMessage);
    void chooseProjectToOpen();
    void chooseProjectToSave();
    void chooseMidiToImport();
    void chooseMidiToExport();
    void chooseAudioToExport();
    void choosePluginToLoad();
    double selectedGrid() const;

    MidiDocument document;
    AudioEngine audio;
    PianoRollComponent pianoRoll { document };
    ScoreComponent score { document };
    juce::TabbedComponent editorTabs { juce::TabbedButtonBar::TabsAtTop };
    std::unique_ptr<PluginWindow> pluginWindow;
    std::unique_ptr<juce::FileChooser> fileChooser;
    juce::File currentProjectFile;
    bool dirty {};
    bool changingTempo {};

    juce::TextButton newProject { "Novo" }, openProject { "Abrir" }, saveProject { "Salvar" };
    juce::TextButton importMidi { "Importar MIDI" }, exportMidi { "Exportar MIDI" }, exportAudio { "Exportar audio" };
    juce::TextButton playPause { "Reproduzir" }, stopButton { "Parar" };
    juce::Label tempoLabel;
    juce::Slider tempoSlider;

    juce::TextButton selectButton { "Selecionar" }, drawButton { "Desenhar" }, eraseButton { "Apagar" };
    juce::TextButton undoButton { "Desfazer" }, redoButton { "Refazer" };
    juce::TextButton cutButton { "Recortar" }, copyButton { "Copiar" }, pasteButton { "Colar" };
    juce::ComboBox gridBox, laneBox;
    juce::TextButton quantizeButton { "Quantizar" };
    juce::Label swingLabel, strengthLabel;
    juce::Slider swingSlider, strengthSlider;

    juce::ComboBox trackBox;
    juce::TextButton addTrackButton { "+ Pista" }, removeTrackButton { "- Pista" };
    juce::TextButton glideDown { "Glide -2" }, glideUp { "Glide +2" }, glideClear { "Sem glide" };
    juce::TextButton loadPlugin { "Carregar VST3/AU" }, editPlugin { "Abrir instrumento" }, unloadPlugin { "Interno" };
    juce::Label pluginLabel, statusLabel;
};
}
