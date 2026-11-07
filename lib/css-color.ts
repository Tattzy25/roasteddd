export type RGB = [number, number, number];

let ctx: CanvasRenderingContext2D | null = null;

/** Resolve uma cor CSS qualquer (ou `var(--token)`) para sRGB 0..1. */
export function resolveCssColor(color: string, el: Element = document.documentElement): RGB {
  // var(--x) precisa passar pelo cascade do elemento para resolver o tema certo
  let valor = color.trim();
  const m = valor.match(/^var\((--[^,)]+)(?:,([^)]*))?\)$/);
  if (m) valor = getComputedStyle(el).getPropertyValue(m[1]).trim() || (m[2] ?? "").trim();
  // Sobrou `var()` dentro (ex.: `color-mix(in oklab, var(--brand) 50%, …)`): o
  // canvas não resolve variável e pintaria preto. Um elemento de sondagem no
  // MESMO escopo deixa o navegador resolver a cascata e devolve a cor final.
  if (valor.includes("var(")) {
    const sonda = document.createElement("span");
    sonda.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
    sonda.style.color = valor;
    el.appendChild(sonda);
    valor = getComputedStyle(sonda).color;
    sonda.remove();
  }
  if (!ctx) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    ctx = c.getContext("2d", { willReadFrequently: true });
  }
  if (!ctx || !valor) return [0, 0, 0];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "rgb(0 0 0)";
  ctx.fillStyle = valor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

/**
 * Avisa quando o tema muda, para a cena reler os tokens. Devolve o unsubscribe.
 *
 * Tema troca de dois jeitos, e os dois precisam ser vistos:
 *  - por ATRIBUTO no elemento (`class="dark"`, `data-theme`, `style`);
 *  - por FOLHA DE ESTILO entrando ou saindo — é assim que o `brand-theme` deste
 *    registry aplica o tema compilado em runtime. Observar só atributos lia os
 *    tokens padrão do shadcn (fundo branco, `--brand` vazio) e nunca relia
 *    quando a marca chegava. Medido na própria vitrine.
 *
 * O `<head>` só é observado quando o alvo é o `<html>`, para N cenas numa página
 * não registrarem N observers de `<head>` sem necessidade.
 */
export function onThemeChange(cb: () => void, el: Element = document.documentElement): () => void {
  // uma troca de tema mexe em várias coisas no mesmo tick: relê uma vez só
  let agendado = false;
  const avisar = () => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      cb();
    });
  };
  const mo = new MutationObserver(avisar);
  mo.observe(el, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
  if (el === document.documentElement && document.head) {
    mo.observe(document.head, { childList: true, subtree: true, characterData: true });
  }
  return () => mo.disconnect();
}
