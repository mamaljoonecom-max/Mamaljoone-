import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Dimensions, PanResponder, SafeAreaView, ScrollView, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Stroke = { d: string; color: string; width: number };
type Artwork = { id: string; title: string; image_path: string; created_at: string; user_id: string };

const C = {
  bg: '#F5F0E8', paper: '#FFFCF6', ink: '#252C28', muted: '#777B73',
  sage: '#A7B29B', clay: '#C98265', sand: '#D9C5A5', line: '#E5DED2', white: '#FFFFFF'
};
const PALETTE = [C.ink, C.clay, C.sage, '#6C86A0', '#D6B85A', '#A58AA8', '#F5F0E8'];
const { width: SCREEN_W } = Dimensions.get('window');

export default function App() {
  const [screen, setScreen] = useState<'studio'|'gallery'|'profile'>('studio');
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login'|'signup'>('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [color, setColor] = useState(C.ink);
  const [brush, setBrush] = useState(4);
  const [tool, setTool] = useState<'draw'|'erase'>('draw');
  const [title, setTitle] = useState('اثر تازه');
  const [gallery, setGallery] = useState<Artwork[]>([]);
  const [busy, setBusy] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: SCREEN_W - 40, height: 390 });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (screen === 'gallery') loadGallery();
  }, [screen, session]);

  const currentColor = tool === 'erase' ? C.paper : color;
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setActiveStroke({ d: `M ${locationX} ${locationY}`, color: currentColor, width: tool === 'erase' ? 22 : brush });
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setActiveStroke(prev => prev ? { ...prev, d: `${prev.d} L ${locationX} ${locationY}` } : null);
    },
    onPanResponderRelease: () => {
      setActiveStroke(prev => {
        if (prev) {
          setStrokes(old => [...old, prev]);
          setRedoStack([]);
        }
        return null;
      });
    }
  })).current;

  const svgDocument = useMemo(() => {
    const all = activeStroke ? [...strokes, activeStroke] : strokes;
    const paths = all.map(s => `<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize.width}" height="${canvasSize.height}" viewBox="0 0 ${canvasSize.width} ${canvasSize.height}"><rect width="100%" height="100%" fill="${C.paper}"/>${paths}</svg>`;
  }, [strokes, activeStroke, canvasSize]);

  async function authenticate() {
    if (!isSupabaseConfigured) {
      Alert.alert('تنظیم اتصال لازم است', 'ابتدا آدرس و کلید Supabase را در فایل .env قرار بده و برنامه را دوباره اجرا کن.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      Alert.alert('اطلاعات ناقص است', 'ایمیل را وارد کن؛ رمز عبور باید حداقل ۶ نویسه داشته باشد.');
      return;
    }
    setAuthBusy(true);
    try {
      const result = authMode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (authMode === 'signup' && !result.data.session) {
        Alert.alert('ایمیلت را بررسی کن', 'برای تکمیل ثبت‌نام، لینک تأیید ارسال‌شده را باز کن.');
      }
    } catch (e: any) { Alert.alert('ورود انجام نشد', e.message ?? 'دوباره تلاش کن.'); }
    finally { setAuthBusy(false); }
  }

  async function loadGallery() {
    if (!isSupabaseConfigured) { setGallery([]); return; }
    const { data, error } = await supabase.from('artworks').select('*').order('created_at', { ascending: false }).limit(60);
    if (!error && data) setGallery(data as Artwork[]);
  }

  async function saveArtwork() {
    if (!session?.user) {
      Alert.alert('برای ذخیره آنلاین وارد شو', 'می‌تونی فعلاً طراحی کنی؛ برای گالری آنلاین باید حساب کاربری داشته باشی.');
      setScreen('profile');
      return;
    }
    if (!strokes.length) {
      Alert.alert('بوم خالی است', 'اول چیزی روی بوم بکش، بعد ذخیره کن.');
      return;
    }
    setBusy(true);
    try {
      const path = `${session.user.id}/${Date.now()}.svg`;
      const upload = await supabase.storage.from('artworks').upload(path, new Blob([svgDocument], { type: 'image/svg+xml' }), {
        contentType: 'image/svg+xml', upsert: false
      });
      if (upload.error) throw upload.error;
      const inserted = await supabase.from('artworks').insert({
        user_id: session.user.id, title: title.trim() || 'اثر بدون عنوان', image_path: path
      });
      if (inserted.error) throw inserted.error;
      Alert.alert('ذخیره شد ✨', 'اثرت به گالری آنلاین اضافه شد.');
      setScreen('gallery');
    } catch (e: any) {
      Alert.alert('ذخیره انجام نشد', e.message ?? 'تنظیمات Supabase را بررسی کن.');
    } finally { setBusy(false); }
  }

  function undo() {
    if (!strokes.length) return;
    const last = strokes[strokes.length - 1];
    setStrokes(strokes.slice(0, -1));
    setRedoStack([...redoStack, last]);
  }
  function redo() {
    if (!redoStack.length) return;
    setStrokes([...strokes, redoStack[redoStack.length - 1]]);
    setRedoStack(redoStack.slice(0, -1));
  }
  function clearCanvas() {
    Alert.alert('بوم پاک شود؟', 'این کار همه‌ی خط‌های فعلی را پاک می‌کند.', [
      { text: 'لغو', style: 'cancel' }, { text: 'پاک کردن', style: 'destructive', onPress: () => { setStrokes([]); setActiveStroke(null); setRedoStack([]); } }
    ]);
  }

  function Header({ heading, sub }: { heading: string; sub: string }) {
    return <View style={styles.header}>
      <Text style={styles.brand}>mamal joone</Text>
      <Text style={styles.h1}>{heading}</Text>
      <Text style={styles.sub}>{sub}</Text>
    </View>;
  }

  function Studio() {
    return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Header heading="بیا خلق کنیم." sub="قانونی وجود نداره؛ فقط شروع کن." />
      <View style={styles.titleRow}>
        <Text style={styles.label}>نام اثر</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="مثلاً یک روز عجیب" placeholderTextColor={C.muted} style={styles.titleInput} textAlign="right" />
      </View>
      <View style={styles.canvasToolbar}>
        <Text style={styles.label}>بوم تو</Text>
        <View style={styles.inline}>
          <TouchableOpacity onPress={undo} style={styles.iconButton}><Text style={styles.iconText}>↶</Text></TouchableOpacity>
          <TouchableOpacity onPress={redo} style={styles.iconButton}><Text style={styles.iconText}>↷</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearCanvas} style={styles.iconButton}><Text style={styles.iconText}>⌫</Text></TouchableOpacity>
        </View>
      </View>
      <View style={styles.canvas} onLayout={e => setCanvasSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })} {...panResponder.panHandlers}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}>
          <Rect x="0" y="0" width={canvasSize.width} height={canvasSize.height} fill={C.paper} />
          {strokes.map((s, i) => <Path key={i} d={s.d} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
          {activeStroke && <Path d={activeStroke.d} stroke={activeStroke.color} strokeWidth={activeStroke.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
        </Svg>
      </View>
      <Text style={styles.label}>رنگ‌ها</Text>
      <View style={styles.palette}>{PALETTE.map(c => <TouchableOpacity key={c} onPress={() => { setColor(c); setTool('draw'); }} style={[styles.swatch, { backgroundColor: c }, color === c && tool === 'draw' ? styles.swatchActive : null]} />)}</View>
      <View style={styles.toolRow}>
        <TouchableOpacity style={[styles.toolPill, tool === 'draw' && styles.toolSelected]} onPress={() => setTool('draw')}><Text style={[styles.toolText, tool === 'draw' && styles.toolTextSelected]}>✎  قلم‌مو</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.toolPill, tool === 'erase' && styles.toolSelected]} onPress={() => setTool('erase')}><Text style={[styles.toolText, tool === 'erase' && styles.toolTextSelected]}>⌁  پاک‌کن</Text></TouchableOpacity>
      </View>
      <Text style={styles.label}>اندازه‌ی قلم</Text>
      <View style={styles.toolRow}>{[2,4,8,14].map(n => <TouchableOpacity key={n} onPress={() => setBrush(n)} style={[styles.sizeChoice, brush === n && styles.sizeSelected]}><View style={{ width: n + 4, height: n + 4, borderRadius: 20, backgroundColor: brush === n ? C.paper : C.ink }} /></TouchableOpacity>)}</View>
      <TouchableOpacity disabled={busy} onPress={saveArtwork} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'در حال ذخیره…' : 'ذخیره در گالری  ↗'}</Text></TouchableOpacity>
      <Text style={styles.footnote}>فعلاً طراحی دستی فعال است؛ ابزارهای لایه و کلاژ در مراحل بعد اضافه می‌شوند.</Text>
    </ScrollView>;
  }

  function Gallery() {
    return <ScrollView contentContainerStyle={styles.page}>
      <Header heading="گالری کوچک تو." sub="آثاری که از فکر تو شروع شدند." />
      {!isSupabaseConfigured && <View style={styles.notice}><Text style={styles.noticeText}>برای فعال شدن گالری آنلاین، اتصال Supabase را تنظیم کن.</Text></View>}
      {gallery.length === 0 ? <View style={styles.empty}>
        <Text style={styles.emptyIcon}>✳</Text><Text style={styles.h2}>اینجا جای اولین اثر توست</Text>
        <Text style={styles.sub}>یک طرح بکش و آن را در گالری ذخیره کن.</Text>
        <TouchableOpacity onPress={() => setScreen('studio')} style={styles.primary}><Text style={styles.primaryText}>رفتن به بوم</Text></TouchableOpacity>
      </View> : gallery.map(item => {
        const url = supabase.storage.from('artworks').getPublicUrl(item.image_path).data.publicUrl;
        return <View key={item.id} style={styles.artCard}>
          <Text style={styles.artTitle}>{item.title}</Text>
          <Text style={styles.artMeta}>{new Date(item.created_at).toLocaleDateString('fa-IR')}</Text>
          <Text style={styles.artLink} onPress={() => Alert.alert(item.title, url)}>مشاهده‌ی لینک اثر ↗</Text>
        </View>;
      })}
    </ScrollView>;
  }

  function Profile() {
    return <ScrollView contentContainerStyle={styles.page}>
      <Header heading={session ? 'سلام، هنرمند.' : 'به جمع ما بیا.'} sub={session ? 'حساب تو، دنیای خلاق تو.' : 'برای ذخیره و نمایش آثارت حساب بساز.'} />
      {!isSupabaseConfigured && <View style={styles.notice}><Text style={styles.noticeText}>برای ورود واقعی، مقادیر Supabase را در فایل .env وارد کن.</Text></View>}
      {session ? <>
        <View style={styles.profileCard}><Text style={styles.h2}>حساب کاربری</Text><Text style={styles.sub}>{session.user.email}</Text></View>
        <TouchableOpacity style={styles.secondary} onPress={async () => { await supabase.auth.signOut(); setGallery([]); }}><Text style={styles.secondaryText}>خروج از حساب</Text></TouchableOpacity>
      </> : <>
        <TextInput value={email} onChangeText={setEmail} placeholder="ایمیل" autoCapitalize="none" keyboardType="email-address" style={styles.input} textAlign="right" placeholderTextColor={C.muted} />
        <TextInput value={password} onChangeText={setPassword} placeholder="رمز عبور (حداقل ۶ نویسه)" secureTextEntry style={styles.input} textAlign="right" placeholderTextColor={C.muted} />
        <TouchableOpacity style={styles.primary} disabled={authBusy} onPress={authenticate}><Text style={styles.primaryText}>{authBusy ? 'لطفاً صبر کن…' : authMode === 'signup' ? 'ساخت حساب' : 'ورود'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')} style={styles.switchAuth}>
          <Text style={styles.switchText}>{authMode === 'signup' ? 'قبلاً حساب ساختی؟ ورود' : 'حساب نداری؟ ثبت‌نام'}</Text>
        </TouchableOpacity>
      </>}
      <View style={styles.noteCard}><Text style={styles.h2}>فضای امن برای خلق</Text><Text style={styles.sub}>آثار تو متعلق به تو هستند. قبل از انتشار، انتخاب کن چه چیزی را با دیگران به اشتراک می‌گذاری.</Text></View>
    </ScrollView>;
  }

  return <SafeAreaView style={styles.safe}>
    <ExpoStatusBar style="dark" />
    {screen === 'studio' ? <Studio /> : screen === 'gallery' ? <Gallery /> : <Profile />}
    <View style={styles.nav}>
      <TouchableOpacity onPress={() => setScreen('studio')} style={styles.navItem}><Text style={[styles.navIcon, screen === 'studio' && styles.navActive]}>✎</Text><Text style={[styles.navLabel, screen === 'studio' && styles.navActive]}>خلق</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen('gallery')} style={styles.navItem}><Text style={[styles.navIcon, screen === 'gallery' && styles.navActive]}>▦</Text><Text style={[styles.navLabel, screen === 'gallery' && styles.navActive]}>گالری</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => setScreen('profile')} style={styles.navItem}><Text style={[styles.navIcon, screen === 'profile' && styles.navActive]}>◯</Text><Text style={[styles.navLabel, screen === 'profile' && styles.navActive]}>حساب من</Text></TouchableOpacity>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30, gap: 14 },
  header: { gap: 7, marginBottom: 8 },
  brand: { fontSize: 14, letterSpacing: 1.4, color: C.clay, textAlign: 'left', fontWeight: '700' },
  h1: { color: C.ink, fontSize: 29, fontWeight: '700', textAlign: 'right', marginTop: 5 },
  h2: { color: C.ink, fontSize: 18, fontWeight: '700', textAlign: 'right' },
  sub: { color: C.muted, fontSize: 13, lineHeight: 22, textAlign: 'right' },
  label: { color: C.ink, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  titleRow: { gap: 7 },
  titleInput: { backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, color: C.ink },
  canvasToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 },
  inline: { flexDirection: 'row', gap: 7 },
  iconButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  iconText: { color: C.ink, fontSize: 20 },
  canvas: { height: 390, backgroundColor: C.paper, borderRadius: 18, borderWidth: 1, borderColor: C.line, overflow: 'hidden', touchAction: 'none' as any },
  palette: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: -5 },
  swatch: { width: 31, height: 31, borderRadius: 16, borderWidth: 2, borderColor: C.paper },
  swatchActive: { borderColor: C.ink, transform: [{ scale: 1.12 }] },
  toolRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  toolPill: { flex: 1, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, alignItems: 'center' },
  toolSelected: { backgroundColor: C.ink, borderColor: C.ink },
  toolText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  toolTextSelected: { color: C.paper },
  sizeChoice: { width: 52, height: 38, borderRadius: 12, backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sizeSelected: { backgroundColor: C.ink, borderColor: C.ink },
  primary: { backgroundColor: C.ink, paddingVertical: 15, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: C.paper, fontSize: 14, fontWeight: '700' },
  footnote: { color: C.muted, textAlign: 'right', fontSize: 11, lineHeight: 18 },
  nav: { height: 66, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 4 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  navIcon: { fontSize: 22, color: C.muted },
  navLabel: { fontSize: 11, color: C.muted },
  navActive: { color: C.ink, fontWeight: '700' },
  empty: { backgroundColor: C.paper, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 24, alignItems: 'center', gap: 12, marginTop: 12 },
  emptyIcon: { fontSize: 48, color: C.clay },
  notice: { backgroundColor: '#F0E4D2', padding: 13, borderRadius: 12 },
  noticeText: { color: C.ink, textAlign: 'right', lineHeight: 21, fontSize: 12 },
  artCard: { backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.line, padding: 16, gap: 8 },
  artTitle: { fontSize: 16, fontWeight: '700', color: C.ink, textAlign: 'right' },
  artMeta: { color: C.muted, textAlign: 'right', fontSize: 12 },
  artLink: { color: C.clay, textAlign: 'right', fontSize: 13, paddingTop: 6 },
  profileCard: { backgroundColor: C.paper, borderRadius: 16, padding: 18, gap: 8, borderWidth: 1, borderColor: C.line },
  input: { backgroundColor: C.paper, borderColor: C.line, borderWidth: 1, borderRadius: 13, padding: 14, color: C.ink },
  secondary: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14, alignItems: 'center' },
  secondaryText: { color: C.ink, fontWeight: '700' },
  switchAuth: { alignItems: 'center', padding: 10 },
  switchText: { color: C.clay, fontWeight: '600' },
  noteCard: { marginTop: 15, backgroundColor: '#EEE7DB', borderRadius: 16, padding: 17, gap: 8 }
});
