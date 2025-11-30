import { Hono } from 'hono';
import { Env } from '../index';
import { TelegramService } from '../services/telegram';

export const publicFolderRoutes = new Hono<{ Bindings: Env }>();

// Helper to get file info from database
async function getPublicFile(fileId: string, dbUrl: string) {
  const response = await fetch(dbUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        SELECT f.id, f.nome, f.tamanho, f.tipo_mime as "tipoMime", f.telegram_file_id as "telegramFileId", 
               f.telegram_bot_id as "telegramBotId", f.is_encrypted as "isEncrypted", f.folder_id as "folderId"
        FROM files f
        WHERE f.id = $1 AND f.is_deleted = false
        LIMIT 1
      `,
      params: [fileId]
    })
  });
  
  if (!response.ok) return null;
  const data = await response.json() as { rows?: any[] };
  return data.rows?.[0] || null;
}

// Helper to check if folder is public
async function isFolderPublic(folderId: string, dbUrl: string) {
  const response = await fetch(dbUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `SELECT id FROM folders WHERE id = $1 AND is_public = true LIMIT 1`,
      params: [folderId]
    })
  });
  
  if (!response.ok) return false;
  const data = await response.json() as { rows?: any[] };
  return (data.rows?.length || 0) > 0;
}

// Get public folder by slug
publicFolderRoutes.get('/folder/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const dbUrl = c.env.DATABASE_URL;
    
    // Query database for public folder
    const response = await fetch(dbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          SELECT folders.id, folders.nome, folders.published_at as "publishedAt", users.nome as "ownerName"
          FROM folders
          JOIN users ON folders.user_id = users.id
          WHERE folders.public_slug = $1 AND folders.is_public = true
          LIMIT 1
        `,
        params: [slug]
      })
    });

    if (!response.ok) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }

    const data = await response.json() as { rows?: any[] };
    if (!data.rows || data.rows.length === 0) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }

    const folder = data.rows[0];
    return c.json({
      id: folder.id,
      nome: folder.nome,
      publishedAt: folder.publishedAt,
      ownerName: folder.ownerName || 'Anónimo'
    });
  } catch (error) {
    console.error('Error fetching public folder:', error);
    return c.json({ message: 'Erro ao buscar pasta pública' }, 500);
  }
});

// Get public folder contents
publicFolderRoutes.get('/folder/:slug/contents', async (c) => {
  try {
    const slug = c.req.param('slug');
    const dbUrl = c.env.DATABASE_URL;

    // Get folder by slug
    const folderResponse = await fetch(dbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `SELECT id FROM folders WHERE public_slug = $1 AND is_public = true LIMIT 1`,
        params: [slug]
      })
    });

    if (!folderResponse.ok) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }

    const folderData = await folderResponse.json() as { rows?: any[] };
    if (!folderData.rows || folderData.rows.length === 0) {
      return c.json({ message: 'Pasta não encontrada' }, 404);
    }

    const folderId = folderData.rows[0].id;

    // Get files and subfolders
    const [filesResponse, foldersResponse] = await Promise.all([
      fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            SELECT id, nome, tamanho, tipo_mime as "tipoMime", created_at as "createdAt"
            FROM files
            WHERE folder_id = $1 AND is_deleted = false AND is_encrypted = false
            ORDER BY created_at DESC
          `,
          params: [folderId]
        })
      }),
      fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `
            SELECT id, nome, created_at as "createdAt"
            FROM folders
            WHERE parent_id = $1
            ORDER BY nome
          `,
          params: [folderId]
        })
      })
    ]);

    const files = await filesResponse.json() as { rows?: any[] };
    const folders = await foldersResponse.json() as { rows?: any[] };

    return c.json({
      files: files.rows || [],
      folders: folders.rows || []
    });
  } catch (error) {
    console.error('Error fetching folder contents:', error);
    return c.json({ message: 'Erro ao buscar conteúdo' }, 500);
  }
});

// Preview file from public folder
publicFolderRoutes.get('/file/:fileId/preview', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const dbUrl = c.env.DATABASE_URL;
    
    const file = await getPublicFile(fileId, dbUrl);
    if (!file || file.isEncrypted) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }
    
    if (!file.folderId || !(await isFolderPublic(file.folderId, dbUrl))) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Ficheiro não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    const downloadUrl = await telegram.getDownloadUrl(file.telegramFileId, file.telegramBotId);
    
    return c.json({ 
      url: downloadUrl,
      tipoMime: file.tipoMime,
      nome: file.nome
    });
  } catch (error) {
    console.error('Error previewing file:', error);
    return c.json({ message: 'Erro ao obter preview' }, 500);
  }
});

// Stream file from public folder (for video thumbnails with CORS support)
publicFolderRoutes.get('/file/:fileId/stream', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const dbUrl = c.env.DATABASE_URL;
    
    const file = await getPublicFile(fileId, dbUrl);
    if (!file || file.isEncrypted) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }
    
    if (!file.folderId || !(await isFolderPublic(file.folderId, dbUrl))) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Ficheiro não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    const fileBuffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(fileBuffer, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Type': file.tipoMime,
        'Content-Length': file.tamanho.toString(),
        'Cache-Control': 'public, max-age=3600',
      }
    });
  } catch (error) {
    console.error('Error streaming file:', error);
    return c.json({ message: 'Erro ao transmitir ficheiro' }, 500);
  }
});

// Download file from public folder
publicFolderRoutes.get('/file/:fileId/download', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    const dbUrl = c.env.DATABASE_URL;
    
    const file = await getPublicFile(fileId, dbUrl);
    if (!file || file.isEncrypted) {
      return c.json({ message: 'Ficheiro não encontrado' }, 404);
    }
    
    if (!file.folderId || !(await isFolderPublic(file.folderId, dbUrl))) {
      return c.json({ message: 'Ficheiro não está numa pasta pública' }, 403);
    }
    
    if (!file.telegramFileId || !file.telegramBotId) {
      return c.json({ message: 'Ficheiro não disponível' }, 404);
    }
    
    const telegram = new TelegramService(c.env);
    const fileBuffer = await telegram.downloadFile(file.telegramFileId, file.telegramBotId);
    
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': file.tipoMime,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.nome)}"`,
        'Content-Length': file.tamanho.toString(),
      }
    });
  } catch (error) {
    console.error('Error downloading file:', error);
    return c.json({ message: 'Erro ao baixar ficheiro' }, 500);
  }
});
