import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc
} from 'firebase/firestore';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast, { Toaster } from 'react-hot-toast';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { auth, db, provider } from './lib/firebase';

type Role = 'owner' | 'management' | 'admin' | 'guard';
type Company = 'DRS' | 'BIG5';

type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  companyCode: Company;
};

type Metric = {
  activeGuards: number;
  incidentsToday: number;
  patrolCompletionRate: number;
  attendance: number;
};

type ChartPoint = {
  day: string;
  DRS: number;
  BIG5: number;
};

type MapPoint = {
  lat: number;
  lng: number;
  label: string;
  company: Company;
};

const defaultMetric: Metric = {
  activeGuards: 0,
  incidentsToday: 0,
  patrolCompletionRate: 0,
  attendance: 0
};

function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, 'users', u.uid));
      if (snap.exists()) {
        setProfile(snap.data() as UserProfile);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center">Loading...</div>;
  if (!user) return <Login />;
  if (!profile) return <RoleSetup user={user} onDone={setProfile} />;
  if (profile.role === 'guard') {
    return <div className="min-h-screen grid place-items-center p-6">This dashboard is limited to Owner/Management/Admin roles.</div>;
  }
  return <Dashboard profile={profile} />;
}

function Login() {
  const login = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch {
      toast.error('Google login failed');
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Security Command Center</h1>
        <p className="text-sm text-white/80">Unified control for DRS and Big 5 operations.</p>
        <button onClick={login} className="w-full py-3 rounded-xl bg-white text-black font-semibold">Sign in with Google</button>
      </div>
      <Toaster position="top-right" />
    </div>
  );
}

function RoleSetup({ user, onDone }: { user: any; onDone: (profile: UserProfile) => void }) {
  const [role, setRole] = useState<Role>('management');
  const [companyCode, setCompanyCode] = useState<Company>('DRS');

  const save = async () => {
    const profile: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || 'Unknown',
      email: user.email || '',
      role,
      companyCode
    };
    await setDoc(doc(db, 'users', user.uid), profile, { merge: true });
    onDone(profile);
  };

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md bg-black/30 border border-white/10 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-semibold">Role Setup</h2>
        <select className="w-full p-3 rounded bg-black border border-white/20" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="owner">Owner</option>
          <option value="management">Management</option>
          <option value="admin">Admin</option>
          <option value="guard">Guard</option>
        </select>
        <select className="w-full p-3 rounded bg-black border border-white/20" value={companyCode} onChange={(e) => setCompanyCode(e.target.value as Company)}>
          <option value="DRS">DRS</option>
          <option value="BIG5">Big 5</option>
        </select>
        <button className="w-full py-3 rounded-xl bg-white text-black font-semibold" onClick={save}>Continue</button>
      </div>
    </div>
  );
}

