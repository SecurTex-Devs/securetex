import type { ProjectRole } from './values';

/**
 * Política de autorización de proyectos: matriz RBAC de 05-Seguridad §8.1.
 * Es el punto único de decisión; los casos de uso la consultan siempre, sea
 * cual sea la entrada (HTTP, WebSocket o cola). RLS es la segunda barrera.
 */
export type ProjectAction =
  | 'view'
  | 'compile'
  | 'edit_content'
  | 'comment'
  | 'change_settings'
  | 'rename'
  | 'archive'
  | 'trash'
  | 'delete_forever'
  | 'manage_access'
  | 'leave'
  | 'tag';

export type Decision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

const MATRIX: Readonly<Record<ProjectAction, readonly ProjectRole[]>> = {
  view: ['owner', 'editor', 'reviewer', 'viewer'],
  compile: ['owner', 'editor', 'reviewer', 'viewer'],
  tag: ['owner', 'editor', 'reviewer', 'viewer'],
  comment: ['owner', 'editor', 'reviewer'],
  edit_content: ['owner', 'editor'],
  change_settings: ['owner', 'editor'],
  rename: ['owner'],
  archive: ['owner'],
  trash: ['owner'],
  delete_forever: ['owner'],
  manage_access: ['owner'],
  leave: ['editor', 'reviewer', 'viewer'],
};

export function decide(role: ProjectRole | null, action: ProjectAction): Decision {
  if (role === null) return { allowed: false, reason: 'not_member' };
  return MATRIX[action].includes(role) ? { allowed: true } : { allowed: false, reason: 'role_insufficient' };
}

export function allowedActions(role: ProjectRole): readonly ProjectAction[] {
  return (Object.keys(MATRIX) as ProjectAction[]).filter((a) => MATRIX[a].includes(role));
}
