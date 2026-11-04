import { NavLink } from 'react-router-dom';

/** Abas internas da página Agenda: calendário de disponibilidade e categorias de agendamento. */
export default function AgendaTabs() {
  return (
    <nav className="sub-tabs">
      <NavLink to="/admin/calendar" end>Calendário</NavLink>
      <NavLink to="/admin/calendar/categories">Categorias</NavLink>
    </nav>
  );
}
