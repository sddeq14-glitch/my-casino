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

export default async function handler(req, res) {
  // Настройка CORS, чтобы браузер не блокировал
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Vercel сам парсит body, если это JSON
    const { wallet, clientSeed, betAmount, target, betOver } = req.body;

    if (!wallet) return res.status(400).json({ error: 'Нет кошелька' });

    let players = await sb(`players?wallet=eq.${encodeURIComponent(wallet)}`);
    let player = players[0];

    // Если игрока нет, создаем ему баланс 1000
    if (!player) {
      await sb('players', 'POST', { wallet, balance: 1000, server_seed: 'seed123', nonce: 0 });
      players = await sb(`players?wallet=eq.${encodeURIComponent(wallet)}`);
      player = players[0];
    }

    // Честный рандом от 0 до 100
    const roll = Math.random() * 100;
    const win = betOver ? roll > target : roll < target;
    
    // Выплата (x1.9, чтобы у казино был свой процент)
    const payout = win ? Number(betAmount) * 1.9 : 0;
    const newBalance = Number(player.balance) - Number(betAmount) + payout;

    // Сохраняем новый баланс
    await sb(`players?wallet=eq.${encodeURIComponent(wallet)}`, 'PATCH', { balance: newBalance });

    return res.status(200).json({
      roll: roll.toFixed(2), 
      win, 
      payout, 
      balance: newBalance
    });
  } catch (err) {
    return res.status(500).json({ error: 'Ошибка сервера: ' + err.message });
  }
}
