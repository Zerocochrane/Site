import { Link } from 'react-router-dom';
import usePageTitle from '../pageTitle.js';

/** Any address that doesn't exist (and unknown groups/collections): same friendly page, inside the site layout. */
export default function NotFound({ what = 'página' }) {
  usePageTitle('Página não encontrada');
  return (
    <section className="not-found">
      <div className="section-label">Erro 404</div>
      <h1 className="page-title">{what === 'trabalho' ? 'Este trabalho não foi encontrado.' : 'Página não encontrada.'}</h1>
      <p className="muted">O endereço pode ter mudado ou ter sido digitado errado.</p>
      <div className="not-found-actions">
        <Link to="/#work" className="btn btn-dark">Ver os trabalhos</Link>
        <Link to="/agendar" className="btn btn-line">Agendar uma data</Link>
      </div>
    </section>
  );
}
