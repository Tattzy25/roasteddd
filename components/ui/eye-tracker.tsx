"use client";

import * as React from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

import { DUR } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { onThemeChange, resolveCssColor } from "@/lib/css-color";

/**
 * Eye Tracker: o avatar de um bot, agente ou assistente de IA. Dois olhos que
 * acompanham o cursor e o foco, piscam sozinhos e cumprimentam no clique.
 *
 * Mora onde o agente aparece: cabeçalho de chat, onboarding, estado vazio de
 * um assistente. O valor está em parecer atento, então ele olha pra onde a
 * pessoa está agindo, não só pra onde o mouse passa.
 *
 * ── Decisões que não são óbvias ────────────────────────────────────────────
 *
 * 1. **O corpo é material vivo, o fundo não.** Com `body="shader"` (o padrão)
 *    a cabeça do bot é preenchida por um fragment shader recortado pela forma
 *    do corpo, e os olhos ficam num visor por cima. É isso que separa o bot do
 *    mascote bolinha genérico: a silhueta tem antena e visor, e a pele mexe.
 *    O shader é o mesmo das peças `shader-neon`, `shader-voronoi` e
 *    `shader-tunnel`, enxuto e com os parâmetros fixos pro tamanho de avatar.
 * 2. **A cor sai da marca.** As três paradas da rampa são tokens resolvidos
 *    pelo navegador (`resolveCssColor`), relidos quando o tema troca.
 * 3. **O shader sente o cursor.** Mexer o mouse injeta energia, que escoa em
 *    ~1 s; o cumprimento dá um pulso. Fora da tela não há quadro nenhum, com
 *    movimento reduzido fica um quadro parado, e o contexto WebGL é devolvido
 *    no unmount (o navegador só aguenta uns 16 vivos).
 * 4. **Segue o foco do teclado também.** Quem navega com Tab não move mouse
 *    nenhum; sem isso o rosto fica parado pra essa pessoa.
 * 5. **Os olhos andam juntos e a cabeça inclina.** Olho independente vira
 *    estrábico de perto. O par anda como um bloco, o visor acompanha com
 *    menos curso (paralaxe) e a cabeça gira um pouco em 3D.
 * 6. **Distância vira intensidade, com teto.** A partir de ~260 px de tela o
 *    olhar está no máximo. Só a direção vem do retângulo de tela, então a
 *    escala da vitrine não distorce nada.
 * 7. **Piscada em intervalo sorteado** (2,5 a 5,5 s). Intervalo fixo é o que
 *    denuncia o robô.
 * 8. **Clique ou Enter cumprimenta.** Os olhos apertam num sorriso, a antena
 *    acende e um balão escreve o `greeting`; um `role="status"` lê a frase.
 */

export interface EyeTrackerProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDrag" | "onDragEnd" | "onDragStart" | "onAnimationEnd"> {
  /** Lado da cabeça, em px. */
  size?: number;
  /** Forma dos olhos. */
  eyes?: "slant" | "dots" | "bars" | "pupil";
  /** Forma do corpo. Com `body="solid"`, `glass` foi feito pra ficar por cima de um fundo vivo. */
  face?: "card" | "orb" | "glass" | "brand";
  /** Pele do corpo: shader vivo com visor e antena, ou o rosto liso de antes. */
  body?: "shader" | "solid";
  /** Qual shader preenche o corpo quando `body="shader"`. */
  shader?: "neon" | "voronoi" | "tunnel";
  /** Quanto os olhos andam, de 0 a 1 (fração do meio rosto). */
  follow?: number;
  /** Pisca sozinho de vez em quando. */
  blink?: boolean;
  /** O que o balão escreve no clique. Vazio desliga o cumprimento. */
  greeting?: string;
}

const MOLA = { stiffness: 260, damping: 22, mass: 0.6 };
const ALCANCE = 260;

const OLHO = {
  slant: "h-[14%] w-[7%] rounded-[var(--r-pill)] -rotate-[18deg]",
  dots: "size-[10%] rounded-[var(--r-pill)]",
  bars: "h-[16%] w-[6%] rounded-[2px]",
  pupil: "grid size-[22%] place-items-center rounded-full",
} as const;

