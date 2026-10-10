import Link from 'next/link';
import FaqBrowser from '../../features/faq/FaqBrowser';
export const metadata={title:'Preguntas frecuentes | Velox',description:'Consultas sobre autos, estado declarado, visitas y la promoción de Velox.'};
export default function QuestionsPage(){return <main className="section faqPage"><Link href="/">← Volver a Velox</Link><p className="eyebrow">Ayuda para comprar y vender</p><h1>Preguntá antes de decidir</h1><p>Las condiciones cambian entre vendedores y vehículos. El auto check es una declaración; una propuesta de visita requiere el acuerdo de ambas partes.</p><FaqBrowser /></main>;}
