import React, {useEffect, useState} from 'react';
import {Image, StatusBar, StyleSheet, View} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {AuthProvider, useAuth} from './src/context/AuthContext';
import {linking} from './src/navigation/linking';
import {RootNavigator} from './src/navigation/RootNavigator';
import {colors} from './src/theme/colors';

const MIN_SPLASH_MS = 4000;

function useSplashDone() {
  const {ready} = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);
  return ready && minTimeElapsed;
}

function Gate({splashDone}: {splashDone: boolean}) {
  if (!splashDone) {
    return (
      <View style={styles.boot}>
        <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
        <Image source={require('./src/assets/images/splash.jpg')} style={styles.splash} resizeMode="cover" />
      </View>
    );
  }
  return (
    <NavigationContainer linking={linking}>
      <RootNavigator />
    </NavigationContainer>
  );
}

function AppStatusBar({splashDone}: {splashDone: boolean}) {
  const insets = useSafeAreaInsets();
  if (!splashDone) {
    return null;
  }
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} translucent />
      <View pointerEvents="none" style={[styles.statusBar, {height: insets.top}]} />
    </>
  );
}

function AppContent() {
  const splashDone = useSplashDone();
  return (
    <>
      <Gate splashDone={splashDone} />
      <AppStatusBar splashDone={splashDone} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {flex: 1, backgroundColor: '#FFF8F2'},
  splash: {width: '100%', height: '100%'},
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    zIndex: 100,
    elevation: 100,
  },
});
