// SPEC-019: calculator page (SEO R10, inputs R1–R3, CTA R8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const html = read('calculadora-de-preco/index.html');
const URL_PAGE = 'https://kozy.com.br/calculadora-de-preco/';

const jsonLd = () =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
        JSON.parse(m[1])
    );
const input = (id) => {
    const tag = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `input #${id} missing`);
    return tag[0];
};

test('SEO metadata (R10c)', () => {
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    assert.match(title, /^Calculadora de preço/);
    assert.ok(title.length <= 60, `title has ${title.length} chars`);
    const description = html.match(/<meta name="description" content="(.*?)">/)[1];
    assert.ok(description.length <= 155, `description has ${description.length} chars`);
    assert.equal(html.match(/<h1[\s>]/g).length, 1, 'exactly one h1');
    assert.match(html, new RegExp(`<link rel="canonical" href="${URL_PAGE}">`));
    const ogImage = html.match(/<meta property="og:image" content="https:\/\/kozy\.com\.br\/(.*?)">/)[1];
    assert.ok(existsSync(new URL(ogImage, root)), `og:image ${ogImage} not found`);
});

test('structured data: WebApplication (free), FAQPage = visible, BreadcrumbList (R10e)', () => {
    const blocks = jsonLd();
    const app = blocks.find((b) => b['@type'] === 'WebApplication');
    assert.equal(app.url, URL_PAGE);
    assert.equal(app.offers.price, '0');
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    const visible = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) =>
        m[1].replace(/<[^>]+>/g, '').trim()
    );
    assert.deepEqual(faq.mainEntity.map((q) => q.name), visible);
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    assert.deepEqual(crumbs.itemListElement.map((i) => i.item), ['https://kozy.com.br/', URL_PAGE]);
    assert.ok(!blocks.some((b) => b['@type'] === 'HowTo'));
});

test('indexable content without JS (R10b, R10d)', () => {
    assert.match(html, /<noscript>/);
    assert.match(html, /id="como-calcular"/);
    assert.match(html, /id="exemplo"[\s\S]*<table/);
    assert.match(html, /id="glossario"[\s\S]*<dl/);
    assert.match(html, /bibliotecas\.sebrae\.com\.br/);
    assert.doesNotMatch(html, /<img[^>]*sebrae/i, 'no Sebrae logo');
});

test('inputs: DAS prefilled and editable, margin empty, Simples rate only when not MEI (R1–R3)', () => {
    assert.match(input('das'), /value="82,05"/);
    assert.doesNotMatch(input('das'), /readonly|disabled/);
    assert.doesNotMatch(input('margem'), /value="[^"]/);
    const naoMei = html.match(/<div[^>]*data-show-when="nao-mei"[\s\S]*?<\/div>/)[0];
    assert.match(naoMei, /id="aliquotaSimples"/);
    for (const id of ['ingredientes', 'rendimento', 'faturamento', 'margem']) {
        assert.match(input(id), /inputmode="decimal"|inputmode="numeric"/);
    }
});

test('typed values never go to the URL (R10h)', () => {
    const form = html.match(/<form[^>]*>/)[0];
    assert.doesNotMatch(form, /action=|method="get"/i);
    assert.doesNotMatch(html, /<input[^>]*\sname="/, 'no named inputs to serialize');
});

test('CTA goes to sign-up with calculator UTM (R8.7)', () => {
    assert.match(
        html,
        /href="https:\/\/app\.kozy\.com\.br\/auth\/sign-up\?utm_source=calculator&amp;utm_medium=cta"/
    );
});

test('scripts: calculator module, form, PostHog only', () => {
    assert.match(html, /<script type="module" src="\/calculadora-de-preco\/form\.js">/);
    assert.match(html, /src="\/analytics\.js"/);
    assert.doesNotMatch(html, /googletagmanager|fbq\(/);
});

test('internal links: sitemap, landing and llms.txt point to the page (R10f)', () => {
    assert.match(read('sitemap.xml'), new RegExp(`<loc>${URL_PAGE}</loc>`));
    assert.match(read('index.html'), /href="\/calculadora-de-preco\/"/);
    assert.match(read('llms.txt'), new RegExp(URL_PAGE));
});
