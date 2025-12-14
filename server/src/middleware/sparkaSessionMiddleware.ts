/**
 * Sparka Session Middleware
 *
 * Validates cross-subdomain sessions from Sparka (chat.masonjames.com).
 * This enables SSO across all *.masonjames.com apps.
 *
 * The middleware:
 * 1. Checks for Sparka session cookie in request
 * 2. Validates session against Sparka's /api/auth/validate endpoint
 * 3. Attaches Sparka user info to request for downstream use
 *
 * This does NOT replace Autumn's own auth - it supplements it for SSO.
 */

import type { NextFunction, Request, Response } from "express";

const SPARKA_VALIDATE_URL =
	process.env.SPARKA_VALIDATE_URL ||
	"https://chat.masonjames.com/api/auth/validate";

const SPARKA_BASE_URL =
	process.env.SPARKA_BASE_URL || "https://chat.masonjames.com";

/**
 * Response shape from Sparka's /api/auth/validate endpoint
 */
export interface SparkaValidateResponse {
	authenticated: boolean;
	user?: {
		id: string;
		email: string;
		name: string | null;
		image: string | null;
	};
	entitlement?: {
		entitled: boolean;
		tier: string | null;
		source: string | null;
		reason: string | null;
	};
	credits?: {
		totalCredits: number;
		availableCredits: number;
		reservedCredits: number;
	};
	reason?: string;
}

/**
 * Validates session with Sparka and returns user info if authenticated.
 */
export async function validateSparkaSession({
	cookieHeader,
	origin,
}: {
	cookieHeader: string;
	origin?: string;
}): Promise<SparkaValidateResponse> {
	try {
		const response = await fetch(SPARKA_VALIDATE_URL, {
			method: "GET",
			headers: {
				Cookie: cookieHeader,
				Origin: origin || "https://autumn.masonjames.com",
			},
			credentials: "include",
		});

		if (!response.ok) {
			return { authenticated: false, reason: "validation_request_failed" };
		}

		const data = (await response.json()) as SparkaValidateResponse;
		return data;
	} catch (error) {
		console.error("[sparkaSession] Failed to validate session:", error);
		return { authenticated: false, reason: "validation_error" };
	}
}

/**
 * Express middleware that validates Sparka session and attaches user info.
 *
 * Adds to request:
 * - req.sparkaUser: Sparka user info if authenticated
 * - req.sparkaEntitlement: Subscription entitlement info
 * - req.sparkaCredits: Available credits info
 *
 * Does NOT block requests - downstream handlers decide what to do.
 */
export const withSparkaSession = async (
	req: Request & {
		sparkaUser?: SparkaValidateResponse["user"];
		sparkaEntitlement?: SparkaValidateResponse["entitlement"];
		sparkaCredits?: SparkaValidateResponse["credits"];
	},
	_res: Response,
	next: NextFunction,
) => {
	const cookieHeader = req.headers.cookie;

	if (!cookieHeader) {
		// No cookies, continue without Sparka session
		return next();
	}

	try {
		const sparkaSession = await validateSparkaSession({
			cookieHeader,
			origin: req.headers.origin,
		});

		if (sparkaSession.authenticated && sparkaSession.user) {
			// Attach Sparka user info to request
			req.sparkaUser = sparkaSession.user;
			req.sparkaEntitlement = sparkaSession.entitlement;
			req.sparkaCredits = sparkaSession.credits;

			// Log for debugging
			console.log(
				`[sparkaSession] Validated user: ${sparkaSession.user.email}`,
			);
		}
	} catch (error) {
		// Non-blocking - log and continue
		console.error("[sparkaSession] Middleware error:", error);
	}

	next();
};

/**
 * Returns the Sparka login URL with optional return path.
 */
export function getSparkaLoginUrl({ returnTo }: { returnTo?: string }): string {
	const loginUrl = new URL("/login", SPARKA_BASE_URL);
	if (returnTo) {
		loginUrl.searchParams.set("returnTo", returnTo);
	}
	return loginUrl.toString();
}

/**
 * Type extension for Express Request with Sparka session info.
 */
declare global {
	namespace Express {
		interface Request {
			sparkaUser?: SparkaValidateResponse["user"];
			sparkaEntitlement?: SparkaValidateResponse["entitlement"];
			sparkaCredits?: SparkaValidateResponse["credits"];
		}
	}
}
