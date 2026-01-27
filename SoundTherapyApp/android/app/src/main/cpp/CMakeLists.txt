cmake_minimum_required(VERSION 3.18.1)

project("soundtherapyapp")

add_library(
    native-audio-lib
    SHARED
    AudioEngine.cpp
    native-lib.cpp
)

find_library(
    log-lib
    log
)

target_link_libraries(
    native-audio-lib
    ${log-lib}
)
