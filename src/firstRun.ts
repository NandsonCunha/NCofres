import * as SecureStore from 'expo-secure-store';

// Marca de "já viu a tela Sobre", para mostrá-la só na primeira abertura do app.
const ABOUT_SEEN = 'ncofres.aboutSeen';

export async function shouldShowWelcome(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ABOUT_SEEN)) !== '1';
  } catch {
    return false; // na dúvida, não atrapalha a abertura
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ABOUT_SEEN, '1');
  } catch {
    // se não gravar, a tela aparece de novo na próxima abertura; nada quebra
  }
}
