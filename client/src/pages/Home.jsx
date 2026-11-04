import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';

export default function Home() {
  const { settings } = useSettings();
  const [groups, setGroups] = useState(null);

  useEffect(() => { api('/groups').then(setGroups).catch(() => setGroups([])); }, []);

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">{settings?.name || ' '}</h1>
        <div className="hero-row">
          <p className="hero-tag">{settings?.tagline}</p>
          <Link to="/availability" className="btn btn-accent">Ver datas disponíveis →</Link>
        </div>
      </section>

      <section className="work" id="work">
        <div className="section-label"><span>01</span> Trabalhos</div>
        {groups === null && <p className="muted">Carregando…</p>}
        {groups?.length === 0 && <p className="muted">O portfólio está sendo preparado. Volte em breve.</p>}

        <div className="work-list">
          {groups?.map((g, i) => (
            <Link key={g.id} to={g.path} className={`work-item ${i % 2 ? 'flip' : ''}`}>
              <span className="work-side">{g.photoCount} fotos</span>
              <div className="work-cover">
                <img src={g.coverUrl} alt={g.name} loading={i < 2 ? 'eager' : 'lazy'} />
              </div>
              <div className="work-caption">
                <h2>{g.name}</h2>
                {g.description && <p>{g.description}</p>}
                <span className="work-open">{g.subgroupCount > 1 ? `${g.subgroupCount} coleções · ` : ''}{g.photoCount} fotos →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="about">
        <div className="section-label"><span>02</span> Sobre</div>
        <p className="about-text">{settings?.about}</p>
        <Link to="/availability" className="btn btn-dark">Ver disponibilidade →</Link>
      </section>
    </>
  );
}
