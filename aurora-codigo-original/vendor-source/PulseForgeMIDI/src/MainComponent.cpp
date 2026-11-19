#include "MainComponent.h"
#include "MidiFileIO.h"
#include "ProjectIO.h"

namespace pulseforge
{
namespace
{
void styleButton (juce::TextButton& button, juce::Colour accent = juce::Colour (0xff2a2f3c))
{
    button.setColour (juce::TextButton::buttonColourId, accent);
    button.setColour (juce::TextButton::buttonOnColourId, juce::Colour (0xff6658e8));
    button.setColour (juce::TextButton::textColourOffId, juce::Colour (0xffe7eaf2));
    button.setColour (juce::TextButton::textColourOnId, juce::Colours::white);
}

void setupSlider (juce::Slider& slider, double min, double max, double step, double value)
{
    slider.setRange (min, max, step);
    slider.setValue (value, juce::dontSendNotification);
    slider.setSliderStyle (juce::Slider::LinearHorizontal);
    slider.setTextBoxStyle (juce::Slider::TextBoxRight, false, 52, 22);
    slider.setColour (juce::Slider::trackColourId, juce::Colour (0xff7667ff));
    slider.setColour (juce::Slider::backgroundColourId, juce::Colour (0xff242936));
}
}

MainComponent::MainComponent()
{
    setOpaque (true);
    configureControls();
    bindActions();
    editorTabs.addTab ("Piano Roll", juce::Colour (0xff151820), &pianoRoll, false);
    editorTabs.addTab ("Partitura", juce::Colour (0xff151820), &score, false);
    addAndMakeVisible (editorTabs);

    pianoRoll.onStatus = [this] (const juce::String& text) { statusLabel.setText (text, juce::dontSendNotification); };
    pianoRoll.onSeek = [this] (double beat) { audio.setPositionBeats (beat); };
    document.onChange = [this] { documentChanged(); };
    audio.onPluginChanged = [this]
    {
        pluginWindow.reset();
        pluginLabel.setText (audio.pluginName(), juce::dontSendNotification);
        editPlugin.setEnabled (audio.pluginProcessor() != nullptr);
    };

    refreshTrackList();
    audio.setProject (document.snapshot());
    const auto initialised = audio.initialise();
    statusLabel.setText (initialised.wasOk() ? "Pronto — sintetizador interno ativo"
                                             : "Audio indisponivel: " + initialised.getErrorMessage(),
                         juce::dontSendNotification);
    setSize (1440, 900);
    startTimerHz (30);
}

MainComponent::~MainComponent()
{
    stopTimer();
    pluginWindow.reset();
    document.onChange = nullptr;
    audio.onPluginChanged = nullptr;
}

void MainComponent::configureControls()
{
    auto addButton = [this] (juce::TextButton& button)
    {
        styleButton (button);
        addAndMakeVisible (button);
    };
    for (auto* button : { &newProject, &openProject, &saveProject, &importMidi, &exportMidi, &exportAudio,
                          &playPause, &stopButton, &selectButton, &drawButton, &eraseButton,
                          &undoButton, &redoButton, &cutButton, &copyButton, &pasteButton,
                          &quantizeButton, &addTrackButton, &removeTrackButton,
                          &glideDown, &glideUp, &glideClear, &loadPlugin, &editPlugin, &unloadPlugin })
        addButton (*button);
    styleButton (playPause, juce::Colour (0xff4d42bd));
    drawButton.setClickingTogglesState (false);
    selectTool (Tool::draw);

    tempoLabel.setText ("BPM", juce::dontSendNotification);
    tempoLabel.setColour (juce::Label::textColourId, juce::Colour (0xffaeb5c8));
    addAndMakeVisible (tempoLabel);
    setupSlider (tempoSlider, 20.0, 400.0, 0.1, 120.0);
    addAndMakeVisible (tempoSlider);

    gridBox.addItem ("1/4", 1);
    gridBox.addItem ("1/8", 2);
    gridBox.addItem ("1/16", 3);
    gridBox.addItem ("1/32", 4);
    gridBox.addItem ("1/8T", 5);
    gridBox.setSelectedId (3);
    addAndMakeVisible (gridBox);

    laneBox.addItem ("Velocidade", 1);
    laneBox.addItem ("CC1 Modulacao", 2);
    laneBox.addItem ("CC7 Volume", 3);
    laneBox.addItem ("CC10 Pan", 4);
    laneBox.addItem ("CC11 Expressao", 5);
    laneBox.addItem ("CC64 Sustain", 6);
    laneBox.addItem ("Pitch Bend", 7);
    laneBox.setSelectedId (1);
    addAndMakeVisible (laneBox);

    swingLabel.setText ("Swing", juce::dontSendNotification);
    strengthLabel.setText ("Forca", juce::dontSendNotification);
    for (auto* label : { &swingLabel, &strengthLabel })
    {
        label->setColour (juce::Label::textColourId, juce::Colour (0xffaeb5c8));
        addAndMakeVisible (*label);
    }
    setupSlider (swingSlider, -75.0, 75.0, 1.0, 0.0);
    setupSlider (strengthSlider, 0.0, 100.0, 1.0, 100.0);
    addAndMakeVisible (swingSlider);
    addAndMakeVisible (strengthSlider);

    addAndMakeVisible (trackBox);
    pluginLabel.setText ("Sintetizador interno", juce::dontSendNotification);
    pluginLabel.setColour (juce::Label::textColourId, juce::Colour (0xffc8cddd));
    pluginLabel.setColour (juce::Label::backgroundColourId, juce::Colour (0xff1b1f29));
    addAndMakeVisible (pluginLabel);
    editPlugin.setEnabled (false);

    statusLabel.setColour (juce::Label::textColourId, juce::Colour (0xffaeb5c8));
    statusLabel.setColour (juce::Label::backgroundColourId, juce::Colour (0xff11131a));
    statusLabel.setFont (juce::Font (juce::FontOptions (12.0f)));
    addAndMakeVisible (statusLabel);
}

void MainComponent::bindActions()
{
    newProject.onClick = [this]
    {
        Project blank;
        Track firstTrack;
        firstTrack.id = 1;
        firstTrack.name = "Pista 1";
        firstTrack.channel = 1;
        blank.tracks.push_back (std::move (firstTrack));
        document.replaceProject (std::move (blank));
        currentProjectFile = juce::File();
        dirty = false;
        audio.stop();
        statusLabel.setText ("Novo projeto", juce::dontSendNotification);
    };
    openProject.onClick = [this] { chooseProjectToOpen(); };
    saveProject.onClick = [this]
    {
        if (currentProjectFile == juce::File()) chooseProjectToSave();
        else showResult (ProjectIO::save (currentProjectFile, document.snapshot()), "Projeto salvo");
    };
    importMidi.onClick = [this] { chooseMidiToImport(); };
    exportMidi.onClick = [this] { chooseMidiToExport(); };
    exportAudio.onClick = [this] { chooseAudioToExport(); };

    playPause.onClick = [this]
    {
        if (audio.isPlaying()) audio.pause(); else audio.play();
    };
    stopButton.onClick = [this] { audio.stop(); };
    tempoSlider.onDragStart = [this]
    {
        document.beginTransaction ("Alterar andamento");
        changingTempo = true;
    };
    tempoSlider.onValueChange = [this]
    {
        auto project = document.snapshot();
        project.tempo = tempoSlider.getValue();
        document.replaceProject (std::move (project), false);
    };
    tempoSlider.onDragEnd = [this]
    {
        if (changingTempo) document.commitTransaction();
        changingTempo = false;
    };

    selectButton.onClick = [this] { selectTool (Tool::select); };
    drawButton.onClick = [this] { selectTool (Tool::draw); };
    eraseButton.onClick = [this] { selectTool (Tool::erase); };
    undoButton.onClick = [this] { document.undo(); };
    redoButton.onClick = [this] { document.redo(); };
    copyButton.onClick = [this] { document.copySelected(); statusLabel.setText ("Selecao copiada", juce::dontSendNotification); };
    cutButton.onClick = [this]
    { document.beginTransaction ("Recortar"); document.cutSelected(); document.commitTransaction(); };
    pasteButton.onClick = [this]
    { document.beginTransaction ("Colar"); document.pasteAt (audio.positionBeats()); document.commitTransaction(); };

    gridBox.onChange = [this]
    {
        pianoRoll.setSnapBeats (selectedGrid());
        score.setSnapBeats (selectedGrid());
    };
    laneBox.onChange = [this]
    {
        pianoRoll.setLane (static_cast<LaneKind> (laneBox.getSelectedId() - 1));
    };
    quantizeButton.onClick = [this]
    {
        document.beginTransaction ("Quantizar notas");
        document.quantizeSelected ({ selectedGrid(), strengthSlider.getValue() / 100.0,
                                     swingSlider.getValue() / 100.0, false });
        document.commitTransaction();
        statusLabel.setText ("Quantizacao aplicada", juce::dontSendNotification);
    };

    trackBox.onChange = [this]
    {
        if (trackBox.getSelectedItemIndex() >= 0)
            document.setActiveTrack (static_cast<std::size_t> (trackBox.getSelectedItemIndex()));
    };
    addTrackButton.onClick = [this]
    { document.beginTransaction ("Adicionar pista"); document.addTrack(); document.commitTransaction(); };
    removeTrackButton.onClick = [this]
    { document.beginTransaction ("Remover pista"); document.removeActiveTrack(); document.commitTransaction(); };

    glideDown.onClick = [this]
    { document.beginTransaction ("Glide descendente"); document.setGlide (-2, 0.5); document.commitTransaction(); };
    glideUp.onClick = [this]
    { document.beginTransaction ("Glide ascendente"); document.setGlide (2, 0.5); document.commitTransaction(); };
    glideClear.onClick = [this]
    { document.beginTransaction ("Remover glide"); document.setGlide (0, 0.0); document.commitTransaction(); };

    loadPlugin.onClick = [this] { choosePluginToLoad(); };
    editPlugin.onClick = [this]
    {
        if (auto* processor = audio.pluginProcessor())
        {
            if (! pluginWindow) pluginWindow = std::make_unique<PluginWindow> (*processor);
            pluginWindow->setVisible (true);
            pluginWindow->toFront (true);
        }
    };
    unloadPlugin.onClick = [this] { pluginWindow.reset(); audio.unloadPlugin(); };
}

void MainComponent::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff151820));
    g.setColour (juce::Colour (0xff202430));
    g.fillRect (0, 0, getWidth(), 166);
    g.setColour (juce::Colour (0xff343a49));
    g.drawHorizontalLine (165, 0.0f, static_cast<float> (getWidth()));
}

