import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { loginOrCreateWithGoogle } from "../login.service";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL } from "../../config/env";

// Opcional a propósito: si no hay credenciales de Google configuradas, no se registra
// la estrategia — /auth/google responde 501 en vez de romper el arranque del servidor.
export const googleAuthEnabled = !!GOOGLE_CLIENT_ID && !!GOOGLE_CLIENT_SECRET;

if (googleAuthEnabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName;
          const avatarUrl = profile.photos?.[0]?.value;
          if (!email) {
            return done(new Error("Google no devolvió un correo"));
          }
          const result = await loginOrCreateWithGoogle(email, name, avatarUrl);
          return done(null, result);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

export {};
