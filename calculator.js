// @ts-check
/**
 * Calculadora de preço (método Sebrae) — SPEC-019 / MKT-004.
 *
 * Pure module: no DOM, no network. Runs in the browser and in `node --test`.
 * Rates are fractions (0.15 = 15%); money is in R$.
 *
 * Same formulas as kozy/lib/pricing/suggest-price.ts where the rules match (labor, % fees,
 * margin-on-price divisor, < 100% guard, break-even). Intentional differences (SPEC-019 D2/D3):
 *   - waste:       cost ÷ (1 − waste)            (app: cost × (1 + waste))
 *   - fixed costs: % of monthly revenue          (app: R$ per unit by volume)
 *   - MEI tax:     DAS is a fixed monthly cost   (app: % of the price)
 */

/** DAS-MEI 2026, comércio/indústria (INSS 5% de R$ 1.621 + ICMS R$ 1). Update every January. */
export const DAS_MEI_PADRAO = 82.05;
export const DAS_MEI_ANO = 2026;
export const SEMANAS_POR_MES = 52 / 12;

/** Above this share of revenue, fixed costs get their own error message (D4). */
const LIMITE_ALERTA_FIXOS = 0.5;

/**
 * @typedef {object} CalculatorInput
 * @property {number} ingredientes        R$ of ingredients used in the whole recipe
 * @property {number} rendimento          units the recipe yields (> 0)
 * @property {number} [embalagem]         R$ of packaging per unit (default 0)
 * @property {number} tempoReceitaHoras   hours to make the whole recipe (> 0)
 * @property {number} [perda]             waste, fraction < 1 (default 0)
 * @property {boolean} isMei
 * @property {number} [das]               R$/month, required when isMei
 * @property {number} [aliquotaSimples]   fraction, required when not MEI
 * @property {number} custosFixos         R$/month (rent, power, gas, internet…)
 * @property {number} faturamento         R$/month sold, or expected (> 0)
 * @property {number} salario             R$/month the owner wants to earn (> 0)
 * @property {number} horasSemana         production hours per week (> 0, ≤ 168)
 * @property {number} [taxaCartao]        card/app fee, fraction (default 0)
 * @property {number} margem              profit margin on price, fraction
 * @property {number | null} [precoAtual] R$ charged today per unit (optional)
 */

/**
 * @typedef {object} Dre
 * @property {number} ingredientes
 * @property {number} embalagem
 * @property {number} maoDeObra
 * @property {number} fixos
 * @property {number} impostosTaxas
 * @property {number} lucro
 */

/**
 * @typedef {{
 *   ok: true,
 *   price: number,
 *   priceReceita: number,
 *   markup: number,
 *   custoDireto: number,
 *   dre: Dre,
 *   percentuais: { despesasFixas: number, impostosTaxas: number, margem: number },
 *   lucroHoje: { unidade: number, receita: number, percentual: number, prejuizo: boolean } | null,
 *   pontoEquilibrio: number | null,
 * } | { ok: false, errors: Partial<Record<keyof CalculatorInput, string>> }} CalculatorResult
 */

const OBRIGATORIO = 'Preencha este campo.';
const round2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;
const isNumber = (/** @type {unknown} */ n) => typeof n === 'number' && Number.isFinite(n);
const percent = (/** @type {number} */ n) => `${Math.round(n * 100)}%`;

/**
 * Validates one field; returns an error message or null.
 * @param {unknown} value
 * @param {{ required?: boolean, positive?: boolean, max?: number, below?: number, maxMessage?: string }} rules
 */
function check(value, { required = true, positive = false, max, below, maxMessage } = {}) {
    if (value === undefined || value === null) return required ? OBRIGATORIO : null;
    if (!isNumber(value)) return 'Digite um número.';
    const n = /** @type {number} */ (value);
    if (n < 0) return 'Não pode ser negativo.';
    if (positive && n === 0) return 'Precisa ser maior que zero.';
    if (max !== undefined && n > max) return maxMessage ?? `No máximo ${max}.`;
    if (below !== undefined && n >= below) return maxMessage ?? 'Precisa ser menor que 100%.';
    return null;
}

/**
 * @param {CalculatorInput} input
 * @returns {CalculatorResult}
 */
