cmake_minimum_required(VERSION 3.24)

project(PulseForgeMIDI VERSION 0.9.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

option(PULSEFORGE_BUILD_TESTS "Build the dependency-free core tests" ON)
set(PULSEFORGE_JUCE_PATH "" CACHE PATH "Path to an existing JUCE 9 checkout")

if(PULSEFORGE_JUCE_PATH)
    add_subdirectory("${PULSEFORGE_JUCE_PATH}" "${CMAKE_BINARY_DIR}/JUCE")
else()
    include(FetchContent)
    FetchContent_Declare(
        JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 9.0.1
        GIT_SHALLOW TRUE
    )
    FetchContent_MakeAvailable(JUCE)
endif()

juce_add_gui_app(PulseForge
    PRODUCT_NAME "PulseForge MIDI"
    COMPANY_NAME "PulseForge Open Audio"
    BUNDLE_ID "audio.pulseforge.midistudio"
    VERSION "${PROJECT_VERSION}"
)

target_sources(PulseForge PRIVATE
    src/AudioEngine.cpp
    src/AudioEngine.h
    src/BuiltInSynth.cpp
    src/BuiltInSynth.h
    src/CoreTypes.h
    src/Main.cpp
    src/MainComponent.cpp
    src/MainComponent.h
    src/MidiDocument.cpp
    src/MidiDocument.h
    src/MidiFileIO.cpp
    src/MidiFileIO.h
    src/PianoRollComponent.cpp
    src/PianoRollComponent.h
    src/PluginWindow.h
    src/ProjectIO.cpp
    src/ProjectIO.h
    src/Quantizer.cpp
    src/Quantizer.h
    src/ScoreComponent.cpp
    src/ScoreComponent.h
)

target_compile_definitions(PulseForge PRIVATE
    JUCE_APPLICATION_NAME_STRING="$<TARGET_PROPERTY:PulseForge,JUCE_PRODUCT_NAME>"
    JUCE_APPLICATION_VERSION_STRING="${PROJECT_VERSION}"
    JUCE_DISPLAY_SPLASH_SCREEN=0
    JUCE_REPORT_APP_USAGE=0
    JUCE_USE_CURL=0
    JUCE_WEB_BROWSER=0
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_AU=$<BOOL:${APPLE}>
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(PulseForge PRIVATE
    juce::juce_audio_basics
    juce::juce_audio_devices
    juce::juce_audio_formats
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_core
    juce::juce_dsp
    juce::juce_gui_basics
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags
    juce::juce_recommended_warning_flags
)

if(MSVC)
    target_compile_options(PulseForge PRIVATE /permissive- /Zc:__cplusplus)
endif()

install(TARGETS PulseForge
    BUNDLE DESTINATION .
    RUNTIME DESTINATION bin
)

if(PULSEFORGE_BUILD_TESTS)
    enable_testing()
    add_executable(pulseforge_core_tests
        tests/CoreTests.cpp
        src/MidiDocument.cpp
        src/Quantizer.cpp
    )
    target_include_directories(pulseforge_core_tests PRIVATE src)
    if(MSVC)
        target_compile_options(pulseforge_core_tests PRIVATE /W4 /permissive-)
    else()
        target_compile_options(pulseforge_core_tests PRIVATE -Wall -Wextra -Wpedantic)
    endif()
    add_test(NAME pulseforge_core COMMAND pulseforge_core_tests)
endif()
