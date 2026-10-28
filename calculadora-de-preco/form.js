// @ts-check
// SPEC-019: wires the form to calculator.js. Nothing typed leaves the browser; analytics
// only get booleans (R12).
import { calculatePrice, parseNumeroBR } from '/calculator.js';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const field = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ ($(id));

/** Error keys from calculator.js → element that shows them. */
const ERROR_TARGET = /** @type {Record<string, string>} */ ({
    ingredientes: 'ingredientes',
    rendimento: 'rendimento',
    embalagem: 'embalagem',
    tempoReceitaHoras: 'tempo',
    perda: 'perda',
    das: 'das',
    aliquotaSimples: 'aliquotaSimples',
    custosFixos: 'custosFixos',
    faturamento: 'faturamento',
    salario: 'salario',
    horasSemana: 'horasSemana',
    taxaCartao: 'taxaCartao',
    margem: 'margem',
    precoAtual: 'precoAtual',
});
/** Which inputs "touch" each error target. */
const TOUCH_SOURCES = /** @type {Record<string, string[]>} */ ({ tempo: ['tempoHoras', 'tempoMinutos'] });

const touched = new Set();
let completedTracked = false;

/** @param {string} id */
const number = (id) => parseNumeroBR(field(id).value);
/** @param {string} id */
const optional = (id) => (field(id).value.trim() === '' ? undefined : number(id));
/** @param {string} id */
const rate = (id) => {
    const value = optional(id);
    return value === undefined ? undefined : value / 100;
};

function readInput() {
    const horas = field('tempoHoras').value.trim() === '' ? 0 : number('tempoHoras');
    const minutos = field('tempoMinutos').value.trim() === '' ? 0 : number('tempoMinutos');
    const semTempo = field('tempoHoras').value.trim() === '' && field('tempoMinutos').value.trim() === '';
    // Empty required fields go as undefined ("Preencha"), garbage as NaN ("Digite um número").
    const required = optional;
    const isMei = field('isMei').checked;
    const margem = rate('margem');
    const aliquotaSimples = rate('aliquotaSimples');
    return {
        ingredientes: required('ingredientes'),
        rendimento: required('rendimento'),
        embalagem: optional('embalagem'),
        tempoReceitaHoras: semTempo ? undefined : horas + minutos / 60,
        perda: rate('perda'),
        isMei,
        das: required('das'),
        aliquotaSimples,
        custosFixos: required('custosFixos'),
        faturamento: required('faturamento'),
        salario: required('salario'),
        horasSemana: required('horasSemana'),
        taxaCartao: rate('taxaCartao'),
        margem,
        precoAtual: optional('precoAtual') ?? null,
    };
}

/** @param {string} target */
const isTouched = (target) => (TOUCH_SOURCES[target] ?? [target]).some((id) => touched.has(id));

/** @param {Record<string, string>} errors */
function showFieldErrors(errors) {
    for (const target of new Set(Object.values(ERROR_TARGET))) {
        const key = Object.keys(ERROR_TARGET).find((k) => ERROR_TARGET[k] === target) ?? target;
        const message = isTouched(target) ? errors[key] : undefined;
        const el = $(`${target}-erro`);
        el.hidden = !message;
        el.textContent = message ?? '';
        for (const id of TOUCH_SOURCES[target] ?? [target]) {
            field(id).setAttribute('aria-invalid', message ? 'true' : 'false');
        }
    }
}

/** @param {'vazio' | 'erro' | 'ok'} state */
function showPanel(state) {
    $('res-vazio').hidden = state !== 'vazio';
    $('res-erro').hidden = state !== 'erro';
    $('res-ok').hidden = state !== 'ok';
    $('barra-preco').hidden = state !== 'ok';
}

/** @param {import('../calculator.js').CalculatorResult & { ok: true }} result */
function renderResult(result) {
    $('res-preco').textContent = brl.format(result.price);
    $('res-receita').textContent = brl.format(result.priceReceita);
    $('barra-preco-valor').textContent = brl.format(result.price);

    const total = Object.values(result.dre).reduce((sum, v) => sum + v, 0) || 1;
    for (const [key, value] of Object.entries(result.dre)) {
        const bar = /** @type {HTMLElement} */ (document.querySelector(`[data-dre="${key}"]`));
        bar.style.width = `${(value / total) * 100}%`;
        const label = /** @type {HTMLElement} */ (document.querySelector(`[data-dre-valor="${key}"]`));
        label.textContent = `${brl.format(value)} · ${pct.format(value / result.price)}`;
    }

    const hoje = $('res-hoje');
    if (result.lucroHoje) {
        const { unidade, receita, percentual, prejuizo } = result.lucroHoje;
        hoje.hidden = false;
        hoje.classList.toggle('calc-note--alerta', prejuizo);
        hoje.textContent = prejuizo
            ? `Com o preço de hoje você tem prejuízo de ${brl.format(-unidade)} por unidade (${brl.format(-receita)} por receita).`
            : `Com o preço de hoje sobra ${brl.format(unidade)} por unidade (${pct.format(percentual)} do preço), ${brl.format(receita)} por receita.`;
    } else {
        hoje.hidden = true;
    }

    $('res-pe').textContent =
        result.pontoEquilibrio === null
            ? ''
            : `Para pagar as contas do mês só com este produto: cerca de ${int.format(Math.ceil(result.pontoEquilibrio))} unidades.`;
    $('res-markup').textContent = `Markup: ${dec.format(result.markup)}`;
}

function track(/** @type {string} */ event, /** @type {Record<string, unknown>} */ properties = {}) {
    // @ts-ignore — loaded by /analytics.js only when the key is set
    window.posthog?.capture?.(event, properties);
}

function update() {
    const isMei = field('isMei').checked;
    for (const el of document.querySelectorAll('[data-show-when]')) {
        /** @type {HTMLElement} */ (el).hidden = (el.getAttribute('data-show-when') === 'mei') !== isMei;
    }

    const input = readInput();
    const result = calculatePrice(input);

    if (result.ok) {
        showFieldErrors({});
        renderResult(result);
        showPanel('ok');
        if (!completedTracked) {
            completedTracked = true;
            track('calculator_completed', {
                is_mei: isMei,
                has_current_price: result.lucroHoje !== null,
                is_losing_money: result.lucroHoje ? result.lucroHoje.prejuizo : null,
            });
        }
        return;
    }

    showFieldErrors(result.errors);
    // Rule-level errors (margin/fixed costs) only make sense once every field is filled.
    const pending = Object.keys(result.errors).filter((k) => !isTouched(ERROR_TARGET[k]));
    const visible = Object.entries(result.errors).filter(([k]) => isTouched(ERROR_TARGET[k]));
    if (pending.length === 0 && visible.length > 0) {
        $('res-erro-msg').textContent =
            result.errors.faturamento ?? result.errors.margem ?? 'Confira os campos destacados.';
        showPanel('erro');
    } else {
        showPanel('vazio');
    }
}

const form = /** @type {HTMLFormElement} */ ($('calculadora'));
form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('input', (event) => {
    touched.add(/** @type {HTMLInputElement} */ (event.target).id);
    update();
});
form.addEventListener('focusout', (event) => {
    touched.add(/** @type {HTMLInputElement} */ (event.target).id);
    update();
});
// Prefilled DAS counts as answered.
touched.add('das');
touched.add('isMei');

$('cta-calculadora').addEventListener('click', () => track('calculator_cta_clicked'));

update();
