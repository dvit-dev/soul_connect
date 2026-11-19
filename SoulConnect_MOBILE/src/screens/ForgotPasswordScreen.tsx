import React, {useEffect, useState} from 'react';
import {Linking, Platform, StyleSheet, Text, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Mail} from 'lucide-react-native';
import {AuthAlert, AuthButton, AuthField, AuthLink, AuthScreen} from '../components/auth/AuthUI';
import {RootStackParamList} from '../navigation/types';
import {requestPasswordReset} from '../services/api';
import {colors} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ForgotPassword'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export function ForgotPasswordScreen({navigation, route}: Props) {
  const [email, setEmail] = useState(route.params?.email || '');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [working, setWorking] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const send = async (address: string) => {
    setFormError('');
    setWorking(true);
    const result = await requestPasswordReset(address);
    setWorking(false);
    if (!result.ok) {
      setFormError(result.message);
      return false;
    }
    setSentTo(address);
    setCountdown(RESEND_SECONDS);
    return true;
  };

  const onSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError('Enter your email address');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError('Enter a valid email address');
      return;
    }
    if (!working) {
      await send(trimmed);
    }
  };

  const onResend = async () => {
    if (countdown > 0 || working) {
      return;
    }
    setResent(false);
    if (await send(sentTo)) {
      setResent(true);
    }
  };

  const openMailApp = () => {
    const url = Platform.OS === 'ios' ? 'message://' : 'mailto:';
    Linking.openURL(url).catch(() => undefined);
  };

  const backToLogin = () => navigation.navigate('Login');

  if (sentTo) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle="We've sent a link to reset your password."
        onBack={() => {
          setSentTo('');
          setResent(false);
        }}
        showLogo={false}
        footer={<AuthLink muted="Remembered it?" label="Back to sign in" onPress={backToLogin} />}>
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Mail color={colors.plum} size={34} />
          </View>
        </View>
        <Text style={styles.sentText}>
          If an account exists for{'\n'}
          <Text style={styles.sentEmail}>{sentTo}</Text>
          {'\n'}you'll get an email with a reset link. It expires in 30 minutes.
        </Text>
        <AuthAlert message={formError} />
        <AuthAlert message={resent ? 'A new reset link is on its way.' : ''} tone="success" />
        <Text style={styles.tip}>Open the link on this phone to set a new password in the app. Can't find it? Check your spam folder.</Text>
        <AuthButton label="Open email app" onPress={openMailApp} />
        <AuthButton
          variant="outline"
          label={countdown > 0 ? `Resend link in ${countdown}s` : 'Resend link'}
          onPress={onResend}
          loading={working}
          disabled={countdown > 0}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Forgot password?"
      subtitle="Enter the email you registered with and we'll send you a link to reset it."
      onBack={() => navigation.goBack()}
      footer={<AuthLink muted="Remembered it?" label="Back to sign in" onPress={backToLogin} />}>
      <AuthAlert message={formError} />
      <AuthField
        first
        label="Email address"
        value={email}
        onChangeText={value => {
          setEmail(value);
          setFieldError('');
          setFormError('');
        }}
        error={fieldError}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={onSubmit}
        editable={!working}
        autoFocus={!email}
      />
      <AuthButton label="Send reset link" onPress={onSubmit} loading={working} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  iconWrap: {alignItems: 'center', marginBottom: 16},
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.plumLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentText: {color: colors.ink60, fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 16},
  sentEmail: {color: colors.ink, fontWeight: '700'},
  tip: {color: colors.ink40, fontSize: 13, lineHeight: 19, textAlign: 'center'},
});
