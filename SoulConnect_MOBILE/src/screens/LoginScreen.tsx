import React, {useRef, useState} from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {AuthAlert, AuthButton, AuthField, AuthLink, AuthScreen, authStyles} from '../components/auth/AuthUI';
import {useAuth} from '../context/AuthContext';
import {RootStackParamList} from '../navigation/types';
import {loginWithPassword} from '../services/api';
import {isStaffRole, primaryRole, rolesFromToken} from '../services/pkce';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({navigation}: Props) {
  const {signIn} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{email?: string; password?: string}>({});
  const [formError, setFormError] = useState('');
  const [working, setWorking] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const validate = () => {
    const next: {email?: string; password?: string} = {};
    const trimmed = email.trim();
    if (!trimmed) {
      next.email = 'Enter your email address';
    } else if (!EMAIL_RE.test(trimmed)) {
      next.email = 'Enter a valid email address';
    }
    if (!password) {
      next.password = 'Enter your password';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async () => {
    setFormError('');
    if (working || !validate()) {
      return;
    }
    setWorking(true);
    try {
      const tokens = await loginWithPassword(email.trim(), password);
      await signIn({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
      });
      const role = primaryRole(rolesFromToken(tokens.access_token));
      navigation.reset({
        index: 0,
        routes: [{name: isStaffRole(role) ? 'StaffApp' : 'CustomerApp'}],
      });
    } catch (err: any) {
      setFormError(err?.message || 'Sign-in failed');
      setWorking(false);
    }
  };

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to continue your journey"
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      footer={
        <AuthLink
          muted="New to Soul Connect?"
          label="Create a free profile"
          onPress={() => navigation.replace('Register')}
        />
      }>
      <AuthAlert message={formError} />
      <AuthField
        first
        label="Email address"
        value={email}
        onChangeText={value => {
          setEmail(value);
          setErrors(e => ({...e, email: undefined}));
        }}
        error={errors.email}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!working}
      />
      <AuthField
        ref={passwordRef}
        label="Password"
        labelAccessory={
          <Pressable hitSlop={8} onPress={() => navigation.navigate('ForgotPassword', {email: email.trim()})}>
            <Text style={authStyles.smallLink}>Forgot password?</Text>
          </Pressable>
        }
        value={password}
        onChangeText={value => {
          setPassword(value);
          setErrors(e => ({...e, password: undefined}));
        }}
        error={errors.password}
        password
        placeholder="Your password"
        autoComplete="password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!working}
      />
      <AuthButton label="Sign In" onPress={onSubmit} loading={working} />
    </AuthScreen>
  );
}
