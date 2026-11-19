"""Validação de MIDI padrão sem dependências externas ou alteração dos dados."""
import re
import struct
import unicodedata

META_LENGTHS = {0x00: 2, 0x20: 1, 0x21: 1, 0x2F: 0, 0x51: 3, 0x54: 5, 0x58: 4, 0x59: 2}

def validate_midi(data: bytes) -> dict:
    """Confere cabeçalho, pistas e eventos sem modificar os bytes recebidos."""
    def invalid():
        raise ValueError("MIDI inválido, truncado ou sem notas. Use MIDI tipo 0/1 com tempo PPQ.")

    if len(data) < 14 or data[:4] != b"MThd":
        invalid()
    header_size = int.from_bytes(data[4:8], "big")
    if header_size < 6 or header_size + 8 > len(data):
        invalid()
    fmt, count, ppq = struct.unpack_from(">HHH", data, 8)
    if fmt not in (0, 1) or not 1 <= count <= 1024 or (fmt == 0 and count != 1) or not ppq or ppq & 0x8000:
        invalid()
    position, notes, events = 8 + header_size, 0, 0
    for _ in range(count):
        if position + 8 > len(data) or data[position:position + 4] != b"MTrk":
            invalid()
        size = int.from_bytes(data[position + 4:position + 8], "big")
        position += 8
        end = position + size
        if end > len(data):
            invalid()
        running, ended = None, False

        def vlq():
            nonlocal position
            result = 0
            for _ in range(4):
                if position >= end:
                    invalid()
                value = data[position]
                position += 1
                result = (result << 7) | (value & 127)
                if not value & 128:
                    return result
            invalid()

        while position < end:
            vlq()
            if position >= end:
                invalid()
            status = data[position]
            if status >= 128:
                position += 1
                if status < 0xF0:
                    running = status
                elif status != 0xFF:
                    running = None
            elif running is not None:
                status = running
            else:
                invalid()
            events += 1
            if events > 1_000_000:
                raise ValueError("O MIDI excede o limite de um milhão de eventos.")
            if status == 0xFF:
                if position >= end:
                    invalid()
                kind = data[position]
                position += 1
                length = vlq()
                if kind >= 128 or position + length > end:
                    invalid()
                # Metaeventos musicais malformados antes passavam pela validação.
                if kind in META_LENGTHS and length != META_LENGTHS[kind]:
                    invalid()
                if kind == 0x51 and int.from_bytes(data[position:position + length], "big") == 0:
                    invalid()
                if kind == 0x58 and (data[position] == 0 or data[position + 1] > 7):
                    invalid()
                if kind in (0x20, 0x21) and data[position] >= (16 if kind == 0x20 else 128):
                    invalid()
                position += length
                if kind == 0x2F:
                    if length != 0 or position != end:
                        invalid()
                    ended = True
                    break
            elif status in (0xF0, 0xF7):
                length = vlq()
                if position + length > end:
                    invalid()
                position += length
            elif 0x80 <= status <= 0xEF:
                length = 1 if status >> 4 in (0xC, 0xD) else 2
                if (position + length > end or data[position] >= 128
                        or (length == 2 and data[position + 1] >= 128)):
                    invalid()
                if status >> 4 == 0x9 and data[position + 1] > 0:
                    notes += 1
                position += length
            else:
                invalid()
        if not ended:
            invalid()
        position = end
    if position != len(data) or notes == 0:
        invalid()
    return {"format": fmt, "tracks": count, "ppq": ppq, "notes": notes}


def safe_name(name: str) -> str:
    name = unicodedata.normalize("NFC", name.replace("\\", "/").split("/")[-1])
    name = "".join(c for c in name if unicodedata.category(c)[0] != "C")
    name = re.sub(r'[<>:"|?*]', "_", name).strip(" .")
    if not re.search(r"\.midi?$", name, re.I):
        raise ValueError("Selecione um arquivo com extensão .mid ou .midi.")
    stem, ext = name.rsplit(".", 1)
    return (stem[:100].strip() or "musica") + "." + ext.lower()
