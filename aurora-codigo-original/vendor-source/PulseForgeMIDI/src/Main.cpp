#include "MainComponent.h"
#include <juce_gui_extra/juce_gui_extra.h>

namespace pulseforge
{
class PulseForgeApplication final : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override { return "PulseForge MIDI"; }
    const juce::String getApplicationVersion() override { return "0.9.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise (const juce::String&) override
    {
        lookAndFeel.setColourScheme (juce::LookAndFeel_V4::getDarkColourScheme());
        juce::LookAndFeel::setDefaultLookAndFeel (&lookAndFeel);
        mainWindow = std::make_unique<MainWindow> (getApplicationName());
    }

    void shutdown() override
    {
        mainWindow.reset();
        juce::LookAndFeel::setDefaultLookAndFeel (nullptr);
    }
    void systemRequestedQuit() override { quit(); }
    void anotherInstanceStarted (const juce::String&) override {}

private:
    class MainWindow final : public juce::DocumentWindow
    {
    public:
        explicit MainWindow (const juce::String& name)
            : DocumentWindow (name, juce::Colour (0xff151820), DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (new MainComponent(), true);
            setResizable (true, true);
            setResizeLimits (1050, 650, 3840, 2160);
            centreWithSize (1440, 900);
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            juce::JUCEApplication::getInstance()->systemRequestedQuit();
        }
    };

    juce::LookAndFeel_V4 lookAndFeel;
    std::unique_ptr<MainWindow> mainWindow;
};
}

START_JUCE_APPLICATION (pulseforge::PulseForgeApplication)
