import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { fail } from "../shared/http";

export function validate(schema: ZodSchema, source: "body" | "params" = "body") {
  return (request: Request, response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request[source]);

    if (!parsed.success) {
      return fail(response, 400, parsed.error.issues[0]?.message || "Dados inválidos.");
    }

    request[source] = parsed.data;
    next();
  };
}
