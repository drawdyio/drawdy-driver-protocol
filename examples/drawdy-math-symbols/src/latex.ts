/**
 * A tiny LaTeX-symbol interpreter: it rewrites `\command` tokens (and a few
 * `\command{arg}` forms like `\mathbb{R}`) into their unicode glyphs, leaving
 * everything else untouched. It is deliberately shallow — no layout, fractions,
 * super/subscripts, just symbol substitution — which is all the palette knows
 * how to draw as plain canvas text.
 */

/** LaTeX command (without the leading backslash) -> unicode glyph. */
export const LATEX_SYMBOLS: Record<string, string> = {
    // Greek (lower)
    alpha: "α",
    beta: "β",
    gamma: "γ",
    delta: "δ",
    epsilon: "ε",
    varepsilon: "ϵ",
    zeta: "ζ",
    eta: "η",
    theta: "θ",
    vartheta: "ϑ",
    iota: "ι",
    kappa: "κ",
    lambda: "λ",
    mu: "μ",
    nu: "ν",
    xi: "ξ",
    pi: "π",
    varpi: "ϖ",
    rho: "ρ",
    varrho: "ϱ",
    sigma: "σ",
    tau: "τ",
    upsilon: "υ",
    phi: "φ",
    varphi: "ϕ",
    chi: "χ",
    psi: "ψ",
    omega: "ω",

    // Greek (upper)
    Gamma: "Γ",
    Delta: "Δ",
    Theta: "Θ",
    Lambda: "Λ",
    Xi: "Ξ",
    Pi: "Π",
    Sigma: "Σ",
    Phi: "Φ",
    Psi: "Ψ",
    Omega: "Ω",
    aleph: "ℵ",

    // Operators
    sum: "∑",
    prod: "∏",
    coprod: "∐",
    int: "∫",
    iint: "∬",
    iiint: "∭",
    oint: "∮",
    partial: "∂",
    nabla: "∇",
    sqrt: "√",
    cbrt: "∛",
    pm: "±",
    mp: "∓",
    times: "×",
    div: "÷",
    cdot: "⋅",
    circ: "∘",
    ast: "∗",
    oplus: "⊕",
    otimes: "⊗",
    odot: "⊙",

    // Relations
    neq: "≠",
    ne: "≠",
    approx: "≈",
    equiv: "≡",
    cong: "≅",
    triangleq: "≜",
    propto: "∝",
    leq: "≤",
    le: "≤",
    geq: "≥",
    ge: "≥",
    ll: "≪",
    gg: "≫",

    // Sets & logic
    in: "∈",
    notin: "∉",
    subset: "⊂",
    subseteq: "⊆",
    supset: "⊃",
    supseteq: "⊇",
    cup: "∪",
    cap: "∩",
    emptyset: "∅",
    varnothing: "∅",
    forall: "∀",
    exists: "∃",
    nexists: "∄",
    neg: "¬",
    lnot: "¬",
    land: "∧",
    wedge: "∧",
    lor: "∨",
    vee: "∨",
    therefore: "∴",
    because: "∵",
    // Blackboard shortcuts and \mathbb{...} forms.
    "mathbb{R}": "ℝ",
    "mathbb{Z}": "ℤ",
    "mathbb{N}": "ℕ",
    "mathbb{Q}": "ℚ",
    "mathbb{C}": "ℂ",
    R: "ℝ",
    Z: "ℤ",
    N: "ℕ",
    Q: "ℚ",
    C: "ℂ",

    // Arrows
    rightarrow: "→",
    to: "→",
    leftarrow: "←",
    gets: "←",
    leftrightarrow: "↔",
    Rightarrow: "⇒",
    implies: "⇒",
    Leftarrow: "⇐",
    Leftrightarrow: "⇔",
    iff: "⇔",
    mapsto: "↦",
    uparrow: "↑",
    downarrow: "↓",
    longrightarrow: "⟶",

    // Misc
    infty: "∞",
    deg: "°",
    prime: "′",
    angle: "∠",
    perp: "⊥",
    parallel: "∥",
    dots: "…",
    ldots: "…",
    cdots: "⋯",
    hbar: "ℏ",
    ell: "ℓ",
    qed: "∎",
    blacksquare: "∎",
};

// `\word` or `\word{arg}` (arg limited to letters, e.g. \mathbb{R}).
const COMMAND = /\\([a-zA-Z]+)(?:\{([a-zA-Z]+)\})?/g;

/**
 * Rewrites every recognized LaTeX command in `text` to its glyph. Returns the
 * rewritten string, or `null` when nothing recognizable was found (so callers
 * can treat "no latex here" as "no preview").
 */
export function interpretLatex(text: string): string | null {
    let matched = false;
    const out = text.replace(COMMAND, (whole, name: string, arg?: string) => {
        const glyph = arg
            ? LATEX_SYMBOLS[`${name}{${arg}}`]
            : LATEX_SYMBOLS[name];
        if (glyph === undefined) return whole;
        matched = true;
        return glyph;
    });
    return matched ? out : null;
}
