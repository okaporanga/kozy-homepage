// SPEC-019 / MKT-004: pricing calculator (Sebrae method).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    calculatePrice,
    parseNumeroBR,
    DAS_MEI_PADRAO,
    SEMANAS_POR_MES,
} from '../calculator.js';

const close = (actual, expected, tolerance = 0.005) =>
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

/** MKT-004 §4: brigadeiro, valores ilustrativos. */
const brigadeiro = () => ({
    ingredientes: 30,
    rendimento: 50,
    embalagem: 0.15,
    tempoReceitaHoras: 2,
    perda: 0.05,
    isMei: true,
    das: 80,
    aliquotaSimples: 0,
    custosFixos: 400,
    faturamento: 4000,
    salario: 2000,
    horasSemana: 120 / SEMANAS_POR_MES,
    taxaCartao: 0.03,
    margem: 0.15,
    precoAtual: 1.5,
});

test('acceptance example (MKT-004 §4): R$ 2,07, markup 1,43, −R$ 0,17/un at R$ 1,50, PE ≈ 858', () => {
    const result = calculatePrice(brigadeiro());
    assert.equal(result.ok, true);
    assert.equal(result.price, 2.07);
    close(result.markup, 1.4286, 0.0001);
    close(result.custoDireto, 1.4482, 0.0001);
    close(result.lucroHoje.unidade, -0.1732, 0.0001);
    close(result.lucroHoje.receita, -0.1732 * 50, 0.01);
    close(result.lucroHoje.percentual, -0.1155, 0.001);
    assert.equal(result.lucroHoje.prejuizo, true);
    close(result.pontoEquilibrio, 857.7, 0.1);
    close(result.priceReceita, 2.07 * 50, 0.0001);
});

test('today\'s price below the suggested one but still positive: profit, not loss', () => {
    // R$ 1,80: 1,80 − 1,4482 − (12% + 3%) × 1,80 = +0,0818 (4,5%, below the 15% target)
    const result = calculatePrice({ ...brigadeiro(), precoAtual: 1.8 });
    close(result.lucroHoje.unidade, 0.0818, 0.0001);
    assert.equal(result.lucroHoje.prejuizo, false);
});

test('unit breakdown (DRE) adds up to the price', () => {
    const { dre, price } = calculatePrice(brigadeiro());
    close(dre.ingredientes, 0.6316, 0.0001);
    close(dre.embalagem, 0.15, 0.0001);
    close(dre.maoDeObra, 0.6667, 0.0001);
    close(dre.fixos, 0.12 * 2.07, 0.0001);
    close(dre.impostosTaxas, 0.03 * 2.07, 0.0001);
    const sum = Object.values(dre).reduce((a, b) => a + b, 0);
    close(sum, price, 0.01);
});

test('waste follows Sebrae S2: 20% waste → ingredient cost × 1,25', () => {
    const input = { ...brigadeiro(), perda: 0.2 };
    close(calculatePrice(input).dre.ingredientes, (30 / 50) * 1.25, 0.0001);
});

test('MEI: DAS is a fixed cost (DF%), never a % of the price', () => {
    const mei = calculatePrice(brigadeiro());
    close(mei.percentuais.despesasFixas, 480 / 4000, 1e-9);
    close(mei.percentuais.impostosTaxas, 0.03, 1e-9);
});

test('not MEI: Simples rate goes into DV% and the DAS is ignored', () => {
    const result = calculatePrice({ ...brigadeiro(), isMei: false, aliquotaSimples: 0.06, das: 999 });
    close(result.percentuais.despesasFixas, 400 / 4000, 1e-9);
    close(result.percentuais.impostosTaxas, 0.09, 1e-9);
});

test('margin + fixed + fees ≥ 100% is rejected with a clear message', () => {
    const result = calculatePrice({ ...brigadeiro(), margem: 0.9 });
    assert.equal(result.ok, false);
    assert.match(result.errors.margem, /100%/);
});

test('fixed costs ≥ 50% of revenue get the revenue-specific message (D4)', () => {
    const result = calculatePrice({ ...brigadeiro(), faturamento: 900, margem: 0.6 });
    assert.equal(result.ok, false);
    assert.match(result.errors.faturamento, /custos fixos consomem 53%/);
});

