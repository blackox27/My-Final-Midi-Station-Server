#pragma once

#include "CoreTypes.h"
#include <juce_audio_basics/juce_audio_basics.h>

namespace pulseforge
{
class MidiFileIO
{
public:
    static juce::Result load (const juce::File&, Project& destination);
    static juce::Result save (const juce::File&, const Project& source);
};
}
