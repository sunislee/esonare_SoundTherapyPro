import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Text, TouchableOpacity, Image, Linking, Alert, InteractionManager } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

interface PolicyWebViewRouteParams {
  url: string;
  fallbackUrl?: string;
  title: string;
}

// 预加载缓存
const preloadCache = new Map();

const PolicyWebView = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { url, title, fallbackUrl } = route.params as PolicyWebViewRouteParams;
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const webViewRef = React.useRef<WebView>(null);

  const isChinese = i18n.language?.startsWith('zh');

  // 预加载逻辑
  useEffect(() => {
    // 检查是否有预加载缓存
    if (preloadCache.has(url)) {
      console.log('[PolicyWebView] Using preloaded cache for:', url);
      setLoading(false);
    }
    
    // 预加载其他协议页面（如果当前不是隐私政策）
    if (url.includes('/legal/index.html')) {
      preloadUrl('https://sunislee.github.io/esonare_SoundTherapyPro/legal/terms.html');
    } else if (url.includes('/legal/terms.html')) {
      preloadUrl('https://sunislee.github.io/esonare_SoundTherapyPro/legal/index.html');
    }
  }, [url]);

  const preloadUrl = (preloadUrl: string) => {
    if (!preloadCache.has(preloadUrl)) {
      console.log('[PolicyWebView] Preloading:', preloadUrl);
      preloadCache.set(preloadUrl, true);
    }
  };

  console.log('[PolicyWebView] URL:', url);
  console.log('[PolicyWebView] Title:', title);

  const handleNavigationStateChange = (navState: any) => {
    console.log('[PolicyWebView] Navigation state changed:', navState.loading, navState.url);
    
    // 双重拦截 mailto: 链接（防止 onShouldStartLoadWithRequest 未触发）
    if (navState.url && navState.url.startsWith('mailto:')) {
      console.log('[PolicyWebView] Detected mailto in navigation, handling...');
      handleMailToLink(navState.url);
      return;
    }
    
    // 只在真正加载时设置 loading，避免覆盖 handleLoadEnd
    if (navState.loading) {
      setLoading(true);
    }
    if (!navState.loading && navState.url === 'about:blank') {
      setError(true);
    }
  };

  // 处理 mailto 链接的函数
  const handleMailToLink = async (url: string) => {
    console.log('[PolicyWebView] Attempting to open mailto link:', url);
    
    try {
      // 直接尝试打开，不先检查 canOpenURL
      // 因为 canOpenURL 可能返回 true（系统有邮件应用选择器）
      await Linking.openURL(url);
    } catch (err: any) {
      console.error('[PolicyWebView] Failed to open mailto link:', err);
      
      // 打开失败，显示友好提示
      Alert.alert(
        isChinese ? '提示' : 'Notice',
        isChinese 
          ? '未检测到已配置的邮件应用。请先安装或配置邮件账户，或手动联系：iamlishang@gmail.com'
          : 'No email app found. Please install or configure an email account, or contact us at iamlishang@gmail.com manually.'
      );
    }
  };

  const handleLoadEnd = () => {
    console.log('[PolicyWebView] Load end triggered');
    // 强制设置为非 loading 状态
    setLoading(false);
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    console.error('[PolicyWebView] WebView error:', nativeEvent);
    
    // 如果是 mailto 协议错误，忽略它（已经处理了）
    if (nativeEvent.url && nativeEvent.url.startsWith('mailto:')) {
      console.log('[PolicyWebView] Ignoring mailto error, already handled');
      return;
    }
    
    // 如果是本地文件加载失败且有备用 URL，切换到网络 URL
    if (fallbackUrl && currentUrl.startsWith('file:///android_asset/')) {
      console.log('[PolicyWebView] Local file failed, falling back to:', fallbackUrl);
      setCurrentUrl(fallbackUrl);
      setLoading(true);
      return;
    }
    
    setLoading(false);
    setError(true);
  };

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  // 拦截 mailto: 链接，调用系统邮件应用
  const handleShouldStartLoadWithRequest = (request: any) => {
    const { url } = request;
    console.log('[PolicyWebView] onShouldStartLoadWithRequest:', url);
    
    // 如果是 mailto 链接，直接处理并阻止 WebView 加载
    if (url && url.startsWith('mailto:')) {
      console.log('[PolicyWebView] Handling mailto link immediately...');
      // 使用 InteractionManager 确保在下一帧执行，避免阻塞 WebView
      InteractionManager.runAfterInteractions(() => {
        handleMailToLink(url);
      });
      return false;
    }
    
    return true;
  };

  if (error) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => navigation.goBack()} 
            style={styles.backButton}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.placeholder} />
        </View>
        
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠</Text>
          <Text style={styles.errorTitle}>无法加载页面</Text>
          <Text style={styles.errorText}>请检查网络连接或稍后重试</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>重新加载</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 自定义 Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Loading 指示器 */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#6C5DD3" />
        </View>
      )}
      
      <WebView
        ref={webViewRef}
        source={{ uri: currentUrl }}
        style={styles.webview}
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onNavigationStateChange={handleNavigationStateChange}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={Platform.OS === 'android'}
        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36"
        androidHardwareAccelerationDisabled={false}
        cacheEnabled={true}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        mixedContentMode="always"
        incognito={false}
        backgroundColor="#FFFFFF"
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6C5DD3" />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        )}
        applicationNameForUserAgent="HeartSoundMeditation/1.3.2"
        allowsBackForwardNavigationGestures={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        textZoom={100}
        androidLayerType="software"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F111A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    backgroundColor: '#0F111A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    padding: 4,
  },
  backButtonText: {
    fontSize: 36,
    fontWeight: '300',
    color: '#FFFFFF',
    lineHeight: 36,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 32,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 16,
    color: '#6C5DD3',
    marginTop: 12,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 24,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: '#6C5DD3',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});

export default PolicyWebView;
