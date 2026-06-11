// ============================================================
// export-cookies.js - Exporta cookies desde tu navegador
// INSTRUCCIONES:
//   1. Abre el casino (BetFury/Stake) en tu navegador normal
//   2. Logueate
//   3. Abre la consola del navegador (F12 > Console)
//   4. Pega este script y presiona Enter
//   5. Copia el JSON resultante y guardalo en config/cookies.json
// ============================================================

// Para BetFury
async function exportBetfuryCookies() {
  const cookies = await cookieStore.getAll();
  const exportData = cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires || -1,
    httpOnly: false, // No podemos saber esto desde JS
    secure: c.secure || false,
    sameSite: c.sameSite || 'Lax',
  }));

  console.log('=== COOKIES BETFURY ===');
  console.log(JSON.stringify(exportData, null, 2));
  console.log('Copiar y pegar en roulette-capture/config/cookies.json');
}

// Para Stake
async function exportStakeCookies() {
  const cookies = await cookieStore.getAll();
  const exportData = cookies.map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    expires: c.expires || -1,
    httpOnly: false,
    secure: c.secure || false,
    sameSite: c.sameSite || 'Lax',
  }));

  console.log('=== COOKIES STAKE ===');
  console.log(JSON.stringify(exportData, null, 2));
  console.log('Copiar y pegar en roulette-capture/config/cookies.json');
}

// Ejecutar segun el casino
exportBetfuryCookies();
// exportStakeCookies(); // Descomentar para Stake