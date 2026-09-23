import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import Svg, { Polygon } from 'react-native-svg';
import { API_URL, api, login, logout, restoreSession } from './api';
import { AdminDashboard } from './AdminDashboard';
import { CatalogScreen } from './CatalogScreen';
import { connectRealtime } from './realtime';
import { detectPose, isPoseAvailable } from '../modules/pose-landmarker/src';
import { garmentImageFrame, garmentKind, garmentOutline, projectTorso } from './pose';
import type { Layout, Torso } from './pose';
import type { Catalog, CatalogLocation, Identity, Product, Variant } from './types';

type Page = 'catalog' | 'ar';
const isAdministrator = (identity: Identity) => identity.roles.includes('Administrador');

export function App() {
  const [user, setUser] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('catalog');
  const [adminClientMode, setAdminClientMode] = useState(false);
  const [catalog, setCatalog] = useState<Catalog>({
    products: [],
    locations: [],
    filters: { brands: [], colors: [], sizes: [] },
    categories: [],
  });
  const [location, setLocation] = useState<CatalogLocation | null>(null);
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState('');
  const catalogRequest = useRef(0);
  const [selection, setSelection] = useState<{ product: Product; variant: Variant } | null>(null);
  const [error, setError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);

  async function loadCatalog(locationId = location?.id || '') {
    const requestId = ++catalogRequest.current;
    const params = new URLSearchParams();
    params.set('channel', 'APP');
    if (locationId) params.set('location', locationId);
    if (brand) params.set('brand', brand);
    if (color) params.set('color', color);
    if (size) params.set('size', size);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (category) params.set('category', category);
    setCatalogLoading(true);
    try {
      const data = await api(`/catalog${params.size ? `?${params}` : ''}`);
      if (requestId !== catalogRequest.current) return;
      setCatalog(data);
      if (!location && data.locations[0]) setLocation(data.locations[0]);
    } finally {
      if (requestId === catalogRequest.current) setCatalogLoading(false);
    }
  }

  useEffect(() => {
    restoreSession()
      .then(async (identity) => {
        setUser(identity);
        if (identity && !isAdministrator(identity)) await loadCatalog('');
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!user || !location || (isAdministrator(user) && !adminClientMode)) return;
    void loadCatalog(location.id).catch((reason) => setError(reason.message));
    return connectRealtime(location.id, () => {
      void loadCatalog(location.id).catch(() => {});
    });
  }, [user, location?.id, brand, color, size, debouncedSearch, category, adminClientMode]);

  if (loading)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#697b5e" />
        <Text>Preparando Vestidor AR…</Text>
      </SafeAreaView>
    );

  if (!user)
    return (
      <LoginScreen
        error={error}
        onLogin={async (correo, clave) => {
          setError('');
          try {
            const identity = await login(correo, clave);
            setUser(identity);
            setAdminClientMode(false);
            if (!isAdministrator(identity)) await loadCatalog('');
          } catch (reason) {
            setError((reason as Error).message);
          }
        }}
      />
    );

  if (isAdministrator(user) && !adminClientMode)
    return (
      <AdminDashboard
        user={user}
        onClientMode={async () => {
          await loadCatalog('');
          setAdminClientMode(true);
        }}
        onLogout={() => {
          void logout();
          setUser(null);
          setAdminClientMode(false);
          setPage('catalog');
        }}
      />
    );

  if (page === 'ar' && selection)
    return (
      <ArCamera
        product={selection.product}
        variant={selection.variant}
        onBack={() => setPage('catalog')}
      />
    );

  return (
    <CatalogScreen
      user={user}
      catalog={catalog}
      loading={catalogLoading}
      error={error}
      location={location}
      brand={brand}
      color={color}
      size={size}
      search={search}
      category={category}
      onLocationChange={setLocation}
      onBrandChange={setBrand}
      onColorChange={setColor}
      onSizeChange={setSize}
      onSearchChange={setSearch}
      onCategoryChange={setCategory}
      onClearFilters={() => {
        setBrand('');
        setColor('');
        setSize('');
        setCategory('');
        setSearch('');
      }}
      onTryAr={(product, variant) => {
        setSelection({ product, variant });
        setPage('ar');
      }}
      onCatalogRefresh={() => loadCatalog(location?.id || '')}
      onAdminMode={
        isAdministrator(user)
          ? () => {
              setPage('catalog');
              setAdminClientMode(false);
            }
          : undefined
      }
      onLogout={() => {
        void logout();
        setUser(null);
        setAdminClientMode(false);
        setPage('catalog');
      }}
    />
  );
}

