# App Treino — Mobile (Expo)

Shell React Native (Expo) com WebView + **áudio nativo** (`expo-av`).

## Modelo

| Camada | Responsável |
|---|---|
| Catálogo + dock (`student-play-dock` / mini) + Now Playing | **Web** (mesmo layout) |
| Áudio em segundo plano | **Expo** (`musicPlayback` / expo-av) |
| Play / Pause / Next no dock | Web → bridge → nativo |

- Tocar uma faixa: abre o dock com controles (como na web)
- Navegar Home/Treino/etc.: dock continua visível → aluno pode pausar
- Toque no dock: abre Now Playing (web)
- Sem overlay nativo por cima da navegação

## Rodar

```bash
npm --prefix apps/mobile install
npm run dev:mobile
```

No celular: **Expo Go** (QR). Persistência GPS usa `expo-sqlite` (compatível com Go).

> `react-native-track-player` e Google Maps nativo no Android exigem **development build** (`npx expo run:android` / `run:ios`). No Expo Go o áudio cai para `expo-av`.

## URL

```txt
EXPO_PUBLIC_WEB_URL=http://SEU_IP_LAN:5174
```