void MainComponent::resized()
{
    auto area = getLocalBounds();
    auto status = area.removeFromBottom (25);
    statusLabel.setBounds (status);

    auto fileRow = area.removeFromTop (40).reduced (8, 5);
    auto place = [&] (juce::Component& component, int width)
    {
        component.setBounds (fileRow.removeFromLeft (width));
        fileRow.removeFromLeft (5);
    };
    place (newProject, 62); place (openProject, 66); place (saveProject, 66);
    place (importMidi, 108); place (exportMidi, 108); place (exportAudio, 112);
    fileRow.removeFromLeft (8);
    place (loadPlugin, 135); place (editPlugin, 128); place (unloadPlugin, 68);
    pluginLabel.setBounds (fileRow);

    auto transportRow = area.removeFromTop (48).reduced (8, 6);
    auto placeTransport = [&] (juce::Component& component, int width)
    {
        component.setBounds (transportRow.removeFromLeft (width));
        transportRow.removeFromLeft (5);
    };
    placeTransport (playPause, 100); placeTransport (stopButton, 66);
    tempoLabel.setBounds (transportRow.removeFromLeft (38));
    placeTransport (tempoSlider, 180);
    placeTransport (selectButton, 86); placeTransport (drawButton, 82); placeTransport (eraseButton, 72);
    placeTransport (undoButton, 76); placeTransport (redoButton, 72);
    placeTransport (cutButton, 76); placeTransport (copyButton, 66); placeTransport (pasteButton, 62);

    auto editRow = area.removeFromTop (43).reduced (8, 5);
    auto placeEdit = [&] (juce::Component& component, int width)
    {
        component.setBounds (editRow.removeFromLeft (width));
        editRow.removeFromLeft (5);
    };
    placeEdit (trackBox, 160); placeEdit (addTrackButton, 72); placeEdit (removeTrackButton, 72);
    placeEdit (gridBox, 72); placeEdit (quantizeButton, 82);
    strengthLabel.setBounds (editRow.removeFromLeft (40)); placeEdit (strengthSlider, 128);
    swingLabel.setBounds (editRow.removeFromLeft (45)); placeEdit (swingSlider, 128);
    placeEdit (laneBox, 138); placeEdit (glideDown, 78); placeEdit (glideUp, 78); placeEdit (glideClear, 84);

    editorTabs.setBounds (area.reduced (7, 4));
}

