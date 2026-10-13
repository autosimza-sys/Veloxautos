-- Credit policy help, kept in sync with features/faq/catalog.json.
-- Data-only migration. Does not activate a campaign, move balances or send messages.
-- Forward rollback: restore these four catalog answers in a new migration.
begin;
update velox_private.faq_catalog set kind='static', answer='En la sección Créditos se informa el lote configurado para particular, reventa y agencia, junto con el costo por publicación y las fechas comunes. Si todavía no hay fechas o cupos, el lanzamiento aún no está configurado.' where id='c24.credit_allowance';
update velox_private.faq_catalog set kind='static', answer='Publicar un auto nuevo descuenta los créditos que se muestran antes de confirmar. Editar el mismo auto, las preguntas básicas, el chat humano, la agenda y los avisos dentro de Velox no descuentan créditos adicionales. La IA mantiene sus propios límites de uso; no hay cobros automáticos.' where id='c24.what_spends';
update velox_private.faq_catalog set kind='static', answer='Ingresá a tu cuenta y abrí la sección Créditos. Ahí podés ver el saldo, los usados acumulados, el vencimiento y tus últimos movimientos. Los consumos y las recargas gratuitas se registran por separado; no generan deuda.' where id='c24.balance';
update velox_private.faq_catalog set kind='static', answer='Si la recarga gratuita está habilitada en la promoción vigente, se repone el lote de tu tipo de vendedor cuando el saldo se agota o no alcanza para publicar. La recarga no cambia la fecha final común. Fuera del período gratuito no se recarga ni se cobra automáticamente; administración debe definir la continuidad.' where id='c24.exhausted';
commit;
