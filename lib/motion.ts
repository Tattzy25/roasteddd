export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** O que se move ou se transforma na tela, sem entrar nem sair. */
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
/** Gaveta e folha, no gesto do iOS. */
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** Em segundos, a unidade do Motion e do GSAP. */
export const DUR = {
  /** Retorno de clique. */
  press: 0.12,
  /** Dica, popover pequeno, hover. */
  fast: 0.16,
  /** Dropdown, select, card, item de lista. */
  base: 0.2,
  /** Modal, gaveta, superfície maior. */
  slow: 0.3,
} as const;

/** Sem animação: o ramo de `prefers-reduced-motion` e a troca que não pode ter meio. */
export const INSTANT = { duration: 0 } as const;

/* Em string, para Web Animations API e para quem não lê `var()`. */

export const EASE_OUT_CSS = "cubic-bezier(0.23, 1, 0.32, 1)";

/* Curvas de desenho: não são token de tema, moram aqui para a string ter um dono só. */

/** Sai acelerando: a peça vai embora e ninguém precisa acompanhar o fim. Também o recuo do martelo do `working-glyph`. */
export const EASE_SAIDA_CSS = "cubic-bezier(0.55, 0, 1, 0.45)";
/** Passa cerca de 6% do alvo e volta: a mola do `segmented-control`, sem mola de JS. */
export const EASE_MOLA_CSS = "cubic-bezier(0.34, 1.4, 0.64, 1)";
/** O cartão encaixando com imã: passa 2% do alvo e assenta. O pouso do `kanban`. */
export const EASE_POUSO_CSS = "cubic-bezier(0.2, 1.08, 0.36, 1)";
/** Sobe rápido e solta devagar: o esticar do vidro em `glass-tabs` e `glass-switch`. */
export const EASE_ESTICA_CSS = "cubic-bezier(0.3, 0.7, 0.2, 1)";
/** Varredura de indicador: anda decidida no meio e não para seco nas pontas. */
export const EASE_VARREDURA_CSS = "cubic-bezier(0.45, 0, 0.25, 1)";
/** O rebote assentando depois da batida do martelo do `working-glyph`. */
export const EASE_ASSENTA_CSS = "cubic-bezier(0.22, 0.61, 0.36, 1)";
