"use client";

import {useId,useMemo,useState} from 'react';
import catalog from './catalog.json';

const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export default function FaqBrowser({onChoose,disabled=false}) {
 const id=useId();
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('');
 const matches=useMemo(()=>catalog.items.filter(item=>(!category || item.category===category)
  && normalize([item.question,...item.aliases].join(' ')).includes(normalize(query.trim()))),[query,category]);
 return <section className="faqBrowser" aria-label="Preguntas frecuentes">
  <h3>Encontrá tu pregunta</h3>
  <p>Buscá entre 240 preguntas. Las respuestas de cada auto dependen de sus datos y de lo que confirme su vendedor.</p>
  <div className="faqFilters">
   <label htmlFor={`${id}-search`}>Buscar una pregunta<input id={`${id}-search`} type="search" value={query} placeholder="Ej.: distribución, permuta, kilómetros" onChange={e=>setQuery(e.target.value)} /></label>
   <label htmlFor={`${id}-category`}>Categoría de preguntas<select id={`${id}-category`} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Todas las categorías</option>{catalog.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
  </div>
  <p role="status">{matches.length?`${matches.length} preguntas encontradas`:'No encontramos preguntas con ese filtro.'}</p>
  <div className="faqResults">
   {matches.map(item=><details key={item.id}>
    <summary>{item.question}</summary>
    <p>{item.kind==='static'?item.answer:'Esta respuesta requiere información de la unidad o una confirmación del vendedor. Podés consultarla en el chat de la publicación.'}</p>
    {onChoose && <button className="secondary" type="button" disabled={disabled} onClick={()=>onChoose(item.question)}>Usar esta pregunta</button>}
   </details>)}
  </div>
  {onChoose && <p>La pregunta se copia al mensaje para que la revises antes de enviarla.</p>}
 </section>;
}
