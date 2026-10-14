/**
 * Gancho do EAS Build: roda no servidor de build, antes do `npm install`.
 *
 * No perfil "release" (eas.json define NCOFRES_NO_UPDATES=1) gera um APK SEM
 * atualização automática: o expo-updates fica de fora do autolinking (nenhum
 * código nativo dele entra no APK) e a configuração de updates sai do app.json.
 * Nos outros perfis, não faz nada.
 */
const fs = require('fs');
const path = require('path');

if (process.env.NCOFRES_NO_UPDATES !== '1') process.exit(0);

const root = path.join(__dirname, '..');

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.expo = pkg.expo || {};
pkg.expo.autolinking = pkg.expo.autolinking || {};
pkg.expo.autolinking.exclude = [...new Set([...(pkg.expo.autolinking.exclude || []), 'expo-updates'])];
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const appPath = path.join(root, 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
delete app.expo.updates;
app.expo.updates = { enabled: false };
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');

console.log('[ncofres] build sem atualização automática: expo-updates excluído do APK');
