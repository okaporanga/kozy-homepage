// MKT-001: guardrails for the landing page. Static site, so we assert on the shipped HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const llms = read('llms.txt');
const llmsFull = read('llms-full.txt');

const SIGN_UP = 'https://app.kozy.com.br/auth/sign-up';

const jsonLd = () =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1])
  );

test('every CTA points to the real sign-up route (/sign-up redirects to login)', () => {
  for (const file of [html, llms, llmsFull]) {
    assert.doesNotMatch(file, /app\.kozy\.com\.br\/sign-up/);
  }
  assert.ok(html.split(SIGN_UP).length - 1 >= 3, 'header, hero and final CTA');
});

test('does not claim a card-free trial (checkout asks for the card)', () => {
  assert.doesNotMatch(html, /sem cart[aã]o/i);
  assert.match(html, /primeira cobrança só acontece no 8º dia/);
});

test('shows the plans with the prices from lib/billing/plans.ts', () => {
  assert.match(html, /id="precos"/);
  assert.match(html, /R\$\s*39/);
  assert.match(html, /R\$\s*69/);
  assert.match(html, /R\$\s*745,20/);
});

test('Pro and WhatsApp orders are marked as coming soon', () => {
  const pro = html.slice(html.indexOf('data-plan="pro"'), html.indexOf('data-plan="pro-yearly"'));
  assert.match(pro, /Em breve/);
  const whatsapp = html.slice(html.indexOf('data-feature="whatsapp"'));
  assert.match(whatsapp.slice(0, 1500), /Em breve/);
});

test('only PostHog for analytics, as the privacy policy states', () => {
  assert.doesNotMatch(html, /googletagmanager|gtag\(|fbq\(|PIXEL_ID|connect\.facebook\.net/);
  assert.match(html, /src="analytics\.js"/);
  assert.match(html, /facebook-domain-verification/, 'Meta business verification stays');
});

test('structured data: real offer price and FAQ matching the visible questions', () => {
  const blocks = jsonLd();
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication');
  assert.equal(app.offers.price, '39.00');
  assert.equal(app.offers.priceCurrency, 'BRL');

  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  const visible = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, '').trim()
  );
  assert.deepEqual(
    faq.mainEntity.map((q) => q.name),
    visible
  );
});

test('supplier identification near the offer (Decreto 7.962/2013)', () => {
  assert.match(html, /15\.453\.950\/0001-49/);
  assert.match(html, /app\.kozy\.com\.br\/legal\/termos/);
  assert.match(html, /app\.kozy\.com\.br\/legal\/privacidade/);
});

test('SEO basics: title and description talk about confeitaria', () => {
  const title = html.match(/<title>(.*?)<\/title>/)[1];
  assert.match(title, /confeitaria/i);
  assert.ok(title.length <= 65, `title too long: ${title.length}`);
  const description = html.match(/<meta name="description" content="(.*?)">/)[1];
  assert.ok(description.length <= 160, `description too long: ${description.length}`);
});
