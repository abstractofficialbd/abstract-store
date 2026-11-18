import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Clock,
  ExternalLink,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  User as UserIcon,
  UserPlus,
  X,
} from 'lucide-react';
import { ConfirmationResult, RecaptchaVerifier, User } from 'firebase/auth';
import {
  createRecaptchaVerifier,
  ensureCustomerProfileShell,
  normalizePhoneToE164,
  saveCustomerProfileToCloud,
  sendPhoneOtp,
} from '../lib/firebase';
import {
  CustomerOrder,
  CustomerProfile,
  SavedAddress,
  ShopSettings,
} from '../types/shop';
import { resizeImageToDataUrl } from '../utils/image';
import { buildWhatsAppUrl } from '../utils/whatsapp';
import { ResilientImage } from './ResilientImage';

export type CustomerAccountTab = 'profile' | 'orders';

interface CustomerAccountModalProps {
  isOpen: boolean;
  initialTab: CustomerAccountTab;
  currentUser: User | null;
  profile: CustomerProfile | null;
  orders: CustomerOrder[];
  ordersLoading: boolean;
  settings: ShopSettings;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onOpenCatalog: () => void;
}

type AuthMode = 'login' | 'signup';

function getInitials(name: string, phone: string): string {
  const clean = name.trim();
  if (clean) {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  }
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? digits.slice(-2) : 'AB';
}

function mapPhoneAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : '';

  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') {
    return 'Phone OTP authentication is not enabled yet in Firebase Console. Enable the Phone sign-in provider in Firebase Authentication -> Sign-in method and authorize this domain.';
  }
  if (code === 'auth/invalid-app-credential' || code === 'auth/captcha-check-failed') {
    return 'App verification could not complete for this domain. Add this domain to Firebase Authentication -> Settings -> Authorized domains.';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Please enter a valid mobile number (for example 01712345678 or +8801712345678).';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many OTP requests right now. Please wait a few minutes and try again.';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'The 6-digit OTP code is incorrect. Please check and try again.';
  }
  if (code === 'auth/code-expired') {
    return 'This OTP code has expired. Please request a new verification code.';
  }
  if (msg && !msg.startsWith('{')) {
    return msg;
  }
  return 'Could not verify your phone number right now. Please try again.';
}

