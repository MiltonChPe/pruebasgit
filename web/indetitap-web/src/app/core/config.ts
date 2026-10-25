import { isDevMode } from '@angular/core';

/**
 * URL base de tu API (sin diagonal final y terminando en /api).
 *  - Desarrollo (ng serve): tu API local. Cambia el puerto por el de tu proyecto.
 *  - Producción (ng build): tu App Service en Azure.
 */
export const API_URL = isDevMode()
  ? 'https://localhost:7000/api'
  : 'https://TU-API.azurewebsites.net/api';

/** Debe coincidir con App:MaxDocumentsPerElder y App:MaxFileMb del backend. */
export const MAX_DOCUMENTS = 20;
export const MAX_FILE_MB = 10;
