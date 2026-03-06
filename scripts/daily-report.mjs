import process from 'node:process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const webhook = process.env.SHEETS_WEBHOOK_URL;

if (!projectId || !clientEmail || !privateKey || !webhook) {
  console.error('Missing FIREBASE_* or SHEETS_WEBHOOK_URL secrets.');
  process.exit(1);
}

initializeApp({
  credential: cert({ projectId, clientEmail, privateKey })
});

const db = getFirestore();

async function countRecent(path) {
  const snapshot = await db.collection(path).orderBy('createdAt', 'desc').limit(300).get();
  return snapshot.size;
}

const payload = {
  generatedAt: new Date().toISOString(),
  drs: {
    incidents: await countRecent('DRS_incident'),
    patrol: await countRecent('DRS_patrol'),
    attendance: await countRecent('DRS_attendance')
  },
  big5: {
    incidents: await countRecent('BIG5_incident'),
    patrol: await countRecent('BIG5_patrol'),
    attendance: await countRecent('BIG5_attendance')
  }
};

await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

console.log('Report sent', payload);
