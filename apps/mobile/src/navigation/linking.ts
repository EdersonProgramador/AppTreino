import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";
import { WEB_URL } from "../config";
import type { StudentTabParamList } from "./types";

/**
 * Rotas de deep link do aluno (`apptreino://`).
 *
 * `DirectMessage` fica de fora de propósito: além do `userId` ela precisa do
 * nome do destinatário para o cabeçalho, que uma URL não carrega. Links de
 * conversa devem apontar para `PeerProfile`, de onde o usuário abre o chat.
 *
 * Os prefixos https só disparam depois de configurar Universal Links (iOS
 * `associatedDomains`) e App Links (Android `intentFilters`); antes disso são
 * inofensivos e o esquema `apptreino://` já funciona.
 */
export const studentLinking: LinkingOptions<StudentTabParamList> = {
  prefixes: [Linking.createURL("/"), "apptreino://", WEB_URL],
  config: {
    screens: {
      FeedTab: {
        screens: {
          Feed: "feed",
          Reels: "reels",
          Live: "live",
          LiveRoom: "live/:liveId",
          PeerProfile: "u/:userId",
          Messages: "mensagens",
          Chat: "chat",
          Requests: "solicitacoes"
        }
      },
      ClubTab: { screens: { Club: "clube" } },
      ActivityTab: { screens: { Activity: "atividade" } },
      TrainingTab: {
        screens: {
          Training: "treino",
          Workouts: "treino/modalidade/:modality",
          Program: "treino/programa/:programId",
          History: "treino/historico",
          Player: {
            path: "treino/programa/:programId/dia/:dayNumber",
            parse: { dayNumber: Number }
          }
        }
      },
      PlayTab: { screens: { Play: "play", NowPlaying: "play/tocando" } },
      ShopTab: { screens: { Products: "loja", Cart: "loja/carrinho", Orders: "loja/pedidos" } },
      MenuTab: {
        screens: {
          Menu: "menu",
          Profile: "perfil",
          ProfileSettings: "perfil/editar",
          Notifications: "notificacoes",
          Membership: "assinatura",
          Payments: "pagamentos",
          Assessments: "avaliacoes",
          Status: "status",
          Events: "eventos",
          Locations: "unidades",
          Support: "suporte",
          Ratings: "avaliacoes-app",
          Purchases: "compras",
          Settings: "configuracoes",
          Qr: "qr",
          Ai: "ia"
        }
      }
    }
  }
};
