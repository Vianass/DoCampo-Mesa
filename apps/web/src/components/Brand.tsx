import { Link } from 'react-router';
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      to="/"
      className={`brand ${light ? 'brand--light' : ''}`}
      aria-label="Do Campo à Mesa — página inicial"
    >
      <svg
        className="brand__mark"
        width="40"
        height="48"
        viewBox="0 0 40 48"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20 41V17M20 27C9 27 5 19 7 10c9 0 13 6 13 17Zm0-7C20 10 26 5 35 6c0 10-5 16-15 14Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 41h24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span>
        do campo
        <span>
          à mesa<span className="brand__period">.</span>
        </span>
      </span>
    </Link>
  );
}
