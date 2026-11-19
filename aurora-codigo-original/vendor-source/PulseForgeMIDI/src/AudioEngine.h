#pragma once

#include "BuiltInSynth.h"
#include "CoreTypes.h"

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#include <atomic>
#include <functional>
#include <memory>

namespace pulseforge
{
class AudioEngine final : private juce::AudioIODeviceCallback,
                          private juce::MidiInputCallback
{
public:
    AudioEngine();
    ~AudioEngine() override;

    juce::Result initialise();
    void setProject (const Project&);
    void play();
    void pause();
    void stop();
    void setPositionBeats (double);
    [[nodiscard]] bool isPlaying() const noexcept { return playing.load(); }
    [[nodiscard]] double positionBeats() const noexcept;
    [[nodiscard]] double sampleRate() const noexcept { return currentSampleRate.load(); }

    void loadPlugin (const juce::File&, std::function<void(juce::Result)> completion);
    void unloadPlugin();
    [[nodiscard]] juce::String pluginName() const;
    [[nodiscard]] juce::AudioProcessor* pluginProcessor() const noexcept { return plugin.get(); }
    std::function<void()> onPluginChanged;

    juce::Result renderToAudioFile (const juce::File&, const Project&,
                                    std::function<void(double)> progress = {});

private:
    struct TimedEvent
    {
        double beat {};
        juce::MidiMessage message;
    };

    struct Timeline
    {
        double tempo { 120.0 };
        double lengthBeats { 64.0 };
        std::vector<TimedEvent> events;
    };

    static std::shared_ptr<const Timeline> makeTimeline (const Project&);
    static void addRangeToBuffer (const Timeline&, double startBeat, double endBeat,
                                  int numSamples, juce::MidiBuffer&);
    void renderBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&, int numSamples);
    void resetProcessorState();

    void audioDeviceIOCallbackWithContext (const float* const*, int,
                                           float* const*, int, int,
                                           const juce::AudioIODeviceCallbackContext&) override;
    void audioDeviceAboutToStart (juce::AudioIODevice*) override;
    void audioDeviceStopped() override;
    void handleIncomingMidiMessage (juce::MidiInput*, const juce::MidiMessage&) override;

    juce::AudioDeviceManager deviceManager;
    juce::MidiMessageCollector midiCollector;
    juce::AudioPluginFormatManager formatManager;
    BuiltInSynth builtInSynth;
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    mutable juce::CriticalSection processorLock;
    juce::AudioBuffer<float> scratchBuffer;

    std::atomic<std::shared_ptr<const Timeline>> timeline;
    std::atomic<bool> playing { false };
    std::atomic<std::int64_t> samplePosition { 0 };
    std::atomic<double> currentSampleRate { 48000.0 };
    std::atomic<int> currentBlockSize { 512 };
};
}
