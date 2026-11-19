#include "PianoRollComponent.h"
#include "Quantizer.h"

namespace pulseforge
{
namespace
{
bool isBlackKey (int pitch)
{
    const auto pc = (pitch % 12 + 12) % 12;
    return pc == 1 || pc == 3 || pc == 6 || pc == 8 || pc == 10;
}

juce::String pitchName (int pitch)
{
    constexpr const char* names[] { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
    return juce::String (names[pitch % 12]) + juce::String (pitch / 12 - 1);
}
}

PianoRollComponent::PianoRollComponent (MidiDocument& owner) : document (owner)
{
    setWantsKeyboardFocus (true);
    setMouseClickGrabsKeyboardFocus (true);
    addAndMakeVisible (horizontal);
    addAndMakeVisible (vertical);
    horizontal.addListener (this);
    vertical.addListener (this);
}

juce::Rectangle<float> PianoRollComponent::noteArea() const
{
    return { keyboardWidth, headerHeight,
             std::max (0.0f, static_cast<float> (getWidth()) - keyboardWidth - scrollSize),
             std::max (0.0f, static_cast<float> (getHeight()) - headerHeight - laneHeight - scrollSize) };
}

juce::Rectangle<float> PianoRollComponent::automationArea() const
{
    const auto notes = noteArea();
    return { keyboardWidth, notes.getBottom(), notes.getWidth(), laneHeight };
}

float PianoRollComponent::beatToX (double beat) const
{
    return keyboardWidth + static_cast<float> (beat - startBeat) * pixelsPerBeat;
}

double PianoRollComponent::xToBeat (float x) const
{
    return startBeat + (x - keyboardWidth) / pixelsPerBeat;
}

float PianoRollComponent::pitchToY (int pitch) const
{
    return headerHeight + static_cast<float> (topPitch - pitch) * noteHeight;
}

int PianoRollComponent::yToPitch (float y) const
{
    return clampMidi7 (topPitch - static_cast<int> (std::floor ((y - headerHeight) / noteHeight)));
}

juce::Rectangle<float> PianoRollComponent::noteRect (const Note& note) const
{
    return { beatToX (note.startBeats), pitchToY (note.pitch),
             std::max (3.0f, static_cast<float> (note.lengthBeats) * pixelsPerBeat),
             noteHeight };
}

std::optional<Note> PianoRollComponent::noteAt (juce::Point<float> point) const
{
    const auto project = document.snapshot();
    const auto& notes = project.tracks[project.activeTrack].notes;
    for (auto it = notes.rbegin(); it != notes.rend(); ++it)
        if (noteRect (*it).expanded (1.0f).contains (point)) return *it;
    return std::nullopt;
}

std::optional<Id> PianoRollComponent::closestVelocityNote (float x) const
{
    const auto project = document.snapshot();
    const auto& notes = project.tracks[project.activeTrack].notes;
    float closest = 14.0f;
    std::optional<Id> result;
    for (const auto& note : notes)
    {
        const auto distance = std::abs (beatToX (note.startBeats + note.lengthBeats * 0.5) - x);
        if (distance < closest) { closest = distance; result = note.id; }
    }
    return result;
}

void PianoRollComponent::paint (juce::Graphics& g)
{
    const auto project = document.snapshot();
    const auto& track = project.tracks[project.activeTrack];
    const auto notes = noteArea();
    const auto automation = automationArea();
    g.fillAll (juce::Colour (0xff11131a));

    g.setColour (juce::Colour (0xff171a23));
    g.fillRect (0.0f, 0.0f, keyboardWidth, static_cast<float> (getHeight()));
    g.setColour (juce::Colour (0xff1c202b));
    g.fillRect (notes.withY (0.0f).withHeight (headerHeight));

    g.saveState();
    g.reduceClipRegion (notes.toNearestInt());
    const auto firstPitch = yToPitch (notes.getBottom());
    for (int pitch = firstPitch; pitch <= topPitch; ++pitch)
    {
        const auto y = pitchToY (pitch);
        g.setColour (isBlackKey (pitch) ? juce::Colour (0xff151820) : juce::Colour (0xff1a1e28));
        g.fillRect (notes.getX(), y, notes.getWidth(), noteHeight);
        g.setColour (juce::Colour (0xff272c38));
        g.drawHorizontalLine (juce::roundToInt (y + noteHeight), notes.getX(), notes.getRight());
    }

    const auto firstGrid = static_cast<int> (std::floor (startBeat / snapBeats));
    const auto lastBeat = xToBeat (notes.getRight());
    for (int step = firstGrid; step <= static_cast<int> (std::ceil (lastBeat / snapBeats)); ++step)
    {
        const auto beat = step * snapBeats;
        const auto x = beatToX (beat);
        const auto isBar = std::fmod (std::abs (beat), project.timeSignatureNumerator) < 1.0e-6;
        const auto isBeat = std::fmod (std::abs (beat), 1.0) < 1.0e-6;
        g.setColour (isBar ? juce::Colour (0xff525a70)
                           : isBeat ? juce::Colour (0xff343a49) : juce::Colour (0xff252a35));
        g.drawVerticalLine (juce::roundToInt (x), notes.getY(), notes.getBottom());
    }

    for (const auto& note : track.notes)
    {
        auto rect = noteRect (note).reduced (1.0f, 1.5f);
        if (! rect.intersects (notes)) continue;
        auto colour = juce::Colour (track.colour);
        if (! note.selected) colour = colour.withMultipliedBrightness (0.78f);
        g.setColour (colour);
        g.fillRoundedRectangle (rect, 3.0f);
        g.setColour (note.selected ? juce::Colours::white.withAlpha (0.9f)
                                   : juce::Colours::black.withAlpha (0.45f));
        g.drawRoundedRectangle (rect, 3.0f, note.selected ? 1.5f : 1.0f);
        if (rect.getWidth() > 45.0f)
        {
            g.setFont (11.0f);
            g.drawText (pitchName (note.pitch), rect.reduced (5.0f, 0.0f), juce::Justification::centredLeft, false);
        }
        if (note.glideSemitones != 0)
        {
            juce::Path glide;
            glide.startNewSubPath (rect.getX() + 3.0f, rect.getCentreY());
            glide.cubicTo (rect.getCentreX(), rect.getCentreY(), rect.getCentreX(),
                           rect.getCentreY() - note.glideSemitones * 1.5f,
                           rect.getRight() - 3.0f, rect.getCentreY() - note.glideSemitones * 1.5f);
            g.setColour (juce::Colours::white.withAlpha (0.72f));
            g.strokePath (glide, juce::PathStrokeType (1.4f));
        }
    }
    g.restoreState();

    // Piano keyboard.
    g.saveState();
    g.reduceClipRegion ({ 0, juce::roundToInt (headerHeight), juce::roundToInt (keyboardWidth),
                          juce::roundToInt (notes.getHeight()) });
    for (int pitch = firstPitch; pitch <= topPitch; ++pitch)
    {
        const auto y = pitchToY (pitch);
        g.setColour (isBlackKey (pitch) ? juce::Colour (0xff292d38) : juce::Colour (0xffe8eaf0));
        const auto width = isBlackKey (pitch) ? keyboardWidth * 0.65f : keyboardWidth;
        g.fillRect (0.0f, y, width, noteHeight);
        g.setColour (juce::Colour (0xff0d0f14));
        g.drawRect (0.0f, y, width, noteHeight, 0.7f);
        if (pitch % 12 == 0)
        {
            g.setColour (juce::Colour (0xff3b4050));
            g.setFont (10.0f);
            g.drawText (pitchName (pitch), 4.0f, y, keyboardWidth - 7.0f, noteHeight,
                        juce::Justification::centredRight, false);
        }
    }
    g.restoreState();

    // Timeline labels.
    g.setFont (11.0f);
    for (int beat = static_cast<int> (std::floor (startBeat)); beat <= static_cast<int> (std::ceil (xToBeat (notes.getRight()))); ++beat)
    {
        if (beat < 0) continue;
        const auto x = beatToX (beat);
        if (beat % project.timeSignatureNumerator == 0)
        {
            g.setColour (juce::Colour (0xffb9c0d4));
            g.drawText (juce::String (beat / project.timeSignatureNumerator + 1), x + 4.0f, 0.0f,
                        40.0f, headerHeight, juce::Justification::centredLeft, false);
        }
    }

    // Velocity / automation lane.
    g.setColour (juce::Colour (0xff131720));
    g.fillRect (automation);
    g.setColour (juce::Colour (0xff2d3341));
    g.drawRect (automation, 1.0f);
    const juce::String laneName = lane == LaneKind::velocity ? "VELOCIDADE"
        : lane == LaneKind::modulation ? "CC1 MODULACAO"
        : lane == LaneKind::volume ? "CC7 VOLUME"
        : lane == LaneKind::pan ? "CC10 PAN"
        : lane == LaneKind::expression ? "CC11 EXPRESSAO"
        : lane == LaneKind::sustain ? "CC64 SUSTAIN" : "PITCH BEND";
    g.setColour (juce::Colour (0xff7e879e));
    g.setFont (10.0f);
    g.drawText (laneName, automation.reduced (8.0f).withHeight (16.0f), juce::Justification::topLeft, false);
    g.setColour (juce::Colour (0xff282e3b));
    g.drawHorizontalLine (juce::roundToInt (automation.getCentreY()), automation.getX(), automation.getRight());

    if (lane == LaneKind::velocity)
    {
        for (const auto& note : track.notes)
        {
            const auto x = beatToX (note.startBeats + note.lengthBeats * 0.5);
            const auto height = (automation.getHeight() - 22.0f) * note.velocity / 127.0f;
            g.setColour (juce::Colour (track.colour).withAlpha (note.selected ? 1.0f : 0.68f));
            g.fillRoundedRectangle (x - 3.0f, automation.getBottom() - height - 2.0f, 6.0f, height, 2.0f);
        }
    }
    else
    {
        std::vector<AutomationPoint> points;
        for (const auto& point : track.automation) if (point.lane == lane) points.push_back (point);
        std::sort (points.begin(), points.end(), [] (const auto& a, const auto& b) { return a.beat < b.beat; });
        juce::Path curve;
        for (std::size_t i = 0; i < points.size(); ++i)
        {
            const auto x = beatToX (points[i].beat);
            const auto y = automation.getBottom() - 4.0f - static_cast<float> (points[i].value) * (automation.getHeight() - 22.0f);
            if (i == 0) curve.startNewSubPath (x, y); else curve.lineTo (x, y);
        }
        g.setColour (juce::Colour (track.colour));
        g.strokePath (curve, juce::PathStrokeType (2.0f));
        for (const auto& point : points)
        {
            const auto x = beatToX (point.beat);
            const auto y = automation.getBottom() - 4.0f - static_cast<float> (point.value) * (automation.getHeight() - 22.0f);
            g.fillEllipse (x - 4.0f, y - 4.0f, 8.0f, 8.0f);
        }
    }

    if (marqueeActive)
    {
        g.setColour (juce::Colour (0x337c83ff));
        g.fillRect (marquee);
        g.setColour (juce::Colour (0xff9ca2ff));
        g.drawRect (marquee, 1.0f);
    }

    const auto playheadX = beatToX (playheadBeat);
    if (playheadX >= keyboardWidth && playheadX <= notes.getRight())
    {
        g.setColour (juce::Colour (0xffff5f7a));
        g.drawVerticalLine (juce::roundToInt (playheadX), 0.0f, automation.getBottom());
        juce::Path marker;
        marker.addTriangle (playheadX - 5.0f, 0.0f, playheadX + 5.0f, 0.0f, playheadX, 7.0f);
        g.fillPath (marker);
    }
}

void PianoRollComponent::resized()
{
    horizontal.setBounds (juce::roundToInt (keyboardWidth), getHeight() - juce::roundToInt (scrollSize),
                          getWidth() - juce::roundToInt (keyboardWidth + scrollSize), juce::roundToInt (scrollSize));
    vertical.setBounds (getWidth() - juce::roundToInt (scrollSize), juce::roundToInt (headerHeight),
                        juce::roundToInt (scrollSize), juce::roundToInt (noteArea().getHeight()));
    updateScrollBars();
}

void PianoRollComponent::updateScrollBars()
{
    const auto project = document.snapshot();
    const auto visibleBeats = static_cast<double> (noteArea().getWidth() / pixelsPerBeat);
    horizontal.setRangeLimits (0.0, std::max (project.lengthBeats, visibleBeats));
    horizontal.setCurrentRange (startBeat, visibleBeats, juce::dontSendNotification);
    const auto visiblePitches = std::max (1.0, static_cast<double> (noteArea().getHeight() / noteHeight));
    vertical.setRangeLimits (0.0, 128.0);
    vertical.setCurrentRange (127 - topPitch, std::min (128.0, visiblePitches), juce::dontSendNotification);
}

void PianoRollComponent::mouseDown (const juce::MouseEvent& event)
{
    grabKeyboardFocus();
    dragOrigin = event.position;
    const auto point = event.position;

    if (point.y < headerHeight && point.x >= keyboardWidth)
    {
        if (onSeek) onSeek (std::max (0.0, xToBeat (point.x)));
        return;
    }

    if (automationArea().contains (point))
    {
        document.beginTransaction (lane == LaneKind::velocity ? "Alterar velocidade" : "Desenhar automacao");
        transactionActive = true;
        editAutomationAt (point, false);
        return;
    }
    if (! noteArea().contains (point)) return;

    const auto hit = noteAt (point);
    if (tool == Tool::erase)
    {
        if (hit)
        {
            document.beginTransaction ("Apagar nota");
            document.removeNote (hit->id);
            document.commitTransaction();
        }
        return;
    }

    if (tool == Tool::draw)
    {
        document.beginTransaction ("Desenhar nota");
        transactionActive = true;
        const auto beat = Quantizer::snap (xToBeat (point.x), snapBeats);
        const auto created = document.addNote (beat, snapBeats, yToPitch (point.y));
        document.selectOnly (created.id);
        primaryDragId = created.id;
        drawingNote = true;
        showStatus (pitchName (created.pitch) + "  |  " + juce::String (created.startBeats, 2) + " tempos");
        return;
    }

    if (hit)
    {
        if (event.mods.isCommandDown()) document.setSelected (hit->id, ! hit->selected, false);
        else if (! hit->selected) document.selectOnly (hit->id);
        document.beginTransaction ("Mover/redimensionar notas");
        transactionActive = true;
        primaryDragId = hit->id;
        resizingNote = point.x > noteRect (*hit).getRight() - 8.0f;
        draggingNote = ! resizingNote;
        const auto project = document.snapshot();
        for (const auto& note : project.tracks[project.activeTrack].notes)
            if (note.selected) dragOriginalNotes.push_back (note);
    }
    else
    {
        if (! event.mods.isShiftDown()) document.clearSelection();
        marqueeActive = true;
        marquee = { point.x, point.y, 0.0f, 0.0f };
    }
}

void PianoRollComponent::mouseDrag (const juce::MouseEvent& event)
{
    const auto point = event.position;
    if (automationArea().contains (point) && transactionActive && ! draggingNote && ! resizingNote && ! drawingNote)
    {
        editAutomationAt (point, true);
        return;
    }

    if (drawingNote)
    {
        const auto end = Quantizer::snap (xToBeat (point.x), snapBeats);
        const auto project = document.snapshot();
        for (const auto& note : project.tracks[project.activeTrack].notes)
            if (note.id == primaryDragId)
                document.updateNote (primaryDragId, [end, start = note.startBeats, snap = snapBeats] (Note& edited)
                {
                    edited.lengthBeats = std::max (snap, end - start + snap);
                });
        return;
    }

    if (draggingNote || resizingNote)
    {
        const auto rawDelta = (point.x - dragOrigin.x) / pixelsPerBeat;
        const auto pitchDelta = juce::roundToInt ((dragOrigin.y - point.y) / noteHeight);
        for (const auto& original : dragOriginalNotes)
        {
            document.updateNote (original.id, [this, original, rawDelta, pitchDelta] (Note& note)
            {
                if (resizingNote)
                    note.lengthBeats = std::max (snapBeats,
                        Quantizer::snap (original.lengthBeats + rawDelta, snapBeats));
                else
                {
                    note.startBeats = Quantizer::snap (std::max (0.0, original.startBeats + rawDelta), snapBeats);
                    note.pitch = clampMidi7 (original.pitch + pitchDelta);
                }
            });
        }
        return;
    }

    if (marqueeActive)
    {
        marquee = juce::Rectangle<float>::leftTopRightBottom (
            std::min (dragOrigin.x, point.x), std::min (dragOrigin.y, point.y),
            std::max (dragOrigin.x, point.x), std::max (dragOrigin.y, point.y));
        repaint();
    }
}

void PianoRollComponent::mouseUp (const juce::MouseEvent& event)
{
    if (marqueeActive)
    {
        document.selectInRange (xToBeat (marquee.getX()), xToBeat (marquee.getRight()),
                                yToPitch (marquee.getBottom()), yToPitch (marquee.getY()),
                                event.mods.isShiftDown());
    }
    if (transactionActive) document.commitTransaction();
    draggingNote = resizingNote = drawingNote = marqueeActive = transactionActive = false;
    primaryDragId = 0;
    dragOriginalNotes.clear();
    repaint();
}

void PianoRollComponent::editAutomationAt (juce::Point<float> point, bool continuous)
{
    const auto area = automationArea();
    const auto value = clampUnit ((area.getBottom() - point.y - 3.0f) / (area.getHeight() - 22.0f));
    if (lane == LaneKind::velocity)
    {
        if (const auto id = closestVelocityNote (point.x))
            document.setVelocity (*id, juce::roundToInt (value * 127.0));
    }
    else
    {
        const auto beat = Quantizer::snap (xToBeat (point.x), continuous ? snapBeats * 0.5 : snapBeats);
        (void) document.addAutomationPoint (lane, beat, value);
    }
    showStatus ((lane == LaneKind::velocity ? "Velocidade: " : "Valor: ")
                + juce::String (juce::roundToInt (value * (lane == LaneKind::pitchBend ? 16383.0 : 127.0))));
}

void PianoRollComponent::mouseWheelMove (const juce::MouseEvent& event, const juce::MouseWheelDetails& wheel)
{
    if (event.mods.isCommandDown())
    {
        const auto anchorBeat = xToBeat (event.position.x);
        pixelsPerBeat = std::clamp (pixelsPerBeat * (1.0f + wheel.deltaY * 0.65f), 24.0f, 420.0f);
        startBeat = std::max (0.0, anchorBeat - (event.position.x - keyboardWidth) / pixelsPerBeat);
    }
    else if (event.mods.isAltDown())
        noteHeight = std::clamp (noteHeight * (1.0f + wheel.deltaY * 0.5f), 8.0f, 34.0f);
    else if (event.mods.isShiftDown())
        startBeat = std::max (0.0, startBeat - wheel.deltaY * noteArea().getWidth() / pixelsPerBeat * 0.2);
    else
        topPitch = std::clamp (topPitch + juce::roundToInt (wheel.deltaY * 8.0f), 12, 127);
    updateScrollBars();
    repaint();
}

bool PianoRollComponent::keyPressed (const juce::KeyPress& key)
{
    const auto command = key.getModifiers().isCommandDown();
    if (key == juce::KeyPress::deleteKey || key == juce::KeyPress::backspaceKey)
    {
        document.beginTransaction ("Apagar selecao"); document.removeSelected(); document.commitTransaction(); return true;
    }
    if (command && key.getKeyCode() == 'C') { document.copySelected(); return true; }
    if (command && key.getKeyCode() == 'X')
    { document.beginTransaction ("Recortar"); document.cutSelected(); document.commitTransaction(); return true; }
    if (command && key.getKeyCode() == 'V')
    { document.beginTransaction ("Colar"); document.pasteAt (playheadBeat); document.commitTransaction(); return true; }
    if (command && key.getKeyCode() == 'D')
    { document.beginTransaction ("Duplicar"); document.duplicateSelected (snapBeats); document.commitTransaction(); return true; }
    if (command && key.getKeyCode() == 'Z' && key.getModifiers().isShiftDown()) { document.redo(); return true; }
    if (command && key.getKeyCode() == 'Z') { document.undo(); return true; }
    return false;
}

void PianoRollComponent::showStatus (const juce::String& text)
{
    if (onStatus) onStatus (text);
}

void PianoRollComponent::scrollBarMoved (juce::ScrollBar* bar, double newRangeStart)
{
    if (bar == &horizontal) startBeat = newRangeStart;
    else if (bar == &vertical) topPitch = 127 - juce::roundToInt (newRangeStart);
    repaint();
}
}
