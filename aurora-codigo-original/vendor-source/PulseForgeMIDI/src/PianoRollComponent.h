#pragma once

#include "MidiDocument.h"
#include <juce_gui_basics/juce_gui_basics.h>

namespace pulseforge
{
class PianoRollComponent final : public juce::Component,
                                 private juce::ScrollBar::Listener
{
public:
    explicit PianoRollComponent (MidiDocument&);

    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;
    void mouseWheelMove (const juce::MouseEvent&, const juce::MouseWheelDetails&) override;
    bool keyPressed (const juce::KeyPress&) override;

    void setTool (Tool value) { tool = value; repaint(); }
    void setLane (LaneKind value) { lane = value; repaint(); }
    void setSnapBeats (double value) { snapBeats = std::max (1.0 / 64.0, value); }
    void setPlayheadBeat (double value) { playheadBeat = value; repaint(); }
    [[nodiscard]] double visibleStartBeat() const noexcept { return startBeat; }
    std::function<void(juce::String)> onStatus;
    std::function<void(double)> onSeek;

private:
    static constexpr float keyboardWidth = 72.0f;
    static constexpr float headerHeight = 28.0f;
    static constexpr float laneHeight = 142.0f;
    static constexpr float scrollSize = 14.0f;

    [[nodiscard]] juce::Rectangle<float> noteArea() const;
    [[nodiscard]] juce::Rectangle<float> automationArea() const;
    [[nodiscard]] float beatToX (double) const;
    [[nodiscard]] double xToBeat (float) const;
    [[nodiscard]] float pitchToY (int) const;
    [[nodiscard]] int yToPitch (float) const;
    [[nodiscard]] juce::Rectangle<float> noteRect (const Note&) const;
    [[nodiscard]] std::optional<Note> noteAt (juce::Point<float>) const;
    [[nodiscard]] std::optional<Id> closestVelocityNote (float x) const;
    void updateScrollBars();
    void editAutomationAt (juce::Point<float>, bool continuous);
    void showStatus (const juce::String&);
    void scrollBarMoved (juce::ScrollBar*, double newRangeStart) override;

    MidiDocument& document;
    juce::ScrollBar horizontal { false };
    juce::ScrollBar vertical { true };
    Tool tool { Tool::draw };
    LaneKind lane { LaneKind::velocity };
    double snapBeats { 0.25 };
    double startBeat {};
    double playheadBeat {};
    float pixelsPerBeat { 96.0f };
    float noteHeight { 17.0f };
    int topPitch { 84 };

    bool draggingNote {};
    bool resizingNote {};
    bool drawingNote {};
    bool marqueeActive {};
    bool transactionActive {};
    Id primaryDragId {};
    juce::Point<float> dragOrigin;
    juce::Rectangle<float> marquee;
    std::vector<Note> dragOriginalNotes;
};
}
