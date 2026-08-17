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

## URL

```txt
EXPO_PUBLIC_WEB_URL=http://SEU_IP_LAN:5174
```
