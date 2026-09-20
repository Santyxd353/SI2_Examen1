import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { api, login, logout, restoreSession } from './api';
import { connectRealtime } from './realtime';
import type { Catalog, CatalogLocation, Identity, Product, Variant } from './types';

type Page = 'catalog' | 'ar';

export function App() {
  const [user, setUser] = useState<Identity | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<Page>('catalog');
  const [catalog, setCatalog] = useState<Catalog>({ products: [], locations: [] });
  const [location, setLocation] = useState<CatalogLocation | null>(null);
  const [selection, setSelection] = useState<{ product: Product; variant: Variant } | null>(null);
  const [error, setError] = useState('');

  async function loadCatalog(locationId = location?.id || '') {
    const data = await api(`/catalog${locationId ? `?location=${locationId}` : ''}`);
    setCatalog(data);
    if (!location && data.locations[0]) setLocation(data.locations[0]);
  }

  useEffect(() => {
    restoreSession()
      .then(async (identity) => {
        setUser(identity);
        if (identity) await loadCatalog('');
      })
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || !location) return;
    void loadCatalog(location.id).catch((reason) => setError(reason.message));
    return connectRealtime(location.id, () => {
      void loadCatalog(location.id).catch(() => {});
    });
  }, [user, location?.id]);

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
            await loadCatalog('');
          } catch (reason) {
            setError((reason as Error).message);
          }
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>vestidor°</Text>
          <Text style={styles.brandSub}>REALIDAD AUMENTADA</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void logout();
            setUser(null);
          }}
        >
          <Text style={styles.link}>Salir</Text>
        </Pressable>
      </View>
      <FlatList
        data={catalog.products}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>VESTIDOR AR MUJER</Text>
            <Text style={styles.title}>Prueba prendas sobre tu imagen real.</Text>
            <Text style={styles.paragraph}>
              La cámara se procesa en tu dispositivo. La visualización es aproximada y no garantiza
              el ajuste real.
            </Text>
            <Text style={styles.label}>Disponibilidad</Text>
            <View style={styles.chips}>
              {catalog.locations.map((item) => (
                <Pressable
                  key={item.id}
                  style={[styles.chip, item.id === location?.id && styles.chipActive]}
                  onPress={() => setLocation(item)}
                >
                  <Text style={item.id === location?.id ? styles.chipTextActive : styles.chipText}>
                    {item.nombre}
                  </Text>
                </Pressable>
              ))}
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No hay prendas disponibles en esta ubicación.</Text>
        }
        renderItem={({ item }) => {
          const variant = item.variantes[0];
          if (!variant) return null;
          return (
            <View style={styles.productCard}>
              <View style={[styles.swatch, { backgroundColor: variant.color_hex || '#c9b8a7' }]} />
              <View style={styles.productCopy}>
                <Text style={styles.productName}>{item.nombre}</Text>
                <Text style={styles.productMeta}>
                  {variant.color} · Talla {variant.talla}
                </Text>
                <Text style={styles.productMeta}>{variant.disponible} disponibles</Text>
              </View>
              <Pressable
                style={styles.tryButton}
                onPress={() => {
                  setSelection({ product: item, variant });
                  setPage('ar');
                }}
              >
                <Text style={styles.tryButtonText}>Probar AR</Text>
              </Pressable>
            </View>
          );
        }}
      />
    </SafeAreaView>
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
      <CameraView style={StyleSheet.absoluteFill} facing="front" mirror />
      <View pointerEvents="none" style={styles.bodyGuide}>
        <View style={styles.headGuide} />
        <View style={styles.shoulderGuide} />
        <View
          style={[
            styles.garmentPreview,
            { backgroundColor: `${variant.color_hex || '#c9b8a7'}BB` },
          ]}
        >
          <Text style={styles.garmentLabel}>{product.nombre}</Text>
        </View>
      </View>
      <View style={styles.cameraTop}>
        <Pressable style={styles.cameraAction} onPress={onBack}>
          <Text style={styles.cameraActionText}>‹ Volver</Text>
        </Pressable>
        <View style={styles.prototypeBadge}>
          <Text style={styles.prototypeText}>BASE AR · SEGUIMIENTO PENDIENTE</Text>
        </View>
      </View>
      <View style={styles.cameraBottom}>
        <Text style={styles.cameraProduct}>{product.nombre}</Text>
        <Text style={styles.cameraMeta}>
          {variant.color} · Talla {variant.talla}
        </Text>
        <Text style={styles.cameraHint}>Coloca hombros y cintura dentro de la guía.</Text>
        <Text style={styles.cameraPrivacy}>El video no sale del dispositivo.</Text>
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
  productCopy: { flex: 1, gap: 4 },
  productName: { color: '#293028', fontSize: 15, fontWeight: '600' },
  productMeta: { color: '#777e73', fontSize: 10 },
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
});
