/**
 * Sparka SSO Router
 *
 * Handles cross-subdomain authentication with Sparka (chat.masonjames.com).
 * Enables SSO for users who are logged into Sparka to access Autumn.
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { user as userTable } from "@autumn/shared";
import {
	validateSparkaSession,
	getSparkaLoginUrl,
	type SparkaValidateResponse,
} from "../middleware/sparkaSessionMiddleware.js";
import { generateId } from "../utils/genUtils.js";

const sparkaRouter: Router = Router();

/**
 * GET /sparka/session
 *
 * Returns the current Sparka session info if authenticated.
 * Used by frontend to check if user has a valid Sparka session.
 */
sparkaRouter.get("/session", async (req: any, res: any) => {
	const cookieHeader = req.headers.cookie;

	if (!cookieHeader) {
		return res.status(200).json({
			authenticated: false,
			reason: "no_cookie",
		});
	}

	const sparkaSession = await validateSparkaSession({
		cookieHeader,
		origin: req.headers.origin,
	});

	if (!sparkaSession.authenticated) {
		return res.status(200).json({
			authenticated: false,
			reason: sparkaSession.reason || "not_authenticated",
		});
	}

	// Check if user exists in Autumn
	const existingUser = await req.db
		.select()
		.from(userTable)
		.where(eq(userTable.email, sparkaSession.user!.email))
		.limit(1);

	return res.status(200).json({
		authenticated: true,
		sparkaUser: sparkaSession.user,
		entitlement: sparkaSession.entitlement,
		credits: sparkaSession.credits,
		autumnUserExists: existingUser.length > 0,
		autumnUserId: existingUser[0]?.id || null,
	});
});

/**
	* POST /sparka/link
 *
	* Links a Sparka user to Autumn by creating an Autumn user if needed.
	* Does NOT create an Autumn session - user still needs to login via Better Auth.
 *
	* This is the first step of SSO: ensure the user exists in Autumn.
	* The second step is to use Better Auth's email OTP or magic link to login.
 */
sparkaRouter.post("/link", async (req: any, res: any) => {
	const cookieHeader = req.headers.cookie;
	const { logger } = req;

	if (!cookieHeader) {
		return res.status(401).json({
			success: false,
			error: "No session cookie found",
			loginUrl: getSparkaLoginUrl({
				returnTo: process.env.CLIENT_URL || "https://autumn.masonjames.com",
			}),
		});
	}

	// Validate Sparka session
	const sparkaSession = await validateSparkaSession({
		cookieHeader,
		origin: req.headers.origin,
	});

	if (!sparkaSession.authenticated || !sparkaSession.user) {
		return res.status(401).json({
			success: false,
			error: "Invalid or expired Sparka session",
			loginUrl: getSparkaLoginUrl({
				returnTo: process.env.CLIENT_URL || "https://autumn.masonjames.com",
			}),
		});
	}

	const sparkaUser = sparkaSession.user;
	logger?.info(`[sparka/link] Processing link for: ${sparkaUser.email}`);

	try {
		// Check if user exists in Autumn
		const existingUsers = await req.db
			.select()
			.from(userTable)
			.where(eq(userTable.email, sparkaUser.email))
			.limit(1);

		let autumnUser = existingUsers[0];
		let created = false;

		if (!autumnUser) {
			// Create new Autumn user from Sparka user
			logger?.info(
				`[sparka/link] Creating new Autumn user for: ${sparkaUser.email}`,
			);

			const newUserId = generateId("user");

			await req.db.insert(userTable).values({
				id: newUserId,
				email: sparkaUser.email,
				name: sparkaUser.name || sparkaUser.email.split("@")[0],
				image: sparkaUser.image,
				emailVerified: true, // Already verified via Sparka
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			autumnUser = {
				id: newUserId,
				email: sparkaUser.email,
				name: sparkaUser.name || sparkaUser.email.split("@")[0],
				image: sparkaUser.image,
			};
			created = true;
		}

		logger?.info(
			`[sparka/link] Link successful for: ${sparkaUser.email}, Autumn user: ${autumnUser.id}, created: ${created}`,
		);

		return res.status(200).json({
			success: true,
			created,
			user: {
				id: autumnUser.id,
				email: autumnUser.email,
				name: autumnUser.name,
				image: autumnUser.image,
			},
			sparkaEntitlement: sparkaSession.entitlement,
			sparkaCredits: sparkaSession.credits,
			// Tell frontend to use Better Auth's email OTP for quick login
			nextStep: "email_otp",
			message: created
				? "Account created! Use email OTP to complete login."
				: "Account linked! Use email OTP to complete login.",
		});
	} catch (error: any) {
		logger?.error(`[sparka/link] Link error:`, error?.message || error);
		return res.status(500).json({
			success: false,
			error: "Failed to link account",
		});
	}
});

/**
 * GET /sparka/login-url
 *
 * Returns the Sparka login URL with proper return redirect.
 */
sparkaRouter.get("/login-url", async (req: any, res: any) => {
	const returnTo =
		req.query.returnTo ||
		process.env.CLIENT_URL ||
		"https://autumn.masonjames.com";

	return res.status(200).json({
		loginUrl: getSparkaLoginUrl({ returnTo }),
	});
});

export { sparkaRouter };
