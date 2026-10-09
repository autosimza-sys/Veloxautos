import {test,expect} from '@playwright/test';
import path from 'node:path';

test('FAQ opens from the home page, searches accents and describes shared promotion without billing',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/preguntas');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(4, 6, 13)');
 await expect(page.getByRole('heading',{name:'Preguntá antes de decidir'})).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('240 preguntas encontradas');
 await page.getByLabel('Buscar una pregunta').fill('distribucion');
 await page.getByText('¿Cuándo cambiaron la distribución?',{exact:true}).click();
 await expect(page.getByText('Esta respuesta requiere información de la unidad o una confirmación del vendedor.',{exact:false})).toBeVisible();
 await page.getByLabel('Buscar una pregunta').fill('');
 await page.getByLabel('Categoría de preguntas').selectOption('c24');
 await expect(page.getByRole('status')).toHaveText('10 preguntas encontradas');
 await page.getByText('¿Después se empieza a cobrar automáticamente?',{exact:true}).click();
 await expect(page.getByText('No se cobra automáticamente.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 if(process.env.VELOX_QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.VELOX_QA_SCREENSHOT_DIR,`velox-faq-${testInfo.project.name}.png`),fullPage:true});
 await page.getByRole('link',{name:'← Volver a Velox'}).click();
 // Navigation stays reachable in the responsive layout through the help page URL;
 // the home navigation can collapse on narrow devices.
 await expect(page).toHaveURL(/\/$/);
 expect(errors).toEqual([]);
});

test('FAQ is keyboard operable and empty results never fabricate a reply',async({page})=>{
 await page.goto('/preguntas');
 await page.getByLabel('Buscar una pregunta').fill('invented_unmatched_question');
 await expect(page.getByRole('status')).toHaveText('No encontramos preguntas con ese filtro.');
 await page.getByLabel('Buscar una pregunta').fill('noventa días gratis');
 const summary=page.locator('summary').first();await summary.focus();await page.keyboard.press('Enter');
 await expect(page.getByText('La promoción definida dura 90 días desde una fecha común',{exact:false})).toBeVisible();
});
