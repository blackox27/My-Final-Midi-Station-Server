#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace pulseforge
{
using Id = std::uint64_t;

enum class Tool
{
    select,
    draw,
    erase
};

enum class LaneKind
{
    velocity,
    modulation,
    volume,
    pan,
    expression,
    sustain,
    pitchBend
};

inline int controllerForLane (LaneKind lane)
{
    switch (lane)
    {
        case LaneKind::modulation: return 1;
        case LaneKind::volume: return 7;
        case LaneKind::pan: return 10;
        case LaneKind::expression: return 11;
        case LaneKind::sustain: return 64;
        default: return -1;
    }
}

struct Note
{
    Id id {};
    double startBeats {};
    double lengthBeats { 1.0 };
    int pitch { 60 };
    int velocity { 100 };
    int channel { 1 };
    bool selected {};
    int glideSemitones {};
    double glideBeats {};

    [[nodiscard]] double endBeats() const noexcept { return startBeats + lengthBeats; }
};

struct AutomationPoint
{
    Id id {};
    double beat {};
    double value { 0.5 }; // Normalized 0..1. Pitch bend maps to 0..16383.
    LaneKind lane { LaneKind::modulation };
    int channel { 1 };
    bool selected {};
};

struct Track
{
    Id id {};
    std::string name { "Pista 1" };
    int channel { 1 };
    bool muted {};
    bool solo {};
    std::uint32_t colour { 0xff7667ff };
    std::vector<Note> notes;
    std::vector<AutomationPoint> automation;
};

struct Project
{
    std::string title { "Projeto sem titulo" };
    double tempo { 120.0 };
    int timeSignatureNumerator { 4 };
    int timeSignatureDenominator { 4 };
    int ppq { 960 };
    double lengthBeats { 64.0 };
    std::size_t activeTrack {};
    std::vector<Track> tracks;
};

struct ClipboardData
{
    std::vector<Note> notes;
    std::vector<AutomationPoint> automation;
    double originBeat {};

    [[nodiscard]] bool empty() const noexcept
    {
        return notes.empty() && automation.empty();
    }
};

struct QuantizeOptions
{
    double gridBeats { 0.25 }; // 1/16 at 4/4.
    double strength { 1.0 };
    double swing {};           // -0.95..0.95, applied to odd grid steps.
    bool quantizeEnds {};
};

inline int clampMidi7 (int value) noexcept { return std::clamp (value, 0, 127); }
inline int clampChannel (int value) noexcept { return std::clamp (value, 1, 16); }
inline double clampUnit (double value) noexcept { return std::clamp (value, 0.0, 1.0); }
}
