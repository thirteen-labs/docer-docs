import { useState, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, Fingerprint, Shield, EyeOff, LockKeyhole } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore } from '@/stores/settings-store';
import { storage } from '@/storage';
import { isNoteEncryptionEnabled, setNoteEncryptionEnabled } from '@/services/encryption-service';

const PIN_KEY = 'app_lock_pin_hash';

function hashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function getStoredPinHash(): string | null {
  return storage.getString(PIN_KEY) ?? null;
}

function setStoredPinHash(pin: string) {
  storage.set(PIN_KEY, hashPin(pin));
}

function clearStoredPinHash() {
  storage.remove(PIN_KEY);
}

function hasStoredPin(): boolean {
  return getStoredPinHash() !== null;
}

export function AppLockSetup() {
  const c = useTheme();
  const appLockEnabled = useSettingsStore((s) => s.appLockEnabled);
  const appLockType = useSettingsStore((s) => s.appLockType);
  const setAppLock = useSettingsStore((s) => s.setAppLock);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [pendingLockType, setPendingLockType] = useState<'pin' | 'biometric'>('pin');
  const [noteEncryption, setNoteEncryption] = useState(isNoteEncryptionEnabled());

  const handleToggle = () => {
    if (!appLockEnabled) {
      Alert.alert('Enable App Lock', 'Choose your preferred lock method:', [
        { text: 'PIN', onPress: () => { setPendingLockType('pin'); setShowPinSetup(true); setPin(''); setConfirmPin(''); setStep('enter'); } },
        { text: 'Biometric', onPress: async () => {
          const compatible = await LocalAuthentication.hasHardwareAsync();
          const enrolled = await LocalAuthentication.isEnrolledAsync();
          if (!compatible || !enrolled) {
            Alert.alert('Not Available', 'Biometric authentication is not available on this device. Set up a biometric (fingerprint/face) in your device settings first, or use a PIN instead.');
            return;
          }
          setPendingLockType('biometric');
          setShowPinSetup(true);
          setPin('');
          setConfirmPin('');
          setStep('enter');
        }},
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      clearStoredPinHash();
      setAppLock(false);
    }
  };

  const handleToggleNoteEncryption = () => {
    const newValue = !noteEncryption;
    Alert.alert(
      newValue ? 'Enable Note Encryption' : 'Disable Note Encryption',
      newValue
        ? 'New notes will be encrypted before saving. Existing notes will not be affected.'
        : 'New notes will be saved in plain text. Existing encrypted notes will still be decrypted when read.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: newValue ? 'Enable' : 'Disable', onPress: () => { setNoteEncryptionEnabled(newValue); setNoteEncryption(newValue); } },
      ]
    );
  };

  const handlePinSubmit = useCallback(() => {
    if (step === 'enter') {
      if (pin.length < 4) {
        Alert.alert('Too Short', 'PIN must be at least 4 digits.');
        return;
      }
      setStep('confirm');
      setConfirmPin('');
    } else {
      if (pin !== confirmPin) {
        Alert.alert('Mismatch', 'PINs do not match. Try again.');
        setStep('enter');
        setPin('');
        return;
      }
      setStoredPinHash(pin);
      setAppLock(true, pendingLockType);
      setShowPinSetup(false);
      setPin('');
      setConfirmPin('');
      if (pendingLockType === 'biometric') {
        Alert.alert('Enabled', 'App lock enabled with biometrics. PIN set as fallback.');
      } else {
        Alert.alert('Enabled', 'App lock enabled with PIN.');
      }
    }
  }, [pin, confirmPin, step, setAppLock, pendingLockType]);

  const renderPinSetup = () => (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: c.text, marginBottom: 12 }}>
        {step === 'enter' ? `Set a ${pendingLockType === 'biometric' ? 'fallback ' : ''}PIN code` : 'Confirm your PIN'}
      </Text>
      <Text style={{ fontSize: 13, color: c.textSecondary, marginBottom: 16 }}>
        {step === 'enter' && pendingLockType === 'biometric'
          ? 'This PIN will be used as a backup if biometric authentication fails or is unavailable.'
          : 'This PIN will be required to unlock the app.'}
      </Text>
      <TextInput
        value={step === 'confirm' ? confirmPin : pin}
        onChangeText={step === 'confirm' ? setConfirmPin : setPin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        placeholder="Enter PIN"
        placeholderTextColor={c.textTertiary}
        style={{
          backgroundColor: c.surface, borderRadius: 12, padding: 16, fontSize: 18,
          color: c.text, textAlign: 'center', letterSpacing: 8, marginBottom: 16,
          borderWidth: 1, borderColor: c.border,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <TouchableOpacity
          onPress={() => { setShowPinSetup(false); setPin(''); setConfirmPin(''); setStep('enter'); }}
          style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: 'center' }}
        >
          <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handlePinSubmit}
          style={{
            flex: 1, padding: 14, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center',
            opacity: (step === 'confirm' ? confirmPin : pin).length < 4 ? 0.5 : 1,
          }}
          disabled={(step === 'confirm' ? confirmPin : pin).length < 4}
        >
          <Text style={{ color: '#FFF', fontWeight: '600' }}>{step === 'enter' ? 'Next' : 'Confirm'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Shield size={24} color={c.primary} />
            <Text style={{ fontSize: 18, fontWeight: '600', color: c.text }}>App Lock</Text>
          </View>
          <TouchableOpacity
            style={{ width: 48, height: 28, borderRadius: 14, padding: 2, backgroundColor: appLockEnabled ? c.primary : c.border }}
            onPress={handleToggle}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFF', transform: [{ translateX: appLockEnabled ? 20 : 0 }] }} />
          </TouchableOpacity>
        </View>

        {showPinSetup && renderPinSetup()}

        {appLockEnabled && !showPinSetup && (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {appLockType === 'biometric' ? <Fingerprint size={22} color={c.primary} /> : <Lock size={22} color={c.primary} />}
              <View>
                <Text style={{ fontSize: 15, fontWeight: '500', color: c.text }}>
                  {appLockType === 'biometric' ? 'Biometric + PIN' : 'PIN'} Lock Active
                </Text>
                <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                  {appLockType === 'biometric' ? 'Use Face ID / Fingerprint, or PIN to unlock' : 'Enter PIN to unlock'}
                </Text>
              </View>
            </View>
          </View>
        )}

        <Text style={{ fontSize: 13, color: c.textTertiary, marginBottom: 24, lineHeight: 18 }}>
          When enabled, OmniDoc will require authentication when reopening the app after it has been in the background.
        </Text>

        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <LockKeyhole size={20} color={c.primary} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: c.text }}>Privacy</Text>
          </View>
          <View style={{ backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
              <LockKeyhole size={20} color={c.primary} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: c.text }}>Encrypt Notes</Text>
                <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                  Encode new notes before saving to database
                </Text>
              </View>
              <TouchableOpacity
                style={{ width: 44, height: 26, borderRadius: 13, padding: 2, backgroundColor: noteEncryption ? c.primary : c.border }}
                onPress={handleToggleNoteEncryption}
                accessibilityLabel={`Encrypt notes: ${noteEncryption ? 'on' : 'off'}`}
                accessibilityRole="switch"
                accessibilityState={{ checked: noteEncryption }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', transform: [{ translateX: noteEncryption ? 18 : 0 }] }} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <EyeOff size={20} color={c.primary} />
            <Text style={{ fontSize: 16, fontWeight: '600', color: c.text }}>Hidden Documents</Text>
          </View>
          <Text style={{ fontSize: 13, color: c.textSecondary, marginBottom: 8 }}>
            Hide sensitive documents from the main library. Hidden documents can be viewed by enabling &quot;Show Hidden&quot; in the library filter.
          </Text>
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <EyeOff size={22} color={c.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '500', color: c.text }}>How to Hide</Text>
                <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                  Long press any document → Properties → Toggle &quot;Hidden&quot;
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppLockGate({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  const appLockEnabled = useSettingsStore((s) => s.appLockEnabled);
  const appLockType = useSettingsStore((s) => s.appLockType);
  const [locked, setLocked] = useState(appLockEnabled);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [showPinFallback, setShowPinFallback] = useState(false);
  const [, setBiometricAttempted] = useState(false);
  const [biometricLockout, setBiometricLockout] = useState(false);

  const handleBiometric = useCallback(async (silent?: boolean) => {
    if (appLockType !== 'biometric') return;
    if (biometricLockout) return;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock OmniDoc',
      fallbackLabel: 'Use PIN',
      disableDeviceFallback: false,
    });
    if (result.success) {
      setLocked(false);
    } else {
      setBiometricAttempted(true);
      if (result.error === 'lockout') {
        setBiometricLockout(true);
        setShowPinFallback(true);
        setError('Too many failed attempts. Use your PIN.');
      } else if (result.error === 'user_fallback') {
        setShowPinFallback(true);
        setError('');
      } else {
        setShowPinFallback(true);
        setError('Biometric authentication failed. Use your PIN.');
      }
    }
  }, [appLockType, biometricLockout]);

  useEffect(() => {
    if (locked && appLockEnabled && appLockType === 'biometric') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleBiometric();
    }
  }, [locked, appLockEnabled, appLockType, handleBiometric]);

  const handlePinUnlock = useCallback(() => {
    const stored = getStoredPinHash();
    if (stored && hashPin(pinInput) === stored) {
      setLocked(false);
      setPinInput('');
      setError('');
      setShowPinFallback(false);
      setBiometricAttempted(false);
      setBiometricLockout(false);
    } else {
      setError('Incorrect PIN');
      setPinInput('');
    }
  }, [pinInput]);

  const retryBiometric = useCallback(() => {
    setShowPinFallback(false);
    setError('');
    setPinInput('');
    handleBiometric();
  }, [handleBiometric]);

  if (!appLockEnabled || !locked) return <>{children}</>;

  const showPinMode = appLockType === 'pin' || (appLockType === 'biometric' && showPinFallback);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: c.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Lock size={36} color={c.primary} />
        </View>
        <Text style={{ fontSize: 22, fontWeight: '700', color: c.text, marginBottom: 8 }}>OmniDoc Locked</Text>
        <Text style={{ fontSize: 14, color: c.textSecondary, textAlign: 'center', marginBottom: 32 }}>
          {showPinMode ? 'Enter your PIN to unlock' : 'Authenticate to continue'}
        </Text>

        {showPinMode ? (
          <>
            <TextInput
              value={pinInput}
              onChangeText={setPinInput}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              placeholder="Enter PIN"
              placeholderTextColor={c.textTertiary}
              autoFocus
              style={{
                backgroundColor: c.surface, borderRadius: 12, padding: 16, fontSize: 20,
                color: c.text, textAlign: 'center', letterSpacing: 10, marginBottom: 16,
                borderWidth: 1, borderColor: error ? c.error : c.border, width: '100%',
              }}
            />
            {error ? <Text style={{ color: c.error, fontSize: 13, marginBottom: 12 }}>{error}</Text> : null}
            <TouchableOpacity
              onPress={handlePinUnlock}
              style={{
                backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 48,
                opacity: pinInput.length < 4 ? 0.5 : 1, width: '100%', alignItems: 'center',
              }}
              disabled={pinInput.length < 4}
            >
              <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16 }}>Unlock</Text>
            </TouchableOpacity>
            {appLockType === 'biometric' && !biometricLockout && (
              <TouchableOpacity
                onPress={retryBiometric}
                style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Fingerprint size={18} color={c.primary} />
                <Text style={{ color: c.primary, fontWeight: '500', fontSize: 14 }}>Try Biometric Again</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity
            onPress={() => handleBiometric()}
            style={{
              backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 48, alignItems: 'center',
            }}
          >
            <Fingerprint size={24} color="#FFF" />
            <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 16, marginTop: 8 }}>Authenticate</Text>
          </TouchableOpacity>
        )}

        {!hasStoredPin() && appLockType === 'biometric' && showPinFallback && (
          <Text style={{ color: c.warning, fontSize: 12, marginTop: 16, textAlign: 'center' }}>
            No fallback PIN is set. You may need to disable and re-enable app lock to set one.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
