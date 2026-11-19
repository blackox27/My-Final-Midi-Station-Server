#pragma once

#include "CoreTypes.h"
#include <juce_core/juce_core.h>

namespace pulseforge
{
class ProjectIO
{
public:
    static juce::Result load (const juce::File&, Project& destination);
    static juce::Result save (const juce::File&, const Project& source);
};
}
