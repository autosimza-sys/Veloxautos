begin;
create table velox_private.faq_catalog(
 id text primary key, question text not null, aliases jsonb not null,
 kind text not null, answer text, reusable boolean not null default false
);
alter table velox_private.faq_catalog enable row level security;
revoke all on velox_private.faq_catalog from public,anon,authenticated;
insert into velox_private.faq_catalog(id,question,aliases,kind,answer,reusable) values
('c01.available','¿Todavía está disponible?','["¿Todavía está disponible?","Hola está disponible","Lo tenés todavía","Sigue a la venta","¿Sigue disponible?","¿Está disponible?","Disponible"]'::jsonb,'availability',null,false),
('c01.reserved','¿Está reservado o se puede ver?','["¿Está reservado o se puede ver?","Está señado","Lo reservaron","Puedo verlo igual"]'::jsonb,'missing',null,false),
('c01.sold','¿Ya se vendió?','["¿Ya se vendió?","Ya lo vendiste","Se fue","Lo siguen ofreciendo"]'::jsonb,'availability',null,false),
('c01.exact_unit','¿Las fotos son del auto que venden?','["¿Las fotos son del auto que venden?","Es el de las fotos","Son fotos reales","Son ilustrativas"]'::jsonb,'missing',null,false),
('c01.seller_kind','¿Vende un particular, una reventa o una agencia?','["¿Vende un particular, una reventa o una agencia?","Sos dueño o agencia","Es concesionaria","Quién lo vende"]'::jsonb,'missing',null,false),
('c01.own_or_consigned','¿El auto es propio o está en consignación?','["¿El auto es propio o está en consignación?","Lo tienen para vender","Es de ustedes","Venden por un tercero"]'::jsonb,'missing',null,false),
('c01.public_location','¿En qué zona está el auto?','["¿En qué zona está el auto?","De dónde sos","Dónde está","En qué ciudad","¿En qué zona se puede ver?","¿Dónde está?"]'::jsonb,'zone',null,false),
('c01.last_update','¿Cuándo actualizaron la publicación?','["¿Cuándo actualizaron la publicación?","Es una publicación vieja","Está actualizado","Cuándo la subieron"]'::jsonb,'missing',null,false),
('c01.seller_contact','¿Puedo hablar directamente con el vendedor?','["¿Puedo hablar directamente con el vendedor?","Pasame el teléfono","Quiero hablar con una persona","Te puedo llamar"]'::jsonb,'missing',null,false),
('c01.other_units','¿Tenés otro igual o parecido?','["¿Tenés otro igual o parecido?","Tenés otro del mismo modelo","Algo parecido","Hay otra unidad"]'::jsonb,'missing',null,false),
('c02.year','¿De qué año es y qué modelo figura?','["¿De qué año es y qué modelo figura?","Qué año es","Año de fabricación","Modelo año"]'::jsonb,'year',null,false),
('c02.version','¿Qué versión exacta es?','["¿Qué versión exacta es?","Qué versión","Es full o base","Qué equipamiento trae de fábrica"]'::jsonb,'version',null,false),
('c02.mileage','¿Cuántos kilómetros tiene?','["¿Cuántos kilómetros tiene?","Kilómetros","Cuantos km","Cuánto marca el tablero"]'::jsonb,'mileage',null,false),
('c02.engine','¿Qué motor y cilindrada tiene?','["¿Qué motor y cilindrada tiene?","Qué motor trae","Cilindrada","Es turbo"]'::jsonb,'missing',null,true),
('c02.transmission','¿Es manual o automático?','["¿Es manual o automático?","Es automático","Qué caja tiene","Cuántos cambios"]'::jsonb,'missing',null,true),
('c02.fuel','¿Usa nafta, diésel, GNC o electricidad?','["¿Usa nafta, diésel, GNC o electricidad?","Qué combustible usa","Es gasolero","Es naftero"]'::jsonb,'missing',null,true),
('c02.doors_seats','¿Cuántas puertas y plazas tiene?','["¿Cuántas puertas y plazas tiene?","Es cinco puertas","Cuántos entran","Tiene siete asientos"]'::jsonb,'missing',null,true),
('c02.color','¿De qué color es?','["¿De qué color es?","Color original","Qué color","Es el color de fábrica"]'::jsonb,'missing',null,true),
('c02.body_dimensions','¿Qué tamaño, baúl o capacidad de carga tiene?','["¿Qué tamaño, baúl o capacidad de carga tiene?","Entra en mi cochera","Capacidad del baúl","Cuánto carga"]'::jsonb,'missing',null,true),
('c02.owners_use','¿Cuántos dueños tuvo y qué uso le dieron?','["¿Cuántos dueños tuvo y qué uso le dieron?","Fue taxi","Único dueño","Era remis o de empresa"]'::jsonb,'missing',null,true),
('c03.engine_condition','¿Cómo está el motor?','["¿Cómo está el motor?","Está bien de motor","Tiene fallas","Cómo anda de mecánica"]'::jsonb,'check:motor',null,false),
('c03.engine_repairs','¿Se reparó o cambió el motor?','["¿Se reparó o cambió el motor?","Motor hecho","Le hicieron tapa","Tiene motor nuevo"]'::jsonb,'missing',null,true),
('c03.overheating','¿Levanta temperatura o tuvo problemas de refrigeración?','["¿Levanta temperatura o tuvo problemas de refrigeración?","Calienta","Hirvió","Tiene problemas de temperatura"]'::jsonb,'missing',null,true),
('c03.smoke_oil','¿Humea o consume aceite?','["¿Humea o consume aceite?","Gasea","Tira humo","Gasta aceite"]'::jsonb,'missing',null,true),
('c03.leaks','¿Tiene pérdidas de aceite, agua o combustible?','["¿Tiene pérdidas de aceite, agua o combustible?","Pierde agua","Pierde aceite","Tiene pérdidas"]'::jsonb,'missing',null,true),
('c03.gearbox','¿Cómo está la caja de cambios?','["¿Cómo está la caja de cambios?","Rasca los cambios","Patina la automática","Tiene problemas de caja"]'::jsonb,'check:caja',null,false),
('c03.clutch','¿Cómo está el embrague?','["¿Cómo está el embrague?","Se le hizo embrague","Patina el embrague","Está duro el pedal"]'::jsonb,'missing',null,true),
('c03.timing','¿Cuándo cambiaron la distribución?','["¿Cuándo cambiaron la distribución?","Correa hecha","Tiene cadena","Kit de distribución"]'::jsonb,'missing',null,true),
('c03.service','¿Tiene servicios y comprobantes de mantenimiento?','["¿Tiene servicios y comprobantes de mantenimiento?","Historial de service","Cambio de aceite","Libreta de mantenimiento"]'::jsonb,'missing',null,true),
('c03.warning_lights','¿Tiene testigos encendidos, ruidos o fallas al arrancar?','["¿Tiene testigos encendidos, ruidos o fallas al arrancar?","Check engine","No arranca en frío","Hace algún ruido"]'::jsonb,'missing',null,true),
('c04.accidents','¿Tuvo choques o reparaciones importantes?','["¿Tuvo choques o reparaciones importantes?","Fue chocado","Tuvo un palo","Tiene daños estructurales"]'::jsonb,'check:choques',null,false),
('c04.flood_fire','¿Se inundó o tuvo un incendio?','["¿Se inundó o tuvo un incendio?","Fue inundado","Entró agua","Se prendió fuego"]'::jsonb,'missing',null,true),
('c04.hail','¿Tiene granizo, rayones o abolladuras?','["¿Tiene granizo, rayones o abolladuras?","Está granizado","Tiene golpes","Qué detalles de chapa tiene"]'::jsonb,'missing',null,true),
('c04.paint','¿Está repintado o tiene pintura original?','["¿Está repintado o tiene pintura original?","Pintura de fábrica","Lo pintaron","Tiene paneles repintados"]'::jsonb,'check:pintura',null,false),
('c04.structure_rust','¿Tiene óxido, corrosión o reparaciones de chasis?','["¿Tiene óxido, corrosión o reparaciones de chasis?","Está podrido","Tiene óxido","Chasis reparado"]'::jsonb,'missing',null,true),
('c04.upholstery','¿Cómo están los asientos y el interior?','["¿Cómo están los asientos y el interior?","Tapizados rotos","Cómo está adentro","Tiene detalles de interior"]'::jsonb,'check:interiores',null,false),
('c04.water_smell','¿Tiene filtraciones, humedad u olores?','["¿Tiene filtraciones, humedad u olores?","Entra agua al habitáculo","Tiene olor a humedad","Fumaban adentro"]'::jsonb,'missing',null,true),
('c04.tires','¿Cómo están las cubiertas y el auxilio?','["¿Cómo están las cubiertas y el auxilio?","Cuánta vida tienen las gomas","Tiene auxilio","Están para cambiar"]'::jsonb,'check:cubiertas',null,false),
('c04.brakes_suspension','¿Cómo están frenos, dirección y suspensión?','["¿Cómo están frenos, dirección y suspensión?","Tren delantero","Hace ruido la suspensión","Frena bien"]'::jsonb,'missing',null,true),
('c04.glass_lights','¿Tiene parabrisas, luces o espejos dañados?','["¿Tiene parabrisas, luces o espejos dañados?","Vidrios rotos","Parabrisas picado","Funcionan las luces"]'::jsonb,'missing',null,true),
('c05.ac','¿Funciona el aire acondicionado y la calefacción?','["¿Funciona el aire acondicionado y la calefacción?","Enfría el aire","Tiene climatizador","Anda la calefacción"]'::jsonb,'missing',null,true),
('c05.steering_windows','¿Tiene dirección asistida y levantavidrios?','["¿Tiene dirección asistida y levantavidrios?","Dirección hidráulica","Vidrios eléctricos","Cierre centralizado"]'::jsonb,'missing',null,true),
('c05.airbags','¿Cuántos airbags tiene y están operativos?','["¿Cuántos airbags tiene y están operativos?","Tiene airbag","Saltaron los airbags","Luz de airbag"]'::jsonb,'missing',null,true),
('c05.abs_esp','¿Tiene ABS y control de estabilidad?','["¿Tiene ABS y control de estabilidad?","Tiene ESP","Frenos ABS","Control de tracción"]'::jsonb,'missing',null,true),
('c05.isofix','¿Tiene ISOFIX para la silla infantil?','["¿Tiene ISOFIX para la silla infantil?","Anclajes para sillita","Tiene isofix","Top tether"]'::jsonb,'missing',null,true),
('c05.parking','¿Tiene cámara, sensores o asistencia de estacionamiento?','["¿Tiene cámara, sensores o asistencia de estacionamiento?","Cámara de retroceso","Sensores para estacionar","Estaciona solo"]'::jsonb,'missing',null,true),
('c05.multimedia','¿Tiene Bluetooth, CarPlay o Android Auto?','["¿Tiene Bluetooth, CarPlay o Android Auto?","Se conecta el celular","Tiene pantalla","Android auto"]'::jsonb,'missing',null,true),
('c05.drive_4x4','¿Es 4x2, 4x4 o tracción integral?','["¿Es 4x2, 4x4 o tracción integral?","Tiene doble tracción","Es AWD","Funciona la 4x4"]'::jsonb,'missing',null,true),
('c05.cruise_adas','¿Tiene control crucero o ayudas a la conducción?','["¿Tiene control crucero o ayudas a la conducción?","Crucero adaptativo","Frena solo","Asistente de carril"]'::jsonb,'missing',null,true),
('c05.keys_accessories','¿Entregan dos llaves, manual y accesorios?','["¿Entregan dos llaves, manual y accesorios?","Tiene segunda llave","Trae manual","Qué incluye la entrega"]'::jsonb,'missing',null,true),
('c06.has_gnc','¿Tiene GNC instalado?','["¿Tiene GNC instalado?","Anda a gas","Tiene equipo","Es con GNC"]'::jsonb,'missing',null,true),
('c06.generation','¿Qué generación, marca y modelo de equipo tiene?','["¿Qué generación, marca y modelo de equipo tiene?","Es quinta generación","Marca del equipo","Qué equipo de gas"]'::jsonb,'missing',null,true),
('c06.cylinder','¿Qué tubo tiene y cuánto espacio ocupa?','["¿Qué tubo tiene y cuánto espacio ocupa?","Tamaño del tubo","Capacidad de GNC","Pierde mucho baúl"]'::jsonb,'missing',null,true),
('c06.sticker','¿La oblea y la documentación del GNC están vigentes?','["¿La oblea y la documentación del GNC están vigentes?","Oblea al día","Papeles del gas","Vence el GNC"]'::jsonb,'missing',null,true),
('c06.hydrotest','¿Cuándo corresponde la prueba del cilindro?','["¿Cuándo corresponde la prueba del cilindro?","Prueba hidráulica","Vencimiento del tubo","Última prueba del GNC"]'::jsonb,'missing',null,false),
('c06.installation_date','¿Cuándo se instaló y quién hizo el trabajo?','["¿Cuándo se instaló y quién hizo el trabajo?","Hace cuánto tiene gas","Taller instalador","Dónde colocaron el equipo"]'::jsonb,'missing',null,true),
('c06.consumption','¿Cuánto rinde con GNC?','["¿Cuánto rinde con GNC?","Cuántos km hace con un tubo","Autonomía a gas","Cuánto gasta"]'::jsonb,'missing',null,true),
('c06.both_fuels','¿Funciona bien tanto a nafta como a GNC?','["¿Funciona bien tanto a nafta como a GNC?","Anda a nafta y gas","Falla a gas","Arranca a nafta"]'::jsonb,'missing',null,true),
('c06.maintenance','¿Qué mantenimiento o reparaciones tuvo el GNC?','["¿Qué mantenimiento o reparaciones tuvo el GNC?","Le hicieron las válvulas","Service del gas","Tuvo problemas con el equipo"]'::jsonb,'missing',null,true),
('c06.remove_install','¿Se puede entregar sin GNC o instalarle uno?','["¿Se puede entregar sin GNC o instalarle uno?","Me lo das sin tubo","Le pueden poner gas","Sacan el GNC"]'::jsonb,'missing',null,false),
('c07.technology','¿Es eléctrico, híbrido o híbrido enchufable?','["¿Es eléctrico, híbrido o híbrido enchufable?","Es híbrido de verdad","Se enchufa","Es cien por ciento eléctrico"]'::jsonb,'missing',null,true),
('c07.range','¿Qué autonomía tiene?','["¿Qué autonomía tiene?","Cuántos kilómetros dura la batería","Autonomía real","Cuánto recorre"]'::jsonb,'missing',null,true),
('c07.battery_health','¿Cómo está la batería y tiene un informe de salud?','["¿Cómo está la batería y tiene un informe de salud?","Salud de batería","Tiene SOH","Degradación de batería"]'::jsonb,'missing',null,true),
('c07.battery_warranty','¿La batería conserva garantía?','["¿La batería conserva garantía?","Garantía de batería","Cuántos años cubre","Sigue en garantía"]'::jsonb,'missing',null,false),
('c07.charger','¿Incluye cargador y cables?','["¿Incluye cargador y cables?","Trae el cargador","Cable de carga","Incluye wallbox"]'::jsonb,'missing',null,true),
('c07.connector','¿Qué conector y tipos de carga acepta?','["¿Qué conector y tipos de carga acepta?","Qué enchufe usa","Carga rápida","Conector compatible"]'::jsonb,'missing',null,true),
('c07.home_charge','¿Lo puedo cargar en casa?','["¿Lo puedo cargar en casa?","Carga con enchufe común","Necesito instalación eléctrica","Puedo poner wallbox"]'::jsonb,'missing',null,false),
('c07.charge_time','¿Cuánto tarda y cuánto cuesta cargarlo?','["¿Cuánto tarda y cuánto cuesta cargarlo?","Tiempo de carga","Precio de una carga","Cuánto gasta de luz"]'::jsonb,'missing',null,false),
('c07.replacement','¿Cuánto cuesta cambiar o reparar la batería?','["¿Cuánto cuesta cambiar o reparar la batería?","Batería nueva cuánto sale","Reparan módulos","Repuestos de batería"]'::jsonb,'missing',null,false),
('c07.hybrid_maintenance','¿Qué mantenimiento y servicio técnico necesita?','["¿Qué mantenimiento y servicio técnico necesita?","Service de híbrido","Hay repuestos","Quién lo repara"]'::jsonb,'missing',null,true),
('c08.price','¿Cuál es el precio?','["¿Cuál es el precio?","Precio","Cuánto vale","Cuánto pedís"]'::jsonb,'price',null,false),
('c08.cash_discount','¿Hay descuento de contado?','["¿Hay descuento de contado?","Precio efectivo","Mejor precio cash","Cuánto contado"]'::jsonb,'missing',null,false),
('c08.lowest_price','¿Cuál es lo mínimo que aceptás?','["¿Cuál es lo mínimo que aceptás?","Último precio","Menos cuánto","Tu mejor número"]'::jsonb,'missing',null,false),
('c08.make_offer','¿Puedo hacer una oferta?','["¿Puedo hacer una oferta?","Te ofrezco menos","Te sirven ocho millones","Aceptás una propuesta"]'::jsonb,'static','Podés escribir una propuesta para que el vendedor la evalúe. Este asistente no acepta importes ni compromete descuentos.',false),
('c08.currency','¿El precio está en pesos o dólares?','["¿El precio está en pesos o dólares?","Son pesos","Es en dólares","Qué moneda es"]'::jsonb,'currency',null,false),
('c08.validity','¿Hasta cuándo mantienen el precio?','["¿Hasta cuándo mantienen el precio?","Me congelás el precio","Lo mantenés mañana","Precio vigente"]'::jsonb,'missing',null,false),
('c08.includes_costs','¿Ese precio es final o faltan gastos?','["¿Ese precio es final o faltan gastos?","Puesto en la calle","Tiene gastos aparte","Incluye todo"]'::jsonb,'missing',null,false),
('c08.price_difference','¿Por qué acá dice un precio y en otro lado otro?','["¿Por qué acá dice un precio y en otro lado otro?","En Facebook está más barato","Otro precio en la foto","Cambió el valor"]'::jsonb,'missing',null,false),
('c08.price_reason','¿Por qué está tan barato o tan caro?','["¿Por qué está tan barato o tan caro?","Qué tiene por ese precio","Por qué lo rebajaron","Vale más que otros"]'::jsonb,'missing',null,false),
('c08.budget','¿Me alcanza con mi presupuesto?','["¿Me alcanza con mi presupuesto?","Tengo hasta diez millones","Me alcanza con esto","Busco algo dentro de mi plata"]'::jsonb,'missing',null,false),
('c09.payment_methods','¿Qué medios de pago aceptan?','["¿Qué medios de pago aceptan?","Cómo puedo pagar","Efectivo o transferencia","Formas de pago"]'::jsonb,'missing',null,false),
('c09.usd_rate','¿Aceptan dólares y a qué cotización?','["¿Aceptan dólares y a qué cotización?","Toman dólares","Qué dólar toman","Pago parte en dólares"]'::jsonb,'missing',null,false),
('c09.card','¿Puedo pagar con tarjeta?','["¿Puedo pagar con tarjeta?","Aceptan crédito","Tarjeta de débito","Puedo tarjetear la entrega"]'::jsonb,'missing',null,false),
('c09.checks','¿Aceptan cheques o pagos diferidos?','["¿Aceptan cheques o pagos diferidos?","Toman cheques","Cheques de terceros","Cheques semanales"]'::jsonb,'missing',null,false),
('c09.other_assets','¿Aceptan criptomonedas u otros bienes?','["¿Aceptan criptomonedas u otros bienes?","Pago con USDT","Aceptás un terreno","Puedo darte otra cosa"]'::jsonb,'missing',null,false),
('c09.fees','¿Hay comisión, inscripción o gastos de gestión?','["¿Hay comisión, inscripción o gastos de gestión?","Cobran comisión","Hay inscripción","Me cobran gestión"]'::jsonb,'missing',null,false),
('c09.transfer_cost','¿Cuánto cuesta la transferencia?','["¿Cuánto cuesta la transferencia?","Gastos de transferencia","Cuánto sale ponerlo a mi nombre","Costo del trámite"]'::jsonb,'missing',null,false),
('c09.mixed_payments','¿Puedo pagar una parte por transferencia y otra de otra forma?','["¿Puedo pagar una parte por transferencia y otra de otra forma?","Mitad efectivo mitad banco","Dos transferencias","Pagar desde dos cuentas"]'::jsonb,'missing',null,false),
('c09.recipient','¿A quién le transfiero y cómo verifico la cuenta?','["¿A quién le transfiero y cómo verifico la cuenta?","Pasame el alias","CBU para pagar","A nombre de quién deposito"]'::jsonb,'missing',null,false),
('c09.receipt','¿Me entregan recibo o factura?','["¿Me entregan recibo o factura?","Dan comprobante","Necesito factura","Comprobante de pago"]'::jsonb,'missing',null,false),
('c10.accept_trade','¿Aceptan mi auto en parte de pago?','["¿Aceptan mi auto en parte de pago?","Permutás","Tomás usado","Aceptan permuta","¿Aceptás permuta?","Permuta"]'::jsonb,'trade',null,false),
('c10.old_car','¿Aceptan autos viejos o de 2004 para atrás?','["¿Aceptan autos viejos o de 2004 para atrás?","Toman autos viejitos","Tengo un modelo 98","Aceptan un 2004"]'::jsonb,'missing',null,false),
('c10.motorcycle','¿Aceptan una moto como parte de pago?','["¿Aceptan una moto como parte de pago?","Toman moto","Permuto mi moto","Auto por moto y diferencia"]'::jsonb,'missing',null,false),
('c10.multiple','¿Aceptan dos vehículos en una misma operación?','["¿Aceptan dos vehículos en una misma operación?","Entrego dos autos","Auto y moto","Dos permutas"]'::jsonb,'missing',null,false),
('c10.higher_value','¿Reciben un vehículo de mayor valor y me dan diferencia?','["¿Reciben un vehículo de mayor valor y me dan diferencia?","Me das plata arriba","Bajo de modelo","Mi auto vale más"]'::jsonb,'missing',null,false),
('c10.lower_value','¿Aceptan un auto de menor valor y pago la diferencia?','["¿Aceptan un auto de menor valor y pago la diferencia?","Pongo mi usado y plata","Mi auto vale menos","Cambio por uno más nuevo"]'::jsonb,'missing',null,false),
('c10.not_owner','¿Puedo entregar un auto que no está a mi nombre?','["¿Puedo entregar un auto que no está a mi nombre?","Está a nombre de mi padre","Tengo el 08 firmado","No soy titular"]'::jsonb,'missing',null,false),
('c10.damaged','¿Toman autos con detalles mecánicos o sin funcionar?','["¿Toman autos con detalles mecánicos o sin funcionar?","Reciben fundidos","Tiene el motor roto","No anda"]'::jsonb,'missing',null,false),
('c10.with_debts','¿Aceptan mi auto con deuda, multas o prenda?','["¿Aceptan mi auto con deuda, multas o prenda?","Tiene deuda de patente","Mi auto está prendado","Toman con multas"]'::jsonb,'missing',null,false),
('c10.out_of_province','¿Reciben permutas de otra provincia?','["¿Reciben permutas de otra provincia?","Mi auto está radicado afuera","Soy de San Juan","Permuta de otra provincia"]'::jsonb,'missing',null,false),
('c11.trade_value','¿Cuánto me toman mi vehículo?','["¿Cuánto me toman mi vehículo?","Cuánto me das por el mío","Tasame el auto","Qué valor de toma tiene"]'::jsonb,'missing',null,false),
('c11.required_info','¿Qué datos necesitás para tasarlo?','["¿Qué datos necesitás para tasarlo?","Qué te paso del mío","Datos para la permuta","Qué información te sirve"]'::jsonb,'missing',null,false),
('c11.photos','¿Qué fotos tengo que mandar?','["¿Qué fotos tengo que mandar?","Fotos para tasar","Cuáles fotos necesitas","Te mando fotos del usado"]'::jsonb,'missing',null,false),
('c11.remote','¿Me lo pueden tasar por fotos o tengo que llevarlo?','["¿Me lo pueden tasar por fotos o tengo que llevarlo?","Tasación online","Sin llevar el auto","Lo tasan por WhatsApp"]'::jsonb,'missing',null,false),
('c11.method','¿Cómo calculan el valor de mi auto?','["¿Cómo calculan el valor de mi auto?","Usan InfoAuto","Qué tabla usan","De dónde sale la tasación"]'::jsonb,'missing',null,false),
('c11.final_or_reference','¿La tasación es definitiva?','["¿La tasación es definitiva?","Ese valor me lo respetan","Es oferta firme","Puede cambiar al verlo"]'::jsonb,'missing',null,false),
('c11.validity','¿Cuánto tiempo dura la tasación?','["¿Cuánto tiempo dura la tasación?","Hasta cuándo vale","Me mantienen la toma","Cuándo vence"]'::jsonb,'missing',null,false),
('c11.keep_car','¿Puedo seguir usando mi auto hasta la entrega?','["¿Puedo seguir usando mi auto hasta la entrega?","Me tengo que quedar a pie","Cuándo dejo el usado","Sigo usando el mío"]'::jsonb,'missing',null,false),
('c11.valuation_gap','¿Por qué me lo toman por menos de lo que vale publicado?','["¿Por qué me lo toman por menos de lo que vale publicado?","Me lo tasan bajo","En internet piden más","Por qué la diferencia"]'::jsonb,'missing',null,false),
('c11.valuation_cost','¿La tasación se cobra?','["¿La tasación se cobra?","Tasación gratis","Cuánto cobran por tasar","Hay que pagar para evaluar"]'::jsonb,'missing',null,false),
('c12.trade_cash','¿Cuánto efectivo tengo que agregar a mi usado?','["¿Cuánto efectivo tengo que agregar a mi usado?","Qué diferencia pongo","Mi auto más plata","Cuánto arriba"]'::jsonb,'missing',null,false),
('c12.trade_finance','¿Puedo entregar mi auto y financiar la diferencia?','["¿Puedo entregar mi auto y financiar la diferencia?","Usado y cuotas","Financiar arriba de mi auto","Permuta más crédito"]'::jsonb,'missing',null,false),
('c12.trade_cash_finance','¿Puedo entregar auto, dinero y pagar el resto en cuotas?','["¿Puedo entregar auto, dinero y pagar el resto en cuotas?","Usado más ahorro más cuotas","Tres formas de pago","Auto plata y financiación"]'::jsonb,'missing',null,false),
('c12.half_down','¿Mi auto sirve para completar el 50% de entrega?','["¿Mi auto sirve para completar el 50% de entrega?","La permuta cubre la mitad","Cuentan mi usado para el 50","Completo con mi auto"]'::jsonb,'missing',null,false),
('c12.no_extra_cash','¿Puedo cambiar el auto sin poner efectivo?','["¿Puedo cambiar el auto sin poner efectivo?","Entrego el mío sin plata","Cambio sin diferencia","No tengo para gastos"]'::jsonb,'missing',null,false),
('c12.old_car_no_credit','¿Tengo un auto viejo pero no califico para un banco?','["¿Tengo un auto viejo pero no califico para un banco?","Usado viejo sin crédito","Tengo permuta y mal Veraz","Auto viejo y cuotas"]'::jsonb,'missing',null,false),
('c12.savings_no_credit','¿Tengo algo ahorrado pero no accedo a financiación?','["¿Tengo algo ahorrado pero no accedo a financiación?","Tengo dos millones sin recibo","Poca entrega sin banco","Ahorro pero no califico"]'::jsonb,'missing',null,false),
('c12.no_savings','¿Puedo empezar sólo con una cuota y sin ahorro?','["¿Puedo empezar sólo con una cuota y sin ahorro?","Sin entrega","No tengo ahorro","Sólo puedo pagar por mes"]'::jsonb,'missing',null,false),
('c12.surplus','¿Qué pasa si mi permuta vale más que el auto que compro?','["¿Qué pasa si mi permuta vale más que el auto que compro?","Me queda saldo a favor","Mi usado cubre todo","Me devuelven la diferencia"]'::jsonb,'missing',null,false),
('c12.net_equity','¿Cómo descuentan la deuda que tiene mi permuta?','["¿Cómo descuentan la deuda que tiene mi permuta?","Mi auto tiene saldo de prenda","Cuánto queda neto","Deuda del usado"]'::jsonb,'missing',null,false),
('c13.available','¿Este auto se puede financiar?','["¿Este auto se puede financiar?","Hay cuotas","Financian","Aceptás financiación","¿Ofrece financiación?","¿Aceptás financiación?"]'::jsonb,'finance',null,false),
('c13.lender','¿Es crédito propio, bancario o de una financiera?','["¿Es crédito propio, bancario o de una financiera?","Quién presta la plata","Qué banco es","Crédito de la agencia"]'::jsonb,'missing',null,false),
('c13.full_finance','¿Puedo financiar el 100% del auto?','["¿Puedo financiar el 100% del auto?","Todo financiado","Sin anticipo","Cien por ciento con DNI"]'::jsonb,'missing',null,false),
('c13.minimum_downpayment','¿Cuál es la entrega mínima?','["¿Cuál es la entrega mínima?","Con cuánto retiro","Anticipo mínimo","Qué porcentaje entrego"]'::jsonb,'missing',null,false),
('c13.terms','¿En cuántas cuotas se puede pagar?','["¿En cuántas cuotas se puede pagar?","Doce dieciocho veinticuatro","Hasta cuántos meses","Hay 36 cuotas"]'::jsonb,'missing',null,false),
('c13.rates','¿Qué tasa y costo financiero tiene?','["¿Qué tasa y costo financiero tiene?","Qué interés cobran","Cuál es el CFT","Tasa mensual o anual"]'::jsonb,'missing',null,false),
('c13.fixed_or_variable','¿La cuota es fija, variable o ajustable?','["¿La cuota es fija, variable o ajustable?","Suben las cuotas","Es UVA","Queda siempre igual"]'::jsonb,'missing',null,false),
('c13.pledge','¿El crédito lleva prenda?','["¿El crédito lleva prenda?","Queda prendado","Sin prenda","El auto garantiza la deuda"]'::jsonb,'missing',null,false),
('c13.programmed','¿Es una compra inmediata, una búsqueda o un sistema programado?','["¿Es una compra inmediata, una búsqueda o un sistema programado?","Es un plan de ahorro","Cuándo elijo el auto","Se entrega al final"]'::jsonb,'missing',null,false),
('c13.interest_free','¿Hay una opción sin interés?','["¿Hay una opción sin interés?","Cuotas sin interés","Pago todo de a poco","Sin recargo"]'::jsonb,'missing',null,false),
('c14.dni','¿Se puede tramitar sólo con DNI?','["¿Se puede tramitar sólo con DNI?","Sólo DNI","Con el documento alcanza","Crédito con DNI"]'::jsonb,'missing',null,false),
('c14.payslip','¿Necesito recibo de sueldo?','["¿Necesito recibo de sueldo?","Piden bono de sueldo","Tengo trabajo en blanco","Cuántos bonos"]'::jsonb,'missing',null,false),
('c14.self_employed','¿Aceptan monotributistas o trabajadores independientes?','["¿Aceptan monotributistas o trabajadores independientes?","Soy monotributista","Trabajo por mi cuenta","Soy autónomo"]'::jsonb,'missing',null,false),
('c14.informal_income','¿Puedo solicitarlo sin recibo o con ingresos informales?','["¿Puedo solicitarlo sin recibo o con ingresos informales?","Trabajo en negro","No tengo bono","Sin sueldo registrado"]'::jsonb,'missing',null,false),
('c14.retired','¿Puede solicitarlo una persona jubilada o pensionada?','["¿Puede solicitarlo una persona jubilada o pensionada?","Soy jubilado","Crédito con jubilación","Pensión"]'::jsonb,'missing',null,false),
('c14.guarantee_person','¿Necesito garante y qué tiene que presentar?','["¿Necesito garante y qué tiene que presentar?","Dos garantes","Puede salir mi mamá de garante","Sin garante"]'::jsonb,'missing',null,false),
('c14.credit_history','¿Puedo consultar si estoy en Veraz o tengo atrasos?','["¿Puedo consultar si estoy en Veraz o tengo atrasos?","Tengo mal Veraz","Estoy en situación tres","Me rechazó un banco"]'::jsonb,'missing',null,false),
('c14.income_amount','¿Cuánto tengo que ganar para esa cuota?','["¿Cuánto tengo que ganar para esa cuota?","Sueldo mínimo","Me alcanza mi ingreso","Relación cuota ingreso"]'::jsonb,'missing',null,false),
('c14.coapplicant','¿Puedo sumar ingresos o tramitarlo con otra persona?','["¿Puedo sumar ingresos o tramitarlo con otra persona?","Usar otro DNI","Sumar sueldo de mi pareja","Crédito con dos titulares"]'::jsonb,'missing',null,false),
('c14.age_residence','¿Hay requisitos de edad, domicilio o antigüedad laboral?','["¿Hay requisitos de edad, domicilio o antigüedad laboral?","Hasta qué edad","Soy de otra provincia","Antigüedad en el trabajo"]'::jsonb,'missing',null,false),
('c15.monthly_payment','¿De cuánto me queda la cuota?','["¿De cuánto me queda la cuota?","Cuánto por mes","Simulame la financiación","Cuota con mi entrega"]'::jsonb,'missing',null,false),
('c15.compare','¿Podés comparar distintos plazos o entregas?','["¿Podés comparar distintos plazos o entregas?","Doce contra veinticuatro","Si pongo más cuánto baja","Qué opción conviene"]'::jsonb,'missing',null,false),
('c15.first_payment','¿Cuándo pago la primera y la segunda cuota?','["¿Cuándo pago la primera y la segunda cuota?","Primera cuota al retirar","Cuándo vence","Segunda cuota a los treinta días"]'::jsonb,'missing',null,false),
('c15.included_insurance','¿La cuota incluye seguro y gastos?','["¿La cuota incluye seguro y gastos?","Cuota final","Seguro incluido","Hay cargos por fuera"]'::jsonb,'missing',null,false),
('c15.approval','¿La simulación significa que ya estoy aprobado?','["¿La simulación significa que ya estoy aprobado?","Con esta cuota ya califico","Me aprobaron en el chat","Ya tengo el crédito"]'::jsonb,'static','Una simulación no es una aprobación. El responsable debe confirmar las condiciones y evaluar la operación.',false),
('c15.early_payment','¿Puedo adelantar cuotas o cancelar antes?','["¿Puedo adelantar cuotas o cancelar antes?","Cancelación anticipada","Adelantar capital","Pago todo antes"]'::jsonb,'missing',null,false),
('c15.late_payment','¿Qué pasa si me atraso?','["¿Qué pasa si me atraso?","Intereses por mora","No llego a pagar","Pago fuera de fecha"]'::jsonb,'missing',null,false),
('c15.insurer','¿Puedo elegir aseguradora o cobertura?','["¿Puedo elegir aseguradora o cobertura?","Qué seguro me obligan","Cambio de seguro","Seguro contra todo riesgo"]'::jsonb,'missing',null,false),
('c15.quote_expired','¿Me mantienen una cuota que me cotizaron antes?','["¿Me mantienen una cuota que me cotizaron antes?","Ayer era más baja","Me respetan la simulación","Venció la propuesta"]'::jsonb,'missing',null,false),
('c15.credit_declined','¿Qué pasa con mi dinero si no aprueban el crédito?','["¿Qué pasa con mi dinero si no aprueban el crédito?","Si no sale me devuelven","Rechazo de financiación","Aprobación insuficiente"]'::jsonb,'missing',null,false),
('c16.registered_owner','¿Está a nombre de quien lo vende?','["¿Está a nombre de quien lo vende?","Es titular","Titular directo","Coincide el dueño"]'::jsonb,'missing',null,false),
('c16.title_card','¿Tiene título y cédula?','["¿Tiene título y cédula?","Papeles al día","Tiene todos los papeles","Título digital"]'::jsonb,'missing',null,false),
('c16.form08','¿Tiene el formulario 08 y quién debe firmar?','["¿Tiene el formulario 08 y quién debe firmar?","08 firmado","08 en blanco","Firmamos en el registro"]'::jsonb,'missing',null,false),
('c16.domain_report','¿Se puede consultar un informe de dominio?','["¿Se puede consultar un informe de dominio?","Informe del auto","Tiene embargo","Está inhibido el titular"]'::jsonb,'missing',null,false),
('c16.physical_verification','¿Tiene verificación física o policial?','["¿Tiene verificación física o policial?","Verificación 12","Grabado motor y chasis","Verificación policial"]'::jsonb,'missing',null,false),
('c16.representation','¿Puede vender un apoderado o familiar?','["¿Puede vender un apoderado o familiar?","Vende el hijo","Tiene poder","El dueño no puede venir"]'::jsonb,'missing',null,false),
('c16.inheritance','¿Se puede comprar si el titular falleció?','["¿Se puede comprar si el titular falleció?","Está en sucesión","Murió el dueño","Vende un heredero"]'::jsonb,'missing',null,false),
('c16.pledge_obstacle','¿Tiene prenda, embargo o restricciones?','["¿Tiene prenda, embargo o restricciones?","Está prendado","Tiene impedimentos","Se puede transferir"]'::jsonb,'missing',null,false),
('c16.business_owner','¿Qué cambia si lo vende o compra una empresa?','["¿Qué cambia si lo vende o compra una empresa?","Auto de una sociedad","Facturar a mi empresa","Compra con CUIT"]'::jsonb,'missing',null,false),
('c16.coowners','¿Deben intervenir cónyuge o cotitulares?','["¿Deben intervenir cónyuge o cotitulares?","Firma la esposa","Hay dos titulares","Consentimiento del cónyuge"]'::jsonb,'missing',null,false),
('c17.vehicle_tax','¿Debe patentes o impuestos?','["¿Debe patentes o impuestos?","Patente al día","Tiene deuda de patente","Impuesto automotor"]'::jsonb,'missing',null,false),
('c17.fines','¿Tiene multas o infracciones?','["¿Tiene multas o infracciones?","Multas pendientes","Libre deuda de multas","Infracciones en otra provincia"]'::jsonb,'missing',null,false),
('c17.who_pays','¿Quién paga las deudas anteriores?','["¿Quién paga las deudas anteriores?","Me hacen cargo de multas","Patentes hasta la entrega","Quién cancela la deuda"]'::jsonb,'missing',null,false),
('c17.clearance','¿Entregan comprobantes de cancelación de deudas?','["¿Entregan comprobantes de cancelación de deudas?","Constancia de pago de patente","Libre deuda","Comprobantes de multas"]'::jsonb,'missing',null,false),
('c17.lift_pledge','¿Cómo se resuelve una prenda antes de cerrar?','["¿Cómo se resuelve una prenda antes de cerrar?","Levantar la prenda","Cancelar crédito del dueño","Liberar el auto"]'::jsonb,'missing',null,false),
('c17.registration_payer','¿Quién paga y gestiona la transferencia?','["¿Quién paga y gestiona la transferencia?","Se encargan del trámite","Transferencia a cargo de quién","Gestor incluido"]'::jsonb,'missing',null,false),
('c17.timing','¿Cuánto demora ponerlo a mi nombre?','["¿Cuánto demora ponerlo a mi nombre?","Tiempo de transferencia","Cuántos días tarda el registro","Cuándo sale el título"]'::jsonb,'missing',null,false),
('c17.other_province','¿Lo puedo transferir o radicar en otra provincia?','["¿Lo puedo transferir o radicar en otra provincia?","Cambio de radicación","Compro desde otra provincia","Lo radico donde vivo"]'::jsonb,'missing',null,false),
('c17.rto_vtv','¿Tiene RTO o VTV vigente?','["¿Tiene RTO o VTV vigente?","Revisión técnica","RTO al día","VTV vencida"]'::jsonb,'missing',null,false),
('c17.transfer_completed','¿Con el 08 firmado ya está transferido?','["¿Con el 08 firmado ya está transferido?","Ya firmé entonces es mío","Me dieron el 08","Cómo sé que terminó"]'::jsonb,'missing',null,false),
('c18.auto_check','¿Qué significa el auto check de Velox?','["¿Qué significa el auto check de Velox?","Está certificado","Lo revisó Velox","Qué es el chequeo"]'::jsonb,'static','El auto check muestra el estado declarado por el vendedor. No es una inspección independiente ni una certificación mecánica.',false),
('c18.independent','¿Tiene una revisión de un mecánico independiente?','["¿Tiene una revisión de un mecánico independiente?","Lo vio un mecánico","Informe técnico real","Revisión profesional"]'::jsonb,'missing',null,false),
('c18.mechanic','¿Puedo llevar a mi mecánico?','["¿Puedo llevar a mi mecánico?","Voy con mecánico","Lo puede mirar mi taller","Revisión antes de comprar"]'::jsonb,'missing',null,false),
('c18.test_drive','¿Lo puedo probar o escanear?','["¿Lo puedo probar o escanear?","Hacemos una vuelta","Lo puedo escanear","Prueba de manejo"]'::jsonb,'missing',null,false),
('c18.check_scope','¿Qué partes se revisaron y cuáles no?','["¿Qué partes se revisaron y cuáles no?","Qué incluye el informe","Revisaron la batería","Vieron abajo del auto"]'::jsonb,'missing',null,false),
('c18.score','¿El puntaje garantiza que el auto está bien?','["¿El puntaje garantiza que el auto está bien?","Tiene nueve de diez","Score excelente","Es seguro por el puntaje"]'::jsonb,'static','El porcentaje de calidad mide qué tan completa está la publicación; no garantiza el estado mecánico del auto.',false),
('c18.warranty','¿Tiene garantía y qué cubre?','["¿Tiene garantía y qué cubre?","Cuánta garantía dan","Garantía de motor y caja","Cuánto dura"]'::jsonb,'missing',null,false),
('c18.as_is','¿Qué significa que lo venden en el estado en que está?','["¿Qué significa que lo venden en el estado en que está?","Sin garantía","Se vende como está","No se aceptan reclamos"]'::jsonb,'missing',null,false),
('c18.discrepancy','¿Qué pasa si el auto no coincide con la publicación?','["¿Qué pasa si el auto no coincide con la publicación?","Ocultaron una falla","No es lo publicado","Los kilómetros no coinciden"]'::jsonb,'missing',null,false),
('c18.post_sale_issue','¿A quién recurro si aparece un problema después de comprar?','["¿A quién recurro si aparece un problema después de comprar?","Se rompió después","Quiero reclamar","Falla luego de la entrega"]'::jsonb,'missing',null,false),
('c19.request_visit','¿Cuándo puedo ir a verlo?','["¿Cuándo puedo ir a verlo?","Quiero verlo","Me interesa ir","Coordinar visita","¿Cuándo se puede visitar?"]'::jsonb,'static','Podés proponer uno de tus horarios con Asistente para coordinar. La visita requiere que ambas partes acepten los mismos datos; este mensaje no agenda nada.',false),
('c19.today_tomorrow','¿Puedo verlo hoy o mañana?','["¿Puedo verlo hoy o mañana?","Voy hoy","Mañana se puede","Tenés un turno hoy"]'::jsonb,'static','Usá Asistente para coordinar para proponer fecha, hora, duración y lugar. No hay un horario confirmado hasta completar el acuerdo de ambas partes.',false),
('c19.hours','¿Qué horarios tienen?','["¿Qué horarios tienen?","Atienden sábado","Están ahora","Horario de atención","¿Qué horarios hay?"]'::jsonb,'hours',null,false),
('c19.meeting_place','¿Dónde nos encontramos?','["¿Dónde nos encontramos?","Pasame ubicación","Dirección para verlo","Voy a la agencia"]'::jsonb,'static','El lugar se acuerda en la propuesta de visita de esta conversación. No publicamos una dirección exacta mediante respuestas generales.',false),
('c19.confirmed','¿La visita ya quedó confirmada?','["¿La visita ya quedó confirmada?","Está agendado","Entonces voy","Ya tengo turno"]'::jsonb,'static','Consultá el estado en la agenda de esta conversación. Una propuesta no es una visita confirmada; este texto no cambia su estado.',false),
('c19.reschedule','¿Puedo cambiar el día o la hora?','["¿Puedo cambiar el día o la hora?","Reprogramar","Paso más tarde","No llego a esa hora"]'::jsonb,'static','Revisá la agenda y acordá una nueva propuesta con el otro participante. Este mensaje no modifica ni confirma el horario.',false),
('c19.cancel','¿Cómo cancelo la visita?','["¿Cómo cancelo la visita?","No voy a poder","Cancelá el turno","Dejemos sin efecto"]'::jsonb,'static','Usá la acción Cancelar de la agenda cuando esté disponible para tu visita. Este mensaje no cancela la reunión.',false),
('c19.video_call','¿Podemos hacer una videollamada?','["¿Podemos hacer una videollamada?","Lo veo por video","Me mostrás el auto por cámara","Video llamada"]'::jsonb,'missing',null,false),
('c19.phone_call','¿Me puede llamar el vendedor?','["¿Me puede llamar el vendedor?","Llamame","Prefiero por teléfono","Que me llame alguien"]'::jsonb,'missing',null,false),
('c19.no_show','¿Qué hago si llegué y no hay nadie?','["¿Qué hago si llegué y no hay nadie?","Estoy en la puerta","El vendedor no vino","No atiende"]'::jsonb,'missing',null,false),
('c20.immediate','¿Me lo puedo llevar en el día?','["¿Me lo puedo llevar en el día?","Retiro inmediato","Pago y me lo llevo","Entrega hoy"]'::jsonb,'missing',null,false),
('c20.reservation','¿Cómo lo reservo y cuánto seña piden?','["¿Cómo lo reservo y cuánto seña piden?","Lo puedo señar","Cuánto para reservar","Me lo guardás"]'::jsonb,'missing',null,false),
('c20.reservation_refund','¿La seña se devuelve si no compro?','["¿La seña se devuelve si no compro?","Pierdo la seña","Cancelación de reserva","Me devuelven la reserva"]'::jsonb,'missing',null,false),
('c20.handover_documents','¿Qué me entregan junto con el auto?','["¿Qué me entregan junto con el auto?","Papeles al retirar","Acta de entrega","Qué recibo al llevarlo"]'::jsonb,'missing',null,false),
('c20.insurance_start','¿Cuándo tengo que contratar el seguro?','["¿Cuándo tengo que contratar el seguro?","Seguro antes de retirarlo","Salgo asegurado","Desde cuándo cubre"]'::jsonb,'missing',null,false),
('c20.shipping','¿Lo pueden enviar o traer a otra ciudad?','["¿Lo pueden enviar o traer a otra ciudad?","Envían al interior","Transporte del auto","Me lo llevan"]'::jsonb,'missing',null,false),
('c20.remote_purchase','¿Puedo comprarlo sin viajar primero?','["¿Puedo comprarlo sin viajar primero?","Compra a distancia","Todo online","Soy de otra provincia"]'::jsonb,'missing',null,false),
('c20.payment_verified','¿Ya recibieron mi transferencia?','["¿Ya recibieron mi transferencia?","Mandé el comprobante","Ya te pagué","Se acreditó"]'::jsonb,'missing',null,false),
('c20.delivery_date','¿Cuándo me entregan si el auto lo tienen que buscar?','["¿Cuándo me entregan si el auto lo tienen que buscar?","Búsqueda a pedido","Entrega en treinta días","Todavía no eligieron la unidad"]'::jsonb,'missing',null,false),
('c20.platform_protection','¿Velox guarda el dinero o garantiza la operación?','["¿Velox guarda el dinero o garantiza la operación?","Pago protegido","Tiene escrow","Velox me cubre la compra"]'::jsonb,'static','Velox no recibe ni custodia el dinero de la compra en esta versión. Una conversación o una visita no garantizan la operación.',false),
('c21.family','¿Sirve para mi familia y para llevar chicos?','["¿Sirve para mi familia y para llevar chicos?","Auto familiar","Para cinco personas","Para llevar niños"]'::jsonb,'missing',null,false),
('c21.work_platforms','¿Me sirve para trabajar o para aplicaciones de viajes?','["¿Me sirve para trabajar o para aplicaciones de viajes?","Sirve para Uber","Para Cabify","Para remis"]'::jsonb,'missing',null,false),
('c21.pickup_load','¿Sirve para carga, remolque o trabajo rural?','["¿Sirve para carga, remolque o trabajo rural?","Cuánto remolca","Para trabajar en finca","Para llevar carga"]'::jsonb,'missing',null,false),
('c21.consumption','¿Cuánto consume?','["¿Cuánto consume?","Cuánto gasta","Es económico","Consumo en ruta"]'::jsonb,'missing',null,false),
('c21.city_road','¿Conviene para ciudad, ruta o caminos difíciles?','["¿Conviene para ciudad, ruta o caminos difíciles?","Para viajar","Para usar en la ciudad","Para caminos de tierra"]'::jsonb,'missing',null,false),
('c21.maintenance_cost','¿Es caro de mantener?','["¿Es caro de mantener?","Repuestos caros","Costo de mantenimiento","Qué gasto mensual tiene"]'::jsonb,'missing',null,false),
('c21.parts','¿Se consiguen repuestos y servicio técnico?','["¿Se consiguen repuestos y servicio técnico?","Hay repuestos","Dónde se arregla","Red de talleres"]'::jsonb,'missing',null,false),
('c21.compare_cars','¿Cuál me conviene entre estos dos autos?','["¿Cuál me conviene entre estos dos autos?","Comparame los dos","Cuál elegirías","Qué cambia entre ambos"]'::jsonb,'missing',null,false),
('c21.search_request','¿Me pueden buscar un auto que no esté publicado?','["¿Me pueden buscar un auto que no esté publicado?","Búsqueda personalizada","Consiguen un modelo","Lo buscan a pedido"]'::jsonb,'missing',null,false),
('c21.lower_budget','¿Hay una alternativa más económica o una moto?','["¿Hay una alternativa más económica o una moto?","Algo más barato","No llego a ese auto","Me conviene una moto"]'::jsonb,'missing',null,false),
('c22.who_can_publish','¿Quién puede publicar en Velox?','["¿Quién puede publicar en Velox?","Pueden publicar particulares","Se puede registrar una agencia","Soy revendedor"]'::jsonb,'static','Pueden publicar particulares, revendedores y agencias con una cuenta habilitada.',false),
('c22.registration','¿Qué necesito para registrarme como vendedor?','["¿Qué necesito para registrarme como vendedor?","Crear cuenta","Cómo me registro","Alta de agencia"]'::jsonb,'missing',null,false),
('c22.required_fields','¿Qué información tengo que cargar de un auto?','["¿Qué información tengo que cargar de un auto?","Cómo publico","Datos obligatorios","Qué pide la ficha"]'::jsonb,'static','Cargá marca, modelo, año, kilómetros, precio en pesos argentinos, zona, fotos y el estado que conocés del vehículo. No declares como comprobado lo que desconocés.',false),
('c22.photos','¿Qué fotos y videos conviene subir?','["¿Qué fotos y videos conviene subir?","Cuántas fotos","Qué imágenes pongo","Video del auto"]'::jsonb,'missing',null,false),
('c22.auto_check_entry','¿Cómo completo el auto check sin ser mecánico?','["¿Cómo completo el auto check sin ser mecánico?","No sé mecánica","Cómo declaro el estado","No conozco una falla"]'::jsonb,'static','Completá el auto check con lo que conocés y observás. Es una declaración del vendedor; no reemplaza una revisión mecánica.',false),
('c22.commercial_rules','¿Puedo decidir si acepto permuta o financiación?','["¿Puedo decidir si acepto permuta o financiación?","Configurar condiciones","Yo no financio","Sólo vendo contado"]'::jsonb,'missing',null,false),
('c22.edit_listing','¿Puedo corregir precio, kilómetros o información?','["¿Puedo corregir precio, kilómetros o información?","Editar publicación","Cambiar precio","Corregir un dato"]'::jsonb,'static','En Mis publicaciones podés corregir los datos de tu auto. Revisá los cambios antes de guardarlos.',false),
('c22.pause_sold','¿Cómo pauso una publicación o marco que se vendió?','["¿Cómo pauso una publicación o marco que se vendió?","Sacar de venta","Pausar el auto","Marcar vendido"]'::jsonb,'static','En Mis publicaciones podés pausar o retirar el aviso para dejar de ofrecerlo. Una publicación retirada no prueba una venta.',false),
('c22.consigned','¿Puedo publicar autos propios y en consignación?','["¿Puedo publicar autos propios y en consignación?","Vehículo de un cliente","Publicar por un tercero","Propio o consignado"]'::jsonb,'missing',null,false),
('c22.missing_answer','¿Qué pasa cuando un comprador pregunta algo que no cargué?','["¿Qué pasa cuando un comprador pregunta algo que no cargué?","La IA no sabe algo","Preguntas pendientes","Responder al interesado"]'::jsonb,'missing',null,false),
('c23.ai_identity','¿Estoy hablando con una IA o con una persona?','["¿Estoy hablando con una IA o con una persona?","Sos un robot","Quién me contesta","Es automático"]'::jsonb,'static','Los mensajes marcados Asistente VELOX son respuestas automáticas. Los demás mensajes pertenecen al participante que los envió.',false),
('c23.human','¿Puedo pedir atención humana?','["¿Puedo pedir atención humana?","Quiero una persona","Pasame con alguien","No quiero hablar con el bot"]'::jsonb,'static','Podés escribirle al vendedor en este chat. Eso no significa que esté conectado ni que ya haya leído tu mensaje.',false),
('c23.personal_data','¿Para qué me piden mis datos?','["¿Para qué me piden mis datos?","Por qué necesitan mi teléfono","Para qué el DNI","Qué hacen con mis datos"]'::jsonb,'missing',null,false),
('c23.share_with_seller','¿El vendedor ve todos mis datos?','["¿El vendedor ve todos mis datos?","Quién ve mi número","Comparten mi información","Datos privados"]'::jsonb,'missing',null,false),
('c23.correct_data','¿Cómo corrijo un dato que di mal?','["¿Cómo corrijo un dato que di mal?","Me equivoqué de presupuesto","Mi nombre está mal","Corregir mi vehículo"]'::jsonb,'static','Podés aclarar el dato en este chat. Eso no modifica automáticamente los datos de tu cuenta ni la publicación.',false),
('c23.opt_out','¿Cómo dejo de recibir mensajes?','["¿Cómo dejo de recibir mensajes?","No me escriban más","Baja","No quiero seguimiento"]'::jsonb,'static','Podés usar Bloquear en este chat para impedir nuevos mensajes en esta conversación. Esta respuesta no ejecuta el bloqueo ni elimina tu cuenta.',false),
('c23.privacy_rights','¿Puedo acceder a mis datos o pedir su eliminación?','["¿Puedo acceder a mis datos o pedir su eliminación?","Borrar mis datos","Eliminar cuenta","Ver qué guardaron"]'::jsonb,'missing',null,false),
('c23.report_listing','¿Cómo denuncio una publicación falsa o sospechosa?','["¿Cómo denuncio una publicación falsa o sospechosa?","Es una estafa","Auto duplicado","Publicación engañosa"]'::jsonb,'missing',null,false),
('c23.complaint','¿Dónde hago un reclamo por una reserva o una compra?','["¿Dónde hago un reclamo por una reserva o una compra?","Quiero quejarme","No me devuelven el dinero","Reclamo de compra"]'::jsonb,'missing',null,false),
('c23.audio_images','¿Puedo mandar audios, fotos o documentos por el chat?','["¿Puedo mandar audios, fotos o documentos por el chat?","Te mando audio","Mirá esta foto","Subo el recibo"]'::jsonb,'static','Este chat admite mensajes de texto. No procesa audios, comprobantes ni documentos adjuntos en esta versión.',false),
('c24.launch_window','¿Cuánto dura la promoción gratuita?','["¿Cuánto dura la promoción gratuita?","Noventa días gratis","Tres meses sin costo","Hasta cuándo es gratis"]'::jsonb,'static','La promoción definida dura 90 días desde una fecha común de lanzamiento para todos. Consultá las fechas y cupos configurados en la sección Créditos.',false),
('c24.late_registration','¿Tengo 90 días propios si me registro después del lanzamiento?','["¿Tengo 90 días propios si me registro después del lanzamiento?","Me anoto más tarde","Noventa días desde mi registro","Cuánto me queda de promoción"]'::jsonb,'static','La fecha de fin es común: registrarte después no inicia otros 90 días. Consultá el período vigente en Créditos.',false),
('c24.credit_allowance','¿Cuántos créditos recibe cada tipo de vendedor?','["¿Cuántos créditos recibe cada tipo de vendedor?","Créditos para agencia","Cupo particular","Qué recibe una reventa"]'::jsonb,'missing',null,false),
('c24.what_spends','¿Los créditos se gastan al publicar, al usar IA o en ambas cosas?','["¿Los créditos se gastan al publicar, al usar IA o en ambas cosas?","Qué consume créditos","Cobran las preguntas","Me descuentan por publicación"]'::jsonb,'static','La política comercial definitiva de consumo está pendiente. No hay cobros automáticos. Consultá las condiciones del lanzamiento antes de publicar.',false),
('c24.faq_cost','¿Una respuesta automática consume tokens de IA?','["¿Una respuesta automática consume tokens de IA?","FAQ gasta IA","Las preguntas rápidas consumen","Cuesta cada respuesta"]'::jsonb,'static','Las respuestas por reglas y datos no llaman a un modelo de IA. Los créditos comerciales de Velox se definen por separado del consumo del proveedor.',false),
('c24.balance','¿Dónde veo mi saldo y por qué se descontaron créditos?','["¿Dónde veo mi saldo y por qué se descontaron créditos?","Historial de consumo","Me faltan créditos","Qué se cobró"]'::jsonb,'missing',null,false),
('c24.exhausted','¿Qué pasa si se terminan mis créditos gratuitos?','["¿Qué pasa si se terminan mis créditos gratuitos?","Me quedé sin saldo","Se apaga el asistente","Tengo que pagar ahora"]'::jsonb,'missing',null,false),
('c24.after_promotion','¿Después se empieza a cobrar automáticamente?','["¿Después se empieza a cobrar automáticamente?","Cuánto cuesta al terminar","Se renueva solo","Cobran después de los noventa días"]'::jsonb,'static','No se cobra automáticamente. Al terminar, administración decide si ofrece créditos pagos o extiende otros tres meses gratis; la extensión debe quedar registrada.',false),
('c24.paid_services','¿La promoción incluye informes, revisiones o compra protegida?','["¿La promoción incluye informes, revisiones o compra protegida?","Incluye mecánico","Dominio gratis","Servicios extra incluidos"]'::jsonb,'missing',null,false),
('c24.admin_metrics','¿Qué resultados puede ver la administración?','["¿Qué resultados puede ver la administración?","Métricas del embudo","Usuarios y publicaciones","Visitas y uso de IA"]'::jsonb,'missing',null,false);

