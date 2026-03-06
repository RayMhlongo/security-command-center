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
  setDoc,
  where
} from 'firebase/firestore';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import toast, { Toaster } from 'react-hot-toast';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { auth, db, isFirebaseConfigured, provider } from './lib/firebase';
import { getDashboardCache, setDashboardCache } from './lib/offlineCache';

type Role = 'owner' | 'management' | 'admin' | 'guard';
type Company = 'DRS' | 'BIG5';

type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  companyCode: Company;
  branchId: string;
  branchName: string;
  onboardingCompleted: boolean;
};

type Branch = {
  id: string;
  companyCode: Company;
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
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

type AttendanceEntry = {
  id: string;
  company: Company;
  guardName?: string;
  guardUid?: string;
  mode?: 'IN' | 'OUT';
  branchId?: string;
  branchName?: string;
  createdAt?: string;
};

type DashboardSnapshot = {
  drs: Metric;
  big5: Metric;
  chart: ChartPoint[];
  mapPoints: MapPoint[];
  attendanceLogs: AttendanceEntry[];
};

const defaultMetric: Metric = {
  activeGuards: 0,
  incidentsToday: 0,
  patrolCompletionRate: 0,
  attendance: 0
};

const fallbackBranches: Branch[] = [
  { id: 'drs-jhb-central', companyCode: 'DRS', name: 'Johannesburg Central', code: 'JHB-CENTRAL', active: true, createdAt: new Date().toISOString() },
  { id: 'drs-pta-east', companyCode: 'DRS', name: 'Pretoria East', code: 'PTA-EAST', active: true, createdAt: new Date().toISOString() },
  { id: 'big5-jhb-north', companyCode: 'BIG5', name: 'Johannesburg North', code: 'JHB-NORTH', active: true, createdAt: new Date().toISOString() },
  { id: 'big5-randburg', companyCode: 'BIG5', name: 'Randburg', code: 'RANDBURG', active: true, createdAt: new Date().toISOString() }
];

function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  if (!isFirebaseConfigured) {
    return <ConfigMissingScreen />;
  }

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
  if (!profile || !profile.onboardingCompleted) return <RoleSetup user={user} onDone={setProfile} />;
  if (profile.role === 'guard') {
    return <div className="min-h-screen grid place-items-center p-6">This dashboard is limited to Owner/Management/Admin roles.</div>;
  }
  return <Dashboard profile={profile} />;
}

