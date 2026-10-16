# Cómo contribuir · securtex-frontend

## 0. Antes de nada: activa el hook (una sola vez)

```bash
git config core.hooksPath .githooks
```

Bloquea el `git push` directo a `main`. Es un sustituto local de la protección de ramas, que no está disponible en repositorios privados del plan Free. Sin ejecutarlo, el hook no se activa.

## 1. Antes de escribir código

Lee, en este orden:

1. [`Docs/mockups/index.html`](Docs/mockups/index.html) — la pantalla que vas a tocar ya está especificada
2. [`Docs/02-Seguridad-en-el-Cliente.md`](Docs/02-Seguridad-en-el-Cliente.md)
3. [`Docs/03-Sistema-de-Diseno.md`](Docs/03-Sistema-de-Diseno.md)
4. [`AGENTS.md`](AGENTS.md) — aplica también a personas

## 2. Flujo

```bash
git switch -c feat/mi-cambio
pnpm install
pnpm api:sync
pnpm dev
# … trabajar …
pnpm lint && pnpm typecheck && pnpm test && pnpm api:check
git commit -S -m "feat(editor): descripción del cambio"
git push -u origin feat/mi-cambio
```

Ramas: `feat/`, `fix/`, `sec/`, `a11y/`, `refactor/`, `test/`, `docs/`, `chore/`.

## 3. Requisitos del pull request

- [ ] Una aprobación de alguien distinto al autor
- [ ] Todos los controles del CI en verde, incluidos `axe-core` y los presupuestos de rendimiento
- [ ] Commits firmados
- [ ] Estados de carga, error y vacío implementados
- [ ] Usable con teclado y con lector de pantalla
- [ ] Todas las cadenas en el sistema de i18n (español e inglés)
- [ ] Mockup actualizado si cambia la estructura de una pantalla

Responde siempre en la descripción:

1. ¿Qué pantalla de los mockups implementa o modifica?
2. ¿Qué estados has cubierto?
3. ¿Es accesible por teclado y con lector de pantalla?

## 4. Pantallas nuevas

Si la pantalla no existe en `Docs/mockups/`, **añádela primero** con su identificador `P-xx`, sus anotaciones de seguridad y accesibilidad, y su entrada en [`Docs/04-Interfaces-y-Mockups.md`](Docs/04-Interfaces-y-Mockups.md). Diseñar en el código produce interfaces inconsistentes.

## 5. Motivos de rechazo

`dangerouslySetInnerHTML` sin `DOMPurify` · token en `localStorage` o en la URL · tipos de la API escritos a mano · cadena de texto fuera de i18n · componente sin sus tres estados · violación de accesibilidad · recurso de un dominio externo · anillo de foco eliminado.

## 6. Reportar una vulnerabilidad

No abras un *issue* público: sigue [SECURITY.md](SECURITY.md).
