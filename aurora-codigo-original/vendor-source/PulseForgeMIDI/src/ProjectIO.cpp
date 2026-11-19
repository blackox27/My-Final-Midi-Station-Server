#include "ProjectIO.h"

namespace pulseforge
{
namespace
{
juce::var noteToVar (const Note& note)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("id", static_cast<juce::int64> (note.id));
    object->setProperty ("start", note.startBeats);
    object->setProperty ("length", note.lengthBeats);
    object->setProperty ("pitch", note.pitch);
    object->setProperty ("velocity", note.velocity);
    object->setProperty ("channel", note.channel);
    object->setProperty ("glideSemitones", note.glideSemitones);
    object->setProperty ("glideBeats", note.glideBeats);
    return object;
}

juce::var automationToVar (const AutomationPoint& point)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("id", static_cast<juce::int64> (point.id));
    object->setProperty ("beat", point.beat);
    object->setProperty ("value", point.value);
    object->setProperty ("lane", static_cast<int> (point.lane));
    object->setProperty ("channel", point.channel);
    return object;
}

double number (const juce::var& value, double fallback)
{
    return value.isDouble() || value.isInt() || value.isInt64() ? static_cast<double> (value) : fallback;
}
}

juce::Result ProjectIO::save (const juce::File& file, const Project& project)
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("format", "PulseForge MIDI Project");
    root->setProperty ("version", 1);
    root->setProperty ("title", juce::String (project.title));
    root->setProperty ("tempo", project.tempo);
    root->setProperty ("numerator", project.timeSignatureNumerator);
    root->setProperty ("denominator", project.timeSignatureDenominator);
    root->setProperty ("ppq", project.ppq);
    root->setProperty ("lengthBeats", project.lengthBeats);
    root->setProperty ("activeTrack", static_cast<int> (project.activeTrack));

    juce::Array<juce::var> tracks;
    for (const auto& track : project.tracks)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", static_cast<juce::int64> (track.id));
        object->setProperty ("name", juce::String (track.name));
        object->setProperty ("channel", track.channel);
        object->setProperty ("muted", track.muted);
        object->setProperty ("solo", track.solo);
        object->setProperty ("colour", static_cast<juce::int64> (track.colour));
        juce::Array<juce::var> notes;
        for (const auto& note : track.notes) notes.add (noteToVar (note));
        object->setProperty ("notes", notes);
        juce::Array<juce::var> automation;
        for (const auto& point : track.automation) automation.add (automationToVar (point));
        object->setProperty ("automation", automation);
        tracks.add (object);
    }
    root->setProperty ("tracks", tracks);

    if (! file.replaceWithText (juce::JSON::toString (juce::var (root), true)))
        return juce::Result::fail ("Nao foi possivel salvar o projeto.");
    return juce::Result::ok();
}

juce::Result ProjectIO::load (const juce::File& file, Project& destination)
{
    const auto parsed = juce::JSON::parse (file.loadFileAsString());
    const auto* root = parsed.getDynamicObject();
    if (root == nullptr || root->getProperty ("format").toString() != "PulseForge MIDI Project")
        return juce::Result::fail ("Este nao e um projeto PulseForge valido.");

    Project result;
    result.title = root->getProperty ("title").toString().toStdString();
    result.tempo = number (root->getProperty ("tempo"), 120.0);
    result.timeSignatureNumerator = static_cast<int> (root->getProperty ("numerator"));
    result.timeSignatureDenominator = static_cast<int> (root->getProperty ("denominator"));
    result.ppq = static_cast<int> (root->getProperty ("ppq"));
    result.lengthBeats = number (root->getProperty ("lengthBeats"), 64.0);
    result.activeTrack = static_cast<std::size_t> (std::max (0, static_cast<int> (root->getProperty ("activeTrack"))));
    result.tracks.clear();

    if (const auto* tracks = root->getProperty ("tracks").getArray())
    {
        for (const auto& trackValue : *tracks)
        {
            const auto* object = trackValue.getDynamicObject();
            if (object == nullptr) continue;
            Track track;
            track.id = static_cast<Id> (static_cast<juce::int64> (object->getProperty ("id")));
            track.name = object->getProperty ("name").toString().toStdString();
            track.channel = static_cast<int> (object->getProperty ("channel"));
            track.muted = static_cast<bool> (object->getProperty ("muted"));
            track.solo = static_cast<bool> (object->getProperty ("solo"));
            track.colour = static_cast<std::uint32_t> (static_cast<juce::int64> (object->getProperty ("colour")));

            if (const auto* notes = object->getProperty ("notes").getArray())
                for (const auto& noteValue : *notes)
                    if (const auto* noteObject = noteValue.getDynamicObject())
                    {
                        Note note;
                        note.id = static_cast<Id> (static_cast<juce::int64> (noteObject->getProperty ("id")));
                        note.startBeats = number (noteObject->getProperty ("start"), 0.0);
                        note.lengthBeats = number (noteObject->getProperty ("length"), 1.0);
                        note.pitch = static_cast<int> (noteObject->getProperty ("pitch"));
                        note.velocity = static_cast<int> (noteObject->getProperty ("velocity"));
                        note.channel = static_cast<int> (noteObject->getProperty ("channel"));
                        note.glideSemitones = static_cast<int> (noteObject->getProperty ("glideSemitones"));
                        note.glideBeats = number (noteObject->getProperty ("glideBeats"), 0.0);
                        track.notes.push_back (note);
                    }

            if (const auto* points = object->getProperty ("automation").getArray())
                for (const auto& pointValue : *points)
                    if (const auto* pointObject = pointValue.getDynamicObject())
                    {
                        AutomationPoint point;
                        point.id = static_cast<Id> (static_cast<juce::int64> (pointObject->getProperty ("id")));
                        point.beat = number (pointObject->getProperty ("beat"), 0.0);
                        point.value = number (pointObject->getProperty ("value"), 0.5);
                        point.lane = static_cast<LaneKind> (static_cast<int> (pointObject->getProperty ("lane")));
                        point.channel = static_cast<int> (pointObject->getProperty ("channel"));
                        track.automation.push_back (point);
                    }
            result.tracks.push_back (std::move (track));
        }
    }

    if (result.tracks.empty())
        result.tracks.push_back (Track {});
    result.activeTrack = std::min (result.activeTrack, result.tracks.size() - 1);
    destination = std::move (result);
    return juce::Result::ok();
}
}
