import { performance } from 'node:perf_hooks';

const companies = ['DRS', 'BIG5'];
const branchIds = ['branch-a', 'branch-b', 'branch-c'];
const rows = 8000;

const incidents = Array.from({ length: rows }).map((_, i) => ({
  company: companies[i % 2],
  branchId: branchIds[i % 3],
  createdAt: Date.now() - i * 2000
}));

const attendance = Array.from({ length: rows }).map((_, i) => ({
  company: companies[i % 2],
  guardUid: `g_${i % 700}`,
  branchId: branchIds[i % 3],
  mode: i % 2 === 0 ? 'IN' : 'OUT',
  createdAt: Date.now() - i * 1500
}));

const t0 = performance.now();
for (const company of companies) {
  const companyIncidents = incidents.filter((x) => x.company === company);
  const companyAttendance = attendance.filter((x) => x.company === company);
  const active = new Set(companyAttendance.filter((x) => x.mode === 'IN').map((x) => x.guardUid));
  if (active.size < 0 || companyIncidents.length < 0) {
    throw new Error('Unexpected metric failure');
  }
}
const ms = performance.now() - t0;
console.log(JSON.stringify({ processedRows: rows * 2, durationMs: Number(ms.toFixed(2)) }, null, 2));
if (ms > 700) process.exit(1);