const ROSTO = {
  card: "rounded-[var(--r-surface)] border border-border bg-card [box-shadow:var(--e-raised)]",
  orb: "rounded-full border border-border bg-card [background-image:radial-gradient(circle_at_32%_28%,color-mix(in_oklab,var(--foreground)_12%,transparent),transparent_60%)] [box-shadow:var(--e-raised),inset_0_-10px_24px_-12px_color-mix(in_oklab,var(--foreground)_30%,transparent)]",
  glass:
    "rounded-[var(--r-surface)] border border-[color-mix(in_oklab,var(--foreground)_18%,transparent)] bg-[color-mix(in_oklab,var(--card)_45%,transparent)] backdrop-blur-md [box-shadow:var(--e-raised),inset_0_1px_0_color-mix(in_oklab,var(--foreground)_14%,transparent)]",
  brand: "rounded-[var(--r-surface)] bg-[var(--brand)] [box-shadow:var(--e-raised)]",
} as const;

/** Silhueta do bot: cabeça em squircle largo ou redonda. */
const CABECA = {
  card: "rounded-[30%]",
  orb: "rounded-full",
  glass: "rounded-[30%]",
  brand: "rounded-[30%]",
} as const;

// ── Pele em shader ────────────────────────────────────────────────────────
// Os três fragment shaders vêm das peças shader-*, com os knobs fixados em
// constantes de avatar. Todos falam a mesma língua: uRes, uTime, uPulse e uma
// rampa de três cores (uA fundo, uB meio, uC núcleo).

const VERT = `attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}`;
const CABECALHO = `precision mediump float;uniform vec2 uRes;uniform float uTime;uniform float uPulse;uniform vec3 uA;uniform vec3 uB;uniform vec3 uC;`;

const FRAG = {
  neon: `${CABECALHO}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float d=length(uv);
  float g=0.;
  for(float i=0.;i<4.;i++){
    float f=(1.+i*.8)*.45;
    float amp=(.15+uPulse*.2-i*.02);
    float phase=uTime*(1.5+i*.3)+i*1.2;
    float wave=sin(uv.x*f*12.+phase)*amp;
    wave+=cos(uv.x*f*6.-phase*.7)*amp*.5*(.4+uPulse);
    float dist=abs(uv.y-wave);
    g+=(.006+uPulse*.004)/(dist+.003)*1.5*exp(-d*.5)*(.3+uPulse*.7);
  }
  vec3 c=mix(uA,uB,clamp(g,0.,1.));
  c=mix(c,uC,smoothstep(1.2,4.,g));
  gl_FragColor=vec4(c,1.);
}`,
  voronoi: `${CABECALHO}
vec2 hash(vec2 p){
  p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));
  return fract(sin(p)*43758.5453);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes.y;
  float t=uTime;
  vec2 p=uv*3.2+vec2(t*.2);
  vec2 ip=floor(p);
  vec2 fp=fract(p);
  float md=8.;
  vec2 mc=vec2(0.);
  for(int y=-1;y<=1;y++)
  for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y));
    vec2 o=hash(ip+g);
    o=.5+.5*sin(t+6.28*o+uPulse*2.);
    vec2 r=g+o-fp;
    float d=dot(r,r);
    if(d<md){md=d;mc=ip+g;}
  }
  float dist=sqrt(md);
  float tom=hash(mc+3.7).x;
  vec3 c=mix(uA,uB,(1.-smoothstep(0.,.9,dist))*(.35+.65*tom));
  c=mix(c,uC,1.-smoothstep(0.,.08+uPulse*.06,dist-.02));
  gl_FragColor=vec4(c,1.);
}`,
  tunnel: `${CABECALHO}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  float t=uTime;
  float a=atan(uv.y,uv.x);
  float d=length(uv);
  float tunel=.5/max(d,.001);
  float espiral=a*3.+tunel+t*.4;
  float padrao=sin(tunel*8.-t*2.)*.5+.5;
  padrao*=sin(espiral)*.5+.5;
  padrao+=sin(tunel*4.+a*2.+tunel*.5-t)*.3;
  float aneis=(sin(tunel*12.-t*3.)*.5+.5)*exp(-d*1.5);
  float luz=padrao*(1.-d)*.9+aneis*.35*(.5+uPulse);
  luz+=exp(-d*2.)*.25*(1.+uPulse);
  luz*=smoothstep(.02,.22,d);
  vec3 c=mix(uA,uB,clamp(luz,0.,1.));
  c=mix(c,uC,smoothstep(.9,1.6,luz));
  gl_FragColor=vec4(c,1.);
}`,
} as const;

