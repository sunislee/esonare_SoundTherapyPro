#ifndef AUDIOENGINE_H
#define AUDIOENGINE_H

#include <memory>

// AudioEngine类：雨夜书屋音频混音核心引擎
class AudioEngine {
public:
    // 构造函数和析构函数
    AudioEngine();
    ~AudioEngine();

    // 音频引擎初始化和清理
    bool initialize(int sampleRate = 44100, int bufferSize = 512);
    void cleanup();

    // 音频混合控制
    bool loadAudioFile(const char* filePath, int trackId);
    bool startMixing();
    void stopMixing();
    
    // 音量控制 (dB值)
    void setVolume(int trackId, float volumeDb);
    void setMasterVolume(float volumeDb);
    
    // 滤波控制
    void setLowPassFilter(int trackId, float frequency);
    void enableLowPassFilter(int trackId, bool enabled);
    
    // 音轨管理
    bool addTrack(const char* name);
    void removeTrack(int trackId);
    void clearAllTracks();
    
    // 状态查询
    bool isInitialized() const { return m_initialized; }
    bool isMixing() const { return m_isMixing; }
    int getSampleRate() const { return m_sampleRate; }
    int getBufferSize() const { return m_bufferSize; }

private:
    // 私有成员变量
    bool m_initialized;
    bool m_isMixing;
    int m_sampleRate;
    int m_bufferSize;
    float m_masterVolume;
    
    // Superpowered SDK组件占位符
    void* m_headphoneReminder;
    void* m_audioIO;
    
    // 内部方法
    void initializeAudioGraph();
    void setupAudioRoutes();
};

#endif // AUDIOENGINE_H