void MainComponent::timerCallback()
{
    const auto beat = audio.positionBeats();
    pianoRoll.setPlayheadBeat (beat);
    score.setPlayheadBeat (beat);
    playPause.setButtonText (audio.isPlaying() ? "Pausar" : "Reproduzir");
    undoButton.setEnabled (document.canUndo());
    redoButton.setEnabled (document.canRedo());
}

void MainComponent::documentChanged()
{
    const auto project = document.snapshot();
    audio.setProject (project);
    if (! changingTempo)
        tempoSlider.setValue (project.tempo, juce::dontSendNotification);
    dirty = true;
    refreshTrackList();
    pianoRoll.repaint();
    score.repaint();
}

void MainComponent::refreshTrackList()
{
    const auto project = document.snapshot();
    trackBox.clear (juce::dontSendNotification);
    for (std::size_t index = 0; index < project.tracks.size(); ++index)
        trackBox.addItem (juce::String (index + 1) + "  " + juce::String (project.tracks[index].name),
                          static_cast<int> (index + 1));
    trackBox.setSelectedItemIndex (static_cast<int> (project.activeTrack), juce::dontSendNotification);
}

void MainComponent::selectTool (Tool selected)
{
    pianoRoll.setTool (selected);
    score.setTool (selected);
    selectButton.setToggleState (selected == Tool::select, juce::dontSendNotification);
    drawButton.setToggleState (selected == Tool::draw, juce::dontSendNotification);
    eraseButton.setToggleState (selected == Tool::erase, juce::dontSendNotification);
}