create table velox_private.faq_requests(
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 question_id text not null references velox_private.faq_catalog(id),
 state text not null default 'pending' check(state in ('pending','known','uncertain','unknown')),
 answer text check(length(answer)<=600), revision integer not null default 0,
 updated_at timestamptz not null default now(),
 primary key(vehicle_id,question_id)
);
alter table velox_private.faq_requests enable row level security;
revoke all on velox_private.faq_requests from public,anon,authenticated;
create table velox_private.faq_answer_history(
 vehicle_id uuid not null references public.vehicles(id) on delete cascade,
 question_id text not null, revision integer not null, actor uuid not null,
 state text not null, answer text, recorded_at timestamptz not null default clock_timestamp(),
 primary key(vehicle_id,question_id,revision)
);
alter table velox_private.faq_answer_history enable row level security;
revoke all on velox_private.faq_answer_history from public,anon,authenticated;

create function velox_private.faq_normalize(value text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(translate(pg_catalog.normalize(lower(value),'NFC'),'áéíóúü','aeiouu'),'[^a-z0-9ñ ]',' ','g'))
$$;
revoke all on function velox_private.faq_normalize(text) from public,anon,authenticated;

create function velox_private.faq_match(value text) returns text language plpgsql stable set search_path='' as $$
declare normalized text; matches text[];
begin
 normalized:=regexp_replace(velox_private.faq_normalize(value),'\s+',' ','g');
 select array_agg(distinct c.id) into matches from velox_private.faq_catalog c,
  lateral jsonb_array_elements_text(c.aliases) a where regexp_replace(velox_private.faq_normalize(a),'\s+',' ','g')=normalized;
 if cardinality(matches)=1 then return matches[1]; end if;
 if cardinality(matches)>1 then return null; end if;
 if normalized ~ '^(mi |el mio |yo |tengo |no quiero |no acepto )' then return null;end if;
 -- Intentionally narrow. Statements about the buyer, negation and arbitrary
 -- substrings never become declarations about the advertised vehicle.
 if normalized ~ '^(hola )?(sigue|esta|todavia esta) disponible$' then return 'c01.available'; end if;
 if normalized ~ '^(cuantos )?(kilometros|km)( tiene)?$' then return 'c02.mileage'; end if;
 if normalized ~ '^(aceptas|aceptan) permutas?$' or normalized ~ '^(tomas|toman) (un|una) (auto|usado|vehiculo|gol|corsa|clio)( [0-9]{4})?$' then return 'c10.accept_trade'; end if;
 if normalized ~ '^(donde|en que zona) (esta|se puede ver)( el auto| el vehiculo)?$' then return 'c01.public_location'; end if;
 if normalized ~ '^((estas|esta|sigue) disponible|puedo verlo) (el |hoy|mañana)' then return 'c19.request_visit'; end if;
 return null;
