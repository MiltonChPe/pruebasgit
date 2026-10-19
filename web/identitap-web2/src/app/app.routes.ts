import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { BovedaDocumentos } from './features/boveda-documentos/boveda-documentos';
import { GestorTramites } from './features/gestor-tramites/gestor-tramites';
import { HistorialAccesos } from './features/historial-accesos/historial-accesos';
import {Login} from './features/auth/login/login';
import {Registro } from './features/auth/registro/registro';
import { RegistroPulsera } from './features/registro-pulsera/registro-pulsera';
import { authGuard } from './core/auth/auth.guard';
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'boveda', component: BovedaDocumentos, canActivate: [authGuard] },
  { path: 'tramites', component: GestorTramites, canActivate: [authGuard] },
  { path: 'bitacora', component: HistorialAccesos, canActivate: [authGuard] },
  { path: 'login', component: Login },
  { path: 'registro', component: Registro },
  { path: 'registro-pulsera', component: RegistroPulsera, canActivate: [authGuard] }
];