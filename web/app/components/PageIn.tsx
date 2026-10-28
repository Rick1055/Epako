import { Outlet, useLocation } from "react-router";

/** The page's content, rising into place on each page change (app.css .page-in; none under reduced motion). */
export function PageIn() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-in">
      <Outlet />
    </div>
  );
}
