import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, Text, TouchableOpacity, Image, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PolicyWebViewRouteParams {
  url: string;
  title: string;
}

const PolicyWebView = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { url, title } = route.params as PolicyWebViewRouteParams;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const webViewRef = React.useRef<WebView>(null);

  console.log('[PolicyWebView] URL:', url);
  console.log('[PolicyWebView] Title:', title);

  const handleNavigationStateChange = (navState: any) => {
    console.log('[PolicyWebView] Navigation state changed:', navState.loading, navState.url);
    // 只在真正加载时设置 loading，避免覆盖 handleLoadEnd
    if (navState.loading) {
      setLoading(true);
    }
    if (!navState.loading && navState.url === 'about:blank') {
      setError(true);
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
    setLoading(false);
    setError(true);
  };

  const handleRetry = () => {
    setError(false);
    setLoading(true);
    webViewRef.current?.reload();
  };

  // 拦截 mailto: 链接，调用系统邮件应用
  const handleShouldStartLoadWithRequest = (event: any) => {
    const { url } = event;
    console.log('[PolicyWebView] Intercepting URL:', url);
    
    if (url.startsWith('mailto:')) {
      // 拦截 mailto 链接，使用 Linking 打开
      Linking.openURL(url).catch(err => {
        console.error('[PolicyWebView] Failed to open mailto link:', err);
      });
      // 阻止 WebView 加载此 URL
      return false;
    }
    
    // 允许加载其他 URL
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
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        startInLoadingState={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={Platform.OS === 'android'}
        userAgent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36"
        androidHardwareAccelerationDisabled={false}
        cacheEnabled={false}
        thirdPartyCookiesEnabled={true}
        sharedCookiesEnabled={true}
        mixedContentMode="always"
        incognito={true}
        backgroundColor="#FFFFFF"
        renderLoading={() => (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6C5DD3" />
          </View>
        )}
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
