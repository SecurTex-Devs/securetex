import { account, admin } from './es/account';
import { projects, shell } from './es/app';
import { auth } from './es/auth';
import { common, states } from './es/common';
import { editor, settings, share } from './es/editor';
import { landing, templates } from './es/landing';
import { legal } from './es/legal';

/** Diccionario base (español de Ecuador). Su forma define el tipo `Messages`. */
export const es = { common, states, auth, shell, projects, editor, share, settings, landing, templates, account, admin, legal } as const;

export type Messages = typeof es;
