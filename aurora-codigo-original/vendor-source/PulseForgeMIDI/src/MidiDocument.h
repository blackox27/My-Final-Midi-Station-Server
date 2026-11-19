#pragma once

#include "CoreTypes.h"

#include <functional>
#include <mutex>
#include <optional>

namespace pulseforge
{
class MidiDocument
{
public:
    MidiDocument();

    [[nodiscard]] Project snapshot() const;
    void replaceProject (Project replacement, bool clearHistory = true);

    [[nodiscard]] Note addNote (double start, double length, int pitch, int velocity = 100);
    bool updateNote (Id, const std::function<void(Note&)>&);
    bool removeNote (Id);
    void removeSelected();
    void selectOnly (Id);
    void setSelected (Id, bool selected, bool clearOthers = false);
    void selectInRange (double beatStart, double beatEnd, int pitchLow, int pitchHigh, bool additive);
    void clearSelection();
    [[nodiscard]] std::vector<Id> selectedNoteIds() const;

    [[nodiscard]] AutomationPoint addAutomationPoint (LaneKind, double beat, double value);
    bool removeAutomationPoint (Id);
    void setVelocity (Id noteId, int velocity);
    void setGlide (int semitones, double durationBeats);
    void quantizeSelected (const QuantizeOptions&);

    void copySelected();
    void cutSelected();
    void pasteAt (double beat);
    void duplicateSelected (double deltaBeats);

    void addTrack (std::string name = {});
    void removeActiveTrack();
    void setActiveTrack (std::size_t);
    void renameActiveTrack (std::string);

    void beginTransaction (std::string name);
    void commitTransaction();
    [[nodiscard]] bool canUndo() const;
    [[nodiscard]] bool canRedo() const;
    [[nodiscard]] std::string undoName() const;
    [[nodiscard]] std::string redoName() const;
    void undo();
    void redo();

    void notifyExternalChange();
    std::function<void()> onChange;

private:
    struct HistoryEntry
    {
        std::string name;
        Project state;
    };

    Track& activeTrackUnlocked();
    const Track& activeTrackUnlocked() const;
    Id nextIdUnlocked();
    void ensureValidUnlocked();
    void broadcast();

    mutable std::recursive_mutex mutex;
    Project project;
    ClipboardData clipboard;
    Id nextId { 1 };
    std::optional<HistoryEntry> pendingTransaction;
    std::vector<HistoryEntry> undoStack;
    std::vector<HistoryEntry> redoStack;
};
}
