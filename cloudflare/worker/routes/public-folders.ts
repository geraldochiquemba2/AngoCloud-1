import { Hono } from 'hono';
import { Env } from '../index';

export const publicFolderRoutes = new Hono<{ Bindings: Env }>();

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

    const data = await response.json();
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

    const folderData = await folderResponse.json();
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
            SELECT id, nome, tamanho, "tipoMime", created_at as "createdAt"
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

    const files = await filesResponse.json();
    const folders = await foldersResponse.json();

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
    // This would need the Telegram service implementation
    // For now, returning a placeholder
    return c.json({ 
      message: 'Preview functionality requires Telegram service integration',
      url: null
    }, 501);
  } catch (error) {
    console.error('Error previewing file:', error);
    return c.json({ message: 'Erro ao obter preview' }, 500);
  }
});

// Download file from public folder
publicFolderRoutes.get('/file/:fileId/download', async (c) => {
  try {
    const fileId = c.req.param('fileId');
    // This would need the Telegram service implementation
    // For now, returning a placeholder
    return c.json({ 
      message: 'Download functionality requires Telegram service integration'
    }, 501);
  } catch (error) {
    console.error('Error downloading file:', error);
    return c.json({ message: 'Erro ao baixar ficheiro' }, 500);
  }
});
