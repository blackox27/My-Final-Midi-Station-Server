#pragma once

#include <juce_audio_basics/juce_audio_basics.h>

namespace pulseforge
{
class BuiltInSynth
{
public:
    BuiltInSynth();
    void prepare (double sampleRate);
    void reset();
    void render (juce::AudioBuffer<float>&, juce::MidiBuffer&, int startSample, int numSamples);

private:
    juce::Synthesiser synthesiser;
};
}