function ConfigMissingScreen() {
  return (
    <div className="min-h-[100dvh] p-6 grid place-items-center text-white">
      <div className="w-full max-w-xl rounded-2xl border border-red-500/40 bg-black/70 p-6 space-y-3">
        <h1 className="text-xl font-semibold">Configuration Required</h1>
        <p className="text-sm text-white/80">
          Firebase environment values are missing in this build. Add Vite Firebase variables and rebuild.
        </p>
        <p className="text-xs text-white/60">
          Required: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
        </p>
      </div>
    </div>
  );
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
  const [branches, setBranches] = useState<Branch[]>(fallbackBranches);
  const [branchId, setBranchId] = useState('drs-jhb-central');

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, 'DRS_branches'), where('active', '==', true), limit(100)), (snap) => {
        const drs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }));
        setBranches((prev) => [...drs, ...prev.filter((b) => b.companyCode !== 'DRS')]);
      }),
      onSnapshot(query(collection(db, 'BIG5_branches'), where('active', '==', true), limit(100)), (snap) => {
        const b5 = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }));
        setBranches((prev) => [...prev.filter((b) => b.companyCode !== 'BIG5'), ...b5]);
      })
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  useEffect(() => {
    const companyBranches = branches.filter((b) => b.companyCode === companyCode);
    if (companyBranches.length > 0) {
      setBranchId(companyBranches[0].id);
    }
  }, [companyCode, branches]);

  const save = async () => {
    const selectedBranch = branches.find((b) => b.id === branchId && b.companyCode === companyCode);
    if (role !== 'owner' && !selectedBranch) {
      toast.error('Select a branch first.');
      return;
    }

    const profile: UserProfile = {
      uid: user.uid,
      displayName: user.displayName || 'Unknown',
      email: user.email || '',
      role,
      companyCode,
      branchId: role === 'owner' ? 'ALL' : selectedBranch!.id,
      branchName: role === 'owner' ? 'All Branches' : selectedBranch!.name,
      onboardingCompleted: true
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
        {role !== 'owner' && (
          <select className="w-full p-3 rounded bg-black border border-white/20" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.filter((b) => b.companyCode === companyCode).map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        )}
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
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceEntry[]>([]);
  const [branches, setBranches] = useState<Branch[]>(fallbackBranches);
  const [selectedCompany, setSelectedCompany] = useState<'ALL' | Company>(profile.role === 'owner' ? 'ALL' : profile.companyCode);
  const [selectedBranch, setSelectedBranch] = useState<string>(profile.role === 'owner' ? 'ALL' : profile.branchId);
  const [lastSync, setLastSync] = useState<string>('Not synced yet');

  const branchOptions = branches.filter((branch) => selectedCompany === 'ALL' ? false : branch.companyCode === selectedCompany);

  useEffect(() => {
    if (selectedCompany === 'ALL') {
      setSelectedBranch('ALL');
      return;
    }
    if (!branchOptions.some((b) => b.id === selectedBranch)) {
      setSelectedBranch(branchOptions[0]?.id || 'ALL');
    }
  }, [selectedCompany, branches]);

  useEffect(() => {
    const unsubs = [
      onSnapshot(query(collection(db, 'DRS_branches'), where('active', '==', true), limit(100)), (snap) => {
        const drsBranches = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }));
        setBranches((prev) => [...drsBranches, ...prev.filter((b) => b.companyCode !== 'DRS')]);
      }),
      onSnapshot(query(collection(db, 'BIG5_branches'), where('active', '==', true), limit(100)), (snap) => {
        const b5Branches = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }));
        setBranches((prev) => [...prev.filter((b) => b.companyCode !== 'BIG5'), ...b5Branches]);
      })
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${selectedCompany}_${selectedBranch}`;

    const refresh = async () => {
      try {
        const data = await loadDashboardSnapshot(selectedCompany, selectedBranch);
        if (cancelled) return;
        setDrs(data.drs);
        setBig5(data.big5);
        setChart(data.chart);
        setMapPoints(data.mapPoints);
        setAttendanceLogs(data.attendanceLogs);
        setLastSync(new Date().toLocaleTimeString());
        await setDashboardCache(cacheKey, data);
      } catch {
        const cached = await getDashboardCache<DashboardSnapshot>(cacheKey);
        if (cached && !cancelled) {
          setDrs(cached.drs);
          setBig5(cached.big5);
          setChart(cached.chart);
          setMapPoints(cached.mapPoints);
          setAttendanceLogs(cached.attendanceLogs);
          setLastSync('Cached snapshot');
        }
      }
    };

    refresh();
    const timer = setInterval(refresh, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedCompany, selectedBranch]);

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
            <p className="text-xs text-white/60">Last sync: {lastSync}</p>
          </div>
          <button className="text-xs underline" onClick={logOut}>Sign out</button>
        </div>
      </header>

      <main className="p-4 space-y-4">
        <section className="bg-black/30 border border-white/10 rounded-xl p-3 grid md:grid-cols-3 gap-2">
          <select
            className="p-2 rounded bg-black border border-white/20"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value as 'ALL' | Company)}
            disabled={profile.role !== 'owner'}
          >
            <option value="ALL">All Companies</option>
            <option value="DRS">DRS</option>
            <option value="BIG5">Big 5</option>
          </select>
          <select
            className="p-2 rounded bg-black border border-white/20"
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            disabled={profile.role !== 'owner' || selectedCompany === 'ALL'}
          >
            <option value="ALL">All Branches</option>
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          <div className="text-xs text-white/70 flex items-center">
            Scope: {selectedCompany === 'ALL' ? 'All Companies / All Branches' : `${selectedCompany} / ${selectedBranch === 'ALL' ? 'All Branches' : (branchOptions.find((b) => b.id === selectedBranch)?.name || selectedBranch)}`}
          </div>
        </section>

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

        <section className="bg-black/30 border border-white/10 rounded-2xl p-4">
          <h2 className="font-semibold mb-3">Attendance Logs</h2>
          <ul className="space-y-2 text-sm max-h-56 overflow-auto">
            {attendanceLogs.map((log) => (
              <li key={`${log.company}_${log.id}`} className="border-b border-white/10 pb-2">
                {log.company} | {log.guardName || log.guardUid} | {log.mode} | {log.branchName || log.branchId || 'N/A'} | {String(log.createdAt || '')}
              </li>
            ))}
            {attendanceLogs.length === 0 && <li>No attendance logs in current scope.</li>}
          </ul>
        </section>

        <section className="grid md:grid-cols-3 gap-3">
          <button className="p-4 rounded-xl bg-white text-black font-semibold" onClick={() => navigate('/reports')}>Reports & Exports</button>
          <button className="p-4 rounded-xl bg-white text-black font-semibold" onClick={() => navigate('/qr')}>QR Generator</button>
          <button className="p-4 rounded-xl bg-red-600 text-white font-semibold" onClick={() => navigate('/alerts')}>Incident Alerts</button>
        </section>
      </main>

      <Routes>
        <Route path="/reports" element={<ReportsView selectedCompany={selectedCompany} selectedBranch={selectedBranch} />} />
        <Route path="/qr" element={<QrView />} />
        <Route path="/alerts" element={<AlertsView selectedCompany={selectedCompany} selectedBranch={selectedBranch} />} />
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

function ReportsView({ selectedCompany, selectedBranch }: { selectedCompany: 'ALL' | Company; selectedBranch: string }) {
  const reportRef = useRef<HTMLDivElement | null>(null);

  const exportCsv = async () => {
    const rows = ['company,metric,value'];
    const drs = await getMetricSnapshot('DRS', selectedCompany === 'DRS' ? selectedBranch : 'ALL');
    const big5 = await getMetricSnapshot('BIG5', selectedCompany === 'BIG5' ? selectedBranch : 'ALL');
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
      drs: await getMetricSnapshot('DRS', selectedCompany === 'DRS' ? selectedBranch : 'ALL'),
      big5: await getMetricSnapshot('BIG5', selectedCompany === 'BIG5' ? selectedBranch : 'ALL')
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

function AlertsView({ selectedCompany, selectedBranch }: { selectedCompany: 'ALL' | Company; selectedBranch: string }) {
  const [alerts, setAlerts] = useState<Array<Record<string, any>>>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const companies: Company[] = selectedCompany === 'ALL' ? ['DRS', 'BIG5'] : [selectedCompany];
      const merged: Array<Record<string, any>> = [];
      for (const company of companies) {
        const constraints: any[] = [];
        if (selectedBranch !== 'ALL') {
          constraints.push(where('branchId', '==', selectedBranch));
        }
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(limit(20));
        const snap = await getDocs(query(collection(db, `${company}_panic`), ...constraints));
        merged.push(...snap.docs.map((d) => ({ id: d.id, company, ...d.data() })));
      }
      if (!cancelled) {
        setAlerts(merged.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))));
      }
    };
    run();
    const timer = setInterval(run, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedCompany, selectedBranch]);

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

async function getMetricSnapshot(company: Company, branchId: string): Promise<Metric> {
  const attendanceSnap = await getDocs(scopedCollectionQuery(`${company}_attendance`, branchId, 200));
  const incidentSnap = await getDocs(scopedCollectionQuery(`${company}_incident`, branchId, 200));
  const patrolSnap = await getDocs(scopedCollectionQuery(`${company}_patrol`, branchId, 200));
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

async function loadDashboardSnapshot(selectedCompany: 'ALL' | Company, selectedBranch: string): Promise<DashboardSnapshot> {
  const companies: Company[] = selectedCompany === 'ALL' ? ['DRS', 'BIG5'] : [selectedCompany];
  const branchFilter = selectedCompany === 'ALL' ? 'ALL' : selectedBranch;

  const drsMetric = companies.includes('DRS') ? await getMetricSnapshot('DRS', branchFilter) : defaultMetric;
  const big5Metric = companies.includes('BIG5') ? await getMetricSnapshot('BIG5', branchFilter) : defaultMetric;

  const chartDays = Array.from({ length: 7 }).map((_, idx) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - (6 - idx));
    return dt.toISOString().slice(5, 10);
  });
  const chart = chartDays.map((day) => ({ day, DRS: 0, BIG5: 0 }));
  const mapPoints: MapPoint[] = [];
  const attendanceLogs: AttendanceEntry[] = [];

  for (const company of companies) {
    const incidentSnap = await getDocs(scopedCollectionQuery(`${company}_incident`, branchFilter, 500));
    incidentSnap.docs.forEach((d) => {
      const created = String(d.data().createdAt || '');
      const day = created.slice(5, 10);
      const row = chart.find((x) => x.day === day);
      if (row) {
        if (company === 'DRS') row.DRS += 1;
        if (company === 'BIG5') row.BIG5 += 1;
      }
      mapPoints.push({
        company,
        label: 'Incident',
        lat: Number(d.data().gps?.lat || -26.2041),
        lng: Number(d.data().gps?.lng || 28.0473)
      });
    });

    const panicSnap = await getDocs(scopedCollectionQuery(`${company}_panic`, branchFilter, 50));
    panicSnap.docs.forEach((d) => {
      mapPoints.push({
        company,
        label: 'Panic',
        lat: Number(d.data().gps?.lat || -26.2041),
        lng: Number(d.data().gps?.lng || 28.0473)
      });
    });

    const attendanceSnap = await getDocs(scopedCollectionQuery(`${company}_attendance`, branchFilter, 50));
    attendanceSnap.docs.forEach((d) => {
      attendanceLogs.push({
        id: d.id,
        company,
        ...(d.data() as Omit<AttendanceEntry, 'id' | 'company'>)
      });
    });
  }

  attendanceLogs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return {
    drs: drsMetric,
    big5: big5Metric,
    chart,
    mapPoints: mapPoints.slice(0, 100),
    attendanceLogs: attendanceLogs.slice(0, 100)
  };
}

function scopedCollectionQuery(path: string, branchId: string, rowLimit: number) {
  const constraints: any[] = [];
  if (branchId !== 'ALL') {
    constraints.push(where('branchId', '==', branchId));
  }
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(rowLimit));
  return query(collection(db, path), ...constraints);
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
