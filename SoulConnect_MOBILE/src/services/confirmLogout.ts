import {Alert} from 'react-native';

/** Asks the user to confirm before logging out; runs `onConfirm` only on "Yes". */
export function confirmLogout(onConfirm: () => void | Promise<void>) {
  Alert.alert(
    'Logout',
    'Are you sure you want to logout?',
    [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Yes', style: 'destructive', onPress: () => onConfirm()},
    ],
    {cancelable: true},
  );
}
