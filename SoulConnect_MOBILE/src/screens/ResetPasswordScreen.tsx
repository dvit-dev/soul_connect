import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TextInput, View} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {CheckCircle2} from 'lucide-react-native';
import {AuthAlert, AuthButton, AuthField, AuthLink, AuthScreen, authStyles} from '../components/auth/AuthUI';
import {RootStackParamList} from '../navigation/types';
import {resetPassword, verifyResetToken} from '../services/api';
import {colors, radii} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

const MIN_LENGTH = 6;

function strengthOf(password: string): {score: 0 | 1 | 2 | 3; label: string} {
  if (!password) {
    return {score: 0, label: ''};
  }
  let points = 0;
  if (password.length >= 8) {
    points += 1;
  }
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) {
    points += 1;
  }
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) {
    points += 1;
  }
  if (password.length < MIN_LENGTH) {
    return {score: 1, label: 'Too short'};
  }
  return points >= 3 ? {score: 3, label: 'Strong'} : points >= 1 ? {score: 2, label: 'Good'} : {score: 1, label: 'Weak'};
}

const STRENGTH_COLORS = [colors.borderSoft, colors.danger, colors.amber, colors.sage];

export function ResetPasswordScreen({navigation, route}: Props) {
  const token = route.params?.token || '';
  const [email, setEmail] = useState(route.params?.email || '');
  const [check, setCheck] = useState<{state: 'checking' | 'valid' | 'invalid' | 'offline'; message?: string}>(
    token ? {state: 'checking'} : {state: 'invalid', message: 'This reset link is missing or incomplete.'},
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{password?: string; confirm?: string}>({});
  const [formError, setFormError] = useState('');
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const confirmRef = useRef<TextInput>(null);
  const strength = strengthOf(password);

  const goToLogin = () => navigation.reset({index: 0, routes: [{name: 'Home'}, {name: 'Login'}]});
  const requestNewLink = () => navigation.replace('ForgotPassword', {email});

  const runCheck = useCallback(async () => {
    if (!token) {
      return;
    }
    setCheck({state: 'checking'});
    const result = await verifyResetToken(token);
    if (result.network) {
      setCheck({state: 'offline', message: result.message});
    } else if (result.valid) {
      if (result.email) {
        setEmail(result.email);
      }
      setCheck({state: 'valid'});
    } else {
      setCheck({state: 'invalid', message: result.message});
    }
  }, [token]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  const onSubmit = async () => {
    const next: {password?: string; confirm?: string} = {};
    if (password.length < MIN_LENGTH) {
      next.password = `Use at least ${MIN_LENGTH} characters`;
    }
    if (!confirm) {
      next.confirm = 'Re-enter your new password';
    } else if (confirm !== password) {
      next.confirm = "Passwords don't match";
    }
    setErrors(next);
    if (Object.keys(next).length || working) {
      return;
    }
    setFormError('');
    setWorking(true);
    const result = await resetPassword(token, password);
    setWorking(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setDone(true);
  };

  if (check.state === 'checking') {
    return (
      <AuthScreen title="Checking your link" subtitle="One moment…" onBack={goToLogin} backLabel="Sign in">
        <ActivityIndicator color={colors.plum} size="large" style={styles.spinner} />
      </AuthScreen>
    );
  }

  if (check.state === 'offline') {
    return (
      <AuthScreen title="You're offline" subtitle={check.message} onBack={goToLogin} backLabel="Sign in">
        <AuthButton label="Try again" onPress={runCheck} />
      </AuthScreen>
    );
  }

  if (check.state === 'invalid') {
    return (
      <AuthScreen
        title="Link not valid"
        subtitle={`${check.message || 'This reset link is invalid or has expired.'} Request a new one and open it from your email.`}
        onBack={goToLogin}
        backLabel="Sign in">
        <AuthButton label="Request a new link" onPress={requestNewLink} />
      </AuthScreen>
    );
  }

  if (done) {
    return (
      <AuthScreen title="Password updated" subtitle="Your password has been changed successfully." showLogo={false}>
        <View style={styles.iconWrap}>
          <CheckCircle2 color={colors.sage} size={56} />
        </View>
        <Text style={styles.doneText}>You can now sign in with your new password.</Text>
        <AuthButton label="Sign in" onPress={goToLogin} />
      </AuthScreen>
    );
  }

  const expired = /expired|invalid|tampered|malformed/i.test(formError);

  return (
    <AuthScreen
      title="Set a new password"
      subtitle={email ? `For ${email}` : 'Choose a password you haven’t used before.'}
      onBack={goToLogin}
      backLabel="Sign in">
      <AuthAlert message={formError} />
      {expired ? <AuthButton variant="outline" label="Request a new link" onPress={requestNewLink} /> : null}
      <AuthField
        first={!expired}
        label="New password"
        value={password}
        onChangeText={value => {
          setPassword(value);
          setErrors(e => ({...e, password: undefined}));
        }}
        error={errors.password}
        password
        placeholder={`At least ${MIN_LENGTH} characters`}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus()}
        editable={!working}
      />
      {password ? (
        <View style={styles.meterRow}>
          {[1, 2, 3].map(i => (
            <View
              key={i}
              style={[styles.meterBar, {backgroundColor: i <= strength.score ? STRENGTH_COLORS[strength.score] : colors.borderSoft}]}
            />
          ))}
          <Text style={[styles.meterLabel, {color: STRENGTH_COLORS[strength.score]}]}>{strength.label}</Text>
        </View>
      ) : (
        <Text style={authStyles.hint}>Tip: mix upper and lower case, numbers and symbols.</Text>
      )}
      <AuthField
        ref={confirmRef}
        label="Confirm new password"
        value={confirm}
        onChangeText={value => {
          setConfirm(value);
          setErrors(e => ({...e, confirm: undefined}));
        }}
        error={errors.confirm}
        password
        placeholder="Re-enter password"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!working}
      />
      <AuthButton label="Update password" onPress={onSubmit} loading={working} />
      <View style={styles.footerGap}>
        <AuthLink label="Back to sign in" onPress={goToLogin} />
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  iconWrap: {alignItems: 'center', marginBottom: 12},
  spinner: {marginVertical: 12},
  doneText: {color: colors.ink60, fontSize: 15, lineHeight: 22, textAlign: 'center'},
  meterRow: {flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6},
  meterBar: {flex: 1, height: 4, borderRadius: radii.pill},
  meterLabel: {fontSize: 12, fontWeight: '700', marginLeft: 6, minWidth: 60, textAlign: 'right'},
  footerGap: {marginTop: 18},
});
