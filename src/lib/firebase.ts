import { initializeApp } from 'firebase/app';
import {
  ConfirmationResult,
  GoogleAuthProvider,
  RecaptchaVerifier,
  User,
  getAuth,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  CartItem,
  CustomerDetails,
  CustomerProfile,
  DisplayCurrency,
  Product,
  SavedAddress,
  ShopSettings,
  SizeChart,
  SizeChartGroupKey,
} from '../types/shop';

export const OWNER_EMAIL = 'abstract.official.bd@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInOwnerWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutOwner(): Promise<void> {
  await signOut(auth);
}

export async function checkUserIsAdmin(user: User | null): Promise<boolean> {
  if (!user || !user.emailVerified) return false;
  if (user.email?.toLowerCase() === OWNER_EMAIL) return true;
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    return adminSnap.exists();
  } catch {
    return false;
  }
}

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export async function saveStoreConfigToCloud(
  settings: ShopSettings,
  userId: string
): Promise<void> {
  const path = 'storeConfig/main';
  const payload = {
    shopName: clampString(settings.shopName || '', 80) || 'ABSTRACT.',
    whatsappNumber: clampString(settings.whatsappNumber || '', 30) || '8801711000000',
    currencySymbol: clampString(settings.currencySymbol || '', 10) || '৳',
    freeShippingThreshold: Math.max(0, Number(settings.freeShippingThreshold) || 0),
    flatShippingFee: Math.max(0, Number(settings.flatShippingFee) || 0),
    aboutText: clampString(settings.aboutText || '', 2000),
    facebookUrl: clampString(settings.facebookUrl || '', 500),
    instagramUrl: clampString(settings.instagramUrl || '', 500),
    tiktokUrl: clampString(settings.tiktokUrl || '', 500),
    heroBanner: {
      eyebrow: clampString(settings.heroBanner.eyebrow || '', 120),
      headline:
        clampString(settings.heroBanner.headline || '', 160) ||
        'Refined menswear crafted for presence.',
      subtext: clampString(settings.heroBanner.subtext || '', 600),
      ctaLabel:
        clampString(settings.heroBanner.ctaLabel || '', 60) ||
        'Explore Collection',
      image:
        clampString(settings.heroBanner.image || '', 450000) ||
        '/src/assets/images/hero_abstract_luxury_1794991964716.jpg',
    },
    exchangeRates: {
      USD: Math.min(100000, Math.max(1, Number(settings.exchangeRates?.USD) || 120)),
      EUR: Math.min(100000, Math.max(1, Number(settings.exchangeRates?.EUR) || 130)),
      AED: Math.min(100000, Math.max(1, Number(settings.exchangeRates?.AED) || 32.7)),
    },
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  };

  try {
    await setDoc(doc(db, 'storeConfig', 'main'), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function addProductToCloud(
  product: Product,
  userId: string
): Promise<void> {
  const safeId = product.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || `item-${Date.now()}`;
  const path = `products/${safeId}`;
  const cleanSpecs = (product.specs || [])
    .map((s) => clampString(s, 160))
    .filter(Boolean)
    .slice(0, 10);
  const cleanSizes = (product.sizes || ['M'])
    .map((s) => clampString(s, 30))
    .filter(Boolean)
    .slice(0, 15);

  const payload = {
    id: safeId,
    name: clampString(product.name || '', 160) || 'Untitled Piece',
    category: product.category,
    tier: product.tier,
    price: Math.min(10000000, Math.max(1, Number(product.price) || 1500)),
    image:
      clampString(product.image || '', 450000) ||
      '/src/assets/images/product_platinum_panjabi_1794991964940.jpg',
    colorway: clampString(product.colorway || '', 80) || 'Midnight Black',
    availability: product.availability,
    description: clampString(product.description || '', 2000),
    specs: cleanSpecs,
    sizes: cleanSizes.length > 0 ? cleanSizes : ['M'],
    ownerId: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'products', safeId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeProductFromCloud(productId: string): Promise<void> {
  const path = `products/${productId}`;
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveSizeChartsToCloud(
  sizeCharts: Record<SizeChartGroupKey, SizeChart>,
  userId: string
): Promise<void> {
  const path = 'sizeCharts';
  try {
    const batch = writeBatch(db);
    (Object.keys(sizeCharts) as SizeChartGroupKey[]).forEach((chartKey) => {
      const chart = sizeCharts[chartKey];
      const cleanColumns = chart.columns
        .map((c) => clampString(c, 60) || 'Metric')
        .slice(0, 12);
      const colCount = Math.max(1, cleanColumns.length);
      const cleanRows = chart.rows.slice(0, 20).map((row) => ({
        size: clampString(row.size, 30) || 'M',
        values: Array.from({ length: colCount }, (_, idx) =>
          clampString(row.values[idx] ?? '—', 40) || '—'
        ),
      }));

      batch.set(doc(db, 'sizeCharts', chartKey), {
        key: chartKey,
        label: clampString(chart.label || chartKey, 100),
        unit: chart.unit,
        note: clampString(chart.note || '', 500),
        columns: cleanColumns.length > 0 ? cleanColumns : ['Chest'],
        rows:
          cleanRows.length > 0
            ? cleanRows
            : [{ size: 'M', values: Array.from({ length: colCount }, () => '—') }],
        updatedAt: serverTimestamp(),
        updatedBy: userId,
      });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function resetAllStoreDataInCloud(
  defaultSettings: ShopSettings,
  defaultCharts: Record<SizeChartGroupKey, SizeChart>,
  existingProducts: Product[],
  userId: string
): Promise<void> {
  await saveStoreConfigToCloud(defaultSettings, userId);
  await saveSizeChartsToCloud(defaultCharts, userId);

  if (existingProducts.length > 0) {
    const path = 'products';
    try {
      const batch = writeBatch(db);
      existingProducts.forEach((p) => {
        batch.delete(doc(db, 'products', p.id));
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export async function addProductReviewToCloud(params: {
  productId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
}): Promise<void> {
  const safeProductId =
    params.productId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || 'item';
  const reviewId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `products/${safeProductId}/reviews/${reviewId}`;
  const cleanRating = Math.min(5, Math.max(1, Math.round(Number(params.rating) || 5)));
  const cleanName = clampString(params.authorName || '', 80) || 'Verified Customer';
  const cleanComment = clampString(params.comment || '', 500);

  if (!cleanComment) {
    throw new Error('Please write short feedback before submitting.');
  }

  try {
    await setDoc(doc(db, 'products', safeProductId, 'reviews', reviewId), {
      id: reviewId,
      productId: safeProductId,
      authorId: params.authorId,
      authorName: cleanName,
      rating: cleanRating,
      comment: cleanComment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeProductReviewFromCloud(
  productId: string,
  reviewId: string
): Promise<void> {
  const path = `products/${productId}/reviews/${reviewId}`;
  try {
    await deleteDoc(doc(db, 'products', productId, 'reviews', reviewId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function normalizePhoneToE164(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) {
    throw new Error('Please enter your mobile phone number.');
  }

  let normalized = '';
  if (trimmed.startsWith('+')) {
    normalized = `+${digits}`;
  } else if (digits.length === 11 && digits.startsWith('01')) {
    normalized = `+880${digits.slice(1)}`;
  } else if (digits.length === 13 && digits.startsWith('880')) {
    normalized = `+${digits}`;
  } else if (digits.length === 10 && digits.startsWith('1')) {
    normalized = `+880${digits}`;
  } else if (digits.length >= 7 && digits.length <= 15) {
    normalized = `+${digits}`;
  }

  if (!/^\+[1-9]\d{6,14}$/.test(normalized)) {
    throw new Error(
      'Enter a valid phone number (e.g. 01712345678 or +8801712345678).'
    );
  }
  return normalized;
}

export function createRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  });
}

export async function sendPhoneOtp(
  phoneE164: string,
  verifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return signInWithPhoneNumber(auth, phoneE164, verifier);
}

function sanitizeSavedAddresses(addresses: SavedAddress[]): SavedAddress[] {
  const cleaned = (addresses || [])
    .slice(0, 3)
    .map((addr, idx) => ({
      id:
        addr.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) ||
        `addr-${Date.now()}-${idx}`,
      label: clampString(addr.label || '', 40) || `Location ${idx + 1}`,
      streetAddress: clampString(addr.streetAddress || '', 240) || 'Address',
      thana: clampString(addr.thana || '', 80) || 'Thana',
      zilla: clampString(addr.zilla || '', 80) || 'Zilla',
      district: clampString(addr.district || '', 80) || 'District',
      isDefault: Boolean(addr.isDefault),
    }));

  if (cleaned.length > 0) {
    const firstDefaultIdx = cleaned.findIndex((a) => a.isDefault);
    const activeDefaultIdx = firstDefaultIdx >= 0 ? firstDefaultIdx : 0;
    return cleaned.map((a, idx) => ({
      ...a,
      isDefault: idx === activeDefaultIdx,
    }));
  }
  return cleaned;
}

export async function ensureCustomerProfileShell(
  user: User,
  phoneFallback?: string
): Promise<void> {
  const path = `customers/${user.uid}`;
  const ref = doc(db, 'customers', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, {
      uid: user.uid,
      fullName: clampString(user.displayName || '', 80),
      phoneNumber:
        clampString(phoneFallback || user.phoneNumber || user.email || '', 30) ||
        'Pending',
      email: clampString(user.email || '', 160),
      photoUrl: clampString(user.photoURL || '', 450000),
      addresses: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCustomerProfileToCloud(
  profile: CustomerProfile
): Promise<void> {
  const path = `customers/${profile.uid}`;
  const ref = doc(db, 'customers', profile.uid);
  const cleanAddresses = sanitizeSavedAddresses(profile.addresses);
  const cleanPayload = {
    fullName: clampString(profile.fullName || '', 80),
    phoneNumber: clampString(profile.phoneNumber || '', 30) || 'Pending',
    email: clampString(profile.email || '', 160),
    photoUrl: clampString(profile.photoUrl || '', 450000),
    addresses: cleanAddresses,
    updatedAt: serverTimestamp(),
  };

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, cleanPayload);
    } else {
      await setDoc(ref, {
        uid: profile.uid,
        ...cleanPayload,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCustomerOrderToCloud(params: {
  user: User;
  orderRef: string;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: DisplayCurrency;
  displayTotalFormatted: string;
  deliveryDetails: CustomerDetails;
}): Promise<void> {
  await ensureCustomerProfileShell(params.user, params.deliveryDetails.phone);

  const safeOrderRef =
    clampString(params.orderRef, 30).replace(/[^a-zA-Z0-9_-]/g, '') ||
    `ABS-${Date.now().toString().slice(-4)}`;
  const orderId = `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const path = `customers/${params.user.uid}/orders/${orderId}`;

  const cleanItems = (params.items || []).slice(0, 30).map((item) => ({
    productId:
      item.productId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128) || 'item',
    name: clampString(item.name || '', 160) || 'Garment',
    colorway: clampString(item.colorway || '', 80),
    size: clampString(item.size || '', 40) || 'M',
    price: Math.max(0, Number(item.price) || 0),
    quantity: Math.min(100, Math.max(1, Math.round(Number(item.quantity) || 1))),
    image: clampString(item.image || '', 450000),
  }));

  if (cleanItems.length === 0) return;

  const cleanDelivery = {
    fullName: clampString(params.deliveryDetails.fullName || '', 80) || 'Customer',
    phone: clampString(params.deliveryDetails.phone || '', 30) || 'Pending',
    streetAddress:
      clampString(params.deliveryDetails.streetAddress || '', 240) || 'Address',
    thana: clampString(params.deliveryDetails.thana || '', 80) || 'Thana',
    zilla: clampString(params.deliveryDetails.zilla || '', 80) || 'Zilla',
    district: clampString(params.deliveryDetails.district || '', 80) || 'District',
    paymentMethod:
      clampString(params.deliveryDetails.paymentMethod || '', 60) ||
      'Cash on Delivery',
    notes: clampString(params.deliveryDetails.notes || '', 500),
  };

  try {
    await setDoc(doc(db, 'customers', params.user.uid, 'orders', orderId), {
      id: orderId,
      orderRef: safeOrderRef,
      customerId: params.user.uid,
      items: cleanItems,
      subtotal: Math.max(0, Number(params.subtotal) || 0),
      shipping: Math.max(0, Number(params.shipping) || 0),
      total: Math.max(0, Number(params.total) || 0),
      currency: params.currency,
      displayTotalFormatted:
        clampString(params.displayTotalFormatted || '', 60) || '৳0',
      deliveryDetails: cleanDelivery,
      status: 'Sent via WhatsApp',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
