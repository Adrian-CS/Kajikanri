// Genera el par de claves VAPID. Ejecutar una sola vez: node scripts/vapid.mjs
// Si se regeneran, todas las suscripciones existentes dejan de valer.
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);

console.log('\n# wrangler.toml → [vars]');
console.log(`VAPID_PUBLIC_KEY = "${Buffer.from(raw).toString('base64url')}"`);
console.log('\n# npx wrangler secret put VAPID_PRIVATE_JWK  → pegar esta línea:');
console.log(JSON.stringify(jwk));
