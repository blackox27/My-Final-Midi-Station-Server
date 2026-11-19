#include "AudioEngine.h"

#include <juce_audio_formats/juce_audio_formats.h>

namespace pulseforge
{
AudioEngine::AudioEngine()
{
    juce::addDefaultFormatsToManager (formatManager);
    timeline.store (std::make_shared<Timeline>());
}

AudioEngine::~AudioEngine()
{
    playing.store (false);
    for (const auto& info : juce::MidiInput::getAvailableDevices())
        deviceManager.removeMidiInputDeviceCallback (info.identifier, this);
    deviceManager.removeAudioCallback (this);
    const juce::ScopedLock lock (processorLock);
    if (plugin) plugin->releaseResources();
}

juce::Result AudioEngine::initialise()
{
    const auto result = deviceManager.initialiseWithDefaultDevices (0, 2);
    if (result.isNotEmpty()) return juce::Result::fail (result);

    for (const auto& info : juce::MidiInput::getAvailableDevices())
    {
        deviceManager.setMidiInputDeviceEnabled (info.identifier, true);
        deviceManager.addMidiInputDeviceCallback (info.identifier, this);
    }
    deviceManager.addAudioCallback (this);
    return juce::Result::ok();
}

void AudioEngine::setProject (const Project& project)
{
    timeline.store (makeTimeline (project));
}

void AudioEngine::play() { playing.store (true); }
void AudioEngine::pause() { playing.store (false); }

void AudioEngine::stop()
{
    playing.store (false);
    samplePosition.store (0);
    resetProcessorState();
}

void AudioEngine::setPositionBeats (double beat)
{
    const auto data = timeline.load();
    const auto seconds = std::max (0.0, beat) * 60.0 / data->tempo;
    samplePosition.store (static_cast<std::int64_t> (seconds * currentSampleRate.load()));
    resetProcessorState();
}

double AudioEngine::positionBeats() const noexcept
{
    const auto data = timeline.load();
    return samplePosition.load() / currentSampleRate.load() * data->tempo / 60.0;
}

void AudioEngine::loadPlugin (const juce::File& file, std::function<void(juce::Result)> completion)
{
    juce::OwnedArray<juce::PluginDescription> found;
    for (auto* format : formatManager.getFormats())
        if (format->fileMightContainThisPluginType (file.getFullPathName()))
            format->findAllTypesForFile (found, file.getFullPathName());

    if (found.isEmpty())
    {
        completion (juce::Result::fail ("Nenhum instrumento VST3/AU compativel foi encontrado."));
        return;
    }

    const juce::PluginDescription description (*found.getFirst());
    formatManager.createPluginInstanceAsync (
        description, currentSampleRate.load(), currentBlockSize.load(),
        [this, completion = std::move (completion)] (std::unique_ptr<juce::AudioPluginInstance> instance,
                                                     const juce::String& error) mutable
        {
            if (instance == nullptr)
            {
                completion (juce::Result::fail (error.isNotEmpty() ? error : "Falha ao abrir o instrumento."));
                return;
            }
            {
                const juce::ScopedLock lock (processorLock);
                if (plugin) plugin->releaseResources();
                plugin = std::move (instance);
                plugin->enableAllBuses();
                plugin->setRateAndBufferSizeDetails (currentSampleRate.load(), currentBlockSize.load());
                plugin->prepareToPlay (currentSampleRate.load(), currentBlockSize.load());
                scratchBuffer.setSize (std::max (64, std::max (plugin->getTotalNumInputChannels(),
                                                               plugin->getTotalNumOutputChannels())),
                                       currentBlockSize.load(), false, false, true);
            }
            if (onPluginChanged) onPluginChanged();
            completion (juce::Result::ok());
        });
}

void AudioEngine::unloadPlugin()
{
    {
        const juce::ScopedLock lock (processorLock);
        if (plugin) plugin->releaseResources();
        plugin.reset();
    }
    if (onPluginChanged) onPluginChanged();
}

juce::String AudioEngine::pluginName() const
{
    const juce::ScopedLock lock (processorLock);
    return plugin ? plugin->getName() : "Sintetizador interno";
}

std::shared_ptr<const AudioEngine::Timeline> AudioEngine::makeTimeline (const Project& project)
{
    auto result = std::make_shared<Timeline>();
    result->tempo = std::clamp (project.tempo, 20.0, 400.0);
    result->lengthBeats = std::max (4.0, project.lengthBeats);
    const auto anySolo = std::any_of (project.tracks.begin(), project.tracks.end(),
                                      [] (const Track& track) { return track.solo; });

    for (const auto& track : project.tracks)
    {
        if (track.muted || (anySolo && ! track.solo)) continue;
        for (const auto& note : track.notes)
        {
            result->events.push_back ({ note.startBeats,
                juce::MidiMessage::noteOn (clampChannel (note.channel), clampMidi7 (note.pitch),
                                           static_cast<juce::uint8> (std::max (1, clampMidi7 (note.velocity)))) });
            result->events.push_back ({ note.endBeats(),
                juce::MidiMessage::noteOff (clampChannel (note.channel), clampMidi7 (note.pitch)) });

            if (note.glideSemitones != 0 && note.glideBeats > 0.0)
            {
                constexpr int steps = 24;
                const auto target = std::clamp (8192 + note.glideSemitones * 4096, 0, 16383);
                for (int i = 1; i <= steps; ++i)
                {
                    const auto alpha = i / static_cast<double> (steps);
                    result->events.push_back ({ note.startBeats + note.glideBeats * alpha,
                        juce::MidiMessage::pitchWheel (clampChannel (note.channel),
                            juce::roundToInt (8192.0 + (target - 8192) * alpha)) });
                }
                result->events.push_back ({ note.endBeats(),
                    juce::MidiMessage::pitchWheel (clampChannel (note.channel), 8192) });
            }
        }

        for (const auto& point : track.automation)
        {
            if (point.lane == LaneKind::pitchBend)
                result->events.push_back ({ point.beat,
                    juce::MidiMessage::pitchWheel (clampChannel (point.channel),
                                                   juce::roundToInt (clampUnit (point.value) * 16383.0)) });
            else if (const auto controller = controllerForLane (point.lane); controller >= 0)
                result->events.push_back ({ point.beat,
                    juce::MidiMessage::controllerEvent (clampChannel (point.channel), controller,
                                                        juce::roundToInt (clampUnit (point.value) * 127.0)) });
        }
    }

    std::stable_sort (result->events.begin(), result->events.end(),
                      [] (const TimedEvent& a, const TimedEvent& b)
                      {
                          if (a.beat != b.beat) return a.beat < b.beat;
                          return a.message.isNoteOff() && b.message.isNoteOn();
                      });
    return result;
}

void AudioEngine::addRangeToBuffer (const Timeline& data, double startBeat, double endBeat,
                                    int numSamples, juce::MidiBuffer& midi)
{
    const auto first = std::lower_bound (data.events.begin(), data.events.end(), startBeat,
        [] (const TimedEvent& event, double beat) { return event.beat < beat; });
    for (auto it = first; it != data.events.end() && it->beat < endBeat; ++it)
    {
        const auto alpha = (it->beat - startBeat) / std::max (1.0e-12, endBeat - startBeat);
        midi.addEvent (it->message, std::clamp (juce::roundToInt (alpha * numSamples), 0, numSamples - 1));
    }
}

void AudioEngine::renderBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi, int numSamples)
{
    if (plugin)
    {
        plugin->processBlock (buffer, midi);
        for (int channel = plugin->getTotalNumOutputChannels(); channel < buffer.getNumChannels(); ++channel)
            buffer.clear (channel, 0, numSamples);
    }
    else
        builtInSynth.render (buffer, midi, 0, numSamples);
}