export function calculatePrice(input) {
    /** @type {Partial<Record<keyof CalculatorInput, string | null>>} */
    const found = {
        ingredientes: check(input.ingredientes),
        rendimento: check(input.rendimento, { positive: true }),
        embalagem: check(input.embalagem, { required: false }),
        tempoReceitaHoras: check(input.tempoReceitaHoras, { positive: true }),
        perda: check(input.perda, { required: false, below: 1 }),
        das: input.isMei ? check(input.das) : null,
        aliquotaSimples: input.isMei ? null : check(input.aliquotaSimples, { below: 1 }),
        custosFixos: check(input.custosFixos),
        faturamento: check(input.faturamento, { positive: true }),
        salario: check(input.salario, { positive: true }),
        horasSemana: check(input.horasSemana, {
            positive: true,
            max: 168,
            maxMessage: 'Uma semana tem 168 horas.',
        }),
        taxaCartao: check(input.taxaCartao, { required: false, below: 1 }),
        margem: check(input.margem, { below: 1 }),
        precoAtual: check(input.precoAtual, { required: false }),
    };
    const errors = Object.fromEntries(Object.entries(found).filter(([, message]) => message));
    if (Object.keys(errors).length > 0) return { ok: false, errors };

    const embalagem = input.embalagem ?? 0;
    const perda = input.perda ?? 0;
    const taxaCartao = input.taxaCartao ?? 0;
    const das = input.isMei ? /** @type {number} */ (input.das) : 0;
    const aliquota = input.isMei ? 0 : /** @type {number} */ (input.aliquotaSimples);

    // S1, S2 (D2): waste inflates the ingredient cost by ÷ (1 − waste).
    const ingredientesUn = input.ingredientes / input.rendimento / (1 - perda);
    // S3: the owner's time is a cost.
    const valorHora = input.salario / (input.horasSemana * SEMANAS_POR_MES);
    const maoDeObraUn = (input.tempoReceitaHoras / input.rendimento) * valorHora;
    const custoDireto = ingredientesUn + embalagem + maoDeObraUn;

    // S4, S5 (D3): fixed costs (+ DAS for MEI) as a share of revenue.
    const gastosFixos = input.custosFixos + das;
    const despesasFixas = gastosFixos / input.faturamento;
    // S5, S7: % of the price (card/app fee + Simples rate when not MEI).
    const impostosTaxas = taxaCartao + aliquota;
    const divisor = 1 - despesasFixas - impostosTaxas - input.margem;

    if (divisor <= 0) {
        if (despesasFixas >= LIMITE_ALERTA_FIXOS) {
            return {
                ok: false,
                errors: {
                    faturamento: `Seus custos fixos consomem ${percent(despesasFixas)} do que você vende. Aumente a expectativa de vendas ou reduza os custos.`,
                },
            };
        }
        return {
            ok: false,
            errors: {
                margem: 'A margem de lucro somada aos custos fixos, taxas e impostos não pode chegar a 100%.',
            },
        };
    }

    // S6: markup divisor. Rounded like the app, and everything below uses the price she'll charge.
    const price = round2(custoDireto / divisor);

    /** @type {Dre} */
    const dre = {
        ingredientes: ingredientesUn,
        embalagem,
        maoDeObra: maoDeObraUn,
        fixos: despesasFixas * price,
        impostosTaxas: impostosTaxas * price,
        lucro: input.margem * price,
    };

    // S8: what today's price really leaves per unit.
    const precoAtual = input.precoAtual ?? null;
    const lucroHoje =
        precoAtual === null
            ? null
            : (() => {
                  const unidade = precoAtual - custoDireto - (despesasFixas + impostosTaxas) * precoAtual;
                  return {
                      unidade,
                      receita: unidade * input.rendimento,
                      percentual: precoAtual > 0 ? unidade / precoAtual : 0,
                      prejuizo: unidade < 0,
                  };
              })();

    // S9: units of this product alone that pay the month's fixed costs.
    const contribuicao = price - custoDireto - impostosTaxas * price;
    const pontoEquilibrio = gastosFixos > 0 && contribuicao > 0 ? gastosFixos / contribuicao : null;

    return {
        ok: true,
        price,
        priceReceita: price * input.rendimento,
        markup: 1 / divisor,
        custoDireto,
        dre,
        percentuais: { despesasFixas, impostosTaxas, margem: input.margem },
        lucroHoje,
        pontoEquilibrio,
    };
}

/**
 * Parses what people type in Brazil: "1.234,56", "R$ 4.000", "15%", "2,07", "2.5".
 * @param {string} raw
 * @returns {number} NaN when there is no number
 */
export function parseNumeroBR(raw) {
    const cleaned = String(raw).replace(/[R$%\s]/g, '');
    if (cleaned === '' || !/^[\d.,]+$/.test(cleaned)) return Number.NaN;
    const normalized = cleaned.includes(',')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : /^\d{1,3}(\.\d{3})+$/.test(cleaned)
          ? cleaned.replace(/\./g, '')
          : cleaned;
    return Number(normalized);
}