function LoginScreen({
  error,
  onLogin,
}: {
  error: string;
  onLogin: (correo: string, clave: string) => Promise<void>;
}) {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await onLogin(correo.trim().toLowerCase(), clave);
    } finally {
      setBusy(false);
    }
  }
  return (
    <KeyboardAvoidingView
      style={styles.login}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <Text style={styles.brand}>vestidor°</Text>
      <Text style={styles.eyebrow}>APLICACIÓN MÓVIL</Text>
      <Text style={styles.loginTitle}>Tu probador, ahora en la cámara.</Text>
      <TextInput
        accessibilityLabel="Correo"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Correo"
        style={styles.input}
        value={correo}
        onChangeText={setCorreo}
      />
      <TextInput
        accessibilityLabel="Contraseña"
        placeholder="Contraseña"
        secureTextEntry
        style={styles.input}
        value={clave}
        onChangeText={setClave}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={styles.primary}
        disabled={busy || !correo || !clave}
        onPress={() => void submit()}
      >
        <Text style={styles.primaryText}>{busy ? 'Ingresando…' : 'Ingresar'}</Text>
      </Pressable>
      <Text style={styles.privacy}>La sesión se almacena de forma segura en el dispositivo.</Text>
    </KeyboardAvoidingView>
  );
}

