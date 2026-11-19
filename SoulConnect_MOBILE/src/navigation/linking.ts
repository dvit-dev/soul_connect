import {LinkingOptions} from '@react-navigation/native';
import {RootStackParamList} from './types';

/**
 * Deep links that open screens in the app.
 * The password-reset email links to https://soulconect.com/reset_password?token=…&email=…
 * which opens the native Reset password screen when the app is installed.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['soulconnect://', 'https://soulconect.com', 'https://www.soulconect.com'],
  config: {
    screens: {
      ResetPassword: 'reset_password',
      ForgotPassword: 'forgot_password',
    },
  },
};
