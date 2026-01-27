#include <jni.h>
#include <string>
#include <android/log.h>
#include "AudioEngine.h"

#define LOG_TAG "NativeAudioLib"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

static AudioEngine *engine = nullptr;

extern "C" JNIEXPORT jboolean JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeInitialize(
        JNIEnv *env,
        jobject thiz,
        jint sample_rate,
        jint buffer_size) {
    LOGD("JNI: nativeInitialize called with sample_rate: %d, buffer_size: %d", sample_rate, buffer_size);
    if (engine == nullptr) {
        LOGD("JNI: Creating new AudioEngine");
        engine = new AudioEngine();
    }
    bool result = engine->initialize(sample_rate, buffer_size);
    LOGD("JNI: AudioEngine::initialize returned: %s", result ? "true" : "false");
    return result;
}

extern "C" JNIEXPORT void JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeCleanup(
        JNIEnv *env,
        jobject thiz) {
    if (engine != nullptr) {
        engine->cleanup();
        delete engine;
        engine = nullptr;
    }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeLoadAudioFile(
        JNIEnv *env,
        jobject thiz,
        jstring file_path,
        jint track_id) {
    if (engine == nullptr) return false;
    
    const char *path = env->GetStringUTFChars(file_path, nullptr);
    bool result = engine->loadAudioFile(path, track_id);
    env->ReleaseStringUTFChars(file_path, path);
    return result;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeStartMixing(
        JNIEnv *env,
        jobject thiz) {
    if (engine == nullptr) return false;
    return engine->startMixing();
}

extern "C" JNIEXPORT void JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeStopMixing(
        JNIEnv *env,
        jobject thiz) {
    if (engine != nullptr) {
        engine->stopMixing();
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeSetVolume(
        JNIEnv *env,
        jobject thiz,
        jint track_id,
        jfloat volume_db) {
    if (engine != nullptr) {
        engine->setVolume(track_id, volume_db);
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_soundtherapyapp_NativeAudioModule_nativeSetMasterVolume(
        JNIEnv *env,
        jobject thiz,
        jfloat volume_db) {
    if (engine != nullptr) {
        engine->setMasterVolume(volume_db);
    }
}
