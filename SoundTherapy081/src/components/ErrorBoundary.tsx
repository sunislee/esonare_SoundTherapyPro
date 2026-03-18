import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { withTranslation, WithTranslation } from 'react-i18next';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    const { t } = this.props;
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('error.boundaryTitle')}</Text>
          <Text style={styles.subErrorText}>{t('error.restartApp')}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#000',
  },
  subErrorText: {
    fontSize: 14,
    color: '#666',
  },
});

export default withTranslation()(ErrorBoundary);
