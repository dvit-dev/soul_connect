import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../context/AuthContext';
import {RootStackParamList} from '../navigation/types';
import {forgotPasswordUrl, loginWithPassword} from '../services/api';
import {isStaffRole, primaryRole, rolesFromToken} from '../services/pkce';
import {colors, radii} from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginScreen({navigation}: Props) {
  const {signIn} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{email?: string; password?: string}>({});
  const [formError, setFormError] = useState('');
  const [working, setWorking] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);
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
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => navigation.goBack()}
            style={styles.back}>
            <Text style={styles.backText}>←  Back</Text>
          </Pressable>

          <View style={styles.logoCard}>
            <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue your journey</Text>

          <View style={styles.card}>
            {formError ? (
              <View style={styles.alert}>
                <Text style={styles.alertText}>{formError}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Email address</Text>
            <TextInput
              value={email}
              onChangeText={value => {
                setEmail(value);
                if (errors.email) {
                  setErrors(e => ({...e, email: undefined}));
                }
              }}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              placeholder="you@example.com"
              placeholderTextColor={colors.ink40}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!working}
              style={[
                styles.input,
                focused === 'email' && styles.inputFocused,
                errors.email ? styles.inputError : null,
              ]}
            />
            {errors.email ? <Text style={styles.error}>{errors.email}</Text> : null}

            <View style={styles.passwordHeader}>
              <Text style={styles.label}>Password</Text>
              <Pressable hitSlop={8} onPress={() => Linking.openURL(forgotPasswordUrl())}>
                <Text style={styles.link}>Forgot password?</Text>
              </Pressable>
            </View>
            <View
              style={[
                styles.input,
                styles.passwordRow,
                focused === 'password' && styles.inputFocused,
                errors.password ? styles.inputError : null,
              ]}>
              <TextInput
                ref={passwordRef}
                value={password}
                onChangeText={value => {
                  setPassword(value);
                  if (errors.password) {
                    setErrors(e => ({...e, password: undefined}));
                  }
                }}
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                placeholder="Your password"
                placeholderTextColor={colors.ink40}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                editable={!working}
                style={styles.passwordInput}
              />
              <Pressable hitSlop={10} onPress={() => setShowPassword(v => !v)}>
                <Text style={styles.toggle}>{showPassword ? 'Hide' : 'Show'}</Text>
              </Pressable>
            </View>
            {errors.password ? <Text style={styles.error}>{errors.password}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={working}
              onPress={onSubmit}
              style={({pressed}) => [styles.submit, pressed && styles.pressed, working && styles.submitBusy]}>
              {working ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitText}>Sign In</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New to Soul Connect? </Text>
            <Pressable hitSlop={8} onPress={() => navigation.replace('Register')}>
              <Text style={styles.footerLink}>Create a free profile</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.surface},
  fill: {flex: 1},
  content: {flexGrow: 1, paddingHorizontal: 22, paddingBottom: 28},
  back: {alignSelf: 'flex-start', paddingVertical: 12},
  backText: {color: colors.ink60, fontSize: 15, fontWeight: '600'},
  logoCard: {
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  logo: {width: 210, height: 70},
  title: {
    marginTop: 28,
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: colors.ink60,
    textAlign: 'center',
  },
  card: {
    marginTop: 28,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
    elevation: 2,
  },
  alert: {
    backgroundColor: '#FEF2F2',
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 16,
  },
  alertText: {color: colors.danger, fontSize: 14, fontWeight: '500'},
  label: {color: colors.ink80, fontSize: 13, fontWeight: '600', marginBottom: 8},
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: colors.ink,
    fontSize: 16,
  },
  inputFocused: {borderColor: colors.plum, backgroundColor: colors.white},
  inputError: {borderColor: colors.danger},
  error: {color: colors.danger, fontSize: 12, marginTop: 6},
  passwordHeader: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  link: {color: colors.plum, fontSize: 13, fontWeight: '600'},
  passwordRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 0},
  passwordInput: {flex: 1, paddingVertical: 13, color: colors.ink, fontSize: 16},
  toggle: {color: colors.plum, fontSize: 14, fontWeight: '600', paddingLeft: 10},
  submit: {
    marginTop: 26,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.plum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBusy: {opacity: 0.8},
  pressed: {opacity: 0.88},
  submitText: {color: colors.white, fontSize: 17, fontWeight: '700'},
  footer: {
    marginTop: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  footerText: {color: colors.ink60, fontSize: 15},
  footerLink: {color: colors.plum, fontSize: 15, fontWeight: '700'},
});