/** Rampa da pele: fundo, meio, núcleo. Tudo token. */
const RAMPA = {
  base: [
    "color-mix(in oklab, var(--brand) 30%, var(--card))",
    "var(--brand)",
    "color-mix(in oklab, var(--brand) 40%, var(--foreground))",
  ],
  brand: [
    "var(--brand)",
    "color-mix(in oklab, var(--brand) 45%, var(--background))",
    "var(--background)",
  ],
};

function compilar(gl: WebGLRenderingContext, frag: string): WebGLProgram | null {
  const shader = (tipo: number, src: string) => {
    const s = gl.createShader(tipo);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, frag);
  const p = gl.createProgram();
  if (!vs || !fs || !p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null;
}

/**
 * Pinta um shader dentro de `wrapRef`. Mesmo contrato das peças shader-*:
 * canvas criado no efeito, laço dormindo fora da tela e com movimento
 * reduzido, contexto devolvido no unmount. `energia` é um ref que o
 * componente alimenta com o ponteiro e o cumprimento.
 */
function usePeleShader(
  wrapRef: React.RefObject<HTMLSpanElement | null>,
  ligado: boolean,
  tipo: keyof typeof FRAG,
  cores: string[],
  energia: React.MutableRefObject<number>,
) {
  const coresChave = cores.join("|");
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!ligado || !wrap) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "absolute inset-0 block h-full w-full";
    wrap.prepend(canvas);
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    const prog = gl && compilar(gl, FRAG[tipo]);
    if (!gl || !prog) {
      canvas.remove();
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(prog);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = { res: u("uRes"), time: u("uTime"), pulse: u("uPulse"), a: u("uA"), b: u("uB"), c: u("uC") };

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduzido = mq.matches;
    let visivel = false;
    let raf = 0;
    let ultimo = 0;
    let tempo = 3; // começa com a pele já aberta, não num ponto de fase nula

    const pintarCores = () => {
      const [a, b, c] = coresChave.split("|").map((cor) => resolveCssColor(cor, wrap));
      gl.uniform3fv(U.a, a);
      gl.uniform3fv(U.b, b ?? a);
      gl.uniform3fv(U.c, c ?? b ?? a);
    };
    const medir = () => {
      // offsetWidth é a medida local: a vitrine escala o palco com transform.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(wrap.offsetWidth * dpr));
      canvas.height = Math.max(1, Math.round(wrap.offsetHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const desenhar = () => {
      const pulso = reduzido ? 0.35 : 0.3 + 0.12 * Math.sin(tempo * 0.8) + energia.current;
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.time, tempo);
      gl.uniform1f(U.pulse, Math.min(1.2, pulso));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const quadro = (agora: number) => {
      const dt = ultimo ? Math.min(0.05, (agora - ultimo) / 1000) : 0;
      ultimo = agora;
      tempo += dt * (0.8 + energia.current);
      energia.current *= Math.pow(0.04, dt); // escoa em ~1s
      desenhar();
      raf = visivel && !reduzido ? requestAnimationFrame(quadro) : 0;
    };
    const ligar = () => {
      if (!raf && visivel && !reduzido) {
        ultimo = 0;
        raf = requestAnimationFrame(quadro);
      }
    };
    const desligar = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const trocarMovimento = () => {
      reduzido = mq.matches;
      if (reduzido) {
        desligar();
        desenhar();
      } else ligar();
    };

    pintarCores();
    medir();
    desenhar();

    const ro = new ResizeObserver(() => {
      medir();
      desenhar();
    });
    ro.observe(wrap);
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      if (visivel) ligar();
      else desligar();
    });
    io.observe(wrap);
    const offTema = onThemeChange(() => {
      pintarCores();
      desenhar();
    });
    mq.addEventListener("change", trocarMovimento);

    return () => {
      desligar();
      ro.disconnect();
      io.disconnect();
      offTema();
      mq.removeEventListener("change", trocarMovimento);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [wrapRef, ligado, tipo, coresChave, energia]);
}

export function EyeTracker({
  size = 112,
  eyes = "slant",
  face = "card",
  body = "shader",
  shader = "neon",
  follow = 0.6,
  blink = true,
  greeting = "Oi, tudo bem?",
  className,
  onClick,
  style,
  ...props
}: EyeTrackerProps) {
  const reduzido = useReducedMotion() ?? false;
  const vivo = body === "shader";
  const rosto = React.useRef<HTMLButtonElement>(null);
  const pele = React.useRef<HTMLSpanElement>(null);
  const energia = React.useRef(0);
  const alvoX = useMotionValue(0);
  const alvoY = useMotionValue(0);
  const molaX = useSpring(alvoX, MOLA);
  const molaY = useSpring(alvoY, MOLA);
  const olhoX = reduzido ? alvoX : molaX;
  const olhoY = reduzido ? alvoY : molaY;
  const giroY = useTransform(olhoX, (v) => v * 0.5);
  const giroX = useTransform(olhoY, (v) => -v * 0.5);
  // A pupila anda mais um tanto dentro do globo; o visor anda menos (paralaxe).
  const pupilaX = useTransform(olhoX, (v) => v * 0.35);
  const pupilaY = useTransform(olhoY, (v) => v * 0.35);
  const visorX = useTransform(olhoX, (v) => v * 0.4);
  const visorY = useTransform(olhoY, (v) => v * 0.4);
  const palpebra = useMotionValue(1);
  const [falando, setFalando] = React.useState(false);
  const [escrito, setEscrito] = React.useState("");
  const falandoRef = React.useRef(false);

  usePeleShader(pele, vivo, shader, face === "brand" ? RAMPA.brand : RAMPA.base, energia);

  // Meio rosto vezes `follow`: o teto do passeio em px locais.
  const teto = (size / 2) * Math.min(1, Math.max(0, follow)) * 0.55;

  const olharPara = React.useCallback(
    (px: number, py: number) => {
      const el = rosto.current;
      if (!el || falandoRef.current) return;
      const r = el.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      if (d < 1) return;
      const forca = Math.min(1, d / ALCANCE) * teto;
      alvoX.set((dx / d) * forca);
      alvoY.set((dy / d) * forca);
    },
    [alvoX, alvoY, teto],
  );

  React.useEffect(() => {
    let ux = -1;
    let uy = -1;
    const mover = (e: PointerEvent) => {
      olharPara(e.clientX, e.clientY);
      // O cursor andando agita a pele.
      if (ux >= 0) energia.current = Math.min(0.9, energia.current + Math.hypot(e.clientX - ux, e.clientY - uy) * 0.0025);
      ux = e.clientX;
      uy = e.clientY;
    };
    const focar = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || t === rosto.current) return;
      const r = t.getBoundingClientRect();
      olharPara(r.left + r.width / 2, r.top + r.height / 2);
    };
    const sair = () => {
      ux = uy = -1;
      if (falandoRef.current) return;
      alvoX.set(0);
      alvoY.set(0);
    };
    window.addEventListener("pointermove", mover, { passive: true });
    document.addEventListener("focusin", focar);
    document.documentElement.addEventListener("pointerleave", sair);
    return () => {
      window.removeEventListener("pointermove", mover);
      document.removeEventListener("focusin", focar);
      document.documentElement.removeEventListener("pointerleave", sair);
    };
  }, [olharPara, alvoX, alvoY]);

  // Piscada: um quadro curto fechando e abrindo, em intervalo sorteado.
  React.useEffect(() => {
    if (!blink || reduzido) return;
    let timer = 0;
    const agendar = () => {
      timer = window.setTimeout(() => {
        animate(palpebra, [1, 0.1, 1], { duration: DUR.fast, times: [0, 0.4, 1], ease: "easeInOut" });
        agendar();
      }, 2500 + Math.random() * 3000);
    };
    agendar();
    return () => window.clearTimeout(timer);
  }, [blink, reduzido, palpebra]);

  // O balão escreve uma letra por vez e some depois de um respiro.
  React.useEffect(() => {
    if (!falando) return;
    let i = 0;
    const passo = reduzido ? greeting.length : 1;
    const tic = window.setInterval(() => {
      i = Math.min(greeting.length, i + passo);
      setEscrito(greeting.slice(0, i));
      if (i >= greeting.length) window.clearInterval(tic);
    }, 55);
    const fim = window.setTimeout(() => {
      falandoRef.current = false;
      setFalando(false);
    }, greeting.length * 55 + 1600);
    return () => {
      window.clearInterval(tic);
      window.clearTimeout(fim);
    };
  }, [falando, greeting, reduzido]);

  function cumprimentar() {
    if (!greeting || falandoRef.current) return;
    falandoRef.current = true;
    energia.current = 0.9;
    alvoX.set(0);
    alvoY.set(0);
    setEscrito("");
    setFalando(true);
  }

  // Falando, os olhos apertam: o sorriso que um rosto sem boca consegue dar.
  React.useEffect(() => {
    if (!falando) return;
    if (reduzido) return;
    animate(palpebra, 0.45, { duration: DUR.fast, ease: "easeOut" });
    return () => {
      animate(palpebra, 1, { duration: DUR.fast, ease: "easeOut" });
    };
  }, [falando, reduzido, palpebra]);

  // No visor o olho é sempre tinta do tema; no rosto liso da marca, contraste da marca.
  const marcaLisa = !vivo && face === "brand";
  const corOlho = marcaLisa ? "bg-[var(--brand-foreground)]" : "bg-foreground";
  const olho = (
    <span className={cn("block", corOlho, OLHO[eyes])}>
      {eyes === "pupil" && (
        <motion.span
          className={cn("block size-[46%] rounded-full", marcaLisa ? "bg-[var(--brand)]" : "bg-background")}
          style={{ x: pupilaX, y: pupilaY }}
        />
      )}
    </span>
  );

  return (
    <span
      className="relative inline-flex [perspective:600px]"
      style={vivo ? { paddingTop: Math.round(size * 0.2) } : undefined}
    >
      <motion.button
        {...props}
        ref={rosto}
        type="button"
        aria-label={greeting ? `Assistente. Clique pra ele dizer "${greeting}"` : "Assistente"}
        onClick={(e) => {
          onClick?.(e);
          cumprimentar();
        }}
        style={{ ...style, width: size, height: size, rotateX: giroX, rotateY: giroY }}
        className={cn(
          "relative grid cursor-pointer place-items-center outline-none [font:inherit] focus-visible:[box-shadow:var(--focus)]",
          vivo
            ? cn(
                CABECA[face],
                "[box-shadow:var(--e-raised),inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_12%,transparent)]",
              )
            : ROSTO[face],
          className,
        )}
      >
        {vivo && (
          <>
            {/* Antena: o traço que diz "bot" antes de qualquer olho. Acende no cumprimento. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center"
            >
              <span
                className={cn(
                  "block rounded-full bg-[var(--brand)] transition-[box-shadow] [transition-duration:var(--dur-fast)] [transition-timing-function:var(--ease-out)]",
                  falando && "[box-shadow:0_0_0_4px_color-mix(in_oklab,var(--brand)_35%,transparent)]",
                )}
                style={{ width: size * 0.09, height: size * 0.09 }}
              />
              <span
                className="block w-[2px] bg-[color-mix(in_oklab,var(--foreground)_28%,transparent)]"
                style={{ height: size * 0.11 }}
              />
            </span>

            {/* Pele: o canvas entra aqui, recortado pela forma da cabeça. */}
            <span
              ref={pele}
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] bg-[var(--brand)]",
                // Vidro: o shader desfocado por baixo de uma película. Blur no
                // próprio canvas, não backdrop-filter: este sob rotação 3D vaza o recorte.
                face === "glass" && "[&>canvas]:scale-110 [&>canvas]:blur-md",
              )}
            >
              {face === "glass" && (
                <span className="absolute inset-0 bg-[color-mix(in_oklab,var(--card)_30%,transparent)]" />
              )}
              <span className="absolute inset-0 rounded-[inherit] [box-shadow:inset_0_-14px_28px_-16px_color-mix(in_oklab,var(--foreground)_40%,transparent)]" />
            </span>

            {/* Visor: a tela escura onde os olhos acendem. */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[13%] top-[30%] h-[40%] rounded-[var(--r-pill)] border border-[color-mix(in_oklab,var(--foreground)_12%,transparent)] bg-[color-mix(in_oklab,var(--background)_84%,transparent)] backdrop-blur-sm [box-shadow:inset_0_2px_8px_color-mix(in_oklab,var(--foreground)_18%,transparent)]"
              style={{ x: visorX, y: visorY }}
            />
          </>
        )}

        <motion.span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center gap-[16%]"
          style={{ x: olhoX, y: olhoY, scaleY: palpebra }}
        >
          {olho}
          {olho}
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {falando && (
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute left-[78%] top-[72%] whitespace-nowrap rounded-[var(--r-pill)] bg-[var(--brand)] px-3 py-1 text-xs font-medium text-[var(--brand-foreground)] [box-shadow:var(--e-raised)]"
            initial={reduzido ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            transition={reduzido ? { duration: DUR.fast } : { type: "spring", visualDuration: 0.25, bounce: 0.3 }}
            style={{ transformOrigin: "0% 0%" }}
          >
            {escrito || " "}
          </motion.span>
        )}
      </AnimatePresence>

      <span className="sr-only" role="status">
        {falando ? greeting : ""}
      </span>
    </span>
  );
}

export default EyeTracker;
