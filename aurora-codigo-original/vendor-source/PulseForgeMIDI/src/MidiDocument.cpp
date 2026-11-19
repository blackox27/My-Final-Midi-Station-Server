#include "MidiDocument.h"
#include "Quantizer.h"

#include <limits>

namespace pulseforge
{
MidiDocument::MidiDocument()
{
    Track first;
    first.id = nextIdUnlocked();
    project.tracks.push_back (std::move (first));
}

Project MidiDocument::snapshot() const
{
    const std::scoped_lock lock (mutex);
    return project;
}

void MidiDocument::replaceProject (Project replacement, bool clearHistory)
{
    {
        const std::scoped_lock lock (mutex);
        project = std::move (replacement);
        ensureValidUnlocked();
        if (clearHistory)
        {
            undoStack.clear();
            redoStack.clear();
            pendingTransaction.reset();
        }
    }
    broadcast();
}

Note MidiDocument::addNote (double start, double length, int pitch, int velocity)
{
    Note result;
    {
        const std::scoped_lock lock (mutex);
        result.id = nextIdUnlocked();
        result.startBeats = std::max (0.0, start);
        result.lengthBeats = std::max (1.0 / 64.0, length);
        result.pitch = clampMidi7 (pitch);
        result.velocity = clampMidi7 (velocity);
        result.channel = activeTrackUnlocked().channel;
        activeTrackUnlocked().notes.push_back (result);
        project.lengthBeats = std::max (project.lengthBeats, result.endBeats() + 4.0);
    }
    broadcast();
    return result;
}

bool MidiDocument::updateNote (Id id, const std::function<void(Note&)>& edit)
{
    auto changed = false;
    {
        const std::scoped_lock lock (mutex);
        for (auto& note : activeTrackUnlocked().notes)
        {
            if (note.id != id)
                continue;

            edit (note);
            note.startBeats = std::max (0.0, note.startBeats);
            note.lengthBeats = std::max (1.0 / 64.0, note.lengthBeats);
            note.pitch = clampMidi7 (note.pitch);
            note.velocity = clampMidi7 (note.velocity);
            note.channel = clampChannel (note.channel);
            changed = true;
            break;
        }
    }
    if (changed) broadcast();
    return changed;
}

bool MidiDocument::removeNote (Id id)
{
    auto changed = false;
    {
        const std::scoped_lock lock (mutex);
        auto& notes = activeTrackUnlocked().notes;
        const auto oldSize = notes.size();
        std::erase_if (notes, [id] (const Note& note) { return note.id == id; });
        changed = oldSize != notes.size();
    }
    if (changed) broadcast();
    return changed;
}

void MidiDocument::removeSelected()
{
    {
        const std::scoped_lock lock (mutex);
        auto& track = activeTrackUnlocked();
        std::erase_if (track.notes, [] (const Note& note) { return note.selected; });
        std::erase_if (track.automation, [] (const AutomationPoint& point) { return point.selected; });
    }
    broadcast();
}

void MidiDocument::selectOnly (Id id)
{
    const std::scoped_lock lock (mutex);
    for (auto& track : project.tracks)
    {
        for (auto& note : track.notes) note.selected = note.id == id;
        for (auto& point : track.automation) point.selected = false;
    }
    broadcast();
}

void MidiDocument::setSelected (Id id, bool selected, bool clearOthers)
{
    const std::scoped_lock lock (mutex);
    if (clearOthers)
    {
        for (auto& note : activeTrackUnlocked().notes) note.selected = false;
        for (auto& point : activeTrackUnlocked().automation) point.selected = false;
    }
    for (auto& note : activeTrackUnlocked().notes)
        if (note.id == id) note.selected = selected;
    broadcast();
}

void MidiDocument::selectInRange (double beatStart, double beatEnd, int pitchLow, int pitchHigh, bool additive)
{
    const std::scoped_lock lock (mutex);
    if (beatStart > beatEnd) std::swap (beatStart, beatEnd);
    if (pitchLow > pitchHigh) std::swap (pitchLow, pitchHigh);
    for (auto& note : activeTrackUnlocked().notes)
    {
        if (! additive) note.selected = false;
        if (note.endBeats() >= beatStart && note.startBeats <= beatEnd
            && note.pitch >= pitchLow && note.pitch <= pitchHigh)
            note.selected = true;
    }
    broadcast();
}

void MidiDocument::clearSelection()
{
    const std::scoped_lock lock (mutex);
    for (auto& track : project.tracks)
    {
        for (auto& note : track.notes) note.selected = false;
        for (auto& point : track.automation) point.selected = false;
    }
    broadcast();
}

std::vector<Id> MidiDocument::selectedNoteIds() const
{
    const std::scoped_lock lock (mutex);
    std::vector<Id> ids;
    for (const auto& note : activeTrackUnlocked().notes)
        if (note.selected) ids.push_back (note.id);
    return ids;
}

AutomationPoint MidiDocument::addAutomationPoint (LaneKind lane, double beat, double value)
{
    AutomationPoint result;
    {
        const std::scoped_lock lock (mutex);
        result.id = nextIdUnlocked();
        result.beat = std::max (0.0, beat);
        result.value = clampUnit (value);
        result.lane = lane;
        result.channel = activeTrackUnlocked().channel;
        activeTrackUnlocked().automation.push_back (result);
    }
    broadcast();
    return result;
}

bool MidiDocument::removeAutomationPoint (Id id)
{
    auto changed = false;
    {
        const std::scoped_lock lock (mutex);
        auto& points = activeTrackUnlocked().automation;
        const auto oldSize = points.size();
        std::erase_if (points, [id] (const AutomationPoint& point) { return point.id == id; });
        changed = oldSize != points.size();
    }
    if (changed) broadcast();
    return changed;
}

void MidiDocument::setVelocity (Id noteId, int velocity)
{
    updateNote (noteId, [velocity] (Note& note) { note.velocity = velocity; });
}

void MidiDocument::setGlide (int semitones, double durationBeats)
{
    {
        const std::scoped_lock lock (mutex);
        for (auto& note : activeTrackUnlocked().notes)
        {
            if (! note.selected) continue;
            note.glideSemitones = std::clamp (semitones, -24, 24);
            note.glideBeats = note.glideSemitones == 0 ? 0.0
                                                      : std::clamp (durationBeats, 1.0 / 64.0, note.lengthBeats);
        }
    }
    broadcast();
}

void MidiDocument::quantizeSelected (const QuantizeOptions& options)
{
    {
        const std::scoped_lock lock (mutex);
        const auto anySelected = std::any_of (activeTrackUnlocked().notes.begin(),
                                              activeTrackUnlocked().notes.end(),
                                              [] (const Note& note) { return note.selected; });
        Quantizer::apply (activeTrackUnlocked().notes, options, anySelected);
    }
    broadcast();
}

void MidiDocument::copySelected()
{
    const std::scoped_lock lock (mutex);
    clipboard = {};
    clipboard.originBeat = std::numeric_limits<double>::max();
    for (const auto& note : activeTrackUnlocked().notes)
        if (note.selected)
        {
            clipboard.notes.push_back (note);
            clipboard.originBeat = std::min (clipboard.originBeat, note.startBeats);
        }
    for (const auto& point : activeTrackUnlocked().automation)
        if (point.selected)
        {
            clipboard.automation.push_back (point);
            clipboard.originBeat = std::min (clipboard.originBeat, point.beat);
        }
    if (clipboard.empty()) clipboard.originBeat = 0.0;
}

void MidiDocument::cutSelected()
{
    copySelected();
    removeSelected();
}

void MidiDocument::pasteAt (double beat)
{
    {
        const std::scoped_lock lock (mutex);
        if (clipboard.empty()) return;
        for (auto& note : activeTrackUnlocked().notes) note.selected = false;
        for (auto& point : activeTrackUnlocked().automation) point.selected = false;

        for (auto note : clipboard.notes)
        {
            note.id = nextIdUnlocked();
            note.startBeats = std::max (0.0, beat + note.startBeats - clipboard.originBeat);
            note.selected = true;
            activeTrackUnlocked().notes.push_back (note);
        }
        for (auto point : clipboard.automation)
        {
            point.id = nextIdUnlocked();
            point.beat = std::max (0.0, beat + point.beat - clipboard.originBeat);
            point.selected = true;
            activeTrackUnlocked().automation.push_back (point);
        }
    }
    broadcast();
}

void MidiDocument::duplicateSelected (double deltaBeats)
{
    copySelected();
    const auto source = snapshot();
    auto origin = std::numeric_limits<double>::max();
    for (const auto& note : source.tracks[source.activeTrack].notes)
        if (note.selected) origin = std::min (origin, note.startBeats);
    if (origin != std::numeric_limits<double>::max()) pasteAt (origin + deltaBeats);
}

void MidiDocument::addTrack (std::string name)
{
    {
        const std::scoped_lock lock (mutex);
        Track track;
        track.id = nextIdUnlocked();
        track.channel = std::min (16, static_cast<int> (project.tracks.size()) + 1);
        track.name = name.empty() ? "Pista " + std::to_string (project.tracks.size() + 1) : std::move (name);
        constexpr std::uint32_t colours[] { 0xff7667ff, 0xff2fc7a0, 0xffffa24c, 0xffff5f7a, 0xff39a9ff };
        track.colour = colours[project.tracks.size() % 5];
        project.tracks.push_back (std::move (track));
        project.activeTrack = project.tracks.size() - 1;
    }
    broadcast();
}

void MidiDocument::removeActiveTrack()
{
    {
        const std::scoped_lock lock (mutex);
        if (project.tracks.size() <= 1) return;
        project.tracks.erase (project.tracks.begin() + static_cast<std::ptrdiff_t> (project.activeTrack));
        project.activeTrack = std::min (project.activeTrack, project.tracks.size() - 1);
    }
    broadcast();
}

void MidiDocument::setActiveTrack (std::size_t index)
{
    {
        const std::scoped_lock lock (mutex);
        project.activeTrack = std::min (index, project.tracks.size() - 1);
    }
    broadcast();
}

void MidiDocument::renameActiveTrack (std::string name)
{
    {
        const std::scoped_lock lock (mutex);
        if (! name.empty()) activeTrackUnlocked().name = std::move (name);
    }
    broadcast();
}

void MidiDocument::beginTransaction (std::string name)
{
    const std::scoped_lock lock (mutex);
    if (! pendingTransaction)
        pendingTransaction = HistoryEntry { std::move (name), project };
}

void MidiDocument::commitTransaction()
{
    const std::scoped_lock lock (mutex);
    if (! pendingTransaction) return;
    undoStack.push_back (std::move (*pendingTransaction));
    pendingTransaction.reset();
    redoStack.clear();
    constexpr std::size_t maxHistory = 100;
    if (undoStack.size() > maxHistory) undoStack.erase (undoStack.begin());
}

bool MidiDocument::canUndo() const
{
    const std::scoped_lock lock (mutex);
    return ! undoStack.empty();
}

bool MidiDocument::canRedo() const
{
    const std::scoped_lock lock (mutex);
    return ! redoStack.empty();
}

std::string MidiDocument::undoName() const
{
    const std::scoped_lock lock (mutex);
    return undoStack.empty() ? std::string {} : undoStack.back().name;
}

std::string MidiDocument::redoName() const
{
    const std::scoped_lock lock (mutex);
    return redoStack.empty() ? std::string {} : redoStack.back().name;
}

void MidiDocument::undo()
{
    {
        const std::scoped_lock lock (mutex);
        if (undoStack.empty()) return;
        redoStack.push_back ({ undoStack.back().name, project });
        project = std::move (undoStack.back().state);
        undoStack.pop_back();
        pendingTransaction.reset();
    }
    broadcast();
}

void MidiDocument::redo()
{
    {
        const std::scoped_lock lock (mutex);
        if (redoStack.empty()) return;
        undoStack.push_back ({ redoStack.back().name, project });
        project = std::move (redoStack.back().state);
        redoStack.pop_back();
        pendingTransaction.reset();
    }
    broadcast();
}

void MidiDocument::notifyExternalChange() { broadcast(); }

Track& MidiDocument::activeTrackUnlocked() { return project.tracks[project.activeTrack]; }
const Track& MidiDocument::activeTrackUnlocked() const { return project.tracks[project.activeTrack]; }
Id MidiDocument::nextIdUnlocked() { return nextId++; }

void MidiDocument::ensureValidUnlocked()
{
    project.tempo = std::clamp (project.tempo, 20.0, 400.0);
    project.lengthBeats = std::max (4.0, project.lengthBeats);
    if (project.tracks.empty())
    {
        Track track;
        track.id = nextIdUnlocked();
        project.tracks.push_back (std::move (track));
    }
    project.activeTrack = std::min (project.activeTrack, project.tracks.size() - 1);
    Id highest {};
    for (auto& track : project.tracks)
    {
        track.channel = clampChannel (track.channel);
        highest = std::max (highest, track.id);
        for (auto& note : track.notes)
        {
            note.pitch = clampMidi7 (note.pitch);
            note.velocity = clampMidi7 (note.velocity);
            note.channel = clampChannel (note.channel);
            note.startBeats = std::max (0.0, note.startBeats);
            note.lengthBeats = std::max (1.0 / 64.0, note.lengthBeats);
            highest = std::max (highest, note.id);
        }
        for (auto& point : track.automation)
        {
            point.beat = std::max (0.0, point.beat);
            point.value = clampUnit (point.value);
            point.channel = clampChannel (point.channel);
            highest = std::max (highest, point.id);
        }
    }
    nextId = std::max (nextId, highest + 1);
}

void MidiDocument::broadcast()
{
    auto callback = onChange;
    if (callback) callback();
}
}
