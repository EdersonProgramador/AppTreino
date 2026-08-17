# App Treino — Mobile (Expo)

Shell React Native (Expo) com WebView do produto web existente + player nativo do **Play**.

- Abre em `/login?app=mobile` (não a landing de vendas)
- Após login, o web redireciona para `/aluno` ou `/admin`
- Aba **Play**: catálogo no WebView; ao tocar uma faixa no app, abre o player nativo (`expo-av` no Expo Go; `react-native-track-player` após development build)

## Rodar

```bash
npm --prefix apps/mobile install
npm run dev:mobile
```

## URL do WebView

```txt
EXPO_PUBLIC_WEB_URL=https://edersonprogramador.com
# Dev LAN:
# EXPO_PUBLIC_WEB_URL=http://SEU_IP_LAN:5174
```

## Player nativo / Track Player

No Expo Go a reprodução usa `expo-av` (background limitado no iOS).
Para `react-native-track-player` (lock screen / background completo):

```bash
npx expo prebuild
# ou EAS development build
```

O contrato da fila já está em `src/trackPlayer.ts`.
