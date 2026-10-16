import type { components } from './api/generated';

/**
 * Catálogo fijo de plantillas mantenido por el equipo (16-Priorizacion §14).
 * Los identificadores son los que acepta la API (`CreateProjectDto.template`):
 * el contenido lo genera el servidor y se guarda cifrado desde el primer byte.
 */
export type TemplateId = NonNullable<components['schemas']['CreateProjectDto']['template']>;
export type TemplateKind = 'blank' | 'thesis' | 'article' | 'slides' | 'report';
export type CompilerEngine = components['schemas']['CreateProjectDto']['compiler'] & string;

export interface Template {
  readonly id: TemplateId;
  readonly name: string;
  readonly category: 'Básicas' | 'Tesis' | 'Artículos' | 'Presentaciones' | 'Informes';
  readonly kind: TemplateKind;
  readonly description: string;
  readonly compiler: CompilerEngine;
  readonly packages: readonly string[];
  /** Archivos que crea el servidor al usarla. */
  readonly files: readonly string[];
  readonly accent: string;
}

export const TEMPLATES: readonly Template[] = [
  {
    id: 'blank', name: 'Documento en blanco', category: 'Básicas', kind: 'blank', compiler: 'pdflatex', accent: 'bg-fg-3',
    description: 'Un artículo mínimo en español con amsmath y una bibliografía vacía, listo para empezar a escribir.',
    packages: ['babel', 'amsmath'], files: ['main.tex', 'referencias.bib'],
  },
  {
    id: 'tesis-uta', name: 'Tesis de grado · UTA', category: 'Tesis', kind: 'thesis', compiler: 'pdflatex', accent: 'bg-u1',
    description: 'Trabajo de titulación con clase propia, resumen, capítulos en archivos separados y bibliografía.',
    packages: ['uta-tesis', 'amsmath', 'graphicx', 'hyperref', 'booktabs'],
    files: ['main.tex', 'capitulos/introduccion.tex', 'capitulos/metodologia.tex', 'capitulos/resultados.tex', 'referencias.bib', 'uta-tesis.cls'],
  },
  {
    id: 'articulo', name: 'Artículo de conferencia', category: 'Artículos', kind: 'article', compiler: 'pdflatex', accent: 'bg-sec',
    description: 'Artículo con resumen, palabras clave, tabla de resultados y citas numéricas.',
    packages: ['amsmath', 'booktabs'], files: ['main.tex', 'referencias.bib'],
  },
  {
    id: 'informe-lab', name: 'Informe de laboratorio', category: 'Informes', kind: 'report', compiler: 'pdflatex', accent: 'bg-u2',
    description: 'Objetivos, procedimiento con fragmentos de código en listings, tabla de mediciones y conclusiones.',
    packages: ['amsmath', 'booktabs', 'listings'], files: ['main.tex'],
  },
  {
    id: 'presentacion', name: 'Presentación Beamer', category: 'Presentaciones', kind: 'slides', compiler: 'xelatex', accent: 'bg-u4',
    description: 'Diapositivas sobrias para defender un trabajo: motivación, propuesta y resultados.',
    packages: ['beamer', 'babel'], files: ['main.tex'],
  },
];

export const TEMPLATE_CATEGORIES = ['Básicas', 'Tesis', 'Artículos', 'Informes', 'Presentaciones'] as const;

export const templateById = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);
