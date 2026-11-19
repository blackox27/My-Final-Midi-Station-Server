$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
cmake -S $ProjectDir -B "$ProjectDir/build" -A x64
cmake --build "$ProjectDir/build" --config Release --parallel
Write-Host "Executavel em: $ProjectDir/build/PulseForge_artefacts/Release/PulseForge MIDI.exe"
