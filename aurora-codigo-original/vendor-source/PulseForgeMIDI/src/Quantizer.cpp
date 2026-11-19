#include "Quantizer.h"

namespace pulseforge
{
double Quantizer::snap (double beat, double gridBeats, double swing) noexcept
{
    if (! std::isfinite (beat) || ! std::isfinite (gridBeats) || gridBeats <= 0.0)
        return std::max (0.0, beat);

    const auto step = std::max (0LL, std::llround (beat / gridBeats));
    auto snapped = static_cast<double> (step) * gridBeats;

    if ((step & 1LL) != 0)
        snapped += std::clamp (swing, -0.95, 0.95) * gridBeats * 0.5;

    return std::max (0.0, snapped);
}

Note Quantizer::quantized (const Note& source, const QuantizeOptions& options) noexcept
{
    auto result = source;
    const auto strength = std::clamp (options.strength, 0.0, 1.0);
    const auto targetStart = snap (source.startBeats, options.gridBeats, options.swing);
    result.startBeats += (targetStart - source.startBeats) * strength;

    if (options.quantizeEnds)
    {
        const auto targetEnd = snap (source.endBeats(), options.gridBeats, options.swing);
        const auto newEnd = source.endBeats() + (targetEnd - source.endBeats()) * strength;
        result.lengthBeats = std::max (options.gridBeats * 0.125, newEnd - result.startBeats);
    }

    return result;
}

void Quantizer::apply (std::vector<Note>& notes, const QuantizeOptions& options, bool selectedOnly)
{
    for (auto& note : notes)
        if (! selectedOnly || note.selected)
            note = quantized (note, options);
}
}
