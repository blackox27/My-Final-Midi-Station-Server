#include "ScoreComponent.h"
#include "Quantizer.h"

namespace pulseforge
{
ScoreComponent::ScoreComponent (MidiDocument& owner) : document (owner)
{
    setWantsKeyboardFocus (true);
}

float ScoreComponent::beatToX (double beat) const { return 88.0f + static_cast<float> (beat - startBeat) * pixelsPerBeat; }
double ScoreComponent::xToBeat (float x) const { return startBeat + (x - 88.0f) / pixelsPerBeat; }

float ScoreComponent::pitchToY (int pitch) const
{
    const auto split = pitch >= 60;
    const auto centre = split ? getHeight() * 0.32f : getHeight() * 0.70f;
    const auto referencePitch = split ? 71 : 50;
    return centre - (pitch - referencePitch) * 4.0f;
}

int ScoreComponent::yToPitch (float y) const
{
    const auto split = y < getHeight() * 0.51f;
    const auto centre = split ? getHeight() * 0.32f : getHeight() * 0.70f;
    const auto referencePitch = split ? 71 : 50;
    return clampMidi7 (referencePitch + juce::roundToInt ((centre - y) / 4.0f));
}

std::optional<Note> ScoreComponent::noteAt (juce::Point<float> point) const
{
    const auto project = document.snapshot();
    for (const auto& note : project.tracks[project.activeTrack].notes)
    {
        const juce::Rectangle<float> hit (beatToX (note.startBeats) - 8.0f, pitchToY (note.pitch) - 7.0f,
                                          std::max (16.0f, static_cast<float> (note.lengthBeats) * pixelsPerBeat), 15.0f);
        if (hit.contains (point)) return note;
    }
    return std::nullopt;
}

void ScoreComponent::drawStaff (juce::Graphics& g, float centreY, bool treble, const Project& project)
{
    constexpr float spacing = 13.0f;
    g.setColour (juce::Colour (0xff9aa3b8));
    for (int line = -2; line <= 2; ++line)
        g.drawHorizontalLine (juce::roundToInt (centreY + line * spacing), 54.0f, static_cast<float> (getWidth() - 14));
    g.setColour (juce::Colour (0xffd9deea));
    g.setFont (treble ? 48.0f : 38.0f);
    g.drawText (treble ? juce::String::charToString (0x1d11e) : juce::String::charToString (0x1d122),
                12.0f, centreY - 48.0f, 40.0f, 96.0f, juce::Justification::centred, false);
    g.setFont (15.0f);
    g.drawText (juce::String (project.timeSignatureNumerator) + "\n" + juce::String (project.timeSignatureDenominator),
                55.0f, centreY - 30.0f, 25.0f, 60.0f, juce::Justification::centred, false);
}

void ScoreComponent::paint (juce::Graphics& g)
{
    const auto project = document.snapshot();
    const auto& track = project.tracks[project.activeTrack];
    g.fillAll (juce::Colour (0xfff3f0e8));
    const auto trebleY = getHeight() * 0.32f;
    const auto bassY = getHeight() * 0.70f;
    drawStaff (g, trebleY, true, project);
    drawStaff (g, bassY, false, project);

    const auto visibleEnd = xToBeat (static_cast<float> (getWidth()));
    for (double beat = std::floor (startBeat / project.timeSignatureNumerator) * project.timeSignatureNumerator;
         beat <= visibleEnd; beat += project.timeSignatureNumerator)
    {
        const auto x = beatToX (beat);
        g.setColour (juce::Colour (0xff747b8a));
        g.drawVerticalLine (juce::roundToInt (x), trebleY - 26.0f, trebleY + 26.0f);
        g.drawVerticalLine (juce::roundToInt (x), bassY - 26.0f, bassY + 26.0f);
        g.setColour (juce::Colour (0xff575d69));
        g.setFont (11.0f);
        g.drawText (juce::String (juce::roundToInt (beat / project.timeSignatureNumerator) + 1),
                    x + 4.0f, 10.0f, 32.0f, 18.0f, juce::Justification::centredLeft, false);
    }

    for (const auto& note : track.notes)
    {
        const auto x = beatToX (note.startBeats);
        if (x < 75.0f || x > getWidth() + 20.0f) continue;
        const auto y = pitchToY (note.pitch);
        g.setColour (note.selected ? juce::Colour (0xff6658e8) : juce::Colour (0xff171923));
        g.fillEllipse (x - 7.5f, y - 5.0f, 15.0f, 10.0f);
        const auto stemUp = note.pitch < (note.pitch >= 60 ? 71 : 50);
        g.drawLine (stemUp ? x + 6.5f : x - 6.5f, y,
                    stemUp ? x + 6.5f : x - 6.5f, y + (stemUp ? -34.0f : 34.0f), 1.6f);
        if (note.lengthBeats <= 0.5)
            g.drawLine (stemUp ? x + 6.5f : x - 6.5f, y + (stemUp ? -34.0f : 34.0f),
                        stemUp ? x + 18.0f : x - 18.0f, y + (stemUp ? -27.0f : 27.0f), 2.0f);

        // Duration ribbon makes exact MIDI length editable/visible alongside notation.
        g.setColour (juce::Colour (track.colour).withAlpha (0.28f));
        g.fillRoundedRectangle (x + 9.0f, y - 2.0f,
                                std::max (4.0f, static_cast<float> (note.lengthBeats) * pixelsPerBeat - 12.0f),
                                4.0f, 2.0f);
    }

    const auto playheadX = beatToX (playheadBeat);
    if (playheadX >= 82.0f && playheadX <= getWidth())
    {
        g.setColour (juce::Colour (0xffff4f68));
        g.drawVerticalLine (juce::roundToInt (playheadX), 24.0f, static_cast<float> (getHeight() - 24));
    }

    g.setColour (juce::Colour (0xff656b78));
    g.setFont (12.0f);
    g.drawText ("Clique para escrever notas. Ctrl + roda: zoom | Shift + roda: navegar",
                14, getHeight() - 28, getWidth() - 28, 18, juce::Justification::centredLeft, false);
}

void ScoreComponent::mouseDown (const juce::MouseEvent& event)
{
    if (event.position.x < 82.0f) return;
    const auto hit = noteAt (event.position);
    if (tool == Tool::erase)
    {
        if (hit) { document.beginTransaction ("Apagar nota na partitura"); document.removeNote (hit->id); document.commitTransaction(); }
        return;
    }
    if (tool == Tool::select)
    {
        if (hit) document.selectOnly (hit->id); else document.clearSelection();
        return;
    }
    document.beginTransaction ("Escrever nota na partitura");
    const auto created = document.addNote (Quantizer::snap (xToBeat (event.position.x), snapBeats),
                                           snapBeats, yToPitch (event.position.y));
    document.selectOnly (created.id);
    document.commitTransaction();
}

void ScoreComponent::mouseWheelMove (const juce::MouseEvent& event, const juce::MouseWheelDetails& wheel)
{
    if (event.mods.isCommandDown())
    {
        const auto anchor = xToBeat (event.position.x);
        pixelsPerBeat = std::clamp (pixelsPerBeat * (1.0f + wheel.deltaY * 0.6f), 28.0f, 260.0f);
        startBeat = std::max (0.0, anchor - (event.position.x - 88.0f) / pixelsPerBeat);
    }
    else
        startBeat = std::max (0.0, startBeat - (wheel.deltaX + wheel.deltaY) * 5.0);
    repaint();
}
}
