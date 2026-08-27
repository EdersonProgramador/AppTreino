# App Treino — Mobile (Expo)

App React Native (Expo) **100% nativo** — não há WebView no aplicativo.

## Modelo

| Área | Implementação |
|---|---|
| Telas do aluno (feed, reels, treino, play, loja, menu) | React Navigation nativo |
| Live (transmitir e assistir) | `react-native-webrtc` sobre a sinalização socket.io |
| Áudio em segundo plano | `react-native-track-player`, com fallback `expo-av` |
| Mapa e GPS | `react-native-maps` + `expo-location` / `expo-sqlite` |
| Painel administrativo | Fora do app — abre no navegador (`WEB_URL`) |

Vídeos de aula tocam nativamente via `expo-video`. Conteúdo legado do YouTube
abre no app do YouTube: os termos do serviço exigem o player oficial, que só
roda em WebView.

## Rodar

```bash
npm --prefix apps/mobile install
npm run dev:mobile
```

No celular: **Expo Go** (QR). Persistência GPS usa `expo-sqlite` (compatível com Go).

> `react-native-webrtc`, `react-native-track-player` e Google Maps nativo no Android exigem **development build** (`npx expo run:android` / `run:ios`). No Expo Go o áudio cai para `expo-av` e a live não abre.

## URL

```txt
EXPO_PUBLIC_WEB_URL=http://SEU_IP_LAN:5174
```