function ArCamera({
  product,
  variant,
  onBack,
}: {
  product: Product;
  variant: Variant;
  onBack: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const previous = useRef<Torso | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [layout, setLayout] = useState<Layout>({ width: 0, height: 0 });
  const [torso, setTorso] = useState<Torso | null>(null);
  const [tracking, setTracking] = useState(
    'Colócate de frente y aléjate hasta mostrar la cintura.',
  );
  const [trackingError, setTrackingError] = useState('');
  const [retry, setRetry] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const kind = garmentKind(product.nombre);
  const nativeAvailable = isPoseAvailable();
  const arImageUrl = variant.arImagePath
    ? `${API_URL.replace(/\/api$/, '')}${variant.arImagePath}`
    : null;
  const illustrativeSample =
    !arImageUrl &&
    product.id === '20000000-0000-4000-8000-000000000001' &&
    variant.color.toLowerCase() === 'marfil';

  useEffect(() => {
    if (
      !permission?.granted ||
      !cameraReady ||
      !nativeAvailable ||
      (kind === 'unsupported' && !arImageUrl) ||
      !layout.width ||
      !layout.height
    )
      return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function sample() {
      let retryDelay = 700;
      try {
        const capture = await camera.current?.takePictureAsync({
          quality: 0.35,
          skipProcessing: false,
          shutterSound: false,
        });
        if (!capture?.uri) return;
        const pose = await detectPose(capture.uri);
        if (!active) return;
        const next = projectTorso(pose, layout, previous.current);
        previous.current = next;
        setTorso(next);
        setTrackingError('');
        setTracking(
          next
            ? 'Prenda siguiendo hombros y cadera.'
            : pose.landmarks.length
              ? 'Se detectó el cuerpo, pero faltan hombros o cadera. Aléjate un poco.'
              : 'No se detecta el cuerpo. Mejora la luz y muestra la cintura.',
        );
      } catch (reason) {
        retryDelay = 1500;
        if (active) {
          setTorso(null);
          setTrackingError((reason as Error).message);
          setTracking('Reintentando detección automáticamente…');
        }
      } finally {
        if (active) timer = setTimeout(() => void sample(), retryDelay);
      }
    }
    void sample();
    return () => {
      active = false;
      clearTimeout(timer);
      previous.current = null;
    };
  }, [
    permission?.granted,
    cameraReady,
    nativeAvailable,
    kind,
    arImageUrl,
    layout.width,
    layout.height,
    retry,
  ]);
  if (!permission)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  if (!permission.granted)
    return (
      <SafeAreaView style={styles.permission}>
        <Text style={styles.permissionTitle}>La cámara es necesaria</Text>
        <Text style={styles.permissionCopy}>
          La imagen se procesa localmente y no se almacena en esta primera versión.
        </Text>
        <Pressable style={styles.primary} onPress={() => void requestPermission()}>
          <Text style={styles.primaryText}>Permitir cámara</Text>
        </Pressable>
        <Pressable onPress={onBack}>
          <Text style={styles.linkLight}>Volver al catálogo</Text>
        </Pressable>
      </SafeAreaView>
    );
  return (
    <View style={styles.cameraPage}>
      <NativeStatusBar barStyle="light-content" />
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="front"
        mirror
        onCameraReady={() => setCameraReady(true)}
      />
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        onLayout={(event) =>
          setLayout({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        {torso && arImageUrl && !imageFailed ? (
          <Image
            source={{ uri: arImageUrl }}
            resizeMode="stretch"
            style={[styles.garmentImage, garmentImageFrame(torso)]}
            onError={() => setImageFailed(true)}
          />
        ) : torso && illustrativeSample ? (
          <Image
            source={require('../assets/camiseta-marfil-muestra.png')}
            resizeMode="stretch"
            style={[styles.garmentImage, garmentImageFrame(torso)]}
          />
        ) : torso && kind !== 'unsupported' ? (
          <Svg width={layout.width} height={layout.height}>
            <Polygon
              points={garmentOutline(torso, kind)
                .map((point) => `${point.x},${point.y}`)
                .join(' ')}
              fill={variant.color_hex || '#c9b8a7'}
              fillOpacity={0.78}
              stroke="#ffffffcc"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          </Svg>
        ) : (
          <View style={styles.bodyGuide}>
            <View style={styles.headGuide} />
            <View style={styles.shoulderGuide} />
          </View>
        )}
      </View>
      <View style={styles.cameraTop}>
        <Pressable style={styles.cameraAction} onPress={onBack}>
          <Text style={styles.cameraActionText}>‹ Volver</Text>
        </Pressable>
        <View style={styles.prototypeBadge}>
          <Text style={styles.prototypeText}>
            {nativeAvailable ? 'AR EXPERIMENTAL · ANDROID' : 'GUÍA · REQUIERE BUILD ANDROID'}
          </Text>
        </View>
      </View>
      <View style={styles.cameraBottom}>
        <Text style={styles.cameraProduct}>{product.nombre}</Text>
        <Text style={styles.cameraMeta}>
          {variant.color} · Talla {variant.talla}
        </Text>
        <Text style={styles.cameraHint}>
          {kind === 'unsupported' && !arImageUrl
            ? 'Esta prenda aún no tiene visualización AR. Primero se admiten blusas y vestidos.'
            : nativeAvailable
              ? tracking
              : 'Para detectar el cuerpo instala la development build de Android.'}
        </Text>
        {!!trackingError && <Text style={styles.cameraHint}>{trackingError}</Text>}
        {imageFailed && (
          <Text style={styles.cameraHint}>
            No se pudo cargar la imagen AR. Revisa la conexión con el servidor.
          </Text>
        )}
        {!!trackingError && nativeAvailable && (
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setTrackingError('');
              setRetry((value) => value + 1);
            }}
          >
            <Text style={styles.primaryText}>Reintentar detección</Text>
          </Pressable>
        )}
        {illustrativeSample && (
          <Text style={styles.cameraPrivacy}>
            Camiseta ilustrativa generada para la prueba; no es la foto del producto ni representa
            el ajuste de la talla.
          </Text>
        )}
        <Text style={styles.cameraPrivacy}>
          La cámara se procesa en el dispositivo; las capturas temporales se eliminan.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f6f1' },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f6f6f1',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#dfe1d8',
  },
  brand: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 27,
    color: '#263025',
  },
  brandSub: { fontSize: 8, letterSpacing: 2, color: '#7d8777' },
  link: { color: '#65745e', fontWeight: '600' },
  list: { padding: 20, paddingBottom: 50 },
  intro: { marginBottom: 22 },
  eyebrow: { color: '#75816d', fontSize: 10, letterSpacing: 2, marginBottom: 9 },
  title: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 31,
    lineHeight: 36,
    color: '#252b24',
    maxWidth: 340,
  },
  paragraph: { color: '#6b7168', lineHeight: 20, marginTop: 10 },
  label: {
    fontSize: 10,
    letterSpacing: 1,
    color: '#737a70',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#cbd0c5',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#344032', borderColor: '#344032' },
  chipText: { color: '#4e574b', fontSize: 11 },
  chipTextActive: { color: '#fff', fontSize: 11 },
  productCard: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfe1d8',
    marginBottom: 12,
  },
  swatch: { width: 58, height: 70, borderRadius: 3 },
  catalogImage: { width: 70, height: 86, resizeMode: 'cover', backgroundColor: '#e8ebe3' },
  photoChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  photoChoice: { borderWidth: 1, borderColor: '#cbd0c5', paddingHorizontal: 6, paddingVertical: 3 },
  photoChoiceActive: { borderColor: '#344032', backgroundColor: '#e8ece4' },
  photoChoiceText: { color: '#303a2e', fontSize: 9 },
  productCopy: { flex: 1, gap: 4 },
  productName: { color: '#293028', fontSize: 15, fontWeight: '600' },
  productMeta: { color: '#777e73', fontSize: 10 },
  variantChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  variantChip: { borderWidth: 1, borderColor: '#d4d9d0', paddingHorizontal: 6, paddingVertical: 4 },
  variantChipActive: { borderColor: '#344032', backgroundColor: '#e8ece4' },
  variantText: { color: '#303a2e', fontSize: 9 },
  tryButton: { backgroundColor: '#303a2e', paddingHorizontal: 13, paddingVertical: 11 },
  tryButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  empty: { color: '#777e73', textAlign: 'center', padding: 30 },
  error: { color: '#a64d38', backgroundColor: '#fff0eb', padding: 11, marginTop: 10 },
  login: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#f2f1eb', gap: 13 },
  loginTitle: {
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 32,
    lineHeight: 38,
    color: '#273025',
    marginBottom: 14,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#cbd0c5',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    color: '#252b24',
  },
  primary: {
    minHeight: 50,
    backgroundColor: '#303a2e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontWeight: '600' },
  privacy: { color: '#7c8178', fontSize: 10, textAlign: 'center', marginTop: 8 },
  permission: {
    flex: 1,
    backgroundColor: '#1f251f',
    justifyContent: 'center',
    padding: 28,
    gap: 16,
  },
  permissionTitle: {
    color: '#fff',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 30,
  },
  permissionCopy: { color: '#cdd3ca', lineHeight: 20 },
  linkLight: { color: '#dce3d8', textAlign: 'center', padding: 12 },
  cameraPage: { flex: 1, backgroundColor: '#000' },
  cameraTop: {
    position: 'absolute',
    top: 45,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cameraAction: {
    backgroundColor: '#111A',
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  cameraActionText: { color: '#fff', fontWeight: '600' },
  prototypeBadge: {
    backgroundColor: '#d99d57dd',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 4,
  },
  prototypeText: { color: '#271b0f', fontSize: 8, fontWeight: '700' },
  bodyGuide: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    paddingTop: 125,
  },
  headGuide: { width: 92, height: 112, borderWidth: 1, borderColor: '#ffffff99', borderRadius: 50 },
  shoulderGuide: {
    width: 250,
    height: 70,
    borderTopWidth: 1,
    borderColor: '#ffffff99',
    borderRadius: 100,
    marginTop: 18,
  },
  garmentPreview: {
    width: 220,
    height: 260,
    marginTop: -55,
    borderTopLeftRadius: 48,
    borderTopRightRadius: 48,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    borderWidth: 1,
    borderColor: '#ffffff88',
    alignItems: 'center',
    justifyContent: 'center',
  },
  garmentImage: { position: 'absolute', opacity: 0.92 },
  garmentLabel: { color: '#fff', fontWeight: '700', textShadowColor: '#0008', textShadowRadius: 5 },
  cameraBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    backgroundColor: '#111C',
    padding: 17,
    borderRadius: 4,
  },
  cameraProduct: {
    color: '#fff',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: 22,
  },
  cameraMeta: { color: '#dce1d9', marginTop: 4 },
  cameraHint: { color: '#fff', fontSize: 11, marginTop: 12 },
  cameraPrivacy: { color: '#aeb7aa', fontSize: 9, marginTop: 5 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, padding: 9, backgroundColor: '#344032' },
});
