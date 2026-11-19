import React, {forwardRef, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, radii} from '../../theme/colors';
import {centered, maxWidths, useResponsive} from '../../theme/responsive';

/** Shared page shell for sign-in, forgot-password and reset-password screens. */
export function AuthScreen({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  showLogo = true,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  showLogo?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const r = useResponsive();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: r.gutter},
            centered(maxWidths.form),
            !r.isCompact && styles.contentCentered,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {onBack ? (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={onBack} style={styles.back}>
              <Text style={styles.backText}>←  {backLabel}</Text>
            </Pressable>
          ) : null}
          {showLogo ? (
            <View style={styles.logoCard}>
              <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.card}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthAlert({message, tone = 'error'}: {message?: string; tone?: 'error' | 'success' | 'info'}) {
  if (!message) {
    return null;
  }
  return (
    <View style={[styles.alert, tone === 'success' && styles.alertSuccess, tone === 'info' && styles.alertInfo]}>
      <Text
        style={[
          styles.alertText,
          tone === 'success' && styles.alertTextSuccess,
          tone === 'info' && styles.alertTextInfo,
        ]}>
        {message}
      </Text>
    </View>
  );
}

type AuthFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  error?: string;
  /** Renders a Show/Hide toggle and masks the value. */
  password?: boolean;
  /** Element shown at the right of the label row (e.g. "Forgot password?"). */
  labelAccessory?: React.ReactNode;
  first?: boolean;
};

export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  {label, error, password, labelAccessory, first, onFocus, onBlur, ...input},
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={!first && styles.fieldGap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {labelAccessory}
      </View>
      <View style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.ink40}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={password && !visible}
          {...input}
          onFocus={e => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={styles.inputText}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setVisible(v => !v)}>
            <Text style={styles.toggle}>{visible ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

export function AuthButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}) {
  const outline = variant === 'outline';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={loading || disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        outline && styles.buttonOutline,
        pressed && styles.pressed,
        (loading || disabled) && styles.buttonBusy,
      ]}>
      {loading ? (
        <ActivityIndicator color={outline ? colors.plum : colors.white} />
      ) : (
        <Text style={[styles.buttonText, outline && styles.buttonTextOutline]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function AuthLink({label, onPress, muted}: {label: string; onPress: () => void; muted?: string}) {
  return (
    <View style={styles.linkRow}>
      {muted ? <Text style={styles.footerText}>{muted} </Text> : null}
      <Pressable hitSlop={8} onPress={onPress}>
        <Text style={styles.footerLink}>{label}</Text>
      </Pressable>
    </View>
  );
}

export const authStyles = StyleSheet.create({
  smallLink: {color: colors.plum, fontSize: 13, fontWeight: '600'},
  hint: {color: colors.ink40, fontSize: 12, marginTop: 6},
});

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.surface},
  fill: {flex: 1},
  content: {flexGrow: 1, paddingBottom: 28},
  contentCentered: {justifyContent: 'center'},
  back: {alignSelf: 'flex-start', paddingVertical: 12},
  backText: {color: colors.ink60, fontSize: 15, fontWeight: '600'},
  logoCard: {alignSelf: 'center', marginTop: 12, borderRadius: radii.md, overflow: 'hidden'},
  logo: {width: 210, height: 70},
  title: {marginTop: 28, fontSize: 28, fontWeight: '800', color: colors.ink, textAlign: 'center'},
  subtitle: {marginTop: 6, fontSize: 15, lineHeight: 22, color: colors.ink60, textAlign: 'center'},
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
  alert: {backgroundColor: '#FEF2F2', borderRadius: radii.sm, padding: 12, marginBottom: 16},
  alertSuccess: {backgroundColor: colors.sageLight},
  alertInfo: {backgroundColor: colors.plumLight},
  alertText: {color: colors.danger, fontSize: 14, fontWeight: '500', lineHeight: 20},
  alertTextSuccess: {color: colors.sage},
  alertTextInfo: {color: colors.plumDark},
  fieldGap: {marginTop: 18},
  labelRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8},
  label: {color: colors.ink80, fontSize: 13, fontWeight: '600'},
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
  },
  inputFocused: {borderColor: colors.plum, backgroundColor: colors.white},
  inputError: {borderColor: colors.danger},
  inputText: {flex: 1, paddingVertical: 13, color: colors.ink, fontSize: 16},
  toggle: {color: colors.plum, fontSize: 14, fontWeight: '600', paddingLeft: 10},
  error: {color: colors.danger, fontSize: 12, marginTop: 6},
  button: {
    marginTop: 26,
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.plum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonOutline: {backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.plum, marginTop: 12},
  buttonBusy: {opacity: 0.7},
  pressed: {opacity: 0.88},
  buttonText: {color: colors.white, fontSize: 17, fontWeight: '700'},
  buttonTextOutline: {color: colors.plum},
  footer: {marginTop: 26},
  linkRow: {flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap'},
  footerText: {color: colors.ink60, fontSize: 15},
  footerLink: {color: colors.plum, fontSize: 15, fontWeight: '700'},
});
