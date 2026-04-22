import { requireAuthenticatedUser } from "@/app/lib/auth";
import { fail, toErrorResponse } from "@/app/lib/http";

export async function withAuthenticatedRoute<T>(
  request: Request,
  handler: (authUser: ReturnType<typeof requireAuthenticatedUser>) => Promise<T>,
) {
  try {
    const authUser = requireAuthenticatedUser(request);
    return await handler(authUser);
  } catch (error) {
    if (error instanceof Error && /access token/i.test(error.message)) {
      return fail(error.message, 401);
    }

    return toErrorResponse(error);
  }
}
