import type { NavigatorScreenParams } from "@react-navigation/native";

export type FeedStackParamList = {
  Feed: undefined;
  Reels: undefined;
  Live: undefined;
  /** `mode` é opcional: deep link externo nunca entra como host. */
  LiveRoom: { mode?: "host" | "viewer"; liveId?: string; title?: string };
  PeerProfile: { userId: string };
  Messages: undefined;
  DirectMessage: { userId: string; name: string };
  Chat: undefined;
  Requests: undefined;
};
export type ClubStackParamList = { Club: undefined };
export type ActivityStackParamList = { Activity: undefined };
export type PlayStackParamList = { Play: undefined; NowPlaying: undefined };
export type TrainingStackParamList = {
  Training: undefined;
  Workouts: { modality: string };
  Program: { programId: string };
  History: undefined;
  Player: { programId: string; dayNumber: number };
};
export type ShopStackParamList = { Products: undefined; Cart: undefined; Orders: undefined };
export type MenuStackParamList = {
  Menu: undefined;
  Profile: undefined;
  ProfileSettings: undefined;
  Notifications: undefined;
  Membership: undefined;
  Payments: undefined;
  Assessments: undefined;
  Status: undefined;
  Events: undefined;
  Locations: undefined;
  Support: undefined;
  Ratings: undefined;
  Purchases: undefined;
  Settings: undefined;
  Qr: undefined;
  Ai: undefined;
  HealthPermissions: undefined;
};

export type StudentTabParamList = {
  FeedTab: NavigatorScreenParams<FeedStackParamList>;
  ClubTab: NavigatorScreenParams<ClubStackParamList>;
  ActivityTab: NavigatorScreenParams<ActivityStackParamList>;
  TrainingTab: NavigatorScreenParams<TrainingStackParamList>;
  MenuTab: NavigatorScreenParams<MenuStackParamList>;
  PlayTab: NavigatorScreenParams<PlayStackParamList>;
  ShopTab: NavigatorScreenParams<ShopStackParamList>;
};
