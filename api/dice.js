const SUPABASE_URL = 'https://evmkswwzvbcwkynzqfnc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bWtzd3d6dmJjd2t5bnpxZm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MzM3ODAsImV4cCI6MjExMDAwOTc4MH0.I6z23NCewsyBKmc8mHhQ8KohrNi9fqoy_IkLcDEEuVQ';

async function sb(path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': method === 'POST' ? 'return=representation' : '' },
    body: body ? JSON.stringify(body) : null,
  });
  return res.json();
}

async function hmacSha256(keyHex, message) {
  const enc = new TextEncoder();
  const keyBytes = new Uint8Array(keyHex.length / 2);
  for (let i = 0; i < keyBytes.length; i++) keyBytes[i] = parseInt(keyHex.substr(i * 2, 2), 16);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') return response.status(200).end();
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const { wallet, clientSeed, betAmount, target, betOver } = request.body;

  if (!wallet || !clientSeed) return response.status(400).json({ error: 'wallet и clientSeed обязательны' });
  if (betAmount <= 0) return response.status(400).json({ error: 'ставка > 0' });
  if (target < 2 || target > 98) return response.status(400).json({ error: 'target 2..98' });

  try {
    let players = await sb(`players?wallet=eq.${encodeURIComponent(wallet)}`);
    let player = players[0];

    if (!player) {
      await sb('players', 'POST', { wallet, balance: 1000, server_seed: randomHex(32), nonce: 0 });
      players = await sb(`players?wallet=eq.${encodeURIComponent(wallet)}`);
      player = players[0];
    }

    const serverSeed = player.server_seed;
    const nonce = (player.nonce || 0) + 1;
    const hash = await hmacSha256(serverSeed, `${clientSeed}:${nonce}`);
    const roll = (parseInt(hash.slice(0, 8), 16) / 0xFFFFFFFF) * 100;

    const win = betOver ? roll > target : roll < target;
    const payout = win ? betAmount * (98 / (betOver ? 100 - target : target)) : 0;
    const newBalance = Number(player.balance) - betAmount + payout;

    await sb(`players?wallet=eq.${encodeURIComponent(wallet)}`, 'PATCH', { balance: newBalance, nonce });

    return response.status(200).json({
      roll: roll.toFixed(4), win, payout: payout.toFixed(8), balance: newBalance.toFixed(8), nonce,
    });
  } catch (e) {
    return response.status(500).json({ error: e.message });
  }
    }
