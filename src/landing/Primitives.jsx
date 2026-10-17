export function Arrow() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

export function Icon({ name = 'search' }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M8 10.5h5M10.5 8v5" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3ZM9 3v15M15 6v15" /></>,
    shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
    network: <><rect x="8" y="2" width="8" height="6" rx="2" /><rect x="2" y="16" width="7" height="6" rx="2" /><rect x="15" y="16" width="7" height="6" rx="2" /><path d="M12 8v4H5.5v4M12 12h6.5v4" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m3 6 9 7 9-7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg className="ex-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name] || paths.search}</svg>;
}

export function CTA({ children, href = '#contact', quiet = false, small = false }) {
  return (
    <a className={`ex-button${quiet ? ' ex-button-quiet' : ''}${small ? ' ex-button-small' : ''}`} href={href}>
      <span>{children}</span><Arrow />
    </a>
  );
}
