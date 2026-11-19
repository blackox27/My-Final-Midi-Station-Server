#pragma once

#include "CoreTypes.h"

namespace pulseforge
{
class Quantizer
{
public:
    [[nodiscard]] static double snap (double beat, double gridBeats, double swing = 0.0) noexcept;
    [[nodiscard]] static Note quantized (const Note&, const QuantizeOptions&) noexcept;
    static void apply (std::vector<Note>& notes, const QuantizeOptions&, bool selectedOnly);
};
}
