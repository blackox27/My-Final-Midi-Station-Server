#pragma once

#include "MidiDocument.h"
#include <juce_gui_basics/juce_gui_basics.h>

namespace pulseforge
{
class ScoreComponent final : public juce::Component
{
public:
    explicit ScoreComponent (MidiDocument&);
    void paint (juce::Graphics&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseWheelMove (const juce::MouseEvent&, const juce::MouseWheelDetails&) override;
    void setTool (Tool value) { tool = value; }
    void setSnapBeats (double value) { snapBeats = value; }
    void setPlayheadBeat (double value) { playheadBeat = value; repaint(); }

private:
    [[nodiscard]] float beatToX (double) const;
    [[nodiscard]] double xToBeat (float) const;
    [[nodiscard]] float pitchToY (int) const;
    [[nodiscard]] int yToPitch (float) const;
    [[nodiscard]] std::optional<Note> noteAt (juce::Point<float>) const;
    void drawStaff (juce::Graphics&, float centreY, bool treble, const Project&);

    MidiDocument& document;
    Tool tool { Tool::draw };
    double snapBeats { 0.25 };
    double startBeat {};
    double playheadBeat {};
    float pixelsPerBeat { 82.0f };
};
}
