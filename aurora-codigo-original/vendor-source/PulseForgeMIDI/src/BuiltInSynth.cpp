#include "BuiltInSynth.h"

#include <cmath>

namespace pulseforge
{
namespace
{
class ForgeSound final : public juce::SynthesiserSound
{
public:
    bool appliesToNote (int) override { return true; }
    bool appliesToChannel (int) override { return true; }
};

class ForgeVoice final : public juce::SynthesiserVoice
{
public:
    bool canPlaySound (juce::SynthesiserSound* sound) override
    {
        return dynamic_cast<ForgeSound*> (sound) != nullptr;
    }

    void startNote (int midiNoteNumber, float velocity, juce::SynthesiserSound*, int pitchWheel) override
    {
        level = velocity * 0.16;
        baseNote = static_cast<double> (midiNoteNumber);
        pitchWheelMoved (pitchWheel);
        phase = 0.0;
        envelope.setParameters ({ 0.008f, 0.08f, 0.72f, 0.18f });
        envelope.noteOn();
    }

    void stopNote (float, bool allowTailOff) override
    {
        if (allowTailOff)
            envelope.noteOff();
        else
        {
            envelope.reset();
            clearCurrentNote();
        }
    }

    void pitchWheelMoved (int value) override
    {
        const auto bendSemitones = (static_cast<double> (value) - 8192.0) / 8192.0 * 2.0;
        const auto frequency = 440.0 * std::pow (2.0, (baseNote + bendSemitones - 69.0) / 12.0);
        phaseDelta = juce::MathConstants<double>::twoPi * frequency / getSampleRate();
    }

    void controllerMoved (int, int) override {}

    void renderNextBlock (juce::AudioBuffer<float>& output, int startSample, int numSamples) override
    {
        if (! isVoiceActive()) return;
        while (--numSamples >= 0)
        {
            const auto fundamental = std::sin (phase);
            const auto harmonic = std::sin (phase * 2.0) * 0.22;
            const auto sample = static_cast<float> ((fundamental + harmonic) * level
                                                     * envelope.getNextSample());
            for (int channel = 0; channel < output.getNumChannels(); ++channel)
                output.addSample (channel, startSample, sample);
            phase += phaseDelta;
            if (phase >= juce::MathConstants<double>::twoPi)
                phase -= juce::MathConstants<double>::twoPi;
            ++startSample;
        }
        if (! envelope.isActive()) clearCurrentNote();
    }

private:
    double phase {};
    double phaseDelta {};
    double baseNote { 60.0 };
    double level {};
    juce::ADSR envelope;
};
}

BuiltInSynth::BuiltInSynth()
{
    synthesiser.clearVoices();
    for (int voice = 0; voice < 32; ++voice)
        synthesiser.addVoice (new ForgeVoice());
    synthesiser.clearSounds();
    synthesiser.addSound (new ForgeSound());
}

void BuiltInSynth::prepare (double sampleRate)
{
    synthesiser.setCurrentPlaybackSampleRate (sampleRate);
}

void BuiltInSynth::reset()
{
    synthesiser.allNotesOff (0, false);
}

void BuiltInSynth::render (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi,
                           int startSample, int numSamples)
{
    synthesiser.renderNextBlock (buffer, midi, startSample, numSamples);
}
}