test('zero or missing required inputs → field errors, never Infinity/NaN', () => {
    for (const field of ['rendimento', 'tempoReceitaHoras', 'faturamento', 'salario', 'horasSemana']) {
        const result = calculatePrice({ ...brigadeiro(), [field]: 0 });
        assert.equal(result.ok, false, field);
        assert.ok(result.errors[field], field);
    }
    const missing = calculatePrice({ ...brigadeiro(), ingredientes: Number.NaN, margem: undefined });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.ingredientes);
    assert.ok(missing.errors.margem);
});

test('empty vs. not a number get different messages', () => {
    const result = calculatePrice({ ...brigadeiro(), ingredientes: undefined, rendimento: Number.NaN });
    assert.equal(result.errors.ingredientes, 'Preencha este campo.');
    assert.equal(result.errors.rendimento, 'Digite um número.');
});

test('out-of-range inputs are rejected', () => {
    assert.ok(calculatePrice({ ...brigadeiro(), perda: 1 }).errors.perda);
    assert.ok(calculatePrice({ ...brigadeiro(), embalagem: -1 }).errors.embalagem);
    assert.ok(calculatePrice({ ...brigadeiro(), horasSemana: 169 }).errors.horasSemana);
    assert.ok(calculatePrice({ ...brigadeiro(), das: Number.NaN }).errors.das);
    assert.ok(calculatePrice({ ...brigadeiro(), isMei: false, aliquotaSimples: undefined }).errors.aliquotaSimples);
});

test('optional inputs default to zero / null', () => {
    const { embalagem, perda, taxaCartao, precoAtual, ...required } = brigadeiro();
    const result = calculatePrice(required);
    assert.equal(result.ok, true);
    assert.equal(result.dre.embalagem, 0);
    assert.equal(result.lucroHoje, null);
});

test('break-even is null when there is nothing to cover or no contribution', () => {
    // No fixed costs and no margin: contribution per unit is zero.
    const result = calculatePrice({ ...brigadeiro(), custosFixos: 0, das: 0, margem: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.pontoEquilibrio, null);
});

test('parity with the app (kozy/lib/pricing/suggest-price.ts, SPEC-018 fixtures)', () => {
    // No waste, no fixed costs, not MEI: the calculator must match suggestPrice.
    const base = {
        rendimento: 1,
        perda: 0,
        isMei: false,
        custosFixos: 0,
        faturamento: 1,
        salario: 1,
        horasSemana: 1,
        tempoReceitaHoras: 1e-9,
    };
    // custo 10 + extra 1, margem 30%, taxa 5% → 11 / 0.65
    const a = calculatePrice({ ...base, ingredientes: 10, embalagem: 1, aliquotaSimples: 0, taxaCartao: 0.05, margem: 0.3 });
    assert.equal(a.price, Math.round((11 / 0.65) * 100) / 100);
    // custo 10, margem 30%, taxa 5%, carga tributária 10% → 10 / 0.55
    const b = calculatePrice({ ...base, ingredientes: 10, embalagem: 0, aliquotaSimples: 0.1, taxaCartao: 0.05, margem: 0.3 });
    assert.equal(b.price, Math.round((10 / 0.55) * 100) / 100);
    // labor: suggestPrice uses (tempoPreparoMinutos / 60) × valorHoraTrabalho
    const valorHora = 2000 / (40 * SEMANAS_POR_MES);
    const c = calculatePrice({ ...base, ingredientes: 10, embalagem: 0, aliquotaSimples: 0, margem: 0.3, salario: 2000, horasSemana: 40, tempoReceitaHoras: 0.5 });
    assert.equal(c.price, Math.round(((10 + (30 / 60) * valorHora) / 0.7) * 100) / 100);
});

test('DAS default is the 2026 value for comércio/indústria', () => {
    assert.equal(DAS_MEI_PADRAO, 82.05);
});

test('parseNumeroBR reads Brazilian number formats', () => {
    assert.equal(parseNumeroBR('2,07'), 2.07);
    assert.equal(parseNumeroBR('1.234,56'), 1234.56);
    assert.equal(parseNumeroBR('R$ 4.000'), 4000);
    assert.equal(parseNumeroBR('15%'), 15);
    assert.equal(parseNumeroBR(' 30 '), 30);
    assert.equal(parseNumeroBR('2.5'), 2.5);
    assert.ok(Number.isNaN(parseNumeroBR('')));
    assert.ok(Number.isNaN(parseNumeroBR('abc')));
});
