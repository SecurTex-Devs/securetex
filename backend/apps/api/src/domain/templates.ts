/**
 * Plantillas precargadas por el equipo (16-Priorizacion §14: F-209 con un
 * catálogo fijo; la publicación comunitaria queda fuera de alcance). Todas
 * superan el análisis de seguridad sin avisos y compilan sin errores en el
 * sandbox (bibliografía con BibTeX, que el sandbox ejecuta sin shell).
 */
export const TEMPLATE_IDS = ['blank', 'tesis-uta', 'articulo', 'informe-lab', 'presentacion'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface TemplateFile {
  readonly path: string;
  readonly content: string;
}

/** Quita lo que podría romper el preámbulo si un título contiene caracteres especiales de TeX. */
function texSafe(value: string): string {
  return value.replace(/[\\{}$&#^_%~]/g, '').slice(0, 120);
}

const BLANK = (title: string, author: string): TemplateFile[] => [
  {
    path: 'main.tex',
    content: String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{amsmath}

\title{${title}}
\author{${author}}
\date{\today}

\begin{document}
\maketitle

\section{Introducción}
Escribe aquí tu primer párrafo. Las fórmulas en línea van entre dólares,
como $e^{i\pi} + 1 = 0$, y las destacadas en un entorno:
\begin{equation}
  \int_0^1 x^2 \, dx = \frac{1}{3}
\end{equation}

\end{document}
`,
  },
  { path: 'referencias.bib', content: '' },
];

const THESIS = (title: string, author: string): TemplateFile[] => [
  {
    path: 'main.tex',
    content: String.raw`\documentclass[12pt]{uta-tesis}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{amsmath,graphicx,hyperref,booktabs}

\title{${title}}
\author{${author}}
\date{Universidad Técnica de Ambato · \today}

\begin{document}
\maketitle

\begin{abstract}
Este trabajo propone un modelo probabilístico que actualiza la verosimilitud
de intrusión a partir de la evidencia observada en cada ventana temporal. Con
él se reduce un 38\,\% la tasa de falsos positivos frente a la línea base,
manteniendo la latencia por debajo de 40 ms.
\end{abstract}

\input{capitulos/introduccion}
\input{capitulos/metodologia}
\input{capitulos/resultados}

\bibliographystyle{plain}
\bibliography{referencias}
\end{document}
`,
  },
  {
    path: 'capitulos/introduccion.tex',
    content: String.raw`\section{Introducción}\label{sec:intro}

La detección de intrusiones en entornos distribuidos plantea un compromiso
entre la latencia de la respuesta y la tasa de falsos positivos admisible en
operación \cite{torres2025ids}. Los sistemas basados en firmas fallan ante
ataques nuevos, mientras que los basados en anomalías generan demasiadas
alertas para un equipo humano.

Este capítulo resume el problema y la contribución principal: un modelo que
combina evidencia de varias fuentes sin perder la trazabilidad de cada
decisión \cite{tortuga2023survey}.
`,
  },
  {
    path: 'capitulos/metodologia.tex',
    content: String.raw`\section{Modelo propuesto}\label{sec:modelo}

Sea $a$ el evento de ataque y $d$ la evidencia observada en una ventana
temporal. La verosimilitud de intrusión se actualiza según la regla de Bayes:
\begin{equation}
  P(a \mid d) = \frac{P(d \mid a)\, P(a)}{P(d)}
  \label{eq:bayes}
\end{equation}

Como muestra la ecuación~\ref{eq:bayes}, basta con estimar la tasa base
$P(a)$ y la verosimilitud de cada tipo de evidencia.

\subsection{Supuestos}
\begin{itemize}
  \item Las ventanas temporales son condicionalmente independientes.
  \item La tasa base $P(a)$ se estima a partir del histórico de la red.
  \item Cada sensor aporta evidencia con un coste de cómputo acotado.
\end{itemize}

\begin{figure}[h]
  \centering
  % Sustituye el recuadro por \includegraphics cuando se admitan imágenes en el proyecto.
  \fbox{\parbox[c][3.5cm][c]{0.75\linewidth}{\centering Sensores $\rightarrow$ Modelo $\rightarrow$ Orquestador}}
  \caption{Arquitectura del sistema de detección.}
  \label{fig:arq}
\end{figure}

La figura~\ref{fig:arq} resume el flujo: los sensores envían evidencia, el
modelo la combina y el orquestador decide si escalar la alerta.
`,
  },
  {
    path: 'capitulos/resultados.tex',
    content: String.raw`\section{Resultados experimentales}\label{sec:resultados}

El conjunto de evaluación incluye 1,2 millones de eventos etiquetados,
distribuidos en tres escenarios de tráfico. La tasa de falsos positivos se
reduce un \textbf{38\,\%} respecto a la línea base \cite{torresmendez2024}.

\begin{table}[h]
  \centering
  \caption{Comparación con la línea base.}
  \label{tab:comparacion}
  \begin{tabular}{lcc}
    \toprule
    Modelo & Precisión & Latencia \\
    \midrule
    Línea base & 0,81 & 62 ms \\
    Propuesto & 0,94 & 38 ms \\
    \bottomrule
  \end{tabular}
\end{table}

Los resultados de la tabla~\ref{tab:comparacion} confirman la hipótesis
planteada en la sección~\ref{sec:modelo}.
`,
  },
  {
    path: 'referencias.bib',
    content: String.raw`@article{torres2025ids,
  author  = {Torres, Ana},
  title   = {Real-time intrusion detection with probabilistic models},
  journal = {Revista de Ciencias de la Computación},
  year    = {2025}
}

@inproceedings{torresmendez2024,
  author    = {Torres, Ana and Méndez, Carlos},
  title     = {A taxonomy of sandbox escape techniques},
  booktitle = {Actas del Congreso Andino de Seguridad},
  year      = {2024}
}

@article{tortuga2023survey,
  author  = {Tortuga, Lucía},
  title   = {A survey on conflict-free replicated data types},
  journal = {ACM Computing Surveys},
  year    = {2023}
}
`,
  },
  {
    path: 'uta-tesis.cls',
    content: String.raw`\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{uta-tesis}[2026/01/10 Plantilla de tesis UTA]
\LoadClass[a4paper]{report}
\RequirePackage{geometry}
\geometry{margin=2.5cm}
`,
  },
];

const ARTICLE = (title: string, author: string): TemplateFile[] => [
  {
    path: 'main.tex',
    content: String.raw`\documentclass[conference]{article}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{amsmath,booktabs}

\title{${title}}
\author{${author}}
\date{}

\begin{document}
\maketitle

\begin{abstract}
Resume en cinco frases el problema, el método, el resultado principal y por
qué importa.
\end{abstract}

\section{Introducción}
Presenta el contexto y la pregunta de investigación \cite{knuth1984}.

\section{Método}
Describe cómo has abordado el problema.

\section{Resultados}
\begin{itemize}
  \item Primer hallazgo.
  \item Segundo hallazgo.
\end{itemize}

\section{Conclusiones}
Cierra con lo que aporta el trabajo y las líneas futuras.

\bibliographystyle{plain}
\bibliography{referencias}
\end{document}
`,
  },
  {
    path: 'referencias.bib',
    content: String.raw`@book{knuth1984,
  author    = {Knuth, Donald E.},
  title     = {The TeXbook},
  publisher = {Addison-Wesley},
  year      = {1984}
}
`,
  },
];

const LAB = (title: string, author: string): TemplateFile[] => [
  {
    path: 'main.tex',
    content: String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{amsmath,booktabs,listings}

\title{${title}}
\author{${author}}
\date{\today}

\begin{document}
\maketitle

\section{Objetivos}
\begin{enumerate}
  \item Comprender el funcionamiento de la práctica.
  \item Medir y analizar los resultados obtenidos.
\end{enumerate}

\section{Procedimiento}
Describe paso a paso lo realizado en el laboratorio.

\section{Resultados}
\begin{table}[h]
  \centering
  \caption{Mediciones obtenidas.}
  \begin{tabular}{lcc}
    \toprule
    Prueba & Valor & Error \\
    \midrule
    1 & 4,21 & 0,02 \\
    2 & 4,18 & 0,03 \\
    \bottomrule
  \end{tabular}
\end{table}

\section{Conclusiones}
Resume lo aprendido.

\end{document}
`,
  },
];

const SLIDES = (title: string, author: string): TemplateFile[] => [
  {
    path: 'main.tex',
    content: String.raw`\documentclass{beamer}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}

\title{${title}}
\author{${author}}
\date{\today}

\begin{document}
\maketitle

\section{Motivación}
Plantea el problema en una frase y por qué importa.

\section{Propuesta}
\begin{itemize}
  \item Idea principal.
  \item Cómo se valida.
\end{itemize}

\section{Resultados}
La métrica clave mejora de $0{,}81$ a $0{,}94$.

\end{document}
`,
  },
];

const BUILDERS: Readonly<Record<TemplateId, (title: string, author: string) => TemplateFile[]>> = {
  blank: BLANK,
  'tesis-uta': THESIS,
  articulo: ARTICLE,
  'informe-lab': LAB,
  presentacion: SLIDES,
};

export function templateFiles(id: TemplateId, title: string, author: string): TemplateFile[] {
  return BUILDERS[id](texSafe(title), texSafe(author));
}