end; $$;
revoke all on function velox_private.faq_match(text) from public,anon,authenticated;

create function velox_private.resolve_faq(target_vehicle uuid, message_body text) returns text
language plpgsql volatile set search_path='' as $$
declare v public.vehicles%rowtype; item velox_private.faq_catalog%rowtype;
 saved velox_private.faq_requests%rowtype; matched text; ids text[]:='{}'; part text;
 result text[]:='{}'; answer text; unknown_part boolean:=false; val text; parts text[]; subpart text;
begin
 select * into v from public.vehicles where id=target_vehicle;
 if not found then return null; end if;
 matched:=velox_private.faq_match(message_body);
 if matched is not null then ids:=array[matched];
 else
  parts:=regexp_split_to_array(message_body,'[?,;¿]+');
  if cardinality(parts)>24 then return 'Para responder con claridad, dividí el mensaje en menos preguntas. El vendedor puede leer el mensaje completo.';end if;
  foreach part in array parts loop
   if nullif(btrim(part),'') is null then continue; end if;
   if velox_private.faq_normalize(part) ~ '^(mi |el mio |yo |tengo |no quiero |no acepto )' then unknown_part:=true;continue;end if;
   matched:=velox_private.faq_match(part);
   if matched is null then
    if cardinality(regexp_split_to_array(part,'\s+[yY]\s+'))>16 then unknown_part:=true;continue;end if;
    for subpart in select regexp_split_to_table(part,'\s+[yY]\s+') loop
     matched:=velox_private.faq_match(subpart);
     if matched is null then unknown_part:=true;
     elsif not matched=any(ids) then ids:=array_append(ids,matched);end if;
    end loop;
   elsif not matched=any(ids) then ids:=array_append(ids,matched); end if;
  end loop;
 end if;
 if cardinality(ids)=0 then return null; end if;
 if cardinality(ids)>8 then ids:=ids[1:8];unknown_part:=true;end if;
 foreach matched in array ids loop
  select * into item from velox_private.faq_catalog where id=matched;
  answer:=null;
  case item.kind
   when 'static' then answer:=item.answer;
   when 'availability' then answer:=case when v.status='active' then 'La publicación está activa en Velox. El vendedor debe confirmar la disponibilidad actual.' else 'La publicación no está activa. El vendedor debe confirmar la disponibilidad actual.' end;
   when 'price' then answer:='Precio publicado: ARS $'||trim(to_char(v.price,'FM999G999G999G999'))||'. Los gastos adicionales deben confirmarse con el vendedor.';
   when 'currency' then answer:='El precio de esta publicación está cargado en pesos argentinos (ARS). Otra moneda requiere acuerdo con el vendedor.';
   when 'mileage' then answer:='La publicación declara '||trim(to_char(v.kilometers,'FM999G999G999'))||' km. Es un dato declarado por el vendedor, no una certificación.';
   when 'year' then answer:='Marca y modelo declarados: '||v.brand||' '||v.model||'. Año declarado: '||v.year||'.';
   when 'version' then answer:='Versión declarada: '||nullif(btrim(v.version),'')||'.';
   when 'zone' then answer:='Zona pública: '||v.zone||'. El lugar exacto se acuerda en la agenda de la conversación.';
   when 'trade' then answer:=case when v.accepts_trade is true then 'El vendedor indicó que acepta evaluar permutas. La aceptación de tu unidad y su valor deben confirmarse después de revisarla.' when v.accepts_trade is false then 'El vendedor indicó que no acepta permuta para esta publicación.' else null end;
   when 'finance' then answer:=case when v.accepts_financing is true then 'La publicación indica que se pueden conversar opciones de financiación. No hay aprobación, tasa ni cuota confirmada por esta respuesta.' when v.accepts_financing is false then 'La publicación no ofrece financiación actualmente.' else null end;
   when 'hours' then answer:='Horarios declarados: '||nullif(btrim(v.available_hours),'')||'. Usá la agenda para proponer una visita; estos horarios no confirman un turno.';
   else
    if item.kind like 'check:%' then
     val:=v.checklist->>split_part(item.kind,':',2);
     if nullif(btrim(val),'') is not null then answer:='Según el auto check, el vendedor declaró: '||left(val,300)||'. No es una revisión independiente. Consultá al vendedor por los detalles adicionales.'; end if;
    end if;
  end case;
  if answer is null and item.reusable then
   insert into velox_private.faq_requests(vehicle_id,question_id) values(v.id,item.id) on conflict do nothing;
   select * into saved from velox_private.faq_requests where vehicle_id=v.id and question_id=item.id;
   if saved.state='known' then answer:='El vendedor declaró para esta unidad: '||saved.answer||' (cargado el '||to_char(saved.updated_at at time zone 'UTC','YYYY-MM-DD')||'). No es una verificación independiente.';
   elsif saved.state='uncertain' then answer:='Información incierta declarada por el vendedor: '||saved.answer||'. Requiere confirmación.';
   elsif saved.state='unknown' then answer:='El vendedor declaró que desconoce este dato. No debe interpretarse como ausencia de problemas.';
   else answer:='Falta información sobre esta pregunta. Quedó registrada en las consultas pendientes de la unidad para que el vendedor la complete. No confirma que la haya leído.';
   end if;
  end if;
  if answer is null then answer:='Este dato o condición no está confirmado por el asistente. Consultalo con el vendedor en este chat; esta respuesta no confirma pagos, financiación, garantías ni acciones.';end if;
  result:=array_append(result,item.question||E'\n'||answer);
 end loop;
 if unknown_part then result:=array_append(result,'El resto de tu mensaje requiere respuesta del vendedor. No lo doy por resuelto con estas respuestas.');end if;
 return array_to_string(result,E'\n\n');
