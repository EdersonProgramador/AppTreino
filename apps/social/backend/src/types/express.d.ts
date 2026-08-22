export {};

declare global {
  namespace Express {
    interface Request {
      currentUser: {
        id: string;
        email: string;
      };
    }
  }
}
