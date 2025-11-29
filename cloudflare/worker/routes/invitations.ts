/**
 * Invitation Routes for Cloudflare Workers
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { createDb } from '../db';
import { authMiddleware, JWTPayload } from '../middleware/auth';
import { invitations, files, folders, users, filePermissions, folderPermissions } from '../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
}

export const invitationRoutes = new Hono<{ Bindings: Env }>();

invitationRoutes.use('*', authMiddleware);

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

invitationRoutes.post('/', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const schema = z.object({
      resourceType: z.enum(['file', 'folder']),
      resourceId: z.string(),
      inviteeEmail: z.string().email(),
      role: z.enum(['viewer', 'collaborator']).optional().default('viewer'),
      sharedEncryptionKey: z.string().optional(),
    });

    const body = await c.req.json();
    const { resourceType, resourceId, inviteeEmail, role, sharedEncryptionKey } = schema.parse(body);
    
    const db = createDb(c.env.DATABASE_URL);

    if (resourceType === 'file') {
      const [file] = await db.select().from(files).where(eq(files.id, resourceId));
      if (!file || file.userId !== user.id) {
        return c.json({ message: 'Ficheiro não encontrado' }, 404);
      }
    } else {
      const [folder] = await db.select().from(folders).where(eq(folders.id, resourceId));
      if (!folder || folder.userId !== user.id) {
        return c.json({ message: 'Pasta não encontrada' }, 404);
      }
    }

    const existingInvitations = await db.select().from(invitations)
      .where(and(
        eq(invitations.resourceType, resourceType),
        eq(invitations.resourceId, resourceId),
        eq(invitations.inviteeEmail, inviteeEmail)
      ));
    
    const alreadyInvited = existingInvitations.find(
      inv => inv.status === 'pending' || inv.status === 'accepted'
    );
    
    if (alreadyInvited) {
      return c.json({ message: 'Este email já foi convidado' }, 400);
    }

    const [inviteeUser] = await db.select().from(users).where(eq(users.email, inviteeEmail));
    const token = generateToken();

    const [invitation] = await db.insert(invitations).values({
      resourceType,
      resourceId,
      inviterId: user.id,
      inviteeEmail,
      role,
      token,
      sharedEncryptionKey,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }).returning();

    if (inviteeUser) {
      await db.update(invitations)
        .set({ inviteeUserId: inviteeUser.id })
        .where(eq(invitations.id, invitation.id));
    }

    return c.json({
      ...invitation,
      inviteeExists: !!inviteeUser,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ message: 'Dados inválidos', errors: error.errors }, 400);
    }
    console.error('Create invitation error:', error);
    return c.json({ message: 'Erro ao criar convite' }, 500);
  }
});

invitationRoutes.get('/pending', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const db = createDb(c.env.DATABASE_URL);

    const pendingInvitations = await db.select().from(invitations)
      .where(and(
        eq(invitations.inviteeEmail, user.email),
        eq(invitations.status, 'pending')
      ))
      .orderBy(desc(invitations.createdAt));

    const enrichedInvitations = await Promise.all(
      pendingInvitations.map(async (inv) => {
        let resourceName = '';
        
        if (inv.resourceType === 'file') {
          const [file] = await db.select().from(files).where(eq(files.id, inv.resourceId));
          resourceName = file?.nome || 'Ficheiro desconhecido';
        } else {
          const [folder] = await db.select().from(folders).where(eq(folders.id, inv.resourceId));
          resourceName = folder?.nome || 'Pasta desconhecida';
        }
        
        const [inviter] = await db.select().from(users).where(eq(users.id, inv.inviterId));
        const ownerName = inviter?.nome || 'Utilizador desconhecido';
        
        return {
          ...inv,
          resourceName,
          ownerName,
        };
      })
    );

    return c.json(enrichedInvitations);
  } catch (error) {
    console.error('Get pending invitations error:', error);
    return c.json({ message: 'Erro ao buscar convites' }, 500);
  }
});

invitationRoutes.get('/sent', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const db = createDb(c.env.DATABASE_URL);

    const sentInvitations = await db.select().from(invitations)
      .where(eq(invitations.inviterId, user.id))
      .orderBy(desc(invitations.createdAt));

    const enrichedInvitations = await Promise.all(
      sentInvitations.map(async (inv) => {
        let resourceName = '';
        
        if (inv.resourceType === 'file') {
          const [file] = await db.select().from(files).where(eq(files.id, inv.resourceId));
          resourceName = file?.nome || 'Ficheiro desconhecido';
        } else {
          const [folder] = await db.select().from(folders).where(eq(folders.id, inv.resourceId));
          resourceName = folder?.nome || 'Pasta desconhecida';
        }
        
        return {
          ...inv,
          resourceName,
        };
      })
    );

    return c.json(enrichedInvitations);
  } catch (error) {
    console.error('Get sent invitations error:', error);
    return c.json({ message: 'Erro ao buscar convites enviados' }, 500);
  }
});

invitationRoutes.post('/:id/accept', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const invitationId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    
    if (!invitation) {
      return c.json({ message: 'Convite não encontrado' }, 404);
    }
    
    if (invitation.inviteeEmail !== user.email) {
      return c.json({ message: 'Este convite não é para você' }, 403);
    }
    
    if (invitation.status !== 'pending') {
      return c.json({ message: 'Este convite já foi processado' }, 400);
    }
    
    if (invitation.expiresAt && new Date(invitation.expiresAt) < new Date()) {
      return c.json({ message: 'Este convite expirou' }, 410);
    }
    
    await db.update(invitations)
      .set({ status: 'accepted', inviteeUserId: user.id })
      .where(eq(invitations.id, invitationId));
    
    if (invitation.resourceType === 'file') {
      await db.insert(filePermissions).values({
        fileId: invitation.resourceId,
        userId: user.id,
        role: invitation.role === 'collaborator' ? 'editor' : 'viewer',
        grantedBy: invitation.inviterId,
        sharedEncryptionKey: invitation.sharedEncryptionKey,
      });
    } else {
      await db.insert(folderPermissions).values({
        folderId: invitation.resourceId,
        userId: user.id,
        role: invitation.role,
        grantedBy: invitation.inviterId,
        sharedEncryptionKey: invitation.sharedEncryptionKey,
      });
    }
    
    return c.json({ message: 'Convite aceite com sucesso' });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return c.json({ message: 'Erro ao aceitar convite' }, 500);
  }
});

invitationRoutes.post('/:id/decline', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const invitationId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    
    if (!invitation) {
      return c.json({ message: 'Convite não encontrado' }, 404);
    }
    
    if (invitation.inviteeEmail !== user.email) {
      return c.json({ message: 'Este convite não é para você' }, 403);
    }
    
    if (invitation.status !== 'pending') {
      return c.json({ message: 'Este convite já foi processado' }, 400);
    }
    
    await db.update(invitations)
      .set({ status: 'declined', inviteeUserId: user.id })
      .where(eq(invitations.id, invitationId));
    
    return c.json({ message: 'Convite recusado' });
  } catch (error) {
    console.error('Decline invitation error:', error);
    return c.json({ message: 'Erro ao recusar convite' }, 500);
  }
});

invitationRoutes.delete('/:id', async (c) => {
  try {
    const user = c.get('user') as JWTPayload;
    const invitationId = c.req.param('id');
    
    const db = createDb(c.env.DATABASE_URL);
    
    const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
    
    if (!invitation) {
      return c.json({ message: 'Convite não encontrado' }, 404);
    }
    
    if (invitation.inviterId !== user.id) {
      return c.json({ message: 'Você não pode cancelar este convite' }, 403);
    }
    
    if (invitation.status === 'accepted' && invitation.inviteeUserId) {
      if (invitation.resourceType === 'file') {
        const [permission] = await db.select().from(filePermissions)
          .where(and(
            eq(filePermissions.fileId, invitation.resourceId),
            eq(filePermissions.userId, invitation.inviteeUserId)
          ));
        if (permission) {
          await db.delete(filePermissions).where(eq(filePermissions.id, permission.id));
        }
      } else {
        const [permission] = await db.select().from(folderPermissions)
          .where(and(
            eq(folderPermissions.folderId, invitation.resourceId),
            eq(folderPermissions.userId, invitation.inviteeUserId)
          ));
        if (permission) {
          await db.delete(folderPermissions).where(eq(folderPermissions.id, permission.id));
        }
      }
    }
    
    await db.delete(invitations).where(eq(invitations.id, invitationId));
    
    return c.json({ message: 'Convite cancelado' });
  } catch (error) {
    console.error('Cancel invitation error:', error);
    return c.json({ message: 'Erro ao cancelar convite' }, 500);
  }
});