export function CustomerAccountModal({
  isOpen,
  initialTab,
  currentUser,
  profile,
  orders,
  ordersLoading,
  settings,
  onClose,
  onSignOut,
  onOpenCatalog,
}: CustomerAccountModalProps) {
  const [activeTab, setActiveTab] = useState<CustomerAccountTab>(initialTab);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Phone + OTP state
  const [phoneInput, setPhoneInput] = useState('');
  const [formattedPhone, setFormattedPhone] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [authError, setAuthError] = useState('');
  const verifierRef = useRef<RecaptchaVerifier | null>(null);

  // Onboarding / Profile form state
  const [fullNameInput, setFullNameInput] = useState('');
  const [phoneProfileInput, setPhoneProfileInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

  // Saved addresses state
  const [showAddAddressForm, setShowAddAddressForm] = useState(false);
  const [addrLabel, setAddrLabel] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrThana, setAddrThana] = useState('');
  const [addrZilla, setAddrZilla] = useState('');
  const [addrDistrict, setAddrDistrict] = useState('');
  const [addrDefault, setAddrDefault] = useState(true);
  const [addressError, setAddressError] = useState('');
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setAuthError('');
      setProfileError('');
      setProfileNotice('');
      setAddressError('');
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!currentUser) {
      setFullNameInput('');
      setPhoneProfileInput('');
      setEmailInput('');
      setPhotoUrlInput('');
      return;
    }

    setFullNameInput(profile?.fullName ?? currentUser.displayName ?? '');
    setPhoneProfileInput(
      profile?.phoneNumber && profile.phoneNumber !== 'Pending'
        ? profile.phoneNumber
        : currentUser.phoneNumber || ''
    );
    setEmailInput(profile?.email ?? currentUser.email ?? '');
    setPhotoUrlInput(profile?.photoUrl ?? currentUser.photoURL ?? '');
  }, [currentUser, profile]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (verifierRef.current) {
        try {
          verifierRef.current.clear();
        } catch {
          // Ignore cleanup errors
        }
        verifierRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const isPhoneSignedInUser = Boolean(currentUser && currentUser.phoneNumber);
  const needsProfileOnboarding = Boolean(
    currentUser &&
      isPhoneSignedInUser &&
      (!profile || !profile.fullName.trim())
  );

  const savedAddresses = profile?.addresses || [];

  const resetOtpFlow = () => {
    setConfirmationResult(null);
    setOtpInput('');
    setAuthError('');
    if (verifierRef.current) {
      try {
        verifierRef.current.clear();
      } catch {
        // Ignore
      }
      verifierRef.current = null;
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    let e164 = '';
    try {
      e164 = normalizePhoneToE164(phoneInput);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid phone number.');
      return;
    }

    setIsSendingOtp(true);
    try {
      if (verifierRef.current) {
        try {
          verifierRef.current.clear();
        } catch {
          // Ignore
        }
        verifierRef.current = null;
      }
      const verifier = createRecaptchaVerifier('customer-recaptcha-container');
      verifierRef.current = verifier;
      const result = await sendPhoneOtp(e164, verifier);
      setFormattedPhone(e164);
      setConfirmationResult(result);
    } catch (err) {
      if (verifierRef.current) {
        try {
          verifierRef.current.clear();
        } catch {
          // Ignore
        }
        verifierRef.current = null;
      }
      setAuthError(mapPhoneAuthError(err));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    const code = otpInput.trim();
    if (code.length < 6) {
      setAuthError('Please enter the 6-digit OTP code sent to your phone.');
      return;
    }

    setAuthError('');
    setIsVerifyingOtp(true);
    try {
      const credential = await confirmationResult.confirm(code);
      await ensureCustomerProfileShell(
        credential.user,
        formattedPhone || credential.user.phoneNumber || undefined
      );
      resetOtpFlow();
      setPhoneInput('');
    } catch (err) {
      setAuthError(mapPhoneAuthError(err));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError('');
    setIsProcessingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 400);
      setPhotoUrlInput(dataUrl);
    } catch (err) {
      setProfileError(
        err instanceof Error ? err.message : 'Could not process profile photo.'
      );
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setProfileError('');
    setProfileNotice('');

    if (!fullNameInput.trim()) {
      setProfileError('Please enter your name.');
      return;
    }
    const cleanPhone =
      phoneProfileInput.trim() || currentUser.phoneNumber || 'Pending';

    setIsSavingProfile(true);
    try {
      await saveCustomerProfileToCloud({
        uid: currentUser.uid,
        fullName: fullNameInput.trim(),
        phoneNumber: cleanPhone,
        email: emailInput.trim(),
        photoUrl: photoUrlInput.trim(),
        addresses: savedAddresses,
      });
      setProfileNotice('Your profile has been saved.');
      window.setTimeout(() => setProfileNotice(''), 3000);
    } catch {
      setProfileError('Could not save your profile. Please try again.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAddSavedAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setAddressError('');

    if (savedAddresses.length >= 3) {
      setAddressError('You can preserve up to 3 delivery locations.');
      return;
    }

    if (
      !addrLabel.trim() ||
      !addrStreet.trim() ||
      !addrThana.trim() ||
      !addrZilla.trim() ||
      !addrDistrict.trim()
    ) {
      setAddressError(
        'Please fill in Label, Address, Thana, Zilla, and District.'
      );
      return;
    }

    const makeDefault = savedAddresses.length === 0 ? true : addrDefault;
    const newAddr: SavedAddress = {
      id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: addrLabel.trim(),
      streetAddress: addrStreet.trim(),
      thana: addrThana.trim(),
      zilla: addrZilla.trim(),
      district: addrDistrict.trim(),
      isDefault: makeDefault,
    };

    const nextAddresses = makeDefault
      ? [...savedAddresses.map((a) => ({ ...a, isDefault: false })), newAddr]
      : [...savedAddresses, newAddr];

    setIsSavingAddress(true);
    try {
      await saveCustomerProfileToCloud({
        uid: currentUser.uid,
        fullName:
          fullNameInput.trim() ||
          profile?.fullName ||
          currentUser.displayName ||
          '',
        phoneNumber:
          phoneProfileInput.trim() ||
          profile?.phoneNumber ||
          currentUser.phoneNumber ||
          'Pending',
        email: emailInput.trim() || profile?.email || currentUser.email || '',
        photoUrl: photoUrlInput.trim() || profile?.photoUrl || '',
        addresses: nextAddresses,
      });
      setAddrLabel('');
      setAddrStreet('');
      setAddrThana('');
      setAddrZilla('');
      setAddrDistrict('');
      setAddrDefault(false);
      setShowAddAddressForm(false);
    } catch {
      setAddressError('Could not save this address. Please try again.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleSetDefaultAddress = async (addressId: string) => {
    if (!currentUser) return;
    setAddressError('');
    const nextAddresses = savedAddresses.map((addr) => ({
      ...addr,
      isDefault: addr.id === addressId,
    }));
    try {
      await saveCustomerProfileToCloud({
        uid: currentUser.uid,
        fullName:
          fullNameInput.trim() ||
          profile?.fullName ||
          currentUser.displayName ||
          '',
        phoneNumber:
          phoneProfileInput.trim() ||
          profile?.phoneNumber ||
          currentUser.phoneNumber ||
          'Pending',
        email: emailInput.trim() || profile?.email || currentUser.email || '',
        photoUrl: photoUrlInput.trim() || profile?.photoUrl || '',
        addresses: nextAddresses,
      });
    } catch {
      setAddressError('Could not update default address.');
    }
  };

  const handleRemoveSavedAddress = async (addressId: string) => {
    if (!currentUser) return;
    setAddressError('');
    const filtered = savedAddresses.filter((addr) => addr.id !== addressId);
    const hasDefault = filtered.some((addr) => addr.isDefault);
    const nextAddresses =
      filtered.length > 0 && !hasDefault
        ? filtered.map((addr, idx) => ({ ...addr, isDefault: idx === 0 }))
        : filtered;

    try {
      await saveCustomerProfileToCloud({
        uid: currentUser.uid,
        fullName:
          fullNameInput.trim() ||
          profile?.fullName ||
          currentUser.displayName ||
          '',
        phoneNumber:
          phoneProfileInput.trim() ||
          profile?.phoneNumber ||
          currentUser.phoneNumber ||
          'Pending',
        email: emailInput.trim() || profile?.email || currentUser.email || '',
        photoUrl: photoUrlInput.trim() || profile?.photoUrl || '',
        addresses: nextAddresses,
      });
    } catch {
      setAddressError('Could not remove address.');
    }
  };

  const handleLogoutClick = async () => {
    resetOtpFlow();
    await onSignOut();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#02042B]/65 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Customer Account, Profile & Order History"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-[#F7F8FB] border border-[#E1E5EE] rounded-xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Invisible reCAPTCHA mount */}
        <div id="customer-recaptcha-container" />

        {/* Header */}
        <div className="px-6 py-4 bg-[#000066] text-white border-b border-[#C5A467]/35 flex items-center justify-between gap-4">
          {!currentUser ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#D9BC82] font-semibold">
                Customer Account
              </p>
              <h2 className="font-display text-xl font-semibold text-white">
                {authMode === 'login'
                  ? 'Login with Phone OTP'
                  : 'New Customer Verification'}
              </h2>
            </div>
          ) : (
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full overflow-hidden border border-[#C5A467]/70 bg-[#050838] flex items-center justify-center shrink-0">
                {photoUrlInput ? (
                  <img
                    src={photoUrlInput}
                    alt={fullNameInput || 'Customer'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-semibold text-[#D9BC82]">
                    {getInitials(fullNameInput, phoneProfileInput)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {fullNameInput.trim() || 'Welcome to ' + settings.shopName}
                </p>
                <p className="text-xs text-[#D9BC82] font-mono-tabular truncate flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {phoneProfileInput || currentUser.email || 'Verified Account'}
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {currentUser && (
              <button
                type="button"
                onClick={handleLogoutClick}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account modal"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {!currentUser ? (
          <div className="p-6 sm:p-8 overflow-y-auto space-y-6">
            {/* Existing vs New customer switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-[#E1E5EE] rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  resetOtpFlow();
                }}
                className={`h-10 px-3 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-[#000066] text-white'
                    : 'text-[#434963] hover:text-[#000066]'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Customer Login</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  resetOtpFlow();
                }}
                className={`h-10 px-3 inline-flex items-center justify-center gap-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-[#000066] text-white'
                    : 'text-[#434963] hover:text-[#000066]'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Account</span>
              </button>
            </div>

            <div className="p-5 sm:p-6 bg-white border border-[#E1E5EE] rounded-xl space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8E6B2E] mb-1">
                  {authMode === 'login'
                    ? 'Returning Customer'
                    : 'New Customer Registration'}
                </p>
                <p className="text-sm text-[#434963] leading-relaxed">
                  {authMode === 'login'
                    ? 'Enter your previously registered phone number. We will send a one-time verification code (OTP) to access your profile, saved addresses, and Order History.'
                    : 'Verify your mobile number with an OTP code. Right after verification, you can add your name and upload a profile photo.'}
                </p>
              </div>

              {authError && (
                <p
                  role="alert"
                  className="p-3 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg leading-relaxed"
                >
                  {authError}
                </p>
              )}

              {!confirmationResult ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label
                      htmlFor="otp-phone-input"
                      className="block text-xs font-medium text-[#434963] mb-1.5"
                    >
                      Mobile Phone Number *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-[#737B96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="otp-phone-input"
                        type="tel"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="01712-345678 or +8801712345678"
                        className="w-full h-11 pl-10 pr-3 text-sm font-mono-tabular bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-[#59607A]">
                      Bangladesh numbers like <span className="font-mono-tabular">017...</span> automatically format to <span className="font-mono-tabular">+880...</span>.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isSendingOtp}
                    className="w-full h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      {isSendingOtp
                        ? 'Sending OTP Code...'
                        : authMode === 'login'
                        ? 'Send Login OTP'
                        : 'Send Verification OTP'}
                    </span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="p-3 bg-[#F7F8FB] border border-[#E1E5EE] rounded-lg flex items-center justify-between gap-2 text-xs">
                    <span className="text-[#434963]">
                      OTP sent to{' '}
                      <strong className="font-mono-tabular text-[#000066]">
                        {formattedPhone}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={resetOtpFlow}
                      className="font-semibold text-[#000066] hover:underline cursor-pointer"
                    >
                      Change Number
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="otp-code-input"
                      className="block text-xs font-medium text-[#434963] mb-1.5"
                    >
                      Enter 6-Digit OTP Code *
                    </label>
                    <input
                      id="otp-code-input"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      value={otpInput}
                      onChange={(e) =>
                        setOtpInput(e.target.value.replace(/[^\d]/g, ''))
                      }
                      placeholder="123456"
                      className="w-full h-12 px-4 text-center text-lg tracking-[0.4em] font-mono-tabular font-semibold bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifyingOtp}
                    className="w-full h-11 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                  >
                    <Check className="w-4 h-4 text-[#C5A467]" />
                    <span>
                      {isVerifyingOtp ? 'Verifying OTP...' : 'Verify & Sign In'}
                    </span>
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : needsProfileOnboarding ? (
          /* Onboarding screen right after first Phone OTP sign-in */
          <form
            onSubmit={handleSaveProfile}
            className="p-6 sm:p-8 overflow-y-auto space-y-5"
          >
            <div className="p-5 bg-white border border-[#E1E5EE] rounded-xl space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8E6B2E] mb-1">
                  Phone Verified · Complete Profile
                </p>
                <h3 className="font-display text-2xl font-semibold text-[#0A1045]">
                  Tell us your name &amp; add a photo
                </h3>
                <p className="text-xs text-[#59607A] mt-1">
                  Finish setting up your profile to access saved delivery addresses and Order History.
                </p>
              </div>

              {profileError && (
                <p
                  role="alert"
                  className="p-3 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
                >
                  {profileError}
                </p>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#C5A467] bg-[#000066] flex items-center justify-center shrink-0">
                  {photoUrlInput ? (
                    <img
                      src={photoUrlInput}
                      alt="Profile preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-8 h-8 text-[#D9BC82]" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#000066] bg-[#EEF1FA] hover:bg-[#E1E5EE] rounded-lg cursor-pointer transition-colors">
                    <Camera className="w-3.5 h-3.5" />
                    <span>
                      {isProcessingPhoto
                        ? 'Processing Photo...'
                        : photoUrlInput
                        ? 'Change Profile Photo'
                        : 'Upload Profile Pic'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="sr-only"
                    />
                  </label>
                  <p className="text-[11px] text-[#59607A]">
                    Optional · JPG or PNG automatically compressed.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="onboard-fullname"
                  className="block text-xs font-medium text-[#434963] mb-1"
                >
                  Full Name *
                </label>
                <input
                  id="onboard-fullname"
                  type="text"
                  required
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full h-10 px-3 text-sm bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="onboard-phone"
                    className="block text-xs font-medium text-[#434963] mb-1"
                  >
                    Verified Phone Number
                  </label>
                  <input
                    id="onboard-phone"
                    type="tel"
                    value={phoneProfileInput}
                    onChange={(e) => setPhoneProfileInput(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="onboard-email"
                    className="block text-xs font-medium text-[#434963] mb-1"
                  >
                    Email Address (Optional)
                  </label>
                  <input
                    id="onboard-email"
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-10 px-3 text-sm bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingProfile || isProcessingPhoto}
                className="w-full h-11 px-5 text-sm font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                {isSavingProfile ? 'Saving Profile...' : 'Save & Continue to Profile'}
              </button>
            </div>
          </form>
        ) : (
          /* Signed-in Profile & Order History Tabs */
          <>
            <div className="px-6 pt-3 bg-white border-b border-[#E1E5EE] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 ${
                  activeTab === 'profile'
                    ? 'border-[#000066] text-[#000066]'
                    : 'border-transparent text-[#59607A] hover:text-[#0A1045]'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Profile &amp; Addresses ({savedAddresses.length}/3)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-2 ${
                  activeTab === 'orders'
                    ? 'border-[#000066] text-[#000066]'
                    : 'border-transparent text-[#59607A] hover:text-[#0A1045]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Order History ({orders.length})</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {activeTab === 'profile' ? (
                <>
                  {/* Personal Details Card */}
                  <form
                    onSubmit={handleSaveProfile}
                    className="p-5 bg-white border border-[#E1E5EE] rounded-xl space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#0A1045]">
                        Personal Information
                      </h3>
                      {profileNotice && (
                        <span className="text-xs font-medium text-[#156142]">
                          {profileNotice}
                        </span>
                      )}
                    </div>

                    {profileError && (
                      <p
                        role="alert"
                        className="p-2.5 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
                      >
                        {profileError}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#C5A467] bg-[#000066] flex items-center justify-center shrink-0">
                        {photoUrlInput ? (
                          <img
                            src={photoUrlInput}
                            alt={fullNameInput || 'Profile'}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-[#D9BC82]">
                            {getInitials(fullNameInput, phoneProfileInput)}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#000066] bg-[#EEF1FA] hover:bg-[#E1E5EE] rounded-lg cursor-pointer transition-colors">
                          <Camera className="w-3.5 h-3.5" />
                          <span>
                            {isProcessingPhoto ? 'Uploading...' : 'Change Photo'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoUpload}
                            className="sr-only"
                          />
                        </label>
                        {photoUrlInput && (
                          <button
                            type="button"
                            onClick={() => setPhotoUrlInput('')}
                            className="px-2.5 py-1.5 text-xs text-[#59607A] hover:text-[#B91C1C] cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="profile-name"
                          className="block text-xs font-medium text-[#434963] mb-1"
                        >
                          Full Name *
                        </label>
                        <input
                          id="profile-name"
                          type="text"
                          required
                          value={fullNameInput}
                          onChange={(e) => setFullNameInput(e.target.value)}
                          placeholder="Your Name"
                          className="w-full h-10 px-3 text-sm bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="profile-phone"
                          className="block text-xs font-medium text-[#434963] mb-1"
                        >
                          Phone Number *
                        </label>
                        <input
                          id="profile-phone"
                          type="tel"
                          required
                          value={phoneProfileInput}
                          onChange={(e) => setPhoneProfileInput(e.target.value)}
                          placeholder="+88017..."
                          className="w-full h-10 px-3 text-sm font-mono-tabular bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="profile-email"
                        className="block text-xs font-medium text-[#434963] mb-1"
                      >
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-3.5 h-3.5 text-[#737B96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="profile-email"
                          type="email"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          placeholder="customer@example.com"
                          className="w-full h-10 pl-9 pr-3 text-sm bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSavingProfile || isProcessingPhoto}
                      className="px-5 h-10 text-xs font-semibold text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                    >
                      {isSavingProfile ? 'Saving Changes...' : 'Save Profile'}
                    </button>
                  </form>

                  {/* Saved Locations (Max 3, 1 Default) */}
                  <div className="p-5 bg-white border border-[#E1E5EE] rounded-xl space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[#0A1045]">
                          Saved Delivery Locations ({savedAddresses.length} / 3)
                        </h3>
                        <p className="text-xs text-[#59607A] mt-0.5">
                          Preserve up to 3 addresses. Your default address auto-fills checkout.
                        </p>
                      </div>

                      {savedAddresses.length < 3 && !showAddAddressForm && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddressError('');
                            setAddrDefault(savedAddresses.length === 0);
                            setShowAddAddressForm(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Location</span>
                        </button>
                      )}
                    </div>

                    {addressError && (
                      <p
                        role="alert"
                        className="p-2.5 text-xs font-medium text-[#991B1B] bg-[#FEF2F2] border border-[#FECACA] rounded-lg"
                      >
                        {addressError}
                      </p>
                    )}

                    {savedAddresses.length === 0 && !showAddAddressForm && (
                      <div className="p-4 text-center bg-[#F7F8FB] border border-dashed border-[#D3D8E6] rounded-lg">
                        <MapPin className="w-5 h-5 text-[#8890A8] mx-auto mb-1.5" />
                        <p className="text-xs text-[#59607A]">
                          No delivery locations saved yet. Add your Home or Office address for faster WhatsApp checkout.
                        </p>
                      </div>
                    )}

                    {savedAddresses.length > 0 && (
                      <div className="space-y-2.5">
                        {savedAddresses.map((addr) => (
                          <div
                            key={addr.id}
                            className={`p-3.5 rounded-lg border transition-colors ${
                              addr.isDefault
                                ? 'bg-[#F7F8FB] border-[#000066]'
                                : 'bg-white border-[#E1E5EE]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-semibold text-[#0A1045]">
                                    {addr.label}
                                  </span>
                                  {addr.isDefault && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[#000066] text-[#D9BC82] rounded">
                                      <Star className="w-2.5 h-2.5 fill-[#D9BC82]" />
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#262B47]">
                                  {addr.streetAddress}
                                </p>
                                <p className="text-[11px] text-[#59607A] mt-0.5">
                                  Thana: {addr.thana} · Zilla: {addr.zilla} · District:{' '}
                                  {addr.district}
                                </p>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {!addr.isDefault && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleSetDefaultAddress(addr.id)
                                    }
                                    className="px-2.5 py-1 text-[11px] font-semibold text-[#000066] bg-[#EEF1FA] hover:bg-[#E1E5EE] rounded cursor-pointer"
                                  >
                                    Set Default
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRemoveSavedAddress(addr.id)
                                  }
                                  aria-label={`Remove ${addr.label}`}
                                  className="p-1.5 text-[#8890A8] hover:text-[#B91C1C] cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {savedAddresses.length >= 3 && (
                      <p className="text-[11px] text-[#59607A]">
                        Maximum 3 saved locations reached. Remove one location to add a new one.
                      </p>
                    )}

                    {showAddAddressForm && savedAddresses.length < 3 && (
                      <form
                        onSubmit={handleAddSavedAddress}
                        className="p-4 bg-[#F7F8FB] border border-[#D3D8E6] rounded-lg space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#0A1045]">
                            New Saved Location
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowAddAddressForm(false)}
                            className="text-xs text-[#59607A] hover:text-[#0A1045] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label
                              htmlFor="saved-addr-label"
                              className="block text-[11px] font-medium text-[#434963] mb-1"
                            >
                              Label *
                            </label>
                            <input
                              id="saved-addr-label"
                              type="text"
                              required
                              maxLength={40}
                              value={addrLabel}
                              onChange={(e) => setAddrLabel(e.target.value)}
                              placeholder="Home / Office"
                              className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label
                              htmlFor="saved-addr-street"
                              className="block text-[11px] font-medium text-[#434963] mb-1"
                            >
                              House, Road, Area *
                            </label>
                            <input
                              id="saved-addr-street"
                              type="text"
                              required
                              maxLength={240}
                              value={addrStreet}
                              onChange={(e) => setAddrStreet(e.target.value)}
                              placeholder="House 14, Road 6, Block C, Banani"
                              className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label
                              htmlFor="saved-addr-thana"
                              className="block text-[11px] font-medium text-[#434963] mb-1"
                            >
                              Thana *
                            </label>
                            <input
                              id="saved-addr-thana"
                              type="text"
                              required
                              maxLength={80}
                              value={addrThana}
                              onChange={(e) => setAddrThana(e.target.value)}
                              placeholder="Banani"
                              className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="saved-addr-zilla"
                              className="block text-[11px] font-medium text-[#434963] mb-1"
                            >
                              Zilla *
                            </label>
                            <input
                              id="saved-addr-zilla"
                              type="text"
                              required
                              maxLength={80}
                              value={addrZilla}
                              onChange={(e) => setAddrZilla(e.target.value)}
                              placeholder="Dhaka"
                              className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="saved-addr-district"
                              className="block text-[11px] font-medium text-[#434963] mb-1"
                            >
                              District *
                            </label>
                            <input
                              id="saved-addr-district"
                              type="text"
                              required
                              maxLength={80}
                              value={addrDistrict}
                              onChange={(e) => setAddrDistrict(e.target.value)}
                              placeholder="Dhaka"
                              className="w-full h-9 px-2.5 text-xs bg-white border border-[#D3D8E6] rounded-lg focus:outline-none focus:border-[#000066]"
                            />
                          </div>
                        </div>

                        <label className="inline-flex items-center gap-2 text-xs text-[#434963] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={addrDefault}
                            onChange={(e) => setAddrDefault(e.target.checked)}
                            className="rounded border-[#D3D8E6] text-[#000066]"
                          />
                          <span>Set as my default delivery location</span>
                        </label>

                        <div className="pt-1">
                          <button
                            type="submit"
                            disabled={isSavingAddress}
                            className="px-4 h-9 text-xs font-semibold text-white bg-[#000066] hover:bg-[#091285] disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
                          >
                            {isSavingAddress ? 'Saving Location...' : 'Save Location'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </>
              ) : (
                /* Tab 2: Order History */
                <div className="space-y-4">
                  {ordersLoading ? (
                    <div className="p-8 text-center bg-white border border-[#E1E5EE] rounded-xl text-xs text-[#59607A]">
                      Loading your past orders...
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="p-8 text-center bg-white border border-[#E1E5EE] rounded-xl space-y-3">
                      <Package
                        className="w-9 h-9 text-[#A8B0C6] mx-auto"
                        strokeWidth={1.25}
                      />
                      <div>
                        <p className="font-display text-2xl font-semibold text-[#0A1045] mb-1">
                          No past orders yet
                        </p>
                        <p className="text-xs text-[#59607A] max-w-sm mx-auto">
                          Orders you place through Your Bag or Quick Order while signed in will automatically appear here.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCatalog();
                        }}
                        className="px-5 py-2.5 text-xs font-semibold text-white bg-[#000066] hover:bg-[#091285] rounded-lg transition-colors cursor-pointer"
                      >
                        Explore Collection
                      </button>
                    </div>
                  ) : (
                    orders.map((order) => {
                      const followUpUrl = buildWhatsAppUrl(
                        settings.whatsappNumber,
                        `Assalamu Alaikum / Hi ${settings.shopName}! Checking in on Order #${order.orderRef} (${order.deliveryDetails.fullName}, ${order.deliveryDetails.phone}).`
                      );
                      return (
                        <div
                          key={order.id}
                          className="p-4 sm:p-5 bg-white border border-[#E1E5EE] rounded-xl space-y-3.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-[#EEF0F6]">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono-tabular text-sm font-semibold text-[#000066]">
                                  #{order.orderRef}
                                </span>
                                <span className="px-2 py-0.5 text-[11px] font-semibold bg-[#EEF1FA] text-[#000066] rounded">
                                  {order.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#59607A] mt-1 inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>
                                  {new Date(order.createdAtMs).toLocaleDateString(
                                    'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}
                                </span>
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="font-mono-tabular text-sm font-semibold text-[#0A1045]">
                                {order.displayTotalFormatted}
                              </p>
                              <p className="text-[11px] text-[#59607A]">
                                {order.deliveryDetails.paymentMethod}
                              </p>
                            </div>
                          </div>

                          <ul className="space-y-2">
                            {order.items.map((item, idx) => (
                              <li
                                key={`${order.id}-${item.productId}-${item.size}-${idx}`}
                                className="flex items-center gap-3 text-xs"
                              >
                                <div className="w-11 h-11 rounded-md overflow-hidden bg-[#F1F3F8] border border-[#E1E5EE] shrink-0">
                                  <ResilientImage
                                    src={item.image}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold text-[#0A1045] truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-[#59607A]">
                                    {item.colorway} · Size {item.size} × {item.quantity}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>

                          <div className="pt-3 border-t border-[#EEF0F6] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-[#59607A]">
                            <div>
                              <p className="text-[#262B47] font-medium">
                                {order.deliveryDetails.fullName} ·{' '}
                                <span className="font-mono-tabular">
                                  {order.deliveryDetails.phone}
                                </span>
                              </p>
                              <p>
                                {order.deliveryDetails.streetAddress} (Thana:{' '}
                                {order.deliveryDetails.thana}, Zilla:{' '}
                                {order.deliveryDetails.zilla}, District:{' '}
                                {order.deliveryDetails.district})
                              </p>
                              {order.deliveryDetails.notes && (
                                <p className="italic text-[#434963] mt-0.5">
                                  Note: &ldquo;{order.deliveryDetails.notes}&rdquo;
                                </p>
                              )}
                            </div>

                            <a
                              href={followUpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#050838] bg-[#C5A467] hover:bg-[#D4B475] rounded-lg whitespace-nowrap shrink-0 self-start sm:self-center"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Follow Up</span>
                              <ExternalLink className="w-3 h-3 opacity-80" />
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