function Dashboard({ profile }: { profile: UserProfile }) {
  const navigate = useNavigate();
  const [drs, setDrs] = useState<Metric>(defaultMetric);
  const [big5, setBig5] = useState<Metric>(defaultMetric);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);

  useEffect(() => {
    const unsubs = [subscribeMetric('DRS', setDrs), subscribeMetric('BIG5', setBig5), subscribeChart(setChart), subscribeMapPoints(setMapPoints)];
    return () => unsubs.forEach((u) => u());
  }, []);

  const logOut = async () => {
    await signOut(auth);
  };

  const overview = useMemo(() => {
    return {
      activeGuards: drs.activeGuards + big5.activeGuards,
      incidents: drs.incidentsToday + big5.incidentsToday,
      patrolRate: Math.round((drs.patrolCompletionRate + big5.patrolCompletionRate) / 2)
    };
  }, [drs, big5]);

  return (
    <div className="min-h-screen pb-16">
      <header className="sticky top-0 z-30 bg-[#08132b]/95 border-b border-white/10 px-4 py-3 backdrop-blur">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-semibold">Security Command Center</h1>
            <p className="text-xs text-white/70">{profile.displayName} ({profile.role})</p>
          </div>
          <button className="text-xs underline" onClick={logOut}>Sign out</button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Panel title="Active Guards" value={String(overview.activeGuards)} />
          <Panel title="Incidents Today" value={String(overview.incidents)} />
          <Panel title="Patrol Rate" value={`${overview.patrolRate}%`} />
        </div>

        <section className="grid md:grid-cols-2 gap-4">
          <CompanyCard name="DRS Data Response Security" metric={drs} color="bg-drs" />
          <CompanyCard name="Big 5 Security" metric={big5} color="bg-big5Blue" accent="text-big5Gold" />
        </section>

        <section className="bg-black/30 border border-white/10 rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Operational Analytics</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="drsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EB623D" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#EB623D" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="b5Grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.2)" />
                <XAxis dataKey="day" stroke="#fff" />
                <YAxis stroke="#fff" />
                <Tooltip />
                <Area type="monotone" dataKey="DRS" stroke="#EB623D" fillOpacity={1} fill="url(#drsGrad)" />
                <Area type="monotone" dataKey="BIG5" stroke="#1d4ed8" fillOpacity={1} fill="url(#b5Grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <LiveMap points={mapPoints} />

        <section className="grid md:grid-cols-3 gap-3">
          <button className="p-4 rounded-xl bg-white text-black font-semibold" onClick={() => navigate('/reports')}>Reports & Exports</button>
          <button className="p-4 rounded-xl bg-white text-black font-semibold" onClick={() => navigate('/qr')}>QR Generator</button>
          <button className="p-4 rounded-xl bg-red-600 text-white font-semibold" onClick={() => navigate('/alerts')}>Incident Alerts</button>
        </section>
      </main>

      <Routes>
        <Route path="/reports" element={<ReportsView />} />
        <Route path="/qr" element={<QrView />} />
        <Route path="/alerts" element={<AlertsView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" />
    </div>
  );
}

