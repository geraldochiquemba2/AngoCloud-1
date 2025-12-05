/**
 * OAuth Social Login Routes for Cloudflare Workers
 * Suporta: Google, GitHub, Facebook
 */

import { Hono } from 'hono';
import { createDb } from '../db';
import { createToken } from '../middleware/auth';
import { users, User } from '../schema';
import { eq, or } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
  APP_URL?: string;
}

export const oauthRoutes = new Hono<{ Bindings: Env }>();

function getAppUrl(env: Env): string {
  return env.APP_URL || 'https://orbitalcloud.workers.dev';
}

function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function createUserToken(user: User, jwtSecret: string) {
  return createToken({
    id: user.id,
    email: user.email,
    nome: user.nome,
    plano: user.plano,
    storageLimit: Number(user.storageLimit),
    storageUsed: Number(user.storageUsed),
    uploadsCount: user.uploadsCount,
    uploadLimit: user.uploadLimit,
    isAdmin: user.isAdmin,
  }, jwtSecret);
}

// ==================== GOOGLE ====================

oauthRoutes.get('/google', async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ message: 'Google OAuth não está configurado' }, 500);
  }

  const state = generateState();
  const redirectUri = `${getAppUrl(c.env)}/api/auth/oauth/google/callback`;
  
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', c.env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
    }
  });
});

oauthRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/?error=google_auth_failed&message=${error}`);
  }

  if (!code) {
    return c.redirect('/?error=no_code');
  }

  try {
    const redirectUri = `${getAppUrl(c.env)}/api/auth/oauth/google/callback`;
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID!,
        client_secret: c.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json() as any;
    
    if (tokenData.error) {
      console.error('Google token error:', tokenData);
      return c.redirect(`/?error=google_token_failed`);
    }

    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
    });

    const googleUser = await userResponse.json() as any;

    const db = createDb(c.env.DATABASE_URL);

    let user = (await db.select().from(users).where(
      or(
        eq(users.googleId, googleUser.id),
        eq(users.email, googleUser.email)
      )
    ))[0] as User | undefined;

    if (user) {
      if (!user.googleId) {
        await db.update(users)
          .set({ googleId: googleUser.id, avatar: googleUser.picture })
          .where(eq(users.id, user.id));
        user.googleId = googleUser.id;
      }
    } else {
      const inserted = await db.insert(users).values({
        email: googleUser.email,
        nome: googleUser.name || googleUser.email.split('@')[0],
        avatar: googleUser.picture,
        googleId: googleUser.id,
        plano: 'gratis',
      }).returning();
      user = inserted[0] as User;
    }

    const token = await createUserToken(user, c.env.JWT_SECRET);

    return c.redirect(`/?token=${token}`);
  } catch (error) {
    console.error('Google OAuth error:', error);
    return c.redirect(`/?error=google_auth_error`);
  }
});

// ==================== GITHUB ====================

oauthRoutes.get('/github', async (c) => {
  if (!c.env.GITHUB_CLIENT_ID) {
    return c.json({ message: 'GitHub OAuth não está configurado' }, 500);
  }

  const state = generateState();
  const redirectUri = `${getAppUrl(c.env)}/api/auth/oauth/github/callback`;
  
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'user:email');
  authUrl.searchParams.set('state', state);
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
    }
  });
});

oauthRoutes.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/?error=github_auth_failed&message=${error}`);
  }

  if (!code) {
    return c.redirect('/?error=no_code');
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: c.env.GITHUB_CLIENT_ID,
        client_secret: c.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json() as any;
    
    if (tokenData.error) {
      console.error('GitHub token error:', tokenData);
      return c.redirect(`/?error=github_token_failed`);
    }

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'AngoCloud',
      },
    });

    const githubUser = await userResponse.json() as any;

    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'AngoCloud',
      },
    });

    const emails = await emailsResponse.json() as any[];
    const primaryEmail = emails.find((e: any) => e.primary)?.email || githubUser.email;

    if (!primaryEmail) {
      return c.redirect('/?error=no_email');
    }

    const db = createDb(c.env.DATABASE_URL);

    let user = (await db.select().from(users).where(
      or(
        eq(users.githubId, String(githubUser.id)),
        eq(users.email, primaryEmail)
      )
    ))[0] as User | undefined;

    if (user) {
      if (!user.githubId) {
        await db.update(users)
          .set({ githubId: String(githubUser.id), avatar: githubUser.avatar_url })
          .where(eq(users.id, user.id));
        user.githubId = String(githubUser.id);
      }
    } else {
      const inserted = await db.insert(users).values({
        email: primaryEmail,
        nome: githubUser.name || githubUser.login,
        avatar: githubUser.avatar_url,
        githubId: String(githubUser.id),
        plano: 'gratis',
      }).returning();
      user = inserted[0] as User;
    }

    const token = await createUserToken(user, c.env.JWT_SECRET);

    return c.redirect(`/?token=${token}`);
  } catch (error) {
    console.error('GitHub OAuth error:', error);
    return c.redirect(`/?error=github_auth_error`);
  }
});

