import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
globalThis.React = React;
const {default:QualitySection}=await import('../features/quality/QualitySection.jsx');

for (const checklist of [null, [], 'unexpected', {motor:{injected:'object'}}, {motor:['bueno',{bad:true}]}, {motor:'x'.repeat(20000)}, {certificado:'Inspeccion profesional aprobada'}]) {
  test(`untrusted checklist is safe to render: ${JSON.stringify(checklist).slice(0,60)}`, () => {
    const html=renderToStaticMarkup(React.createElement(QualitySection,{vehicle:{checklist,score:1}}));
    assert.ok(html.length < 10000);
    assert.doesNotMatch(html,/Inspeccion profesional aprobada|injected|unexpected/);
  });
}
test('declared checklist text stays escaped and valid choices remain visible', () => {
  const html=renderToStaticMarkup(React.createElement(QualitySection,{vehicle:{checklist:{motor:'bueno',caja:'no revisado'},score:5}}));
  assert.match(html,/bueno/); assert.match(html,/no revisado/);
});
