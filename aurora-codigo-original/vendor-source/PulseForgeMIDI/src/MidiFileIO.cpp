#include "MidiFileIO.h"

#include <map>

namespace pulseforge
{
namespace
{
double ticksToBeats (double ticks, int timeFormat)
{
    return timeFormat > 0 ? ticks / static_cast<double> (timeFormat) : 0.0;
}

double beatsToTicks (double beats, int ppq)
{
    return std::round (beats * static_cast<double> (ppq));
}

LaneKind laneForController (int controller)
{
    switch (controller)
    {
        case 1: return LaneKind::modulation;
        case 7: return LaneKind::volume;
        case 10: return LaneKind::pan;
        case 11: return LaneKind::expression;
        case 64: return LaneKind::sustain;
        default: return LaneKind::modulation;
    }
}

bool isSupportedController (int controller)
{
    return controller == 1 || controller == 7 || controller == 10
        || controller == 11 || controller == 64;
}
}

juce::Result MidiFileIO::load (const juce::File& file, Project& destination)
{
    juce::FileInputStream input (file);
    if (! input.openedOk())
        return juce::Result::fail ("Nao foi possivel abrir o arquivo MIDI.");

    juce::MidiFile midi;
    if (! midi.readFrom (input))
        return juce::Result::fail ("O arquivo nao contem dados MIDI validos.");

    const auto timeFormat = midi.getTimeFormat();
    if (timeFormat <= 0)
        return juce::Result::fail ("MIDI com timecode SMPTE ainda nao e suportado; use PPQ.");

    Project result;
    result.title = file.getFileNameWithoutExtension().toStdString();
    result.ppq = timeFormat;
    result.tracks.clear();
    result.lengthBeats = 16.0;
    Id nextId = 1;

    for (int trackIndex = 0; trackIndex < midi.getNumTracks(); ++trackIndex)
    {
        const auto* original = midi.getTrack (trackIndex);
        if (original == nullptr) continue;

        juce::MidiMessageSequence sequence (*original);
        sequence.updateMatchedPairs();

        Track track;
        track.id = nextId++;
        track.name = "Pista " + std::to_string (trackIndex + 1);
        track.channel = std::min (16, trackIndex + 1);
        constexpr std::uint32_t colours[] { 0xff7667ff, 0xff2fc7a0, 0xffffa24c, 0xffff5f7a, 0xff39a9ff };
        track.colour = colours[trackIndex % 5];

        for (int eventIndex = 0; eventIndex < sequence.getNumEvents(); ++eventIndex)
        {
            const auto* holder = sequence.getEventPointer (eventIndex);
            if (holder == nullptr) continue;
            const auto& message = holder->message;

            if (message.isTrackNameEvent())
                track.name = message.getTextFromTextMetaEvent().toStdString();
            else if (message.isTempoMetaEvent() && message.getTempoSecondsPerQuarterNote() > 0.0)
                result.tempo = 60.0 / message.getTempoSecondsPerQuarterNote();
            else if (message.isTimeSignatureMetaEvent())
                message.getTimeSignatureInfo (result.timeSignatureNumerator,
                                              result.timeSignatureDenominator);
            else if (message.isNoteOn() && holder->noteOffObject != nullptr)
            {
                Note note;
                note.id = nextId++;
                note.startBeats = ticksToBeats (message.getTimeStamp(), timeFormat);
                note.lengthBeats = std::max (1.0 / 64.0,
                    ticksToBeats (holder->noteOffObject->message.getTimeStamp(), timeFormat) - note.startBeats);
                note.pitch = message.getNoteNumber();
                note.velocity = std::max (1, juce::roundToInt (message.getFloatVelocity() * 127.0f));
                note.channel = message.getChannel();
                track.channel = note.channel;
                track.notes.push_back (note);
                result.lengthBeats = std::max (result.lengthBeats, note.endBeats() + 4.0);
            }
            else if (message.isController() && isSupportedController (message.getControllerNumber()))
            {
                AutomationPoint point;
                point.id = nextId++;
                point.beat = ticksToBeats (message.getTimeStamp(), timeFormat);
                point.value = message.getControllerValue() / 127.0;
                point.lane = laneForController (message.getControllerNumber());
                point.channel = message.getChannel();
                track.automation.push_back (point);
            }
            else if (message.isPitchWheel())
            {
                AutomationPoint point;
                point.id = nextId++;
                point.beat = ticksToBeats (message.getTimeStamp(), timeFormat);
                point.value = message.getPitchWheelValue() / 16383.0;
                point.lane = LaneKind::pitchBend;
                point.channel = message.getChannel();
                track.automation.push_back (point);
            }
        }

        if (! track.notes.empty() || ! track.automation.empty() || midi.getNumTracks() == 1)
            result.tracks.push_back (std::move (track));
    }

    if (result.tracks.empty())
    {
        Track track;
        track.id = nextId++;
        result.tracks.push_back (std::move (track));
    }
    result.activeTrack = 0;
    destination = std::move (result);
    return juce::Result::ok();
}

juce::Result MidiFileIO::save (const juce::File& file, const Project& source)
{
    juce::MidiFile midi;
    midi.setTicksPerQuarterNote (source.ppq);

    juce::MidiMessageSequence metadata;
    auto tempo = juce::MidiMessage::tempoMetaEvent (
        juce::roundToInt (60'000'000.0 / std::clamp (source.tempo, 20.0, 400.0)));
    tempo.setTimeStamp (0.0);
    metadata.addEvent (tempo);
    auto timeSignature = juce::MidiMessage::timeSignatureMetaEvent (
        source.timeSignatureNumerator, source.timeSignatureDenominator);
    timeSignature.setTimeStamp (0.0);
    metadata.addEvent (timeSignature);
    metadata.addEvent (juce::MidiMessage::endOfTrack(), beatsToTicks (source.lengthBeats, source.ppq));
    midi.addTrack (metadata);

    for (const auto& track : source.tracks)
    {
        juce::MidiMessageSequence sequence;
        auto name = juce::MidiMessage::textMetaEvent (3, juce::String (track.name));
        name.setTimeStamp (0.0);
        sequence.addEvent (name);

        for (const auto& note : track.notes)
        {
            auto noteOn = juce::MidiMessage::noteOn (clampChannel (note.channel),
                                                     clampMidi7 (note.pitch),
                                                     static_cast<juce::uint8> (std::max (1, clampMidi7 (note.velocity))));
            noteOn.setTimeStamp (beatsToTicks (note.startBeats, source.ppq));
            sequence.addEvent (noteOn);

            auto noteOff = juce::MidiMessage::noteOff (clampChannel (note.channel), clampMidi7 (note.pitch));
            noteOff.setTimeStamp (beatsToTicks (note.endBeats(), source.ppq));
            sequence.addEvent (noteOff);

            if (note.glideSemitones != 0 && note.glideBeats > 0.0)
            {
                constexpr int bendRangeSemitones = 2;
                const auto target = std::clamp (8192 + note.glideSemitones * 8192 / bendRangeSemitones,
                                                0, 16383);
                constexpr int steps = 16;
                for (int i = 1; i <= steps; ++i)
                {
                    const auto alpha = i / static_cast<double> (steps);
                    auto bend = juce::MidiMessage::pitchWheel (clampChannel (note.channel),
                        juce::roundToInt (8192.0 + (target - 8192) * alpha));
                    bend.setTimeStamp (beatsToTicks (note.startBeats + note.glideBeats * alpha, source.ppq));
                    sequence.addEvent (bend);
                }
                auto reset = juce::MidiMessage::pitchWheel (clampChannel (note.channel), 8192);
                reset.setTimeStamp (beatsToTicks (note.endBeats(), source.ppq));
                sequence.addEvent (reset);
            }
        }

        for (const auto& point : track.automation)
        {
            juce::MidiMessage event;
            if (point.lane == LaneKind::pitchBend)
                event = juce::MidiMessage::pitchWheel (clampChannel (point.channel),
                                                       juce::roundToInt (clampUnit (point.value) * 16383.0));
            else
            {
                const auto controller = controllerForLane (point.lane);
                if (controller < 0) continue;
                event = juce::MidiMessage::controllerEvent (clampChannel (point.channel), controller,
                                                            juce::roundToInt (clampUnit (point.value) * 127.0));
            }
            event.setTimeStamp (beatsToTicks (point.beat, source.ppq));
            sequence.addEvent (event);
        }

        sequence.addEvent (juce::MidiMessage::endOfTrack(), beatsToTicks (source.lengthBeats, source.ppq));
        sequence.sort();
        midi.addTrack (sequence);
    }

    file.deleteFile();
    juce::FileOutputStream output (file);
    if (! output.openedOk())
        return juce::Result::fail ("Nao foi possivel criar o arquivo MIDI.");
    if (! midi.writeTo (output, 1))
        return juce::Result::fail ("Falha ao gravar o arquivo MIDI.");
    output.flush();
    return juce::Result::ok();
}
}
