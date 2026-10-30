/**
 * Serviços da API do Google Drive v3.
 * Executa chamadas autenticadas client-side com token Bearer.
 */

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  iconLink?: string;
}

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Cria ou busca a pasta dedicada "Minerador AliExpress" no Google Drive do usuário.
 */
export async function getOrCreateAppFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent("name = 'Minerador AliExpress' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchRes = await fetch(`${DRIVE_API_URL}/files?q=${query}&fields=files(id, name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    throw new Error(`Falha ao buscar pasta no Drive: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Se não existir, cria a pasta
  const createRes = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Minerador AliExpress',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Pasta automatizada para relatórios e dados de mineração do AliExpress',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Falha ao criar pasta 'Minerador AliExpress' no Drive: ${createRes.statusText}`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

/**
 * Faz upload de um arquivo para o Google Drive usando o endpoint multipart.
 */
export async function uploadFileToDrive(
  accessToken: string,
  fileName: string,
  fileContent: string,
  mimeType: string = 'text/csv',
  folderId?: string
): Promise<DriveFile> {
  const metadata: Record<string, any> = {
    name: fileName,
    mimeType,
  };

  if (folderId) {
    metadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
    fileContent +
    closeDelimiter;

  const res = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,createdTime,size`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Erro ao enviar arquivo para o Google Drive: ${errorBody}`);
  }

  return await res.json();
}

/**
 * Lista os arquivos mais recentes da pasta ou gerados pelo Minerador AliExpress.
 */
export async function listMineradorFiles(accessToken: string, folderId?: string): Promise<DriveFile[]> {
  let q = "trashed = false";
  if (folderId) {
    q += ` and '${folderId}' in parents`;
  } else {
    q += " and (name contains 'aliexpress' or name contains 'historico_buscas')";
  }

  const fields = 'files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, iconLink)';
  const res = await fetch(`${DRIVE_API_URL}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=30&fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Falha ao listar arquivos do Drive: ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Exclui um arquivo do Google Drive.
 * (Deve ser precedido por confirmação explícita do usuário).
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<boolean> {
  const res = await fetch(`${DRIVE_API_URL}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`Erro ao excluir arquivo no Google Drive: ${res.statusText}`);
  }

  return true;
}

/**
 * Lê o conteúdo de um arquivo JSON do Drive (para restauração de histórico).
 */
export async function readJsonFromDrive(accessToken: string, fileId: string): Promise<any> {
  const res = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Erro ao baixar arquivo do Drive: ${res.statusText}`);
  }

  return await res.json();
}