void AudioEngine::resetProcessorState()
{
    const juce::ScopedLock lock (processorLock);
    builtInSynth.reset();
    if (plugin) plugin->reset();
}

void AudioEngine::audioDeviceIOCallbackWithContext (const float* const* input, int numInputs,
                                                     float* const* output, int numOutputs,
                                                     int numSamples,
                                                     const juce::AudioIODeviceCallbackContext&)
{
    if (numOutputs <= 0) return;
    const juce::ScopedTryLock processLock (processorLock);
    if (! processLock.isLocked())
    {
        for (int channel = 0; channel < numOutputs; ++channel)
            if (output[channel] != nullptr) juce::FloatVectorOperations::clear (output[channel], numSamples);
        return;
    }
    const auto requiredChannels = plugin ? std::max (64, std::max (plugin->getTotalNumInputChannels(),
                                                                   plugin->getTotalNumOutputChannels()))
                                         : std::max (64, numOutputs);
    if (scratchBuffer.getNumChannels() < requiredChannels || scratchBuffer.getNumSamples() < numSamples)
        scratchBuffer.setSize (requiredChannels, numSamples, false, false, true);
    scratchBuffer.clear();
    for (int channel = 0; channel < std::min (numInputs, scratchBuffer.getNumChannels()); ++channel)
        if (input[channel] != nullptr)
            scratchBuffer.copyFrom (channel, 0, input[channel], numSamples);

    juce::MidiBuffer midi;
    midiCollector.removeNextBlockOfMessages (midi, numSamples);
    const auto data = timeline.load();
    if (playing.load())
    {
        const auto startSample = samplePosition.load();
        const auto samplesPerBeat = currentSampleRate.load() * 60.0 / data->tempo;
        const auto startBeat = startSample / samplesPerBeat;
        const auto endBeat = (startSample + numSamples) / samplesPerBeat;
        addRangeToBuffer (*data, startBeat, endBeat, numSamples, midi);
        samplePosition.fetch_add (numSamples);
        if (endBeat >= data->lengthBeats) playing.store (false);
    }

    renderBlock (scratchBuffer, midi, numSamples);
    for (int channel = 0; channel < numOutputs; ++channel)
    {
        if (output[channel] == nullptr) continue;
        if (channel < scratchBuffer.getNumChannels())
            juce::FloatVectorOperations::copy (output[channel], scratchBuffer.getReadPointer (channel), numSamples);
        else
            juce::FloatVectorOperations::clear (output[channel], numSamples);
    }
}

