export type View = "home" | "login" | "admin" | "user";
export type AuthMode = "login" | "register" | "forgot" | "reset";
export type PlanCode = "monthly" | "annual";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: "outline" | "filled_blue" | "filled_black";
              size: "large" | "medium" | "small";
              type: "standard" | "icon";
              text: "signin_with" | "signup_with" | "continue_with";
              shape: "rectangular" | "pill" | "circle" | "square";
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}

export {};
