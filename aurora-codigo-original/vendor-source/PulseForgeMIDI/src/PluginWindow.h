#pragma once

#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_audio_processors/juce_audio_processors.h>

namespace pulseforge
{
class PluginWindow final : public juce::DocumentWindow
{
public:
    explicit PluginWindow (juce::AudioProcessor& processor)
        : juce::DocumentWindow (processor.getName(), juce::Colour (0xff151820),
                                juce::DocumentWindow::closeButton)
    {
        setUsingNativeTitleBar (true);
        if (auto* editor = processor.createEditorAndMakeActive())
        {
            setContentOwned (editor, true);
            centreWithSize (editor->getWidth(), editor->getHeight());
        }
        else
        {
            auto* generic = new juce::GenericAudioProcessorEditor (processor);
            setContentOwned (generic, true);
            centreWithSize (generic->getWidth(), std::min (generic->getHeight(), 720));
        }
        setResizable (true, false);
    }

    void closeButtonPressed() override { setVisible (false); }
};
}
