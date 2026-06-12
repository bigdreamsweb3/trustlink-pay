import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, toErrorResponse } from "@/app/lib/http";
import { logger } from "@/app/lib/logger";

export async function withAuthenticatedRoute<T>(
  request: Request,
  handler: (authUser: ReturnType<typeof requireAuthenticatedUser>) => Promise<T>,
) {
  try {
    const authUser = requireAuthenticatedUser(request);
    const response = await handler(authUser);
    logger.info("api.request", {
      name: new URL(request.url).pathname,
      type: request.method,
      status: response instanceof Response ? response.status : 200,
    });
    return response;
  } catch (error) {
    const response =
      error instanceof Error &&
      (/access token/i.test(error.message) ||
        error.message === "Account not found")
        ? fail(error.message, 401)
        : toErrorResponse(error);
    logger.error("api.request.failed", {
      name: new URL(request.url).pathname,
      type: request.method,
      status: response.status,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return response;
  }
}
