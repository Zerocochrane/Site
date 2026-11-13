import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../settings.jsx';
import { initials } from '../initials.js';
import useReveal from '../components/useReveal.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export default function Home() {
  const { settings } = useSettings();
  const [groups, setGroups] = useState(null);

  useEffect(() => { api('/groups').then(setGroups).catch(() => setGroups([])); }, []);
  useReveal([groups]);

  return (
    <>
      <section className="hero">
        <h1 className="hero-mark" aria-label={settings?.name || ''}>{initials(settings?.name) || ' '}</h1>
        <hr className="hero-rule" />
        {settings?.tagline && <p className="hero-tag">{settings.tagline}</p>}
        <Link to="/agendar" className="btn btn-line small">Ver datas disponíveis</Link>
      </section>

      <section className="work" id="work">
        <div className="section-head">
          <h2>Trabalhos</h2>
          {groups?.length > 0 && <p>{plural(groups.length, 'trabalho', 'trabalhos')}</p>}
        </div>
        {groups === null && <p className="muted" style={{ textAlign: 'center' }}>Carregando…</p>}
        {groups?.length === 0 && <p className="muted" style={{ textAlign: 'center' }}>O portfólio está sendo preparado. Volte em breve.</p>}

        <div className="work-rows">
          {groups?.map((g, i) => (
            <Link key={g.id} to={g.path} className={`work-row reveal ${i % 2 ? 'flip' : ''}`}>
              <div className="work-cover">
                <img src={g.coverUrl} alt={g.name} loading={i < 2 ? 'eager' : 'lazy'} />
              </div>
              <div className="work-info">
                <h2>{g.name}</h2>
                {g.description && <p>{g.description}</p>}
                <span className="work-meta">
                  {g.subgroupCount > 1 ? `${plural(g.subgroupCount, 'coleção', 'coleções')} · ` : ''}{plural(g.photoCount, 'foto', 'fotos')}
                </span>
                <span className="work-go">Ver trabalho <i aria-hidden="true">→</i></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {settings?.about && (
        <section className="about">
          <p className="about-text reveal">{settings.about}</p>
          <Link to="/agendar" className="btn btn-dark small">Ver disponibilidade</Link>
        </section>
      )}
    </>
  );
}