void MainComponent::showResult (const juce::Result& result, const juce::String& successMessage)
{
    statusLabel.setText (result.wasOk() ? successMessage : result.getErrorMessage(), juce::dontSendNotification);
    if (result.failed())
        juce::AlertWindow::showMessageBoxAsync (juce::MessageBoxIconType::WarningIcon,
                                                "PulseForge MIDI", result.getErrorMessage());
}

void MainComponent::chooseProjectToOpen()
{
    fileChooser = std::make_unique<juce::FileChooser> ("Abrir projeto PulseForge", juce::File(), "*.pfm");
    fileChooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
        [this] (const juce::FileChooser& chooser)
        {
            const auto file = chooser.getResult();
            if (file.existsAsFile())
            {
                Project loaded;
                const auto result = ProjectIO::load (file, loaded);
                if (result.wasOk()) { document.replaceProject (std::move (loaded)); currentProjectFile = file; dirty = false; audio.stop(); }
                showResult (result, "Projeto aberto");
            }
            fileChooser.reset();
        });
}

void MainComponent::chooseProjectToSave()
{
    fileChooser = std::make_unique<juce::FileChooser> ("Salvar projeto PulseForge", juce::File(), "*.pfm");
    fileChooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::warnAboutOverwriting,
        [this] (const juce::FileChooser& chooser)
        {
            auto file = chooser.getResult();
            if (file != juce::File())
            {
                if (! file.hasFileExtension ("pfm")) file = file.withFileExtension ("pfm");
                const auto result = ProjectIO::save (file, document.snapshot());
                if (result.wasOk()) { currentProjectFile = file; dirty = false; }
                showResult (result, "Projeto salvo");
            }
            fileChooser.reset();
        });
}