void AudioEngine::audioDeviceAboutToStart (juce::AudioIODevice* device)
{
    currentSampleRate.store (device->getCurrentSampleRate());
    currentBlockSize.store (device->getCurrentBufferSizeSamples());
    midiCollector.reset (currentSampleRate.load());
    builtInSynth.prepare (currentSampleRate.load());
    const juce::ScopedLock lock (processorLock);
    const auto channels = plugin ? std::max (64, std::max (plugin->getTotalNumInputChannels(),
                                                           plugin->getTotalNumOutputChannels())) : 64;
    // Preallocate generously so the realtime callback never grows this buffer for ordinary plugins.
    scratchBuffer.setSize (channels, currentBlockSize.load(), false, false, true);
    if (plugin)
    {
        plugin->setRateAndBufferSizeDetails (currentSampleRate.load(), currentBlockSize.load());
        plugin->prepareToPlay (currentSampleRate.load(), currentBlockSize.load());
    }
}

void AudioEngine::audioDeviceStopped()
{
    midiCollector.reset (currentSampleRate.load());
}

void AudioEngine::handleIncomingMidiMessage (juce::MidiInput*, const juce::MidiMessage& message)
{
    midiCollector.addMessageToQueue (message);
}

juce::Result AudioEngine::renderToAudioFile (const juce::File& requestedFile, const Project& project,
                                             std::function<void(double)> progress)
{
    const auto wasPlaying = playing.exchange (false);
    const juce::ScopedLock lock (processorLock);
    const auto data = makeTimeline (project);
    constexpr double renderSampleRate = 48000.0;
    constexpr int blockSize = 512;
    constexpr int channels = 2;
    const auto totalSamples = static_cast<std::int64_t> ((data->lengthBeats * 60.0 / data->tempo + 2.0)
                                                         * renderSampleRate);

    auto targetFile = requestedFile;
    const auto wantsMp3 = requestedFile.hasFileExtension ("mp3");
    if (wantsMp3)
        targetFile = juce::File::getSpecialLocation (juce::File::tempDirectory)
            .getNonexistentChildFile ("PulseForge-render", ".wav");

    std::unique_ptr<juce::AudioFormat> format;
    if (targetFile.hasFileExtension ("flac")) format = std::make_unique<juce::FlacAudioFormat>();
    else if (targetFile.hasFileExtension ("ogg")) format = std::make_unique<juce::OggVorbisAudioFormat>();
    else format = std::make_unique<juce::WavAudioFormat>();

    targetFile.deleteFile();
    std::unique_ptr<juce::OutputStream> stream = std::make_unique<juce::FileOutputStream> (targetFile);
    if (auto* fileStream = dynamic_cast<juce::FileOutputStream*> (stream.get());
        fileStream == nullptr || ! fileStream->openedOk())
    {
        return juce::Result::fail ("Nao foi possivel criar o arquivo de audio.");
    }
    const auto writerOptions = juce::AudioFormatWriterOptions()
        .withSampleRate (renderSampleRate)
        .withChannelLayout (juce::AudioChannelSet::stereo())
        .withBitsPerSample (24)
        .withQualityOptionIndex (0);
    auto writer = format->createWriterFor (stream, writerOptions);
    if (! writer)
    {
        return juce::Result::fail ("O formato de audio escolhido nao esta disponivel.");
    }

    builtInSynth.prepare (renderSampleRate);
    builtInSynth.reset();
    if (plugin)
    {
        plugin->releaseResources();
        plugin->setNonRealtime (true);
        plugin->setRateAndBufferSizeDetails (renderSampleRate, blockSize);
        plugin->prepareToPlay (renderSampleRate, blockSize);
        plugin->reset();
    }

    juce::AudioBuffer<float> audio (std::max (channels, plugin ? plugin->getTotalNumOutputChannels() : channels),
                                    blockSize);
    std::int64_t rendered {};
    const auto samplesPerBeat = renderSampleRate * 60.0 / data->tempo;
    while (rendered < totalSamples)
    {
        const auto count = static_cast<int> (std::min<std::int64_t> (blockSize, totalSamples - rendered));
        audio.clear();
        juce::MidiBuffer midi;
        addRangeToBuffer (*data, rendered / samplesPerBeat, (rendered + count) / samplesPerBeat, count, midi);
        if (plugin) plugin->processBlock (audio, midi);
        else builtInSynth.render (audio, midi, 0, count);
        if (! writer->writeFromAudioSampleBuffer (audio, 0, count))
            break;
        rendered += count;
        if (progress && (rendered % (blockSize * 64) == 0 || rendered == totalSamples))
            progress (rendered / static_cast<double> (totalSamples));
    }
    const auto completed = rendered == totalSamples;
    writer.reset();

    if (plugin)
    {
        plugin->releaseResources();
        plugin->setNonRealtime (false);
        plugin->setRateAndBufferSizeDetails (currentSampleRate.load(), currentBlockSize.load());
        plugin->prepareToPlay (currentSampleRate.load(), currentBlockSize.load());
    }
    builtInSynth.prepare (currentSampleRate.load());
    samplePosition.store (0);
    playing.store (wasPlaying);

    if (! completed)
    {
        targetFile.deleteFile();
        return juce::Result::fail ("Falha durante a renderizacao do audio.");
    }

    if (wantsMp3)
    {
        juce::ChildProcess encoder;
        const juce::StringArray command { "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                                          "-i", targetFile.getFullPathName(), "-codec:a", "libmp3lame",
                                          "-q:a", "2", requestedFile.getFullPathName() };
        if (! encoder.start (command) || ! encoder.waitForProcessToFinish (120000)
            || encoder.getExitCode() != 0)
        {
            targetFile.deleteFile();
            return juce::Result::fail ("Para exportar MP3, instale o ffmpeg e deixe-o disponivel no PATH.");
        }
        targetFile.deleteFile();
    }
    return juce::Result::ok();
}
}