// ==================== FACEBOOK ====================

oauthRoutes.get('/facebook', async (c) => {
  if (!c.env.FACEBOOK_CLIENT_ID) {
    return c.json({ message: 'Facebook OAuth não está configurado' }, 500);
  }

  const state = generateState();
  const redirectUri = `${getAppUrl(c.env)}/api/auth/oauth/facebook/callback`;
  
  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', c.env.FACEBOOK_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'email,public_profile');
  authUrl.searchParams.set('state', state);
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authUrl.toString(),
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`
    }
  });
});

oauthRoutes.get('/facebook/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');

  if (error) {
    return c.redirect(`/?error=facebook_auth_failed&message=${error}`);
  }

  if (!code) {
    return c.redirect('/?error=no_code');
  }

  try {
    const redirectUri = `${getAppUrl(c.env)}/api/auth/oauth/facebook/callback`;
    
    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', c.env.FACEBOOK_CLIENT_ID!);
    tokenUrl.searchParams.set('client_secret', c.env.FACEBOOK_CLIENT_SECRET!);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json() as any;
    
    if (tokenData.error) {
      console.error('Facebook token error:', tokenData);
      return c.redirect(`/?error=facebook_token_failed`);
    }

    const userUrl = new URL('https://graph.facebook.com/me');
    userUrl.searchParams.set('fields', 'id,name,email,picture');
    userUrl.searchParams.set('access_token', tokenData.access_token);

    const userResponse = await fetch(userUrl.toString());
    const facebookUser = await userResponse.json() as any;

    if (!facebookUser.email) {
      return c.redirect('/?error=no_email');
    }

    const db = createDb(c.env.DATABASE_URL);

    let user = (await db.select().from(users).where(
      or(
        eq(users.facebookId, facebookUser.id),
        eq(users.email, facebookUser.email)
      )
    ))[0] as User | undefined;

    if (user) {
      if (!user.facebookId) {
        await db.update(users)
          .set({ facebookId: facebookUser.id, avatar: facebookUser.picture?.data?.url })
          .where(eq(users.id, user.id));
        user.facebookId = facebookUser.id;
      }
    } else {
      const inserted = await db.insert(users).values({
        email: facebookUser.email,
        nome: facebookUser.name,
        avatar: facebookUser.picture?.data?.url,
        facebookId: facebookUser.id,
        plano: 'gratis',
      }).returning();
      user = inserted[0] as User;
    }

    const token = await createUserToken(user, c.env.JWT_SECRET);

    return c.redirect(`/?token=${token}`);
  } catch (error) {
    console.error('Facebook OAuth error:', error);
    return c.redirect(`/?error=facebook_auth_error`);
  }
});

// ==================== STATUS ====================

oauthRoutes.get('/providers', async (c) => {
  return c.json({
    google: !!c.env.GOOGLE_CLIENT_ID,
    github: !!c.env.GITHUB_CLIENT_ID,
    facebook: !!c.env.FACEBOOK_CLIENT_ID,
  });
});
