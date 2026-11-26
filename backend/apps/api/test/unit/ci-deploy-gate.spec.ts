// Fallo intencional para verificar el bloqueo de entrega. Esta rama no se fusiona.
import { expect, it } from 'vitest';

it('impide publicar una versión que no supera las pruebas', () => {
  expect('bloqueado').toBe('publicado');
});