end; $$;
revoke all on function velox_private.resolve_faq(uuid,text) from public,anon,authenticated;

create function public.get_listing_faq_tasks(target_vehicle uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not velox_private.is_active_seller() or not exists(select 1 from public.vehicles where id=target_vehicle and owner_id=auth.uid()) then
  raise exception 'Solo el vendedor de esta unidad puede consultar estas preguntas' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('question_id',r.question_id,'question',c.question,'state',r.state,'answer',r.answer,'revision',r.revision,'updated_at',r.updated_at) order by r.updated_at desc)
 from velox_private.faq_requests r join velox_private.faq_catalog c on c.id=r.question_id where r.vehicle_id=target_vehicle),'[]'::jsonb);
end; $$;
revoke all on function public.get_listing_faq_tasks(uuid) from public,anon;
grant execute on function public.get_listing_faq_tasks(uuid) to authenticated;

create function public.answer_listing_faq(target_vehicle uuid,question_id text,next_state text,answer_text text,expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved velox_private.faq_requests%rowtype;
begin
 perform 1 from public.vehicles where id=target_vehicle and owner_id=auth.uid() for update;
 if not found or not velox_private.is_active_seller() then raise exception 'Solo el vendedor puede responder' using errcode='42501';end if;
 if not exists(select 1 from velox_private.faq_catalog c where c.id=question_id and c.reusable) then raise exception 'Pregunta no habilitada para datos reutilizables' using errcode='23514';end if;
 if next_state is null or next_state not in ('known','uncertain','unknown') or
  (next_state<>'unknown' and (nullif(btrim(answer_text),'') is null or length(answer_text)>600)) then
  raise exception 'Respuesta o estado inválido' using errcode='23514';end if;
 select * into saved from velox_private.faq_requests r where r.vehicle_id=target_vehicle and r.question_id=answer_listing_faq.question_id for update;
 if not found or saved.revision is distinct from expected_revision then raise exception 'La pregunta cambió. Actualizá antes de guardar.' using errcode='23514';end if;
 insert into velox_private.faq_answer_history(vehicle_id,question_id,revision,actor,state,answer)
 values(target_vehicle,question_id,saved.revision+1,auth.uid(),next_state,case when next_state='unknown' then null else btrim(answer_text) end);
 update velox_private.faq_requests r set state=next_state,answer=case when next_state='unknown' then null else btrim(answer_text) end,revision=r.revision+1,updated_at=clock_timestamp()
 where r.vehicle_id=target_vehicle and r.question_id=answer_listing_faq.question_id;
 return jsonb_build_object('question_id',question_id,'state',next_state,'revision',saved.revision+1);
end; $$;
revoke all on function public.answer_listing_faq(uuid,text,text,text,integer) from public,anon;
grant execute on function public.answer_listing_faq(uuid,text,text,text,integer) to authenticated;
create or replace function public.send_message_with_assistant(target_conversation uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.conversations%rowtype;
  vehicle_record public.vehicles%rowtype;
  assistant_enabled boolean;

  answer text;
  recognized boolean := true;
  sent_message public.messages%rowtype;
  automated_message public.messages%rowtype;
  next_message_at timestamptz;
begin
  if length(message_body)>2000 then raise exception 'Mensaje demasiado largo' using errcode='23514'; end if;
  if nullif(trim(message_body), '') is null then raise exception 'Mensaje invalido'; end if;
  select * into target from public.conversations
  where id = target_conversation and (buyer_id = auth.uid() or seller_id = auth.uid())
  for update;
  if not velox_private.can_send_message(target_conversation) then
    raise exception 'La cuenta o conversacion no tiene permiso para enviar mensajes' using errcode = '42501';
  end if;
  -- The conversation row is locked. Keep its ordering monotonic even when more
  -- than one send is executed in a transaction (now() would be identical).
  select greatest(clock_timestamp(),coalesce(max(created_at)+interval '1 microsecond',clock_timestamp()))
    into next_message_at from public.messages where conversation_id=target.id;
  insert into public.messages(conversation_id, sender_id, body, created_at)
  values (target.id, auth.uid(), trim(message_body), next_message_at) returning * into sent_message;
  if auth.uid() <> target.buyer_id then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;
  select * into vehicle_record from public.vehicles where id = target.vehicle_id;
  select coalesce(s.enabled, true) into assistant_enabled
  from (select 1) seed left join public.seller_assistant_settings s on s.user_id = target.seller_id;
  if not assistant_enabled then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;
  answer := velox_private.resolve_faq(target.vehicle_id,message_body);
  recognized := answer is not null;
  if recognized then
    insert into public.messages(conversation_id, sender_id, body, is_automated, created_at)
    values (target.id, target.seller_id, answer, true, next_message_at + interval '1 microsecond') returning * into automated_message;
  end if;
  return jsonb_build_object('message_id', sent_message.id, 'automated', recognized,
    'automated_message_id', automated_message.id);
end;
$$;

commit;
