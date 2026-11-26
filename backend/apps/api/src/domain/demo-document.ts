/** Documento ficticio de la demo; solo usa paquetes incluidos en la imagen del compilador. */
export const DEMO_DOCUMENT = String.raw`% Puedes cambiar el texto y pulsar Compilar.
% Esta demostración es compartida y se reinicia cada noche.
\documentclass[10pt,a4paper]{article}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage[spanish]{babel}
\usepackage{lmodern,geometry,xcolor,tabularx,hyperref}
\geometry{margin=2.1cm}
\definecolor{ink}{HTML}{2742C4}
\hypersetup{colorlinks=true,urlcolor=ink}
\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{5pt}
\newcommand{\cvsection}[1]{\par\addvspace{10pt}{\large\bfseries\color{ink}#1\par}\vspace{2pt}\hrule\vspace{5pt}}
\begin{document}
\sffamily
{\Huge\bfseries Lucía Rivera}\par
\vspace{3pt}
{\large Ingeniería de software}\hfill\textcolor{ink}{CURRÍCULUM DE EJEMPLO}
\vspace{8pt}\par
\href{mailto:lucia@example.com}{lucia@example.com}\hfill Disponible para proyectos de software
\cvsection{Perfil}
Desarrollo aplicaciones web con especial atención a la claridad de la interfaz,
la calidad del código y la protección de los datos. Me gusta convertir un problema
complejo en una herramienta que resulte cómoda de usar.
\cvsection{Experiencia}
\textbf{Desarrolladora de software}\hfill 2024 -- 2026\par
\textit{Estudio de producto ficticio}
\begin{itemize}
\setlength{\itemsep}{2pt}
\item Desarrollo de interfaces accesibles y servicios de aplicación.
\item Revisión de cambios, pruebas automatizadas y documentación para el equipo.
\item Trabajo junto a diseño para mejorar los flujos de edición y publicación.
\end{itemize}
\cvsection{Proyectos seleccionados}
\textbf{Editor de documentos compartidos}\par
Un espacio para escribir en equipo y revisar el resultado antes de descargarlo.
Interfaz web, sincronización de cambios y exportación de documentos.
\vspace{4pt}\par
\textbf{Biblioteca de recursos académicos}\par
Organización y búsqueda de material de estudio, con permisos por proyecto
y una navegación adaptada a pantallas pequeñas.
\cvsection{Herramientas}
\begin{tabularx}{\textwidth}{@{}lX@{}}
\textbf{Desarrollo} & TypeScript, React, Node.js y PostgreSQL \\
\textbf{Calidad} & Pruebas de integración, revisión de código y accesibilidad \\
\textbf{Trabajo en equipo} & Git, documentación y planificación de entregas
\end{tabularx}
\cvsection{Formación}
\textbf{Ingeniería de software}\hfill 2021 -- 2026\par
Universidad de ejemplo
\vfill
{\footnotesize\color{gray}Documento de demostración. Todos los datos son ficticios.}
\end{document}
`;