function Panel({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-3">
      <p className="text-xs text-white/75">{title}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function CompanyCard({ name, metric, color, accent }: { name: string; metric: Metric; color: string; accent?: string }) {
  return (
    <section className="bg-black/30 border border-white/10 rounded-2xl p-4 space-y-2">
      <div className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold text-white ${color} ${accent || ''}`}>{name}</div>
      <p className="text-sm">Active Guards: {metric.activeGuards}</p>
      <p className="text-sm">Incidents Today: {metric.incidentsToday}</p>
      <p className="text-sm">Patrol Completion: {metric.patrolCompletionRate}%</p>
      <p className="text-sm">Attendance Logs: {metric.attendance}</p>
    </section>
  );
}

function ReportsView() {
  const reportRef = useRef<HTMLDivElement | null>(null);

  const exportCsv = async () => {
    const rows = ['company,metric,value'];
    const drs = await getMetricSnapshot('DRS');
    const big5 = await getMetricSnapshot('BIG5');
    Object.entries(drs).forEach(([k, v]) => rows.push(`DRS,${k},${v}`));
    Object.entries(big5).forEach(([k, v]) => rows.push(`BIG5,${k},${v}`));
    downloadFile(rows.join('\n'), 'security_summary.csv', 'text/csv');
    toast.success('CSV exported');
  };

  const exportPdf = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current);
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    pdf.addImage(img, 'PNG', 10, 10, 190, 0);
    pdf.save(`security_summary_${Date.now()}.pdf`);
  };

  const sendToSheets = async () => {
    const url = import.meta.env.VITE_SHEETS_WEBHOOK_URL;
    if (!url) {
      toast.error('Set VITE_SHEETS_WEBHOOK_URL first');
      return;
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      drs: await getMetricSnapshot('DRS'),
      big5: await getMetricSnapshot('BIG5')
    };
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    toast.success('Google Sheets update sent');
  };

  return (
    <div className="fixed inset-0 bg-[#030813]/95 overflow-auto p-4">
      <div className="max-w-2xl mx-auto space-y-4" ref={reportRef}>
        <h2 className="text-xl font-semibold">Reports & Exports</h2>
        <p className="text-sm text-white/80">Daily reports and weekly patrol summaries can be scheduled using the included GitHub Action.</p>
        <div className="grid grid-cols-3 gap-2">
          <button className="p-3 rounded-lg bg-white text-black font-semibold" onClick={exportCsv}>CSV</button>
          <button className="p-3 rounded-lg bg-white text-black font-semibold" onClick={exportPdf}>PDF</button>
          <button className="p-3 rounded-lg bg-white text-black font-semibold" onClick={sendToSheets}>Google Sheets</button>
        </div>
      </div>
    </div>
  );
}

function QrView() {
  const [value, setValue] = useState('');
  const [img, setImg] = useState('');

  const generate = async () => {
    const out = await QRCode.toDataURL(value, { color: { dark: '#000', light: '#fff' }, width: 450 });
    setImg(out);
  };

  const pdf = () => {
    if (!img) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    doc.text('Security QR Printable', 10, 10);
    doc.addImage(img, 'PNG', 20, 20, 170, 170);
    doc.save(`qr_${value || 'code'}.pdf`);
  };

  return (
    <div className="fixed inset-0 bg-[#030813]/95 overflow-auto p-4">
      <div className="max-w-xl mx-auto space-y-3">
        <h2 className="text-xl font-semibold">QR Generator</h2>
        <input className="w-full p-3 rounded bg-black border border-white/20" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Checkpoint / employee / equipment ID" />
        <button className="w-full p-3 rounded bg-white text-black font-semibold" onClick={generate}>Generate QR</button>
        {img && <img src={img} className="bg-white p-4 rounded mx-auto" alt="qr" />}
        {img && <button className="w-full p-3 rounded bg-white text-black font-semibold" onClick={pdf}>Download PDF</button>}
      </div>
    </div>
  );
}

function AlertsView() {
  const [alerts, setAlerts] = useState<Array<Record<string, any>>>([]);

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'DRS_panic'), orderBy('createdAt', 'desc'), limit(20)), (drsSnap) => {
      onSnapshot(query(collection(db, 'BIG5_panic'), orderBy('createdAt', 'desc'), limit(20)), (b5Snap) => {
        const merged = ([
          ...drsSnap.docs.map((d) => ({ id: d.id, company: 'DRS', ...d.data() })),
          ...b5Snap.docs.map((d) => ({ id: d.id, company: 'BIG5', ...d.data() }))
        ] as Array<Record<string, any>>).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) * -1);
        setAlerts(merged);
      });
    });
    return () => unsub();
  }, []);

  return (
    <div className="fixed inset-0 bg-[#030813]/95 overflow-auto p-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold mb-3">Incident Alerts</h2>
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={`${a.company}_${a.id}`} className="bg-black/40 border border-red-500/40 rounded-xl p-3">
              <p className="font-semibold text-red-300">{a.company} PANIC | {a.guardName || a.guardUid}</p>
              <p className="text-sm text-white/80">{String(a.createdAt)}</p>
              <p className="text-xs">GPS: {a.gps?.lat}, {a.gps?.lng}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LiveMap({ points }: { points: MapPoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY) return;
    const setup = async () => {
      await loadMaps();
      if (!window.google?.maps) return;
      const center = points[0] ? { lat: points[0].lat, lng: points[0].lng } : { lat: -26.2041, lng: 28.0473 };
      const map = new window.google.maps.Map(ref.current!, { center, zoom: 10, mapTypeControl: false, streetViewControl: false });
      points.forEach((p) => new window.google.maps.Marker({ map, position: { lat: p.lat, lng: p.lng }, title: `${p.company} ${p.label}` }));
    };
    setup().catch(console.error);
  }, [points]);

  return (
    <section className="bg-black/30 border border-white/10 rounded-2xl p-4">
      <h2 className="font-semibold mb-3">Live Guard/Incident Map</h2>
      <div className="h-72 rounded-xl bg-black/40" ref={ref} />
    </section>
  );
}

function subscribeMetric(company: Company, setter: (m: Metric) => void) {
  const state: Metric = { ...defaultMetric };
  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(query(collection(db, `${company}_attendance`), orderBy('createdAt', 'desc'), limit(200)), (snap) => {
      state.attendance = snap.size;
      const active = new Set<string>();
      snap.docs.forEach((d) => {
        const x = d.data();
        if (x.mode === 'IN') active.add(String(x.guardUid));
      });
      state.activeGuards = active.size;
      setter({ ...state });
    })
  );

  unsubs.push(
    onSnapshot(query(collection(db, `${company}_incident`), orderBy('createdAt', 'desc'), limit(200)), (snap) => {
      const today = new Date().toISOString().slice(0, 10);
      state.incidentsToday = snap.docs.filter((d) => String(d.data().createdAt || '').startsWith(today)).length;
      setter({ ...state });
    })
  );

  unsubs.push(
    onSnapshot(query(collection(db, `${company}_patrol`), orderBy('createdAt', 'desc'), limit(200)), (snap) => {
      state.patrolCompletionRate = Math.min(100, Math.round((snap.size / 40) * 100));
      setter({ ...state });
    })
  );

  return () => unsubs.forEach((u) => u());
}

function subscribeChart(setter: (points: ChartPoint[]) => void) {
  const days = Array.from({ length: 7 }).map((_, idx) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (6 - idx));
    return dt.toISOString().slice(5, 10);
  });

  const recalc = async () => {
    const drsSnap = await getDocs(query(collection(db, 'DRS_incident'), orderBy('createdAt', 'desc'), limit(500)));
    const b5Snap = await getDocs(query(collection(db, 'BIG5_incident'), orderBy('createdAt', 'desc'), limit(500)));
    const data = days.map((day) => ({ day, DRS: 0, BIG5: 0 }));
    drsSnap.docs.forEach((d) => {
      const k = String(d.data().createdAt || '').slice(5, 10);
      const row = data.find((x) => x.day === k);
      if (row) row.DRS += 1;
    });
    b5Snap.docs.forEach((d) => {
      const k = String(d.data().createdAt || '').slice(5, 10);
      const row = data.find((x) => x.day === k);
      if (row) row.BIG5 += 1;
    });
    setter(data);
  };

  recalc();
  const timer = setInterval(recalc, 30000);
  return () => clearInterval(timer);
}

function subscribeMapPoints(setter: (p: MapPoint[]) => void) {
  const update = async () => {
    const drs = await getDocs(query(collection(db, 'DRS_incident'), orderBy('createdAt', 'desc'), limit(20)));
    const b5 = await getDocs(query(collection(db, 'BIG5_incident'), orderBy('createdAt', 'desc'), limit(20)));
    const points: MapPoint[] = [
      ...drs.docs.map((d) => ({ company: 'DRS' as const, label: 'Incident', lat: Number(d.data().gps?.lat || -26.2041), lng: Number(d.data().gps?.lng || 28.0473) })),
      ...b5.docs.map((d) => ({ company: 'BIG5' as const, label: 'Incident', lat: Number(d.data().gps?.lat || -26.2041), lng: Number(d.data().gps?.lng || 28.0473) }))
    ];
    setter(points);
  };

  update();
  const timer = setInterval(update, 30000);
  return () => clearInterval(timer);
}

async function getMetricSnapshot(company: Company): Promise<Metric> {
  const [attendanceSnap, incidentSnap, patrolSnap] = await Promise.all([
    getDocs(query(collection(db, `${company}_attendance`), orderBy('createdAt', 'desc'), limit(200))),
    getDocs(query(collection(db, `${company}_incident`), orderBy('createdAt', 'desc'), limit(200))),
    getDocs(query(collection(db, `${company}_patrol`), orderBy('createdAt', 'desc'), limit(200)))
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const guards = new Set<string>();
  attendanceSnap.docs.forEach((d) => {
    if (d.data().mode === 'IN') guards.add(String(d.data().guardUid));
  });
  return {
    activeGuards: guards.size,
    incidentsToday: incidentSnap.docs.filter((d) => String(d.data().createdAt || '').startsWith(today)).length,
    patrolCompletionRate: Math.min(100, Math.round((patrolSnap.size / 40) * 100)),
    attendance: attendanceSnap.size
  };
}

function downloadFile(content: string, name: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadMaps() {
  if (window.google?.maps) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Google Maps load failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps load failed'));
    document.head.appendChild(script);
  });
}

declare global {
  interface Window {
    google?: any;
  }
}

export default App;
