import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, prettyDate } from '../api.js';
import Carousel from '../components/Carousel.jsx';
import Lightbox from '../components/Lightbox.jsx';
import Slideshow from '../components/Slideshow.jsx';
import useReveal from '../components/useReveal.js';

const longDate = (iso) => prettyDate(iso, { day: 'numeric', month: 'long', year: 'numeric' });
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2025-05-15' → '15 mai, 2025' */
const shortDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}, ${y}`; };

const pad = (n) => String(n).padStart(2, '0');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * /work/:slug           → the group: its subgroups as cards (or straight to the carousel if it has only one)
 * /work/:slug/:sub      → one subgroup's photos in a carousel
 */
export default function Group() {
  const { slug, sub } = useParams();
  const [group, setGroup] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [error, setError] = useState(false);
  const location = useLocation();
  useReveal([group]);

  useEffect(() => {
    setGroup(null); setError(false);
    api(`/groups/${slug}`).then(setGroup).catch(() => setError(true));
  }, [slug]);
  useEffect(() => { api('/groups').then(setAllGroups).catch(() => {}); }, []);
  // Go to the top on a new page, but not when switching subgroups with the chips
  useEffect(() => { if (!location.state?.keepScroll) window.scrollTo(0, 0); }, [slug, sub]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <NotFound />;
  if (!group) return <section className="group-page"><p className="muted">Carregando…</p></section>;

  const gi = allGroups.findIndex((g) => g.id === group.id);
  const nextGroup = allGroups.length > 1 && gi >= 0 ? allGroups[(gi + 1) % allGroups.length] : null;
  const single = group.subgroups.length === 1;

  if (sub || single) {
    return <SubgroupView subKey={sub || String(group.subgroups[0]?.id)} group={group} single={single} nextGroup={nextGroup} />;
  }

  return (
    <>
      <section className="group-page">
        <Link to="/#work" className="back-link">← Todos os trabalhos</Link>
        <div className="group-title-row">
          <h1 className="group-title">{group.name}</h1>
          <div className="group-meta">
            {gi >= 0 && <span>{pad(gi + 1)} / {pad(allGroups.length)}</span>}
            <span>{plural(group.subgroups.length, 'coleção', 'coleções')} · {plural(group.photoCount, 'foto', 'fotos')}</span>
          </div>
        </div>
        {group.description && <p className="group-desc">{group.description}</p>}

        <Slideshow slides={group.subgroups.filter((x) => x.coverUrl)} />

        <div className="section-label sub-index-label"><span>{pad(group.subgroups.length)}</span> Todas as coleções</div>
        <div className="sub-grid">
          {group.subgroups.map((s, i) => (
            <Link key={s.id} to={s.path} className="sub-card reveal" style={{ '--d': `${(i % 3) * 110}ms` }}>
              {s.date && <time className="sub-date-side" dateTime={s.date} title={longDate(s.date)}>{shortDate(s.date)}</time>}
              <div className="sub-cover">{s.coverUrl && <img src={s.coverUrl} alt={s.name} loading={i < 4 ? 'eager' : 'lazy'} />}</div>
              <div className="sub-caption">
                <span className="work-num">{pad(i + 1)}</span>
                <h2>{s.name}</h2>
                {s.description && <p>{s.description}</p>}
                <span className="work-open">Ver {plural(s.photoCount, 'foto', 'fotos')} →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <Footer next={nextGroup && nextGroup.id !== group.id ? { label: 'Próximo trabalho →', name: nextGroup.name, path: nextGroup.path, cover: nextGroup.coverUrl } : null} />
    </>
  );
}

function SubgroupView({ subKey, group, single, nextGroup }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(-1);

  // Keep showing the current subgroup until the next one has loaded (no page jump)
  useEffect(() => {
    setError(false); setOpen(-1);
    api(`/subgroups/${subKey}`).then(setData).catch(() => setError(true));
  }, [subKey]);
  useEffect(() => {
    if (data) document.title = `${single ? group.name : `${data.name} — ${group.name}`} — ${document.title.split(' — ').pop()}`;
  }, [data, group.name, single]);

  if (error || (data && data.groupId !== group.id)) return <NotFound />;
  if (!data) return <section className="group-page"><p className="muted">Carregando…</p></section>;

  const si = data.siblings.findIndex((s) => s.id === data.id);
  const nextSub = si >= 0 && si < data.siblings.length - 1 ? data.siblings[si + 1] : null;
  const next = nextSub
    ? { label: `Próxima em ${group.name} →`, name: nextSub.name, path: nextSub.path, cover: nextSub.coverUrl }
    : nextGroup && nextGroup.id !== group.id
      ? { label: 'Próximo trabalho →', name: nextGroup.name, path: nextGroup.path, cover: nextGroup.coverUrl }
      : null;

  return (
    <>
      <section className="group-page">
        <nav className="crumbs public">
          <Link to="/#work">Todos os trabalhos</Link>
          {!single && <><span>/</span><Link to={group.path}>{group.name}</Link></>}
        </nav>
        <div className="group-title-row">
          <h1 className="group-title">{single ? group.name : data.name}</h1>
          <div className="group-meta">
            {data.date && <time dateTime={data.date}>{longDate(data.date)}</time>}
            {!single && <span>{pad(si + 1)} / {pad(data.siblings.length)}</span>}
            <span>{plural(data.photos.length, 'foto', 'fotos')}</span>
          </div>
        </div>
        {(single ? group.description || data.description : data.description) && (
          <p className="group-desc">{single ? group.description || data.description : data.description}</p>
        )}

        {data.siblings.length > 1 && (
          <div className="sub-chips" role="tablist">
            {data.siblings.map((s) => (
              <Link key={s.id} to={s.path} state={{ keepScroll: true }} replace className={`chip ${s.id === data.id ? 'on' : ''}`} role="tab" aria-selected={s.id === data.id}>
                {s.name} <span className="chip-n">{s.photoCount}</span>
              </Link>
            ))}
          </div>
        )}

        <Carousel key={data.id} photos={data.photos} onOpen={setOpen} />
      </section>

      <Footer next={next} />
      {open >= 0 && <Lightbox photos={data.photos} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />}
    </>
  );
}

function Footer({ next }) {
  return (
    <section className="group-foot">
      {next ? (
        <Link to={next.path} className="next-work">
          <span className="next-label">{next.label}</span>
          <span className="next-name">{next.name}</span>
          {next.cover && <img src={next.cover} alt="" loading="lazy" />}
        </Link>
      ) : (
        <Link to="/#work" className="next-work"><span className="next-label">Voltar →</span><span className="next-name">Todos os trabalhos</span></Link>
      )}
      <div className="group-cta">
        <p>Gostou do que viu?</p>
        <Link to="/availability" className="btn btn-dark">Agendar uma data →</Link>
      </div>
    </section>
  );
}

function NotFound() {
  return <section className="group-page"><p>Este trabalho não foi encontrado. <Link to="/">Ver todos os trabalhos</Link></p></section>;
}