void MainComponent::chooseMidiToImport()
{
    fileChooser = std::make_unique<juce::FileChooser> ("Importar arquivo MIDI", juce::File(), "*.mid;*.midi");
    fileChooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
        [this] (const juce::FileChooser& chooser)
        {
            const auto file = chooser.getResult();
            if (file.existsAsFile())
            {
                Project loaded;
                const auto result = MidiFileIO::load (file, loaded);
                if (result.wasOk()) { document.replaceProject (std::move (loaded)); currentProjectFile = juce::File(); audio.stop(); }
                showResult (result, "MIDI importado");
            }
            fileChooser.reset();
        });
}

void MainComponent::chooseMidiToExport()
{
    fileChooser = std::make_unique<juce::FileChooser> ("Exportar MIDI", juce::File(), "*.mid");
    fileChooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::warnAboutOverwriting,
        [this] (const juce::FileChooser& chooser)
        {
            auto file = chooser.getResult();
            if (file != juce::File())
            {
                if (! file.hasFileExtension ("mid")) file = file.withFileExtension ("mid");
                showResult (MidiFileIO::save (file, document.snapshot()), "MIDI exportado");
            }
            fileChooser.reset();
        });
}

void MainComponent::chooseAudioToExport()
{
    fileChooser = std::make_unique<juce::FileChooser> ("Exportar audio", juce::File(), "*.wav;*.flac;*.ogg;*.mp3");
    fileChooser->launchAsync (juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::warnAboutOverwriting,
        [this] (const juce::FileChooser& chooser)
        {
            auto file = chooser.getResult();
            if (file != juce::File())
            {
                if (! file.hasFileExtension ("wav;flac;ogg;mp3")) file = file.withFileExtension ("wav");
                statusLabel.setText ("Renderizando audio...", juce::dontSendNotification);
                showResult (audio.renderToAudioFile (file, document.snapshot()), "Audio exportado");
            }
            fileChooser.reset();
        });
}

void MainComponent::choosePluginToLoad()
{
    fileChooser = std::make_unique<juce::FileChooser> ("Selecionar instrumento VST3/AU", juce::File(), "*.vst3;*.component");
    fileChooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles
                              | juce::FileBrowserComponent::canSelectDirectories,
        [this] (const juce::FileChooser& chooser)
        {
            const auto file = chooser.getResult();
            if (file != juce::File())
            {
                statusLabel.setText ("Carregando instrumento...", juce::dontSendNotification);
                pluginWindow.reset();
                audio.loadPlugin (file, [this] (juce::Result result) { showResult (result, "Instrumento carregado"); });
            }
            fileChooser.reset();
        });
}

double MainComponent::selectedGrid() const
{
    switch (gridBox.getSelectedId())
    {
        case 1: return 1.0;
        case 2: return 0.5;
        case 4: return 0.125;
        case 5: return 1.0 / 3.0;
        default: return 0.25;
    }
}
}
